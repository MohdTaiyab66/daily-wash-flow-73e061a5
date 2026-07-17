import "./patch-capacitor-java.mjs";
import { readFile, writeFile, mkdir, copyFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const manifest = "android/app/src/main/AndroidManifest.xml";

if (!existsSync(manifest)) {
  console.log(`[android-manifest] skipped: ${manifest} not found`);
  process.exit(0);
}

let xml = await readFile(manifest, "utf8");

const permissions = [
  "android.permission.ACCESS_FINE_LOCATION",
  "android.permission.ACCESS_COARSE_LOCATION",
  "android.permission.CAMERA",
  "android.permission.POST_NOTIFICATIONS",
  "android.permission.USE_FULL_SCREEN_INTENT",
  "android.permission.WAKE_LOCK",
  "android.permission.VIBRATE",
  "android.permission.RECEIVE_BOOT_COMPLETED",
  "android.permission.INTERNET",
  // Razorpay's Android SDK detects installed UPI apps through PackageManager.
  // Some OEM Android 11+ builds still return an empty result even with scheme
  // intent queries, causing Checkout to hide UPI completely. This keeps the APK
  // fail-open for payment-app discovery on sideload/debug production builds.
  "android.permission.QUERY_ALL_PACKAGES",
];

for (const name of permissions) {
  if (!xml.includes(`android:name="${name}"`)) {
    xml = xml.replace(/(<manifest\b[^>]*>)/, `$1\n    <uses-permission android:name="${name}" />`);
  }
}

// Keep Capacitor's MainActivity alive through camera/permission orientation and
// screen-size changes. Without this, Android may recreate the WebView when the
// camera returns, which feels like the partner flow refreshed/restarted and can
// strand unsaved notes or report state.
xml = xml.replace(
  /<activity\b([^>]*android:name="\.MainActivity"[^>]*)>/,
  (match, attrs) => {
    let next = attrs;
    if (!/android:configChanges=/.test(next)) {
      next += ' android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode|navigation"';
    }
    if (!/android:launchMode=/.test(next)) next += ' android:launchMode="singleTask"';
    return `<activity${next}>`;
  },
);

// <queries> block — required on Android 11+ (API 30+) so the Razorpay
// native SDK can detect installed UPI apps (Google Pay, PhonePe, Paytm,
// BHIM, etc.) via PackageManager. Without an explicit UPI intent query
// here, Android returns an empty list of UPI handlers and the Razorpay
// checkout hides the UPI payment option entirely inside the APK.
if (!xml.includes("<!-- urbanwash-queries -->")) {
  // Remove any legacy maps-only <queries> block so we can replace it with
  // the expanded version below.
  xml = xml.replace(/\n?\s*<queries>[\s\S]*?<\/queries>\n?/, "\n");
  const queries = `
    <!-- urbanwash-queries -->
    <queries>
        <package android:name="com.google.android.apps.maps" />
        <!-- UPI apps (Android 11+ package visibility) -->
        <package android:name="com.google.android.apps.nbu.paisa.user" />
        <package android:name="com.phonepe.app" />
        <package android:name="net.one97.paytm" />
        <package android:name="in.org.npci.upiapp" />
        <package android:name="in.amazon.mShop.android.shopping" />
        <package android:name="com.myairtelapp" />
        <package android:name="com.mobikwik_new" />
        <package android:name="com.freecharge.android" />
        <package android:name="com.csam.icici.bank.imobile" />
        <package android:name="com.axis.mobile" />
        <package android:name="com.sbi.upi" />
        <package android:name="com.enstage.wibmo.hdfc" />
        <package android:name="com.msf.kbank.mobile" />
        <intent>
            <action android:name="android.intent.action.VIEW" />
            <data android:scheme="geo" />
        </intent>
        <intent>
            <action android:name="android.intent.action.VIEW" />
            <data android:scheme="google.navigation" />
        </intent>
        <intent>
            <action android:name="android.intent.action.VIEW" />
            <data android:scheme="upi" />
        </intent>
        <intent>
            <action android:name="android.intent.action.VIEW" />
            <data android:scheme="upi" android:host="pay" />
        </intent>
    </queries>
`;
  xml = xml.replace("<application", `${queries}\n    <application`);
}

// Register the marketplace FCM service + accept/decline receiver.
if (!xml.includes("com.urbanwash.push.UrbanwashMessagingService")) {
  const svc = `
        <service
            android:name="com.urbanwash.push.UrbanwashMessagingService"
            android:exported="false">
            <intent-filter>
                <action android:name="com.google.firebase.MESSAGING_EVENT" />
            </intent-filter>
        </service>
        <receiver
            android:name="com.urbanwash.push.OfferActionReceiver"
            android:exported="false" />
`;
  xml = xml.replace(/(<\/application>)/, `${svc}    $1`);
}

await writeFile(manifest, xml);
console.log("[android-manifest] permissions, UPI package visibility, maps intents and offer service verified");

// capacitor-razorpay is an old Capacitor plugin and does not reliably
// auto-register on Capacitor 8. If Checkout is not registered, the JS import can
// exist while the native bridge is missing, leading to WebView checkout fallback
// where Razorpay hides UPI intents. Register it explicitly in MainActivity.
async function collectFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await collectFiles(path, out);
    else out.push(path);
  }
  return out;
}

