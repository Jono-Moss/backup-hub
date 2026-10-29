import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { Writable } from "stream";
import { pipeline } from "stream/promises";
import { createGunzip } from "zlib";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { backupRun, backupTask, ENGINES, type Engine, type VerifyLevel } from "@/db/schema";
import { decryptFile, decryptStreams, keyCheckForFile, unwrapSecret, type ConnectionConfig } from "@/lib/backup/crypto";
import { getEngine } from "@/lib/backup/engines";
import { notifyVerifyFailure } from "@/lib/notifications/notify";
import { getRunFilePath } from "./paths";

// Checking that backup files are still usable. Three levels:
//
//   1. Fingerprint — the SHA-256 recorded when the backup was made still
//      matches, so the file hasn't changed on disk since.
//   2. Read-back — the whole file decrypts (AES-GCM's auth tag fails on any
//      damaged byte), decompresses (gzip checks its own CRC), and ends with
//      the dump tool's "dump completed" line, so it wasn't cut short.
//   3. Test restore — restore it into a brand-new throwaway database on an
//      admin-configured scratch server, check tables came back, then drop
//      the database again.
//
// "check" runs 1+2, "restore" runs 1+2+3. A check runs automatically after
// every backup; a test restore after every backup is a per-task option.
// Checks run one at a time in a background queue so a big file, or "Verify
// all", can't swamp the server.

type Run = typeof backupRun.$inferSelect;
type Task = typeof backupTask.$inferSelect;

export interface CheckOutcome {
  ok: boolean;
  message: string;
}

// --- Test-restore server (admin-configured) ---

const SCRATCH_ENV: Record<Engine, string> = { mysql: "VERIFY_MYSQL_URL", postgres: "VERIFY_POSTGRES_URL" };
const SCRATCH_PREFIX = "bh_verify_";
// Leftover databases (from a server stopped mid-test) older than this are dropped at startup.
const LEFTOVER_AGE_MS = 6 * 60 * 60 * 1000;

/**
 * The scratch server for an engine, from VERIFY_MYSQL_URL / VERIFY_POSTGRES_URL:
 *   mysql://user:pass@host:3306              (add ?ssl=true to require TLS)
 *   postgres://user:pass@host:5432/postgres  (the path is the database to connect to for CREATE/DROP DATABASE)
 */
export function scratchServerFor(engine: Engine): ConnectionConfig | null {
  const raw = process.env[SCRATCH_ENV[engine]]?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const ssl = url.searchParams.get("ssl") === "true" || url.searchParams.get("sslmode") === "require";
    return {
      host: url.hostname,
      port: Number(url.port) || (engine === "mysql" ? 3306 : 5432),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: engine === "postgres" ? decodeURIComponent(url.pathname.slice(1)) || "postgres" : "",
      ssl,
    };
  } catch {
    console.error(`[verify] ${SCRATCH_ENV[engine]} isn't a valid URL — test restores are disabled for ${engine}.`);
    return null;
  }
}

export function testRestoreAvailable(engine: Engine): boolean {
  return scratchServerFor(engine) !== null;
}

// --- Level 1 + 2: the file itself ---

export function fileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    fs.createReadStream(filePath)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", reject);
  });
}

/** Reads decompressed SQL, remembering the last non-empty line and counting CREATE TABLEs. */
function sqlScanner(createTable: RegExp) {
  const stats = { lastLine: "", createTables: 0, bytes: 0 };
  let partial = "";
  const take = (line: string) => {
    if (createTable.test(line)) stats.createTables++;
    if (line.trim()) stats.lastLine = line;
  };
  const sink = new Writable({
    write(chunk: Buffer, _enc, cb) {
      stats.bytes += chunk.length;
      const lines = (partial + chunk.toString("latin1")).split("\n");
      partial = lines.pop() ?? "";
      lines.forEach(take);
      cb();
    },
    final(cb) {
      if (partial) take(partial);
      cb();
    },
  });
  return { sink, stats };
}

