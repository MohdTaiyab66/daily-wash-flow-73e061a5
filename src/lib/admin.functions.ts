import { createServerFn } from "@tanstack/react-start";

export const getAdminOverview = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [partners, customers, services, completed, today] = await Promise.all([
    supabaseAdmin.from("partners").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("customers").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("services").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("services").select("rate_per_car", { count: "exact" }).eq("status", "completed"),
    supabaseAdmin.from("services").select("*", { count: "exact", head: true }).eq("scheduled_date", new Date().toISOString().slice(0, 10)),
  ]);
  const revenue = (completed.data ?? []).reduce((s, r) => s + Number(r.rate_per_car || 0), 0);
  return {
    partners: partners.count ?? 0,
    customers: customers.count ?? 0,
    services: services.count ?? 0,
    completed: completed.count ?? 0,
    todayServices: today.count ?? 0,
    revenue,
  };
});

export const listAdminPartners = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("partners")
    .select("id,partner_code,full_name,phone,city,status,availability,cars_selected,rating,total_cars_completed,joined_on")
    .order("joined_on", { ascending: false })
    .limit(100);
  return data ?? [];
});

export const listAdminCustomers = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("customers")
    .select("id,full_name,phone,area,address_line,pincode,subscription_plan,subscription_start,subscription_end,is_active,vehicles(make,model,registration_number)")
    .order("full_name")
    .limit(500);
  return data ?? [];
});

export const listAdminServices = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabaseAdmin
    .from("services")
    .select("id,scheduled_date,status,time_slot,rate_per_car,customers(full_name,area),partners(full_name,partner_code)")
    .gte("scheduled_date", today)
    .order("scheduled_date")
    .limit(200);
  return data ?? [];
});

export const listSettings = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("platform_settings").select("key,value,description").order("key");
  return data ?? [];
});

export const updateSetting = createServerFn({ method: "POST" })
  .inputValidator((d: { key: string; value: number }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("platform_settings")
      .update({ value: data.value, updated_at: new Date().toISOString() })
      .eq("key", data.key);
    if (error) throw error;
    return { ok: true };
  });

export const listServicePhotos = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data } = await supabaseAdmin
    .from("service_photos")
    .select("id,service_id,stage,angle,storage_path,captured_at,lat,lng,partners(full_name,partner_code),services(scheduled_date,customers(full_name,area))")
    .gte("captured_at", sevenDaysAgo)
    .order("captured_at", { ascending: false })
    .limit(120);
  const rows = data ?? [];
  const signed = await Promise.all(
    rows.map(async (p: any) => {
      if (!p.storage_path) return { ...p, signed_url: null };
      const { data: s } = await supabaseAdmin.storage.from("service-photos").createSignedUrl(p.storage_path, 3600);
      return { ...p, signed_url: s?.signedUrl ?? null };
    }),
  );
  return signed;
});

export const getAdminServiceDetail = createServerFn({ method: "GET" })
  .inputValidator((d: { service_id: string }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [svc, photos, dirty, parking] = await Promise.all([
      supabaseAdmin
        .from("services")
        .select("*, customers(*), vehicles(*), partners(full_name,partner_code,phone)")
        .eq("id", data.service_id)
        .maybeSingle(),
      supabaseAdmin
        .from("service_photos")
        .select("id,stage,angle,storage_path,captured_at,lat,lng")
        .eq("service_id", data.service_id)
        .order("captured_at"),
      supabaseAdmin.from("dirty_vehicle_reports").select("*").eq("service_id", data.service_id),
      supabaseAdmin.from("parking_reports").select("*").eq("service_id", data.service_id),
    ]);
    const sign = async (path: string | null) => {
      if (!path) return null;
      const { data: s } = await supabaseAdmin.storage.from("service-photos").createSignedUrl(path, 3600);
      return s?.signedUrl ?? null;
    };
    const photoRows = await Promise.all(
      (photos.data ?? []).map(async (p: any) => ({ ...p, signed_url: await sign(p.storage_path) })),
    );
    const dirtyRows = await Promise.all(
      (dirty.data ?? []).map(async (r: any) => ({
        ...r,
        photo_front_url: await sign(r.photo_front),
        photo_rear_url: await sign(r.photo_rear),
        photo_left_url: await sign(r.photo_left),
        photo_right_url: await sign(r.photo_right),
      })),
    );
    const parkingRows = await Promise.all(
      (parking.data ?? []).map(async (r: any) => ({ ...r, photo_url: await sign(r.photo_path) })),
    );
    return {
      service: svc.data,
      photos: photoRows,
      dirty: dirtyRows,
      parking: parkingRows,
    };
  });

type VehicleInput = {
  make: string;
  model: string;
  registration_number?: string;
  color?: string;
  parking_notes?: string;
};

