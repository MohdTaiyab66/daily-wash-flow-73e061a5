import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false}});
const today = new Date().toISOString().slice(0,10);
const P = "4a89212a-84db-4adc-8e9a-93d9d204016f";
const calls = [
  ["admin_route_dashboard", { p_date: today }],
  ["admin_route_timeline", { p_partner_id: P, p_date: today }],
  ["admin_optimize_all", { p_date: today, p_dry_run: true }],
];
for (const [fn, args] of calls) {
  const { data, error } = await sb.rpc(fn, args);
  console.log(fn, error?.message ?? "OK", JSON.stringify(data)?.slice(0,200));
}
