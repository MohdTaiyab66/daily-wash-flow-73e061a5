import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false}});
const SERVICE_ID = "f23baf83-b066-4e77-91cb-33fa38bd3e3d";
const BOOKING_ID = "6f7fe9e2-c577-4226-a5b2-af4ba60e8c61";
await sb.from("services").update({ status:"pending", completed_at:null, complete_lat:null, complete_lng:null, started_at:null, gps_flag:false, gps_distance_m:null }).eq("id", SERVICE_ID);
await sb.from("bookings").update({ status:"active" }).eq("id", BOOKING_ID);
await sb.from("complaints").delete().eq("service_id", SERVICE_ID);
console.log("reset");
