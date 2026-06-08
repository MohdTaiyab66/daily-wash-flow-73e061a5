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
  return data ?? [];
});
