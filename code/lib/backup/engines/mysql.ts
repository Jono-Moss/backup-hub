import { spawn } from "child_process";
import { createGzip, createGunzip } from "zlib";
import { pipeline } from "stream/promises";
import fs from "fs";
import path from "path";
import mysql from "mysql2/promise";
import type { BackupEngine } from "./types";
import type { ConnectionConfig } from "@/lib/backup/crypto";

// Overridable so a machine with multiple mysqldump versions installed (e.g.
// a Homebrew "latest" client alongside an older one) can pin a specific,
// known-compatible binary instead of whatever resolves first on PATH.
const MYSQLDUMP_BIN = process.env.MYSQLDUMP_PATH || "mysqldump";
// Same idea, for restores — the "mysql" client rather than "mysqldump".
const MYSQL_BIN = process.env.MYSQL_PATH || "mysql";

type DumpFlavor = "mysql" | "mariadb" | "unknown";

// Cached at module scope — the resolved binary doesn't change mid-process.
let cachedFlavor: Promise<DumpFlavor> | null = null;

function detectFlavor(): Promise<DumpFlavor> {
  if (cachedFlavor) return cachedFlavor;

  cachedFlavor = new Promise((resolve) => {
    const proc = spawn(/*turbopackIgnore: true*/ MYSQLDUMP_BIN, ["--version"]);
    let out = "";
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.on("error", () => resolve("unknown"));
    proc.on("close", () => {
      // MariaDB's version string always self-identifies (e.g. "Distrib
      // 10.19-MariaDB, ..."). Genuine MySQL's format has changed across
      // versions (older: "Distrib 8.0.28, ..."; 8.4+/9.x dropped "Distrib"
      // entirely) so rather than key on a keyword that isn't stable across
      // MySQL versions, anything that produced a real mysqldump version
      // banner and didn't self-identify as MariaDB is treated as MySQL.
      if (/mariadb/i.test(out)) resolve("mariadb");
      else if (/mysqldump/i.test(out) && /ver\b/i.test(out)) resolve("mysql");
      else resolve("unknown");
    });
  });

  return cachedFlavor;
}

interface DumpFlags {
  // Genuine MySQL-8.0-specific flags (--column-statistics, --set-gtid-purged)
  // that MariaDB's dump tool has never had and hard-errors on.
  mysql8Flags: boolean;
  // Whether to dump stored routines/triggers. MariaDB's dump tool (10.3+)
  // unconditionally probes for its own "packages" feature as part of
  // --routines, regardless of what the target server actually supports —
  // a known MariaDB bug (MDEV-17429) that breaks against any server
  // without packages (genuine MySQL, or MariaDB < 10.3).
  routines: boolean;
  // Which TLS-flag syntax to use when conn.ssl is set. Genuine MySQL 8+
  // only understands --ssl-mode; older MariaDB clients (pre-10.4-ish
  // Connector/C) only understand the legacy --ssl / --ssl-verify-server-cert
  // pair. We pick a starting guess from flavor detection and the retry loop
  // below falls back if the binary rejects it as unrecognized.
  sslFlagStyle: "modern" | "legacy";
}

type AttemptResult = { ok: true } | { ok: false; code: number | null; stderr: string };

// Shared between buildArgs (dump) and restore(): which TLS flag syntax to
// emit for a given conn.ssl setting. See the comment on DumpFlags.sslFlagStyle.
function sslArgs(conn: ConnectionConfig, style: "modern" | "legacy"): string[] {
  if (conn.ssl) {
    return style === "modern" ? ["--ssl-mode=REQUIRED"] : ["--ssl", "--ssl-verify-server-cert=0"];
  }
  return style === "modern" ? ["--ssl-mode=DISABLED"] : ["--skip-ssl"];
}

