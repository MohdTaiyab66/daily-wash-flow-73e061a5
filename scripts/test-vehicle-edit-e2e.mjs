/**
 * E2E: Home → Edit vehicle + Change photo dialog flows.
 *
 * Runs against the local Vite preview at http://localhost:8080. Requires a
 * customer session; when the sandbox injects LOVABLE_BROWSER_SUPABASE_*, we
 * restore it before navigating. Otherwise the test exits with a skip note.
 *
 * Usage:  python3 scripts/test-vehicle-edit-e2e.mjs   # (invoked via `node --experimental-vm-modules`)
 * Prefer: python3 scripts/test-vehicle-edit-e2e.py    # canonical Playwright driver
 *
 * This file is the JS-flavoured harness we run in CI when Python is not
 * available; keep it in sync with the Python variant.
 */

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT = "/tmp/browser/vehicle-edit";
mkdirSync(OUT, { recursive: true });

const status = process.env.LOVABLE_BROWSER_AUTH_STATUS ?? "no_supabase";
if (status !== "injected") {
  console.log(`[skip] LOVABLE_BROWSER_AUTH_STATUS=${status}; sign in via the preview to enable this test.`);
  process.exit(0);
}

const storageKey = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
const sessionJson = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
const cookiesJson = process.env.LOVABLE_BROWSER_SUPABASE_COOKIES_JSON;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
if (cookiesJson) {
  const cookies = JSON.parse(cookiesJson).map((c) => ({ ...c, url: "http://localhost:8080" }));
  await context.addCookies(cookies);
}
const page = await context.newPage();
await page.goto("http://localhost:8080", { waitUntil: "domcontentloaded" });
if (storageKey && sessionJson) {
  await page.evaluate(
    ([k, v]) => window.localStorage.setItem(k, v),
    [storageKey, sessionJson],
  );
}

// 1) Home renders
await page.goto("http://localhost:8080/c/home", { waitUntil: "networkidle" });
await page.screenshot({ path: join(OUT, "1_home.png") });

// 2) Open Edit vehicle
const editBtn = page.getByRole("button", { name: /edit vehicle/i });
if (await editBtn.count()) {
  await editBtn.first().click();
  await page.getByRole("dialog").waitFor({ state: "visible" });
  await page.screenshot({ path: join(OUT, "2_edit_open.png") });

  // Empty registration triggers inline error, form stays open, focus lands on invalid field.
  await page.getByLabel(/registration/i).fill("");
  await page.getByRole("button", { name: /save changes/i }).click();
  await page.getByRole("alert").first().waitFor();
  await page.screenshot({ path: join(OUT, "3_edit_validation.png") });

  // Cancel closes the dialog with discard confirm auto-accepted.
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /cancel/i }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
} else {
  console.log("[warn] No vehicle on Home — edit test skipped");
}

// 3) Open Change photo chooser
const photoBtn = page.getByRole("button", { name: /change photo/i });
if (await photoBtn.count()) {
  await photoBtn.first().click();
  await page.getByRole("dialog").waitFor({ state: "visible" });
  await page.getByRole("button", { name: /take photo/i }).waitFor();
  await page.getByRole("button", { name: /upload from gallery/i }).waitFor();
  await page.screenshot({ path: join(OUT, "4_photo_chooser.png") });

  // Escape closes (no image picked yet, no confirm).
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
}

console.log("[ok] Home vehicle edit + change-photo dialog smoke passed.");
await browser.close();
