// Prepares the static Capacitor shell. TanStack Start SSR does not emit a
// static index.html, so Capacitor uses mobile-shell/ and loads the hosted app.
import { mkdirSync, readFileSync, writeFileSync, cpSync, existsSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(root, "..");
const shellDir = join(projectRoot, "mobile-shell");
const outDir = join(projectRoot, ".output", "public");

if (!existsSync(shellDir)) {
  console.error(`[prepare-mobile-shell] Missing ${shellDir}`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

// Keep the native webDir self-contained for `cap add android`, which performs
// an immediate copy before a later `cap sync`.
const sourceBuildInfoPath = join(projectRoot, "public", "build-info.json");
const shellBuildInfoPath = join(shellDir, "build-info.json");
if (existsSync(sourceBuildInfoPath)) {
  copyFileSync(sourceBuildInfoPath, shellBuildInfoPath);
} else if (!existsSync(shellBuildInfoPath)) {
  const variant = (process.env.URBANWASH_APP || "partner").toLowerCase();
  writeFileSync(shellBuildInfoPath, JSON.stringify({ app: variant, version: "dev", build: "dev" }, null, 2));
}

// Also copy every static asset into .output/public/ for diagnostics and older scripts.
cpSync(shellDir, outDir, { recursive: true });

// Inject variant into both the diagnostic copy and Capacitor's actual webDir.
const variant = (process.env.URBANWASH_APP || "partner").toLowerCase();
for (const indexPath of [join(outDir, "index.html"), join(shellDir, "index.html")]) {
  let html = readFileSync(indexPath, "utf8");
  html = html.replace(/__URBANWASH_VARIANT__/g, variant);
  html = html.replace(/var variant = "(?:partner|customer)";/, `var variant = "${variant}";`);
  writeFileSync(indexPath, html);
}

// Ensure build-info.json is present (already written by web build, but be safe)
const buildInfoPath = join(outDir, "build-info.json");
if (!existsSync(buildInfoPath)) {
  writeFileSync(
    buildInfoPath,
    JSON.stringify({ app: variant, version: "dev", build: "dev" }, null, 2),
  );
}

console.log(`[prepare-mobile-shell] Wrote mobile shell for variant=${variant} to ${outDir}`);
