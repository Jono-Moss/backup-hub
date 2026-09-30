import fs from "fs";
import type { BackupDestination, DestinationConfig, DestinationConnector, DestinationRuntime } from "./types";
import { postForm, idTokenClaims } from "./oauth";

// Talks to Microsoft Graph directly over fetch rather than pulling in the
// Graph SDK — the surface area needed here (device flow, token refresh, one
// upload endpoint) is small enough that the extra dependency isn't worth it.
//
// Two ways to authenticate, both ending in a refresh token stored in the
// destination's config:
//
//  1. "Connect" (normal path): the server admin registers ONE Microsoft app
//     (multi-tenant + personal accounts, "Allow public client flows" on) and
//     sets MICROSOFT_CLIENT_ID. It's a *public* client, so there's no secret
//     at all. Each user just clicks Connect and signs in via the device flow.
//  2. Advanced: the user supplies their own app's client ID (+ secret if it's
//     a confidential client) and a refresh token.

const GRAPH = "https://graph.microsoft.com/v1.0";
const SCOPES = "openid email offline_access Files.ReadWrite";
const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";
// 320 KiB, the unit Graph's chunked upload requires chunk sizes to be a
// multiple of. 10 MiB keeps request counts reasonable for large dumps
// without holding much in memory at once.
const UPLOAD_CHUNK_SIZE = 320 * 1024 * 32;

function sharedClientId() {
  return process.env.MICROSOFT_CLIENT_ID || null;
}

function tokenEndpoint(tenant: string) {
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
}

async function getAccessToken(config: DestinationConfig, runtime?: DestinationRuntime): Promise<string> {
  const clientId = config.clientId || sharedClientId();
  if (!clientId) {
    throw new Error("This destination was connected through the server's shared Microsoft app, but MICROSOFT_CLIENT_ID is no longer set.");
  }

  const params: Record<string, string> = {
    client_id: clientId,
    refresh_token: config.refreshToken,
    grant_type: "refresh_token",
    scope: SCOPES,
  };
  // Public clients (the shared app) must NOT send a secret.
  if (config.clientSecret) params.client_secret = config.clientSecret;

  const { ok, data } = await postForm(tokenEndpoint(config.tenantId || "common"), params);
  if (!ok) {
    throw new Error(data.error_description || data.error || "Token refresh failed");
  }

  // Microsoft issues a NEW refresh token on every refresh, and each one is
  // only good for 90 days from when it was issued. Save the new one, or
  // backups would silently start failing ~3 months after connecting.
  // Failing to save must not fail the backup itself — the old token is
  // still valid until its own expiry.
  if (data.refresh_token && data.refresh_token !== config.refreshToken) {
    try {
      await runtime?.updateConfig({ refreshToken: data.refresh_token });
      config.refreshToken = data.refresh_token;
    } catch (err) {
      console.error("[onedrive] could not save rotated refresh token:", err);
    }
  }
  return data.access_token;
}

const connect: DestinationConnector = {
  isAvailable: () => sharedClientId() !== null,

  async start() {
    const clientId = sharedClientId();
    if (!clientId) throw new Error("Microsoft sign-in isn't set up on this server (MICROSOFT_CLIENT_ID).");

    // "common" = personal Microsoft accounts and work/school accounts alike.
    const { ok, data } = await postForm("https://login.microsoftonline.com/common/oauth2/v2.0/devicecode", {
      client_id: clientId,
      scope: SCOPES,
    });
    if (!ok) throw new Error(data.error_description || data.error || "Could not start Microsoft sign-in.");

    return {
      userCode: data.user_code,
      verificationUrl: data.verification_uri,
      expiresInSeconds: data.expires_in,
      intervalSeconds: data.interval ?? 5,
      state: { deviceCode: data.device_code },
    };
  },

  async poll(state) {
    const clientId = sharedClientId();
    if (!clientId) return { status: "error", message: "Microsoft sign-in isn't set up on this server." };

    const { ok, status, data } = await postForm(tokenEndpoint("common"), {
      client_id: clientId,
      device_code: state.deviceCode,
      grant_type: DEVICE_GRANT,
    });

    if (ok) {
      if (!data.refresh_token) {
        return { status: "error", message: "Microsoft didn't return a refresh token." };
      }
      const claims = idTokenClaims(data.id_token);
      return {
        status: "complete",
        config: { refreshToken: data.refresh_token },
        account: claims.preferred_username || claims.email,
      };
    }

    switch (data.error) {
      case "authorization_pending":
        return { status: "pending" };
      case "slow_down":
        return { status: "pending", slowDown: true };
      case "authorization_declined":
        return { status: "error", message: "Access was declined." };
      case "expired_token":
      case "bad_verification_code":
        return { status: "error", message: "The code expired before it was approved. Try again." };
      default:
        return { status: "error", message: data.error_description || data.error || `Microsoft sign-in failed (HTTP ${status}).` };
    }
  },
};