function buildArgs(conn: ConnectionConfig, flags: DumpFlags): string[] {
  const args = [
    "-h", conn.host,
    "-P", String(conn.port),
    "-u", conn.user,
    `--password=${conn.password}`,
    // If conn.host is literally "localhost", the mysql client tools
    // silently switch to a Unix socket and ignore -P entirely. Forcing TCP
    // makes "localhost" behave the way everyone expects: connect over TCP
    // to the configured host/port, same as the mysql2 driver used by
    // "Test connection". Supported by both MySQL and MariaDB clients.
    "--protocol=TCP",
    "--single-transaction",
    "--triggers",
    // Dumping tablespace metadata requires the PROCESS privilege, which a
    // least-privilege, schema-scoped backup user shouldn't need. Supported
    // by both clients.
    "--no-tablespaces",
  ];

  if (flags.routines) args.push("--routines");

  // Explicitly control TLS. Left unset, the installed client's own default
  // applies — and modern MariaDB/MySQL client builds default to verifying
  // the server's certificate against the system CA store, which fails for
  // the self-signed certs most self-hosted database servers use. "Require
  // SSL" here means "encrypt the connection", not "verify server identity",
  // so we deliberately request encryption without verification.
  args.push(...sslArgs(conn, flags.sslFlagStyle));

  if (flags.mysql8Flags) {
    args.push(
      "--column-statistics=0",
      // If the server has gtid_mode=ON (common on managed MySQL — RDS,
      // DigitalOcean, PlanetScale, etc.), --single-transaction alone
      // requires the RELOAD or FLUSH_TABLES privilege to record the GTID
      // position. We don't need GTID_PURGED for a standalone logical
      // backup/restore, so skip recording it rather than requiring that
      // privilege.
      "--set-gtid-purged=OFF"
    );
  }

  args.push(conn.database);
  return args;
}

function attemptDump(conn: ConnectionConfig, destPath: string, flags: DumpFlags): Promise<AttemptResult> {
  return new Promise((resolve, reject) => {
    const args = buildArgs(conn, flags);
    const dump = spawn(/*turbopackIgnore: true*/ MYSQLDUMP_BIN, args);
    const gzip = createGzip();
    const out = fs.createWriteStream(destPath);

    let stderr = "";
    dump.stderr.on("data", (d) => (stderr += d.toString()));

    let settled = false;
    let exitCode: number | null | undefined;
    let pipelineDone = false;
    let pipelineError: Error | undefined;

    // Only resolve once BOTH the process has told us its exit code AND the
    // write pipeline (gzip + disk write) has actually finished flushing.
    // Resolving on the process's 'close' alone (the previous behavior) races
    // with the write stream: mysqldump can report success before its
    // buffered stdout has been fully gzip'd and written to destPath, so the
    // caller's immediate fs.stat() could catch a 0-byte or truncated file
    // that kept growing on disk afterward.
    const settle = () => {
      if (settled || exitCode === undefined) return;
      if (exitCode !== 0) {
        // A non-zero exit is authoritative failure — don't wait on the
        // pipeline, which may never cleanly finish if mysqldump died
        // mid-stream.
        settled = true;
        resolve({ ok: false, code: exitCode, stderr });
        return;
      }
      if (!pipelineDone) return;
      settled = true;
      if (pipelineError) reject(pipelineError);
      else resolve({ ok: true });
    };

    dump.on("error", (err) => {
      if (settled) return;
      settled = true;
      reject(
        new Error(
          `Failed to start "${MYSQLDUMP_BIN}" (is it installed and on PATH? set MYSQLDUMP_PATH to override): ${err.message}`
        )
      );
    });

    pipeline(dump.stdout, gzip, out).then(
      () => {
        pipelineDone = true;
        settle();
      },
      (err) => {
        pipelineError = err;
        pipelineDone = true;
        settle();
      }
    );

    dump.on("close", (code) => {
      exitCode = code;
      settle();
    });
  });
}

