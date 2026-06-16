import { createClient } from "@supabase/supabase-js";
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false }});

const partners = [
  { phone: "9000000001", name: "Ravi Kumar", area: "Indira Nagar" },
  { phone: "9000000002", name: "Sandeep Singh", area: "Indira Nagar" },
  { phone: "9000000003", name: "Aman Verma", area: "Indira Nagar" },
  { phone: "9000000004", name: "Imran Khan", area: "Jankipuram" },
  { phone: "9000000005", name: "Rohit Yadav", area: "Jankipuram" },
  { phone: "9000000006", name: "Suresh Maurya", area: "Jankipuram" },
  { phone: "9000000007", name: "Deepak Gupta", area: "Vikas Nagar" },
  { phone: "9000000008", name: "Anil Tiwari", area: "Vikas Nagar" },
  { phone: "9000000009", name: "Vikas Pandey", area: "Aliganj" },
  { phone: "9000000010", name: "Manoj Sharma", area: "Aliganj" },
  { phone: "9000000011", name: "Rahul Mishra", area: "Kalyanpur" },
  { phone: "9000000012", name: "Ajay Rawat", area: "Kalyanpur" },
  { phone: "9000000013", name: "Pawan Bisht", area: "Khurram Nagar" },
];

const password = "Wash@12345";
for (const p of partners) {
  const email = `${p.phone}@urbanwash.local`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password, phone_confirm: true, email_confirm: true,
    phone: p.phone,
    user_metadata: { full_name: p.name, phone: p.phone },
  });
  if (error) { console.log("ERR", p.phone, error.message); continue; }
  const uid = data.user!.id;
  await admin.from("partners").update({
    full_name: p.name, phone: p.phone, home_area: p.area,
  }).eq("id", uid);
  console.log("OK", p.phone, p.name, "->", uid);
}
