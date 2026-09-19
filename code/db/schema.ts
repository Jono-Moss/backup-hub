import {
  mysqlTable,
  varchar,
  int,
  boolean,
  timestamp,
  bigint,
  json,
  text,
  mysqlEnum,
  index,
} from "drizzle-orm/mysql-core";

export const ENGINES = ["mysql", "postgres"] as const;
export type Engine = (typeof ENGINES)[number];

export const RUN_STATUSES = ["running", "completed", "failed"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const RUN_TRIGGERS = ["cron", "manual", "api"] as const;
export type RunTrigger = (typeof RUN_TRIGGERS)[number];

export const SCOPES = [
  "tasks:read",
  "tasks:write",
  "runs:trigger",
  "runs:download",
  "runs:delete",
] as const;
export type Scope = (typeof SCOPES)[number];

// A backup task owns everything needed to back up one database:
// connection details, schedule, retention, and optional encryption.
export const backupTask = mysqlTable("backup_task", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  engine: mysqlEnum("engine", ENGINES).notNull(),

  // AES-256-GCM encrypted JSON: { host, port, user, password, database, ssl }
  // Encrypted with BACKUP_MASTER_KEY — never stored or logged in plaintext.
  encryptedConnection: varchar("encrypted_connection", { length: 4096 }).notNull(),

  cronExpression: varchar("cron_expression", { length: 64 }).notNull().default("0 3 * * *"),
  retentionCount: int("retention_count").notNull().default(7),

  encryptionEnabled: boolean("encryption_enabled").notNull().default(false),
  encryptedBackupPassword: varchar("encrypted_backup_password", { length: 512 }),

  enabled: boolean("enabled").notNull().default(true),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

// One row per backup attempt (successful or not) for a task.
export const backupRun = mysqlTable(
  "backup_run",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    taskId: varchar("task_id", { length: 36 }).notNull(),

    filename: varchar("filename", { length: 255 }),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    encrypted: boolean("encrypted").notNull().default(false),

    status: mysqlEnum("status", RUN_STATUSES).notNull().default("running"),
    errorMessage: varchar("error_message", { length: 2048 }),
    triggeredBy: mysqlEnum("triggered_by", RUN_TRIGGERS).notNull().default("cron"),

    startedAt: timestamp("started_at").defaultNow().notNull(),
    finishedAt: timestamp("finished_at"),
  },
  (table) => ({
    taskIdx: index("backup_run_task_idx").on(table.taskId),
  })
);

// API keys for the external REST API. Only the SHA-256 hash is stored;
// the raw key is shown once at creation time, same pattern as
// Stripe/GitHub tokens. Scopes gate which endpoints the key can hit.
// An optional taskId pins the key to a single task.
export const apiKey = mysqlTable("api_key", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  hashedKey: varchar("hashed_key", { length: 64 }).notNull(),
  keyPrefix: varchar("key_prefix", { length: 16 }).notNull(),
  scopes: json("scopes").$type<Scope[]>().notNull(),
  taskId: varchar("task_id", { length: 36 }),

  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  revokedAt: timestamp("revoked_at"),
});

// --- Users & sessions ---

export const ROLES = ["admin", "user"] as const;
export type Role = (typeof ROLES)[number];

// `admin` has full permissions everywhere, including user management.
// `user` can manage tasks, API keys, and task notification recipients, but
// cannot see /users and can only change their own password.
export const appUser = mysqlTable("app_user", {
  id: varchar("id", { length: 36 }).primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),

  // Argon2id hash (see lib/auth/password.ts) — never plaintext, never logged.
  hashedPassword: varchar("hashed_password", { length: 255 }).notNull(),
  role: mysqlEnum("role", ROLES).notNull().default("user"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

// DB-backed sessions rather than a signed-only cookie, so sessions can be
// listed/expired/revoked server-side. Only the SHA-256 hash of the session
// token is stored; the raw token lives in the httpOnly cookie.
//
// twoFactorVerified defaults to true so a login that doesn't require a
// second factor is immediately usable. When a password login belongs to a
// user with TOTP enabled, the session row is created with this set to
// false — getCurrentUser() (and proxy.ts) treat that as "not logged in yet"
// until /login/2fa flips it to true. Passkey logins always create a session
// with this already true, since a passkey is itself phishing-resistant MFA.
export const session = mysqlTable(
  "session",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 }).notNull(),
    hashedToken: varchar("hashed_token", { length: 64 }).notNull(),
    twoFactorVerified: boolean("two_factor_verified").notNull().default(true),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("session_user_idx").on(table.userId),
  })
);

