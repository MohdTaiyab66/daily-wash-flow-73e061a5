import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";

/**
 * Force every Capacitor-related Android module to target Java 17.
 *
 * Two modules matter for us:
 *   1) @capacitor/android    – the core bridge; ships with sourceCompatibility 21
 *   2) capacitor-razorpay    – the Razorpay plugin; also 21
 *
 * If (2) is left at 21 while the host JDK is 17, Gradle silently drops the
 * plugin AAR from the final APK. The JS side then falls back to the web
 * plugin (Razorpay checkout.js inside the WebView), which hides UPI-intent
 * apps entirely — the exact "UPI works on web but not in APK" symptom.
 */
const targets = [
  "node_modules/@capacitor/android/capacitor/build.gradle",
  "node_modules/capacitor-razorpay/android/build.gradle",
];

let fatal = false;
for (const file of targets) {
  if (!existsSync(file)) {
    console.log(`[capacitor-java] skipped: ${file} not present`);
    continue;
  }
  const source = await readFile(file, "utf8");
  const patched = source.replace(/JavaVersion\.VERSION_21/g, "JavaVersion.VERSION_17");
  if (patched !== source) {
    await writeFile(file, patched, "utf8");
    console.log(`[capacitor-java] patched ${file}: VERSION_21 → VERSION_17`);
  } else if (patched.includes("JavaVersion.VERSION_17")) {
    console.log(`[capacitor-java] ${file} already VERSION_17`);
  } else {
    console.log(`[capacitor-java] ${file}: no Java 21 setting found (ok)`);
  }
  const verified = await readFile(file, "utf8");
  if (verified.includes("JavaVersion.VERSION_21")) {
    console.error(`[capacitor-java] failed: ${file} still contains JavaVersion.VERSION_21`);
    fatal = true;
  }
}

const razorpayPluginFile = "node_modules/capacitor-razorpay/android/src/main/java/com/ionicframework/capacitor/Checkout.java";
if (existsSync(razorpayPluginFile)) {
  const source = await readFile(razorpayPluginFile, "utf8");
  const patched = source
    .replace("import com.getcapacitor.NativePlugin;", "import com.getcapacitor.annotation.CapacitorPlugin;")
    .replace(/@NativePlugin\s*\(\s*requestCodes\s*=\s*\{com\.razorpay\.Checkout\.RZP_REQUEST_CODE\}\s*\)/, '@CapacitorPlugin(name = "Checkout")');
  if (patched !== source) {
    await writeFile(razorpayPluginFile, patched, "utf8");
    console.log(`[capacitor-java] patched ${razorpayPluginFile}: NativePlugin → CapacitorPlugin`);
  } else if (patched.includes('@CapacitorPlugin(name = "Checkout")')) {
    console.log(`[capacitor-java] ${razorpayPluginFile} already uses CapacitorPlugin`);
  } else {
    console.error(`[capacitor-java] failed: could not patch Razorpay Checkout annotation in ${razorpayPluginFile}`);
    fatal = true;
  }
}

if (fatal) process.exit(1);
