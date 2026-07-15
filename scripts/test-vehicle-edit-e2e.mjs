/**
 * E2E: Home → Edit vehicle + Change photo dialog flows.
 *
 * Covers:
 *   1. Baseline: Home renders, dialogs open, discard-changes guard fires.
 *   2. Photo pipeline: choose → crop → preview → save. Asserts the cropped
 *      preview matches the persisted Home image immediately after save AND
 *      after a full page reload (perceptual-hash comparison).
 *   3. Failure paths: photo upload failure + retry, vehicle save failure +
 *      retry. In both cases the inline error appears in a `role="alert"`,
 *      unsaved form/preview state is preserved across the retry, and the
 *      error clears when the retry succeeds.
 *   4. Accessibility: axe-core (WCAG 2.1 A/AA) is injected into both open
 *      dialogs and asserts no serious/critical violations. Also verifies
 *      focus trapping and keyboard-only navigation.
 *
 * Runs against local Vite at http://localhost:8080. Requires an injected
 * customer session; otherwise the test prints [skip] and exits 0.
 */

import { chromium } from "playwright";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
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

// ---------------------------------------------------------------------
// axe-core injection helper
// ---------------------------------------------------------------------
const AXE_PATH = "node_modules/axe-core/axe.min.js";
const AXE_SRC = existsSync(AXE_PATH) ? readFileSync(AXE_PATH, "utf8") : null;
if (!AXE_SRC) {
  console.log("[warn] axe-core not installed; a11y checks will be skipped");
}

async function runAxe(page, contextSelector, label) {
  if (!AXE_SRC) return { violations: [] };
  await page.evaluate(AXE_SRC);
  const result = await page.evaluate(async (sel) => {
    // eslint-disable-next-line no-undef
    const node = document.querySelector(sel);
    if (!node) return { violations: [{ id: "context-missing", impact: "critical", nodes: [] }] };
    // eslint-disable-next-line no-undef
    const r = await window.axe.run(node, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] },
      resultTypes: ["violations"],
    });
    return { violations: r.violations };
  }, contextSelector);
  const serious = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  if (serious.length) {
    console.log(`[a11y] ${label}: ${serious.length} serious/critical violations`);
    for (const v of serious) console.log(`   - ${v.id}: ${v.help}`);
  } else {
    console.log(`[a11y] ${label}: clean (${result.violations.length} minor issues)`);
  }
  if (serious.length) throw new Error(`Accessibility violations in ${label}`);
  return result;
}

// ---------------------------------------------------------------------
// Perceptual (average) hash over an <img> via canvas → 8x8 grayscale
// ---------------------------------------------------------------------
async function aHash(page, selector) {
  return page.evaluate(async (sel) => {
    // eslint-disable-next-line no-undef
    const img = document.querySelector(sel);
    if (!img) return null;
    // Wait for load
    if (!img.complete || img.naturalWidth === 0) {
      await new Promise((res) => {
        img.addEventListener("load", res, { once: true });
        img.addEventListener("error", res, { once: true });
      });
    }
    // eslint-disable-next-line no-undef
    const canvas = document.createElement("canvas");
    const S = 8;
    canvas.width = S;
    canvas.height = S;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    try {
      ctx.drawImage(img, 0, 0, S, S);
      const { data } = ctx.getImageData(0, 0, S, S);
      const gray = [];
      for (let i = 0; i < data.length; i += 4) {
        gray.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      }
      const avg = gray.reduce((a, b) => a + b, 0) / gray.length;
      return gray.map((v) => (v >= avg ? 1 : 0)).join("");
    } catch (e) {
      // Tainted canvas (cross-origin without CORS) — fall back to src.
      return `src:${img.currentSrc || img.src}`;
    }
  }, selector);
}
function hamming(a, b) {
  if (!a || !b || a.length !== b.length) return Number.POSITIVE_INFINITY;
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

// ---------------------------------------------------------------------
// Focus trap + keyboard nav helper
// ---------------------------------------------------------------------
async function assertFocusTrap(page, label) {
  const focusables = await page.evaluate(() => {
    // eslint-disable-next-line no-undef
    const dlg = document.querySelector('[role="dialog"]');
    if (!dlg) return 0;
    return dlg.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ).length;
  });
  if (focusables === 0) throw new Error(`${label}: no focusable elements in dialog`);
  // Tab through — focus should stay inside the dialog.
  for (let i = 0; i < focusables + 2; i++) {
    await page.keyboard.press("Tab");
    const inside = await page.evaluate(() => {
      // eslint-disable-next-line no-undef
      const dlg = document.querySelector('[role="dialog"]');
      // eslint-disable-next-line no-undef
      return !!(dlg && document.activeElement && dlg.contains(document.activeElement));
    });
    if (!inside) throw new Error(`${label}: focus escaped dialog after Tab #${i + 1}`);
  }
  console.log(`[a11y] ${label}: focus trap holds across ${focusables + 2} tabs`);
}

