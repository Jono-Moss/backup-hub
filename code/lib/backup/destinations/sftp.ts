import crypto from "crypto";
import fs from "fs";
import SftpClient from "ssh2-sftp-client";
import type { BackupDestination, DestinationConfig } from "./types";
import { remoteDir } from "./ftp";

// SFTP = file transfer over SSH. Authenticates with a password, a private
// key (optionally passphrase-protected), or both.
//
// Host key checking: if a fingerprint is saved, the server must present
// exactly that key or we refuse to connect (protects against someone
// impersonating the server). If it's left blank any key is accepted, and
// "test connection" reports the server's fingerprint so it can be pinned.

const TIMEOUT_MS = 30_000;

function fingerprint(key: Buffer): string {
  return `SHA256:${crypto.createHash("sha256").update(key).digest("base64").replace(/=+$/, "")}`;
}

function normalizeFingerprint(value: string): string {
  const trimmed = value.trim().replace(/=+$/, "");
  return trimmed.toUpperCase().startsWith("SHA256:") ? `SHA256:${trimmed.slice(7)}` : `SHA256:${trimmed}`;
}

async function connect(config: DestinationConfig): Promise<{ client: SftpClient; serverFingerprint: string }> {
  if (!config.host?.trim()) throw new Error("Host is required.");
  if (!config.password && !config.privateKey?.trim()) throw new Error("Enter a password or a private key.");

  const port = Number(config.port || 22);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error("Port must be a number between 1 and 65535.");

  const expected = config.hostFingerprint?.trim() ? normalizeFingerprint(config.hostFingerprint) : undefined;
  let serverFingerprint = "";

  const client = new SftpClient();
  try {
    await client.connect({
      host: config.host.trim(),
      port,
      username: config.username,
      password: config.password || undefined,
      privateKey: config.privateKey?.trim() ? config.privateKey.trim() + "\n" : undefined,
      passphrase: config.passphrase || undefined,
      readyTimeout: TIMEOUT_MS,
      hostVerifier: (key: Buffer) => {
        serverFingerprint = fingerprint(key);
        return !expected || serverFingerprint === expected;
      },
    });
  } catch (err: any) {
    if (expected && serverFingerprint && serverFingerprint !== expected) {
      throw new Error(`Host key mismatch: the server presented ${serverFingerprint}, but ${expected} was expected. If the server's key legitimately changed, update the fingerprint.`);
    }
    throw err;
  }
  return { client, serverFingerprint };
}

function remoteFilePath(dir: string, remoteFileName: string): string {
  return dir ? `${dir}/${remoteFileName}` : remoteFileName;
}

export const sftpDestination: BackupDestination = {
  type: "sftp",
  label: "SFTP (SSH file transfer)",
  subfolderField: "pathPrefix",
  configFields: [
    { name: "host", label: "Host", type: "text", required: true, placeholder: "sftp.example.com" },
    { name: "port", label: "Port", type: "number", placeholder: "22", helpText: "Leave blank for the default." },
    { name: "username", label: "Username", type: "text", required: true },
    { name: "password", label: "Password", type: "password", helpText: "Leave blank if you're using a private key." },
    {
      name: "privateKey",
      label: "Private key (optional)",
      type: "textarea",
      secret: true,
      placeholder: "-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----",
      helpText: "Paste the full key in OpenSSH or PEM format. Stored encrypted.",
    },
    { name: "passphrase", label: "Key passphrase (optional)", type: "password" },
    {
      name: "hostFingerprint",
      label: "Server host key fingerprint (recommended)",
      type: "text",
      placeholder: "SHA256:AbCdEf...",
      helpText: "Click \"Test connection\" to see the server's fingerprint. Once set, connections to a server with a different key are refused.",
    },
    {
      name: "pathPrefix",
      label: "Remote folder (optional)",
      type: "text",
      placeholder: "backups/",
      helpText: "Created if it doesn't exist. Start with \"/\" for an absolute path, otherwise it's relative to the user's home folder.",
    },
  ],

  async upload(config, localFilePath, remoteFileName) {
    const { client } = await connect(config);
    try {
      const dir = remoteDir(config);
      if (dir && !(await client.exists(dir))) await client.mkdir(dir, true);
      const target = remoteFilePath(dir, remoteFileName);
      // Streamed, not buffered — backup files can be large.
      await client.put(fs.createReadStream(localFilePath), target);
      return { remotePath: `sftp://${config.host.trim()}${target.startsWith("/") ? "" : "/~/"}${target}` };
    } finally {
      await client.end().catch(() => {});
    }
  },

  async testConnection(config) {
    let client: SftpClient | undefined;
    try {
      const connected = await connect(config);
      client = connected.client;
      const pinned = config.hostFingerprint?.trim();
      const notes: string[] = [];
      if (!pinned) notes.push(`Server fingerprint: ${connected.serverFingerprint} — paste it into the fingerprint field to pin it.`);

      const dir = remoteDir(config);
      if (dir && !(await client.exists(dir))) notes.push(`The folder "${dir}" doesn't exist yet — it will be created on the first upload.`);

      return { ok: true, message: notes.length ? `Connected. ${notes.join(" ")}` : undefined };
    } catch (err: any) {
      return { ok: false, message: String(err?.message ?? err).slice(0, 500) };
    } finally {
      await client?.end().catch(() => {});
    }
  },
};
