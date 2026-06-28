import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession:false } });
await sb.from("partners").update({ last_seen: new Date().toISOString() }).in("id", ["62fb1538-e2b7-4fbb-80cd-2e1e89b61310","4a89212a-84db-4adc-8e9a-93d9d204016f","9c9f0d95-5871-416e-9687-ab4296c0d0d0"]);
for (const q of ["839bea9a-b656-4c34-a239-5602233ad198","2bade53a-29df-455e-b5c7-530e07bba1aa"]) {
  await sb.from("subscription_assignment_queue").update({ status: 'awaiting', tried_partner_ids: [], current_offer_partner_id: null, offer_expires_at: null }).eq("id", q);
  const { data, error } = await sb.rpc("offer_next_for_queue", { p_queue_id: q });
  console.log("offer", q, "->", data, error?.message);
}
const { data: offers } = await sb.from("subscription_offers").select("id, partner_id, response, queue_id, expires_at, offered_at, score").eq("response","pending").order("created_at", { ascending:false });
console.log("PENDING", JSON.stringify(offers, null, 2));
