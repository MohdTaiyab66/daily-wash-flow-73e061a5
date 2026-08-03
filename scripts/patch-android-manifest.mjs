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
const importsToEnsure = [
  "android.content.Intent",
  "android.os.Bundle",
  "android.util.Log",
  "android.webkit.WebSettings",
  "android.webkit.WebView",
  "com.ionicframework.capacitor.Checkout",
];
for (const importName of importsToEnsure) {
  if (!activity.includes(`import ${importName};`)) {
    activity = activity.replace(/(package\s+[^;]+;\s*)/, `$1\nimport ${importName};\n`);
  }
}

// Register before super.onCreate(). In Capacitor 8, BridgeActivity creates the
// bridge during super.onCreate(); registering after that is too late and leaves
// Checkout unavailable at runtime.
activity = activity.replace(/^\s*registerPlugin\(Checkout\.class\);\s*$/gm, "");
activity = activity.replace(/^\s*Log\.i\("PARTNER_BUILD",[\s\S]*?\);\s*$/gm, "");
const onCreateStart = /(void\s+onCreate\s*\(\s*Bundle\s+savedInstanceState\s*\)\s*\{)/s;
if (onCreateStart.test(activity)) {
  activity = activity.replace(onCreateStart, `$1\n        registerPlugin(Checkout.class);`);
} else {
  activity = activity.replace(/(public\s+class\s+MainActivity\s+extends\s+BridgeActivity\s*\{)/, `$1\n    @Override\n    public void onCreate(Bundle savedInstanceState) {\n        registerPlugin(Checkout.class);\n        super.onCreate(savedInstanceState);\n    }\n`);
}

if (!activity.includes("registerPlugin(Checkout.class)")) {
  console.error(`[android-manifest] failed to register Razorpay Checkout plugin in ${mainActivity}`);
  process.exit(1);
}

// Idempotent marker removal (same pattern as the Gradle patchers): strip every
// previously injected block before inserting a fresh one. Index-based so it is
// immune to CRLF line endings and to nested/duplicated blocks from past builds.
function stripMarkedBlocks(source, startMarker, endMarker) {
  let out = source;
  for (;;) {
    const start = out.indexOf(startMarker);
    if (start === -1) break;
    const endIdx = out.indexOf(endMarker, start);
    if (endIdx === -1) {
      // Orphan start marker (truncated block) — drop to end of that line.
      const lineEnd = out.indexOf("\n", start);
      out = out.slice(0, start) + (lineEnd === -1 ? "" : out.slice(lineEnd + 1));
      continue;
    }
    let from = start;
    // Swallow the leading indentation/newline of the block.
    while (from > 0 && (out[from - 1] === " " || out[from - 1] === "\t")) from -= 1;
    if (from > 0 && out[from - 1] === "\n") from -= 1;
    if (from > 0 && out[from - 1] === "\r") from -= 1;
    out = out.slice(0, from) + out.slice(endIdx + endMarker.length);
  }
  return out;
}

activity = stripMarkedBlocks(
  activity,
  "// urbanwash-webview-cache-bust-start",
  "// urbanwash-webview-cache-bust-end",
);

const cacheBustBlock = `
        // urbanwash-webview-cache-bust-start
        WebView urbanwashWebView = getBridge().getWebView();
        if (urbanwashWebView != null) {
            urbanwashWebView.clearCache(true);
            urbanwashWebView.getSettings().setCacheMode(WebSettings.LOAD_NO_CACHE);
            urbanwashWebView.post(new Runnable() {
                @Override
                public void run() {
                    Log.i("PARTNER_BUILD", "WEBVIEW_CACHE_CLEARED_FORCE_RELOAD");
                    urbanwashWebView.reload();
                }
            });
        }
        // urbanwash-webview-cache-bust-end`;
if (/super\.onCreate\(savedInstanceState\);/.test(activity)) {
  activity = activity.replace(/super\.onCreate\(savedInstanceState\);/, `super.onCreate(savedInstanceState);${cacheBustBlock}`);
} else {
  console.error(`[android-manifest] MainActivity.java has no super.onCreate(savedInstanceState); cannot install WebView cache reset`);
  process.exit(1);
}

// Razorpay checkout is launched by the SDK itself (com.razorpay.Checkout.open),
// so its result arrives on the host Activity, not on the Capacitor bridge.
// Forward it to the plugin or the payment promise never settles.
activity = stripMarkedBlocks(
  activity,
  "// urbanwash-rzp-result-start",
  "// urbanwash-rzp-result-end",
);
const rzpResultBlock = `
    // urbanwash-rzp-result-start
    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        try {
            Checkout.handleRazorpayActivityResult(this, requestCode, resultCode, data);
        } catch (Throwable t) {
            Log.e("PARTNER_BUILD", "Razorpay activity result forwarding failed", t);
        }
    }
    // urbanwash-rzp-result-end
`;
const lastBrace = activity.lastIndexOf("}");
if (lastBrace === -1) {
  console.error(`[android-manifest] MainActivity.java is malformed; cannot install Razorpay result bridge`);
  process.exit(1);
}
activity = activity.slice(0, lastBrace) + rzpResultBlock + activity.slice(lastBrace);


const partnerBuildNumber = process.env.PARTNER_BUILD_NUMBER ?? process.env.VERSION_CODE ?? "32";
const partnerVersion = process.env.PARTNER_APP_VERSION ?? process.env.VERSION_NAME ?? "1.0.32";
const partnerBuildId = process.env.PARTNER_BUILD_ID ?? "2026-07-18-trace-01";
const partnerGitSha = process.env.PARTNER_GIT_SHA ?? process.env.GIT_SHA ?? "unknown";
const partnerBuildTime = process.env.PARTNER_BUILD_TIME ?? new Date().toISOString();
const buildLogLine = `Log.i("PARTNER_BUILD", "PARTNER_BUILD=partner BUILD_NUMBER=${partnerBuildNumber} BUILD_VERSION=${partnerVersion} BUILD_ID=${partnerBuildId} GIT_SHA=${partnerGitSha} BUILD_TIME=${partnerBuildTime}");`;
activity = activity.replace(
  /registerPlugin\(Checkout\.class\);/,
  `registerPlugin(Checkout.class);\n        ${buildLogLine}\n        Log.i("PARTNER_BUILD", "DEVICE_MANUFACTURER=" + android.os.Build.MANUFACTURER + " DEVICE_MODEL=" + android.os.Build.MODEL + " SDK_INT=" + android.os.Build.VERSION.SDK_INT);`,
);

await writeFile(mainActivity, activity, "utf8");
console.log(`[android-manifest] Razorpay Checkout plugin and PARTNER_BUILD startup logs registered in ${mainActivity}`);

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
