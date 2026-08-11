
import { existsSync, writeFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";

const variant = (process.env.URBANWASH_APP ?? "partner").toLowerCase();
if (!["customer", "partner"].includes(variant)) {
  console.error(`[android-build] unknown URBANWASH_APP="${variant}"; expected "partner" or "customer"`);
  process.exit(1);
}

const isCustomer = variant === "customer";
const appId = isCustomer ? "com.urbanwash.customer" : "com.urbanwash.partner";
const versionName = process.env.PARTNER_APP_VERSION ?? "1.0.32";
const versionCode = Number(process.env.PARTNER_VERSION_CODE ?? "32");
const buildId = process.env.PARTNER_BUILD_ID ?? "2026-07-18-trace-01";
const gradleFile = "android/app/build.gradle";
const googleServicesFile = "android/app/google-services.json";
const syncedBuildInfoCandidates = [
  "android/app/src/main/assets/build-info.json",
  "android/app/src/main/assets/public/build-info.json",
];

if (!existsSync(gradleFile)) {
  console.error(`[android-build] missing ${gradleFile}; run node_modules/.bin/cap add/sync android first`);
  process.exit(1);
}

let gradle = await readFile(gradleFile, "utf8");

if (/versionCode\s+\d+/.test(gradle)) {
  gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
} else {
  gradle = gradle.replace(/defaultConfig\s*\{/, `defaultConfig {\n        versionCode ${versionCode}`);
}

if (/versionName\s+["'][^"']+["']/.test(gradle)) {
  gradle = gradle.replace(/versionName\s+["'][^"']+["']/, `versionName "${versionName}"`);
} else {
  gradle = gradle.replace(/defaultConfig\s*\{/, `defaultConfig {\n        versionName "${versionName}"`);
}

// Ensure applicationId / namespace match the current variant. Capacitor bakes
// the first-run appId into android/app/build.gradle and never rewrites it on
// subsequent `cap sync` calls, which causes google-services.json to mismatch
// when the same android/ folder is reused across variants. Support both Groovy
// (`applicationId "..."`) and Kotlin-style (`applicationId = "..."`) syntax.
const setGradleString = (source, key, value, insertionRegex) => {
  const statement = new RegExp(`(^\\s*${key}\\s*)(=\\s*)?["'][^"']+["']`, "gm");
  if (statement.test(source)) {
    return source.replace(statement, (_match, prefix, equals = "") => `${prefix}${equals}"${value}"`);
  }

  return source.replace(insertionRegex, (match) => `${match}\n        ${key} "${value}"`);
};

gradle = setGradleString(gradle, "applicationId", appId, /defaultConfig\s*\{/);
gradle = setGradleString(gradle, "namespace", appId, /android\s*\{/);

const hasExpectedApplicationId = new RegExp(`applicationId\\s*(?:=\\s*)?["']${appId.replaceAll(".", "\\.")}["']`).test(gradle);
const hasExpectedNamespace = new RegExp(`namespace\\s*(?:=\\s*)?["']${appId.replaceAll(".", "\\.")}["']`).test(gradle);
if (!hasExpectedApplicationId || !hasExpectedNamespace) {
  console.error(`[android-build] failed to stamp ${gradleFile} for ${variant}; expected applicationId and namespace ${appId}`);
  process.exit(1);
}

await writeFile(gradleFile, gradle);
console.log(`[android-build] Android Gradle config stamped for ${variant}: ${appId}, version ${versionName} (${versionCode})`);

// Both Customer and Partner APKs MUST ship the same Firebase project
// (uw-partner-app), because the backend dispatcher authenticates with that
// project's service account. A config from any other project produces
// SENDER_ID_MISMATCH and tokens the backend can never send to.
const FIREBASE_PROJECT_ID = "uw-partner-app";
const canonicalGoogleServices = "android-native/firebase/google-services.json";

if (existsSync(canonicalGoogleServices)) {
  const canonical = await readFile(canonicalGoogleServices, "utf8");
  const current = existsSync(googleServicesFile) ? await readFile(googleServicesFile, "utf8") : null;
  if (current !== canonical) {
    await writeFile(googleServicesFile, canonical);
    console.log(`[android-build] Restored ${googleServicesFile} from ${canonicalGoogleServices}`);
  }
}

if (existsSync(googleServicesFile)) {
  const googleServices = JSON.parse(await readFile(googleServicesFile, "utf8"));
  const projectId = googleServices?.project_info?.project_id;
  const packageNames = (googleServices.client ?? [])
    .map((client) => client?.client_info?.android_client_info?.package_name)
    .filter(Boolean);

  if (projectId !== FIREBASE_PROJECT_ID) {
    console.error(`[android-build] ${googleServicesFile} targets Firebase project "${projectId}"; expected "${FIREBASE_PROJECT_ID}"`);
    process.exit(1);
  }

  if (!packageNames.includes(appId)) {
    console.error(`[android-build] ${googleServicesFile} does not contain ${appId}; found: ${packageNames.join(", ") || "none"}`);
    process.exit(1);
  }

  console.log(`[android-build] Firebase config verified for ${appId} on ${projectId}`);
} else {
  console.error(`[android-build] missing ${googleServicesFile}`);
  process.exit(1);
}


const syncedBuildInfo = syncedBuildInfoCandidates.find((path) => existsSync(path));
if (!syncedBuildInfo) {
  console.error(`[android-build] missing synced asset ${syncedBuildInfoCandidates.join(" or ")}`);
  process.exit(1);
}

const info = JSON.parse(await readFile(syncedBuildInfo, "utf8"));

// CRITICAL GUARD: Verify that the synced app variant matches the current build variant.
if (info.app !== variant) {
  console.error(`[android-build] VARIANT MISMATCH: android/.urbanwash-variant is "${variant}" but synced ${syncedBuildInfo} says "app": "${info.app}"`);
  console.error(`[android-build] This means Capacitor synced the wrong web assets. Cleaning and retrying...`);
  process.exit(1);
}

if (info.version !== versionName || info.build !== buildId || String(info.buildNumber ?? "") !== String(versionCode)) {
  console.error(`[android-build] synced asset mismatch: expected ${versionName} / ${buildId} (${versionCode}), got ${info.version} / ${info.build} (${info.buildNumber ?? "missing buildNumber"})`);
  process.exit(1);
}

console.log(`[android-build] Synced asset verified: ${syncedBuildInfo} -> ${info.app} ${info.version} / ${info.build} (${info.buildNumber})`);

// Record which variant this android/ folder was last built for, so a later
// switch (customer <-> partner) triggers a clean wipe via ensure-variant-clean.mjs.
writeFileSync("android/.urbanwash-variant", variant);
console.log(`[android-build] Variant marker written: android/.urbanwash-variant -> ${variant}`);
