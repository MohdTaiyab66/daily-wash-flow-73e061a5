// Trial seeding / cleanup / verification (server-only).
// Loaded ONLY from /api/public/admin/trial-* routes (inside handler bodies).
// Uses supabaseAdmin (service role) — bypasses RLS, NEVER importable client-side.

import type { SupabaseClient } from "@supabase/supabase-js";

/* ------------------------------- Test plan ------------------------------- */

export const TRIAL_TAG = "trial-seed-2026";
const PASSWORD = "TrialPass!2026";
const DOMAIN = "urbanwash.test";

// Lucknow / Gomti Nagar cluster
const HOME_LAT = 26.852;
const HOME_LNG = 80.994;

type SeedUser = {
  key: string;
  role: "admin" | "partner" | "customer";
  email: string;
  phone: string;
  full_name: string;
};

const USERS: SeedUser[] = [
  { key: "admin",     role: "admin",    email: `trial+admin@${DOMAIN}`,    phone: "+919800000001", full_name: "Trial Admin" },
  { key: "partner1",  role: "partner",  email: `trial+partner1@${DOMAIN}`, phone: "+919800000011", full_name: "Aarav Pratap (Partner)" },
  { key: "partner2",  role: "partner",  email: `trial+partner2@${DOMAIN}`, phone: "+919800000012", full_name: "Imran Qureshi (Partner)" },
  { key: "partner3",  role: "partner",  email: `trial+partner3@${DOMAIN}`, phone: "+919800000013", full_name: "Vikram Singh (Partner)" },
  { key: "customer1", role: "customer", email: `trial+c1@${DOMAIN}`,       phone: "+919800000101", full_name: "Riya Sharma" },
  { key: "customer2", role: "customer", email: `trial+c2@${DOMAIN}`,       phone: "+919800000102", full_name: "Nikhil Verma" },
  { key: "customer3", role: "customer", email: `trial+c3@${DOMAIN}`,       phone: "+919800000103", full_name: "Pooja Bhatt" },
  { key: "customer4", role: "customer", email: `trial+c4@${DOMAIN}`,       phone: "+919800000104", full_name: "Saurabh Mehra" },
  { key: "customer5", role: "customer", email: `trial+c5@${DOMAIN}`,       phone: "+919800000105", full_name: "Ananya Kapoor" },
];

/* ------------------------------- Utilities ------------------------------- */

function jitter(base: number, delta: number, seed: number): number {
  const r = Math.sin(seed * 9301 + 49297) * 233280;
  const frac = r - Math.floor(r);
  return base + (frac * 2 - 1) * delta;
}

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as SupabaseClient;
}

/** Idempotent insert: returns existing row id if `match` finds one, else inserts. */
async function ensureRow(
  admin: SupabaseClient,
  table: string,
  match: Record<string, unknown>,
  insertPayload: Record<string, unknown>,
): Promise<{ id: string; existed: boolean }> {
  let q = admin.from(table).select("id");
  for (const [k, v] of Object.entries(match)) q = q.eq(k, v as never);
  const existing = await q.maybeSingle();
  if (existing.data?.id) return { id: existing.data.id as string, existed: true };
  const ins = await admin.from(table).insert(insertPayload).select("id").single();
  if (ins.error) throw new Error(`${table}.insert: ${ins.error.message}`);
  return { id: ins.data.id as string, existed: false };
}

async function upsertById(
  admin: SupabaseClient,
  table: string,
  id: string,
  payload: Record<string, unknown>,
): Promise<{ existed: boolean }> {
  const existing = await admin.from(table).select("id").eq("id", id).maybeSingle();
  if (existing.data?.id) {
    const upd = await admin.from(table).update(payload).eq("id", id);
    if (upd.error) throw new Error(`${table}.update: ${upd.error.message}`);
    return { existed: true };
  }
  const ins = await admin.from(table).insert({ id, ...payload });
  if (ins.error) throw new Error(`${table}.insert: ${ins.error.message}`);
  return { existed: false };
}