// Rather than statically guessing which flags a given client/server
// combination needs (which breaks every time we encounter a version or
// vendor combo we haven't specifically seen before), this starts with the
// fullest-fidelity attempt and adaptively drops a specific capability only
// when the server/client actually reports it can't handle it — so it
// self-corrects for version and vendor combinations we've never
// encountered, instead of needing a new hardcoded case each time one does.
async function dumpWithRetry(conn: ConnectionConfig, destPath: string): Promise<void> {
  const flavor = await detectFlavor();
  // Default to attempting the MySQL-8.0-specific flags unless we're
  // *certain* the binary is MariaDB (which never supports them, so trying
  // would just waste an attempt). For "unknown" flavor (binary didn't
  // clearly self-identify), start optimistic: the retry loop below already
  // knows how to recover from "flag rejected as unrecognized" by turning it
  // off and retrying, but there's no equivalent recovery for "flag was
  // needed but we never tried it" — so when in doubt, attempt the fuller
  // set first rather than assuming the more limited one.
  const flags: DumpFlags = {
    mysql8Flags: flavor !== "mariadb",
    routines: true,
    // MariaDB's --ssl-mode support is version-dependent, so default MariaDB
    // (and "unknown", where we can't be sure) to the legacy flag pair, which
    // every MariaDB client build understands. Genuine MySQL 8+ removed the
    // legacy flags entirely, so it must use --ssl-mode.
    sslFlagStyle: flavor === "mysql" ? "modern" : "legacy",
  };
  const droppedCapabilities: string[] = [];

  const MAX_ATTEMPTS = 4;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const result = await attemptDump(conn, destPath, flags);

    if (result.ok) {
      if (droppedCapabilities.length > 0) {
        console.warn(
          `[mysql] backup for "${conn.database}" succeeded after automatically dropping: ${droppedCapabilities.join(", ")}. ` +
            `This usually means the mysqldump binary (flavor: ${flavor}) doesn't fully match the target server's ` +
            `flavor/version — for full fidelity, install a matching client and point MYSQLDUMP_PATH at it.`
        );
      }
      return;
    }

    // Recoverable case 1: a flag was rejected outright as unrecognized —
    // our flavor detection already tries to prevent this, but this is the
    // safety net for whatever it didn't catch (e.g. a client that reports
    // its version ambiguously).
    if (/unknown variable/i.test(result.stderr) && flags.mysql8Flags) {
      flags.mysql8Flags = false;
      droppedCapabilities.push("--column-statistics/--set-gtid-purged (rejected as unrecognized)");
      continue;
    }

    // Recoverable case 2: MariaDB's routine-dumping package probe (see
    // DumpFlags.routines above) against a server that doesn't support it.
    if (/PACKAGE STATUS/i.test(result.stderr) && flags.routines) {
      flags.routines = false;
      droppedCapabilities.push("--routines (target server doesn't support MariaDB's package-status probe)");
      continue;
    }

    // Recoverable case 3: guessed the wrong TLS flag syntax for this binary
    // (e.g. a MariaDB client old enough not to understand --ssl-mode, or a
    // genuine MySQL 8+ client which no longer understands the legacy flags).
    if (
      /unknown (variable|option).*ssl.?mode/i.test(result.stderr) &&
      flags.sslFlagStyle === "modern"
    ) {
      flags.sslFlagStyle = "legacy";
      droppedCapabilities.push("--ssl-mode (rejected as unrecognized; switched to legacy --ssl/--ssl-verify-server-cert)");
      continue;
    }
    if (
      /unknown (variable|option).*ssl.?verify.?server.?cert/i.test(result.stderr) &&
      flags.sslFlagStyle === "legacy"
    ) {
      flags.sslFlagStyle = "modern";
      droppedCapabilities.push("--ssl-verify-server-cert (rejected as unrecognized; switched to --ssl-mode)");
      continue;
    }

    // Nothing left to automatically adjust — surface a detailed error.
    throw new Error(formatFinalError(result, flavor, conn));
  }

  throw new Error(`mysqldump failed after ${MAX_ATTEMPTS} automatic retries for "${conn.database}"`);
}

