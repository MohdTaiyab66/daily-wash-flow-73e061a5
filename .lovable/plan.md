# Native Mobile + FCM Delivery Layer

Convert the existing TanStack Start web app into a production-ready Capacitor Android app (iOS scaffolded for later), and replace the browser push layer with native Firebase Cloud Messaging. Existing routes, RPCs, marketplace logic, admin UI, and customer/partner flows stay untouched — only the **delivery layer** is swapped, plus a small set of additive DB columns, an `offer_delivery_events` state machine, and tighter partner-selection criteria.

Before I start, two things you must know up front so there are no surprises later:

1. **Capacitor wraps the built web app.** The TanStack app keeps running as-is inside a native WebView. There is no rewrite, no React Native, no second codebase. The Android/iOS projects are added alongside `src/`, and `bun run build` produces the web bundle that Capacitor copies into the native shell.
2. **The Lovable sandbox cannot build, sign, or run an actual `.apk`/`.aab`.** I can author every file (Capacitor config, `android/` project, Firebase plugin wiring, service worker, FCM send code, DB migrations, admin dashboards) and verify it typechecks. Producing the installable APK requires Android Studio + JDK + Gradle on your machine (or an EAS/Codemagic CI). Phase 7 is the exact step-by-step guide for that.

If both are OK, here is the plan.

---

## Phase 1 — Capacitor shell (Android now, iOS scaffolded)

- Add deps: `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, `@capacitor/ios`, `@capacitor/app`, `@capacitor/push-notifications`, `@capacitor/haptics`, `@capacitor/preferences`, `@capacitor-firebase/messaging`.
- Create `capacitor.config.ts` with appId `app.urbanwash.partner` / `app.urbanwash.customer` (single binary toggled by build flavor — final decision in Phase 1: one app or two; default = **two binaries, one codebase, env flag picks the start route**).
- `npx cap add android` + `npx cap add ios` → commits `android/` and `ios/` folders.
- Web build stays the same; add `bun run cap:sync` script.
- Add `Capacitor.isNativePlatform()` guard in `src/lib/platform.ts` so existing code branches between web/native without rewrites.

## Phase 2 — Native FCM integration

- Add `google-services.json` (Android) and `GoogleService-Info.plist` (iOS) as placeholders — you paste real values later.
- New module `src/lib/push/fcm.ts`:
  - Request permission on first authed mount.
  - Register native token via `@capacitor-firebase/messaging`.
  - Persist to existing `push_tokens` table (add columns: `platform`, `device_id`, `app`, `last_seen`, `invalid_at`).
  - Listen for `tokenReceived` (refresh) and re-upsert.
  - Handle foreground / background / cold-start payload routing.
- Notification channels: `offers` (max importance, sound, vibration, bypass DND), `assignments`, `general`.
- Server side: new `src/lib/push/send.server.ts` using FCM HTTP v1 + a Firebase **service account JSON** (the credential you paste). Includes retry with backoff and invalid-token cleanup (`UNREGISTERED` / `INVALID_ARGUMENT` → mark `invalid_at`).
- Deep link payload: `{ type: "offer", offer_id, queue_id }` → routes to `/app/offer/$id` which auto-opens the existing `OfferPopup`.

## Phase 3 — Partner offer delivery (3 states)

- **App in foreground**: existing realtime listener triggers `OfferPopup` (already built). No native notification.
- **App backgrounded**: FCM displays high-priority heads-up notification with Accept/Decline actions. Tapping opens app at offer route.
- **App terminated**: data-only FCM wakes the app; on cold start `src/lib/push/cold-start.ts` reads the pending intent and immediately mounts `OfferPopup`.
- 90s timer + vibration + sound continue to work inside the popup regardless of entry path.

## Phase 4 — Offer delivery state machine

New table `offer_delivery_events`:

```text
id | offer_id | queue_id | partner_id | stage | meta jsonb | created_at
stages: created, queued, selected, push_sent, push_delivered, opened,
        popup_displayed, accepted, declined, timed_out, reassigned, completed
