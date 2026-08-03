#!/usr/bin/env node
/**
 * Hard-gate verifier for the Partner APK native surface.
 *
 * Fails (exit 1) unless ALL of the following hold:
 *   1. UrbanwashMessagingService class bytes present in APK classes*.dex
 *   2. OfferActionReceiver class bytes present in APK classes*.dex
 *   3. AndroidManifest.xml declares <service> for UrbanwashMessagingService
 *      and <receiver> for OfferActionReceiver
 *   4. Kotlin source package matches the manifest android:name package
 *
 * Prints a PASS/FAIL summary at the end.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { decodeAxml } from "./lib/axml.mjs";
import { findMessagingEventServices } from "./lib/manifest-audit.mjs";

const APK = process.argv[2] || "android/app/build/outputs/apk/debug/app-debug.apk";
const MANIFEST = "android/app/src/main/AndroidManifest.xml";
const KOTLIN_DIR = "android/app/src/main/java/com/urbanwash/push";

const EXPECTED_PACKAGE = "com.urbanwash.push";
const CLASSES = [
  { simple: "UrbanwashMessagingService", kind: "service" },
  { simple: "OfferActionReceiver", kind: "receiver" },
];

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
}

// --- 1. Manifest checks ------------------------------------------------------
let manifestXml = "";
try {
  manifestXml = fs.readFileSync(MANIFEST, "utf8");
  record("manifest.readable", true, MANIFEST);
} catch (e) {
  record("manifest.readable", false, e.message);
}

for (const { simple, kind } of CLASSES) {
  const fqcn = `${EXPECTED_PACKAGE}.${simple}`;
  const tagRe = new RegExp(
    `<${kind}\\b[^>]*android:name\\s*=\\s*"(?:${EXPECTED_PACKAGE}\\.)?${simple}"`,
  );
  const hasFqcn = manifestXml.includes(`android:name="${fqcn}"`);
  const hasTag = tagRe.test(manifestXml);
  record(
    `manifest.<${kind}>.${simple}`,
    hasTag && hasFqcn,
    hasFqcn ? "fully-qualified name present" : "missing android:name=" + fqcn,
  );
}

// Exactly one FirebaseMessagingService may win FCM dispatch. Capacitor plugins
// merge their own MessagingService in; they must be removed at merge time or
// background/locked/killed data-only pushes silently go to the plugin instead.
for (const fqcn of [
  "io.capawesome.capacitorjs.plugins.firebase.messaging.MessagingService",
  "com.capacitorjs.plugins.pushnotifications.MessagingService",
  // Default fallback service shipped inside the firebase-messaging AAR.
  "com.google.firebase.messaging.FirebaseMessagingService",
]) {

  const removed = new RegExp(
    `<service[^>]*android:name\\s*=\\s*"${fqcn.replace(/\./g, "\\.")}"[^>]*tools:node\\s*=\\s*"remove"`,
  ).test(manifestXml);
  record(
    `manifest.single-fcm-service.${fqcn.split(".").pop()}`,
    removed,
    removed ? `${fqcn} removed at merge` : `${fqcn} not removed — duplicate FCM entry point`,
  );
}

const messagingEventFilters = (manifestXml.match(/com\.google\.firebase\.MESSAGING_EVENT/g) ?? []).length;
record(
  "manifest.messaging-event.single",
  messagingEventFilters === 1,
  `${messagingEventFilters} MESSAGING_EVENT intent-filter(s) declared in app manifest`,
);



// --- 2. Kotlin package check -------------------------------------------------
for (const { simple } of CLASSES) {
  const file = path.join(KOTLIN_DIR, `${simple}.kt`);
  try {
    const src = fs.readFileSync(file, "utf8");
    const m = src.match(/^\s*package\s+([\w.]+)/m);
    const pkg = m ? m[1] : "(none)";
    record(
      `kotlin.package.${simple}`,
      pkg === EXPECTED_PACKAGE,
      `${file} declares package ${pkg}`,
    );
  } catch (e) {
    record(`kotlin.package.${simple}`, false, `${file}: ${e.message}`);
  }
}

// --- 3. APK entry reader -----------------------------------------------------
// Minimal ZIP reader: walks central directory, extracts entries matching a filter.
function readApkEntries(apkPath, match) {
  const buf = fs.readFileSync(apkPath);
  // Locate EOCD
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("EOCD not found in APK");
  const cdCount = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  const entries = [];
  let p = cdOffset;
  for (let i = 0; i < cdCount; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("Bad CD signature");
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const uncompSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localHeader = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nameLen).toString("utf8");
    if (match(name)) {
      // Read local file header to skip its variable fields
      const lh = localHeader;
      const lhNameLen = buf.readUInt16LE(lh + 26);
      const lhExtraLen = buf.readUInt16LE(lh + 28);
      const dataStart = lh + 30 + lhNameLen + lhExtraLen;
      const raw = buf.slice(dataStart, dataStart + compSize);
      let data;
      if (method === 0) data = raw;
      else if (method === 8) data = zlib.inflateRawSync(raw);
      else throw new Error(`Unsupported compression ${method} for ${name}`);
      entries.push({ name, data, uncompSize });
    }
    p += 46 + nameLen + extraLen + commentLen;
    if (p - cdOffset > cdSize) break;
  }
  return entries;
}

let dexEntries = [];
try {
  if (!fs.existsSync(APK)) throw new Error(`APK not found: ${APK}`);
  dexEntries = readApkEntries(APK, (n) => /^classes\d*\.dex$/.test(n));
  record("apk.dex.count", dexEntries.length > 0, `${dexEntries.length} dex file(s): ${dexEntries.map(d => d.name).join(", ")}`);
} catch (e) {
  record("apk.dex.count", false, e.message);
}

for (const { simple } of CLASSES) {
  const needle = Buffer.from(simple, "utf8");
  let hit = null;
  for (const d of dexEntries) {
    if (d.data.indexOf(needle) !== -1) { hit = d.name; break; }
  }
  record(`apk.dex.contains.${simple}`, !!hit, hit ? `found in ${hit}` : "not present in any classes*.dex");
}

// --- 4. MERGED manifest inside the APK ---------------------------------------
// The source manifest is only an input to the manifest merger. What actually
// ships is the binary AndroidManifest.xml inside the APK, which also contains
// everything Capacitor plugin manifests merged in. Decode it and assert that
// exactly one service owns com.google.firebase.MESSAGING_EVENT.
const MERGED_FCM_OWNER = `${EXPECTED_PACKAGE}.UrbanwashMessagingService`;
const COMPETING_SERVICES = [
  "io.capawesome.capacitorjs.plugins.firebase.messaging.MessagingService",
  "com.capacitorjs.plugins.pushnotifications.MessagingService",
  "com.google.firebase.messaging.FirebaseMessagingService",
];


try {
  const [manifestEntry] = readApkEntries(APK, (n) => n === "AndroidManifest.xml");
  if (!manifestEntry) throw new Error("AndroidManifest.xml not found inside APK");
  const elements = decodeAxml(manifestEntry.data);
  record("apk.manifest.decoded", elements.length > 0, `${elements.length} elements decoded from merged binary manifest`);

  const names = findMessagingEventServices(elements);
  record(
    "apk.merged.messaging-event.single",
    names.length === 1,

    names.length ? `MESSAGING_EVENT services: ${names.join(", ")}` : "no MESSAGING_EVENT service in merged manifest",
  );
  record(
    "apk.merged.messaging-event.owner",
    names.length === 1 && names[0] === MERGED_FCM_OWNER,
    `expected ${MERGED_FCM_OWNER}, got ${names.join(", ") || "(none)"}`,
  );
  for (const fqcn of COMPETING_SERVICES) {
    const present = names.includes(fqcn);
    record(
      `apk.merged.no-competing.${fqcn.split(".").slice(-2).join(".")}`,
      !present,
      present ? "still registered for MESSAGING_EVENT after merge" : "absent from merged manifest",
    );
  }

  // Runtime-critical permissions must survive the merge too.
  const permissions = new Set(
    elements.filter((e) => e.name === "uses-permission").map((e) => e.attrs["android:name"]),
  );
  for (const perm of [
    "android.permission.POST_NOTIFICATIONS",
    "android.permission.USE_FULL_SCREEN_INTENT",
    "android.permission.WAKE_LOCK",
  ]) {
    record(`apk.merged.permission.${perm.split(".").pop()}`, permissions.has(perm), permissions.has(perm) ? "present" : "missing after merge");
  }

  const receiverPresent = elements.some(
    (e) => e.name === "receiver" && e.attrs["android:name"] === `${EXPECTED_PACKAGE}.OfferActionReceiver`,
  );
  record("apk.merged.receiver.OfferActionReceiver", receiverPresent, receiverPresent ? "declared in merged manifest" : "missing after merge");
} catch (e) {
  record("apk.manifest.decoded", false, e.message);
}

// Cross-check against the Gradle merged-manifest artifact when it exists — this
// is the same file APK Analyzer / `aapt dump xmltree` would show, in plain text.
const MERGED_TEXT_GLOBS = [
  "android/app/build/intermediates/merged_manifests/debug/processDebugManifest/AndroidManifest.xml",
  "android/app/build/intermediates/merged_manifests/debug/AndroidManifest.xml",
  "android/app/build/outputs/logs/manifest-merger-debug-report.txt",
];
const mergedTextPath = MERGED_TEXT_GLOBS.find((p) => fs.existsSync(p));
if (mergedTextPath && mergedTextPath.endsWith(".xml")) {
  const text = fs.readFileSync(mergedTextPath, "utf8");
  const count = (text.match(/com\.google\.firebase\.MESSAGING_EVENT/g) ?? []).length;
  record("gradle.merged-manifest.messaging-event.single", count === 1, `${count} MESSAGING_EVENT filter(s) in ${mergedTextPath}`);
  for (const fqcn of COMPETING_SERVICES) {
    const present = text.includes(`android:name="${fqcn}"`);
    record(
      `gradle.merged-manifest.no-competing.${fqcn.split(".").slice(-2).join(".")}`,
      !present,
      present ? `still present in ${mergedTextPath}` : "absent",
    );
  }
}

// --- 5. Launcher icons packaged in the APK -----------------------------------
// The res/mipmap-*/ic_launcher*.png entries inside the APK must be byte-identical
// to android-branding/res (the branding source of truth). A mismatch means a
// template/stale asset survived cap sync into the package.
const BRANDING = "android-branding/res";
try {
  if (!fs.existsSync(BRANDING)) throw new Error(`${BRANDING} missing`);
  const brandHashes = new Map();
  for (const dir of fs.readdirSync(BRANDING)) {
    const dirPath = path.join(BRANDING, dir);
    if (!fs.statSync(dirPath).isDirectory()) continue;
    for (const name of fs.readdirSync(dirPath)) {
      if (!name.endsWith(".png")) continue;
      const h = createHash("sha256").update(fs.readFileSync(path.join(dirPath, name))).digest("hex");
      brandHashes.set(h, `${dir}/${name}`);
    }
  }
  const iconEntries = readApkEntries(APK, (n) => /^res\/mipmap-[^/]*\/ic_launcher[^/]*\.(png|webp)$/.test(n));
  record("apk.res.launcher.present", iconEntries.length > 0, `${iconEntries.length} launcher bitmap(s) in APK`);

  const stale = [];
  for (const e of iconEntries) {
    const h = createHash("sha256").update(e.data).digest("hex");
    if (!brandHashes.has(h)) stale.push(e.name);
  }
  record(
    "apk.res.launcher.matches-branding",
    iconEntries.length > 0 && stale.length === 0,
    stale.length
      ? `NOT from android-branding/res: ${stale.join(", ")} (run scripts/restore-android-branding.mjs before packaging; disable PNG crunching if AGP re-encoded them)`
      : "all launcher bitmaps byte-identical to android-branding/res",
  );
} catch (e) {
  record("apk.res.launcher.matches-branding", false, e.message);
}




