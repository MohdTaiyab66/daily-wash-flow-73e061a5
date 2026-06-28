import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false}});
const newExp = new Date(Date.now()+10*60*1000).toISOString();
const { data, error } = await sb.from("subscription_offers")
  .update({ expires_at: newExp })
  .eq("response","pending").select("id, partner_id, expires_at");
console.log("extended", data, error?.message);
await sb.from("subscription_assignment_queue")
  .update({ offer_expires_at: newExp })
  .in("id", ["839bea9a-b656-4c34-a239-5602233ad198","2bade53a-29df-455e-b5c7-530e07bba1aa"]);