// Turns low-level stream errors into something a person can act on.
function describeReadError(err: unknown, stage: "decrypt" | "decompress", keyConfirmed: boolean): string {
  const msg = String((err as Error)?.message ?? err);
  if (stage === "decrypt") {
    return keyConfirmed
      ? "The file is damaged: it fails its encryption integrity check."
      : "Couldn't decrypt the file: it's damaged, or the task's backup password has changed since this backup was made.";
  }
  if (/unexpected end of file/i.test(msg)) return "The file is cut off: its compressed data ends early.";
  if (/incorrect data check/i.test(msg)) return "The file is damaged: its compressed data fails its checksum.";
  if (/incorrect header check|invalid/i.test(msg)) return "The file isn't valid compressed data.";
  return `The file couldn't be read: ${msg}`;
}

interface FileCheck extends CheckOutcome {
  sha256?: string;
  createTables?: number;
}

/**
 * Levels 1 and 2. For encrypted backups, `decryptedCopy` (if given) receives
 * the decrypted .sql.gz so a test restore can use it — only after it has
 * passed the integrity check.
 */
async function checkFile(run: Run, task: Task, filePath: string, decryptedCopy?: string): Promise<FileCheck> {
  const stat = await fs.promises.stat(filePath).catch(() => null);
  if (!stat) return { ok: false, message: "The backup file is missing on disk." };

  const sha256 = await fileSha256(filePath);
  if (run.sha256 && run.sha256 !== sha256) {
    return { ok: false, message: "The file has changed since this backup was made (its fingerprint doesn't match): it's damaged or was modified." };
  }

  const engine = getEngine(task.engine);
  const { sink, stats } = sqlScanner(engine.createTablePattern);
  let gzPath = filePath;

  if (run.encrypted) {
    if (!task.encryptedBackupPassword) {
      return { ok: false, message: "This backup is encrypted but the task has no backup password saved, so it can't be checked." };
    }
    const password = unwrapSecret(task.encryptedBackupPassword);
    let keyConfirmed = false;
    if (run.keyCheck) {
      if ((await keyCheckForFile(filePath, password)) !== run.keyCheck) {
        return {
          ok: false,
          message: "The task's backup password has changed since this backup was made, so it can't be checked automatically. The file itself may be fine — restore it with its original password.",
        };
      }
      keyConfirmed = true;
    }
    try {
      if (decryptedCopy) {
        await decryptFile(filePath, decryptedCopy, password);
        gzPath = decryptedCopy;
      } else {
        // Decrypt and decompress in one pass. A decrypt failure surfaces at
        // the very end (when the auth tag is checked), after gunzip may
        // already have complained about the garbage — so look at the
        // decipher's own state to report the real cause.
        const [body, decipher] = await decryptStreams(filePath, password);
        let decryptFailed = false;
        decipher.on("error", () => (decryptFailed = true));
        try {
          await pipeline(body, decipher, createGunzip(), sink);
        } catch (err) {
          // Without a confirmed key, a wrong password just yields garbage
          // that gunzip rejects first — so any failure could be either cause.
          const stage = decryptFailed || !keyConfirmed ? "decrypt" : "decompress";
          return { ok: false, message: describeReadError(err, stage, keyConfirmed) };
        }
        return finishCheck(engine.completionMarker, stats, sha256);
      }
    } catch (err) {
      return { ok: false, message: describeReadError(err, "decrypt", keyConfirmed) };
    }
  }

  try {
    await pipeline(fs.createReadStream(gzPath), createGunzip(), sink);
  } catch (err) {
    return { ok: false, message: describeReadError(err, "decompress", false) };
  }
  return finishCheck(engine.completionMarker, stats, sha256);
}

function finishCheck(marker: RegExp, stats: { lastLine: string; createTables: number; bytes: number }, sha256: string): FileCheck {
  if (!marker.test(stats.lastLine.trim())) {
    return {
      ok: false,
      sha256,
      message: "The dump is incomplete: it doesn't end with the database tool's \"dump completed\" line, so it was probably cut short.",
    };
  }
  const mb = (stats.bytes / 1024 / 1024).toFixed(1);
  return {
    ok: true,
    sha256,
    createTables: stats.createTables,
    message: `File intact: reads back completely (${mb} MB of SQL, ${stats.createTables} table${stats.createTables === 1 ? "" : "s"}).`,
  };
}