// --- 6. Payment stack hard gate (audit F1–F4) --------------------------------
// The native checkout MUST be app-owned source, not a node_modules plugin that
// `cap sync` / `npm install` can restore to its broken upstream form.
const PAYMENT_PLUGIN_SRC = "android/app/src/main/java/com/urbanwash/payments/UrbanWashCheckoutPlugin.java";
const PAYMENT_PLUGIN_REPO_SRC = "android-native/java/com/urbanwash/payments/UrbanWashCheckoutPlugin.java";
const MAIN_ACTIVITY = "android/app/src/main/java/com/urbanwash/customer/MainActivity.java";

record("payments.upstream-plugin.absent", !fs.existsSync("node_modules/capacitor-razorpay"),
  fs.existsSync("node_modules/capacitor-razorpay")
    ? "node_modules/capacitor-razorpay is present — upstream raw-Intent checkout would ship"
    : "capacitor-razorpay is not installed");

for (const manifest of ["package.json", "bun.lock"]) {
  try {
    const source = fs.readFileSync(manifest, "utf8");
    const hasLegacyDependency = source.includes('"capacitor-razorpay"');
    record(`payments.dependency-manifest.clean.${path.basename(manifest)}`, !hasLegacyDependency,
      hasLegacyDependency ? `${manifest} can reinstall capacitor-razorpay` : `${manifest} has no legacy payment dependency`);
  } catch (e) {
    record(`payments.dependency-manifest.clean.${path.basename(manifest)}`, false, e.message);
  }
}