const javaFiles = await collectFiles("android/app/src/main/java");
const mainActivity = javaFiles.find((file) => file.endsWith("MainActivity.java"));
if (!mainActivity) {
  console.error("[android-manifest] missing MainActivity.java; cannot register Razorpay Checkout plugin");
  process.exit(1);
}

let activity = await readFile(mainActivity, "utf8");
if (!activity.includes("com.ionicframework.capacitor.Checkout")) {
  activity = activity.replace(/(package\s+[^;]+;\s*)/, `$1\nimport android.os.Bundle;\nimport com.ionicframework.capacitor.Checkout;\n`);
} else if (!activity.includes("import android.os.Bundle;")) {
  activity = activity.replace(/(package\s+[^;]+;\s*)/, `$1\nimport android.os.Bundle;\n`);
}

if (!activity.includes("registerPlugin(Checkout.class)")) {
  const onCreateWithSuper = /(void\s+onCreate\s*\(\s*Bundle\s+savedInstanceState\s*\)\s*\{\s*super\.onCreate\(savedInstanceState\);)/s;
  if (onCreateWithSuper.test(activity)) {
    activity = activity.replace(onCreateWithSuper, `$1\n        registerPlugin(Checkout.class);`);
  } else {
    activity = activity.replace(/(public\s+class\s+MainActivity\s+extends\s+BridgeActivity\s*\{)/, `$1\n    @Override\n    public void onCreate(Bundle savedInstanceState) {\n        super.onCreate(savedInstanceState);\n        registerPlugin(Checkout.class);\n    }\n`);
  }
}

if (!activity.includes("registerPlugin(Checkout.class)")) {
  console.error(`[android-manifest] failed to register Razorpay Checkout plugin in ${mainActivity}`);
  process.exit(1);
}

await writeFile(mainActivity, activity, "utf8");
console.log(`[android-manifest] Razorpay Checkout plugin registered in ${mainActivity}`);

// Copy Kotlin sources into the package directory.
const pkgDir = "android/app/src/main/java/com/urbanwash/push";
await mkdir(pkgDir, { recursive: true });
const kotlinSrc = "android-native/kotlin";
if (existsSync(kotlinSrc)) {
  for (const file of await readdir(kotlinSrc)) {
    if (!file.endsWith(".kt")) continue;
    await copyFile(join(kotlinSrc, file), join(pkgDir, file));
  }
  console.log(`[android-manifest] copied Kotlin sources → ${pkgDir}`);
}

// Copy custom sound if present.
const soundSrc = "android-native/res/raw/uw_offer.mp3";
const soundDst = "android/app/src/main/res/raw/uw_offer.mp3";
if (!existsSync(soundSrc)) {
  console.error(`[android-manifest] missing required custom offer sound: ${soundSrc}`);
  process.exit(1);
}

await mkdir(dirname(soundDst), { recursive: true });
await copyFile(soundSrc, soundDst);
console.log(`[android-manifest] custom offer sound verified → ${soundDst}`);
