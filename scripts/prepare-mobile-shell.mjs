// Copies mobile-shell/ into .output/public/ so Capacitor has a static webDir
// with an index.html. TanStack Start SSR does not emit a static index.html,
// so the native shell loads the hosted app instead.
import { mkdirSync, readFileSync, writeFileSync, cpSync, existsSync } from "node:fs";
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

// Copy every static asset from mobile-shell/ into .output/public/
cpSync(shellDir, outDir, { recursive: true });

// Inject variant into index.html
const variant = (process.env.URBANWASH_APP || "partner").toLowerCase();
const indexPath = join(outDir, "index.html");
let html = readFileSync(indexPath, "utf8");
html = html.replace(/__URBANWASH_VARIANT__/g, variant);
writeFileSync(indexPath, html);

// Ensure build-info.json is present (already written by web build, but be safe)
const buildInfoPath = join(outDir, "build-info.json");
if (!existsSync(buildInfoPath)) {
  writeFileSync(
    buildInfoPath,
    JSON.stringify({ app: variant, version: "dev", build: "dev" }, null, 2),
  );
}

console.log(`[prepare-mobile-shell] Wrote mobile shell for variant=${variant} to ${outDir}`);