record("payments.patch-script.removed", !fs.existsSync("scripts/patch-capacitor-java.mjs"),
  "scripts/patch-capacitor-java.mjs must not exist");

for (const [name, file] of [["app-module", PAYMENT_PLUGIN_SRC], ["repo-source", PAYMENT_PLUGIN_REPO_SRC]]) {
  const ok = fs.existsSync(file);
  record(`payments.plugin-source.${name}`, ok, ok ? file : `missing ${file}`);
}

try {
  const capSettings = fs.readFileSync("android/capacitor.settings.gradle", "utf8");
  const has = capSettings.includes("capacitor-razorpay");
  record("payments.cap-settings.clean", !has, has ? "capacitor-razorpay still included by Capacitor" : "no upstream Razorpay module included");
} catch (e) {
  record("payments.cap-settings.clean", false, e.message);
}

for (const generatedFile of [
  "android/app/capacitor.build.gradle",
  "android/app/src/main/assets/capacitor.plugins.json",
]) {
  try {
    const source = fs.readFileSync(generatedFile, "utf8");
    const hasLegacyPlugin = source.includes("capacitor-razorpay") || source.includes("com.ionicframework.capacitor.Checkout");
    record(`payments.generated-registration.clean.${path.basename(generatedFile)}`, !hasLegacyPlugin,
      hasLegacyPlugin ? `${generatedFile} still packages/registers legacy Checkout` : `${generatedFile} has no legacy Checkout registration`);
  } catch (e) {
    record(`payments.generated-registration.clean.${path.basename(generatedFile)}`, false, e.message);
  }
}

