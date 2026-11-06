import { spawn } from "child_process";
import { createGzip, createGunzip } from "zlib";
import { pipeline } from "stream/promises";
import { Writable, type Readable } from "stream";
import fs from "fs";
import os from "os";
import path from "path";
import { BSON, MongoClient } from "mongodb";
import type { BackupEngine, DumpScanner } from "./types";
import type { ConnectionConfig } from "@/lib/backup/crypto";

// MongoDB, via the MongoDB Database Tools (`mongodump` / `mongorestore`,
// the `mongodb-tools` package in the Docker image). A backup is one
// database dumped as a mongodump *archive* (`--archive`, written to stdout)
// and gzipped by us, so the file is `.archive.gz` and the rest of the
// pipeline (encryption, uploads, checks) treats it like any other dump.
//
// Connections:
//   - The user is authenticated against `authSource` (default "admin",
//     where users usually live — including on MongoDB Atlas).
//   - Hosts ending in .mongodb.net (Atlas) use an SRV connection string
//     (mongodb+srv://, which implies TLS and ignores the port).
//   - "Require SSL" means encrypt without verifying the certificate, the
//     same intent as the MySQL/Postgres engines (self-signed certs on
//     self-hosted servers).
//   - The connection string (with the password) is passed to the tools in
//     a private, temporary --config file, never on the command line where
//     other processes could read it.

const MONGODUMP_BIN = process.env.MONGODUMP_PATH || "mongodump";
const MONGORESTORE_BIN = process.env.MONGORESTORE_PATH || "mongorestore";

function isAtlasHost(host: string) {
  return /\.mongodb\.net$/i.test(host.trim());
}

/** The connection string for `conn`. No database in the path: tools get --db / --nsTo instead. */
export function mongoUri(conn: ConnectionConfig): string {
  const srv = isAtlasHost(conn.host);
  const params = new URLSearchParams();
  if (conn.user) params.set("authSource", conn.authSource?.trim() || "admin");
  if (!srv && conn.ssl) {
    params.set("tls", "true");
    params.set("tlsAllowInvalidCertificates", "true");
  }
  params.set("connectTimeoutMS", "10000");
  params.set("serverSelectionTimeoutMS", "15000");
  const credentials = conn.user ? `${encodeURIComponent(conn.user)}:${encodeURIComponent(conn.password)}@` : "";
  const host = srv ? conn.host.trim() : `${conn.host.trim()}:${conn.port}`;
  return `${srv ? "mongodb+srv" : "mongodb"}://${credentials}${host}/?${params.toString()}`;
}

