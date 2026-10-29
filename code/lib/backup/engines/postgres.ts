import { spawn } from "child_process";
import { createGzip, createGunzip } from "zlib";
import { pipeline } from "stream/promises";
import { Transform } from "stream";
import fs from "fs";
import path from "path";
import type { BackupEngine } from "./types";
import { editLines } from "./lines";
import type { ConnectionConfig } from "@/lib/backup/crypto";

// Uses pg_dump's custom-ish plain-SQL output piped through gzip, same
// shape as the mysql engine so the rest of the pipeline is agnostic.
// Requires the `postgresql-client` package (pg_dump) on the host/image.

// "Require SSL" means "encrypt the connection", same intent as the mysql
// engine's --ssl-mode=REQUIRED — libpq's "require" mode encrypts without
// verifying the server's certificate, which is what we want for a
// self-signed cert on a self-hosted server. When unchecked, "prefer"
// mirrors libpq's own default: opportunistically encrypt, but don't fail
// the connection if the server only offers plaintext.
function pgEnv(conn: ConnectionConfig) {
  return {
    ...process.env,
    PGPASSWORD: conn.password,
    PGSSLMODE: conn.ssl ? "require" : "prefer",
    PGCONNECT_TIMEOUT: "10",
  };
}

// pg_dump always stamps its own client version's preamble onto every dump
// it produces (SET statement_timeout = 0, SET client_encoding, etc.),
// regardless of what version the *source* server was. If the pg_dump
// binary in this image is newer than the *target* server being restored
// into, that preamble can reference a session setting the target doesn't
// have yet — e.g. "transaction_timeout", added in Postgres 17 — and with
// -v ON_ERROR_STOP=1 that's a hard restore failure over something that
// has nothing to do with the actual data. These are harmless to drop: they
// only ever appear as "= 0" (i.e. "no timeout"), which is the same
// behavior an older server already defaults to without the setting existing
// at all. Extend this list if a future Postgres version's pg_dump adds
// another preamble setting older targets don't recognize yet.
const FORWARD_ONLY_PREAMBLE_SETTINGS = [/^SET\s+transaction_timeout\s*=\s*0\s*;\s*$/i];

function stripForwardOnlyPreamble(): Transform {
  let buffered = "";
  return new Transform({
    transform(chunk, _enc, cb) {
      buffered += chunk.toString("utf8");
      const lines = buffered.split("\n");
      // Hold back the last (possibly incomplete) line until more data
      // arrives, so we never test a line before it's fully buffered.
      buffered = lines.pop() ?? "";
      const kept = lines.filter((line) => !FORWARD_ONLY_PREAMBLE_SETTINGS.some((re) => re.test(line)));
      cb(null, kept.length ? kept.join("\n") + "\n" : "");
    },
    flush(cb) {
      if (buffered && !FORWARD_ONLY_PREAMBLE_SETTINGS.some((re) => re.test(buffered))) {
        cb(null, buffered);
      } else {
        cb();
      }
    },
  });
}