function remotePath(config: DestinationConfig, remoteFileName: string): string {
  const folder = (config.folderPath || "").replace(/^\/+|\/+$/g, "");
  return folder ? `${folder}/${remoteFileName}` : remoteFileName;
}

// Graph item paths address folders/files with colons around the path
// segment: /me/drive/root:/Backups/file.sql.gz:/content
function itemUrl(path: string, suffix: string): string {
  return `${GRAPH}/me/drive/root:/${path.split("/").map(encodeURIComponent).join("/")}:${suffix}`;
}

export const oneDriveDestination: BackupDestination = {
  type: "onedrive",
  label: "OneDrive",
  connect,
  configFields: [
    { name: "folderPath", label: "Folder path (optional)", type: "text", placeholder: "Backups", helpText: "Created if it doesn't exist. Leave blank to upload to the OneDrive root." },
    { name: "clientId", label: "Application (client) ID", type: "text", required: true, credential: true },
    {
      name: "clientSecret",
      label: "Client secret (optional)",
      type: "password",
      credential: true,
      helpText: "Only for a confidential-client app registration. Leave blank for a public client.",
    },
    {
      name: "refreshToken",
      label: "OAuth refresh token",
      type: "password",
      required: true,
      credential: true,
      helpText: "Obtained via Microsoft's OAuth consent flow with the Files.ReadWrite and offline_access scopes — see README.",
    },
    {
      name: "tenantId",
      label: "Tenant ID",
      type: "text",
      placeholder: "common",
      credential: true,
      helpText: "\"common\" for personal Microsoft accounts, or your Azure AD tenant ID for work/school accounts.",
    },
  ],

  async upload(config, localFilePath, remoteFileName, context) {
    const token = await getAccessToken(config, context);
    const path = remotePath(config, remoteFileName);
    const stat = await fs.promises.stat(localFilePath);
    const headers = { Authorization: `Bearer ${token}` };

    if (stat.size <= 4 * 1024 * 1024) {
      // Simple upload — Graph only allows this path under 4 MiB.
      const res = await fetch(itemUrl(path, "/content"), {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/octet-stream" },
        body: await fs.promises.readFile(localFilePath),
        // @ts-expect-error - Node's fetch requires duplex for a body on some versions; harmless when body is a Buffer.
        duplex: "half",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || `OneDrive upload failed (${res.status})`);
      return { remotePath: data.webUrl || path };
    }

    // Resumable chunked upload for anything bigger.
    const sessionRes = await fetch(itemUrl(path, "/createUploadSession"), {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "replace" } }),
    });
    const session = await sessionRes.json();
    if (!sessionRes.ok) throw new Error(session.error?.message || `Could not start OneDrive upload session (${sessionRes.status})`);

    const uploadUrl = session.uploadUrl as string;
    const fh = await fs.promises.open(localFilePath, "r");
    let finalData: any;
    try {
      let offset = 0;
      while (offset < stat.size) {
        const chunkSize = Math.min(UPLOAD_CHUNK_SIZE, stat.size - offset);
        const buffer = Buffer.alloc(chunkSize);
        await fh.read(buffer, 0, chunkSize, offset);

        const chunkRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Length": String(chunkSize),
            "Content-Range": `bytes ${offset}-${offset + chunkSize - 1}/${stat.size}`,
          },
          body: buffer,
          // @ts-expect-error - see note above.
          duplex: "half",
        });
        if (!chunkRes.ok && chunkRes.status !== 202) {
          const err = await chunkRes.json().catch(() => ({}));
          throw new Error(err.error?.message || `OneDrive chunk upload failed (${chunkRes.status}) at byte ${offset}`);
        }
        // The final chunk's response (200/201) carries the finished item;
        // intermediate chunks (202) just acknowledge receipt.
        if (chunkRes.status !== 202) finalData = await chunkRes.json();

        offset += chunkSize;
      }
    } finally {
      await fh.close();
    }

    return { remotePath: finalData?.webUrl || path };
  },

  async testConnection(config, runtime) {
    try {
      const token = await getAccessToken(config, runtime);
      const res = await fetch(`${GRAPH}/me/drive`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { ok: false, message: data.error?.message || `Graph responded ${res.status}` };
      }
      return { ok: true };
    } catch (err: any) {
      return { ok: false, message: String(err.message ?? err).slice(0, 500) };
    }
  },
};
