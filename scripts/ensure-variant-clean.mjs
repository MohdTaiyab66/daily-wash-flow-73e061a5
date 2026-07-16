// Wipes android/ when the previous build was for a different variant.
// This prevents leftover Partner icons/strings/branding from bleeding into
// a Customer APK (and vice versa).
import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const variant = (process.env.URBANWASH_APP ?? "partner").toLowerCase();
if (!["customer", "partner"].includes(variant)) {
  console.error(`[variant-clean] unknown URBANWASH_APP="${variant}"`);
  process.exit(1);
}

const androidDir = "android";
const marker = join(androidDir, ".urbanwash-variant");

if (existsSync(androidDir)) {
  const prev = existsSync(marker) ? readFileSync(marker, "utf8").trim() : "";
  if (prev !== variant) {
    console.log(`[variant-clean] previous android/ was for "${prev || "unknown"}", wiping for "${variant}"...`);
    rmSync(androidDir, { recursive: true, force: true });
  } else {
    console.log(`[variant-clean] android/ already matches variant "${variant}"`);
  }
}

// Write marker after (re)creation happens later; we also stamp again post-sync.
if (!existsSync(androidDir)) {
  mkdirSync(androidDir, { recursive: true });
}
writeFileSync(marker, variant);
console.log(`[variant-clean] marker set: ${marker} -> ${variant}`);
