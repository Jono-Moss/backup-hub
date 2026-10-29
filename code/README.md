# Backup Hub

Standalone, self-hostable scheduled backups for MySQL and PostgreSQL, with a multi-user web UI, role-based permissions, email/ntfy/Telegram/Discord notifications, and a scoped REST API so other apps can create, trigger, and manage backup tasks programmatically.

## What's here

- **Backup tasks** — each task owns one database connection, a cron schedule, a retention count, and an optional encryption password. Connection details and passwords are encrypted at rest with `BACKUP_MASTER_KEY`.
- **Multi-user accounts** with two roles: `admin` (manages users and system notifications) and `user`. Backup tasks are **private to the user who created them** — even admins can't see them unless the owner shares them. Passwords are hashed with Argon2id.
- **Two-factor authentication & passkeys** — users can enable TOTP (any authenticator app) with recovery codes, and/or register WebAuthn passkeys (Touch ID, Face ID, Windows Hello, security keys). A passkey login counts as its own second factor. Admins can reset a user's 2FA/passkeys for account recovery.
- **Web UI**, session-gated with real DB-backed sessions — create/edit tasks, view run history, run a backup on demand, download or delete backup files, manage users, manage notification recipients, change your own password.
- **Notifications** by email, [ntfy](https://ntfy.sh), Telegram or Discord — per-task recipients for backup success/failure, plus admin-managed system-wide recipients for logins, user creation/deletion, and task creation/deletion. Notifications are best-effort: if SMTP isn't configured or a push service is unreachable, everything else keeps working and the notification is skipped (and logged).
- **Off-site save locations** — a task can copy each completed backup to any number of remote destinations (S3-compatible storage, Google Drive, OneDrive, OpenCloud, FTP, FTPS, SFTP) on top of the always-kept local copy. Google Drive and OneDrive connect with a one-click sign-in, and small enough backups can be emailed to any address as an attachment. Pluggable like the DB engines: implement `BackupDestination` in `lib/backup/destinations/` to add a new provider.
- **REST API** at `/api/v1/*`, authenticated with scoped API keys (`tasks:read`, `tasks:write`, `runs:trigger`, `runs:download`, `runs:delete`), optionally pinned to a single task. This is separate from user accounts — API keys are their own credential type.
- **In-process cron scheduler** (`node-cron`, booted via `instrumentation.ts`) — one job per enabled task.
- **`proxy.ts`** (Next.js 16's replacement for `middleware.ts`) does real DB session validation on every request — not just a signed-cookie check — and enforces admin-only access to `/users` and `/notifications`.

## Getting started

```bash
cp example.env-file .env
# generate a real secret:
openssl rand -hex 32   # → BACKUP_MASTER_KEY

npm install
npm run db:migrate     # applies the checked-in migration to APP_DATABASE_URL
# after editing db/schema.ts: npm run db:generate first
npm run dev
```

You'll also need `mysqldump` and/or `pg_dump` + `pg_isready` installed wherever this runs (already handled in the provided `Dockerfile`).

Visit `http://localhost:3000` — since there are no users yet, you'll land on `/setup` to create the first admin account interactively. Every user after that is created from the **Users** page by an admin.

## Users, ownership & sharing

Every task belongs to the user who created it. The owner can do everything with it. Nobody else can see it — **admins included** — until the owner shares it.

| | `admin` | `user` |
|---|---|---|
| Create tasks, and fully manage the ones they own | Yes | Yes |
| See other users' tasks | No (only a per-user task *count*) | No |
| Manage their own API keys | Yes | Yes |
| See/manage users (`/users`) | Yes | No |
| Manage system-wide notification recipients (`/notifications`) | Yes | No |

### Sharing a task

On a task's page, the owner can share it with another user by email and pick exactly what they may do. These are the same permissions API keys use:

| Permission | Allows |
|---|---|
| View tasks | See the task and its run history (always included) |
| Manage tasks | Edit settings, enable/disable, manage notification recipients and save locations, delete the task |
| Trigger backups | Start a manual backup |
| Download backups | Download backup files |
| Delete backups | Delete backup files / clear failed runs |

**Restoring** a backup into the source database is owner-only and can't be shared. Only the owner can share a task or change who it's shared with. To give an admin access to a task, share it with them like any other user.

### API keys

A key belongs to the user who created it and acts as that user: on any task, it can only do what **both** its scopes and its owner's own permission on that task allow. `GET /api/v1/tasks` lists only tasks its owner can see, and tasks created through the API are owned by the key's owner. If a share is removed or reduced, keys made by that user lose the same access immediately. A key pinned to a single task can't create new tasks.

### Deleting (and keeping the files)

Deleting a task removes it from the app: its run history, task-only notification channels and save locations (saved ones stay in your account), shares, and any API keys pinned to it. Deleting a **user** does that for every task they own, plus their shares on other people's tasks and their API keys.

Both dialogs ask **"Also permanently delete the backup files from disk?"**, unchecked by default:

- **Unchecked (keep files):** the files stay in `BACKUP_DIR/<taskId>/` on the server, so a mistaken delete can still be recovered by hand. A `_deleted-task.json` is written in that folder listing the task name, engine and which file belongs to which run (never connection details or passwords). Encrypted backups still need the password they were encrypted with.
- **Checked:** the folder is erased too.

Via the API, `DELETE /api/v1/tasks/:id` keeps the files by default; add `?purgeFiles=true` to erase them.

## Save locations (off-site destinations)

Every completed backup is always kept locally under `BACKUP_DIR`. On top of that, a task can have any number of **destinations** (task detail page → Save locations) that each completed run also gets copied to.

Save locations come in two kinds:

- **Saved (account-level)** — enter the credentials once, on the **Save locations** page or by ticking "Save to my account" when adding one to a task, then pick it from **Use a saved location** on any of your tasks. Editing it (e.g. a rotated OpenCloud app token) updates every task that uses it. Each task can add its own **subfolder** (S3, OpenCloud, FTP/FTPS/SFTP, OneDrive), defaulting to the task name, so tasks sharing a location don't mix files.
- **Task-only** (the default when adding from a task) — tied to that one task; its credentials can never be picked for another task. Removing it from the task deletes it. On the Save locations page you can make one reusable later (one-way).

Save locations belong to the task owner and are private to them — admins can't see them. People a task is shared with only ever see a location's name and type, never the owner's other saved locations. A shared user with "Manage tasks" can add a task-only location with their own credentials: the owner can remove it but can't edit it or make it reusable, so their credentials can't be pointed elsewhere or reused. Credentials are never sent back to the browser; when editing, leave a secret field blank to keep it. Managing destinations requires the same `tasks:write` ("Manage tasks") permission as notification recipients — see the sharing table above. Destinations are independent — one being unreachable never fails the run itself (the local copy already succeeded) or blocks the others. Each upload attempt is recorded per-destination and shown in the run history as `uploaded`, `failed`, or `skipped`.

Built-in destinations:

- **S3** — real AWS S3 or any S3-compatible provider (Backblaze B2, Wasabi, Cloudflare R2, DigitalOcean Spaces, MinIO, ...). Set a custom endpoint URL and enable "force path-style addressing" for most non-AWS providers.
- **Google Drive** and **OneDrive** — the user clicks **Connect**, is shown a short code, enters it on Google's/Microsoft's own sign-in page, and approves. No passwords or tokens are ever pasted, and users never touch a cloud console. (Uses the OAuth *device flow*, which needs no redirect URL, so it works on any self-hosted domain.) Requires the one-time admin setup below.
- **Email** — emails the backup file as an attachment to any address you choose, if it's under a size limit you set (larger files are recorded as `skipped`, not failed). This is separate from notification recipients on purpose: notifications say "it worked/failed", this delivers the data, and it can go to a different mailbox. Sent through the server's `SMTP_*` settings — unlike notifications, missing SMTP config is a real failure here, so a backup is never reported as delivered when it wasn't.
- **OpenCloud** — Enter the WebDAV URL of the folder, the users name and App token to upload to your OpenCloud server. Remeber that OpenCloud App tokens have an expiry date, so either use one that has a long expiry date or remeber to delete the old destination and then add a new destination with the new App token. 
- **FTP / FTPS** — host, port, username and password, plus an optional remote folder (created if missing; start it with `/` for an absolute path, otherwise it's relative to the login folder). Plain **FTP** sends your password and backup unencrypted, so prefer FTPS or SFTP — or only use FTP with encrypted backups on a trusted network. **FTPS** uses explicit TLS (`AUTH TLS`, port 21) by default; tick **Use implicit TLS** for older servers that expect TLS from the start (usually port 990). Servers with a self-signed certificate need **Allow self-signed / untrusted certificates**.
- **SFTP** — file transfer over SSH. Log in with a password, or paste a private key (OpenSSH or PEM format, with an optional passphrase). Click **Test connection** to see the server's host key fingerprint and paste it into the fingerprint field: once set, Backup Hub refuses to upload to a server presenting a different key. The remote folder works the same as FTP, but relative paths start from the user's home folder.

### One-time admin setup for "Connect" (Google Drive / OneDrive)

Google and Microsoft only hand out access to registered apps, so *someone* has to register Backup Hub once. That's you, the person running the server — not each user. Both registrations are free. Put the resulting IDs in `.env`, restart, and the Connect button appears for everyone.

**Google Drive**
1. In [Google Cloud Console](https://console.cloud.google.com/) create a project and enable the **Google Drive API**.
2. **OAuth consent screen**: user type External. Add the scopes `drive.file`, `openid` and `email` (all non-sensitive, so no Google verification review is needed). **Publish the app to "In production"** — while it's in "Testing", Google expires refresh tokens after 7 days and backups would silently stop working.
3. **Credentials → Create credentials → OAuth client ID → Application type: "TVs and Limited Input devices"**. That's the type that supports the device flow.
4. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. (Google doesn't treat a device-flow client secret as confidential.)

The app only requests the `drive.file` scope: access to files Backup Hub itself creates, never the rest of the user's Drive.

**OneDrive / Microsoft**
1. In the [Microsoft Entra admin center](https://entra.microsoft.com/) → App registrations → **New registration**. A free tenant is enough; no paid Azure subscription. Supported account types: **"Accounts in any organizational directory and personal Microsoft accounts"**.
2. **Authentication → Advanced settings → Allow public client flows: Yes.**
3. **API permissions**: Microsoft Graph, delegated: `Files.ReadWrite` (plus `openid`, `email`, `offline_access`).
4. Set `MICROSOFT_CLIENT_ID` to the Application (client) ID. It's a public client, so there is no secret.

Some locked-down work/school tenants block users from consenting to third-party apps; their admin will need to approve Backup Hub once. Personal Microsoft accounts are unaffected.

**Token lifetime.** Google refresh tokens last until revoked (or unused for 6 months). Microsoft refresh tokens expire 90 days after issue but are reissued on every use, and Backup Hub saves each new one — so any task that runs at least once every 90 days stays connected.

**Prefer not to use the shared app?** Under **Advanced: use my own credentials** when adding a Google Drive/OneDrive destination, you can paste your own OAuth client ID/secret and refresh token instead. Those destinations don't depend on the `.env` values at all.

**OpenCloud**
1. In OpenCloud, click on  My Account → Preferences → **Preferences**.
2. In the Preferences table section you will see an option called **View options** under theme, enable the **Show WebDAV information in details view**.
3. Now in the side panel of any folder or space, you will see a **WebDAV URL**. Copy and use the url for the desired location.
4. To create a new App Token click on: My Account → Preferences → **App Tokens**. Remeber to set a long expiry date if you don't want to have to always recreate the destination in Backup-Hub.

### Adding another provider

Implement `BackupDestination` in `lib/backup/destinations/` and register it in `lib/backup/destinations/index.ts`. The add-destination form is generated from your implementation's `configFields`, so no UI code changes. If the provider has an OAuth device flow, also implement the optional `connect` (`start()` / `poll()`) and the Connect button appears automatically. If the provider rotates refresh tokens, persist the new one with `updateConfig()` (see `onedrive.ts`).

## Notifications

Two independent notification surfaces:

1. **Per-task** (task detail page → Notifications section): pick a channel and choose whether it gets notified on success, failure, or both. Different tasks can have entirely different recipients.
2. **System-wide** (Admin menu → **System notifications**, `/notifications`, admin-only): recipients for account/task lifecycle events — `user_login`, `user_created`, `user_deleted`, `task_created`, `task_deleted`, `security_reset`.

Per-task channels work like save locations: **saved channels** (on the **Notifications** page (top menu), or "Save to my account" when adding one to a task) are set up once and picked from any of your tasks, and editing one updates every task using it; **task-only** channels (the default when adding from a task) belong to that one task and can be made reusable later. The same privacy rules apply: only the task owner sees where a channel sends to, and a shared user's channel can be removed by the owner but not edited or reused. System-wide recipients are separate and admin-managed.

Each channel picks how it's reached. Use **Send test** on the form to check the settings before saving. Tokens and webhook URLs are stored encrypted with `BACKUP_MASTER_KEY`, and are never shown again after saving.

- **Email** — set the `SMTP_*` variables in `.env`. If SMTP isn't configured, `sendMail()` logs a warning once and no-ops.
- **ntfy** — server URL (`https://ntfy.sh` or your own server) and a topic, then subscribe to that topic in the ntfy app. On the public ntfy.sh server anyone who knows a topic name can read it, so choose a hard-to-guess one. For protected topics, add an access token (`tk_...`, created with `ntfy token add` or in the web app under Account → Access tokens). Failures are sent with max priority.
- **Telegram** — message [@BotFather](https://t.me/BotFather), send `/newbot`, and copy the bot token. Then send your new bot a message (or add it to a group) — bots can't start conversations. To find the chat ID, open `https://api.telegram.org/bot<token>/getUpdates` and look for `"chat":{"id":...}` (group IDs are negative).
- **Discord** — in the channel's settings → Integrations → Webhooks → New Webhook → **Copy Webhook URL**.

Push notifications are best-effort like email: a failed send is logged and never breaks a backup run, a login, or a task creation.

## Checking backups

A backup you can't restore is worse than none, because you only find out when you need it. Backup Hub checks backup files at three levels:

1. **Fingerprint** — a SHA-256 of each file is recorded when it's made. A check recomputes it, so a file that has changed on disk since (damaged, truncated, tampered with) is caught.
2. **Read-back** — the whole file is read back the way a restore would read it: decrypted (AES-GCM's integrity check fails on any damaged byte), decompressed (gzip checks its own checksum), and checked to end with the dump tool's "dump completed" line, which a dump that was cut short won't have.
3. **Test restore** — the backup is restored into a brand-new throwaway database on a separate scratch server, Backup Hub checks that tables came back, then drops the database again. This is the only way to be sure a backup really restores.

**Automatically:** every new backup gets levels 1 and 2 before it's marked completed. If it fails, the run is marked **failed**, the broken file is removed, and the task's failure recipients are alerted, so you find out now and not at restore time. Each task can also opt in to **Test-restore each new backup** (task settings). It runs in the background after the backup and alerts on failure.

**By hand:** in a task's backup history, open a backup's **⋯** menu (a bottom drawer on phones) and choose **Verify file** (levels 1+2) or **Test restore** (all three). **Verify all** checks every stored backup of the task, and **Test-restore all** test-restores each of them in turn. Checks are queued and run one at a time, and the page updates as they finish. Running a check needs the **Trigger backups** permission. Via the API: `POST /api/v1/runs/:runId/verify` (add `?level=restore` for a test restore), then read `verifyStatus` / `verifyMessage` from the run list.

**Encrypted backups** are checked with the task's saved backup password. If that password has changed since a backup was made, the check says so instead of calling the file damaged. Restore it with its original password.

### Setting up test restores

Test restores need a database server to restore into. Point these at a **separate scratch server, never production**: a test restore loads the whole backup into it.

```bash
VERIFY_MYSQL_URL="mysql://verify:secret@scratch-mysql:3306"                 # add ?ssl=true to require TLS
VERIFY_POSTGRES_URL="postgres://verify:secret@scratch-postgres:5432/postgres"  # the path is the database to connect to; add ?sslmode=require for TLS
```

(In Docker, set `BH_VERIFY_MYSQL_URL` / `BH_VERIFY_POSTGRES_URL` in `docker/.env`.) Leave one unset and test restores are simply not offered for that engine.

- The account needs permission to create and drop the test databases. For MySQL/MariaDB, ``GRANT ALL ON `bh\_verify\_%`.* TO 'verify'@'%';`` limits it to just those. For Postgres, use a role with `CREATEDB`.
- Each test creates a database named `bh_verify_<time>_<random>`, restores into it, and always drops it afterwards, even if the test fails. Databases left behind by a server that stopped mid-test are dropped at the next start once they're over 6 hours old.
- Ownership and permission statements from the original server (Postgres `OWNER TO` / `GRANT` / `REVOKE`, MySQL `DEFINER=` clauses) are skipped in test restores, since those users won't exist on the scratch server. Real restores are unchanged.
- Use a scratch server running the same database type and a similar version to production. Restoring a newer server's dump into an older one can fail for reasons that have nothing to do with the backup.
- If the scratch server itself has a problem (can't connect, can't create the database), users see a generic message and the details go to the server log, so the scratch server's address and login errors aren't shown to every user.

## Deployment note (important)

The scheduler is an **in-process cron job** — it only fires reliably on a long-running Node server (Docker, a VM, PM2, etc., as in the provided `docker-compose.yml`). On serverless platforms like Vercel, the process doesn't stay warm between requests, so `node-cron` won't reliably fire. If you deploy serverless, point an external cron (e.g. Vercel Cron, or a system crontab hitting a protected endpoint) at each due task instead of relying on `instrumentation.ts`.

`argon2` ships prebuilt native binaries for common platforms — no build toolchain needed in the container.

## Using the REST API from another app

1. In the UI, go to **API Keys** → create a key, choose scopes, optionally pin it to one task. Copy the raw key — it's shown once.
2. Call the API with `Authorization: Bearer <key>`:

```bash
# List tasks
curl -H "Authorization: Bearer bkp_..." https://your-host/api/v1/tasks

# Trigger a backup
curl -X POST -H "Authorization: Bearer bkp_..." https://your-host/api/v1/tasks/<taskId>/runs

# Check a backup file (add ?level=restore for a test restore); results appear in the run list
curl -X POST -H "Authorization: Bearer bkp_..." https://your-host/api/v1/runs/<runId>/verify

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
- **Destinations**: S3-compatible, Google Drive, OneDrive, and email only. Same pluggable pattern as engines — see `lib/backup/destinations/`.
- **Destination secrets aren't re-validated on save**: "Test connection" is a manual step in the add-destination form, not an automatic check before saving — a destination with bad credentials will save successfully and only surface the failure on the next real upload (visible per-run in the backup history, or via the "Test" button next to it afterwards).
- **Large encrypted files**: decryption reads the whole ciphertext into memory (fine for typical dumps; swap for chunked authenticated decryption if you expect multi-GB encrypted files).
- **No password reset via email** — a forgotten password requires an admin to reset it from `/users/[id]`. Self-serve "forgot password" would need its own token-based email flow.
- **Session management UI** — sessions are DB-backed and revocable (deleting a user cascades to their sessions), but there's no "view/revoke your other active sessions" page yet.
- **2FA enforcement**: enabling TOTP/passkeys is opt-in per user, not something an admin can mandate account-wide yet.
- **REST API has no 2FA equivalent** — API keys are a separate credential type from user accounts and aren't affected by a user's 2FA/passkey settings (this is intentional: API keys are meant for machine-to-machine use where an interactive second factor doesn't apply).

## Project layout

```
db/                        schema (users, sessions, tasks, shares, runs, destinations, API keys, notification recipients, 2FA/passkeys) + drizzle client
lib/backup/crypto.ts        secret wrapping, file encryption, API key hashing
lib/backup/engines/         per-database dump implementations (mysql, postgres)
lib/backup/destinations/    pluggable off-site upload implementations (s3, google_drive, onedrive, email)
lib/backup/purge.ts         removes a task (and everything hanging off it) from the DB, optionally its files too
lib/backup/runner.ts        runs a backup end-to-end: dump → encrypt → check → record → prune → upload to destinations → notify
lib/backup/verify.ts        backup file checks (fingerprint, read-back, test restore) and their background queue
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
lib/notifications/channels/ email / ntfy / Telegram / Discord senders + form field definitions
app/api/v1/                 the public REST API
app/setup/                  first-run admin account creation
app/login/                  email/password login, logout, passkey login
app/login/2fa/              TOTP/recovery-code verification step
app/account/                self-service profile, password, 2FA, and passkey management
app/users/                  admin-only user management, incl. 2FA/passkey reset
app/notifications/          admin-only system notification recipients
app/tasks/, app/api-keys/   the first-party UI + its server actions
proxy.ts                    Next.js request interception: session + 2FA-pending + role gating
instrumentation.ts          boots the scheduler on server start
```