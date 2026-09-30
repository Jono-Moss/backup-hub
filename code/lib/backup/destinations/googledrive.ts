import fs from "fs";
import { google } from "googleapis";
import type { BackupDestination, DestinationConfig, DestinationConnector } from "./types";
import { postForm, idTokenClaims } from "./oauth";

// Two ways to authenticate, both ending in a refresh token stored in the
// destination's config:
//
//  1. "Connect" (normal path): the server admin registers ONE Google OAuth
//     client (type "TVs and Limited Input devices") and sets GOOGLE_CLIENT_ID
//     / GOOGLE_CLIENT_SECRET. Each user then just clicks Connect and signs
//     in with their own Google account via the device flow. Nobody but the
//     admin ever touches Google Cloud.
//  2. Advanced: the user pastes their own client ID/secret/refresh token
//     (config.clientId etc.), for people who don't want to depend on the
//     server's shared client.
//
// Only the narrow `drive.file` scope is requested: access to files this app
// creates itself, never the rest of the user's Drive.

const SCOPES = "openid email https://www.googleapis.com/auth/drive.file";
const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

function sharedCredentials() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  return id && secret ? { id, secret } : null;
}

// A destination with its own clientId uses its own pair; otherwise it's a
// "Connect" destination and uses the server's shared client.
function credentialsFor(config: DestinationConfig) {
  if (config.clientId) return { id: config.clientId, secret: config.clientSecret };
  const shared = sharedCredentials();
  if (!shared) {
    throw new Error("This destination was connected through the server's shared Google client, but GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are no longer set.");
  }
  return shared;
}

function client(config: DestinationConfig) {
  const { id, secret } = credentialsFor(config);
  const auth = new google.auth.OAuth2(id, secret);
  auth.setCredentials({ refresh_token: config.refreshToken });
  return google.drive({ version: "v3", auth });
}

const connect: DestinationConnector = {
  isAvailable: () => sharedCredentials() !== null,

  async start() {
    const creds = sharedCredentials();
    if (!creds) throw new Error("Google sign-in isn't set up on this server (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).");

    const { ok, data } = await postForm("https://oauth2.googleapis.com/device/code", {
      client_id: creds.id,
      scope: SCOPES,
    });
    if (!ok) throw new Error(data.error_description || data.error || "Could not start Google sign-in.");

    return {
      userCode: data.user_code,
      verificationUrl: data.verification_url,
      expiresInSeconds: data.expires_in,
      intervalSeconds: data.interval ?? 5,
      state: { deviceCode: data.device_code },
    };
  },

  async poll(state) {
    const creds = sharedCredentials();
    if (!creds) return { status: "error", message: "Google sign-in isn't set up on this server." };

    const { ok, status, data } = await postForm("https://oauth2.googleapis.com/token", {
      client_id: creds.id,
      client_secret: creds.secret,
      device_code: state.deviceCode,
      grant_type: DEVICE_GRANT,
    });

    if (ok) {
      if (!data.refresh_token) {
        return { status: "error", message: "Google didn't return a refresh token. Remove this app from your Google account's connected apps and try again." };
      }
      return {
        status: "complete",
        config: { refreshToken: data.refresh_token },
        account: idTokenClaims(data.id_token).email,
      };
    }

    switch (data.error) {
      case "authorization_pending":
        return { status: "pending" };
      case "slow_down":
        return { status: "pending", slowDown: true };
      case "access_denied":
        return { status: "error", message: "Access was denied." };
      case "expired_token":
      case "code_expired":
        return { status: "error", message: "The code expired before it was approved. Try again." };
      default:
        return { status: "error", message: data.error_description || data.error || `Google sign-in failed (HTTP ${status}).` };
    }
  },
};

export const googleDriveDestination: BackupDestination = {
  type: "google_drive",
  label: "Google Drive",
  connect,
  configFields: [
    { name: "folderId", label: "Folder ID (optional)", type: "text", helpText: "The long ID at the end of a Drive folder's URL. Leave blank to upload to the Drive root." },
    { name: "clientId", label: "OAuth client ID", type: "text", required: true, credential: true },
    { name: "clientSecret", label: "OAuth client secret", type: "password", required: true, credential: true },
    {
      name: "refreshToken",
      label: "OAuth refresh token",
      type: "password",
      required: true,
      credential: true,
      helpText: "Obtained via Google's OAuth consent flow with the drive.file scope — see README.",
    },
  ],

  async upload(config, localFilePath, remoteFileName) {
    const drive = client(config);
    const stat = await fs.promises.stat(localFilePath);

    const res = await drive.files.create({
      requestBody: {
        name: remoteFileName,
        parents: config.folderId ? [config.folderId] : undefined,
      },
      media: {
        mimeType: "application/octet-stream",
        body: fs.createReadStream(localFilePath),
      },
      fields: "id, webViewLink",
      // Large-file resumable upload rather than a single multipart
      // request — safer for multi-GB dumps over a flaky connection.
      uploadType: stat.size > 5 * 1024 * 1024 ? "resumable" : undefined,
    });

    return { remotePath: res.data.webViewLink || `drive file id: ${res.data.id}` };
  },

  async testConnection(config) {
    try {
      await client(config).about.get({ fields: "user" });
      return { ok: true };
    } catch (err: any) {
      return { ok: false, message: String(err.response?.data?.error_description ?? err.message ?? err).slice(0, 500) };
    }
  },
};
