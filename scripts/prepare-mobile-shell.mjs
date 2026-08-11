// Prepares the static Capacitor shell. TanStack Start SSR does not emit a
// static index.html, so Capacitor uses mobile-shell/ and loads the hosted app.
import { mkdirSync, writeFileSync, cpSync, existsSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(root, "..");
const shellDir = join(projectRoot, "mobile-shell");
const outDir = join(projectRoot, ".output", "public");

mkdirSync(shellDir, { recursive: true });

mkdirSync(outDir, { recursive: true });

// Capacitor copies this build-info.json into the native bundle. We MUST
// regenerate it every time to match the current variant (URBANWASH_APP),
// or a Customer build might ship with a Partner build-info.json.
const variant = (process.env.URBANWASH_APP || "partner").toLowerCase();
const shellBuildInfoPath = join(shellDir, "build-info.json");
const buildInfo = {
  app: variant,
  version: process.env.PARTNER_APP_VERSION || "1.0.32",
  build: process.env.PARTNER_BUILD_ID || `manual-${new Date().toISOString().split("T")[0]}`,
  buildNumber: process.env.PARTNER_VERSION_CODE || "32",
  buildTime: new Date().toISOString(),
};

writeFileSync(shellBuildInfoPath, JSON.stringify(buildInfo, null, 2));
console.log(`[prepare-mobile-shell] Wrote build-info.json for variant=${variant}`);

const variant = (process.env.URBANWASH_APP || "partner").toLowerCase();
const targetUrl = variant === "customer" ? "https://daily-wash-flow.lovable.app/c" : "https://daily-wash-flow.lovable.app/auth";

const renderShell = () => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>Urban Wash</title>
    <style>
      html, body { margin: 0; padding: 0; height: 100%; background: #0F172A; color: #fff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
      .wrap { display:flex; align-items:center; justify-content:center; min-height:100%; flex-direction:column; gap:16px; padding:24px; box-sizing:border-box; text-align:center; }
      .spinner { width:36px; height:36px; border:3px solid rgba(255,255,255,.2); border-top-color:#fff; border-radius:50%; animation:s 1s linear infinite; }
      .hint { max-width: 320px; color: rgba(255,255,255,.72); font-size: 14px; line-height: 1.45; }
      .action { display:none; margin-top: 4px; border:0; border-radius:10px; background:#fff; color:#0F172A; padding:11px 14px; font-weight:700; text-decoration:none; }
      .failed .spinner { display:none; }
      .failed .action { display:inline-block; }
      @keyframes s { to { transform: rotate(360deg); } }
    </style>
    <script>
      (function () {
        var url = ${JSON.stringify(targetUrl)};
        window.URBANWASH_TARGET_URL = url;
        setTimeout(function () {
          var root = document.querySelector(".wrap");
          var link = document.querySelector(".action");
          if (root) root.className += " failed";
          if (link) link.href = url;
        }, 6000);
        window.location.replace(url);
      })();
    </script>
  </head>
  <body>
    <div class="wrap">
      <div class="spinner"></div>
      <div>Loading Urban Wash…</div>
      <div class="hint">If this screen stays here, check internet access and tap retry.</div>
      <a class="action" href="${targetUrl}">Retry loading app</a>
    </div>
  </body>
</html>
`;

writeFileSync(join(shellDir, "index.html"), renderShell());

// Also copy every static asset into .output/public/ for diagnostics and older scripts.
cpSync(shellDir, outDir, { recursive: true });

// Ensure build-info.json is present (already written by web build, but be safe)
const buildInfoPath = join(outDir, "build-info.json");
if (!existsSync(buildInfoPath)) {
  writeFileSync(
    buildInfoPath,
    JSON.stringify({ app: variant, version: "dev", build: "dev" }, null, 2),
  );
}

console.log(`[prepare-mobile-shell] Wrote mobile shell for variant=${variant} to ${outDir}`);
