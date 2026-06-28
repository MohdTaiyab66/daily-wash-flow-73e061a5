import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false}});
const today = new Date().toISOString().slice(0,10);
const P = "4a89212a-84db-4adc-8e9a-93d9d204016f";
const calls = [
  ["admin_route_dashboard", { _partner_id: P, _date: today }],
  ["admin_route_timeline",  { _partner_id: P, _date: today }],
  ["admin_optimize_all",    { _date: today }],
];
for (const [fn, args] of calls) {
  const { data, error } = await sb.rpc(fn, args);
  console.log(fn, error?.message ?? "OK", JSON.stringify(data)?.slice(0,260));
}