function formatFinalError(result: { code: number | null; stderr: string }, flavor: DumpFlavor, conn: ConnectionConfig): string {
  let hint = "";
  if (result.stderr.includes("INFORMATION_SCHEMA.LIBRARIES")) {
    hint =
      "\n\nThis looks like the known mysqldump 9.3+ client/server incompatibility " +
      "(it probes for a MySQL 9.x-only feature that doesn't exist on your server). " +
      "Set MYSQLDUMP_PATH to an 8.x/9.2-or-earlier mysqldump binary — see README.";
  } else if (/Access denied for user .*@'localhost'/.test(result.stderr) && conn.host === "localhost") {
    hint =
      "\n\nThis looks like the mysql-client \"localhost means Unix socket\" gotcha — " +
      "the account was denied on @'localhost' even though you configured a TCP host/port. " +
      "--protocol=TCP is already passed, so if you still see this, double check the task's " +
      "host/port match what \"Test connection\" actually validated.";
  } else if (/self.signed certificate/i.test(result.stderr) || /certificate verify failed/i.test(result.stderr)) {
    hint =
      "\n\nThe target server presented a certificate the client couldn't verify (e.g. self-signed). " +
      "The backup job already requests encryption without certificate verification when \"Require SSL\" " +
      "is checked on the task, so if you still see this, double-check that checkbox is actually on for this task.";
  } else if (/RELOAD or FLUSH_TABLES privilege/i.test(result.stderr) || /FLUSH.*TABLES.*Access denied/i.test(result.stderr)) {
    hint =
      "\n\nThe server has gtid_mode=ON, which normally requires the RELOAD or FLUSH_TABLES " +
      "privilege for --single-transaction dumps. --set-gtid-purged=OFF is already passed " +
      "(when the client is genuine MySQL) to avoid needing that privilege — if you still see " +
      "this, the account is missing more basic privileges. See the README's minimal GRANT statement.";
  }
  return `mysqldump exited with code ${result.code}: ${result.stderr.slice(0, 800)}${hint}`;
}

export const mysqlEngine: BackupEngine = {
  async dump(conn, destPath) {
    await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
    await dumpWithRetry(conn, destPath);
  },

  async restore(conn, srcPath) {
    const flavor = await detectFlavor();
    const args = [
      "-h", conn.host,
      "-P", String(conn.port),
      "-u", conn.user,
      `--password=${conn.password}`,
      "--protocol=TCP",
      ...sslArgs(conn, flavor === "mysql" ? "modern" : "legacy"),
      conn.database,
    ];

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(/*turbopackIgnore: true*/ MYSQL_BIN, args);
      const gunzip = createGunzip();
      const input = fs.createReadStream(srcPath);

      let stderr = "";
      proc.stderr.on("data", (d) => (stderr += d.toString()));

      let settled = false;
      let exitCode: number | null | undefined;
      let pipelineDone = false;
      let pipelineError: Error | undefined;

      // Same exit-code + pipeline coordination as attemptDump above — don't
      // declare the restore done (or failed) until both the client process
      // has exited and every gunzip'd byte has actually been written to its
      // stdin.
      const settle = () => {
        if (settled || exitCode === undefined) return;
        if (exitCode !== 0) {
          settled = true;
          reject(new Error(`mysql restore exited with code ${exitCode}: ${stderr.slice(0, 1000)}`));
          return;
        }
        if (!pipelineDone) return;
        settled = true;
        if (pipelineError) reject(pipelineError);
        else resolve();
      };

      proc.on("error", (err) =>
        reject(
          new Error(
            `Failed to start "${MYSQL_BIN}" (is it installed and on PATH? set MYSQL_PATH to override): ${err.message}`
          )
        )
      );

      pipeline(input, gunzip, proc.stdin).then(
        () => {
          pipelineDone = true;
          settle();
        },
        (err) => {
          pipelineError = err;
          pipelineDone = true;
          settle();
        }
      );

      proc.on("close", (code) => {
        exitCode = code;
        settle();
      });
    });
  },

  async testConnection(conn: ConnectionConfig) {
    try {
      const connection = await mysql.createConnection({
        host: conn.host,
        port: conn.port,
        user: conn.user,
        password: conn.password,
        database: conn.database,
        // As with the mysqldump args above: "Require SSL" means "encrypt",
        // not "verify the server's certificate against a CA we trust" — an
        // empty {} here would fall back to Node's tls default of
        // rejectUnauthorized: true, which rejects self-signed certs.
        ssl: conn.ssl ? { rejectUnauthorized: false } : undefined,
        connectTimeout: 5000,
      });
      await connection.ping();
      await connection.end();
      return { ok: true };
    } catch (e: any) {
      return { ok: false, message: e.message };
    }
  },
};