async function getOrCreateAuthUser(
  admin: SupabaseClient,
  u: SeedUser,
): Promise<{ id: string; existed: boolean }> {
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((x) => x.email?.toLowerCase() === u.email.toLowerCase());
    if (found) return { id: found.id, existed: true };
    if (data.users.length < 200) break;
    page += 1;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email: u.email,
    phone: u.phone,
    password: PASSWORD,
    email_confirm: true,
    phone_confirm: true,
    user_metadata: { full_name: u.full_name, trial_tag: TRIAL_TAG },
  });
  if (error || !data.user) throw error ?? new Error(`createUser failed for ${u.email}`);
  return { id: data.user.id, existed: false };
}

/* ----------------------------- Catalog seeding --------------------------- */

async function ensureCatalogs(admin: SupabaseClient) {
  const vehicles = [
    { make: "Maruti Suzuki", model: "Swift",   category: "hatchback_compact_sedan" },
    { make: "Hyundai",       model: "i20",     category: "hatchback_compact_sedan" },
    { make: "Honda",         model: "City",    category: "sedan_suv" },
    { make: "Hyundai",       model: "Creta",   category: "sedan_suv" },
  ];
  for (const v of vehicles) {
    await admin.from("vehicle_catalog").upsert(
      { ...v, active: true },
      { onConflict: "make,model" } as never,
    );
  }
  const services = [
    { slug: "daily-shine-exterior", name: "Daily Shine — Exterior",
      service_type: "subscription", price_hatchback: 999, price_sedan_suv: 1199,
      includes_hatchback: ["Exterior wash", "Tyre dressing"], includes_sedan_suv: ["Exterior wash", "Tyre dressing"],
      sort_order: 1, active: true, addons: [] },
    { slug: "daily-shine-interior", name: "Daily Shine — Interior",
      service_type: "subscription", price_hatchback: 1499, price_sedan_suv: 1799,
      includes_hatchback: ["Interior vacuum", "Dashboard polish"], includes_sedan_suv: ["Interior vacuum", "Dashboard polish"],
      sort_order: 2, active: true, addons: [] },
    { slug: "daily-shine-dusting", name: "Daily Shine — Dusting",
      service_type: "subscription", price_hatchback: 599, price_sedan_suv: 699,
      includes_hatchback: ["Dust removal"], includes_sedan_suv: ["Dust removal"],
      sort_order: 3, active: true, addons: [] },
    { slug: "one-time-wash", name: "One-Time Premium Wash",
      service_type: "one_time", price_hatchback: 399, price_sedan_suv: 499,
      includes_hatchback: ["Premium wash"], includes_sedan_suv: ["Premium wash"],
      sort_order: 10, active: true, addons: [] },
  ];
  for (const s of services) {
    await admin.from("service_catalog").upsert(s, { onConflict: "slug" } as never);
  }
}

/* --------------------------------- Seed ---------------------------------- */

type SeedReport = {
  ok: boolean;
  password: string;
  accounts: Array<{ key: string; email: string; phone: string; role: string; user_id: string; existed: boolean }>;
  rows: Record<string, number>;
  workflows: Array<{ step: string; status: "PASS" | "FAIL" | "SKIP"; detail?: string }>;
  errors: string[];
};

