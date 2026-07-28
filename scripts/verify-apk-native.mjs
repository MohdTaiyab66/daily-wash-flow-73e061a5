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
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

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

// --- 3. DEX bytes check ------------------------------------------------------
// Minimal ZIP reader: walks central directory, extracts entries matching classes*.dex.
function readApkDexEntries(apkPath) {
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
    if (/^classes\d*\.dex$/.test(name)) {
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
  dexEntries = readApkDexEntries(APK);
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
console.log(pass ? " RESULT: PASS" : " RESULT: FAIL");
console.log("============================================================");
console.log("");

process.exit(pass ? 0 : 1);
