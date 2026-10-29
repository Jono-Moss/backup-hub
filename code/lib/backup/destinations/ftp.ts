import fs from "fs";
import { Client } from "basic-ftp";
import type { BackupDestination, DestinationConfig } from "./types";

// Plain FTP and FTPS (FTP over TLS) share one implementation — the only
// difference is whether the control/data connections are wrapped in TLS.
// FTPS supports both the common "explicit" mode (AUTH TLS on port 21) and
// the older "implicit" mode (TLS from the first byte, usually port 990).
//
// SFTP is a completely different protocol (it runs over SSH), see sftp.ts.

const TIMEOUT_MS = 30_000;

// A leading "/" is kept on purpose: on FTP servers "/backups" (absolute)
// and "backups" (relative to the login directory) are different places.
export function remoteDir(config: DestinationConfig): string {
  return (config.pathPrefix || "").trim().replace(/\/+$/g, "");
}

function port(config: DestinationConfig, fallback: number): number {
  const value = Number(config.port || fallback);
  if (!Number.isInteger(value) || value <= 0 || value > 65535) throw new Error("Port must be a number between 1 and 65535.");
  return value;
}

async function connect(config: DestinationConfig, secure: boolean): Promise<Client> {
  if (!config.host?.trim()) throw new Error("Host is required.");

  const implicit = secure && config.implicitTls === "true";
  const client = new Client(TIMEOUT_MS);
  try {
    await client.access({
      host: config.host.trim(),
      port: port(config, implicit ? 990 : 21),
      user: config.username || "anonymous",
      password: config.password || "",
      secure: secure ? (implicit ? "implicit" : true) : false,
      secureOptions: secure ? { rejectUnauthorized: config.allowSelfSigned !== "true" } : undefined,
    });
    return client;
  } catch (err) {
    client.close();
    throw err;
  }
}

function makeFtpDestination(secure: boolean): BackupDestination {
  const name = secure ? "FTPS" : "FTP";

  return {
    type: secure ? "ftps" : "ftp",
    label: secure ? "FTPS (FTP over TLS)" : "FTP (unencrypted)",
    subfolderField: "pathPrefix",
    configFields: [
      { name: "host", label: "Host", type: "text", required: true, placeholder: "ftp.example.com" },
      {
        name: "port",
        label: "Port",
        type: "number",
        placeholder: secure ? "21 (990 for implicit TLS)" : "21",
        helpText: "Leave blank for the default.",
      },
      { name: "username", label: "Username", type: "text", required: true },
      { name: "password", label: "Password", type: "password", required: true },
      ...(secure
        ? ([
            {
              name: "implicitTls",
              label: "Use implicit TLS",
              type: "checkbox",
              helpText: "Only for older servers that expect TLS from the start (usually port 990). Most servers use explicit TLS — leave unchecked.",
            },
            {
              name: "allowSelfSigned",
              label: "Allow self-signed / untrusted certificates",
              type: "checkbox",
              helpText: "The connection is still encrypted, but the server's identity isn't verified.",
            },
          ] as const)
        : []),
      {
        name: "pathPrefix",
        label: "Remote folder (optional)",
        type: "text",
        placeholder: "backups/",
        helpText: "Created if it doesn't exist. Start with \"/\" for an absolute path, otherwise it's relative to the login folder.",
      },
    ],

    async upload(config, localFilePath, remoteFileName) {
      const client = await connect(config, secure);
      try {
        const dir = remoteDir(config);
        // ensureDir() also changes into the folder, so the upload below
        // can use just the file name.
        if (dir) await client.ensureDir(dir);
        const cwd = await client.pwd();
        await client.uploadFrom(fs.createReadStream(localFilePath), remoteFileName);
        const remotePath = `${cwd.replace(/\/+$/, "")}/${remoteFileName}`;
        return { remotePath: `${name.toLowerCase()}://${config.host.trim()}${remotePath.startsWith("/") ? "" : "/"}${remotePath}` };
      } finally {
        client.close();
      }
    },

    async testConnection(config) {
      let client: Client | undefined;
      try {
        client = await connect(config, secure);
        const dir = remoteDir(config);
        // Only check that the folder exists here — testing shouldn't create
        // anything. A missing folder is fine, upload() will create it.
        if (dir) {
          try {
            await client.cd(dir);
          } catch {
            return { ok: true, message: `Connected. The folder "${dir}" doesn't exist yet — it will be created on the first upload.` };
          }
        }
        return { ok: true };
      } catch (err: any) {
        return { ok: false, message: String(err?.message ?? err).slice(0, 500) };
      } finally {
        client?.close();
      }
    },
  };
}

export const ftpDestination = makeFtpDestination(false);
export const ftpsDestination = makeFtpDestination(true);