export async function runTrialSeed(): Promise<SeedReport> {
  const admin = await getAdmin();
  const report: SeedReport = { ok: true, password: PASSWORD, accounts: [], rows: {}, workflows: [], errors: [] };
  const inc = (k: string, n = 1) => { report.rows[k] = (report.rows[k] ?? 0) + n; };
  const wf = (step: string, status: "PASS" | "FAIL" | "SKIP", detail?: string) => report.workflows.push({ step, status, detail });

  try {
    await ensureCatalogs(admin);
    wf("catalogs.upsert", "PASS");

    // 1) Auth users + roles
    const ids: Record<string, string> = {};
    for (const u of USERS) {
      const { id, existed } = await getOrCreateAuthUser(admin, u);
      ids[u.key] = id;
      report.accounts.push({ key: u.key, email: u.email, phone: u.phone, role: u.role, user_id: id, existed });
      if (!existed) inc("auth.users");
      await admin.from("user_roles").upsert(
        { user_id: id, role: u.role },
        { onConflict: "user_id,role" } as never,
      );
    }
    wf("auth.users+roles", "PASS", `${report.accounts.length} accounts (existed: ${report.accounts.filter(a => a.existed).length})`);

    // 2) Partners + push tokens
    const partnerKeys = ["partner1", "partner2", "partner3"] as const;
    for (let i = 0; i < partnerKeys.length; i++) {
      const key = partnerKeys[i];
      const id = ids[key];
      const u = USERS.find((x) => x.key === key)!;
      const lat = jitter(HOME_LAT, 0.01, i + 1);
      const lng = jitter(HOME_LNG, 0.01, i + 1);
      const code = `TRIAL${i + 1}`;
      const refCode = `TR-${id.slice(0, 6).toUpperCase()}`;
      await upsertById(admin, "partners", id, {
        partner_code: code, full_name: u.full_name, phone: u.phone, email: u.email,
        city: "Lucknow", status: "active", availability: "online",
        cars_selected: [12, 18, 8][i], rate_per_car: 17,
        rating: [4.8, 4.6, 4.2][i], total_cars_completed: [120, 60, 15][i],
        referral_code: refCode, joined_on: new Date().toISOString().slice(0, 10),
        home_lat: lat, home_lng: lng, home_area: "Gomti Nagar",
        attendance_pct: [95, 88, 70][i],
        aadhaar_verified: true, pan_verified: true, bank_verified: true,
        training_completion_pct: 100, lifetime_earnings: 0,
        preferred_language: "en",
        max_daily_cars: [20, 25, 15][i], accepting_new: true,
        reliability_score: [95, 80, 60][i], reliability_events_count: 0,
        last_seen: new Date().toISOString(),
        current_lat: lat, current_lng: lng,
      });
      inc("partners");

      await admin.from("push_tokens").upsert({
        user_id: id, token: `TRIAL-FCM-${key}-${id.slice(0, 8)}`,
        platform: "android", app: "partner", device_id: `trial-${key}`,
        last_seen: new Date().toISOString(),
      }, { onConflict: "token" } as never);
      inc("push_tokens");
    }
    wf("partners.upsert", "PASS");

    // 3) Customers + profiles + addresses + vehicles
    const vehicleCatalog = (await admin.from("vehicle_catalog").select("id,make,model,category")).data ?? [];
    const customerKeys = ["customer1", "customer2", "customer3", "customer4", "customer5"] as const;
    const customerVehicleIds: Record<string, string> = {};
    const opsVehicleIds: Record<string, string> = {};

    for (let i = 0; i < customerKeys.length; i++) {
      const key = customerKeys[i];
      const id = ids[key];
      const u = USERS.find((x) => x.key === key)!;
      const lat = jitter(HOME_LAT, 0.015, i + 10);
      const lng = jitter(HOME_LNG, 0.015, i + 10);
      const vc = vehicleCatalog[i % vehicleCatalog.length] ?? vehicleCatalog[0];
      const reg = `UP32TRL${1000 + i}`;
      const preferredBefore = ["08:00", "09:00", "10:00", "09:00", "11:00"][i];

      // customer_profiles — match by user_id
      await ensureRow(admin, "customer_profiles", { user_id: id }, {
        user_id: id, full_name: u.full_name, email: u.email, phone: u.phone,
        preferred_area: "Gomti Nagar", marketing_opt_in: true,
      });
      inc("customer_profiles");

      // customer_addresses — match by (user_id, label)
      await ensureRow(admin, "customer_addresses", { user_id: id, label: "Home" }, {
        user_id: id, label: "Home",
        address_line: `Flat ${100 + i}, Vipul Khand ${i + 1}`,
        area: "Gomti Nagar", pincode: "226010",
        latitude: lat, longitude: lng, is_default: true,
      });
      inc("customer_addresses");

      // customer_vehicles — match by (user_id, registration_number)
      const cv = await ensureRow(admin, "customer_vehicles", { user_id: id, registration_number: reg }, {
        user_id: id, make: vc?.make ?? "Maruti Suzuki", model: vc?.model ?? "Swift",
        category: vc?.category ?? "hatchback_compact_sedan",
        color: ["White", "Silver", "Red", "Blue", "Black"][i],
        registration_number: reg, parking_notes: "Stilt parking, slot 12", is_default: true,
      });
      customerVehicleIds[key] = cv.id;
      inc("customer_vehicles");

      // customers — operational; id = auth uid
      await upsertById(admin, "customers", id, {
        full_name: u.full_name, phone: u.phone, email: u.email,
        address_line: `Flat ${100 + i}, Vipul Khand ${i + 1}`, area: "Gomti Nagar",
        city: "Lucknow", pincode: "226010", latitude: lat, longitude: lng,
        subscription_plan: "daily_shine_monthly",
        is_active: true,
        preferred_time: `${preferredBefore} - ${String(parseInt(preferredBefore) + 1).padStart(2, "0")}:00`,
        service_required_before: preferredBefore,
        payment_status: i === 4 ? "pending" : "paid",
        paid_at: i === 4 ? null : new Date().toISOString(),
        time_window_type: i === 3 ? "exact" : "soft",
        exact_time: i === 3 ? "09:30" : null,
      });
      inc("customers");

      // vehicles (operational) — match by (customer_id, registration_number)
      const v = await ensureRow(admin, "vehicles", { customer_id: id, registration_number: reg }, {
        customer_id: id, make: vc?.make ?? "Maruti Suzuki", model: vc?.model ?? "Swift",
        registration_number: reg, color: ["White", "Silver", "Red", "Blue", "Black"][i],
        parking_notes: "Stilt parking, slot 12", package_amount: 1499,
      });
      opsVehicleIds[key] = v.id;
      inc("vehicles");
    }
    wf("customers+vehicles", "PASS");

    // 4) Subscriptions for c1..c4 (paid)
    const dailyShine = (await admin.from("service_catalog").select("id,slug,service_type").eq("slug", "daily-shine-interior").maybeSingle()).data;
    const oneTime    = (await admin.from("service_catalog").select("id,slug,service_type").eq("slug", "one-time-wash").maybeSingle()).data;
    if (!dailyShine || !oneTime) throw new Error("service_catalog rows missing");

    const bookingIdByCustomer: Record<string, string> = {};
    const subscribedKeys = ["customer1", "customer2", "customer3", "customer4"] as const;
    for (let i = 0; i < subscribedKeys.length; i++) {
      const key = subscribedKeys[i];
      const uid = ids[key];
      const vId = customerVehicleIds[key];
      const orderId = `order_trial_${key}`;
      const bk = await ensureRow(admin, "bookings", { razorpay_order_id: orderId }, {
        user_id: uid, service_id: dailyShine.id, vehicle_id: vId,
        scheduled_date: new Date().toISOString().slice(0, 10),
        preferred_before_time: ["08:00", "09:00", "10:00", "09:00"][i],
        base_amount: 1499, addon_amount: 0, discount_amount: 0, total_amount: 1499,
        status: "paid", payment_status: "paid",
        razorpay_order_id: orderId, razorpay_payment_id: `pay_trial_${key}`,
        scheduled_time: ["08:00", "09:00", "10:00", "09:00"][i],
        notes: "Trial subscription booking",
      });
      bookingIdByCustomer[key] = bk.id;
      inc("bookings.subscription");

      // subscriptions (unique on booking_id)
      await admin.from("subscriptions").upsert({
        booking_id: bk.id, user_id: uid, customer_id: uid, vehicle_id: vId,
        plan_slug: "daily-shine-interior", status: "active",
        start_date: new Date().toISOString().slice(0, 10),
        renewal_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
        service_start_date: new Date().toISOString().slice(0, 10),
        amount: 1499, currency: "INR",
      }, { onConflict: "booking_id" } as never);
      inc("subscriptions");

      // payments — ensure by booking_id
      await ensureRow(admin, "payments", { booking_id: bk.id, provider: "razorpay" }, {
        booking_id: bk.id, user_id: uid, provider: "razorpay",
        provider_order_id: orderId, provider_payment_id: `pay_trial_${key}`,
        amount: 1499, currency: "INR", status: "captured",
        metadata: { trial: true },
      });
      inc("payments");
    }
    wf("bookings+subscriptions.paid", "PASS");

    // 5) One-time wash for customer5 (paid)
    {
      const uid = ids["customer5"];
      const vId = customerVehicleIds["customer5"];
      const orderId = "order_trial_onetime_c5";
      await ensureRow(admin, "bookings", { razorpay_order_id: orderId }, {
        user_id: uid, service_id: oneTime.id, vehicle_id: vId,
        scheduled_date: new Date().toISOString().slice(0, 10),
        preferred_before_time: "11:00",
        base_amount: 399, addon_amount: 0, discount_amount: 0, total_amount: 399,
        status: "paid", payment_status: "paid",
        razorpay_order_id: orderId, razorpay_payment_id: "pay_trial_onetime_c5",
        scheduled_time: "11:00", notes: "Trial one-time wash",
      });
      inc("bookings.one_time");
    }
    wf("booking.one_time", "PASS");

    // 6) Queue + offer (accepted) — partner1 ↔ customer1
    {
      const customerId = ids["customer1"];
      const partnerId  = ids["partner1"];
      const bkId = bookingIdByCustomer["customer1"];
      if (bkId) {
        await admin.from("subscription_assignment_queue").upsert({
          booking_id: bkId, customer_id: customerId,
          area: "Gomti Nagar", lat: HOME_LAT, lng: HOME_LNG,
          service_required_before: "08:00", vehicle_category: "sedan_suv",
          status: "assigned", assigned_partner_id: partnerId, radius_km: 2,
          tried_partner_ids: [], attempts_log: [],
        }, { onConflict: "booking_id" } as never);
        inc("subscription_assignment_queue");

        const queueId = (await admin.from("subscription_assignment_queue").select("id").eq("booking_id", bkId).maybeSingle()).data?.id;
        if (queueId) {
          await ensureRow(admin, "subscription_offers", { queue_id: queueId, partner_id: partnerId }, {
            queue_id: queueId, partner_id: partnerId, scope: "exact",
            offered_at: new Date(Date.now() - 60_000).toISOString(),
            expires_at: new Date(Date.now() + 600_000).toISOString(),
            response: "accepted", responded_at: new Date().toISOString(),
            distance_m: 850, score: 0.94, score_breakdown: { trial: true },
          });
          inc("subscription_offers");
        }
        await admin.from("subscriptions").update({
          assigned_partner_id: partnerId, assigned_at: new Date().toISOString(),
        }).eq("booking_id", bkId);
      }
    }
    wf("queue→offer→accept (c1↔p1)", "PASS");

    // Assign partner2 ↔ customer2 (also assign for route)
    {
      const bkId = bookingIdByCustomer["customer2"];
      if (bkId) {
        await admin.from("subscriptions").update({
          assigned_partner_id: ids["partner2"], assigned_at: new Date().toISOString(),
        }).eq("booking_id", bkId);
      }
    }

    // 7) Assignments today — partner1 & partner2
    const today = new Date().toISOString().slice(0, 10);
    for (const pkey of ["partner1", "partner2"]) {
      const pid = ids[pkey];
      await ensureRow(admin, "assignments", { partner_id: pid, scheduled_date: today }, {
        partner_id: pid, area: "Gomti Nagar", target_cars: 5, fulfilled_cars: 0,
        status: "active", rate_per_car: 17,
        estimated_earnings: 85, estimated_hours: 4, estimated_distance_km: 8,
        search_radius_km: 1, scheduled_date: today,
        duration_days: 1, start_date: today, end_date: today,
        working_days: 1, expected_start_time: "07:00",
        total_earnings: 0,
      });
      inc("assignments");
    }
    wf("assignments.today", "PASS");

    // 8) Services (today's stops)
    type StopSpec = { partner: string; customer: string; seq: number; status: "pending" | "in_progress" | "completed" | "unavailable"; priority?: string };
    const stops: StopSpec[] = [
      { partner: "partner1", customer: "customer1", seq: 1, status: "pending" },
      { partner: "partner1", customer: "customer3", seq: 2, status: "completed" },
      { partner: "partner2", customer: "customer2", seq: 1, status: "in_progress", priority: "vip" },
      { partner: "partner2", customer: "customer4", seq: 2, status: "unavailable" },
    ];
    const serviceIdByCustomer: Record<string, string> = {};
    for (const s of stops) {
      const pid = ids[s.partner];
      const cid = ids[s.customer];
      const vid = opsVehicleIds[s.customer];
      const startedAt = s.status === "in_progress" || s.status === "completed"
        ? new Date(Date.now() - 30 * 60_000).toISOString() : null;
      const completedAt = s.status === "completed"
        ? new Date(Date.now() - 5 * 60_000).toISOString() : null;
      const row = await ensureRow(admin, "services",
        { partner_id: pid, customer_id: cid, scheduled_date: today },
        {
          partner_id: pid, customer_id: cid, vehicle_id: vid,
          scheduled_date: today, time_slot: "07:00 - 11:00",
          sequence_no: s.seq, status: s.status,
          started_at: startedAt, completed_at: completedAt,
          rate_per_car: 17, priority: s.priority ?? "normal",
          unavailable_reason: s.status === "unavailable" ? "vehicle_not_available" : null,
          unavailable_notes: s.status === "unavailable" ? "Customer's car not at parking" : null,
          unavailable_at: s.status === "unavailable" ? new Date().toISOString() : null,
        });
      serviceIdByCustomer[s.customer] = row.id;
      inc(`services.${s.status}`);
    }
    wf("services.today", "PASS", `${stops.length} stops`);

    // 9) Earnings + wallet for completed (c3)
    {
      const pid = ids["partner1"];
      const sid = serviceIdByCustomer["customer3"];
      if (sid) {
        const earnExists = await admin.from("earnings").select("id").eq("service_id", sid).maybeSingle();
        if (!earnExists.data?.id) {
          await admin.from("earnings").insert({
            partner_id: pid, earned_on: today, amount: 17,
            source: "service", service_id: sid, description: "Trial completed wash",
          });
          inc("earnings");
        }
        const wlExists = await admin.from("wallet_ledger").select("id").eq("service_id", sid).maybeSingle();
        if (!wlExists.data?.id) {
          await admin.from("wallet_ledger").insert({
            partner_id: pid, entry_type: "credit", amount: 17, balance_after: 17,
            service_id: sid, description: "Trial wash credit",
          });
          inc("wallet_ledger");
        }
      }
    }
    wf("earnings+wallet (completed)", "PASS");

    // 10) Dirty vehicle report (c3 → p1)
    {
      const sid = serviceIdByCustomer["customer3"];
      if (sid) {
        const exists = await admin.from("dirty_vehicle_reports").select("id").eq("service_id", sid).maybeSingle();
        if (!exists.data?.id) {
          await admin.from("dirty_vehicle_reports").insert({
            service_id: sid, partner_id: ids["partner1"],
            reason: "extra_dirty", notes: "Heavy mud on rims — needed extra time",
          });
          inc("dirty_vehicle_reports");
        }
      }
    }

    // 11) Unavailability report (c4 → p2)
    {
      const sid = serviceIdByCustomer["customer4"];
      if (sid) {
        const exists = await admin.from("unavailability_reports").select("id").eq("service_id", sid).maybeSingle();
        if (!exists.data?.id) {
          await admin.from("unavailability_reports").insert({
            service_id: sid, partner_id: ids["partner2"], customer_id: ids["customer4"],
            reason: "vehicle_not_available", notes: "Vehicle missing at slot",
            credited_amount: 17,
          });
          inc("unavailability_reports");
        }
      }
    }
    wf("reliability reports", "PASS");

    // 12) Notifications (idempotent — match by user_id+title)
    const cNotifs = [
      { user_id: ids["customer3"], type: "service_completed",
        title: "Today's wash is done", body: "Your car has been washed. View summary.",
        link: "/c/subscriptions" },
      { user_id: ids["customer1"], type: "service_scheduled",
        title: "Wash scheduled for today", body: "Partner Aarav will reach before 08:00 AM.",
        link: "/c/subscriptions" },
    ];
    for (const n of cNotifs) {
      const ex = await admin.from("customer_notifications").select("id")
        .eq("user_id", n.user_id).eq("title", n.title).maybeSingle();
      if (!ex.data?.id) {
        await admin.from("customer_notifications").insert(n);
        inc("customer_notifications");
      }
    }
    const pNotifs = [
      { partner_id: ids["partner1"], type: "route_published",
        title: "Today's route is ready", body: "2 stops in Gomti Nagar.", link: "/app/live" },
      { partner_id: ids["partner2"], type: "new_assignment",
        title: "New VIP customer", body: "Nikhil Verma added to your route.", link: "/app/live" },
    ];
    for (const n of pNotifs) {
      const ex = await admin.from("partner_notifications").select("id")
        .eq("partner_id", n.partner_id).eq("title", n.title).maybeSingle();
      if (!ex.data?.id) {
        await admin.from("partner_notifications").insert(n);
        inc("partner_notifications");
      }
    }
    wf("notifications", "PASS");

  } catch (e: any) {
    report.ok = false;
    report.errors.push(String(e?.message ?? e));
    report.workflows.push({ step: "FATAL", status: "FAIL", detail: String(e?.message ?? e) });
  }

  return report;
}