/** Runs `fn` with a private --config file holding the connection string, removed afterwards. */
async function withConfigFile<T>(conn: ConnectionConfig, fn: (configPath: string) => Promise<T>): Promise<T> {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "bh-mongo-"));
  const configPath = path.join(dir, "config.yaml");
  try {
    // A JSON string is a valid YAML double-quoted scalar.
    await fs.promises.writeFile(configPath, `uri: ${JSON.stringify(mongoUri(conn))}\n`, { mode: 0o600 });
    return await fn(configPath);
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// Database names go on the command line and into --nsTo, so only allow
// what MongoDB allows and nothing that could be read as an option.
function checkDatabaseName(name: string) {
  if (!name || name.startsWith("-") || /[\/\\. "$*<>:|?\0]/.test(name) || name.length > 63) {
    throw new Error(`"${name}" isn't a valid MongoDB database name.`);
  }
}

/**
 * Spawns a tool with one stream piped through it, settling only once both
 * the process has exited and the stream pipeline has finished (see the
 * Postgres engine for why waiting on just one of them is wrong).
 */
function runTool(
  bin: string,
  args: string[],
  label: string,
  envName: string,
  wire: (proc: ReturnType<typeof spawn>) => Promise<void>
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr!.on("data", (d) => {
      // Progress logs can be long; keep the tail, where errors are.
      stderr = (stderr + d.toString()).slice(-4000);
    });

    let settled = false;
    let exitCode: number | null | undefined;
    let pipelineDone = false;
    let pipelineError: Error | undefined;
    const settle = () => {
      if (settled || exitCode === undefined) return;
      if (exitCode !== 0) {
        settled = true;
        reject(new Error(`${label} exited with code ${exitCode}: ${lastLines(stderr)}`));
        return;
      }
      if (!pipelineDone) return;
      settled = true;
      if (pipelineError) reject(pipelineError);
      else resolve();
    };

    proc.on("error", (err) => {
      if (settled) return;
      settled = true;
      reject(new Error(`Failed to start "${bin}" (is it installed and on PATH? set ${envName} to override): ${err.message}`));
    });
    wire(proc).then(
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
}

// The useful part of a tool's log: its last few lines, without timestamps.
function lastLines(log: string) {
  return log
    .trim()
    .split("\n")
    .slice(-4)
    .map((l) => l.replace(/^\S+T\S+\s+/, ""))
    .join(" ")
    .slice(0, 800);
}

async function withClient<T>(conn: ConnectionConfig, fn: (client: MongoClient) => Promise<T>): Promise<T> {
  const client = new MongoClient(mongoUri(conn), { serverSelectionTimeoutMS: 15000 });
  try {
    await client.connect();
    return await fn(client);
  } finally {
    await client.close().catch(() => {});
  }
}

export const mongodbEngine: BackupEngine = {
  fileExtension: ".archive.gz",
  objectNoun: "collection",
  formatName: "archive",

  async dump(conn, destPath) {
    checkDatabaseName(conn.database);
    await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
    await withConfigFile(conn, (config) =>
      runTool(
        MONGODUMP_BIN,
        [`--config=${config}`, `--db=${conn.database}`, "--archive"],
        "mongodump",
        "MONGODUMP_PATH",
        (proc) => pipeline(proc.stdout as Readable, createGzip(), fs.createWriteStream(destPath))
      )
    );
  },

  async restore(conn, srcPath) {
    // Whatever database the archive came from, restore into conn.database
    // ($db$/$coll$ are mongorestore's namespace variables). --drop replaces
    // each collection that's in the backup; collections that aren't in it
    // are left alone. --stopOnError makes a failed insert fail the restore
    // instead of being logged and skipped.
    checkDatabaseName(conn.database);
    await withConfigFile(conn, (config) =>
      runTool(
        MONGORESTORE_BIN,
        [
          `--config=${config}`,
          "--archive",
          "--drop",
          "--stopOnError",
          "--nsFrom=$db$.$coll$",
          `--nsTo=${conn.database}.$coll$`,
        ],
        "mongorestore",
        "MONGORESTORE_PATH",
        (proc) => pipeline(fs.createReadStream(srcPath), createGunzip(), proc.stdin!)
      )
    );
  },

  async testConnection(conn) {
    try {
      checkDatabaseName(conn.database);
      await withClient(conn, async (client) => {
        const db = client.db(conn.database);
        await db.command({ ping: 1 });
        // Listing collections needs the same read access a backup does.
        await db.listCollections({}, { nameOnly: true }).toArray();
      });
      return { ok: true };
    } catch (err: any) {
      return { ok: false, message: String(err?.message ?? err).slice(0, 500) };
    }
  },

  createScanner: mongoArchiveScanner,

  scratch: {
    // MongoDB creates a database on first write, so there's nothing to do
    // until the restore writes into it.
    async create(_server, name) {
      checkDatabaseName(name);
    },
    async drop(server, name) {
      checkDatabaseName(name);
      await withClient(server, (client) => client.db(name).dropDatabase());
    },
    async list(server, prefix) {
      return withClient(server, async (client) => {
        const { databases } = await client.db("admin").admin().listDatabases({ nameOnly: true });
        return databases.map((d) => d.name).filter((n) => n.startsWith(prefix));
      });
    },
    async countTables(conn) {
      return withClient(conn, async (client) => {
        const colls = await client.db(conn.database).listCollections({ type: "collection" }, { nameOnly: true }).toArray();
        return colls.filter((c) => !c.name.startsWith("system.")).length;
      });
    },
  },
};

// --- Checking an archive ---
//
// The mongodump archive format (mongo-tools, common/archive):
//
//   magic number            uint32 LE 0x8199e26d
//   prelude                 BSON header {version, server_version, ...}
//                           one BSON doc per namespace {db, collection, metadata, size, type}
//                           terminator
//   body, repeated          BSON namespace header {db, collection, EOF: false}
//                           that namespace's documents (raw BSON)
//                           terminator
//   and per namespace once  BSON namespace header {db, collection, EOF: true, CRC}
//                           terminator
//
// where a terminator is the int32 -1 (0xFFFFFFFF). A complete archive ends
// on a terminator, has no namespace left open, and has an EOF header for
// every namespace its prelude lists. Documents are skipped, not buffered,
// so a large archive streams through in constant memory.

const MAGIC = 0x8199e26d;
const TERMINATOR = -1;
// BSON documents are at most 16 MB; anything far larger means the length
// we read isn't a real length, i.e. the file is damaged.
const MAX_DOC = 48 * 1024 * 1024;

function mongoArchiveScanner(): DumpScanner {
  const queue: Buffer[] = [];
  let queued = 0;
  let skipping = 0;
  let bytes = 0;

  let stage: "magic" | "header" | "prelude" | "body" = "magic";
  let nextIsNamespaceHeader = true;
  let endedOnTerminator = false;
  let error: string | undefined;
  let preludeNamespaces = 0;
  let collections = 0;
  const open = new Set<string>();
  const finished = new Set<string>();

  // Removes and returns the first n queued bytes (only once they're all there).
  const take = (n: number): Buffer => {
    const all = queue.length === 1 ? queue[0] : Buffer.concat(queue, queued);
    queue.length = 0;
    const out = all.subarray(0, n);
    if (all.length > n) queue.push(all.subarray(n));
    queued -= n;
    return out;
  };
  // Reads the next int32 without consuming it (needs queued >= 4).
  const peekInt32 = (): number => {
    if (queue[0].length < 4) {
      const all = Buffer.concat(queue, queued);
      queue.length = 0;
      queue.push(all);
    }
    return queue[0].readInt32LE(0);
  };
  const discard = () => {
    while (skipping > 0 && queue.length) {
      const first = queue[0];
      if (first.length <= skipping) {
        skipping -= first.length;
        queued -= first.length;
        queue.shift();
      } else {
        queue[0] = first.subarray(skipping);
        queued -= skipping;
        skipping = 0;
      }
    }
  };

  const parse = () => {
    for (;;) {
      if (error) return;
      discard();
      if (skipping > 0 || queued < 4) return;

      if (stage === "magic") {
        if (take(4).readUInt32LE(0) !== MAGIC) {
          error = "it isn't a mongodump archive";
          return;
        }
        stage = "header";
        continue;
      }

      const length = peekInt32();
      if (length === TERMINATOR) {
        take(4);
        endedOnTerminator = true;
        if (stage === "header") {
          error = "its header is missing";
          return;
        }
        if (stage === "prelude") stage = "body";
        nextIsNamespaceHeader = true;
        continue;
      }
      if (length < 5 || length > MAX_DOC) {
        error = "it's damaged (a document has an impossible length)";
        return;
      }
      endedOnTerminator = false;

      const wanted = stage === "body" && !nextIsNamespaceHeader ? 4 : length;
      if (queued < wanted) return;

      if (stage === "body" && !nextIsNamespaceHeader) {
        // A data document: skip it.
        take(4);
        skipping = length - 4;
        continue;
      }

      const doc = take(length);
      let fields: Record<string, unknown>;
      try {
        fields = BSON.deserialize(doc);
      } catch {
        error = "it's damaged (a header can't be read)";
        return;
      }

      if (stage === "header") {
        stage = "prelude";
      } else if (stage === "prelude") {
        preludeNamespaces++;
        if (fields.type !== "view") collections++;
      } else {
        const ns = `${fields.db}.${fields.collection}`;
        if (fields.EOF === true) {
          open.delete(ns);
          finished.add(ns);
        } else {
          open.add(ns);
        }
        nextIsNamespaceHeader = false;
      }
    }
  };

  const sink = new Writable({
    write(chunk: Buffer, _enc, cb) {
      bytes += chunk.length;
      queue.push(chunk);
      queued += chunk.length;
      parse();
      cb();
    },
  });

  return {
    sink,
    result() {
      let problem = error;
      if (!problem && stage !== "body") problem = "it ends before its list of collections";
      else if (!problem && (queued > 0 || skipping > 0 || !endedOnTerminator)) problem = "it ends partway through a document, so it was probably cut short";
      else if (!problem && open.size > 0) problem = `it ends before ${[...open][0]} was finished, so it was probably cut short`;
      else if (!problem && finished.size < preludeNamespaces)
        problem = `only ${finished.size} of its ${preludeNamespaces} collections were finished, so it was probably cut short`;
      return { complete: !problem, objects: collections, bytes, problem };
    },
  };
}