// --- Level 3: test restore ---

// Problems setting up the scratch database are the admin's to fix and can
// mention the scratch server's address or login — keep the details in the
// server log, and show users a generic message.
class ScratchSetupError extends Error {}

async function testRestore(task: Task, gzPath: string, createTables: number): Promise<CheckOutcome> {
  const server = scratchServerFor(task.engine);
  if (!server) {
    return { ok: false, message: `Test restores aren't set up on this server (an admin can set ${SCRATCH_ENV[task.engine]}).` };
  }
  const engine = getEngine(task.engine);
  const name = `${SCRATCH_PREFIX}${Math.floor(Date.now() / 1000)}_${crypto.randomBytes(6).toString("hex")}`;

  try {
    try {
      await engine.scratch.create(server, name);
    } catch (err) {
      console.error(`[verify] couldn't create test database ${name} on ${SCRATCH_ENV[task.engine]}:`, err);
      throw new ScratchSetupError();
    }

    const target = { ...server, database: name };
    try {
      await engine.restore(target, gzPath, { forTest: true });
    } catch (err: any) {
      return { ok: false, message: `The test restore failed: ${String(err.message ?? err).slice(0, 1500)}` };
    }

    let tables: number;
    try {
      tables = await engine.scratch.countTables(target);
    } catch (err) {
      console.error(`[verify] couldn't inspect test database ${name}:`, err);
      throw new ScratchSetupError();
    }
    if (createTables > 0 && tables === 0) {
      return { ok: false, message: `The test restore finished, but no tables came back (the dump creates ${createTables}).` };
    }
    return { ok: true, message: `Test restore passed: restored into a temporary database with ${tables} table${tables === 1 ? "" : "s"}, then removed it.` };
  } catch (err) {
    if (err instanceof ScratchSetupError) {
      return { ok: false, message: "Couldn't prepare the temporary test database. An admin should check the test-restore server settings (see the server log)." };
    }
    throw err;
  } finally {
    await engine.scratch.drop(server, name).catch((err) =>
      console.error(`[verify] couldn't drop test database ${name} — it will be retried at the next start:`, err)
    );
  }
}

// --- Running a check ---

async function loadRun(runId: string) {
  const [row] = await db
    .select({ run: backupRun, task: backupTask })
    .from(backupRun)
    .innerJoin(backupTask, eq(backupTask.id, backupRun.taskId))
    .where(eq(backupRun.id, runId))
    .limit(1);
  return row ?? null;
}

async function saveResult(runId: string, level: VerifyLevel, outcome: CheckOutcome, sha256?: string) {
  await db
    .update(backupRun)
    .set({
      verifyStatus: outcome.ok ? "passed" : "failed",
      verifyLevel: level,
      verifyMessage: outcome.message.slice(0, 2048),
      verifiedAt: new Date(),
      // Record the fingerprint the first time a pre-existing backup is checked.
      ...(sha256 ? { sha256 } : {}),
    })
    .where(eq(backupRun.id, runId));
}

export async function verifyRun(runId: string, level: VerifyLevel): Promise<CheckOutcome> {
  const row = await loadRun(runId);
  if (!row || row.run.status !== "completed" || !row.run.filename) {
    return { ok: false, message: "Only a completed backup with a file can be checked." };
  }
  const { run, task } = row;
  await db.update(backupRun).set({ verifyStatus: "running" }).where(eq(backupRun.id, runId));

  const source = getRunFilePath(run.taskId, run.filename!);
  // Encrypted + test restore: decrypt once into a private temp file, used by both steps.
  const decryptedCopy =
    level === "restore" && run.encrypted ? path.join(os.tmpdir(), `bh-verify-${runId}-${Date.now()}.sql.gz`) : undefined;

  let outcome: CheckOutcome;
  let sha256: string | undefined;
  try {
    const file = await checkFile(run, task, source, decryptedCopy);
    sha256 = file.ok && !run.sha256 ? file.sha256 : undefined;
    if (!file.ok || level === "check") {
      outcome = file;
    } else {
      const restored = await testRestore(task, decryptedCopy ?? source, file.createTables ?? 0);
      outcome = restored.ok ? { ok: true, message: `${file.message} ${restored.message}` } : restored;
    }
  } catch (err: any) {
    console.error(`[verify] check of run ${runId} failed unexpectedly:`, err);
    outcome = { ok: false, message: `The check couldn't run: ${String(err.message ?? err).slice(0, 500)}` };
  } finally {
    // Never leave a decrypted copy lying around.
    if (decryptedCopy) await fs.promises.unlink(decryptedCopy).catch(() => {});
  }

  await saveResult(runId, level, outcome, sha256);
  return outcome;
}

