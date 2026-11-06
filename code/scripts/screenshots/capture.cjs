// Captures the README screenshots from a server running on the demo database.
// See scripts/screenshots/README.md for the full steps.
//
//   NODE_PATH=/path/to/node_modules BASE_URL=http://localhost:3100 \
//   CHROME_PATH=~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome \
//   node scripts/screenshots/capture.cjs
//
// Needs playwright-core (install it anywhere, e.g. `npm i --no-save playwright-core`).
// Writes PNGs to ../docs/screenshots (relative to code/).

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");

const BASE = process.env.BASE_URL || "http://localhost:3100";
const OUT = process.env.OUT_DIR || path.resolve(__dirname, "../../../docs/screenshots");
const session = JSON.parse(fs.readFileSync(path.join(__dirname, ".demo-session"), "utf8"));
const SHOP = `/tasks/${session.shopTaskId}`;

// Hide the Next.js dev-mode badge and freeze animations so shots are stable.
const CLEAN_CSS = `
  nextjs-portal { display: none !important; }
  *, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
`;

async function newPage(browser, { mobile = false, signedIn = true } = {}) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
    deviceScaleFactor: 2,
    isMobile: mobile,
    hasTouch: mobile,
    timezoneId: "Europe/London",
    locale: "en-GB",
    colorScheme: "light",
    // Matches the seeded "this device" session, so Account → Active sessions looks right.
    extraHTTPHeaders: { "X-Forwarded-For": "203.0.113.24" },
  });
  if (signedIn) {
    await context.addCookies([{ name: "bh_session", value: session.token, url: BASE }]);
  }
  const page = await context.newPage();
  return page;
}

async function open(page, url) {
  await page.goto(BASE + url, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: CLEAN_CSS });
  // LocalTime swaps to the browser's timezone after hydration.
  await page.waitForTimeout(400);
}

// Screenshot from the top of the page down to the bottom of `selector` (+ margin).
async function shotDownTo(page, file, selector, margin = 40) {
  const box = await page.locator(selector).first().boundingBox();
  const height = Math.ceil(box.y + box.height + margin + (await page.evaluate(() => window.scrollY)));
  await page.setViewportSize({ width: 1280, height: Math.max(height, 400) });
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(OUT, file), clip: { x: 0, y: 0, width: 1280, height } });
  await page.setViewportSize({ width: 1280, height: 900 });
  console.log("  ", file);
}

// Screenshot of the area spanning one or more elements, with padding.
// `before` runs after the viewport is enlarged (menus close on resize).
async function shotOf(page, file, selectors, pad = 24, before) {
  await page.setViewportSize({ width: 1280, height: 3000 });
  await page.waitForTimeout(150);
  if (before) await before();
  const boxes = [];
  for (const s of selectors) boxes.push(await page.locator(s).first().boundingBox());
  const top = Math.min(...boxes.map((b) => b.y)) - pad;
  const bottom = Math.max(...boxes.map((b) => b.y + b.height)) + pad;
  const left = Math.min(...boxes.map((b) => b.x)) - pad;
  const right = Math.max(...boxes.map((b) => b.x + b.width)) + pad;
  await page.screenshot({
    path: path.join(OUT, file),
    clip: { x: Math.max(0, left), y: Math.max(0, top), width: right - left, height: bottom - top },
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  console.log("  ", file);
}

// The whole page down to the end of the main content (no footer).
async function fullPage(page, file) {
  await shotDownTo(page, file, "main > div", 32);
}

async function desktop(browser) {
  const page = await newPage(browser);

  await open(page, "/");
  await shotDownTo(page, "dashboard.png", "section:has(h2:text-is('Backup tasks'))", 28);

  await open(page, SHOP);
  await shotDownTo(page, "task.png", "#backups", 28);

  await open(page, SHOP);
  await shotOf(page, "backup-actions.png", ["#backups"], 0, async () => {
    await page.getByRole("button", { name: "Backup actions" }).first().click();
    await page.waitForTimeout(250);
  });

  await open(page, SHOP);
  await page.locator("#notifications").getByRole("button", { name: "Add notification" }).first().click();
  await shotOf(page, "task-notifications.png", ["#notifications"]);

  await open(page, SHOP);
  await page.locator("#locations").getByRole("button", { name: "Add location" }).first().click();
  await shotOf(page, "task-save-locations.png", ["#locations"]);

  await open(page, SHOP);
  await shotOf(page, "task-sharing-settings.png", ["#sharing", "#settings"]);

  for (const [url, file] of [
    ["/tasks/new", "new-task.png"],
    ["/locations", "save-locations.png"],
    ["/notification-channels", "notifications.png"],
    ["/account", "account.png"],
    ["/users", "users.png"],
    ["/api-keys", "api-keys.png"],
  ]) {
    await open(page, url);
    await fullPage(page, file);
  }

  const guest = await newPage(browser, { signedIn: false });
  await open(guest, "/login");
  await guest.setViewportSize({ width: 1280, height: 575 });
  await guest.screenshot({ path: path.join(OUT, "login.png") });
  console.log("   login.png");
}

// Three phone screens side by side: the dashboard, the task page with its
// section menu open, and a backup's actions drawer.
async function mobile(browser) {
  const shots = [];
  const phone = async (fn) => {
    const page = await newPage(browser, { mobile: true });
    await fn(page);
    shots.push((await page.screenshot()).toString("base64"));
  };

  await phone(async (page) => {
    await open(page, "/");
  });
  await phone(async (page) => {
    await open(page, SHOP);
    await page.evaluate(() => window.scrollTo(0, document.getElementById("notifications").offsetTop - 140));
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: /Section:/ }).click();
    await page.waitForTimeout(150);
  });
  await phone(async (page) => {
    await open(page, SHOP);
    await page.getByRole("button", { name: "Backup actions" }).first().click();
    await page.waitForTimeout(300);
  });

  const page = await newPage(browser, { signedIn: false });
  await page.setViewportSize({ width: 800, height: 553 });
  await page.setContent(`
    <body style="margin:0;background:#fff;display:flex;gap:25px;padding:0">
      ${shots.map((b) => `<img src="data:image/png;base64,${b}" style="width:250px;height:541px;border:1px solid #E2E0D8;display:block">`).join("")}
    </body>`);
  await page.screenshot({ path: path.join(OUT, "mobile.png"), clip: { x: 0, y: 0, width: 800, height: 543 } });
  console.log("   mobile.png");
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
  try {
    console.log("Desktop:");
    await desktop(browser);
    console.log("Mobile:");
    await mobile(browser);
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
