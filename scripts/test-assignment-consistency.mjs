// End-to-end consistency test: verifies that an ACTIVE partner assignment
// shows the exact same customer count across Home, My Assignment and Live
// Route screens.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   TEST_PARTNER_EMAIL=... TEST_PARTNER_PASSWORD=... \
//   BASE_URL=http://localhost:8080 node scripts/test-assignment-consistency.mjs

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  TEST_PARTNER_EMAIL,
  TEST_PARTNER_PASSWORD,
  BASE_URL = "http://localhost:8080",
} = process.env;

function req(name, v) { if (!v) { console.error(`Missing env: ${name}`); process.exit(2); } return v; }
req("SUPABASE_URL", SUPABASE_URL);
req("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_SERVICE_ROLE_KEY);
req("TEST_PARTNER_EMAIL", TEST_PARTNER_EMAIL);
req("TEST_PARTNER_PASSWORD", TEST_PARTNER_PASSWORD);

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function extractCount(text) {
  // Match "12 Customers" or "12 Customer" (case insensitive)
  const m = text.match(/(\d+)\s+Customer/i);
  return m ? Number(m[1]) : null;
}

async function main() {
  // Look up the partner's active assignment and today's expected count from
  // the database — this is the ground truth we compare screens against.
  const { data: users } = await admin.auth.admin.listUsers();
  const user = users?.users?.find((u) => u.email === TEST_PARTNER_EMAIL);
  if (!user) { console.error("Test partner not found in auth.users"); process.exit(1); }
  const today = new Date().toISOString().slice(0, 10);

  const { data: report, error: rpcErr } = await admin.rpc("validate_today_assignment", {
    p_partner: user.id,
  });
  if (rpcErr) { console.error("validate_today_assignment failed:", rpcErr); process.exit(1); }
  console.log("[test] DB integrity report:", report);
  if (report && report.mismatches && report.mismatches.length > 0) {
    console.error("[test] FAIL: DB reports mismatches:", report.mismatches);
    process.exit(1);
  }

  const expected = Number(report?.today_customers ?? 0);
  console.log(`[test] expected today's customers = ${expected}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1800 } });
  const page = await context.newPage();

  try {
    // Sign in as partner
    await page.goto(`${BASE_URL}/auth`, { waitUntil: "domcontentloaded" });
    await page.fill('input[type="email"]', TEST_PARTNER_EMAIL);
    await page.fill('input[type="password"]', TEST_PARTNER_PASSWORD);
    await page.click('button:has-text("Sign in")');
    await page.waitForURL(/\/app/, { timeout: 15000 });

    const counts = {};

    // ---- Home ----
    await page.goto(`${BASE_URL}/app`);
    await page.waitForSelector("text=/Today's Route|Rest Day|Ready for today/i", { timeout: 15000 });
    counts.home = extractCount((await page.textContent("body")) ?? "");

    // ---- My Assignment ----
    await page.goto(`${BASE_URL}/app/my-assignment`);
    await page.waitForSelector("text=/My assignment|No active assignment/i", { timeout: 15000 });
    counts.assignment = extractCount((await page.textContent("body")) ?? "");

    // ---- Live route ----
    await page.goto(`${BASE_URL}/app/live`);
    await page.waitForSelector("text=/Today's route/i", { timeout: 15000 });
    counts.live = extractCount((await page.textContent("body")) ?? "");

    console.log("[test] on-screen counts:", counts);

    const values = Object.values(counts).filter((v) => v !== null);
    if (values.length === 0) {
      console.error("[test] FAIL: could not extract any customer count from screens");
      process.exit(1);
    }
    const distinct = new Set(values);
    if (distinct.size > 1) {
      console.error("[test] FAIL: screens disagree on customer count:", counts);
      process.exit(1);
    }
    if (expected > 0 && values[0] !== expected) {
      console.error(`[test] FAIL: DB says ${expected}, UI shows ${values[0]}`);
      process.exit(1);
    }
    console.log("[test] OK: all screens agree on customer count =", values[0]);
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
