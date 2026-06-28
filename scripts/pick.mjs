import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false}});
const r1 = await sb.rpc("pick_scored_partner_for_queue", { p_queue_id: "839bea9a-b656-4c34-a239-5602233ad198", p_scope: "priority" });
console.log("priority:", JSON.stringify(r1.data), r1.error?.message);
const r2 = await sb.rpc("pick_scored_partner_for_queue", { p_queue_id: "839bea9a-b656-4c34-a239-5602233ad198", p_scope: "city", p_radius_km: 15 });
console.log("city:", JSON.stringify(r2.data), r2.error?.message);
