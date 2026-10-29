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
  uniqueIndex,
} from "drizzle-orm/mysql-core";

export const ENGINES = ["mysql", "postgres"] as const;
export type Engine = (typeof ENGINES)[number];

export const RUN_STATUSES = ["running", "completed", "failed"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const RUN_TRIGGERS = ["cron", "manual", "api"] as const;
export type RunTrigger = (typeof RUN_TRIGGERS)[number];

// Backup file checks (lib/backup/verify.ts). "check" = fingerprint + read
// the whole file back (decrypt, decompress, dump-completed marker);
// "restore" = all of that plus a test restore into a throwaway database.
export const VERIFY_STATUSES = ["queued", "running", "passed", "failed"] as const;
export type VerifyStatus = (typeof VERIFY_STATUSES)[number];
export const VERIFY_LEVELS = ["check", "restore"] as const;
export type VerifyLevel = (typeof VERIFY_LEVELS)[number];

// Remote storage destinations a completed backup file can be copied to, in
// addition to the local copy on BACKUP_DIR (local storage is always kept —
// a destination is an *extra* off-site copy, never a replacement). Adding a
// new provider means implementing BackupDestination (lib/backup/destinations/types.ts)
// and registering it in lib/backup/destinations/index.ts; nothing else here
// needs to change since the config form is generated from configFields.
export const DESTINATION_TYPES = ["s3", "google_drive", "onedrive", "email", "opencloud", "ftp", "ftps", "sftp"] as const;
export type DestinationType = (typeof DESTINATION_TYPES)[number];

// "skipped" = the destination deliberately did nothing (e.g. the email
// destination when the file is over its size limit) — not an error.
export const DESTINATION_UPLOAD_STATUSES = ["uploading", "completed", "failed", "skipped"] as const;
export type DestinationUploadStatus = (typeof DESTINATION_UPLOAD_STATUSES)[number];

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
//
// Every task belongs to exactly one user (ownerId). The owner has every
// permission on it; anyone else only has what the owner granted them in
// `task_share` below. Admins get no special access to tasks.
export const backupTask = mysqlTable(
  "backup_task",
  {
  id: varchar("id", { length: 36 }).primaryKey(),
  ownerId: varchar("owner_id", { length: 36 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  engine: mysqlEnum("engine", ENGINES).notNull(),

  // AES-256-GCM encrypted JSON: { host, port, user, password, database, ssl }
  // Encrypted with BACKUP_MASTER_KEY — never stored or logged in plaintext.
  encryptedConnection: varchar("encrypted_connection", { length: 4096 }).notNull(),

  cronExpression: varchar("cron_expression", { length: 64 }).notNull().default("0 3 * * *"),
  retentionCount: int("retention_count").notNull().default(7),

  encryptionEnabled: boolean("encryption_enabled").notNull().default(false),
  encryptedBackupPassword: varchar("encrypted_backup_password", { length: 512 }),

  // Also test-restore every new backup into a throwaway database on the
  // admin-configured scratch server (VERIFY_MYSQL_URL / VERIFY_POSTGRES_URL).
  testRestoreAfterBackup: boolean("test_restore_after_backup").notNull().default(false),

  enabled: boolean("enabled").notNull().default(true),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    ownerIdx: index("backup_task_owner_idx").on(table.ownerId),
  })
);

// Grants another user a subset of permissions on someone else's task. The
// permissions are the same scopes API keys use, so the UI and the API speak
// one vocabulary. The owner is never listed here — ownership implies all
// scopes. Restoring a backup into the source database is deliberately not a
// scope: it is owner-only.
export const taskShare = mysqlTable(
  "task_share",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    taskId: varchar("task_id", { length: 36 }).notNull(),
    userId: varchar("user_id", { length: 36 }).notNull(),
    scopes: json("scopes").$type<Scope[]>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    taskUserIdx: uniqueIndex("task_share_task_user_idx").on(table.taskId, table.userId),
    userIdx: index("task_share_user_idx").on(table.userId),
  })
);

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

    // SHA-256 of the file as written, so a later check can tell if it has
    // changed on disk. NULL for backups made before this existed (the first
    // check records it).
    sha256: varchar("sha256", { length: 64 }),
    // For encrypted backups: a short value derived from the encryption key,
    // so a failed decrypt can be told apart as "the task's password has
    // changed since" vs "the file is damaged". Never sent to clients — it
    // would let someone test password guesses without the file.
    keyCheck: varchar("key_check", { length: 32 }),
    verifyStatus: mysqlEnum("verify_status", VERIFY_STATUSES),
    verifyLevel: mysqlEnum("verify_level", VERIFY_LEVELS),
    verifyMessage: varchar("verify_message", { length: 2048 }),
    verifiedAt: timestamp("verified_at"),
  },
  (table) => ({
    taskIdx: index("backup_run_task_idx").on(table.taskId),
  })
);

