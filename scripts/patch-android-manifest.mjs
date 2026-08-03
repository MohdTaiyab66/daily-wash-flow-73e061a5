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
        <intent>
            <action android:name="android.intent.action.SEND" />
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

// Firebase dispatches a message to exactly ONE service registered for
// com.google.firebase.MESSAGING_EVENT (the first match returned by
// PackageManager). Capacitor's plugins each merge in their own MessagingService,
// so without these overrides a plugin service can win the race: it forwards to
// the JS bridge (fine in foreground) but posts nothing for a data-only message
// when the app is backgrounded, locked or killed. Removing them at merge time
// guarantees UrbanwashMessagingService is the single FCM entry point.
const PLUGIN_MESSAGING_SERVICES = [
  "io.capawesome.capacitorjs.plugins.firebase.messaging.MessagingService",
  "com.capacitorjs.plugins.pushnotifications.MessagingService",
  // Shipped by the firebase-messaging AAR itself as a low-priority fallback
  // receiver for MESSAGING_EVENT. It merges in even when no plugin is present,
  // leaving two MESSAGING_EVENT owners. Our service extends
  // FirebaseMessagingService, so this default entry is redundant.
  "com.google.firebase.messaging.FirebaseMessagingService",
];


if (!/xmlns:tools=/.test(xml)) {
  xml = xml.replace(
    /(<manifest\b)/,
    `$1 xmlns:tools="http://schemas.android.com/tools"`,
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function removeServiceDeclarations(source, fqcn) {
  const name = escapeRegExp(fqcn);
  const serviceWithName = `<service\\b(?=[^>]*android:name\\s*=\\s*["']${name}["'])[^>]*`;
  return source
    .replace(new RegExp(`\\n?\\s*${serviceWithName}\\/>\\s*`, "g"), "\n")
    .replace(new RegExp(`\\n?\\s*${serviceWithName}>[\\s\\S]*?<\\/service>\\s*`, "g"), "\n");
}

for (const fqcn of PLUGIN_MESSAGING_SERVICES) {
  // Always normalize stale declarations first. Repeated builds or generated
  // manifests may already contain this service without tools:node="remove";
  // merely checking xml.includes(android:name=...) would then skip the actual
  // merge-removal rule and allow the library's MESSAGING_EVENT owner through.
  xml = removeServiceDeclarations(xml, fqcn);
  xml = xml.replace(
    /(<\/application>)/,
    `        <service android:name="${fqcn}" tools:node="remove" />\n    $1`,
  );
}


await writeFile(manifest, xml);
console.log("[android-manifest] permissions, UPI package visibility, maps intents and offer service verified");

// MainActivity.java is production source owned by this repo
// (android/app/src/main/java/com/urbanwash/customer/MainActivity.java). It
// registers the app-module payment plugin exactly once and forwards the
// Razorpay activity result. Nothing is injected into it any more.

async function collectFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await collectFiles(path, out);
    else out.push(path);
  }
  return out;
}

// Restore repo-owned native Java sources (payment plugin) into the Android
// project. `cap sync` never removes them; this only matters when android/ was
// regenerated from scratch (variant switch / clean clone).
const javaSrcRoot = "android-native/java";
if (existsSync(javaSrcRoot)) {
  for (const file of await collectFiles(javaSrcRoot)) {
    const dest = join("android/app/src/main/java", file.slice(javaSrcRoot.length + 1));
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(file, dest);
    console.log(`[android-manifest] restored native source → ${dest}`);
  }
}

const mainActivityPath = "android/app/src/main/java/com/urbanwash/customer/MainActivity.java";
if (existsSync(mainActivityPath)) {
  const activity = await readFile(mainActivityPath, "utf8");
  if (activity.includes("com.ionicframework.capacitor")) {
    console.error("[android-manifest] FATAL: MainActivity still references the removed upstream Razorpay plugin");
    process.exit(1);
  }
  const registrations = (activity.match(/registerPlugin\(/g) ?? []).length;
  if (registrations !== 1 || !activity.includes("registerPlugin(UrbanWashCheckoutPlugin.class)")) {
    console.error(`[android-manifest] FATAL: MainActivity must register UrbanWashCheckoutPlugin exactly once (found ${registrations})`);
    process.exit(1);
  }
  console.log("[android-manifest] MainActivity verified: single UrbanWashCheckout registration");
}

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
