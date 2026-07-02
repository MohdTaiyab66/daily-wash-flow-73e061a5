import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('missing backend env');
const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const stamp = Date.now().toString().slice(-6);
const today = new Date().toISOString().slice(0,10);
const tomorrow = new Date(Date.now()+86400000).toISOString().slice(0,10);
const partnerPhone = `77${stamp.padStart(8,'0')}`.slice(0,10);
const partnerEmail = `${partnerPhone}@partner.urbanwash.app`;
const partnerPassword = `UWP@${partnerPhone}#2026`;
let { data: pCreated, error: pCreateErr } = await sb.auth.admin.createUser({ email: partnerEmail, password: partnerPassword, email_confirm: true, user_metadata: { full_name: `P0 Trial Partner ${stamp}`, phone: partnerPhone, role: 'partner' } });
if (pCreateErr && !String(pCreateErr.message).toLowerCase().includes('already')) throw pCreateErr;
let pUser = pCreated?.user;
if (!pUser) { const { data } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 }); pUser = data.users.find(u => u.email === partnerEmail); }
if (!pUser) throw new Error('partner user missing');
const partnerId = pUser.id;
for (const op of [
  sb.from('user_roles').upsert({ user_id: partnerId, role: 'partner' }, { onConflict: 'user_id,role' }),
    sb.from('partners').upsert({ id: partnerId, full_name: `P0 Trial Partner ${stamp}`, phone: partnerPhone, email: partnerEmail, status: 'active', availability: 'online', last_seen: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'id' })
]) { const { error } = await op; if (error) throw error; }
const serviceCatalog = await sb.from('service_catalog').select('id,slug,name,service_type').eq('service_type','subscription').limit(1).maybeSingle();
const catalogId = serviceCatalog.data?.id ?? (await sb.from('service_catalog').select('id').limit(1).single()).data.id;
async function makeCustomer(idx) {
  const phone = `${88 + idx}${stamp.padStart(8,'0')}`.slice(0,10);
  const email = `${phone}@customer.urbanwash.app`;
  const password = `UWC@${phone}#2026`;
  let { data: created, error: createErr } = await sb.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: `P0 Trial Customer ${idx} ${stamp}`, phone, role: 'customer' }
  });
  if (createErr && !String(createErr.message).toLowerCase().includes('already')) throw createErr;
  let user = created?.user;
  if (!user) { const { data } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 }); user = data.users.find(u => u.email === email); }
  if (!user) throw new Error('customer user missing');
  const customerId = user.id;
  const lat = Number((26.84671234 + idx * 0.00012345).toFixed(8));
  const lng = Number((80.94624567 + idx * 0.00012345).toFixed(8));
  const customerPayload = {
    id: customerId, full_name: `P0 Trial Customer ${idx} ${stamp}`, phone, email,
    address_line: `P0 Trial Tower ${idx} ${stamp}`, area: `P0 Trial Area`, city: 'Lucknow', pincode: '226010', latitude: lat, longitude: lng,
    subscription_plan: 'daily_shine_monthly', subscription_start: today, subscription_end: tomorrow, is_active: true,
    preferred_time: '09:00', service_required_before: '10:00', payment_status: 'paid', gps_source: 'device_current'
  };
  const addressId = randomUUID();
  for (const op of [
    sb.from('customer_profiles').upsert({ user_id: customerId, full_name: customerPayload.full_name, email, phone, preferred_area: customerPayload.area }, { onConflict: 'user_id' }),
    sb.from('customers').upsert(customerPayload, { onConflict: 'id' }),
    sb.from('customer_vehicles').insert({ id: randomUUID(), user_id: customerId, make: idx === 1 ? 'Maruti' : 'Hyundai', model: idx === 1 ? 'Swift' : 'i20', category: 'hatchback_compact_sedan', color: idx === 1 ? 'White' : 'Blue', registration_number: `P0C${idx}${stamp}`, is_default: true }),
    sb.from('customer_addresses').insert({ id: addressId, user_id: customerId, label: 'Home', address_line: customerPayload.address_line, area: customerPayload.area, pincode: customerPayload.pincode, latitude: lat, longitude: lng, is_default: true }),
  ]) { const { error } = await op; if (error && !String(error.message).includes('duplicate')) throw error; }
  const vehicleId = randomUUID();
  const { error: vErr } = await sb.from('vehicles').insert({ id: vehicleId, customer_id: customerId, make: idx === 1 ? 'Maruti' : 'Hyundai', model: idx === 1 ? 'Swift' : 'i20', registration_number: `P0${idx}${stamp}`, color: idx === 1 ? 'White' : 'Blue', package_amount: 599 });
  if (vErr) throw vErr;
  return { customerId, phone, email, password, vehicleId, addressId, lat, lng, catalogId };
}
const c1 = await makeCustomer(1);
const c2 = await makeCustomer(2);
const assignmentId = randomUUID();
const service1 = randomUUID();
const service2 = randomUUID();
const { error: assignErr } = await sb.from('assignments').insert({
  id: assignmentId, partner_id: partnerId, area: 'P0 Trial Area', target_cars: 2, fulfilled_cars: 0, status: 'active', rate_per_car: 17,
  estimated_earnings: 34, estimated_hours: 1, estimated_distance_km: 1, scheduled_date: today, start_date: today, end_date: today,
});
if (assignErr) throw assignErr;
for (const row of [
  { i: 1, sid: service1, c: c1 },
  { i: 2, sid: service2, c: c2 },
]) {
  const { error } = await sb.from('services').insert({
    id: row.sid, partner_id: partnerId, customer_id: row.c.customerId, vehicle_id: row.c.vehicleId, assignment_id: assignmentId,
    scheduled_date: today, time_slot: '06:00 - 10:00', sequence_no: row.i, manual_sequence_no: row.i, status: 'pending', rate_per_car: 17,
    destination_lat: row.c.lat, destination_lng: row.c.lng, destination_source: 'customer', gps_flag: null,
  });
  if (error) throw error;
  const { error: bookingErr } = await sb.from('bookings').insert({
    user_id: row.c.customerId, service_id: catalogId, scheduled_date: today, base_amount: 599, total_amount: 599, status: 'active', payment_status: 'paid', ops_service_id: row.sid, partner_id: partnerId, address_id: row.c.addressId, latitude: row.c.lat, longitude: row.c.lng, gps_source: 'device_current'
  });
  if (bookingErr) throw bookingErr;
}
console.log(JSON.stringify({ partnerId, partnerPhone, partnerEmail, partnerPassword, customer1: c1, customer2: c2, assignmentId, service1, service2, today }, null, 2));
