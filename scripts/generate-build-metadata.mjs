import { writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __root = join(dirname(fileURLToPath(import.meta.url)), "..");
const variant = (process.env.URBANWASH_APP || "partner").toLowerCase();

let gitSha = "unknown";
try {
  gitSha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
} catch (e) {
  console.warn("Could not determine git SHA, using unknown");
}

const buildInfo = {
  app: variant,
  version: process.env.PARTNER_APP_VERSION || "1.0.32",
  build: process.env.PARTNER_BUILD_ID || `manual-${new Date().toISOString().split('T')[0]}`,
  buildNumber: process.env.PARTNER_VERSION_CODE || "32",
  gitSha: gitSha,
  buildTime: new Date().toISOString(),
};

const paths = [
  join(__root, "public", "build-info.json"),
  join(__root, "mobile-shell", "build-info.json")
];

for (const p of paths) {
  writeFileSync(p, JSON.stringify(buildInfo, null, 2));
  console.log(`[generate-build-metadata] Wrote ${p}`);
}

// Also update src/lib/buildInfo.ts to keep React constants in sync
const buildInfoTsPath = join(__root, "src", "lib", "buildInfo.ts");
const tsContent = `export const PARTNER_APP_VERSION = "${buildInfo.version}";
export const PARTNER_BUILD_ID = "${buildInfo.build}";
export const PARTNER_BUILD_NUMBER = "${buildInfo.buildNumber}";
export const PARTNER_GIT_SHA = "${buildInfo.gitSha}";
export const PARTNER_BUILD_TIME = "${buildInfo.buildTime}";
`;
writeFileSync(buildInfoTsPath, tsContent);
console.log(`[generate-build-metadata] Updated ${buildInfoTsPath}`);
