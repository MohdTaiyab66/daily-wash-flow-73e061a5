#!/usr/bin/env node
/**
 * UI smoke test: the "Default" badge appears on exactly one vehicle in the
 * customer vehicle list, and switching the default via the edit screen
 * moves the badge to the newly selected vehicle instantly.
 *
 * Runs against a live preview using an authenticated Supabase session
 * injected into localStorage (LOVABLE_BROWSER_* vars) if available,
 * otherwise you must sign in interactively before invoking.
 *
 *   BASE_URL=http://localhost:8080 node scripts/test-default-vehicle-badge.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:8080";
const OUT = "/tmp/browser/default-vehicle";
fs.mkdirSync(OUT, { recursive: true });

const storageKey = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
const sessionJson = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
const cookiesJson = process.env.LOVABLE_BROWSER_SUPABASE_COOKIES_JSON;

function fail(msg) {
  console.error("✗", msg);
  process.exitCode = 1;
}
function ok(msg) {
  console.log("✓", msg);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 1800 } });

if (cookiesJson) {
  const cookies = JSON.parse(cookiesJson).map((c) => ({ ...c, url: BASE_URL }));
  await context.addCookies(cookies);
}
const page = await context.newPage();
await page.goto(BASE_URL);
if (storageKey && sessionJson) {
  await page.evaluate(
    ([k, v]) => window.localStorage.setItem(k, v),
    [storageKey, sessionJson],
  );
}

await page.goto(`${BASE_URL}/c/vehicles`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-testid="vehicle-row"]', { timeout: 8000 });
await page.screenshot({ path: path.join(OUT, "1_list.png") });

const rows = await page.$$('[data-testid="vehicle-row"]');
if (rows.length < 2) {
  fail(`need at least 2 vehicles to test, found ${rows.length}`);
  await browser.close();
  process.exit(process.exitCode ?? 1);
}

async function readState() {
  return page.$$eval('[data-testid="vehicle-row"]', (els) =>
    els.map((el) => ({
      id: el.getAttribute("data-vehicle-id"),
      isDefault: el.getAttribute("data-is-default") === "true",
      hasBadge: !!el.querySelector('[data-testid="default-badge"]'),
    })),
  );
}

const initial = await readState();
const defaults = initial.filter((r) => r.isDefault);
const badges = initial.filter((r) => r.hasBadge);

if (defaults.length !== 1) fail(`expected exactly 1 default row, got ${defaults.length}`);
else ok("exactly one row marked default");

if (badges.length !== 1) fail(`expected exactly 1 Default badge, got ${badges.length}`);
else ok("Default badge appears once");

if (defaults[0]?.id !== badges[0]?.id)
  fail("badge is on a different row than the default flag");
else ok("badge matches the default row");

// Pick a non-default vehicle to promote.
const target = initial.find((r) => !r.isDefault);
if (!target) {
  fail("no non-default vehicle to promote");
  await browser.close();
  process.exit(process.exitCode ?? 1);
}

await page.goto(`${BASE_URL}/c/vehicles/${target.id}`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-testid="default-vehicle-card"]');
const editCard = await page.$('[data-testid="default-vehicle-card"]');
const editIsDefault = await editCard.getAttribute("data-is-default");
if (editIsDefault !== "false") fail("edit screen should show non-default state for target");
else ok("edit screen shows target as non-default");

await page.screenshot({ path: path.join(OUT, "2_edit_before.png") });
await page.click('[data-testid="set-as-default-button"]');
await page.waitForFunction(
  () =>
    document
      .querySelector('[data-testid="default-vehicle-card"]')
      ?.getAttribute("data-is-default") === "true",
  { timeout: 5000 },
);
ok("edit card flipped to default instantly");
await page.screenshot({ path: path.join(OUT, "3_edit_after.png") });

await page.goto(`${BASE_URL}/c/vehicles`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-testid="vehicle-row"]');
const after = await readState();
const afterDefaults = after.filter((r) => r.isDefault);
const afterBadges = after.filter((r) => r.hasBadge);
await page.screenshot({ path: path.join(OUT, "4_list_after.png") });

if (afterDefaults.length !== 1) fail(`after: expected 1 default, got ${afterDefaults.length}`);
else ok("after switch: still exactly one default");

if (afterBadges.length !== 1) fail(`after: expected 1 badge, got ${afterBadges.length}`);
else ok("after switch: badge appears exactly once");

if (afterDefaults[0]?.id !== target.id)
  fail(`after: default did not move to target ${target.id}`);
else ok("default moved to the newly selected vehicle");

await browser.close();
if (process.exitCode) {
  console.error("FAIL");
  process.exit(process.exitCode);
}
console.log("PASS — Default badge behaves correctly");