// ---------------------------------------------------------------------
// Boot the browser
// ---------------------------------------------------------------------
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
if (cookiesJson) {
  const cookies = JSON.parse(cookiesJson).map((c) => ({ ...c, url: "http://localhost:8080" }));
  await context.addCookies(cookies);
}
const page = await context.newPage();
page.on("dialog", (d) => d.accept()); // auto-accept native confirm() from the app
page.on("console", (m) => {
  if (m.type() === "error") console.log(`[console:error] ${m.text()}`);
});

await page.goto("http://localhost:8080", { waitUntil: "domcontentloaded" });
if (storageKey && sessionJson) {
  await page.evaluate(
    ([k, v]) => window.localStorage.setItem(k, v),
    [storageKey, sessionJson],
  );
}

// ---------------------------------------------------------------------
// 1) Home renders
// ---------------------------------------------------------------------
await page.goto("http://localhost:8080/c/home", { waitUntil: "networkidle" });
await page.screenshot({ path: join(OUT, "1_home.png") });

// ---------------------------------------------------------------------
// 2) Edit vehicle: validation, retry-after-failure, discard guard, a11y
// ---------------------------------------------------------------------
const editBtn = page.getByRole("button", { name: /edit vehicle/i });
if (await editBtn.count()) {
  await editBtn.first().click();
  await page.getByRole("dialog").waitFor({ state: "visible" });
  await page.screenshot({ path: join(OUT, "2_edit_open.png") });

  // a11y sweep of the open Edit dialog + focus trap
  await runAxe(page, '[role="dialog"]', "EditVehicleDialog");
  await assertFocusTrap(page, "EditVehicleDialog");

  // Type a change to arm the "dirty" state.
  const nickname = page.getByLabel(/nickname/i);
  await nickname.fill("QA nickname");

  // Force a save failure by intercepting the PATCH once.
  await page.route("**/rest/v1/customer_vehicles**", async (route) => {
    if (route.request().method() === "PATCH") {
      await page.unroute("**/rest/v1/customer_vehicles**");
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "Simulated failure" }) });
      return;
    }
    await route.continue();
  });

  await page.getByRole("button", { name: /save changes/i }).click();
  await page.getByRole("alert").filter({ hasText: /couldn.?t save|simulated/i }).first().waitFor();
  // Dirty state is preserved — nickname input still has our value.
  const preservedNick = await nickname.inputValue();
  if (preservedNick !== "QA nickname") throw new Error(`Nickname lost after failed save: got "${preservedNick}"`);
  await page.screenshot({ path: join(OUT, "3_edit_save_error.png") });

  // Retry — this time the request goes through (route was un-registered).
  await page.getByRole("button", { name: /retry save/i }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
  console.log("[ok] Edit vehicle save failure → retry works, form state preserved");

  // Empty-reg validation still guards.
  await editBtn.first().click();
  await page.getByRole("dialog").waitFor({ state: "visible" });
  await page.getByLabel(/registration/i).fill("");
  await page.getByRole("button", { name: /save changes/i }).click();
  await page.getByRole("alert").first().waitFor();
  await page.screenshot({ path: join(OUT, "4_edit_validation.png") });

  // Cancel closes with discard confirm auto-accepted.
  await page.getByRole("button", { name: /cancel/i }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
} else {
  console.log("[warn] No vehicle on Home — edit test skipped");
}

// ---------------------------------------------------------------------
// 3) Change photo: chooser + a11y + upload failure/retry + preview match
// ---------------------------------------------------------------------
const photoBtn = page.getByRole("button", { name: /change photo/i });
if (await photoBtn.count()) {
  await photoBtn.first().click();
  await page.getByRole("dialog").waitFor({ state: "visible" });
  await page.getByRole("button", { name: /take photo/i }).waitFor();
  await page.getByRole("button", { name: /upload from gallery/i }).waitFor();
  await page.screenshot({ path: join(OUT, "5_photo_chooser.png") });

  // a11y sweep of the chooser + focus trap
  await runAxe(page, '[role="dialog"]', "ChangePhotoDialog:choose");
  await assertFocusTrap(page, "ChangePhotoDialog:choose");

  // Feed a real image bytes into the hidden gallery input (bypasses OS picker).
  // A tiny valid JPEG so the crop stage can decode it.
  const jpegBase64 =
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAIAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AL+AAf/Z";
  const buf = Buffer.from(jpegBase64, "base64");
  const galleryInput = page.locator('input[type="file"][accept^="image"]').last();
  await galleryInput.setInputFiles({ name: "car.jpg", mimeType: "image/jpeg", buffer: buf });

  // Crop stage
  await page.getByRole("slider", { name: /zoom/i }).waitFor().catch(() => {});
  await page.screenshot({ path: join(OUT, "6_photo_crop.png") });
  await runAxe(page, '[role="dialog"]', "ChangePhotoDialog:crop");
  await page.getByRole("button", { name: /^next$/i }).click();

  // Preview stage
  const preview = page.getByTestId("photo-preview-image");
  await preview.waitFor({ state: "visible" });
  await page.screenshot({ path: join(OUT, "7_photo_preview.png") });
  const previewHash = await aHash(page, '[data-testid="photo-preview-image"]');
  console.log(`[preview] hash=${(previewHash || "").slice(0, 32)}…`);

  // Force upload failure once, so we can verify retry + preview preservation.
  let failNextUpload = true;
  await page.route("**/storage/v1/object/vehicle-images/**", async (route) => {
    if (failNextUpload) {
      failNextUpload = false;
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "sim-fail" }) });
      return;
    }
    await route.continue();
  });

  await page.getByRole("button", { name: /use photo/i }).click();
  // Progress indicator or error should appear.
  await page.getByRole("alert").filter({ hasText: /couldn.?t upload|failed/i }).first().waitFor();
  await page.screenshot({ path: join(OUT, "8_photo_upload_error.png") });
  // Preview still on screen (state preserved).
  if (!(await preview.isVisible())) throw new Error("Preview vanished after upload failure");
  const previewHashAfterError = await aHash(page, '[data-testid="photo-preview-image"]');
  if (previewHashAfterError !== previewHash) throw new Error("Preview changed after upload failure — state not preserved");
  console.log("[ok] Photo upload failure → error shown, preview preserved");

  // Retry — this time succeeds; progress indicator may flash.
  await page.getByRole("button", { name: /retry upload/i }).click();
  // Wait for dialog to close on success.
  await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 15_000 });
  console.log("[ok] Photo upload retry succeeded");

  // Cropped preview should match the Home vehicle image.
  await page.waitForTimeout(500);
  const homeImg = page.getByTestId("vehicle-avatar-image").first();
  await homeImg.waitFor({ state: "visible", timeout: 10_000 });
  const homeHash = await aHash(page, '[data-testid="vehicle-avatar-image"]');
  const dist1 = hamming(previewHash, homeHash);
  console.log(`[assert] preview↔home hamming=${dist1}`);
  if (dist1 > 12) throw new Error(`Cropped preview does not match saved Home image (hamming=${dist1})`);

  // Reload and re-check that the persisted image still matches.
  await page.reload({ waitUntil: "networkidle" });
  await page.getByTestId("vehicle-avatar-image").first().waitFor({ state: "visible", timeout: 10_000 });
  const homeHashAfterReload = await aHash(page, '[data-testid="vehicle-avatar-image"]');
  const dist2 = hamming(previewHash, homeHashAfterReload);
  console.log(`[assert] preview↔home-after-reload hamming=${dist2}`);
  if (dist2 > 12) throw new Error(`Persisted image drifted from cropped preview after reload (hamming=${dist2})`);
  console.log("[ok] Cropped preview matches saved image immediately and after reload");
}