export const createCustomerImport = createServerFn({ method: "POST" })
  .inputValidator((d: {
    full_name: string;
    phone: string;
    area: string;
    address_line?: string;
    pincode?: string;
    latitude?: number;
    longitude?: number;
    subscription_plan?: string;
    subscription_start?: string;
    subscription_end?: string;
    preferred_time?: string;
    is_active?: boolean;
    vehicles: VehicleInput[];
    assigned_partner_id?: string | null;
  }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!data.vehicles?.length) throw new Error("At least one vehicle is required");

    const { data: cust, error: e1 } = await supabaseAdmin
      .from("customers")
      .insert({
        full_name: data.full_name,
        phone: data.phone,
        area: data.area,
        address_line: data.address_line || data.area,
        pincode: data.pincode || null,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        subscription_plan: (data.subscription_plan as any) || "daily_shine_monthly",
        subscription_start: data.subscription_start || new Date().toISOString().slice(0, 10),
        subscription_end:
          data.subscription_end ||
          new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
        preferred_time: data.preferred_time || "06:00 - 09:00",
        is_active: data.is_active ?? true,
      })
      .select()
      .single();
    if (e1) throw e1;

    const vehRows = data.vehicles
      .filter((v) => v.make && v.model)
      .map((v) => ({
        customer_id: cust.id,
        make: v.make,
        model: v.model,
        registration_number: v.registration_number || `PENDING-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        color: v.color || null,
        parking_notes: v.parking_notes || null,
      }));
    const { error: e2 } = await supabaseAdmin.from("vehicles").insert(vehRows);
    if (e2) throw e2;

    return { customer: cust, vehicle_count: vehRows.length };
  });

export const listAdminPartnersBrief = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("partners")
    .select("id,full_name,partner_code,phone,home_area")
    .order("full_name");
  return data ?? [];
});

// =================== Customer Profile ===================
export const getCustomerProfile = createServerFn({ method: "GET" })
  .inputValidator((d: { customer_id: string }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const today = new Date().toISOString().slice(0, 10);
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

    const [cust, vehicles, services, complaints, extensions] = await Promise.all([
      supabaseAdmin.from("customers").select("*").eq("id", data.customer_id).maybeSingle(),
      supabaseAdmin.from("vehicles").select("*").eq("customer_id", data.customer_id),
      supabaseAdmin
        .from("services")
        .select("id,scheduled_date,status,completed_at,time_slot,gps_flag,partners(id,full_name,partner_code,phone)")
        .eq("customer_id", data.customer_id)
        .order("scheduled_date", { ascending: false })
        .limit(60),
      supabaseAdmin
        .from("complaints")
        .select("*")
        .eq("customer_id", data.customer_id)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("subscription_extensions")
        .select("*")
        .eq("customer_id", data.customer_id)
        .order("created_at", { ascending: false }),
    ]);

    if (!cust.data) throw new Error("Customer not found");

    const serviceRows = services.data ?? [];
    const lastCompleted = serviceRows.find((s: any) => s.status === "completed");
    const upcoming = serviceRows.filter((s: any) => s.scheduled_date >= today && s.status === "pending");
    const assignedPartner = upcoming[0]?.partners ?? lastCompleted?.partners ?? null;

    // Days remaining
    const end = cust.data.subscription_end ? new Date(cust.data.subscription_end) : null;
    const start = cust.data.subscription_start ? new Date(cust.data.subscription_start) : null;
    const daysRemaining = end ? Math.ceil((end.getTime() - Date.now()) / 86400000) : null;
    const extensionDaysTotal = (extensions.data ?? []).reduce((s: number, e: any) => s + (e.days || 0), 0);

    // Photos last 7 days
    const serviceIds = serviceRows.map((s: any) => s.id);
    let photoRows: any[] = [];
    if (serviceIds.length) {
      const { data: photos } = await supabaseAdmin
        .from("service_photos")
        .select("id,service_id,stage,angle,storage_path,captured_at,services(scheduled_date)")
        .in("service_id", serviceIds)
        .gte("captured_at", sevenDaysAgo)
        .order("captured_at", { ascending: false });
      photoRows = await Promise.all(
        (photos ?? []).map(async (p: any) => {
          const { data: s } = await supabaseAdmin.storage.from("service-photos").createSignedUrl(p.storage_path, 3600);
          return { ...p, signed_url: s?.signedUrl ?? null };
        }),
      );
    }

    return {
      customer: cust.data,
      vehicles: vehicles.data ?? [],
      assigned_partner: assignedPartner,
      start_date: start ? start.toISOString().slice(0, 10) : null,
      renewal_date: end ? end.toISOString().slice(0, 10) : null,
      days_remaining: daysRemaining,
      extension_days_total: extensionDaysTotal,
      last_service_date: lastCompleted?.scheduled_date ?? null,
      services: serviceRows,
      complaints: complaints.data ?? [],
      extensions: extensions.data ?? [],
      photos: photoRows,
    };
  });

export const extendCustomerSubscription = createServerFn({ method: "POST" })
  .inputValidator((d: { customer_id: string; days: number; reason: string }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("admin_extend_customer", {
      p_customer_id: data.customer_id,
      p_days: data.days,
      p_reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return result;
  });

// =================== Renewals (advanced) ===================
export const listAdminRenewalsAdvanced = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const minus30 = new Date(today); minus30.setDate(minus30.getDate() - 30);
  const plus30 = new Date(today); plus30.setDate(plus30.getDate() + 30);

  const { data } = await supabaseAdmin
    .from("customers")
    .select("id,full_name,phone,area,subscription_plan,subscription_start,subscription_end,is_active")
    .gte("subscription_end", iso(minus30))
    .lte("subscription_end", iso(plus30))
    .order("subscription_end");

  // Map customer → assigned partner via most recent service
  const ids = (data ?? []).map((c: any) => c.id);
  let partnerByCustomer: Record<string, any> = {};
  if (ids.length) {
    const { data: svcRows } = await supabaseAdmin
      .from("services")
      .select("customer_id,scheduled_date,partners(id,full_name,partner_code)")
      .in("customer_id", ids)
      .order("scheduled_date", { ascending: false });
    (svcRows ?? []).forEach((s: any) => {
      if (!partnerByCustomer[s.customer_id] && s.partners) partnerByCustomer[s.customer_id] = s.partners;
    });
  }

  return (data ?? []).map((c: any) => ({ ...c, partner: partnerByCustomer[c.id] ?? null }));
});
