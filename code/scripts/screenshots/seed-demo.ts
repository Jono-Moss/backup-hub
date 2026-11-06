// Fills a DEMO database with realistic sample data for the README screenshots.
// It empties every table first, so it refuses to run unless the database
// name contains "demo". See scripts/screenshots/README.md.
//
//   APP_DATABASE_URL="mysql://…/backup_hub_demo" npx tsx scripts/screenshots/seed-demo.ts
//
// Writes the session token for the demo admin (Jane Doe) to
// scripts/screenshots/.demo-session, which capture.cjs uses to sign in.

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  appUser,
  apiKey,
  backupDestination,
  backupRun,
  backupRunUpload,
  backupTask,
  loginAttempt,
  notificationChannel,
  session,
  systemNotificationRecipient,
  taskDestination,
  taskNotificationRecipient,
  taskShare,
  userPasskey,
  userRecoveryCode,
  userTotp,
  type Scope,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { hashSessionToken } from "@/lib/auth/token-hash";
import { wrapConnection, wrapSecret, generateApiKey } from "@/lib/backup/crypto";

const dbName = new URL(process.env.APP_DATABASE_URL ?? "").pathname.slice(1);
if (!/demo/i.test(dbName)) {
  console.error(`Refusing to seed "${dbName}": the database name must contain "demo" (this script empties every table).`);
  process.exit(1);
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const now = Date.now();
const ago = (ms: number) => new Date(now - ms);

// Documentation-only IP ranges (RFC 5737), so no real address appears.
const HOME_IP = "203.0.113.24";
const OFFICE_IP = "192.0.2.10";
const STRANGER_IP = "198.51.100.77";
const UA_MAC_CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const UA_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const UA_LINUX_FIREFOX = "Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0";
const UA_WINDOWS_FIREFOX = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0";

async function main() {
  // --- wipe (demo database only — checked above)
  const tables = [
    backupRunUpload, backupRun, taskDestination, backupDestination, taskNotificationRecipient, notificationChannel,
    taskShare, apiKey, backupTask, session, loginAttempt, userPasskey, userRecoveryCode, userTotp,
    systemNotificationRecipient, appUser,
  ];
  for (const t of tables) await db.delete(t);

  // --- users
  const password = await hashPassword("demo-password-123");
  const jane = uuid();
  const sam = uuid();
  const alex = uuid();
  await db.insert(appUser).values([
    { id: jane, email: "jane@example.com", name: "Jane Doe", hashedPassword: password, role: "admin" },
    { id: sam, email: "sam@example.com", name: "Sam Patel", hashedPassword: password, role: "user" },
    { id: alex, email: "alex@example.com", name: "Alex Kim", hashedPassword: password, role: "user" },
  ]);

  // Jane: authenticator app + recovery codes + two passkeys
  await db.insert(userTotp).values({
    id: uuid(),
    userId: jane,
    encryptedSecret: wrapSecret("JBSWY3DPEHPK3PXP"),
    enabled: true,
    verifiedAt: ago(40 * DAY),
  });
  await db.insert(userRecoveryCode).values(
    Array.from({ length: 10 }, (_, i) => ({
      id: uuid(),
      userId: jane,
      codeHash: crypto.randomBytes(32).toString("hex"),
      usedAt: i < 2 ? ago(20 * DAY) : null,
    }))
  );
  await db.insert(userPasskey).values([
    { id: uuid(), userId: jane, name: "MacBook Touch ID", credentialId: crypto.randomBytes(16).toString("base64url"), publicKey: "demo", createdAt: ago(60 * DAY), lastUsedAt: ago(3 * DAY) },
    { id: uuid(), userId: jane, name: "YubiKey 5C", credentialId: crypto.randomBytes(16).toString("base64url"), publicKey: "demo", createdAt: ago(45 * DAY), lastUsedAt: null },
  ]);

  // --- tasks
  const conn = (engine: "mysql" | "postgres", host: string, database: string) =>
    wrapConnection({ host, port: engine === "mysql" ? 3306 : 5432, user: "backup", password: "demo", database, ssl: false });
  const shop = uuid();
  const crm = uuid();
  const analytics = uuid();
  const blog = uuid();
  const invoices = uuid();
  await db.insert(backupTask).values([
    { id: shop, ownerId: jane, name: "Shop database", engine: "mysql", encryptedConnection: conn("mysql", "db.shop.internal", "shop"), cronExpression: "0 3 * * *", retentionCount: 14, encryptionEnabled: true, encryptedBackupPassword: wrapSecret("demo"), testRestoreAfterBackup: true, createdAt: ago(90 * DAY) },
    { id: crm, ownerId: jane, name: "Customer CRM", engine: "postgres", encryptedConnection: conn("postgres", "crm-db.internal", "crm"), cronExpression: "0 */6 * * *", retentionCount: 20, createdAt: ago(80 * DAY) },
    { id: analytics, ownerId: jane, name: "Analytics warehouse", engine: "postgres", encryptedConnection: conn("postgres", "warehouse.internal", "analytics"), cronExpression: "0 2 * * *", retentionCount: 7, encryptionEnabled: true, encryptedBackupPassword: wrapSecret("demo"), createdAt: ago(70 * DAY) },
    { id: blog, ownerId: jane, name: "Staging blog", engine: "mysql", encryptedConnection: conn("mysql", "staging.internal", "blog"), cronExpression: "30 1 * * 1", retentionCount: 3, enabled: false, createdAt: ago(60 * DAY) },
    { id: invoices, ownerId: sam, name: "Invoices", engine: "mysql", encryptedConnection: conn("mysql", "finance.internal", "invoices"), cronExpression: "0 4 * * *", retentionCount: 30, createdAt: ago(50 * DAY) },
  ]);

  // --- save locations
  const nas = uuid();
  const b2 = uuid();
  const r2 = uuid();
  const dest = (id: string, ownerId: string, taskId: string | null, type: "sftp" | "s3", label: string, config: Record<string, string>) => ({
    id, ownerId, createdBy: ownerId, taskId, type, label, encryptedConfig: wrapSecret(JSON.stringify(config)),
  });
  await db.insert(backupDestination).values([
    dest(nas, jane, null, "sftp", "Home NAS", { host: "nas.home.internal", port: "22", username: "backup", password: "demo", remoteDir: "backups" }),
    dest(b2, jane, null, "s3", "Backblaze B2", { bucket: "jane-backups", region: "us-west-004", accessKeyId: "demo", secretAccessKey: "demo", endpoint: "https://s3.us-west-004.backblazeb2.com", forcePathStyle: "true" }),
    dest(r2, jane, analytics, "s3", "Warehouse archive (R2)", { bucket: "warehouse-archive", region: "auto", accessKeyId: "demo", secretAccessKey: "demo", endpoint: "https://demo.r2.cloudflarestorage.com" }),
  ]);
  await db.insert(taskDestination).values([
    { id: uuid(), taskId: shop, destinationId: nas, subfolder: "Shop database" },
    { id: uuid(), taskId: shop, destinationId: b2, subfolder: "shop" },
    { id: uuid(), taskId: crm, destinationId: b2, subfolder: "crm" },
    { id: uuid(), taskId: analytics, destinationId: r2, subfolder: null },
  ]);

  // --- runs
  const runs: (typeof backupRun.$inferInsert)[] = [];
  const uploads: (typeof backupRunUpload.$inferInsert)[] = [];
  const file = (name: string, at: Date, encrypted: boolean) =>
    `${name.replace(/\s+/g, "-")}-${at.toISOString().replace(/[:.]/g, "-")}.sql.gz${encrypted ? ".enc" : ""}`;

  function addRun(
    taskId: string,
    name: string,
    at: Date,
    opts: {
      encrypted?: boolean;
      size?: number;
      failed?: string;
      trigger?: "cron" | "manual";
      verify?: "check" | "restore" | "failed";
      uploads?: { id: string; label: string; failed?: string }[];
    }
  ) {
    const id = uuid();
    const failed = Boolean(opts.failed);
    runs.push({
      id,
      taskId,
      filename: failed ? null : file(name, at, !!opts.encrypted),
      sizeBytes: failed ? null : opts.size,
      encrypted: !!opts.encrypted,
      status: failed ? "failed" : "completed",
      errorMessage: opts.failed ?? null,
      triggeredBy: opts.trigger ?? "cron",
      startedAt: at,
      finishedAt: new Date(at.getTime() + 4 * 60 * 1000),
      verifyStatus: failed ? null : opts.verify === "failed" ? "failed" : "passed",
      verifyLevel: failed ? null : opts.verify === "restore" ? "restore" : "check",
      verifyMessage: opts.verify === "failed" ? "The file ends early: the dump-completed marker is missing." : null,
      verifiedAt: failed ? null : new Date(at.getTime() + 6 * 60 * 1000),
    });
    if (!failed) {
      for (const u of opts.uploads ?? []) {
        uploads.push({
          id: uuid(),
          runId: id,
          destinationId: u.id,
          destinationLabel: u.label,
          status: u.failed ? "failed" : "completed",
          errorMessage: u.failed ?? null,
          remotePath: u.failed ? null : `${u.label}/${file(name, at, !!opts.encrypted)}`,
          startedAt: new Date(at.getTime() + 5 * 60 * 1000),
          finishedAt: new Date(at.getTime() + 7 * 60 * 1000),
        });
      }
    }
  }

  const at3am = (daysAgo: number) => {
    const d = new Date(now - daysAgo * DAY);
    d.setUTCHours(3, 0, 4, 0);
    return d;
  };

  // Shop database: daily, plus a manual run today. One failure, one NAS hiccup.
  const shopUploads = [
    { id: nas, label: "Home NAS" },
    { id: b2, label: "Backblaze B2" },
  ];
  addRun(shop, "Shop database", ago(2 * HOUR), { encrypted: true, size: 512_400_000, trigger: "manual", verify: "restore", uploads: shopUploads });
  for (let d = 0; d < 13; d++) {
    const at = at3am(d);
    if (at.getTime() > now) continue;
    if (d === 4) {
      addRun(shop, "Shop database", at, { failed: "mysqldump: Got error: 2013: Lost connection to MySQL server during query when dumping table `orders` at row: 1048211" });
      continue;
    }
    addRun(shop, "Shop database", at, {
      encrypted: true,
      size: 510_000_000 - d * 2_100_000,
      verify: d === 0 ? "restore" : "check",
      uploads: d === 2 ? [{ id: nas, label: "Home NAS", failed: "connect ETIMEDOUT nas.home.internal:22" }, shopUploads[1]] : shopUploads,
    });
  }

  // Customer CRM: every 6 hours; Backblaze rejected the latest upload (expired key).
  for (let i = 0; i < 14; i++) {
    const at = new Date(Math.floor((now - i * 6 * HOUR) / (6 * HOUR)) * 6 * HOUR + 4000);
    addRun(crm, "Customer CRM", at, {
      size: 86_000_000 - i * 150_000,
      uploads: [{ id: b2, label: "Backblaze B2", failed: i === 0 ? "403 Forbidden: InvalidAccessKeyId — The key 'demo' is not valid" : undefined }],
    });
  }

  // Analytics warehouse: the database password was changed, so the last two runs failed.
  for (let d = 0; d < 9; d++) {
    const at = new Date(at3am(d).getTime() - HOUR);
    if (at.getTime() > now) continue;
    if (d < 2) {
      addRun(analytics, "Analytics warehouse", at, { failed: 'pg_dump: error: connection to server at "warehouse.internal" (10.0.4.12), port 5432 failed: FATAL:  password authentication failed for user "backup"' });
    } else {
      addRun(analytics, "Analytics warehouse", at, { encrypted: true, size: 2_140_000_000 + d * 9_000_000, uploads: [{ id: r2, label: "Warehouse archive (R2)" }] });
    }
  }

  // Staging blog: paused a while ago.
  for (let w = 3; w < 6; w++) addRun(blog, "Staging blog", ago(w * 7 * DAY), { size: 12_300_000 });

  // Sam's invoices, shared with Jane.
  for (let d = 0; d < 6; d++) {
    const at = new Date(at3am(d).getTime() + HOUR);
    if (at.getTime() <= now) addRun(invoices, "Invoices", at, { size: 41_000_000 + d * 80_000 });
  }

  await db.insert(backupRun).values(runs);
  if (uploads.length) await db.insert(backupRunUpload).values(uploads);

  // --- notification channels
  const discord = uuid();
  const ntfy = uuid();
  const email = uuid();
  const telegram = uuid();
  await db.insert(notificationChannel).values([
    { id: discord, ownerId: jane, createdBy: jane, taskId: null, label: "Ops Discord", channel: "discord", email: null, encryptedConfig: wrapSecret(JSON.stringify({ webhookUrl: "https://discord.com/api/webhooks/demo" })) },
    { id: ntfy, ownerId: jane, createdBy: jane, taskId: null, label: "On-call ntfy", channel: "ntfy", email: null, encryptedConfig: wrapSecret(JSON.stringify({ serverUrl: "https://ntfy.sh", topic: "jane-backups-7f3k" })) },
    { id: email, ownerId: jane, createdBy: jane, taskId: null, label: "ops@example.com", channel: "email", email: "ops@example.com", encryptedConfig: null },
    { id: telegram, ownerId: jane, createdBy: jane, taskId: shop, label: "Shop Telegram", channel: "telegram", email: null, encryptedConfig: wrapSecret(JSON.stringify({ botToken: "demo", chatId: "-1001234567890" })) },
  ]);
  await db.insert(taskNotificationRecipient).values([
    { id: uuid(), taskId: shop, channelId: discord, notifyOnSuccess: false, notifyOnFailure: true },
    { id: uuid(), taskId: shop, channelId: email, notifyOnSuccess: true, notifyOnFailure: true },
    { id: uuid(), taskId: shop, channelId: telegram, notifyOnSuccess: false, notifyOnFailure: true },
    { id: uuid(), taskId: crm, channelId: discord, notifyOnSuccess: false, notifyOnFailure: true },
    { id: uuid(), taskId: analytics, channelId: ntfy, notifyOnSuccess: false, notifyOnFailure: true },
  ]);
  await db.insert(systemNotificationRecipient).values([
    { id: uuid(), channel: "email", email: "admin@example.com", encryptedConfig: null, events: ["user_created", "user_deleted", "security_reset"] },
    { id: uuid(), channel: "discord", email: null, encryptedConfig: wrapSecret(JSON.stringify({ webhookUrl: "https://discord.com/api/webhooks/demo" })), events: ["user_login", "task_created", "task_deleted"] },
  ]);

  // --- sharing
  const scopes = (...s: Scope[]) => s;
  await db.insert(taskShare).values([
    { id: uuid(), taskId: shop, userId: sam, scopes: scopes("tasks:read", "tasks:write", "runs:trigger") },
    { id: uuid(), taskId: shop, userId: alex, scopes: scopes("tasks:read", "runs:download") },
    { id: uuid(), taskId: invoices, userId: jane, scopes: scopes("tasks:read", "runs:trigger", "runs:download") },
  ]);

  // --- API keys
  const k1 = generateApiKey();
  const k2 = generateApiKey();
  await db.insert(apiKey).values([
    { id: uuid(), userId: jane, name: "Grafana exporter", hashedKey: k1.hashed, keyPrefix: k1.prefix, scopes: scopes("tasks:read"), lastUsedAt: ago(20 * 60 * 1000), createdAt: ago(30 * DAY) },
    { id: uuid(), userId: jane, name: "CI pipeline", hashedKey: k2.hashed, keyPrefix: k2.prefix, scopes: scopes("tasks:read", "runs:trigger"), taskId: shop, lastUsedAt: ago(DAY), createdAt: ago(25 * DAY) },
  ]);

  // --- sign-in history (Jane, plus some noise for the admin view)
  const attempt = (at: Date, outcome: (typeof loginAttempt.$inferInsert)["outcome"], method: (typeof loginAttempt.$inferInsert)["method"], ip: string, ua: string, userId: string | null = jane, mail: string | null = "jane@example.com") =>
    ({ id: uuid(), userId, email: mail, method, outcome, ipAddress: ip, userAgent: ua, createdAt: at });
  await db.insert(loginAttempt).values([
    attempt(ago(9 * DAY), "success", "passkey", HOME_IP, UA_MAC_CHROME),
    attempt(ago(5 * DAY), "success", "totp", OFFICE_IP, UA_LINUX_FIREFOX),
    attempt(ago(2 * DAY), "success", "passkey", HOME_IP, UA_IPHONE),
    attempt(ago(26 * HOUR), "bad_password", "password", STRANGER_IP, UA_WINDOWS_FIREFOX),
    attempt(ago(26 * HOUR - 40_000), "bad_password", "password", STRANGER_IP, UA_WINDOWS_FIREFOX),
    attempt(ago(26 * HOUR - 80_000), "locked_out", "password", STRANGER_IP, UA_WINDOWS_FIREFOX),
    attempt(ago(30 * 60 * 1000), "success", "passkey", HOME_IP, UA_MAC_CHROME),
    attempt(ago(3 * DAY), "unknown_user", "password", STRANGER_IP, UA_WINDOWS_FIREFOX, null, "admin@example.com"),
    attempt(ago(3 * DAY - 60_000), "unknown_user", "password", STRANGER_IP, UA_WINDOWS_FIREFOX, null, "root@example.com"),
    attempt(ago(4 * DAY), "bad_password", "password", OFFICE_IP, UA_LINUX_FIREFOX, sam, "sam@example.com"),
  ]);

  // --- sessions: this browser (used by capture.cjs), Jane's phone, and an office session whose IP changed
  const token = crypto.randomBytes(32).toString("hex");
  const week = 7 * DAY;
  await db.insert(session).values([
    { id: uuid(), userId: jane, hashedToken: hashSessionToken(token), twoFactorVerified: true, expiresAt: new Date(now + week), createdAt: ago(30 * 60 * 1000), createdIp: HOME_IP, userAgent: UA_MAC_CHROME, lastSeenAt: new Date(now), lastSeenIp: HOME_IP },
    { id: uuid(), userId: jane, hashedToken: hashSessionToken(crypto.randomBytes(32).toString("hex")), twoFactorVerified: true, expiresAt: new Date(now + week - 2 * DAY), createdAt: ago(2 * DAY), createdIp: HOME_IP, userAgent: UA_IPHONE, lastSeenAt: ago(5 * HOUR), lastSeenIp: HOME_IP },
    { id: uuid(), userId: jane, hashedToken: hashSessionToken(crypto.randomBytes(32).toString("hex")), twoFactorVerified: true, expiresAt: new Date(now + week - 5 * DAY), createdAt: ago(5 * DAY), createdIp: OFFICE_IP, userAgent: UA_LINUX_FIREFOX, lastSeenAt: ago(26 * HOUR), lastSeenIp: STRANGER_IP },
  ]);

  const out = path.join(process.cwd(), "scripts/screenshots/.demo-session");
  fs.writeFileSync(out, JSON.stringify({ token, shopTaskId: shop, janeId: jane, samId: sam }, null, 2));
  console.log(`Seeded ${dbName}: 3 users, 5 tasks, ${runs.length} runs. Session written to ${out}`);
  await db.execute(sql`select 1`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
