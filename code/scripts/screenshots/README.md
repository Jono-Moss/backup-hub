# README screenshots

The images in `docs/screenshots/` are generated from demo data, so they never show a real server's tasks, people or credentials.

- **`seed-demo.ts`** fills a *demo* database with sample users (admin "Jane Doe"), tasks, backup history, save locations, notification channels, shares, API keys, sign-in history and sessions. It **empties every table first**, so it refuses to run unless the database name contains `demo`. It writes Jane's session token to `.demo-session` (git-ignored).
- **`capture.cjs`** signs in as Jane with that token and captures every screenshot with Playwright: desktop pages at 1280px wide, and three phone screens combined into `mobile.png`. Everything is rendered at 2× resolution.

## Steps

From `code/`:

```bash
# 1. A separate demo database on your MySQL server, with the schema applied
DEMO_URL="mysql://user:password@localhost:3306/backup_hub_demo"
mysql -e 'CREATE DATABASE IF NOT EXISTS backup_hub_demo'        # or any MySQL client
APP_DATABASE_URL="$DEMO_URL" npm run db:migrate

# 2. Demo data (re-run any time; times are relative to now)
APP_DATABASE_URL="$DEMO_URL" npx tsx scripts/screenshots/seed-demo.ts

# 3. A server on the demo database. Email is pointed nowhere so nothing is sent.
#    Stop any other `next dev` in this folder first — Next.js allows one per project.
APP_DATABASE_URL="$DEMO_URL" BACKUP_DIR=/tmp/bh-demo-backups SMTP_HOST=127.0.0.1 SMTP_PORT=1 \
  npx next dev -p 3100

# 4. In another terminal: capture (needs playwright-core and a Chromium)
npm i --no-save playwright-core            # or install it elsewhere and set NODE_PATH
npx playwright-core install chromium       # if you don't already have one
CHROME_PATH="$(ls -d ~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome | tail -1)" \
BASE_URL=http://localhost:3100 node scripts/screenshots/capture.cjs
```

Images are written straight to `../docs/screenshots/`; set `OUT_DIR` to write them somewhere else first and review them. The Next.js dev-mode badge is hidden in the shots, and dates are shown in the Europe/London timezone.

When you add a page or change a layout, add or adjust its step in `capture.cjs`, and add any data it needs to `seed-demo.ts`.