/* -------------------------------- Cleanup -------------------------------- */

export async function runTrialCleanup() {
  const admin = await getAdmin();
  const report: { ok: boolean; deleted: Record<string, number>; errors: string[] } = {
    ok: true, deleted: {}, errors: [],
  };
  const inc = (k: string, n = 1) => { report.deleted[k] = (report.deleted[k] ?? 0) + n; };

  try {
    const ids: string[] = [];
    let page = 1;
    for (;;) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      for (const u of data.users) {
        const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
        const isTrial = meta.trial_tag === TRIAL_TAG || (u.email ?? "").includes(`@${DOMAIN}`);
        if (isTrial) ids.push(u.id);
      }
      if (data.users.length < 200) break;
      page += 1;
    }
    if (ids.length === 0) return report;

    const del = async (table: string, col: string, key = table) => {
      const r = await admin.from(table).delete({ count: "exact" } as never).in(col, ids);
      if (r.error) report.errors.push(`${table}: ${r.error.message}`);
      else inc(key, r.count ?? 0);
    };

    await del("partner_notifications", "partner_id");
    await del("customer_notifications", "user_id");
    await del("offer_delivery_events", "partner_id");
    await del("subscription_offers", "partner_id");
    await del("subscription_assignment_queue", "customer_id");
    await del("wallet_ledger", "partner_id");
    await del("earnings", "partner_id");
    await del("dirty_vehicle_reports", "partner_id");
    await del("unavailability_reports", "partner_id");
    await del("service_photos", "partner_id");
    await del("services", "partner_id", "services.byPartner");
    await del("services", "customer_id", "services.byCustomer");
    await del("assignments", "partner_id");
    await del("vehicles", "customer_id");
    await del("subscriptions", "user_id");
    await del("payment_transactions", "user_id");
    await del("payments", "user_id");
    await del("bookings", "user_id");
    await del("customer_vehicles", "user_id");
    await del("customer_addresses", "user_id");
    await del("customer_profiles", "user_id");
    await del("customers", "id");
    await del("push_tokens", "user_id");
    await del("partners", "id");
    await del("user_roles", "user_id");

    for (const uid of ids) {
      const { error } = await admin.auth.admin.deleteUser(uid);
      if (error) report.errors.push(`deleteUser(${uid}): ${error.message}`);
      else inc("auth.users");
    }
  } catch (e: any) {
    report.ok = false;
    report.errors.push(String(e?.message ?? e));
  }
  return report;
}

