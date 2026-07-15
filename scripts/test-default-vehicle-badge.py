#!/usr/bin/env python3
"""UI test: the Default badge appears on exactly one vehicle, and using the
"Set as default" button on the edit screen moves the badge instantly.

Run:
  BASE_URL=http://localhost:8080 python3 scripts/test-default-vehicle-badge.py
"""
import asyncio
import json
import os
import sys
from pathlib import Path
from playwright.async_api import async_playwright

BASE_URL = os.environ.get("BASE_URL", "http://localhost:8080")
OUT = Path("/tmp/browser/default-vehicle")
OUT.mkdir(parents=True, exist_ok=True)

failures: list[str] = []

def ok(m): print(f"✓ {m}")
def fail(m): failures.append(m); print(f"✗ {m}")

async def read_state(page):
    return await page.eval_on_selector_all(
        '[data-testid="vehicle-row"]',
        """els => els.map(el => ({
            id: el.getAttribute('data-vehicle-id'),
            isDefault: el.getAttribute('data-is-default') === 'true',
            hasBadge: !!el.querySelector('[data-testid=\"default-badge\"]'),
        }))""",
    )

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})

        cookies_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")
        if cookies_json:
            cookies = json.loads(cookies_json)
            for c in cookies:
                c["url"] = BASE_URL
            await context.add_cookies(cookies)

        page = await context.new_page()
        await page.goto(BASE_URL)
        storage_key = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
        session_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
        if storage_key and session_json:
            await page.evaluate(
                f"window.localStorage.setItem({json.dumps(storage_key)}, {json.dumps(session_json)})"
            )

        await page.goto(f"{BASE_URL}/c/vehicles", wait_until="domcontentloaded")
        await page.wait_for_selector('[data-testid="vehicle-row"]', timeout=10000)
        await page.screenshot(path=str(OUT / "1_list.png"))

        initial = await read_state(page)
        print("initial:", initial)
        if len(initial) < 2:
            fail(f"need >=2 vehicles, found {len(initial)}")
            await browser.close(); return

        defaults = [r for r in initial if r["isDefault"]]
        badges = [r for r in initial if r["hasBadge"]]
        if len(defaults) == 1: ok("exactly one row marked default")
        else: fail(f"expected 1 default row, got {len(defaults)}")
        if len(badges) == 1: ok("Default badge appears once")
        else: fail(f"expected 1 badge, got {len(badges)}")
        if defaults and badges and defaults[0]["id"] == badges[0]["id"]:
            ok("badge matches the default row")
        else:
            fail("badge on wrong row")

        target = next((r for r in initial if not r["isDefault"]), None)
        if not target:
            fail("no non-default vehicle to promote")
            await browser.close(); return

        await page.goto(f"{BASE_URL}/c/vehicles/{target['id']}", wait_until="domcontentloaded")
        await page.wait_for_selector('[data-testid="default-vehicle-card"]')
        state = await page.get_attribute('[data-testid="default-vehicle-card"]', "data-is-default")
        if state == "false": ok("edit screen shows target as non-default")
        else: fail(f"edit card data-is-default={state}, expected false")
        await page.screenshot(path=str(OUT / "2_edit_before.png"))

        await page.click('[data-testid="set-as-default-button"]')
        try:
            await page.wait_for_function(
                "document.querySelector('[data-testid=\"default-vehicle-card\"]')?.getAttribute('data-is-default') === 'true'",
                timeout=6000,
            )
            ok("edit card flipped to default instantly")
        except Exception:
            fail("edit card did not flip to default within 6s")
        await page.screenshot(path=str(OUT / "3_edit_after.png"))

        await page.goto(f"{BASE_URL}/c/vehicles", wait_until="domcontentloaded")
        await page.wait_for_selector('[data-testid="vehicle-row"]')
        after = await read_state(page)
        await page.screenshot(path=str(OUT / "4_list_after.png"))

        d = [r for r in after if r["isDefault"]]
        b = [r for r in after if r["hasBadge"]]
        if len(d) == 1: ok("after switch: exactly one default")
        else: fail(f"after: {len(d)} defaults")
        if len(b) == 1: ok("after switch: exactly one badge")
        else: fail(f"after: {len(b)} badges")
        if d and d[0]["id"] == target["id"]: ok("default moved to selected vehicle")
        else: fail("default did not move to target")

        # --- Persistence after full reload ---
        await page.reload(wait_until="domcontentloaded")
        await page.wait_for_selector('[data-testid="vehicle-row"]')
        reloaded = await read_state(page)
        rd = [r for r in reloaded if r["isDefault"]]
        rb = [r for r in reloaded if r["hasBadge"]]
        if len(rd) == 1 and len(rb) == 1 and rd[0]["id"] == target["id"]:
            ok("badge persists after list reload")
        else:
            fail(f"reload lost badge: defaults={len(rd)} badges={len(rb)}")

        # Navigate list → edit → list; badge must still be correct
        await page.goto(f"{BASE_URL}/c/vehicles/{target['id']}", wait_until="domcontentloaded")
        await page.wait_for_selector('[data-testid="default-vehicle-card"]')
        state = await page.get_attribute('[data-testid="default-vehicle-card"]', "data-is-default")
        if state == "true": ok("edit screen still shows target as default after navigation")
        else: fail("edit screen lost default flag after navigation")

        await page.reload(wait_until="domcontentloaded")
        await page.wait_for_selector('[data-testid="default-vehicle-card"]')
        state = await page.get_attribute('[data-testid="default-vehicle-card"]', "data-is-default")
        if state == "true": ok("edit screen still default after hard refresh")
        else: fail("edit screen lost default after hard refresh")

        await page.goto(f"{BASE_URL}/c/vehicles", wait_until="domcontentloaded")
        await page.wait_for_selector('[data-testid="vehicle-row"]')
        nav = await read_state(page)
        if len([r for r in nav if r["hasBadge"]]) == 1 and next((r for r in nav if r["isDefault"]), {}).get("id") == target["id"]:
            ok("badge still correct after list→edit→list navigation")
        else:
            fail("badge drifted after navigation")

        # --- Toast: re-click Set as default on a different vehicle, capture toast ---
        alt = next((r for r in reloaded if r["id"] != target["id"]), None)
        if alt:
            await page.goto(f"{BASE_URL}/c/vehicles/{alt['id']}", wait_until="domcontentloaded")
            await page.wait_for_selector('[data-testid="set-as-default-button"]')
            await page.click('[data-testid="set-as-default-button"]')
            try:
                await page.get_by_text("is now your default", exact=False).wait_for(timeout=5000)
                ok("confirmation toast shown after setting default")
            except Exception:
                fail("expected confirmation toast not shown")
            await page.screenshot(path=str(OUT / "5_toast.png"))
            # Now `alt` is the current default; `target` is not.
            current_default_id = alt["id"]
        else:
            current_default_id = target["id"]

        # --- Delete current default → auto-promote another ---
        pre_delete = await (await context.new_page()).close() or None  # noop; below uses page
        await page.goto(f"{BASE_URL}/c/vehicles", wait_until="domcontentloaded")
        await page.wait_for_selector('[data-testid="vehicle-row"]')
        before_delete = await read_state(page)
        if len(before_delete) < 2:
            fail("need ≥2 vehicles to test delete-reassignment")
        else:
            await page.goto(f"{BASE_URL}/c/vehicles/{current_default_id}", wait_until="domcontentloaded")
            await page.wait_for_selector('[data-testid="default-vehicle-card"]')
            page.on("dialog", lambda d: asyncio.create_task(d.accept()))
            await page.get_by_text("Remove vehicle", exact=False).click()
            await page.wait_for_url("**/c/vehicles", timeout=10000)
            await page.wait_for_selector('[data-testid="vehicle-row"]')
            await page.screenshot(path=str(OUT / "6_list_after_delete.png"))
            after_delete = await read_state(page)
            if len(after_delete) == len(before_delete) - 1:
                ok(f"vehicle deleted (count {len(before_delete)} → {len(after_delete)})")
            else:
                fail(f"delete count mismatch: {len(before_delete)} → {len(after_delete)}")
            if not any(r["id"] == current_default_id for r in after_delete):
                ok("deleted vehicle removed from list")
            else:
                fail("deleted vehicle still present")
            new_defaults = [r for r in after_delete if r["isDefault"]]
            new_badges = [r for r in after_delete if r["hasBadge"]]
            if len(after_delete) == 0:
                ok("no remaining vehicles — no default expected")
            elif len(new_defaults) == 1 and len(new_badges) == 1 and new_defaults[0]["id"] == new_badges[0]["id"]:
                ok("Default badge auto-reassigned to a remaining vehicle")
            else:
                fail(f"badge not correctly reassigned: defaults={len(new_defaults)} badges={len(new_badges)}")

        await browser.close()

asyncio.run(main())
if failures:
    print(f"\nFAIL — {len(failures)} check(s) failed"); sys.exit(1)
print("\nPASS — Default badge behaves correctly")
