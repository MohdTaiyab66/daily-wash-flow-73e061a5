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

        await browser.close()

asyncio.run(main())
if failures:
    print(f"\nFAIL — {len(failures)} check(s) failed"); sys.exit(1)
print("\nPASS — Default badge behaves correctly")
