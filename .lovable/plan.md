# Customer App — Final Functional QA Plan

This is a large-scope audit (9 phases across auth, vehicles, subs, payments, packages, credits, bookings, notifications, history, reminders, Monday logic, multi-vehicle, edge cases, perf). Doing it all in one turn would be low-quality — bugs get missed, fixes get bundled, regressions leak.

I'll run it as a **staged audit** across multiple turns, with a persistent regression checklist you can watch fill in. Each stage: **audit → list bugs → fix root cause → re-test that flow + dependents → check off**.

## How I'll work

1. **Regression checklist file** at `.lovable/qa-checklist.md` — created on turn 1, updated after every fix. Grouped by module, each item marked `[ ]` / `[x]` / `[!]` (blocked).
2. **Static audit first** (code + DB + RPCs + RLS + realtime + cron). Runtime/Playwright checks where behavior is ambiguous.
3. **Fix in small batches** per module — never mix modules in one fix batch. After each batch, re-run the checklist items for that module + any dependent flows (e.g. fixing credits also re-tests booking + renewal).
4. **No UI redesign.** Only code changes needed to make existing behavior match the finalized business rules you listed.
5. **Final report** at the end summarizing every bug, fix, remaining risk.

## Stage order (one stage per turn, roughly)

```text
Turn 1  Feature inventory + checklist scaffold + Auth/OTP audit
Turn 2  Vehicle module (isolation, body type, default, photo, delete)
Turn 3  Payments (UPI, prepaid invariant, webhook, retry/cancel/dup)
Turn 4  Subscription activation + credits + Daily Shine inclusions
Turn 5  Bookings + one-time services + credit enforcement
Turn 6  Custom packages + saved packages + add-ons (recurring/one-time)
Turn 7  Notifications policy (customer-only allowed types, no partner ops)
Turn 8  Service history + photos + rating (no GPS/partner/route/checklist)
Turn 9  Reminders + renewals + expiry + Monday logic
Turn 10 Multi-vehicle persistence + edge cases + perf + final report
```

If a stage surfaces no bugs, I collapse it into the next. If a stage surfaces many, it may span two turns.

## What I need from you before starting

Just a go/no-go. I'll assume:
- Web preview is the primary test surface (native APK checks remain your responsibility as before).
- Test data can be created/modified in the live Cloud DB via migrations/RPCs as needed.
- I can add temporary logging that I remove before the final report.

Reply "go" and I'll start Turn 1 (inventory + checklist + Auth audit).