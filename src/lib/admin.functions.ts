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
    .select("id,full_name,phone,area,address_line,pincode,subscription_plan,subscription_end,is_active,vehicles(make,model,registration_number)")
    .order("full_name")
    .limit(100);
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
  const { data } = await supabaseAdmin
    .from("service_photos")
    .select("id,service_id,stage,angle,storage_path,captured_at,lat,lng,partners(full_name,partner_code),services(scheduled_date,customers(full_name,area))")
    .order("captured_at", { ascending: false })
    .limit(60);
  const rows = data ?? [];
  // Generate signed URLs for thumbnails (1h)
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

export const createCustomerImport = createServerFn({ method: "POST" })
  .inputValidator((d: {
    full_name: string;
    phone: string;
    address_line: string;
    area: string;
    pincode?: string;
    latitude?: number;
    longitude?: number;
    subscription_plan?: string;
    subscription_start?: string;
    subscription_end?: string;
    preferred_time?: string;
    is_active?: boolean;
    vehicle_make: string;
    vehicle_model: string;
    vehicle_registration: string;
    vehicle_color?: string;
    parking_notes?: string;
    assigned_partner_id?: string | null;
  }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cust, error: e1 } = await supabaseAdmin
      .from("customers")
      .insert({
        full_name: data.full_name,
        phone: data.phone,
        address_line: data.address_line,
        area: data.area,
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
    const { data: veh, error: e2 } = await supabaseAdmin
      .from("vehicles")
      .insert({
        customer_id: cust.id,
        make: data.vehicle_make,
        model: data.vehicle_model,
        registration_number: data.vehicle_registration,
        color: data.vehicle_color || null,
        parking_notes: data.parking_notes || null,
      })
      .select()
      .single();
    if (e2) throw e2;
    return { customer: cust, vehicle: veh };
  });

export const listAdminPartnersBrief = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("partners")
    .select("id,full_name,partner_code,phone,home_area")
    .order("full_name");
  return data ?? [];
});

