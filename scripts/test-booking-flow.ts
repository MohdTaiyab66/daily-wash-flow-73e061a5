/**
 * End-to-end booking confirmation check.
 *
 * Exercises the real booking flow against the live backend:
 *   1. signs up a brand-new customer
 *   2. adds a vehicle + address as that user (RLS)
 *   3. calls the confirm_customer_booking RPC with multi-quantity add-ons
 *   4. asserts the booking row, line items, totals and status are receipt-ready
 *   5. verifies the booking is visible via the same SELECT the My Bookings UI uses
 *   6. cleans up the rows it created
 *
 * Run with:  bun scripts/test-booking-flow.ts
 * Exits non-zero on any failed assertion.
 */
import { createClient } from "@supabase/supabase-js";

const URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;
if (!URL || !KEY) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY");
  process.exit(2);
}

// Public add-on with empty applies_to_slugs so it works with any service.
const SERVICE_SLUG = "one_time_basic";
const ADDON_NAME = "Buffing Polish"; // price_hatchback = 999, applies_to_slugs = {}

const supabase = createClient(URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const assertions: { name: string; ok: boolean; detail?: string }[] = [];
function check(name: string, ok: boolean, detail?: string) {
  assertions.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"}  ${name}${detail ? "  — " + detail : ""}`);
}

async function main() {
  const stamp = Date.now();
  const email = `booking-e2e+${stamp}@example.com`;
  const password = `Test!${stamp}aA1`;

  // 1. Sign up + sign in
  const { data: signUp, error: signUpErr } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { role: "customer", full_name: "Booking E2E" } },
  });
  if (signUpErr) throw new Error("signUp failed: " + signUpErr.message);
  let session = signUp.session;
  if (!session) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error("signIn failed: " + error.message);
    session = data.session;
  }
  if (!session) throw new Error("no session after signUp/signIn");
  check("auth: signed in fresh customer", true, email);

  // 2. Reference data must exist
  const { data: service, error: svcErr } = await supabase
    .from("service_catalog")
    .select("id, slug, price_hatchback")
    .eq("slug", SERVICE_SLUG)
    .single();
  if (svcErr || !service) throw new Error("service catalog missing: " + SERVICE_SLUG);

  const { data: addon, error: addonErr } = await supabase
    .from("service_addons")
    .select("id, name, price_hatchback, applies_to_slugs")
    .eq("name", ADDON_NAME)
    .single();
  if (addonErr || !addon) throw new Error("addon missing: " + ADDON_NAME);

  // 3. Seed vehicle + address as the user (RLS self-insert)
  const { data: vehicle, error: vehErr } = await supabase
    .from("customer_vehicles")
    .insert({
      user_id: session.user.id,
      make: "Maruti",
      model: "Swift",
      category: "hatchback_compact_sedan",
      registration_number: `E2E${stamp.toString().slice(-6)}`,
      is_default: true,
    })
    .select("id")
    .single();
  if (vehErr || !vehicle) throw new Error("vehicle insert failed: " + vehErr?.message);

  const { data: address, error: addrErr } = await supabase
    .from("customer_addresses")
    .insert({
      user_id: session.user.id,
      label: "Home",
      address_line: "1 E2E Lane",
      area: "TestArea",
      pincode: "226010",
      is_default: true,
    })
    .select("id")
    .single();
  if (addrErr || !address) throw new Error("address insert failed: " + addrErr?.message);

  // 4. The booking RPC — this is the exact call site the UI uses
  const scheduledDate = new Date(Date.now() + 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  const dustQty = 4;
  const polishQty = 1;
  const { data: bookingId, error: rpcErr } = await supabase.rpc(
    "confirm_customer_booking",
    {
      p_service_id: service.id,
      p_vehicle_id: vehicle.id,
      p_address_id: address.id,
      p_scheduled_date: scheduledDate,
      p_scheduled_time: "09:00",
      p_notes: "e2e",
      p_coupon_code: null,
      p_addons: [
        { id: addon.id, quantity: dustQty },
        { id: addon.id, quantity: polishQty }, // duplicate id with diff qty is allowed
      ],
    },
  );
  check("rpc: confirm_customer_booking returned id", !rpcErr && !!bookingId, rpcErr?.message);
  if (!bookingId) throw new Error("RPC failed, aborting");

  // 5. Booking row + line items
  const { data: booking, error: bErr } = await supabase
    .from("bookings")
    .select("*, booking_addons(*)")
    .eq("id", bookingId)
    .single();
  check("db: booking row exists", !bErr && !!booking, bErr?.message);
  if (!booking) throw new Error("booking missing");

  check("status: pending_payment", booking.status === "pending_payment", booking.status);
  check("payment_status: pending", booking.payment_status === "pending", booking.payment_status);
  check(
    "amount: base = service price (hatchback)",
    Number(booking.base_amount) === Number(service.price_hatchback),
    `${booking.base_amount} vs ${service.price_hatchback}`,
  );
  const expectedAddon = Number(addon.price_hatchback) * (dustQty + polishQty);
  check(
    "amount: addon honours multi-quantity",
    Number(booking.addon_amount) === expectedAddon,
    `${booking.addon_amount} vs ${expectedAddon}`,
  );
  check(
    "amount: receipt total = base + addons - discount",
    Number(booking.total_amount) ===
      Number(booking.base_amount) +
        Number(booking.addon_amount) -
        Number(booking.discount_amount),
    String(booking.total_amount),
  );
  check(
    "line items: both add-on rows persisted",
    Array.isArray(booking.booking_addons) && booking.booking_addons.length === 2,
    String(booking.booking_addons?.length),
  );
  const totalQty = (booking.booking_addons ?? []).reduce(
    (sum: number, row: { quantity: number }) => sum + Number(row.quantity),
    0,
  );
  check("line items: quantities sum correctly", totalQty === dustQty + polishQty, String(totalQty));

  // 6. The My Bookings panel must immediately see it
  const { data: listed, error: lErr } = await supabase
    .from("bookings")
    .select("id")
    .eq("user_id", session.user.id);
  check(
    "list: booking appears for the customer (My Bookings view)",
    !lErr && (listed ?? []).some((b) => b.id === bookingId),
    lErr?.message,
  );

  // 7. Past-date is rejected (defensive — keeps the UI from confirming bad input)
  const past = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
  const { error: pastErr } = await supabase.rpc("confirm_customer_booking", {
    p_service_id: service.id,
    p_vehicle_id: vehicle.id,
    p_address_id: address.id,
    p_scheduled_date: past,
    p_scheduled_time: "09:00",
    p_addons: [],
  });
  check("guard: past dates are rejected", !!pastErr, pastErr?.message);

  // 8. Coupon that needs more vehicles is rejected
  const { error: cpnErr } = await supabase.rpc("confirm_customer_booking", {
    p_service_id: service.id,
    p_vehicle_id: vehicle.id,
    p_address_id: address.id,
    p_scheduled_date: scheduledDate,
    p_scheduled_time: "10:00",
    p_coupon_code: "EXTRA10",
    p_addons: [],
  });
  check(
    "guard: EXTRA10 rejected when vehicle count too low",
    !!cpnErr && /vehicle/i.test(cpnErr?.message ?? ""),
    cpnErr?.message,
  );

  // 9. Cleanup what we created (cascades booking_addons)
  await supabase.from("bookings").delete().eq("id", bookingId);
  await supabase.from("customer_vehicles").delete().eq("id", vehicle.id);
  await supabase.from("customer_addresses").delete().eq("id", address.id);

  const failed = assertions.filter((a) => !a.ok);
  console.log("\n" + "─".repeat(60));
  if (failed.length === 0) {
    console.log(`ALL ${assertions.length} BOOKING E2E CHECKS PASSED`);
    process.exit(0);
  } else {
    console.log(`${failed.length} / ${assertions.length} CHECKS FAILED`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("FATAL:", err.message ?? err);
  process.exit(1);
});
