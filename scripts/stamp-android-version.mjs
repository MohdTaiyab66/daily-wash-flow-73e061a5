import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";

const variant = (process.env.URBANWASH_APP ?? "partner").toLowerCase();
const isCustomer = variant === "customer";
const appId = isCustomer ? "com.urbanwash.customer" : "com.urbanwash.partner";
const versionName = process.env.PARTNER_APP_VERSION ?? "1.0.28";
const versionCode = Number(process.env.PARTNER_VERSION_CODE ?? "28");
const buildId = process.env.PARTNER_BUILD_ID ?? "2026-07-04-02";
const gradleFile = "android/app/build.gradle";
const syncedBuildInfoCandidates = [
  "android/app/src/main/assets/build-info.json",
  "android/app/src/main/assets/public/build-info.json",
];

if (!existsSync(gradleFile)) {
  console.error(`[partner-build] missing ${gradleFile}; run node_modules/.bin/cap add/sync android first`);
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

await writeFile(gradleFile, gradle);
console.log(`[partner-build] Android version stamped: ${versionName} (${versionCode})`);

const syncedBuildInfo = syncedBuildInfoCandidates.find((path) => existsSync(path));
if (!syncedBuildInfo) {
  console.error(`[partner-build] missing synced asset ${syncedBuildInfoCandidates.join(" or ")}`);
  process.exit(1);
}

const info = JSON.parse(await readFile(syncedBuildInfo, "utf8"));
if (info.version !== versionName || info.build !== buildId) {
  console.error(`[partner-build] synced asset mismatch: expected ${versionName} / ${buildId}, got ${info.version} / ${info.build}`);
  process.exit(1);
}

console.log(`[partner-build] Synced asset verified: ${syncedBuildInfo} -> ${info.version} / ${info.build}`);
