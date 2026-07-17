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

// Inject UPI package-detection + final-options logging into the plugin's
// open() method. Confirms whether Android's PackageManager sees any UPI apps
// from inside the plugin process (post-manifest <queries>) and shows the
// exact JSON handed to CheckoutActivity — so we can prove the wrapper is not
// stripping fields (e.g. `method`, `config.display`).
if (existsSync(razorpayPluginFile)) {
  let source = await readFile(razorpayPluginFile, "utf8");
  const MARK = "// [uw-upi-diag]";
  if (!source.includes(MARK)) {
    // Ensure PackageManager import.
    if (!source.includes("import android.content.pm.PackageManager;")) {
      source = source.replace(
        "import android.content.Intent;",
        "import android.content.Intent;\nimport android.content.pm.PackageManager;",
      );
    }
    // Inject diagnostics right after `JSObject jsObject = call.getData();`.
    const anchor = "JSObject jsObject = call.getData();";
    const diag = `${anchor}
            ${MARK}
            try {
                PackageManager pm = getContext().getPackageManager();
                String[] upiPkgs = new String[] {
                    "com.google.android.apps.nbu.paisa.user",
                    "com.phonepe.app",
                    "net.one97.paytm",
                    "in.org.npci.upiapp",
                    "com.amazon.mShop.android.shopping",
                    "in.amazon.mShop.android.shopping"
                };
                StringBuilder sb = new StringBuilder();
                for (String p : upiPkgs) {
                    boolean present;
                    try { pm.getPackageInfo(p, 0); present = true; }
                    catch (PackageManager.NameNotFoundException nnf) { present = false; }
                    sb.append(p).append("=").append(present).append(" ");
                }
                Log.i("UW_UPI_DIAG", "installed: " + sb.toString().trim());
                Log.i("UW_UPI_DIAG", "checkout.open options: " + jsObject.toString());
                try {
                    Package rzpPkg = com.razorpay.Checkout.class.getPackage();
                    String implVer = rzpPkg != null ? rzpPkg.getImplementationVersion() : null;
                    String specVer = rzpPkg != null ? rzpPkg.getSpecificationVersion() : null;
                    Log.i("UW_UPI_DIAG", "Checkout SDK implementationVersion=" + implVer + " specificationVersion=" + specVer);
                } catch (Throwable vt) {
                    Log.w("UW_UPI_DIAG", "sdk version probe failure: " + vt.getMessage());
                }
                try {
                    com.razorpay.Checkout.preload(getContext().getApplicationContext());
                    Log.i("UW_UPI_DIAG", "Checkout.preload invoked from plugin diagnostics");
                } catch (Throwable pt) {
                    Log.w("UW_UPI_DIAG", "preload failure: " + pt.getMessage());
                }
            } catch (Throwable t) {
                Log.w("UW_UPI_DIAG", "diagnostic failure: " + t.getMessage());
            }`;
    if (source.includes(anchor)) {
      source = source.replace(anchor, diag);
      await writeFile(razorpayPluginFile, source, "utf8");
      console.log(`[capacitor-java] injected UPI diagnostics into ${razorpayPluginFile}`);
    } else {
      console.warn(`[capacitor-java] could not find anchor for UPI diagnostics; skipping`);
    }
  } else {
    console.log(`[capacitor-java] UPI diagnostics already present`);
  }
}

if (fatal) process.exit(1);