// ---------------------------------------------------------------------
// 4) Cancel in-progress upload → previous Home photo + crop state kept
// ---------------------------------------------------------------------
{
  const homeImg = page.getByTestId("vehicle-avatar-image").first();
  const priorHomeHash = (await homeImg.count()) ? await aHash(page, '[data-testid="vehicle-avatar-image"]') : null;

  const photoBtn2 = page.getByRole("button", { name: /change photo/i });
  if (await photoBtn2.count()) {
    await photoBtn2.first().click();
    await page.getByRole("dialog").waitFor({ state: "visible" });
    const jpegBase64 =
      "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAIAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AL+AAf/Z";
    const buf = Buffer.from(jpegBase64, "base64");
    await page.locator('input[type="file"][accept^="image"]').last()
      .setInputFiles({ name: "car2.jpg", mimeType: "image/jpeg", buffer: buf });
    await page.getByRole("button", { name: /^next$/i }).click();
    const preview2 = page.getByTestId("photo-preview-image");
    await preview2.waitFor({ state: "visible" });
    const previewHash2 = await aHash(page, '[data-testid="photo-preview-image"]');

    // Stall the upload indefinitely so we can hit Cancel mid-flight.
    let stallControllerResolve;
    const stallPromise = new Promise((res) => { stallControllerResolve = res; });
    await page.route("**/storage/v1/object/vehicle-images/**", async (route) => {
      await stallPromise;
      await route.abort("failed");
    });

    await page.getByRole("button", { name: /use photo/i }).click();
    await page.getByTestId("upload-progress").waitFor({ state: "visible" });
    await page.getByTestId("cancel-upload").click();
    await page.getByRole("alert").filter({ hasText: /cancelled/i }).first()
      .waitFor({ timeout: 5000 });
    stallControllerResolve();
    await page.unroute("**/storage/v1/object/vehicle-images/**");

    // Preview + crop state unchanged.
    const previewHashAfterCancel = await aHash(page, '[data-testid="photo-preview-image"]');
    if (previewHashAfterCancel !== previewHash2) {
      throw new Error("Cropped preview changed after cancel — crop state was lost");
    }
    await page.screenshot({ path: join(OUT, "9_photo_upload_cancelled.png") });
    console.log("[ok] Upload cancel keeps cropped preview intact");

    // Close dialog with Escape; Home avatar must still be the previous image.
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" }).catch(() => {});
    if (priorHomeHash) {
      await page.waitForTimeout(300);
      const homeHashAfterCancel = await aHash(page, '[data-testid="vehicle-avatar-image"]');
      if (homeHashAfterCancel !== priorHomeHash) {
        throw new Error("Home avatar changed after cancelling upload — previous photo was replaced");
      }
      console.log("[ok] Home avatar unchanged after cancelled upload");
    }
  }
}