/**
 * Levels 1+2 on a freshly written backup, before it's marked completed (see
 * runner.ts). Returns the fingerprint to store with the run.
 */
export async function checkNewBackup(task: Task, filePath: string, encrypted: boolean, keyCheck: string | null) {
  const fakeRun = { sha256: null, encrypted, keyCheck } as Run;
  return checkFile(fakeRun, task, filePath);
}

// --- Background queue ---

interface Job {
  runId: string;
  level: VerifyLevel;
  /** Alert the task's failure recipients if it fails (automatic checks only). */
  notify: boolean;
}

// On globalThis: Next.js can load this module more than once (e.g. the
// scheduler and the server actions end up in different bundles), and there
// must only ever be one worker.
const state: { jobs: Job[]; working: boolean } =
  ((globalThis as any).__backupHubVerifyQueue ??= { jobs: [], working: false });

export async function enqueueVerify(runIds: string[], level: VerifyLevel, options: { notify?: boolean } = {}) {
  const queued = new Set(state.jobs.map((j) => j.runId));
  const fresh = runIds.filter((id) => !queued.has(id));
  if (fresh.length === 0) return;
  await db.update(backupRun).set({ verifyStatus: "queued" }).where(inArray(backupRun.id, fresh));
  state.jobs.push(...fresh.map((runId) => ({ runId, level, notify: !!options.notify })));
  void work();
}

async function work() {
  if (state.working) return;
  state.working = true;
  try {
    while (state.jobs.length > 0) {
      const job = state.jobs.shift()!;
      try {
        const outcome = await verifyRun(job.runId, job.level);
        if (!outcome.ok && job.notify) {
          const row = await loadRun(job.runId);
          if (row) {
            notifyVerifyFailure(row.task.id, row.run.filename ?? "", outcome.message).catch((err) =>
              console.error("[notify] backup check failure notification failed:", err)
            );
          }
        }
      } catch (err) {
        console.error(`[verify] job for run ${job.runId} crashed:`, err);
      }
    }
  } finally {
    state.working = false;
  }
}

// --- Startup housekeeping ---

/** Called at startup: checks that were queued or running when the server stopped won't finish. */
export async function resetInterruptedChecks() {
  await db
    .update(backupRun)
    .set({ verifyStatus: null })
    .where(and(isNotNull(backupRun.verifyStatus), inArray(backupRun.verifyStatus, ["queued", "running"])));
}

/** Called at startup: drops test databases left behind by a server stopped mid-test. */
export async function cleanUpTestDatabases() {
  for (const engineName of ENGINES) {
    const server = scratchServerFor(engineName);
    if (!server) continue;
    const engine = getEngine(engineName);
    try {
      const names = await engine.scratch.list(server, SCRATCH_PREFIX);
      for (const name of names) {
        const created = Number(name.slice(SCRATCH_PREFIX.length).split("_")[0]) * 1000;
        if (!created || Date.now() - created < LEFTOVER_AGE_MS) continue;
        await engine.scratch.drop(server, name);
        console.log(`[verify] dropped leftover test database ${name}`);
      }
    } catch (err) {
      console.error(`[verify] couldn't check ${SCRATCH_ENV[engineName]} for leftover test databases:`, err);
    }
  }
}
