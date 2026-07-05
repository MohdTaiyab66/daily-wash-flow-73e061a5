// Playwright + RPC regression for Daily Shine vehicle-scoped entitlements.
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... TEST_CUSTOMER_EMAIL=... TEST_CUSTOMER_PASSWORD=... \
//   BASE_URL=http://localhost:8080 node scripts/test-entitlements.mjs

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync } from "node:fs";

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  TEST_CUSTOMER_EMAIL,
  TEST_CUSTOMER_PASSWORD,
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

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CARS = [
  { make: "Hyundai", model: "Creta", registration_number: "ENT-CRETA-001", category: "sedan_suv" },
  { make: "Hyundai", model: "Venue", registration_number: "ENT-VENUE-002", category: "sedan_suv" },
  { make: "Honda", model: "City", registration_number: "ENT-CITY-003", category: "sedan_suv" },
];

async function ensureUser() {
  const { data: users } = await admin.auth.admin.listUsers();
  let user = users?.users?.find((u) => u.email === TEST_CUSTOMER_EMAIL) ?? null;
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: TEST_CUSTOMER_EMAIL,
      password: TEST_CUSTOMER_PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    user = data.user;
  }
  return user;
}

async function seed(userId) {
  await admin.from("customer_vehicles").delete().in("registration_number", CARS.map((c) => c.registration_number));
  const { data: vehicles, error: vehErr } = await admin.from("customer_vehicles").insert(
    CARS.map((c, i) => ({ user_id: userId, ...c, is_default: i === 0 })),
  ).select();
  if (vehErr) throw vehErr;

  const { data: service, error: svcErr } = await admin
    .from("service_catalog")
    .select("id,slug")
    .eq("slug", "daily-shine-exterior")
    .single();
  if (svcErr) throw svcErr;

  const { data: planService, error: planSvcErr } = await admin
    .from("service_catalog")
    .select("id,slug")
    .eq("slug", "daily-shine")
    .single();
  if (planSvcErr) throw planSvcErr;

  const { data: addr, error: addrErr } = await admin.from("customer_addresses").insert({
    user_id: userId,
    label: "Home",
    address_line: "Entitlement Test Address",
    area: "Test Area",
    latitude: 26.8467,
    longitude: 80.9462,
    is_default: true,
  }).select("id").single();
  if (addrErr) throw addrErr;

  const subBookings = [];
  for (const v of vehicles.slice(0, 2)) {
    const { data: booking, error } = await admin.from("bookings").insert({
      user_id: userId,
      service_id: planService.id,
      vehicle_id: v.id,
      address_id: addr.id,
      scheduled_date: new Date().toISOString().slice(0, 10),
      scheduled_time: "Before 10 AM",
      preferred_before_time: "Before 10 AM",
      base_amount: 999,
      total_amount: 999,
      status: "paid",
      payment_status: "paid",
    }).select("id,vehicle_id").single();
    if (error) throw error;
    subBookings.push(booking);
  }

  const subRows = subBookings.map((booking) => ({
    booking_id: booking.id,
    user_id: userId,
    customer_id: userId,
    vehicle_id: booking.vehicle_id,
    plan_slug: "daily-shine",
    status: "active",
    start_date: new Date().toISOString().slice(0, 10),
    renewal_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    service_start_date: new Date().toISOString().slice(0, 10),
    amount: 999,
  }));
  const { data: subs, error: subErr } = await admin.from("subscriptions").insert(subRows).select();
  if (subErr) throw subErr;
  for (const s of subs) {
    const { error } = await admin.rpc("ensure_entitlements_for_subscription", { p_sub_id: s.id });
    if (error) throw error;
  }
  return { vehicles, service, addr };
}