// --- Two-factor authentication (TOTP) ---

// One row per user, created (disabled) at the start of enrollment and
// flipped to enabled once they prove they can generate a valid code.
export const userTotp = mysqlTable("user_totp", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 }).notNull().unique(),
  // AES-256-GCM wrapped base32 secret (see lib/backup/crypto.ts wrapSecret) —
  // encrypted with BACKUP_MASTER_KEY, same as DB connection credentials.
  encryptedSecret: varchar("encrypted_secret", { length: 512 }).notNull(),
  enabled: boolean("enabled").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  verifiedAt: timestamp("verified_at"),
});

// Single-use backup codes, issued as a batch when TOTP is first enabled.
// Only the hash of each code is stored; codes are shown once at generation.
export const userRecoveryCode = mysqlTable(
  "user_recovery_code",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 }).notNull(),
    codeHash: varchar("code_hash", { length: 64 }).notNull(),
    usedAt: timestamp("used_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("user_recovery_code_user_idx").on(table.userId),
  })
);

// --- Passkeys (WebAuthn) ---

export const userPasskey = mysqlTable(
  "user_passkey",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 }).notNull(),
    // User-given label ("MacBook Touch ID", "YubiKey"), not a security
    // boundary — purely so /account is legible with more than one passkey.
    name: varchar("name", { length: 255 }).notNull().default("Passkey"),
    // Base64url credential ID, as returned by the authenticator — globally
    // unique per credential, used to look up which passkey signed in.
    credentialId: varchar("credential_id", { length: 255 }).notNull().unique(),
    // Base64url-encoded COSE public key bytes. `text` rather than a fixed
    // varchar so RSA-derived keys (larger than EC/Ed25519) are never at
    // risk of truncation.
    publicKey: text("public_key").notNull(),
    // Signature counter reported by the authenticator. Must be persisted
    // and checked on every use — a counter that goes backwards is the
    // standard signal a credential has been cloned.
    counter: bigint("counter", { mode: "number" }).notNull().default(0),
    deviceType: varchar("device_type", { length: 32 }),
    backedUp: boolean("backed_up").notNull().default(false),
    transports: json("transports").$type<string[]>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    lastUsedAt: timestamp("last_used_at"),
  },
  (table) => ({
    userIdx: index("user_passkey_user_idx").on(table.userId),
  })
);

// --- Notifications ---

// Events that can trigger an email for a specific backup task.
export const TASK_NOTIFICATION_EVENTS = ["success", "failure"] as const;
export type TaskNotificationEvent = (typeof TASK_NOTIFICATION_EVENTS)[number];

export const taskNotificationRecipient = mysqlTable(
  "task_notification_recipient",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    taskId: varchar("task_id", { length: 36 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    notifyOnSuccess: boolean("notify_on_success").notNull().default(false),
    notifyOnFailure: boolean("notify_on_failure").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    taskIdx: index("task_notification_recipient_task_idx").on(table.taskId),
  })
);

// System-wide events, unrelated to any single task — account activity and
// task lifecycle changes. Admin-managed, not tied to a task.
export const SYSTEM_NOTIFICATION_EVENTS = [
  "user_login",
  "user_created",
  "user_deleted",
  "task_created",
  "task_deleted",
  "security_reset",
] as const;
export type SystemNotificationEvent = (typeof SYSTEM_NOTIFICATION_EVENTS)[number];

export const systemNotificationRecipient = mysqlTable("system_notification_recipient", {
  id: varchar("id", { length: 36 }).primaryKey(),
  email: varchar("email", { length: 255 }).notNull(),
  events: json("events").$type<SystemNotificationEvent[]>().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
