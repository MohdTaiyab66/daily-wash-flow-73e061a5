import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false}});
// Force the pending offer for Aarav on the second queue (2bade53a) to be expired
const pendingId = "fdb4b4f6-31d9-40e3-88a8-7c971b6873e0";
const past = new Date(Date.now()-30_000).toISOString();
await sb.from("subscription_offers").update({ expires_at: past }).eq("id", pendingId);
await sb.from("subscription_assignment_queue").update({ offer_expires_at: past }).eq("id","2bade53a-29df-455e-b5c7-530e07bba1aa");
// Also bump partner heartbeats so the next offer can fire
await sb.from("partners").update({ last_seen: new Date().toISOString() }).in("phone",["+919800000011","+919800000012","+919800000013"]);
const r = await sb.rpc("sweep_subscription_offers");
console.log("sweep:", r.data, r.error?.message);
const { data: post } = await sb.from("subscription_offers").select("id,partner_id,response,expires_at").eq("queue_id","2bade53a-29df-455e-b5c7-530e07bba1aa").order("offered_at",{ascending:false});
console.log("offers after sweep:", JSON.stringify(post,null,2));
const { data: q } = await sb.from("subscription_assignment_queue").select("status, current_offer_partner_id, tried_partner_ids, assigned_partner_id").eq("id","2bade53a-29df-455e-b5c7-530e07bba1aa").maybeSingle();
console.log("queue:", q);