// A remote save location: provider + credentials, saved once. Tasks use it
// through `task_destination` links below; each completed run gets copied to
// every enabled link's destination, on top of the local copy that's always
// kept under BACKUP_DIR.
//
// Two scopes:
//   - account-level (taskId NULL): saved to the owner's account and offered
//     in the "use a saved location" picker on any of *their* tasks;
//   - task-only (taskId set): tied to that one task and never offered
//     anywhere else, so its credentials can't be reused even by the owner
//     without entering them again. Removing it from the task deletes it.
//
// ownerId is always the owner of the task it was added to (or the account
// it was saved to) — even when a shared "Manage tasks" user added it — so
// removing someone's share never leaves their items in limbo. createdBy
// records who actually entered the credentials: only they may edit one
// (or make a task-only one reusable), so a task owner can't repoint a
// shared user's credentials at a different server.
export const backupDestination = mysqlTable(
  "backup_destination",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    ownerId: varchar("owner_id", { length: 36 }).notNull(),
    // NULL = account-level, set = task-only for that task.
    taskId: varchar("task_id", { length: 36 }),
    createdBy: varchar("created_by", { length: 36 }).notNull(),
    type: mysqlEnum("type", DESTINATION_TYPES).notNull(),
    // User-given label ("Backblaze — offsite", "Shared Drive") so a task
    // with several destinations of the same type stays legible in the UI.
    label: varchar("label", { length: 255 }).notNull(),
    // AES-256-GCM encrypted JSON, shape defined per-type by that
    // destination's configFields (lib/backup/destinations/types.ts) —
    // access keys, refresh tokens, bucket/folder names, etc. Wrapped with
    // BACKUP_MASTER_KEY, same as DB connection credentials.
    // `text`, not varchar: SFTP private keys (RSA 4096 especially) push the
    // encrypted JSON past a few KB.
    encryptedConfig: text("encrypted_config").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    taskIdx: index("backup_destination_task_idx").on(table.taskId),
    ownerIdx: index("backup_destination_owner_idx").on(table.ownerId),
  })
);

// Which destinations a task copies its backups to. Per-task settings live
// here, not on the destination, so one saved location can be used by
// several tasks with different settings.
export const taskDestination = mysqlTable(
  "task_destination",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    taskId: varchar("task_id", { length: 36 }).notNull(),
    destinationId: varchar("destination_id", { length: 36 }).notNull(),
    enabled: boolean("enabled").notNull().default(true),
    // Appended to the destination's own folder/prefix for this task only, so
    // tasks sharing one saved location don't all land in the same folder.
    // Only for providers with a path-style folder (see BackupDestination.subfolderField).
    subfolder: varchar("subfolder", { length: 512 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    taskDestinationIdx: uniqueIndex("task_destination_task_destination_idx").on(table.taskId, table.destinationId),
    destinationIdx: index("task_destination_destination_idx").on(table.destinationId),
  })
);

// One row per (run, destination) upload attempt — a run with 2 enabled
// destinations gets 2 rows here. Kept separate from backupRun so a
// destination being slow/down never blocks marking the run itself
// "completed" (the local file is the source of truth for that), and so
// the UI can show per-destination status independently.
export const backupRunUpload = mysqlTable(
  "backup_run_upload",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    runId: varchar("run_id", { length: 36 }).notNull(),
    destinationId: varchar("destination_id", { length: 36 }).notNull(),
    // Copy of the destination's label at upload time, so run history still
    // reads sensibly after a saved location is renamed or deleted.
    destinationLabel: varchar("destination_label", { length: 255 }),
    status: mysqlEnum("status", DESTINATION_UPLOAD_STATUSES).notNull().default("uploading"),
    // Human-readable location the file ended up at (e.g. "s3://bucket/key",
    // a Drive file id, or a Graph item path) — shown in the UI, not parsed.
    remotePath: varchar("remote_path", { length: 1024 }),
    errorMessage: varchar("error_message", { length: 2048 }),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    finishedAt: timestamp("finished_at"),
  },
  (table) => ({
    runIdx: index("backup_run_upload_run_idx").on(table.runId),
    destinationIdx: index("backup_run_upload_destination_idx").on(table.destinationId),
  })
);

