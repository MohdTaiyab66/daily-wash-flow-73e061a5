#!/usr/bin/env node
/**
 * Urban Wash launcher/splash branding restore + hard gate.
 *
 * WHY THIS EXISTS
 * ---------------
 * `scripts/ensure-variant-clean.mjs` deletes android/ whenever the build
 * switches variant, and `cap add android` then regenerates the Capacitor
 * template, which ships its OWN mipmap ic_launcher PNGs plus
 * mipmap-anydpi-v26/ic_launcher.xml pointing at @drawable/ic_launcher_foreground.
 * That silently overwrites the committed Urban Wash launcher assets, so the
 * packaged APK ends up with stale/default icons even after a clean reinstall.
 *
 * android-branding/res is the single source of truth. This script copies it
 * over android/app/src/main/res AFTER `cap sync`, removes template leftovers
 * that could win resource resolution, and then verifies byte-for-byte that
 * every branding file landed. Non-zero exit = build must stop.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const SRC = "android-branding/res";
const DEST = "android/app/src/main/res";

// Template files Capacitor/Android Studio regenerate that must NOT survive:
// the adaptive-icon XML we ship references @mipmap/ic_launcher_foreground, so a
// stale @drawable/ic_launcher_foreground vector or a .webp variant of the same
// resource name creates an ambiguous / wrong launcher icon.
const STALE = [
  "drawable-v24/ic_launcher_foreground.xml",
  "drawable/ic_launcher_foreground.xml",
  "mipmap-anydpi-v26/ic_launcher_foreground.xml",
];
const STALE_GLOBS = [/^mipmap-.*\/ic_launcher.*\.webp$/];

const sha = (p) => createHash("sha256").update(fs.readFileSync(p)).digest("hex");

function walk(dir, base = "") {
  const out = [];
  for (const entry of fs.readdirSync(path.join(dir, base), { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(dir, rel));
    else out.push(rel);
  }
  return out;
}

if (!fs.existsSync(SRC)) {
  console.error(`[branding] missing source of truth: ${SRC}`);
  process.exit(1);
}
if (!fs.existsSync(DEST)) {
  console.error(`[branding] missing ${DEST}; run cap add/sync android first`);
  process.exit(1);
}

const files = walk(SRC);
if (files.length === 0) {
  console.error(`[branding] ${SRC} is empty`);
  process.exit(1);
}

// 1. Purge stale template assets.
let removed = 0;
for (const rel of STALE) {
  const p = path.join(DEST, rel);
  if (fs.existsSync(p)) {
    fs.rmSync(p);
    removed++;
    console.log(`[branding] removed template asset ${rel}`);
  }
}
for (const dir of fs.readdirSync(DEST)) {
  const dirPath = path.join(DEST, dir);
  if (!fs.statSync(dirPath).isDirectory()) continue;
  for (const name of fs.readdirSync(dirPath)) {
    const rel = `${dir}/${name}`;
    if (STALE_GLOBS.some((re) => re.test(rel))) {
      fs.rmSync(path.join(DEST, rel));
      removed++;
      console.log(`[branding] removed template asset ${rel}`);
    }
  }
}

// 2. Copy branding over whatever cap sync produced.
let copied = 0;
for (const rel of files) {
  const from = path.join(SRC, rel);
  const to = path.join(DEST, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  copied++;
}

// 3. Hard gate: every branding file must now be byte-identical in android/.
const mismatches = [];
for (const rel of files) {
  const to = path.join(DEST, rel);
  if (!fs.existsSync(to) || sha(path.join(SRC, rel)) !== sha(to)) mismatches.push(rel);
}
if (mismatches.length) {
  console.error(`[branding] FAILED to install ${mismatches.length} asset(s):`);
  for (const m of mismatches) console.error(`  - ${m}`);
  process.exit(1);
}

// 4. Sanity: adaptive icon must reference the mipmap foreground we shipped.
const adaptive = path.join(DEST, "mipmap-anydpi-v26/ic_launcher.xml");
const xml = fs.readFileSync(adaptive, "utf8");
if (!xml.includes("@mipmap/ic_launcher_foreground")) {
  console.error(`[branding] ${adaptive} does not reference @mipmap/ic_launcher_foreground`);
  process.exit(1);
}
if (!fs.existsSync(path.join(DEST, "mipmap-xxxhdpi/ic_launcher_foreground.png"))) {
  console.error("[branding] mipmap-xxxhdpi/ic_launcher_foreground.png missing after restore");
  process.exit(1);
}

console.log(
  `[branding] OK - restored ${copied} launcher/splash asset(s) from ${SRC}` +
    (removed ? `, purged ${removed} template asset(s)` : ""),
);
