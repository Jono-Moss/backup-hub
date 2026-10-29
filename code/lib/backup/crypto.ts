import crypto from "crypto";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
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
const SALT_LEN = 16;
const HEADER_LEN = 28;
const TAG_LEN = 16;

// A short value derived from the file key, stored next to the run (never sent
// to clients). On a failed decrypt it tells "the password is different from
// the one this file was made with" apart from "the file is damaged" — AES-GCM
// on its own reports both the same way.
function keyCheckFromKey(key: Buffer): string {
  return crypto.createHmac("sha256", key).update("backup-hub:key-check").digest("hex").slice(0, 16);
}

/** Encrypts srcPath into destPath and returns the file's key check value. */
export async function encryptFile(srcPath: string, destPath: string, password: string): Promise<{ keyCheck: string }> {
  const salt = crypto.randomBytes(SALT_LEN);
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
  return { keyCheck: keyCheckFromKey(key) };
}

async function readEnvelope(srcPath: string) {
  const fh = await fs.promises.open(srcPath, "r");
  try {
    const { size } = await fh.stat();
    if (size < HEADER_LEN + TAG_LEN) throw new Error("The file is too short to be an encrypted backup.");
    const header = Buffer.alloc(HEADER_LEN);
    const tag = Buffer.alloc(TAG_LEN);
    await fh.read(header, 0, HEADER_LEN, 0);
    await fh.read(tag, 0, TAG_LEN, size - TAG_LEN);
    return { salt: header.subarray(0, SALT_LEN), iv: header.subarray(SALT_LEN, HEADER_LEN), tag, size };
  } finally {
    await fh.close();
  }
}

/** The key check value for an existing encrypted file and a candidate password. */
export async function keyCheckForFile(srcPath: string, password: string): Promise<string> {
  const { salt } = await readEnvelope(srcPath);
  return keyCheckFromKey(deriveFileKey(password, salt));
}

/**
 * Streams that turn an encrypted backup back into its .sql.gz bytes — spread
 * them into a pipeline(). Reads in chunks rather than loading the whole file.
 * The auth tag is checked when the stream ends: a wrong password or a single
 * damaged byte anywhere makes the pipeline fail, so callers must not treat
 * output as trustworthy until the pipeline has resolved.
 */
export async function decryptStreams(srcPath: string, password: string): Promise<[NodeJS.ReadableStream, crypto.DecipherGCM]> {
  const { salt, iv, tag, size } = await readEnvelope(srcPath);
  const decipher = crypto.createDecipheriv("aes-256-gcm", deriveFileKey(password, salt), iv);
  decipher.setAuthTag(tag);
  const body =
    size === HEADER_LEN + TAG_LEN
      ? Readable.from([])
      : fs.createReadStream(srcPath, { start: HEADER_LEN, end: size - TAG_LEN - 1 });
  return [body, decipher];
}

export async function decryptFile(srcPath: string, destPath: string, password: string): Promise<void> {
  await pipeline(...(await decryptStreams(srcPath, password)), fs.createWriteStream(destPath));
}

// --- Destination config (S3/Drive/OneDrive credentials, etc.) ---
// Same wrap/unwrap-as-JSON shape as wrapConnection/unwrapConnection above,
// just not tied to the fixed ConnectionConfig shape — each destination
// type defines its own config fields (see lib/backup/destinations/types.ts).

export function wrapDestinationConfig(config: Record<string, string>): string {
  return wrapSecret(JSON.stringify(config));
}

export function unwrapDestinationConfig(wrapped: string): Record<string, string> {
  return JSON.parse(unwrapSecret(wrapped));
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