```

- DB trigger inserts `created` on `subscription_offers` insert.
- `send.server.ts` writes `push_sent` + FCM message_id, and `push_delivered` on FCM receipt callback.
- Client writes `opened` (notification tap), `popup_displayed` (mount), `accepted`/`declined` (button).
- Sweeper writes `timed_out` / `reassigned`.
- Admin page `/admin/offer-delivery/$offer_id` shows full timeline.

## Phase 5 — Partner selection hardening

Update `pick_scored_partner_for_queue` to require:

```sql
status = 'active'
AND accepting_new = true
AND availability = 'online'
AND last_seen > now() - interval '3 minutes'
AND EXISTS (SELECT 1 FROM push_tokens
            WHERE partner_id = partners.id AND invalid_at IS NULL)
```

- If no candidates → existing radius expansion runs.
- If still none after max radius → insert `admin_alerts` row + customer status → `searching_extended`.

## Phase 6 — Marketplace monitoring dashboard

Extend `/admin/marketplace` with realtime tiles:
- Online partners / with valid token / without token
- Pending customers, pending offers, accepted today, timed-out today
- Push send failures (last 1h), push opened rate
- Link to `/admin/offer-history` (already exists) + new `/admin/offer-delivery/$id`

## Phase 7 — Documentation (delivered as `docs/MOBILE.md`)

Step-by-step:
1. Create Firebase project + Android app + iOS app
2. Download `google-services.json` / `GoogleService-Info.plist` → exact file paths
3. Generate service account JSON → which 3 fields to paste into Lovable secrets (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`)
4. APK build: `bun run build && npx cap sync android && cd android && ./gradlew assembleRelease`
5. AAB build (Play Store): `./gradlew bundleRelease`
6. iOS build: open `ios/App/App.xcworkspace` in Xcode, archive
7. Testing push: send via Firebase console → device, then via your own admin "Test push" button
8. Publishing updates: web-only changes → `cap copy` + redeploy backend; native changes → rebuild APK/AAB

---

## Technical details

**DB migrations (one file):**
- `push_tokens`: add `platform text`, `device_id text`, `app text`, `last_seen timestamptz`, `invalid_at timestamptz`, unique `(partner_id, device_id)`.
- `offer_delivery_events`: new table + grants + RLS (admin read, service_role write) + trigger on `subscription_offers`.
- `admin_alerts`: new table for "no eligible partner".
- `pick_scored_partner_for_queue`: replace with hardened version.

**Secrets to request via `add_secret` after plan approval:**
`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`.

**Files added (no rewrites of existing logic):**
- `capacitor.config.ts`
- `src/lib/platform.ts`
- `src/lib/push/{fcm.ts,cold-start.ts,deep-link.ts}`
- `src/lib/push/send.server.ts`
- `src/lib/push/send.functions.ts` (admin trigger + queue send)
- `src/routes/api/public/fcm-delivery-receipt.ts`
- `src/routes/admin.offer-delivery.$id.tsx`
- `docs/MOBILE.md`
- `android/` + `ios/` (generated by `cap add`)

**Files touched (additive only):**
- `src/routes/_authenticated/app.tsx` — mount `useFcmRegistration()` hook
- `src/routes/c/_authed/route.tsx` — mount `useFcmRegistration()` hook
- `src/routes/admin.marketplace.tsx` — add monitoring tiles
- DB function `offer_next_for_queue` — call `push.send` after creating offer
- DB function `pick_scored_partner_for_queue` — tightened criteria

**Out of scope (intentionally):**
- Building/signing actual APK in this sandbox
- iOS App Store submission (scaffolded, not submitted)
- Replacing existing OfferPopup, AwaitingPartnerBanner, admin UI, or marketplace RPCs

---

## Execution order (5 turns)

1. DB migration (push_tokens + offer_delivery_events + admin_alerts + tightened picker)
2. Capacitor install + config + `cap add android` + platform helper
3. FCM client (`fcm.ts`, cold-start, deep-link, hook mounted in both authed shells)
4. FCM server (`send.server.ts`, send.functions, delivery-receipt route, wire into `offer_next_for_queue`)
5. Admin monitoring tiles + offer-delivery detail page + `docs/MOBILE.md` + request 3 Firebase secrets

Approve and I'll start with turn 1 (DB migration).
