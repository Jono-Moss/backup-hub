import crypto from "crypto";
import { pipeline } from "stream/promises";
import fs from "fs";

// All secrets-at-rest (DB credentials, backup passwords) are wrapped with
// this server-only key, derived from BACKUP_MASTER_KEY. It never touches
// the client and is never logged. Rotate BACKUP_MASTER_KEY by decrypting
// everything with the old key and re-encrypting with the new one — there's
// no built-in key versioning yet, see README for a rotation script stub.
function getMasterKey(): Buffer {
  const secret = process.env.BACKUP_MASTER_KEY;
  if (!secret) {
    throw new Error("BACKUP_MASTER_KEY env var is required");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

// --- Wrap/unwrap small secrets (DB creds JSON, backup passwords) for DB storage ---

export function wrapSecret(plaintext: string): string {
  const key = getMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function unwrapSecret(wrapped: string): string {
  const key = getMasterKey();
  const buf = Buffer.from(wrapped, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

export interface ConnectionConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl?: boolean;
}

export function wrapConnection(conn: ConnectionConfig): string {
  return wrapSecret(JSON.stringify(conn));
}

export function unwrapConnection(wrapped: string): ConnectionConfig {
  return JSON.parse(unwrapSecret(wrapped));
}

// --- Stream-encrypt / decrypt backup files with the *user-chosen* backup password ---
// (Separate from BACKUP_MASTER_KEY — this is the password the user set in the task
// so they can decrypt the file themselves without needing server access.)

function deriveFileKey(password: string, salt: Buffer): Buffer {
  return crypto.scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 });
}

// File layout: [salt(16)][iv(12)][ciphertext...][authTag(16)]
export async function encryptFile(srcPath: string, destPath: string, password: string): Promise<void> {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = deriveFileKey(password, salt);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const out = fs.createWriteStream(destPath);
  await new Promise<void>((resolve, reject) => {
    out.write(Buffer.concat([salt, iv]), (err) => (err ? reject(err) : resolve()));
  });

  const input = fs.createReadStream(srcPath);
  await pipeline(input, cipher, out, { end: false });

  await new Promise<void>((resolve) => {
    out.end(cipher.getAuthTag(), () => resolve());
  });
}

// Note: reads the full ciphertext into memory to verify the auth tag before
// writing plaintext out. Fine for typical dump sizes; for very large (multi-GB)
// encrypted dumps, swap for a chunked authenticated-decrypt implementation.
export async function decryptFile(srcPath: string, destPath: string, password: string): Promise<void> {
  const full = await fs.promises.readFile(srcPath);
  const salt = full.subarray(0, 16);
  const iv = full.subarray(16, 28);
  const tag = full.subarray(full.length - 16);
  const ciphertext = full.subarray(28, full.length - 16);

  const key = deriveFileKey(password, salt);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  await fs.promises.writeFile(destPath, plaintext);
}

// --- API keys ---

export function generateApiKey(): { raw: string; hashed: string; prefix: string } {
  const raw = "bkp_" + crypto.randomBytes(24).toString("hex");
  const hashed = crypto.createHash("sha256").update(raw).digest("hex");
  const prefix = raw.slice(0, 12);
  return { raw, hashed, prefix };
}

export function hashApiKey(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}