try {
  const appGradle = fs.readFileSync("android/app/build.gradle", "utf8");
  record("payments.gradle.permanent-block", appGradle.includes("[uw-payments]"), "permanent [uw-payments] block present");
  const dynamic = /com\.razorpay:checkout:[^'"]*\+/.test(appGradle);
  record("payments.gradle.no-dynamic-version", !dynamic, dynamic ? "dynamic com.razorpay:checkout version found" : "only fixed 1.6.41");
  const pins = (appGradle.match(/com\.razorpay:checkout:1\.6\.41/g) ?? []).length;
  record("payments.gradle.single-pin", pins > 0, `${pins} reference(s) to com.razorpay:checkout:1.6.41`);
} catch (e) {
  record("payments.gradle.permanent-block", false, e.message);
}

try {
  const props = fs.readFileSync("android/gradle.properties", "utf8");
  const hardcoded = /^org\.gradle\.java\.home=/m.test(props);
  record("build.java.no-machine-path", !hardcoded, hardcoded ? "org.gradle.java.home is hardcoded" : "no machine-specific JDK path");
} catch (e) {
  record("build.java.no-machine-path", false, e.message);
}

try {
  const activity = fs.readFileSync(MAIN_ACTIVITY, "utf8");
  const registrations = (activity.match(/registerPlugin\(/g) ?? []).length;
  record("payments.registration.single", registrations === 1 && activity.includes("registerPlugin(UrbanWashCheckoutPlugin.class)"),
    `${registrations} registerPlugin call(s) in MainActivity`);
  record("payments.mainactivity.no-upstream", !activity.includes("com.ionicframework.capacitor"),
    "MainActivity must not reference the upstream plugin");
  record("payments.mainactivity.clean", !activity.includes("PARTNER_BUILD"),
    "MainActivity must not carry partner build logging");
} catch (e) {
  record("payments.registration.single", false, e.message);
}

// APK bytes: our plugin must be compiled in, the upstream one must be gone.
{
  const present = dexEntries.some((d) => d.data.indexOf(Buffer.from("UrbanWashCheckoutPlugin", "utf8")) !== -1);
  record("apk.dex.contains.UrbanWashCheckoutPlugin", present, present ? "compiled into classes*.dex" : "missing from APK");
  const upstream = dexEntries.some((d) => d.data.indexOf(Buffer.from("com/ionicframework/capacitor/Checkout", "utf8")) !== -1);
  record("apk.dex.no-upstream-checkout", !upstream, upstream ? "upstream capacitor-razorpay Checkout class shipped" : "upstream plugin absent from APK");
  const upstreamDotted = dexEntries.some((d) => d.data.indexOf(Buffer.from("com.ionicframework.capacitor.Checkout", "utf8")) !== -1);
  record("apk.dex.no-upstream-checkout-dotted", !upstreamDotted,
    upstreamDotted ? "legacy Checkout FQCN remains in APK" : "legacy Checkout FQCN absent from APK");
  const sdk = dexEntries.some((d) => d.data.indexOf(Buffer.from("com/razorpay/Checkout", "utf8")) !== -1);
  record("apk.dex.contains.RazorpaySdk", sdk, sdk ? "com.razorpay SDK packaged" : "Razorpay SDK missing from APK");
  const dexType = dexEntries.some((d) => d.data.indexOf(Buffer.from("Lcom/ionicframework/capacitor/Checkout;", "utf8")) !== -1);
  record("apk.dex.no-upstream-checkout-type", !dexType,
    dexType ? "legacy Checkout dex type descriptor present" : "no legacy Checkout dex type descriptor");
}

// The plugin registry packaged inside the APK is what Capacitor's Bridge reads
// at startup to build its plugin map. Print it and gate on its contents.
try {
  const [registryEntry] = readApkEntries(APK, (n) => n === "assets/capacitor.plugins.json");
  if (!registryEntry) throw new Error("assets/capacitor.plugins.json not found inside APK");
  const raw = registryEntry.data.toString("utf8");
  record("apk.registry.present", true, "assets/capacitor.plugins.json packaged");
  console.log("");
  console.log("---- PACKAGED CAPACITOR PLUGIN REGISTRY -------------------");
  try {
    for (const e of JSON.parse(raw)) console.log(`  ${String(e.pkg ?? "?").padEnd(48)} -> ${e.classpath ?? "?"}`);
  } catch {
    console.log(raw);
  }
  console.log("-----------------------------------------------------------");
  const legacy = ["com.ionicframework.capacitor.Checkout", "capacitor-razorpay"].filter((t) => raw.includes(t));
  record("apk.registry.no-legacy-checkout", legacy.length === 0,
    legacy.length ? `registry references ${legacy.join(", ")}` : "no legacy Checkout entry in packaged registry");
} catch (e) {
  record("apk.registry.present", false, e.message);
}

// Checkout.preload() creates a WebView and crashes off the UI thread. The SDK
// itself declares the method, so the only meaningful gate is that OUR code
// never calls it.
for (const file of [PAYMENT_PLUGIN_SRC, PAYMENT_PLUGIN_REPO_SRC, MAIN_ACTIVITY]) {
  try {
    const src = fs.readFileSync(file, "utf8").replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "");
    const calls = /\.preload\s*\(/.test(src);
    record(`payments.no-preload-call.${path.basename(file)}`, !calls,
      calls ? `${file} calls Checkout.preload()` : "no preload() call");
    if (file !== MAIN_ACTIVITY) {
      const uiThread = src.includes("runOnUiThread");
      record(`payments.open-on-ui-thread.${path.basename(path.dirname(file))}`, uiThread,
        uiThread ? "checkout.open runs inside runOnUiThread" : "checkout.open is not wrapped in runOnUiThread");
    }
  } catch (e) {
    record(`payments.no-preload-call.${path.basename(file)}`, false, e.message);
  }
}

// --- 7. Build evidence -------------------------------------------------------
const evidence = [];
try {
  const bytes = fs.readFileSync(APK);
  const stat = fs.statSync(APK);
  evidence.push(["APK path", path.resolve(APK)]);
  evidence.push(["APK SHA256", createHash("sha256").update(bytes).digest("hex")]);
  evidence.push(["APK size", `${bytes.length} bytes`]);
  evidence.push(["APK built at", stat.mtime.toISOString()]);
  evidence.push(["Verified at", new Date().toISOString()]);
  evidence.push(["DEX files", dexEntries.map((d) => d.name).join(", ") || "(none)"]);
  const ageMinutes = (Date.now() - stat.mtimeMs) / 60000;
  record("apk.freshness", ageMinutes < 120,
    `APK is ${ageMinutes.toFixed(1)} minute(s) old${ageMinutes >= 120 ? " — this looks like a stale artifact, run a clean build" : ""}`);
} catch (e) {
  evidence.push(["APK", `unreadable: ${e.message}`]);
}
try {
  const head = fs.readFileSync(".git/HEAD", "utf8").trim();
  const ref = head.startsWith("ref: ") ? head.slice(5) : null;
  const sha = ref ? fs.readFileSync(path.join(".git", ref), "utf8").trim() : head;
  evidence.push(["Git branch", ref ? ref.replace("refs/heads/", "") : "(detached)"]);
  evidence.push(["Git commit", sha]);
} catch {
  evidence.push(["Git commit", "(unavailable)"]);
}
try {
  const info = JSON.parse(fs.readFileSync("mobile-shell/build-info.json", "utf8"));
  evidence.push(["Web build id", info.buildId ?? info.build ?? JSON.stringify(info).slice(0, 120)]);
} catch {
  /* optional */
}

// --- Summary -----------------------------------------------------------------
const pass = results.every(r => r.ok);
console.log("");
console.log("============================================================");
console.log(" APK NATIVE VERIFICATION");
console.log("============================================================");
for (const r of results) {
  const tag = r.ok ? "  [PASS]" : "  [FAIL]";
  console.log(`${tag} ${r.name}${r.detail ? "  -  " + r.detail : ""}`);
}
console.log("------------------------------------------------------------");
console.log(" BUILD EVIDENCE");
for (const [k, v] of evidence) console.log(`  ${k.padEnd(14)} ${v}`);
console.log("------------------------------------------------------------");
console.log(pass ? " RESULT: PASS" : " RESULT: FAIL");
console.log("============================================================");
console.log("");

process.exit(pass ? 0 : 1);