export const postgresEngine: BackupEngine = {
  async dump(conn, destPath) {
    await fs.promises.mkdir(path.dirname(destPath), { recursive: true });

    await new Promise<void>((resolve, reject) => {
      const args = [
        "-h", conn.host,
        "-p", String(conn.port),
        "-U", conn.user,
        "-d", conn.database,
        "--no-password",
        "--clean",
        "--if-exists",
      ];

      const dump = spawn("pg_dump", args, { env: pgEnv(conn) });
      const gzip = createGzip();
      const out = fs.createWriteStream(destPath);

      let stderr = "";
      dump.stderr.on("data", (d) => (stderr += d.toString()));

      let settled = false;
      let exitCode: number | null | undefined;
      let pipelineDone = false;
      let pipelineError: Error | undefined;

      // See mysql.ts's attemptDump for why this waits on both the process
      // exit code and the write pipeline before settling: resolving on
      // either alone races with the other, which either reports success on
      // a 0-byte/truncated file, or (as this file previously did) discards
      // a real pg_dump failure that arrives after the pipeline already
      // finished writing.
      const settle = () => {
        if (settled || exitCode === undefined) return;
        if (exitCode !== 0) {
          settled = true;
          reject(new Error(`pg_dump exited with code ${exitCode}: ${stderr.slice(0, 500)}`));
          return;
        }
        if (!pipelineDone) return;
        settled = true;
        if (pipelineError) reject(pipelineError);
        else resolve();
      };

      dump.on("error", (err) =>
        reject(new Error(`Failed to start pg_dump (is it installed?): ${err.message}`))
      );

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
  },

  async restore(conn, srcPath, options) {
    // The dump was taken with --clean --if-exists, so the SQL itself
    // already drops/recreates objects before restoring them — no extra
    // --clean flag needed here, just feed it back through psql.
    const args = [
      "-h", conn.host,
      "-p", String(conn.port),
      "-U", conn.user,
      "-d", conn.database,
      "--no-password",
      // Without this, psql keeps going after a failed statement and still
      // exits 0 — which would make a partially-applied restore look
      // successful.
      "-v", "ON_ERROR_STOP=1",
    ];

    await new Promise<void>((resolve, reject) => {
      const proc = spawn("psql", args, { env: pgEnv(conn) });
      const gunzip = createGunzip();
      const input = fs.createReadStream(srcPath);

      let stderr = "";
      proc.stderr.on("data", (d) => (stderr += d.toString()));

      let settled = false;
      let exitCode: number | null | undefined;
      let pipelineDone = false;
      let pipelineError: Error | undefined;

      const settle = () => {
        if (settled || exitCode === undefined) return;
        if (exitCode !== 0) {
          settled = true;
          reject(new Error(`psql restore exited with code ${exitCode}: ${stderr.slice(0, 800)}`));
          return;
        }
        if (!pipelineDone) return;
        settled = true;
        if (pipelineError) reject(pipelineError);
        else resolve();
      };

      proc.on("error", (err) =>
        reject(new Error(`Failed to start psql (is it installed?): ${err.message}`))
      );

      const testEdits = options?.forTest ? [editLines(dropOwnershipStatements)] : [];
      pipeline([input, gunzip, stripForwardOnlyPreamble(), ...testEdits, proc.stdin]).then(
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
    return new Promise((resolve) => {
      const probe = spawn(
        "psql",
        ["-h", conn.host, "-p", String(conn.port), "-U", conn.user, "-d", conn.database, "--no-password", "-tAc", "SELECT 1"],
        { env: pgEnv(conn) }
      );
      let stderr = "";
      probe.stderr.on("data", (d) => (stderr += d.toString()));
      probe.on("error", (err) => resolve({ ok: false, message: err.message }));
      probe.on("close", (code) => {
        resolve(
          code === 0
            ? { ok: true }
            : { ok: false, message: stderr.trim().slice(0, 500) || "psql connection check failed" }
        );
      });
    });
  },

  // Plain-format pg_dump always ends with this comment.
  completionMarker: /^-- PostgreSQL database dump complete/,
  createTablePattern: /^CREATE TABLE /,

  scratch: {
    async create(server, name) {
      await psqlCommand(server, `CREATE DATABASE ${quoteName(name)}`);
    },
    async drop(server, name) {
      // WITH (FORCE) (Postgres 13+) also ends any session still connected to
      // it; fall back to a plain DROP on older servers.
      try {
        await psqlCommand(server, `DROP DATABASE IF EXISTS ${quoteName(name)} WITH (FORCE)`);
      } catch (err: any) {
        if (!/syntax error/i.test(String(err.message))) throw err;
        await psqlCommand(server, `DROP DATABASE IF EXISTS ${quoteName(name)}`);
      }
    },
    async list(server, prefix) {
      const out = await psqlCommand(server, "SELECT datname FROM pg_database");
      return out.split("\n").map((l) => l.trim()).filter((n) => n.startsWith(prefix));
    },
    async countTables(conn) {
      const out = await psqlCommand(
        conn,
        "SELECT count(*) FROM information_schema.tables WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog', 'information_schema')"
      );
      return Number(out.trim()) || 0;
    },
  },
};

// Ownership and privileges refer to roles on the original server, which a
// test-restore server won't have; with ON_ERROR_STOP they'd fail the test.
// The restored objects simply belong to the test user instead.
const OWNERSHIP_STATEMENTS = [/^ALTER [A-Z ]+ .* OWNER TO /, /^GRANT /, /^REVOKE /, /^ALTER DEFAULT PRIVILEGES /];
function dropOwnershipStatements(line: string): string | null {
  return OWNERSHIP_STATEMENTS.some((re) => re.test(line)) ? null : line;
}

function quoteName(name: string) {
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error(`Refusing unexpected database name: ${name}`);
  return `"${name}"`;
}

// Runs one SQL command through psql and returns its unaligned output.
function psqlCommand(conn: ConnectionConfig, sql: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "psql",
      ["-h", conn.host, "-p", String(conn.port), "-U", conn.user, "-d", conn.database || "postgres", "--no-password", "-v", "ON_ERROR_STOP=1", "-tAc", sql],
      { env: pgEnv(conn) }
    );
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", (err) => reject(new Error(`Failed to start psql (is it installed?): ${err.message}`)));
    proc.on("close", (code) =>
      code === 0 ? resolve(stdout) : reject(new Error(stderr.trim().slice(0, 800) || `psql exited with code ${code}`))
    );
  });
}
