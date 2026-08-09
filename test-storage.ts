import { supabase } from "./src/integrations/supabase/client";
import { readFileSync } from "fs";

async function testStorage() {
  const fileName = "body-polish-test.jpg";
  const fileContent = Buffer.from("test image content");
  
  console.log("Uploading test image...");
  const { data, error } = await supabase.storage
    .from('service-photography')
    .upload(fileName, fileContent, {
      contentType: 'image/jpeg',
      upsert: true
    });

  if (error) {
    console.error("Upload failed:", error);
    return;
  }

  console.log("Upload successful:", data);

  const { data: urlData } = supabase.storage
    .from('service-photography')
    .getPublicUrl(fileName);

  console.log("Public URL:", urlData.publicUrl);

  try {
    const response = await fetch(urlData.publicUrl);
    console.log("Fetch Status:", response.status);
    console.log("Fetch Status Text:", response.statusText);
    const body = await response.text();
    console.log("Fetch Response Body:", body);
  } catch (err) {
    console.error("Fetch failed:", err);
  }
}

testStorage();
