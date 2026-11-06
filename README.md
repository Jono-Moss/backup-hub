<div align="center">
  <img src="code/public/logo-light.png" alt="Backup Hub logo" width="110" />

  # Backup Hub

  **Self-hostable, scheduled backups for MySQL, MariaDB, PostgreSQL and MongoDB — with a web UI, a REST API, and encryption at rest.**

  [![License: MIT](https://img.shields.io/badge/license-MIT-35be9e.svg)](code/LICENSE)
  ![Docker](https://img.shields.io/badge/deploy-Docker-35be9e.svg)
  ![MySQL](https://img.shields.io/badge/MySQL-supported-35be9e.svg)
  ![MariaDB](https://img.shields.io/badge/MariaDB-supported-35be9e.svg)
  ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-supported-35be9e.svg)
  ![MongoDB](https://img.shields.io/badge/MongoDB-supported-35be9e.svg)
</div>

<p align="center">
  <img src="docs/screenshots/task.png" alt="A backup task in Backup Hub: a section menu, then the run history with off-site upload status, check results, pagination, and a download button with a menu of more actions for each backup" width="900" />
</p>

---

## What is this?

Backup Hub is a small, self-hostable service that takes scheduled, encrypted backups of your MySQL, MariaDB, PostgreSQL and MongoDB databases, and gives you a web UI and a REST API to manage them. Hosted databases work too — Amazon RDS / Aurora, PlanetScale and TiDB with the MySQL engine; Supabase, Neon and TimescaleDB with the PostgreSQL engine; MongoDB Atlas with the MongoDB engine (see [supported databases](code/README.md#supported-databases)).

Point it at a database, give it a cron schedule and a retention count, and it handles the rest: running `mysqldump`/`pg_dump` on schedule, compressing and optionally encrypting the result, pruning old backups, copying them off-site, notifying you if a run fails, and letting you download — or restore — any backup from the browser.

A few highlights (the full list, with all the detail, is in [`code/README.md`](code/README.md)):

- A **dashboard** that shows at a glance what succeeded, what failed and what needs attention — including backups that couldn't sign in to their database or save location
- Multi-user accounts with two roles (`admin` / `user`), TOTP + passkey two-factor auth, and per-task sharing
- **Sign-in security**: a history of every sign-in attempt, lockouts after repeated failures, "forgot password" reset links by email, and a list of your active sessions you can sign out of
- One-click **restore**, and a **dry run** button to test a backup before you save the task
- **Backup checks**: every backup is read back and fingerprinted automatically, and can be **test-restored** into a throwaway database on a scratch server, so you know it actually restores
- **Off-site copies** to S3-compatible storage (AWS, Backblaze B2, Wasabi, R2, MinIO…), Google Drive, OneDrive, OpenCloud, FTP/FTPS, SFTP or email — set a location up once and reuse it across tasks
- **Notifications** by email, ntfy, Telegram or Discord, per task and system-wide
- A scoped REST API (`tasks:read`, `tasks:write`, `runs:trigger`, `runs:download`, `runs:delete`) for driving Backup Hub from other tools
- Everything encrypted at rest — stored DB credentials, save-location and notification credentials, backup passwords, and (optionally) the backup files themselves
- Works on your phone as well as your desktop
- Available in **English, Spanish, German, French and Simplified Chinese** — it follows your browser's language, or pick one on your Account page (see [languages](code/README.md#languages))

## Screenshots

**The dashboard** — the last 7 days at a glance, what needs attention (like a database password that changed, or an expired cloud key), recent activity, and every task with its latest result and a strip of its recent backups.

<img src="docs/screenshots/dashboard.png" alt="The dashboard: counts of successful and failed backups, off-site copy failures and failed sign-ins; two tasks needing attention because of credential problems; recent activity; and five tasks with their last result and a history strip" width="900" />

**Every backup's actions in one place** — download, restore, verify the file, test-restore it, or delete it. Check results show under each backup's status.

<img src="docs/screenshots/backup-actions.png" alt="A task's backup history with one backup's actions menu open: Restore, Verify file, Test restore and Delete, plus Verify all, Test-restore all and Remove failed buttons" width="900" />

<table>
  <tr>
    <td width="50%" valign="top">
      <b>Save locations</b> — enter credentials once and reuse them on any task, or keep them task-only.<br /><br />
      <img src="docs/screenshots/save-locations.png" alt="The save locations page: saved locations used by several tasks, and a task-only location" />
    </td>
    <td width="50%" valign="top">
      <b>Notifications</b> — email, ntfy, Telegram or Discord, chosen per task.<br /><br />
      <img src="docs/screenshots/notifications.png" alt="The notifications page: saved Discord, ntfy and email channels, and a task-only Telegram channel" />
    </td>
  </tr>
</table>

**On your phone** — a compact dashboard with your tasks up front, a jump-to menu for a task's sections, and every backup's actions in a bottom drawer.

<img src="docs/screenshots/mobile.png" alt="Three phone screenshots: the compact dashboard with a row of counts, an attention banner and the task list; a task page with its section menu open; and the actions drawer for one backup (download, restore, verify, test restore, delete)" width="900" />

<details>
<summary><b>More screenshots</b> — task details, new task, account and security, users, API keys and sign-in</summary>
<br />

<table>
  <tr>
    <td width="50%" valign="top">
      <b>Task notifications</b> — what's set up, at a glance; <b>+ Add</b> opens a panel to use a saved channel or create one just for this task.<br /><br />
      <img src="docs/screenshots/task-notifications.png" alt="A task's notifications: three channels with their success/failure badges, and the add panel open on 'Use a saved channel'" />
    </td>
    <td width="50%" valign="top">
      <b>Task save locations</b> — saved locations (each with its own subfolder) with test, disable and remove; <b>+ Add</b> opens the form for a new one.<br /><br />
      <img src="docs/screenshots/task-save-locations.png" alt="A task's save locations: two saved locations with subfolders, and the add panel open with the provider form" />
    </td>
  </tr>
</table>

<table>
  <tr>
    <td width="50%" valign="top">
      <b>Sharing and settings</b> — share a task with chosen permissions, and set its schedule, retention, encryption and test restores.<br /><br />
      <img src="docs/screenshots/task-sharing-settings.png" alt="A task's sharing and settings: a shared user with their permissions, and the schedule, retention, encryption and test-restore settings" />
    </td>
    <td width="50%" valign="top">
      <b>New task</b> — connection details, a test-connection and dry-run button, schedule and encryption.<br /><br />
      <img src="docs/screenshots/new-task.png" alt="The new backup task form: database connection, schedule, retention and encryption" />
    </td>
  </tr>
</table>

<table>
  <tr>
    <td width="50%" valign="top">
      <b>Your account</b> — password, two-factor authentication, passkeys, your active sessions (sign out any you don't recognise) and your sign-in history.<br /><br />
      <img src="docs/screenshots/account.png" alt="The account page: profile and password, two-factor authentication enabled, two passkeys, three active sessions with one flagged for a changed IP address, and recent sign-in attempts including blocked ones" />
    </td>
    <td width="50%" valign="top">
      <b>Users (admin)</b> — admins add and manage users; tasks stay private to their owner.<br /><br />
      <img src="docs/screenshots/users.png" alt="The admin users page: three users with their roles and task counts" />
    </td>
  </tr>
</table>

<table>
  <tr>
    <td width="50%" valign="top">
      <b>API keys</b> — scoped keys for the REST API, optionally pinned to one task.<br /><br />
      <img src="docs/screenshots/api-keys.png" alt="The API keys page: two keys with their scopes, one pinned to a single task" />
    </td>
    <td width="50%" valign="top">
      <b>Sign in</b> — with a password (plus two-factor) or a passkey, with a "Forgot password?" link.<br /><br />
      <img src="docs/screenshots/login.png" alt="The sign-in page with email and password fields, a forgot-password link and a passkey button" />
    </td>
  </tr>
</table>

</details>

<sub>Screenshots show demo data, generated with the scripts in <a href="code/scripts/screenshots/"><code>code/scripts/screenshots/</code></a>.</sub>

## Repository layout

This repo is split into these top-level folders:

| Folder | What's in it |
|---|---|
| [`code/`](code/) | The actual application — a Next.js app. This is where you'll find the source, the full project documentation ([`code/README.md`](code/README.md)), and the license. |
| [`docs/`](docs/) | Screenshots used in this README. |
| [`docker/`](docker/) | Everything needed to run Backup Hub in Docker: the `Dockerfile`, a ready-to-use `docker-compose.yml` (Backup Hub + a MySQL container), the container's `entrypoint.sh`, and a multi-arch `build.sh` build script. |

If you're just here to run it, you don't need to open `code/` at all — start with `docker/` below.

## Quick start (Docker Compose)

The `docker/` folder ships a `docker-compose.yml` that runs Backup Hub alongside its own MySQL database (the one Backup Hub uses to store its users, tasks, and run history — separate from whatever databases *you* point it at to back up).

```bash
cd docker
cp example.env-file .env
```

Edit `.env` and set real values — at minimum, generate a real secret for `BACKUP_MASTER_KEY` (used to encrypt stored DB credentials and backup passwords at rest) and set strong MySQL passwords:

```bash
openssl rand -hex 32   # → BACKUP_MASTER_KEY
```

Then bring it up:

```bash
docker compose up -d
```

Visit `http://localhost:3000` — there are no users yet, so you'll land on `/setup` to create the first admin account.

Worth setting in `.env` before you rely on it day to day:

- **`BH_APP_URL`** — the address people open Backup Hub at (e.g. `https://backup.yourdomain.com`). Password-reset emails link to it.
- **`BH_SMTP_*`** — needed for email notifications and for "Forgot password?". Without SMTP, users who forget their password have to ask an admin.
- **`BH_LOGIN_MAX_FAILED_ATTEMPTS`** (default `2`), **`BH_LOGIN_MAX_FAILED_ATTEMPTS_PER_IP`** (default `20`) and **`BH_LOGIN_LOCKOUT_MINUTES`** (default `15`) — how many failed sign-ins lock an account or an IP address, and for how long. `0` turns a limit off.
- If Backup Hub sits **behind a reverse proxy**, have it set `X-Forwarded-For`; sign-in history, active sessions and the per-IP lockout use it to see the visitor's IP.

**Upgrading:** pull the new image and `docker compose up -d` again. Database migrations run automatically on start.

### What's actually in `docker/docker-compose.yml`

For reference, here's the shape of it — Backup Hub itself, plus a MySQL container it depends on and waits for to be healthy before starting:

```yaml
services:
  backup-hub:
    image: myfin/backup-hub:latest
    container_name: backup-hub
    restart: always
    ports:
      - "3000:3000"
    environment:
      APP_DATABASE_URL: "mysql://${BH_DATABASE_USER}:${BH_DATABASE_PASSWORD}@${BH_DATABASE_HOST}:3306/${BH_DATABASE_NAME}"

      # Read by entrypoint.sh
      BH_DATABASE_HOST: "${BH_DATABASE_HOST}"
      BH_DATABASE_NAME: "${BH_DATABASE_NAME}"
      BH_DATABASE_USER: "${BH_DATABASE_USER}"
      BH_DATABASE_PASSWORD: "${BH_DATABASE_PASSWORD}"
      BH_DATABASE_ROOT_PASSWORD: "${BH_DATABASE_ROOT_PASSWORD}"

      BACKUP_MASTER_KEY: "${BH_BACKUP_MASTER_KEY}"
      BACKUP_DIR: "/var/backups/backup-hub"

      SMTP_HOST: "${BH_SMTP_HOST}"
      SMTP_PORT: "${BH_SMTP_PORT}"
      SMTP_SECURE: "${BH_SMTP_SECURE}"
      SMTP_USER: "${BH_SMTP_USER}"
      SMTP_PASS: "${BH_SMTP_PASS}"
      SMTP_FROM: "${BH_SMTP_FROM}"

      WEBAUTHN_RP_NAME: "${BH_WEBAUTHN_RP_NAME}"
      WEBAUTHN_RP_ID: "${BH_WEBAUTHN_RP_ID}"
      WEBAUTHN_ORIGIN: "${BH_WEBAUTHN_ORIGIN}"
      APP_URL: "${BH_APP_URL:-${BH_WEBAUTHN_ORIGIN}}"

      # Optional: sign-in lockouts (see example.env-file).
      LOGIN_MAX_FAILED_ATTEMPTS: "${BH_LOGIN_MAX_FAILED_ATTEMPTS:-2}"
      LOGIN_MAX_FAILED_ATTEMPTS_PER_IP: "${BH_LOGIN_MAX_FAILED_ATTEMPTS_PER_IP:-20}"
      LOGIN_LOCKOUT_MINUTES: "${BH_LOGIN_LOCKOUT_MINUTES:-15}"

      # Optional: servers for test restores (see example.env-file).
      VERIFY_MYSQL_URL: "${BH_VERIFY_MYSQL_URL:-}"
      VERIFY_POSTGRES_URL: "${BH_VERIFY_POSTGRES_URL:-}"
      VERIFY_MONGODB_URL: "${BH_VERIFY_MONGODB_URL:-}"

    volumes:
      - ./data/backups:/var/backups/backup-hub

    depends_on:
      backup-hub-db:
        condition: service_healthy

    networks:
      - backup-hub-frontend
      - backup-hub-backend

  backup-hub-db:
    image: mysql:latest
    container_name: backup-hub-db
    restart: always
    environment:
      MYSQL_DATABASE: "${BH_DATABASE_NAME}"
      MYSQL_USER: "${BH_DATABASE_USER}"
      MYSQL_PASSWORD: "${BH_DATABASE_PASSWORD}"
      MYSQL_ROOT_PASSWORD: "${BH_DATABASE_ROOT_PASSWORD}"

    volumes:
      - ./data/mysql:/var/lib/mysql

    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-u", "root", "-p${BH_DATABASE_ROOT_PASSWORD}"]
      interval: 5s
      timeout: 5s
      retries: 10

    networks:
      - backup-hub-backend

networks:
  backup-hub-frontend:
    driver: bridge

  backup-hub-backend:
    driver: bridge
    internal: true
```

A few things worth knowing about this setup:

- **`./data/backups` and `./data/mysql`** are bind-mounted into `docker/data/` on the host, so both your backup files and Backup Hub's own database survive a `docker compose down`/`up`.
- **`entrypoint.sh`** (baked into the image) waits for MySQL to report healthy, creates the database/user if they don't exist yet, runs any pending migrations, then starts the app — so `docker compose up -d` alone is enough on a first run.
- The image already includes `mariadb-dump` (which backs up MySQL and MariaDB), `pg_dump`/`pg_isready`, and `mongodump`/`mongorestore`, so it can back up every engine out of the box — you don't need to install anything extra to back up a Postgres or MongoDB database even though the bundled `db` service here is MySQL (that MySQL container is only for Backup Hub's own data).

### Building the image yourself

If you'd rather build locally instead of pulling `myfin/backup-hub:latest`, use the provided script from the repo root:

```bash
./docker/build.sh 1.0.0 myfin/backup-hub          # builds locally
./docker/build.sh 1.0.0 myfin/backup-hub --push    # builds & pushes (multi-arch)
```

It builds from `docker/dockerfile` with the repo root as build context, so run it from the repo root as shown above. Each build gets its own deployment ID (version + build number), so after an upgrade, browser tabs still open on the old version reload themselves instead of erroring.

### Running without Docker

You can also run Backup Hub directly with Node — see [`code/README.md`](code/README.md#getting-started) for that path (you'll need `mysqldump` and/or `pg_dump` installed locally in that case, since there's no image doing it for you).

## Full documentation

Everything else — the full feature list, user roles and permissions, the REST API reference, two-factor auth and passkeys, [sign-in security](code/README.md#sign-in-security) (history, lockouts, password reset, active sessions), how encrypted backups work, and a troubleshooting guide for common `mysqldump`/`pg_dump` version-mismatch errors — lives in [`code/README.md`](code/README.md).

## License

MIT — see [`code/LICENSE`](code/LICENSE).