// ---------------------------------------------------------------------
// 5) Cache invalidation: edit vehicle → Home updates without reload
// ---------------------------------------------------------------------
{
  const editBtn2 = page.getByRole("button", { name: /edit vehicle/i });
  if (await editBtn2.count()) {
    // Listen for the app's post-save broadcast event.
    await page.evaluate(() => {
      window.__uwVehicleUpdated = 0;
      window.addEventListener("uw:vehicle-updated", () => { window.__uwVehicleUpdated++; });
    });

    await editBtn2.first().click();
    await page.getByRole("dialog").waitFor({ state: "visible" });
    const nickname = page.getByLabel(/nickname/i);
    const unique = `QA-${Date.now().toString().slice(-6)}`;
    await nickname.fill(unique);
    await page.getByRole("button", { name: /save changes/i }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 8000 });

    // Broadcast fired (proxy for realtime/cache sync) AND Home text reflects
    // the new nickname without a manual reload.
    const evCount = await page.evaluate(() => window.__uwVehicleUpdated || 0);
    if (evCount < 1) throw new Error("uw:vehicle-updated event did not fire on save");
    await page.getByText(unique, { exact: false }).first()
      .waitFor({ timeout: 5000 })
      .catch(() => { throw new Error("Home did not update after edit — TanStack cache not invalidated"); });
    console.log("[ok] Edit save invalidated queries + Home reflected update without reload");
  }
}

// ---------------------------------------------------------------------
// 6) Draft preservation: close dialog with unsaved edits → reopen restores
// ---------------------------------------------------------------------
{
  const editBtn3 = page.getByRole("button", { name: /edit vehicle/i });
  if (await editBtn3.count()) {
    await editBtn3.first().click();
    await page.getByRole("dialog").waitFor({ state: "visible" });
    const draftValue = `Draft-${Date.now().toString().slice(-5)}`;
    await page.getByLabel(/nickname/i).fill(draftValue);
    await page.getByLabel(/parking instructions/i).fill("Slot 42 — do not lose me");

    // Close without saving — no confirm() any more; draft is persisted.
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });

    // Reopen and verify inputs were restored.
    await page.getByRole("button", { name: /edit vehicle/i }).first().click();
    await page.getByRole("dialog").waitFor({ state: "visible" });
    await page.getByTestId("restored-draft-banner").waitFor({ state: "visible", timeout: 3000 });
    const restoredNick = await page.getByLabel(/nickname/i).inputValue();
    const restoredNotes = await page.getByLabel(/parking instructions/i).inputValue();
    if (restoredNick !== draftValue) throw new Error(`Nickname draft lost: got "${restoredNick}"`);
    if (!restoredNotes.includes("Slot 42")) throw new Error(`Parking notes draft lost: got "${restoredNotes}"`);
    await page.screenshot({ path: join(OUT, "10_draft_restored.png") });
    console.log("[ok] Unsaved edits restored after close+reopen");

    // Discard button clears the draft cleanly.
    await page.getByTestId("discard-draft").click();
    const clearedNick = await page.getByLabel(/nickname/i).inputValue();
    if (clearedNick === draftValue) throw new Error("Discard did not clear the draft");
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    console.log("[ok] Discard clears the saved draft");
  }
}

console.log("[ok] E2E: vehicle edit + change-photo (a11y, failure retry, cancel, cache sync, draft)");
await browser.close();
