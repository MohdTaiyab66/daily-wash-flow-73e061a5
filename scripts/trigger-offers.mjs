import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession:false } });

// Lucknow Gomti Nagar cluster near partners
const seedAddrs = [
  { customer_id: "9c952365-33ca-47ff-9f33-37b4f614a25d", booking_id: "29668cbc-39f4-4de3-9506-b81db65ee278", area: "Gomti Nagar", latitude: 26.8459, longitude: 80.987 },
  { customer_id: "390f456d-fb16-4f56-b84f-ec0e80847da4", booking_id: "4f3ff98f-d463-497b-9186-6fb51b3f6e9e", area: "Gomti Nagar", latitude: 26.847, longitude: 80.988 },
];

for (const r of seedAddrs) {
  // upsert one address per customer
  const { data: existing } = await sb.from("customer_addresses").select("id").eq("user_id", r.customer_id).limit(1).maybeSingle();
  let addrId = existing?.id;
  if (!addrId) {
    const { data, error } = await sb.from("customer_addresses").insert({
      user_id: r.customer_id, label: "Home", address_line: "Test address, " + r.area, area: r.area,
      latitude: r.latitude, longitude: r.longitude, is_default: true, parking_notes: "Park near gate",
    }).select("id").single();
    if (error) { console.log("addr err", error.message); continue; }
    addrId = data.id;
  } else {
    await sb.from("customer_addresses").update({ latitude: r.latitude, longitude: r.longitude, area: r.area }).eq("id", addrId);
  }
  await sb.from("bookings").update({ address_id: addrId }).eq("id", r.booking_id);

  // delete failed queue row so we can reinsert
  await sb.from("subscription_assignment_queue").delete().eq("booking_id", r.booking_id);

  const { data, error } = await sb.rpc("enqueue_subscription_booking", { p_booking_id: r.booking_id });
  console.log("enqueue", r.booking_id, "queue=", data, error?.message);
}

const { data: offers } = await sb
  .from("subscription_offers")
  .select("id, partner_id, response, queue_id, expires_at, offered_at, score")
  .eq("response","pending")
  .order("created_at", { ascending: false });
console.log("PENDING OFFERS", JSON.stringify(offers, null, 2));

const { data: qs } = await sb.from("subscription_assignment_queue").select("id, booking_id, status, current_offer_partner_id, offer_expires_at").order("created_at", { ascending: false }).limit(5);
console.log("QUEUES", JSON.stringify(qs, null, 2));
