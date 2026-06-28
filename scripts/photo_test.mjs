import { createClient } from "@supabase/supabase-js";
import { Buffer } from "node:buffer";
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false}});

const SERVICE_ID = "3646d8b7-c8ba-4305-9b3a-b4db46886f07";
const PARTNER_ID = "4a89212a-84db-4adc-8e9a-93d9d204016f";
// 1x1 white JPG (~125 bytes)
const jpg = Buffer.from("ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffdb0043010909090c0b0c180d0d1832211c2132323232323232323232323232323232323232323232323232323232323232323232323232323232323232323232323232323232323232ffc00011080001000103012200021101031101ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc400b5100002010303020403050504040000017d01020300041105122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffc4001f0100030101010101010101010000000000000102030405060708090a0bffc400b51100020102040403040705040400010277000102031104052131061241510761711322328108144291a1b1c109233352f0156272d10a162434e125f11718191a262728292a35363738393a434445464748494a535455565758595a636465666768696a737475767778797a82838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae2e3e4e5e6e7e8e9eaf2f3f4f5f6f7f8f9faffda000c03010002110311003f00fbfb9a28a2803fffd9","hex");

const stages = [["before","front"],["after","front"],["after","rear"],["after","left"],["after","right"]];
const results = [];
for (const [stage, angle] of stages) {
  const path = `${PARTNER_ID}/${SERVICE_ID}/${stage}-${angle}-${Date.now()}.jpg`;
  const up = await sb.storage.from("service-photos").upload(path, jpg, { upsert:true, contentType:"image/jpeg" });
  const ins = await sb.from("service_photos").upsert(
    { service_id: SERVICE_ID, partner_id: PARTNER_ID, stage, angle, storage_path: path, lat:26.84, lng:80.98 },
    { onConflict:"service_id,stage,angle" }
  ).select("id, stage, angle").maybeSingle();
  results.push({ stage, angle, upErr: up.error?.message, insErr: ins.error?.message, id: ins.data?.id });
}
console.log("PHOTOS:", JSON.stringify(results, null, 2));

// Verify signed URL works
const { data: list } = await sb.from("service_photos").select("stage,angle,storage_path").eq("service_id", SERVICE_ID);
console.log("DB rows:", list);
const sample = list?.[0]?.storage_path;
if (sample) {
  const { data: sig } = await sb.storage.from("service-photos").createSignedUrl(sample, 600);
  console.log("Signed URL OK:", !!sig?.signedUrl, sig?.signedUrl?.slice(0,80));
}
