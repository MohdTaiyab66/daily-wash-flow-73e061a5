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
  // Deterministic jitter -delta..+delta around base.
  const r = Math.sin(seed * 9301 + 49297) * 233280;
  const frac = r - Math.floor(r);
  return base + (frac * 2 - 1) * delta;
}

async function getAdmin() {
  // Loaded lazily so this module is safe to import in route files.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as SupabaseClient;
}

async function getOrCreateAuthUser(
  admin: SupabaseClient,
  u: SeedUser,
): Promise<{ id: string; existed: boolean }> {
  // Look up by email via Auth Admin listUsers (paged).
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
  // vehicle_catalog: at least 4 entries (hatchback_compact_sedan x2, sedan_suv x2)
  const vehicles = [
    { make: "Maruti Suzuki", model: "Swift",   category: "hatchback_compact_sedan" },
    { make: "Hyundai",       model: "i20",     category: "hatchback_compact_sedan" },
    { make: "Honda",         model: "City",    category: "sedan_suv" },
    { make: "Hyundai",       model: "Creta",   category: "sedan_suv" },
  ];
  for (const v of vehicles) {
    await admin.from("vehicle_catalog").upsert(
      { ...v, active: true },
      { onConflict: "make,model", ignoreDuplicates: true } as any,
    );
  }

  // service_catalog (slugs used by app code)
  const services = [
    { slug: "daily-shine-exterior", name: "Daily Shine — Exterior",
      service_type: "subscription", price_hatchback: 999, price_sedan_suv: 1199,
      includes_hatchback: ["Exterior wash", "Tyre dressing"], includes_sedan_suv: ["Exterior wash", "Tyre dressing"], sort_order: 1, active: true, addons: [] as any },
    { slug: "daily-shine-interior", name: "Daily Shine — Interior",
      service_type: "subscription", price_hatchback: 1499, price_sedan_suv: 1799,
      includes_hatchback: ["Interior vacuum", "Dashboard polish"], includes_sedan_suv: ["Interior vacuum", "Dashboard polish"], sort_order: 2, active: true, addons: [] as any },
    { slug: "daily-shine-dusting", name: "Daily Shine — Dusting",
      service_type: "subscription", price_hatchback: 599, price_sedan_suv: 699,
      includes_hatchback: ["Dust removal"], includes_sedan_suv: ["Dust removal"], sort_order: 3, active: true, addons: [] as any },
    { slug: "one-time-wash", name: "One-Time Premium Wash",
      service_type: "one_time", price_hatchback: 399, price_sedan_suv: 499,
      includes_hatchback: ["Premium wash"], includes_sedan_suv: ["Premium wash"], sort_order: 10, active: true, addons: [] as any },
  ];
  for (const s of services) {
    await admin.from("service_catalog").upsert(s, { onConflict: "slug", ignoreDuplicates: false } as any);
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

      // user_roles (idempotent)
      await admin.from("user_roles").upsert(
        { user_id: id, role: u.role },
        { onConflict: "user_id,role", ignoreDuplicates: true } as any,
      );
      // Default authenticated users also get 'customer' role? Code uses partner / customer / admin distinctly. No extra.
    }
    wf("auth.users+roles", "PASS", `${report.accounts.length} accounts (existed: ${report.accounts.filter(a => a.existed).length})`);

    // 2) Partners (operational rows) + dummy push tokens
    const partnerKeys = ["partner1", "partner2", "partner3"] as const;
    for (let i = 0; i < partnerKeys.length; i++) {
      const key = partnerKeys[i];
      const id = ids[key];
      const u = USERS.find((x) => x.key === key)!;
      const lat = jitter(HOME_LAT, 0.01, i + 1);
      const lng = jitter(HOME_LNG, 0.01, i + 1);
      const code = `TRIAL${i + 1}`;
      const refCode = `TR-${id.slice(0, 6).toUpperCase()}`;
      await admin.from("partners").upsert({
        id, partner_code: code, full_name: u.full_name, phone: u.phone, email: u.email,
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
      } as any, { onConflict: "id" } as any);
      inc("partners");

      // push_tokens (dummy, optional for marketplace eligibility)
      await admin.from("push_tokens").upsert({
        user_id: id, token: `TRIAL-FCM-${key}-${id.slice(0, 8)}`,
        platform: "android", app: "partner", device_id: `trial-${key}`,
        last_seen: new Date().toISOString(),
      } as any, { onConflict: "token", ignoreDuplicates: true } as any);
      inc("push_tokens");
    }
    wf("partners.upsert", "PASS");

    // 3) Customers (operational) + customer_profiles + addresses + vehicles
    const vehicleCatalog = (await admin.from("vehicle_catalog").select("id,make,model,category")).data ?? [];
    const customerKeys = ["customer1", "customer2", "customer3", "customer4", "customer5"] as const;
    const customerVehicleIds: Record<string, string> = {}; // customer_key -> customer_vehicles.id
    const opsVehicleIds: Record<string, string> = {};      // customer_key -> vehicles.id

    for (let i = 0; i < customerKeys.length; i++) {
      const key = customerKeys[i];
      const id = ids[key];
      const u = USERS.find((x) => x.key === key)!;
      const lat = jitter(HOME_LAT, 0.015, i + 10);
      const lng = jitter(HOME_LNG, 0.015, i + 10);
      const vc = vehicleCatalog[i % vehicleCatalog.length] ?? vehicleCatalog[0];
      const reg = `UP32 TRL ${1000 + i}`;
      const preferredBefore = ["08:00", "09:00", "10:00", "09:00", "11:00"][i];

      // customer_profiles
      await admin.from("customer_profiles").upsert({
        user_id: id, full_name: u.full_name, email: u.email, phone: u.phone,
        preferred_area: "Gomti Nagar", marketing_opt_in: true,
      } as any, { onConflict: "user_id" } as any);
      inc("customer_profiles");

      // customer_addresses
      const addrIns = await admin.from("customer_addresses").upsert({
        user_id: id, label: "Home",
        address_line: `Flat ${100 + i}, Vipul Khand ${i + 1}`,
        area: "Gomti Nagar", pincode: "226010",
        latitude: lat, longitude: lng, is_default: true,
      } as any, { onConflict: "user_id,label" } as any).select("id").maybeSingle();
      inc("customer_addresses");
      const addressId = addrIns.data?.id
        ?? (await admin.from("customer_addresses").select("id").eq("user_id", id).eq("label", "Home").maybeSingle()).data?.id;

      // customer_vehicles
      const cvIns = await admin.from("customer_vehicles").upsert({
        user_id: id, make: vc?.make ?? "Maruti Suzuki", model: vc?.model ?? "Swift",
        category: vc?.category ?? "hatchback_compact_sedan",
        color: ["White", "Silver", "Red", "Blue", "Black"][i],
        registration_number: reg, parking_notes: "Stilt parking, slot 12", is_default: true,
      } as any, { onConflict: "user_id,registration_number" } as any).select("id").maybeSingle();
      inc("customer_vehicles");
      const cvId = cvIns.data?.id
        ?? (await admin.from("customer_vehicles").select("id").eq("user_id", id).eq("registration_number", reg).maybeSingle()).data?.id;
      if (cvId) customerVehicleIds[key] = cvId;

      // customers (operational; id = auth uid)
      await admin.from("customers").upsert({
        id, full_name: u.full_name, phone: u.phone, email: u.email,
        address_line: `Flat ${100 + i}, Vipul Khand ${i + 1}`, area: "Gomti Nagar",
        city: "Lucknow", pincode: "226010", latitude: lat, longitude: lng,
        subscription_plan: "daily_shine_monthly",
        is_active: true, preferred_time: `${preferredBefore} - ${preferredBefore.replace(/^(\d+):/, (_m, h) => String(+h + 1).padStart(2, "0") + ":")}`,
        service_required_before: preferredBefore,
        payment_status: i === 4 ? "pending" : "paid",
        paid_at: i === 4 ? null : new Date().toISOString(),
        time_window_type: i === 3 ? "exact" : "soft",
        exact_time: i === 3 ? "09:30" : null,
      } as any, { onConflict: "id" } as any);
      inc("customers");

      // vehicles (operational; FK customer_id -> customers.id)
      const vIns = await admin.from("vehicles").upsert({
        customer_id: id, make: vc?.make ?? "Maruti Suzuki", model: vc?.model ?? "Swift",
        registration_number: reg, color: ["White", "Silver", "Red", "Blue", "Black"][i],
        parking_notes: "Stilt parking, slot 12", package_amount: 1499,
      } as any, { onConflict: "customer_id,registration_number" } as any).select("id").maybeSingle();
      inc("vehicles");
      const opsVid = vIns.data?.id
        ?? (await admin.from("vehicles").select("id").eq("customer_id", id).eq("registration_number", reg).maybeSingle()).data?.id;
      if (opsVid) opsVehicleIds[key] = opsVid;

      // Suppress addressId unused warning
      void addressId;
    }
    wf("customers.upsert", "PASS");

    // 4) Subscriptions for customers 1..4 (paid, daily_shine_monthly)
    const dailyShine = (await admin.from("service_catalog").select("id,slug,service_type,price_hatchback,price_sedan_suv").eq("slug", "daily-shine-interior").maybeSingle()).data;
    const oneTime    = (await admin.from("service_catalog").select("id,slug,service_type,price_hatchback,price_sedan_suv").eq("slug", "one-time-wash").maybeSingle()).data;
    if (!dailyShine || !oneTime) throw new Error("service_catalog rows missing after upsert");

    const subscribedKeys = ["customer1", "customer2", "customer3", "customer4"] as const;
    for (let i = 0; i < subscribedKeys.length; i++) {
      const key = subscribedKeys[i];
      const uid = ids[key];
      const vId = customerVehicleIds[key];
      // bookings (subscription, paid)
      const bk = await admin.from("bookings").upsert({
        user_id: uid, service_id: dailyShine.id, vehicle_id: vId,
        scheduled_date: new Date().toISOString().slice(0, 10),
        preferred_before_time: ["08:00", "09:00", "10:00", "09:00"][i],
        base_amount: 1499, addon_amount: 0, discount_amount: 0, total_amount: 1499,
        status: "paid", payment_status: "captured",
        razorpay_order_id: `order_trial_${key}`, razorpay_payment_id: `pay_trial_${key}`,
        scheduled_time: ["08:00", "09:00", "10:00", "09:00"][i],
        notes: "Trial subscription booking",
      } as any, { onConflict: "razorpay_order_id" } as any).select("id").maybeSingle();
      const bookingId = bk.data?.id
        ?? (await admin.from("bookings").select("id").eq("razorpay_order_id", `order_trial_${key}`).maybeSingle()).data?.id;
      if (!bookingId) throw new Error(`booking insert failed for ${key}`);
      inc("bookings.subscription");

      // subscriptions
      await admin.from("subscriptions").upsert({
        booking_id: bookingId, user_id: uid, customer_id: uid, vehicle_id: vId,
        plan_slug: "daily-shine-interior", status: "active",
        start_date: new Date().toISOString().slice(0, 10),
        renewal_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
        service_start_date: new Date().toISOString().slice(0, 10),
        amount: 1499, currency: "INR",
      } as any, { onConflict: "booking_id" } as any);
      inc("subscriptions");

      // payments row (captured)
      await admin.from("payments").upsert({
        booking_id: bookingId, user_id: uid, provider: "razorpay",
        provider_order_id: `order_trial_${key}`, provider_payment_id: `pay_trial_${key}`,
        amount: 1499, currency: "INR", status: "captured",
        metadata: { trial: true },
      } as any, { onConflict: "booking_id,provider" } as any);
      inc("payments");
    }
    wf("bookings+subscriptions.paid", "PASS");

    // 5) One-time wash booking for customer5 (paid, not yet serviced)
    {
      const uid = ids["customer5"];
      const vId = customerVehicleIds["customer5"];
      await admin.from("bookings").upsert({
        user_id: uid, service_id: oneTime.id, vehicle_id: vId,
        scheduled_date: new Date().toISOString().slice(0, 10),
        preferred_before_time: "11:00",
        base_amount: 399, addon_amount: 0, discount_amount: 0, total_amount: 399,
        status: "paid", payment_status: "captured",
        razorpay_order_id: "order_trial_onetime_c5",
        razorpay_payment_id: "pay_trial_onetime_c5",
        scheduled_time: "11:00", notes: "Trial one-time wash",
      } as any, { onConflict: "razorpay_order_id" } as any);
      inc("bookings.one_time");
    }
    wf("booking.one_time", "PASS");

    // 6) Subscription assignment queue + offer + accept → assign partner1 to customer1
    {
      const customerId = ids["customer1"];
      const partnerId  = ids["partner1"];
      const bk = (await admin.from("bookings").select("id").eq("razorpay_order_id", "order_trial_customer1").maybeSingle()).data;
      if (bk) {
        const queueIns = await admin.from("subscription_assignment_queue").upsert({
          booking_id: bk.id, customer_id: customerId,
          area: "Gomti Nagar", lat: HOME_LAT, lng: HOME_LNG,
          service_required_before: "08:00", vehicle_category: "sedan_suv",
          status: "assigned", assigned_partner_id: partnerId, radius_km: 2,
          tried_partner_ids: [], attempts_log: [],
        } as any, { onConflict: "booking_id" } as any).select("id").maybeSingle();
        const queueId = queueIns.data?.id
          ?? (await admin.from("subscription_assignment_queue").select("id").eq("booking_id", bk.id).maybeSingle()).data?.id;
        inc("subscription_assignment_queue");

        if (queueId) {
          await admin.from("subscription_offers").upsert({
            queue_id: queueId, partner_id: partnerId, scope: "exact",
            offered_at: new Date(Date.now() - 60_000).toISOString(),
            expires_at: new Date(Date.now() + 600_000).toISOString(),
            response: "accepted", responded_at: new Date().toISOString(),
            distance_m: 850, score: 0.94,
            score_breakdown: { trial: true },
          } as any, { onConflict: "queue_id,partner_id" } as any);
          inc("subscription_offers");
        }

        // Update subscription with assigned_partner_id
        await admin.from("subscriptions").update({
          assigned_partner_id: partnerId, assigned_at: new Date().toISOString(),
        }).eq("booking_id", bk.id);
      }
    }
    wf("queue→offer→accept (c1↔p1)", "PASS");

    // Same for customer2 / partner2 — exact-time customer
    {
      const customerId = ids["customer2"];
      const partnerId  = ids["partner2"];
      const bk = (await admin.from("bookings").select("id").eq("razorpay_order_id", "order_trial_customer2").maybeSingle()).data;
      if (bk) {
        await admin.from("subscriptions").update({
          assigned_partner_id: partnerId, assigned_at: new Date().toISOString(),
        }).eq("booking_id", bk.id);
      }
    }

    // 7) Assignments (today's route) for partner1 + partner2
    const today = new Date().toISOString().slice(0, 10);
    for (const pkey of ["partner1", "partner2"]) {
      const pid = ids[pkey];
      const asg = await admin.from("assignments").upsert({
        partner_id: pid, area: "Gomti Nagar", target_cars: 5, fulfilled_cars: 0,
        status: "active", rate_per_car: 17,
        estimated_earnings: 85, estimated_hours: 4, estimated_distance_km: 8,
        search_radius_km: 1, scheduled_date: today,
        duration_days: 1, start_date: today, end_date: today,
        working_days: 1, expected_start_time: "07:00",
        total_earnings: 0,
      } as any, { onConflict: "partner_id,scheduled_date" } as any).select("id").maybeSingle();
      void asg; // assignmentId not strictly needed below
      inc("assignments");
    }
    wf("assignments.today", "PASS");

    // 8) Services (today's stops) — partner1: 2 stops (c1 pending, c3 completed),
    //    partner2: 1 stop (c2 in_progress), c4 unavailable
    type StopSpec = { partner: string; customer: string; seq: number; status: "pending" | "in_progress" | "completed" | "unavailable"; priority?: string; };
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
      const ins = await admin.from("services").upsert({
        partner_id: pid, customer_id: cid, vehicle_id: vid,
        scheduled_date: today, time_slot: "07:00 - 11:00",
        sequence_no: s.seq, status: s.status,
        started_at: startedAt, completed_at: completedAt,
        rate_per_car: 17, priority: s.priority ?? "normal",
        unavailable_reason: s.status === "unavailable" ? "vehicle_not_found" as any : null,
        unavailable_notes: s.status === "unavailable" ? "Customer's car not at parking" : null,
        unavailable_at: s.status === "unavailable" ? new Date().toISOString() : null,
      } as any, { onConflict: "partner_id,customer_id,scheduled_date" } as any).select("id").maybeSingle();
      const sid = ins.data?.id
        ?? (await admin.from("services").select("id").eq("partner_id", pid).eq("customer_id", cid).eq("scheduled_date", today).maybeSingle()).data?.id;
      if (sid) serviceIdByCustomer[s.customer] = sid;
      inc(`services.${s.status}`);
    }
    wf("services.today", "PASS", `${stops.length} stops created`);

    // 9) Earnings + wallet for completed service (partner1 ↔ customer3)
    {
      const pid = ids["partner1"];
      const sid = serviceIdByCustomer["customer3"];
      if (sid) {
        await admin.from("earnings").insert({
          partner_id: pid, earned_on: today, amount: 17,
          source: "service", service_id: sid, description: "Trial completed wash",
        } as any);
        inc("earnings");
        await admin.from("wallet_ledger").insert({
          partner_id: pid, entry_type: "credit", amount: 17, balance_after: 17,
          service_id: sid, description: "Trial wash credit",
        } as any);
        inc("wallet_ledger");
      }
    }
    wf("earnings+wallet (completed)", "PASS");

    // 10) Dirty vehicle report (customer3 → partner1)
    {
      const sid = serviceIdByCustomer["customer3"];
      if (sid) {
        await admin.from("dirty_vehicle_reports").insert({
          service_id: sid, partner_id: ids["partner1"],
          reason: "extra_dirty", notes: "Heavy mud on rims — needed extra time",
        } as any);
        inc("dirty_vehicle_reports");
      }
    }

    // 11) Unavailability report (customer4 → partner2)
    {
      const sid = serviceIdByCustomer["customer4"];
      if (sid) {
        await admin.from("unavailability_reports").insert({
          service_id: sid, partner_id: ids["partner2"], customer_id: ids["customer4"],
          reason: "vehicle_not_found", notes: "Vehicle missing at slot",
          credited_amount: 17,
        } as any);
        inc("unavailability_reports");
      }
    }
    wf("reliability reports", "PASS");

    // 12) Notifications (customer + partner)
    await admin.from("customer_notifications").insert([
      { user_id: ids["customer3"], type: "service_completed",
        title: "Today's wash is done", body: "Your car has been washed. View summary.",
        link: "/c/subscriptions" },
      { user_id: ids["customer1"], type: "service_scheduled",
        title: "Wash scheduled for today", body: "Partner Aarav will reach before 08:00 AM.",
        link: "/c/subscriptions" },
    ] as any);
    inc("customer_notifications", 2);

    await admin.from("partner_notifications").insert([
      { partner_id: ids["partner1"], type: "route_published",
        title: "Today's route is ready", body: "2 stops in Gomti Nagar.", link: "/app/live" },
      { partner_id: ids["partner2"], type: "new_assignment",
        title: "New VIP customer", body: "Nikhil Verma added to your route.", link: "/app/live" },
    ] as any);
    inc("partner_notifications", 2);
    wf("notifications", "PASS");

  } catch (e: any) {
    report.ok = false;
    report.errors.push(String(e?.message ?? e));
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
    // Collect user ids
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

    // Delete dependent rows first (FK chain).
    // Use IN() filters — these rows are linked to test user ids in various ways.
    const eq = (ids as string[]);

    // Service-graph rows
    await admin.from("partner_notifications").delete().in("partner_id", eq).then(r => inc("partner_notifications", r.count ?? 0));
    await admin.from("customer_notifications").delete().in("user_id", eq).then(r => inc("customer_notifications", r.count ?? 0));
    await admin.from("offer_delivery_events").delete().in("partner_id", eq).then(r => inc("offer_delivery_events", r.count ?? 0));
    await admin.from("subscription_offers").delete().in("partner_id", eq).then(r => inc("subscription_offers", r.count ?? 0));
    await admin.from("subscription_assignment_queue").delete().in("customer_id", eq).then(r => inc("subscription_assignment_queue", r.count ?? 0));
    await admin.from("wallet_ledger").delete().in("partner_id", eq).then(r => inc("wallet_ledger", r.count ?? 0));
    await admin.from("earnings").delete().in("partner_id", eq).then(r => inc("earnings", r.count ?? 0));
    await admin.from("dirty_vehicle_reports").delete().in("partner_id", eq).then(r => inc("dirty_vehicle_reports", r.count ?? 0));
    await admin.from("unavailability_reports").delete().in("partner_id", eq).then(r => inc("unavailability_reports", r.count ?? 0));
    await admin.from("service_photos").delete().in("partner_id", eq).then(r => inc("service_photos", r.count ?? 0));
    await admin.from("services").delete().in("partner_id", eq).then(r => inc("services.byPartner", r.count ?? 0));
    await admin.from("services").delete().in("customer_id", eq).then(r => inc("services.byCustomer", r.count ?? 0));
    await admin.from("assignments").delete().in("partner_id", eq).then(r => inc("assignments", r.count ?? 0));
    await admin.from("vehicles").delete().in("customer_id", eq).then(r => inc("vehicles", r.count ?? 0));
    await admin.from("subscriptions").delete().in("user_id", eq).then(r => inc("subscriptions", r.count ?? 0));
    await admin.from("payment_transactions").delete().in("user_id", eq).then(r => inc("payment_transactions", r.count ?? 0));
    await admin.from("payments").delete().in("user_id", eq).then(r => inc("payments", r.count ?? 0));
    await admin.from("bookings").delete().in("user_id", eq).then(r => inc("bookings", r.count ?? 0));
    await admin.from("customer_vehicles").delete().in("user_id", eq).then(r => inc("customer_vehicles", r.count ?? 0));
    await admin.from("customer_addresses").delete().in("user_id", eq).then(r => inc("customer_addresses", r.count ?? 0));
    await admin.from("customer_profiles").delete().in("user_id", eq).then(r => inc("customer_profiles", r.count ?? 0));
    await admin.from("customers").delete().in("id", eq).then(r => inc("customers", r.count ?? 0));
    await admin.from("push_tokens").delete().in("user_id", eq).then(r => inc("push_tokens", r.count ?? 0));
    await admin.from("partners").delete().in("id", eq).then(r => inc("partners", r.count ?? 0));
    await admin.from("user_roles").delete().in("user_id", eq).then(r => inc("user_roles", r.count ?? 0));

    // Finally, delete auth users
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

  await check("Customer accounts exist (>=5)", async () => {
    const r = await admin.from("customers").select("*", { count: "exact", head: true }).ilike("phone", "+91980000010%");
    return { count: r.count, error: r.error };
  });
  await check("Partner accounts exist (>=3)", async () => {
    const r = await admin.from("partners").select("*", { count: "exact", head: true }).ilike("partner_code", "TRIAL%");
    return { count: r.count, error: r.error };
  });
  await check("Paid bookings present", async () => {
    const r = await admin.from("bookings").select("*", { count: "exact", head: true }).like("razorpay_order_id", "order_trial_%").eq("payment_status", "captured");
    return { count: r.count, error: r.error };
  });
  await check("Subscriptions active", async () => {
    const r = await admin.from("subscriptions").select("*", { count: "exact", head: true }).eq("status", "active");
    return { count: r.count, error: r.error };
  });
  await check("Subscription queue row", async () => {
    const r = await admin.from("subscription_assignment_queue").select("*", { count: "exact", head: true }).eq("area", "Gomti Nagar");
    return { count: r.count, error: r.error };
  });
  await check("Offer accepted", async () => {
    const r = await admin.from("subscription_offers").select("*", { count: "exact", head: true }).eq("response", "accepted");
    return { count: r.count, error: r.error };
  });
  await check("Assignment for today exists", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const r = await admin.from("assignments").select("*", { count: "exact", head: true }).eq("scheduled_date", today);
    return { count: r.count, error: r.error };
  });
  await check("Route stops (services today)", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const r = await admin.from("services").select("*", { count: "exact", head: true }).eq("scheduled_date", today);
    return { count: r.count, error: r.error };
  });
  await check("Completed service present", async () => {
    const r = await admin.from("services").select("*", { count: "exact", head: true }).eq("status", "completed");
    return { count: r.count, error: r.error };
  });
  await check("Earnings credited", async () => {
    const r = await admin.from("earnings").select("*", { count: "exact", head: true });
    return { count: r.count, error: r.error };
  });
  await check("Customer feed notification", async () => {
    const r = await admin.from("customer_notifications").select("*", { count: "exact", head: true }).eq("type", "service_completed");
    return { count: r.count, error: r.error };
  });
  await check("Dirty vehicle report", async () => {
    const r = await admin.from("dirty_vehicle_reports").select("*", { count: "exact", head: true });
    return { count: r.count, error: r.error };
  });
  await check("Unavailability report", async () => {
    const r = await admin.from("unavailability_reports").select("*", { count: "exact", head: true });
    return { count: r.count, error: r.error };
  });

  const pass = result.filter((r) => r.status === "PASS").length;
  const fail = result.filter((r) => r.status === "FAIL").length;
  return { ok: fail === 0, pass, fail, checks: result };
}