async function main() {
  const user = await ensureUser();
  const { vehicles, service, addr } = await seed(user.id);

  const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  req("VITE_SUPABASE_PUBLISHABLE_KEY", publishableKey);
  const customer = createClient(SUPABASE_URL, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signIn = await customer.auth.signInWithPassword({ email: TEST_CUSTOMER_EMAIL, password: TEST_CUSTOMER_PASSWORD });
  if (signIn.error) throw signIn.error;

  const a = vehicles[0];
  const b = vehicles[1];
  const c = vehicles[2];

  const previewA = await customer.rpc("preview_customer_booking", {
    p_service_id: service.id, p_vehicle_id: a.id, p_address_id: addr.id,
    p_scheduled_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10), p_scheduled_time: "Before 10 AM",
    p_addons: [], p_coupon_code: null,
  });
  if (previewA.error || previewA.data.payable !== 0 || !previewA.data.used_entitlement) {
    throw new Error(`Vehicle A preview failed: ${previewA.error?.message || JSON.stringify(previewA.data)}`);
  }

  const bookA = await customer.rpc("confirm_customer_booking", {
    p_service_id: service.id, p_vehicle_id: a.id, p_address_id: addr.id,
    p_scheduled_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10), p_scheduled_time: "Before 10 AM",
    p_notes: "Entitlement regression A", p_coupon_code: null, p_addons: [],
  });
  if (bookA.error) throw bookA.error;
  const { data: bookingA } = await admin.from("bookings").select("total_amount,payment_status,vehicle_id").eq("id", bookA.data).single();
  if (Number(bookingA.total_amount) !== 0 || bookingA.payment_status !== "paid" || bookingA.vehicle_id !== a.id) {
    throw new Error(`Vehicle A booking charged or mismatched: ${JSON.stringify(bookingA)}`);
  }

  const previewA2 = await customer.rpc("preview_customer_booking", {
    p_service_id: service.id, p_vehicle_id: a.id, p_address_id: addr.id,
    p_scheduled_date: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10), p_scheduled_time: "Before 10 AM",
    p_addons: [], p_coupon_code: null,
  });
  if (previewA2.error || previewA2.data.payable <= 0 || previewA2.data.used_entitlement) {
    throw new Error(`Vehicle A exhausted preview failed: ${previewA2.error?.message || JSON.stringify(previewA2.data)}`);
  }

  const previewB = await customer.rpc("preview_customer_booking", {
    p_service_id: service.id, p_vehicle_id: b.id, p_address_id: addr.id,
    p_scheduled_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10), p_scheduled_time: "Before 10 AM",
    p_addons: [], p_coupon_code: null,
  });
  if (previewB.error || previewB.data.payable !== 0 || !previewB.data.used_entitlement) {
    throw new Error(`Vehicle B entitlement leaked/failed: ${previewB.error?.message || JSON.stringify(previewB.data)}`);
  }

  const previewC = await customer.rpc("preview_customer_booking", {
    p_service_id: service.id, p_vehicle_id: c.id, p_address_id: addr.id,
    p_scheduled_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10), p_scheduled_time: "Before 10 AM",
    p_addons: [], p_coupon_code: null,
  });
  if (previewC.error || previewC.data.payable <= 0 || previewC.data.used_entitlement) {
    throw new Error(`Vehicle C no-sub preview failed: ${previewC.error?.message || JSON.stringify(previewC.data)}`);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1800 } });
  const page = await context.newPage();
  mkdirSync("/tmp/browser/entitlements", { recursive: true });
  await page.goto(`${BASE_URL}/c/auth`, { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', TEST_CUSTOMER_EMAIL);
  await page.fill('input[type="password"]', TEST_CUSTOMER_PASSWORD);
  await page.click('button:has-text("Sign in")');
  await page.waitForURL(/\/c\//, { timeout: 15000 });
  await page.goto(`${BASE_URL}/c/service/daily-shine-exterior?vehicleId=${b.id}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('text=Included in your Daily Shine Plan', { timeout: 15000 });
  await page.waitForSelector('text=₹0 Payable', { timeout: 15000 });
  await page.screenshot({ path: "/tmp/browser/entitlements/included-preview.png" });
  await browser.close();

  console.log("[entitlements] OK: vehicle-scoped preview, booking, exhaustion and UI included state verified");
}

main().catch((err) => { console.error(err); process.exit(1); });