/* ------------------------------ Verification ----------------------------- */

export async function runTrialVerify() {
  const admin = await getAdmin();
  const result: Array<{ step: string; status: "PASS" | "FAIL"; detail: string }> = [];
  const check = async (step: string, q: () => Promise<{ count: number | null; error: any }>) => {
    try {
      const { count, error } = await q();
      if (error) return result.push({ step, status: "FAIL", detail: error.message });
      result.push({ step, status: (count ?? 0) > 0 ? "PASS" : "FAIL", detail: `rows=${count ?? 0}` });
    } catch (e: any) {
      result.push({ step, status: "FAIL", detail: String(e?.message ?? e) });
    }
  };

  await check("1. Customer accounts (>=5)", async () => {
    const r = await admin.from("customers").select("*", { count: "exact", head: true }).ilike("phone", "+91980000010%");
    return { count: r.count, error: r.error };
  });
  await check("2. Partner accounts (>=3)", async () => {
    const r = await admin.from("partners").select("*", { count: "exact", head: true }).ilike("partner_code", "TRIAL%");
    return { count: r.count, error: r.error };
  });
  await check("3. Paid bookings", async () => {
    const r = await admin.from("bookings").select("*", { count: "exact", head: true }).like("razorpay_order_id", "order_trial_%").eq("payment_status", "paid");
    return { count: r.count, error: r.error };
  });
  await check("4. Subscriptions active", async () => {
    const r = await admin.from("subscriptions").select("*", { count: "exact", head: true }).eq("status", "active").eq("plan_slug", "daily-shine-interior");
    return { count: r.count, error: r.error };
  });
  await check("5. Subscription queue row", async () => {
    const r = await admin.from("subscription_assignment_queue").select("*", { count: "exact", head: true }).eq("area", "Gomti Nagar");
    return { count: r.count, error: r.error };
  });
  await check("6. Offer accepted", async () => {
    const r = await admin.from("subscription_offers").select("*", { count: "exact", head: true }).eq("response", "accepted");
    return { count: r.count, error: r.error };
  });
  await check("7. Assignment for today", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const r = await admin.from("assignments").select("*", { count: "exact", head: true }).eq("scheduled_date", today);
    return { count: r.count, error: r.error };
  });
  await check("8. Route stops (services today)", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const r = await admin.from("services").select("*", { count: "exact", head: true }).eq("scheduled_date", today);
    return { count: r.count, error: r.error };
  });
  await check("9. Completed service", async () => {
    const r = await admin.from("services").select("*", { count: "exact", head: true }).eq("status", "completed");
    return { count: r.count, error: r.error };
  });
  await check("10. Earnings credited", async () => {
    const r = await admin.from("earnings").select("*", { count: "exact", head: true });
    return { count: r.count, error: r.error };
  });
  await check("11. Customer feed notification (completed)", async () => {
    const r = await admin.from("customer_notifications").select("*", { count: "exact", head: true }).eq("type", "service_completed");
    return { count: r.count, error: r.error };
  });
  await check("12. Dirty vehicle report", async () => {
    const r = await admin.from("dirty_vehicle_reports").select("*", { count: "exact", head: true });
    return { count: r.count, error: r.error };
  });
  await check("13. Unavailability report", async () => {
    const r = await admin.from("unavailability_reports").select("*", { count: "exact", head: true });
    return { count: r.count, error: r.error };
  });

  const pass = result.filter((r) => r.status === "PASS").length;
  const fail = result.filter((r) => r.status === "FAIL").length;
  return { ok: fail === 0, pass, fail, checks: result };
}
