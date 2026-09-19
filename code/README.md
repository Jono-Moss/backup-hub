# Backup Hub

Standalone, self-hostable scheduled backups for MySQL and PostgreSQL, with a multi-user web UI, role-based permissions, email notifications, and a scoped REST API so other apps can create, trigger, and manage backup tasks programmatically.

## What's here

- **Backup tasks** — each task owns one database connection, a cron schedule, a retention count, and an optional encryption password. Connection details and passwords are encrypted at rest with `BACKUP_MASTER_KEY`.
- **Multi-user accounts** with two roles: `admin` (full access, including user management) and `user` (can manage tasks, API keys, and task notification recipients, but not other users). Passwords are hashed with Argon2id.
- **Two-factor authentication & passkeys** — users can enable TOTP (any authenticator app) with recovery codes, and/or register WebAuthn passkeys (Touch ID, Face ID, Windows Hello, security keys). A passkey login counts as its own second factor. Admins can reset a user's 2FA/passkeys for account recovery.
- **Web UI**, session-gated with real DB-backed sessions — create/edit tasks, view run history, run a backup on demand, download or delete backup files, manage users, manage notification recipients, change your own password.
- **Email notifications** — per-task recipients for backup success/failure, plus admin-managed system-wide recipients for logins, user creation/deletion, and task creation/deletion. Notifications are best-effort: if SMTP isn't configured, everything else keeps working and emails are silently skipped.
- **REST API** at `/api/v1/*`, authenticated with scoped API keys (`tasks:read`, `tasks:write`, `runs:trigger`, `runs:download`, `runs:delete`), optionally pinned to a single task. This is separate from user accounts — API keys are their own credential type.
- **In-process cron scheduler** (`node-cron`, booted via `instrumentation.ts`) — one job per enabled task.
- **`proxy.ts`** (Next.js 16's replacement for `middleware.ts`) does real DB session validation on every request — not just a signed-cookie check — and enforces admin-only access to `/users` and `/notifications`.

## Getting started

```bash
cp example.env-file .env
# generate a real secret:
openssl rand -hex 32   # → BACKUP_MASTER_KEY

npm install
npm run db:generate    # generates SQL migration from db/schema.ts
npm run db:migrate     # applies it to APP_DATABASE_URL
npm run dev
```

You'll also need `mysqldump` and/or `pg_dump` + `pg_isready` installed wherever this runs (already handled in the provided `Dockerfile`).

Visit `http://localhost:3000` — since there are no users yet, you'll land on `/setup` to create the first admin account interactively. Every user after that is created from the **Users** page by an admin.

## Users & permissions

| | `admin` | `user` |
|---|---|---|
| Manage backup tasks (create/edit/delete/run/download) | Yes | Yes |
| Manage API keys | Yes | Yes |
| Manage a task's own notification recipients | Yes | Yes |
| Change their own name/password | Yes | Yes |
| See/manage other users (`/users`) | Yes | No |
| Manage system-wide notification recipients (`/notifications`) | Yes | No |

This is deliberately a two-role system, not granular per-task permissions — if you need per-task access control between non-admin users, that's a reasonable place to extend `lib/auth/session.ts` and `proxy.ts` further.

## Email notifications

Set the `SMTP_*` variables in `.env` to enable email. Two independent notification surfaces:

1. **Per-task** (task detail page → Notifications section): add any email address, choose whether it gets notified on success, failure, or both. Different tasks can have entirely different recipients.
2. **System-wide** (`/notifications`, admin-only): recipients for account/task lifecycle events — `user_login`, `user_created`, `user_deleted`, `task_created`, `task_deleted`.

If SMTP isn't configured, `sendMail()` logs a warning once and no-ops — it will never throw and break a backup run, a login, or a task creation.

## Deployment note (important)

The scheduler is an **in-process cron job** — it only fires reliably on a long-running Node server (Docker, a VM, PM2, etc., as in the provided `docker-compose.yml`). On serverless platforms like Vercel, the process doesn't stay warm between requests, so `node-cron` won't reliably fire. If you deploy serverless, point an external cron (e.g. Vercel Cron, or a system crontab hitting a protected endpoint) at each due task instead of relying on `instrumentation.ts`.

`argon2` ships prebuilt native binaries for common platforms (including the `node:20-bookworm-slim` base image used in the provided `Dockerfile`) — no build toolchain needed in the container.

## Using the REST API from another app

1. In the UI, go to **API Keys** → create a key, choose scopes, optionally pin it to one task. Copy the raw key — it's shown once.
2. Call the API with `Authorization: Bearer <key>`:

```bash
# List tasks
curl -H "Authorization: Bearer bkp_..." https://your-host/api/v1/tasks

# Trigger a backup
curl -X POST -H "Authorization: Bearer bkp_..." https://your-host/api/v1/tasks/<taskId>/runs

# Download the most recent backup file
curl -H "Authorization: Bearer bkp_..." https://your-host/api/v1/runs/<runId>/download -o backup.sql.gz.enc

# Create a task
curl -X POST -H "Authorization: Bearer bkp_..." -H "Content-Type: application/json" \
  https://your-host/api/v1/tasks \
  -d '{
    "name": "Orders DB",
    "engine": "postgres",
    "connection": { "host": "db.internal", "port": 5432, "user": "app", "password": "...", "database": "orders" },
    "cronExpression": "0 4 * * *",
    "retentionCount": 14,
    "encryptionEnabled": true,
    "backupPassword": "a-strong-password"
  }'
```

Full route list is in `app/api/v1/`. API keys are unrelated to user accounts — they're a separate credential type for machine-to-machine access, still admin/user-creatable via the UI.

## Troubleshooting: mysqldump/pg_dump client-server version mismatches

Backup Hub shells out to your system's `mysqldump`/`pg_dump`, so its reliability depends on which version is installed, and on the DB account having the right (minimal) privileges. If you're setting up a dedicated backup user, save yourself the trial-and-error and grant this up front:

```sql
-- Minimal privileges mysqldump needs for a standalone logical backup
-- (not replication setup) of one schema, with the flags Backup Hub passes:
CREATE USER 'backup_user'@'%' IDENTIFIED BY 'a-strong-password';
GRANT SELECT, SHOW VIEW, TRIGGER, LOCK TABLES ON your_database.* TO 'backup_user'@'%';
-- Only needed if the server has gtid_mode=ON (common on managed MySQL —
-- RDS, DigitalOcean, PlanetScale, etc.) and you'd rather grant this than
-- rely on --set-gtid-purged=OFF (already passed by default, see below):
-- GRANT RELOAD ON *.* TO 'backup_user'@'%';
FLUSH PRIVILEGES;
```

With that grant, none of the three issues below should come up at all. They're documented here for anyone working with an account they don't control:

**`Couldn't execute 'FLUSH ... TABLES': Access denied ... RELOAD or FLUSH_TABLES privilege(s)`** — if the server has `gtid_mode=ON`, MySQL's own docs state that `--single-transaction` requires the `RELOAD` or `FLUSH_TABLES` privilege, purely to record the GTID position in the dump. That position is only useful for setting up replication from the dump — irrelevant for a standalone backup/restore. Already fixed: the mysql engine always passes `--set-gtid-purged=OFF`, which skips recording it and avoids needing that privilege at all.

**`Access denied for user '...'@'localhost'` on the manual/scheduled run, even though "Test connection" passed** — this is a MySQL command-line client quirk, not a Backup Hub bug: when the host is the literal string `localhost`, `mysqldump` (and `mysql`) silently switch from TCP to a Unix socket and **ignore the port entirely**. So a task pointed at `localhost:3307` can end up talking to a completely different local MySQL instance over the socket. "Test connection" doesn't hit this because it uses the `mysql2` Node driver, which always uses real TCP. Already fixed: the mysql engine always passes `--protocol=TCP`, which forces real TCP to the host/port you configured regardless of the hostname string. If you still see this after upgrading, double-check the task's host/port actually match what you tested.

**`Access denied ... PROCESS privilege(s) ... when trying to dump tablespaces`** — mysqldump 8.0.20+ tries to dump tablespace metadata by default, which needs a privilege a normal, schema-scoped backup user shouldn't need. Already fixed: the mysql engine always passes `--no-tablespaces`.

**`Unknown table 'LIBRARIES' in information_schema`** — mysqldump 9.3 added an unconditional check for a MySQL 9.x-only feature (JS/WASM "libraries") that doesn't exist on most currently-deployed servers (including MySQL 8.4). There's no flag to disable this probe — it's a client bug when a 9.3+ client talks to an older server. If you hit this:

- The Docker image is unaffected (`default-mysql-client` on Debian resolves to `mysql-client-8.0`, which predates this probe).
- Locally (e.g. macOS via Homebrew, which installs the newest client by default), install an older client and point `MYSQLDUMP_PATH` at it:
```bash
  brew install mysql-client@8.4
  echo 'MYSQLDUMP_PATH="/opt/homebrew/opt/mysql-client@8.4/bin/mysqldump"' >> .env
```
- General rule of thumb: keep your `mysqldump`/`pg_dump` client version at or below your target server's major version. A newer client talking to an older server is the risky direction; `PG_DUMP_PATH`/`PG_ISREADY_PATH` exist for the same reason on the Postgres side.

The error message itself will tell you which of these two you're hitting and what to do — both engines now detect these specific failure signatures and append a hint.

## Two-factor authentication & passkeys

Both are opt-in, per-user, and set up from `/account`:

- **TOTP (authenticator app)**: scan the QR code with any TOTP app (1Password, Google Authenticator, Authy, etc.), confirm with a 6-digit code to enable, and save the 10 single-use recovery codes shown once at that point. From then on, password login is followed by a `/login/2fa` step. Recovery codes can be regenerated any time (invalidates the old batch); disabling 2FA requires re-entering your password.
- **Passkeys**: "Add a passkey" registers a WebAuthn credential (Touch ID, Face ID, Windows Hello, a security key, or a password manager's synced passkey) via the browser's own UI. The login page's "Sign in with a passkey" button uses usernameless/discoverable authentication — no email typed first, the OS picker handles it. A successful passkey login is treated as satisfying 2FA on its own (it's phishing-resistant by construction), even if the account also has TOTP enabled.
- **Admin recovery**: if a user loses their authenticator app and their passkey device, an admin can hit "Reset 2FA & passkeys" on `/users/[id]` — this wipes all their second factors and revokes their sessions, dropping them back to password-only login so they can re-enroll.

**Passkeys require correct `WEBAUTHN_*` configuration in production.** `WEBAUTHN_RP_ID` must be exactly your domain (no scheme, no port — e.g. `backup.yourdomain.com`) and `WEBAUTHN_ORIGIN` must be the exact origin the browser sees (e.g. `https://backup.yourdomain.com`). Both default to `localhost`/`http://localhost:3000` for local dev, where WebAuthn is allowed over plain HTTP as a special case — everywhere else, WebAuthn requires HTTPS outright. Changing `WEBAUTHN_RP_ID` after people have registered passkeys will make their existing passkeys stop being offered (the browser scopes passkeys to the RP ID they were created under), so treat it like you would a domain migration.

TOTP secrets are encrypted at rest with `BACKUP_MASTER_KEY` (same mechanism as DB connection credentials); recovery codes and passkey public keys are stored hashed/as-is respectively, following the same "never store what you can verify instead" pattern as API keys and sessions.

## Encrypted backups

If a task has encryption enabled, downloaded files are `.sql.gz.enc` — Backup Hub never decrypts server-side on download, so the backup password is only ever held in memory during the dump itself. To decrypt locally, the file layout is `[salt(16 bytes)][iv(12 bytes)][ciphertext][authTag(16 bytes)]`, AES-256-GCM, key derived via scrypt from your password + the salt. A small decrypt script would look like:

```js
// see lib/backup/crypto.ts:decryptFile for the reference implementation
```

## What's intentionally left simple (v0.1)

- **Permissions**: two flat roles (`admin`/`user`), not per-task ACLs. See the table above.
- **Key rotation**: no built-in `BACKUP_MASTER_KEY` versioning — rotating it means decrypting all stored secrets with the old key and re-encrypting with the new one in a one-off script.
- **Task connection edits**: the UI doesn't yet support editing a task's DB connection after creation (only schedule/retention/encryption) — delete and recreate, or use `PATCH /api/v1/tasks/:id`.
- **Engines**: MySQL and Postgres only. Adding another engine means implementing `BackupEngine` in `lib/backup/engines/` and registering it in `lib/backup/engines/index.ts`.
- **Large encrypted files**: decryption reads the whole ciphertext into memory (fine for typical dumps; swap for chunked authenticated decryption if you expect multi-GB encrypted files).
- **No password reset via email** — a forgotten password requires an admin to reset it from `/users/[id]`. Self-serve "forgot password" would need its own token-based email flow.
- **Session management UI** — sessions are DB-backed and revocable (deleting a user cascades to their sessions), but there's no "view/revoke your other active sessions" page yet.
- **2FA enforcement**: enabling TOTP/passkeys is opt-in per user, not something an admin can mandate account-wide yet.
- **REST API has no 2FA equivalent** — API keys are a separate credential type from user accounts and aren't affected by a user's 2FA/passkey settings (this is intentional: API keys are meant for machine-to-machine use where an interactive second factor doesn't apply).

## Project layout

```
db/                        schema (users, sessions, tasks, runs, API keys, notification recipients, 2FA/passkeys) + drizzle client
lib/backup/crypto.ts        secret wrapping, file encryption, API key hashing
lib/backup/engines/         per-database dump implementations (mysql, postgres)
lib/backup/runner.ts        runs a backup end-to-end: dump → encrypt → record → prune → notify
lib/backup/scheduler.ts     node-cron job management
lib/auth/api-key.ts         REST API scoped-key authentication
lib/auth/password.ts        Argon2id password hashing
lib/auth/session.ts         DB-backed multi-user sessions, 2FA-pending state, role checks
lib/auth/token-hash.ts      shared session-token hashing (used by session.ts and proxy.ts)
lib/auth/totp.ts            RFC 6238 TOTP implementation (secret gen, code gen/verify, otpauth URI)
lib/auth/recovery-codes.ts  2FA recovery code generation/hashing
lib/auth/webauthn.ts        WebAuthn RP config + ephemeral challenge-cookie helpers
lib/notifications/mailer.ts nodemailer transport, best-effort sends
lib/notifications/notify.ts task and system notification dispatch
app/api/v1/                 the public REST API
app/setup/                  first-run admin account creation
app/login/                  email/password login, logout, passkey login
app/login/2fa/              TOTP/recovery-code verification step
app/account/                self-service profile, password, 2FA, and passkey management
app/users/                  admin-only user management, incl. 2FA/passkey reset
app/notifications/          admin-only system notification recipients
app/tasks/, app/api-keys/   the first-party UI + its server actions
proxy.ts                    Next.js 16 request interception: session + 2FA-pending + role gating
instrumentation.ts          boots the scheduler on server start
```