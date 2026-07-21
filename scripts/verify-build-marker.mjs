import { existsSync, readFileSync } from "node:fs";

const [filePath, label = filePath] = process.argv.slice(2);

const fail = (message) => {
  console.error(`[build-marker] ${message}`);
  process.exit(1);
};

if (!filePath) {
  fail("missing build marker path");
}

if (!existsSync(filePath)) {
  fail(`missing ${label}: ${filePath}`);
}

let marker;
try {
  marker = JSON.parse(readFileSync(filePath, "utf8"));
} catch (error) {
  fail(`invalid JSON in ${label}: ${error instanceof Error ? error.message : String(error)}`);
}

const expectedVersion = process.env.PARTNER_APP_VERSION ?? process.env.VERSION_NAME;
const expectedBuild = process.env.PARTNER_BUILD_ID ?? process.env.BUILD_ID;
const expectedBuildNumber = process.env.PARTNER_VERSION_CODE ?? process.env.VERSION_CODE;

const mismatches = [];
if (expectedVersion && String(marker.version ?? "") !== String(expectedVersion)) {
  mismatches.push(`version expected ${expectedVersion}, got ${marker.version ?? "missing"}`);
}
if (expectedBuild && String(marker.build ?? "") !== String(expectedBuild)) {
  mismatches.push(`build expected ${expectedBuild}, got ${marker.build ?? "missing"}`);
}
if (expectedBuildNumber && String(marker.buildNumber ?? "") !== String(expectedBuildNumber)) {
  mismatches.push(`buildNumber expected ${expectedBuildNumber}, got ${marker.buildNumber ?? "missing"}`);
}

if (mismatches.length) {
  fail(`${label} is stale or from the wrong export: ${mismatches.join("; ")}`);
}

console.log(`[build-marker] OK ${label}: ${marker.version} / ${marker.build} (${marker.buildNumber ?? "no buildNumber"})`);