<div align="center">
  <img src="code/public/logo-light.png" alt="Backup Hub logo" width="110" />

  # Backup Hub

  **Self-hostable, scheduled backups for MySQL and PostgreSQL — with a web UI, a REST API, and encryption at rest.**

  [![License: MIT](https://img.shields.io/badge/license-MIT-35be9e.svg)](code/LICENSE)
  ![Docker](https://img.shields.io/badge/deploy-Docker-35be9e.svg)
  ![MySQL](https://img.shields.io/badge/MySQL-supported-35be9e.svg)
  ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-supported-35be9e.svg)
</div>

---

## What is this?

Backup Hub is a small, self-hostable service that takes scheduled, encrypted backups of your MySQL and PostgreSQL databases, and gives you a web UI and a REST API to manage them.

Point it at a database, give it a cron schedule and a retention count, and it handles the rest: running `mysqldump`/`pg_dump` on schedule, compressing and optionally encrypting the result, pruning old backups, emailing you if a run fails, and letting you download — or restore — any backup from the browser.

A few highlights (the full list, with all the detail, is in [`code/README.md`](code/README.md)):

- Multi-user accounts with two roles (`admin` / `user`), TOTP + passkey two-factor auth
- One-click **restore**, and a **dry run** button to test a backup before you save the task
- A scoped REST API (`tasks:read`, `tasks:write`, `runs:trigger`, `runs:download`, `runs:delete`) for driving Backup Hub from other tools
- Email notifications per task and system-wide
- Everything encrypted at rest — stored DB credentials, backup passwords, and (optionally) the backup files themselves

## Repository layout

This repo is split into two top-level folders:

| Folder | What's in it |
|---|---|
| [`code/`](code/) | The actual application — a Next.js app. This is where you'll find the source, the full project documentation ([`code/README.md`](code/README.md)), and the license. |
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
- The image already includes `mysqldump`/`mariadb-dump` and `pg_dump`/`pg_isready`, so it can back up either engine out of the box — you don't need to install anything extra to back up a Postgres database even though the bundled `db` service here is MySQL (that MySQL container is only for Backup Hub's own data).

### Building the image yourself

If you'd rather build locally instead of pulling `myfin/backup-hub:latest`, use the provided script from the repo root:

```bash
./docker/build.sh 1.0.0 myfin/backup-hub          # builds locally
./docker/build.sh 1.0.0 myfin/backup-hub --push    # builds & pushes (multi-arch)
```

It builds from `docker/dockerfile` with the repo root as build context, so run it from the repo root as shown above.

### Running without Docker

You can also run Backup Hub directly with Node — see [`code/README.md`](code/README.md#getting-started) for that path (you'll need `mysqldump` and/or `pg_dump` installed locally in that case, since there's no image doing it for you).

## Full documentation

Everything else — the full feature list, user roles and permissions, the REST API reference, two-factor auth and passkeys, how encrypted backups work, and a troubleshooting guide for common `mysqldump`/`pg_dump` version-mismatch errors — lives in [`code/README.md`](code/README.md).

## License

MIT — see [`code/LICENSE`](code/LICENSE).