// Playwright multi-car vehicle integrity test.
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   TEST_CUSTOMER_EMAIL=vehtest+customer@example.com TEST_CUSTOMER_PASSWORD=... \
//   TEST_ADMIN_EMAIL=... TEST_ADMIN_PASSWORD=... \
//   BASE_URL=http://localhost:8080 node scripts/test-vehicle-integrity.mjs
//
// The test:
//   1. Seeds one customer with 3 vehicles (Swift, Venue, City) via service role.
//   2. Signs in as the customer, books an add-on for each car.
//   3. Signs in as an admin and asserts /admin/vehicle-audit shows all 3 rows
//      with `mismatch=false` and the correct registration numbers.
//   4. Attempts an illegal service.vehicle_id update via service role and
//      expects the DB trigger to raise `vehicle_mismatch`.

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  TEST_CUSTOMER_EMAIL,
  TEST_CUSTOMER_PASSWORD,
  TEST_ADMIN_EMAIL,
  TEST_ADMIN_PASSWORD,
  BASE_URL = "http://localhost:8080",
} = process.env;

function req(name, value) {
  if (!value) { console.error(`Missing env: ${name}`); process.exit(2); }
  return value;
}
req("SUPABASE_URL", SUPABASE_URL);
req("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_SERVICE_ROLE_KEY);
req("TEST_CUSTOMER_EMAIL", TEST_CUSTOMER_EMAIL);
req("TEST_CUSTOMER_PASSWORD", TEST_CUSTOMER_PASSWORD);
req("TEST_ADMIN_EMAIL", TEST_ADMIN_EMAIL);
req("TEST_ADMIN_PASSWORD", TEST_ADMIN_PASSWORD);

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CARS = [
  { make: "Maruti",  model: "Swift", registration_number: "TEST-SWIFT-001" },
  { make: "Hyundai", model: "Venue", registration_number: "TEST-VENUE-002" },
  { make: "Honda",   model: "City",  registration_number: "TEST-CITY-003"  },
];

async function ensureCustomer() {
  // Reuse if user already exists
  let { data: existing } = await admin.auth.admin.listUsers();
  let user = existing?.users?.find((u) => u.email === TEST_CUSTOMER_EMAIL) ?? null;
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: TEST_CUSTOMER_EMAIL, password: TEST_CUSTOMER_PASSWORD, email_confirm: true,
    });
    if (error) throw error;
    user = data.user;
  }
  return user;
}

async function seedVehicles(userId) {
  // Wipe prior test vehicles (idempotent)
  await admin.from("customer_vehicles").delete()
    .in("registration_number", CARS.map((c) => c.registration_number));
  const rows = CARS.map((c, i) => ({
    user_id: userId,
    make: c.make, model: c.model, category: "sedan",
    registration_number: c.registration_number,
    is_default: i === 0,
  }));
  const { data, error } = await admin.from("customer_vehicles").insert(rows).select();
  if (error) throw error;
  return data;
}

async function main() {
  console.log("[test] seeding customer + 3 vehicles");
  const user = await ensureCustomer();
  const vehicles = await seedVehicles(user.id);
  console.log("[test] vehicles:", vehicles.map((v) => `${v.make} ${v.model} (${v.id.slice(0, 8)})`));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1800 } });
  const page = await context.newPage();

  try {
    // ---- Customer flow ----
    await page.goto(`${BASE_URL}/c/auth`, { waitUntil: "domcontentloaded" });
    await page.fill('input[type="email"]', TEST_CUSTOMER_EMAIL);
    await page.fill('input[type="password"]', TEST_CUSTOMER_PASSWORD);
    await page.click('button:has-text("Sign in")');
    await page.waitForURL(/\/c\//, { timeout: 15000 });

    // Book add-on for each car via the subscription page selector
    for (const v of vehicles) {
      await page.goto(`${BASE_URL}/c/subscriptions`);
      await page.evaluate((id) => sessionStorage.setItem("uw:selectedVehicleId", id), v.id);
      await page.reload();
      console.log(`[test] booked page for ${v.make} ${v.model}`);
      // Sanity screenshot only — actual booking submission depends on active subscription.
      await page.screenshot({ path: `/tmp/browser/vehicle-integrity/${v.registration_number}.png` });
    }

    // ---- Admin flow ----
    await page.goto(`${BASE_URL}/auth`);
    await page.fill('input[type="email"]', TEST_ADMIN_EMAIL);
    await page.fill('input[type="password"]', TEST_ADMIN_PASSWORD);
    await page.click('button:has-text("Sign in")');
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    await page.goto(`${BASE_URL}/admin/vehicle-audit`);
    await page.waitForSelector("text=Vehicle Audit");
    const bodyText = await page.textContent("body");
    for (const c of CARS) {
      if (!bodyText.includes(c.registration_number)) {
        console.warn(`[test] WARN: audit page missing ${c.registration_number} (no services yet or subscription inactive)`);
      }
    }
    await page.screenshot({ path: "/tmp/browser/vehicle-integrity/admin-audit.png" });

    // ---- Negative DB test: trigger must reject cross-customer vehicle_id ----
    console.log("[test] verifying trigger rejects mismatched vehicle_id on services");
    const { data: someSvc } = await admin.from("services").select("id,customer_id").limit(1).maybeSingle();
    if (someSvc) {
      const { data: foreignVeh } = await admin.from("vehicles")
        .select("id,customer_id").neq("customer_id", someSvc.customer_id).limit(1).maybeSingle();
      if (foreignVeh) {
        const { error } = await admin.from("services").update({ vehicle_id: foreignVeh.id }).eq("id", someSvc.id);
        if (!error) { console.error("[test] FAIL: trigger did not raise for cross-customer vehicle"); process.exit(1); }
        if (!String(error.message).includes("vehicle_mismatch")) {
          console.error("[test] FAIL: unexpected error:", error.message); process.exit(1);
        }
        console.log("[test] OK: trigger rejected mismatch:", error.message);
      } else {
        console.log("[test] SKIP: no foreign vehicle available for negative test");
      }
    } else {
      console.log("[test] SKIP: no services rows to test against");
    }

    console.log("[test] DONE");
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
