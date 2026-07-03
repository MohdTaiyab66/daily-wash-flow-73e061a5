# Partner Service Module — Regression Checklist

**Rule:** No Partner APK is released unless all 13 items below pass on the built APK (not just the web preview).

Record the APK version and date at the top of each run:

- APK version: `v_._._`
- Build stamp: `YYYY-MM-DD-NN`
- Tester:
- Device / Android version:

## Checklist

Run against a real assigned service, on the installed APK, with the device offline-then-online at least once during the run.

- [ ] **1. Before Photo** — Camera opens directly (no gallery picker). Photo attaches. Slot shows ✓.
- [ ] **2. After Photos** — All 4 angles (front, rear, left, right) capture and attach. Each slot shows ✓.
- [ ] **3. Complete Service** — Submit enables only when all required photos exist. Completion succeeds. Status flips to `completed`.
- [ ] **4. Dirty Vehicle** — Inline section expands. All 4 proofs capture via native camera. Submit credits the partner and advances the route.
- [ ] **5. Mark Unavailable** — Inline section expands. Both proofs (front, rear) capture. Reason + optional notes submit. Route advances.
- [ ] **6. Wallet Credit** — Partner wallet shows exactly ₹12 for Dirty and ₹12 for Unavailable — credited once, no duplicates.
- [ ] **7. Route Progress** — After each completion (normal, dirty, unavailable), the current stop clears and the next customer becomes active.
- [ ] **8. Today's Route** — Route screen reflects the new active stop within a few seconds without a manual refresh.
- [ ] **9. Customer Notification** — Customer app receives realtime update / push for start, completion, dirty, and unavailable events.
- [ ] **10. Admin Notification** — Admin Live / Services view reflects the new status in realtime; admin service detail page shows the captured photos and any dirty/unavailable report.
- [ ] **11. Customer Photo Gallery** — Before + all 4 After photos appear in the customer's service history, signed URLs load.
- [ ] **12. Complaint Window** — Customer can raise a complaint within the allowed window after completion; window closes correctly afterwards.
- [ ] **13. GPS + Realtime** — Start and complete GPS coords are captured and visible in admin; realtime channel stays subscribed across background/foreground transitions and after an Android process kill during camera capture.

## Process-kill scenario (must-test)

Android will kill the WebView while the native camera is foregrounded on low-memory devices. Reproduce at least once per release:

1. Start a service, open Dirty Vehicle (or Mark Unavailable).
2. Tap Proof 1 → native camera opens.
3. Force-stop the app from Recents while the camera is still open, then reopen the app.
4. Confirm: the section auto-expands, the captured photo appears in its slot, and Submit becomes enabled once all proofs are captured.

## Release gate

If any item above fails, the APK is **not** released. Fix, rebuild, re-run the full 13-item checklist — partial re-runs are not accepted.