// API keys for the external REST API. Only the SHA-256 hash is stored;
// the raw key is shown once at creation time, same pattern as
// Stripe/GitHub tokens. Scopes gate which endpoints the key can hit.
// An optional taskId pins the key to a single task.
//
// A key acts as the user who created it (userId): its effective permission
// on a task is the key's scopes intersected with that user's own permission
// on the task. Sharing removed or reduced => the key loses that access too.
export const apiKey = mysqlTable(
  "api_key",
  {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  hashedKey: varchar("hashed_key", { length: 64 }).notNull(),
  keyPrefix: varchar("key_prefix", { length: 16 }).notNull(),
  scopes: json("scopes").$type<Scope[]>().notNull(),
  taskId: varchar("task_id", { length: 36 }),

  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  revokedAt: timestamp("revoked_at"),
  },
  (table) => ({
    userIdx: index("api_key_user_idx").on(table.userId),
  })
);

// --- Users & sessions ---

export const ROLES = ["admin", "user"] as const;
export type Role = (typeof ROLES)[number];

// `admin` manages users and system notifications. Admins have NO access to
// other users' tasks (they can only see how many tasks a user owns); a user
// must share a task with an admin for the admin to see it.
// `user` manages their own tasks and API keys, and can't see /users.
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

// How a recipient is reached. "email" uses the server's SMTP settings and
// the `email` column; the others are push services whose settings (topic,
// bot token, webhook URL — mostly secrets) live in `encryptedConfig`. See
// lib/notifications/channels/.
export const NOTIFICATION_CHANNELS = ["email", "ntfy", "telegram", "discord"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

// A saved way of reaching someone: a channel type plus its settings. Same
// ownership model as backup_destination (see the comment there):
//   - account-level (taskId NULL): offered in the "use a saved channel"
//     picker on any of the owner's tasks;
//   - task-only (taskId set): tied to that one task, never offered elsewhere,
//     deleted when removed from the task.
// ownerId is the task owner (or account owner); createdBy is whoever entered
// the settings — only they may edit it or make a task-only one reusable.
export const notificationChannel = mysqlTable(
  "notification_channel",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    ownerId: varchar("owner_id", { length: 36 }).notNull(),
    // NULL = account-level, set = task-only for that task.
    taskId: varchar("task_id", { length: 36 }),
    createdBy: varchar("created_by", { length: 36 }).notNull(),
    channel: mysqlEnum("channel", NOTIFICATION_CHANNELS).notNull(),
    label: varchar("label", { length: 255 }).notNull(),
    // Only set for the "email" channel.
    email: varchar("email", { length: 255 }),
    // AES-256-GCM encrypted JSON of the channel's fields (non-email channels only).
    encryptedConfig: text("encrypted_config"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    ownerIdx: index("notification_channel_owner_idx").on(table.ownerId),
    taskIdx: index("notification_channel_task_idx").on(table.taskId),
  })
);

// A task's use of a notification channel, and which outcomes it's sent.
export const taskNotificationRecipient = mysqlTable(
  "task_notification_recipient",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    taskId: varchar("task_id", { length: 36 }).notNull(),
    channelId: varchar("channel_id", { length: 36 }).notNull(),
    notifyOnSuccess: boolean("notify_on_success").notNull().default(false),
    notifyOnFailure: boolean("notify_on_failure").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    taskIdx: index("task_notification_recipient_task_idx").on(table.taskId),
    channelIdx: index("task_notification_recipient_channel_idx").on(table.channelId),
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
  channel: mysqlEnum("channel", NOTIFICATION_CHANNELS).notNull().default("email"),
  // Same split as notificationChannel: `email` for the email channel,
  // `encryptedConfig` for the rest.
  email: varchar("email", { length: 255 }),
  encryptedConfig: text("encrypted_config"),
  events: json("events").$type<SystemNotificationEvent[]>().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
