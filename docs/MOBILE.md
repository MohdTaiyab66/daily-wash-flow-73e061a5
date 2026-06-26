# Urban Wash — Native Mobile + FCM Guide

This document covers everything needed to turn the existing Urban Wash web app
into installable Android (and later iOS) apps that receive native push
notifications via Firebase Cloud Messaging.

The web app continues to work in browsers unchanged. Capacitor wraps the
already-built web bundle inside a native shell — there is no second codebase.

---

## 1. One-time Firebase setup

1. Go to https://console.firebase.google.com → **Add project** → name it
   `urbanwash-prod` (and optionally `urbanwash-dev` later).
2. Inside the project, click **Add app → Android**.
   - Package name (partner app): `app.urbanwash.partner`
   - Package name (customer app): `app.urbanwash.customer`
   - Repeat the "Add app" flow for each Android binary. (You can also add iOS
     here when you are ready: bundle IDs `app.urbanwash.partner` /
     `app.urbanwash.customer`.)
3. Download `google-services.json` for each Android app and place it at:
   ```
   android/app/google-services.json
   ```
   (For the customer build, use the matching customer `google-services.json`.)
4. For iOS later: download `GoogleService-Info.plist` and place it inside
   `ios/App/App/` using Xcode (drag-drop with "Copy items if needed").
5. **Generate a service account** (used by the backend to send FCM messages):
   - Firebase console → ⚙ Project settings → **Service accounts** tab.
   - "Generate new private key" → download the JSON file.

## 2. Paste three secrets into Lovable

Open the Lovable project → Secrets and set:

| Secret name | Where to find it (in the service account JSON) |
| ----------- | ---------------------------------------------- |
| `FIREBASE_PROJECT_ID` | `project_id` |
| `FIREBASE_CLIENT_EMAIL` | `client_email` |
| `FIREBASE_PRIVATE_KEY` | `private_key` — paste **exactly as it appears**, keeping the literal `\n` sequences inside the string |

Optional:

| Secret name | Purpose |
| ----------- | ------- |
| `CRON_SECRET` | If set, the `/api/public/cron/offer-push-dispatch` endpoint requires header `x-cron-secret: <value>` |

The code reads these inside the handler at request time. No restart needed.

## 3. Generate the native projects

Run these on your machine (not in Lovable — Lovable does not have Android
Studio installed):

```bash
bun install
bun run build           # produces .output/public

# First time only:
npx cap add android
npx cap add ios         # macOS only

# Every time the web code changes:
npx cap sync
```

The native folders (`android/`, `ios/`) get committed alongside `src/`.

### Choosing partner vs customer build

```bash
# Partner app (default)
URBANWASH_APP=partner npx cap sync android
cd android && ./gradlew assembleRelease

# Customer app
URBANWASH_APP=customer npx cap sync android
cd android && ./gradlew assembleRelease
```

For two separate Play Store listings, maintain two `google-services.json`
files and swap them before each build (or use Gradle product flavors).

## 4. Building Android

Prerequisites: Android Studio + JDK 17.

```bash
# Debug APK (sideload to a test device)
cd android
./gradlew assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk

# Release APK (signed; requires keystore.properties)
./gradlew assembleRelease

# Release AAB (Play Store upload)
./gradlew bundleRelease
# → android/app/build/outputs/bundle/release/app-release.aab
```

Sign the release build by creating `android/keystore.properties`:

```
storeFile=/absolute/path/to/urbanwash.keystore
storePassword=...
keyAlias=urbanwash
keyPassword=...
```

…and referencing it from `android/app/build.gradle` `signingConfigs`.
(Capacitor scaffolds this; see the Capacitor docs for the exact snippet.)

## 5. Building iOS (later)

```bash
open ios/App/App.xcworkspace
```

In Xcode: select the App target → Signing & Capabilities → enable Push
Notifications and Background Modes → Remote notifications. Then Product →
Archive → Distribute App.

## 6. Testing push notifications

1. Install the debug APK on an Android device.
2. Sign in as a partner. You'll be prompted for notification permission —
   accept.
3. In the Lovable database, verify a row appears in `push_tokens` for that
   partner (`platform='android'`, `invalid_at IS NULL`).
4. From the Firebase console → Cloud Messaging → "New campaign" → Test on
   device — paste the token and send. The phone should buzz.
5. End-to-end test: create a Daily Shine booking through the customer app and
   pay. The marketplace will queue it, pick an eligible online partner with a
   valid token, and dispatch the FCM push. Watch `/admin/offer-delivery/<id>`
   to see every stage tick over in realtime.

## 7. Push dispatch cron

The push fan-out runs as a cron-style HTTP endpoint instead of inside the
database, so retries and FCM auth happen in a normal serverless handler.

URL: `https://urban-spark-pro.lovable.app/api/public/cron/offer-push-dispatch`

Schedule it via pg_cron (every 20 seconds is a good cadence):

```sql
SELECT cron.schedule(
  'urbanwash-push-dispatch',
  '*/1 * * * *', -- every minute (pg_cron minimum)
  $$ SELECT net.http_post(
       url := 'https://urban-spark-pro.lovable.app/api/public/cron/offer-push-dispatch',
       headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET value>')
     ); $$
);
```

If you need sub-minute cadence, use an external scheduler (Uptime Kuma, GitHub
Actions, EasyCron) hitting the same URL every 15 seconds.

## 8. Publishing updates in the future

- **Web-only change** (UI, business logic, RPC tweak): make the change in
  Lovable → it auto-deploys. Native apps reload the same Supabase backend, so
  no APK rebuild is needed unless you changed Capacitor config or native
  plugins.
- **Native plugin or config change** (new permission, Firebase config, new
  Capacitor plugin): bump `versionCode`/`versionName` in
  `android/app/build.gradle`, run `npx cap sync`, rebuild the AAB, upload to
  Play Console.

## 9. Where things live in the code

| Concern | File |
| ------- | ---- |
| Native config | `capacitor.config.ts` |
| Platform detection | `src/lib/platform.ts` |
| FCM client (permissions, tokens, listeners) | `src/lib/push/fcm.ts` |
| Auto-register hook (mounted in both authed shells) | `src/lib/push/use-fcm-registration.ts` |
| Server-side FCM HTTP v1 sender | `src/lib/push/send.server.ts` |
| Cron that dispatches pushes for new offers | `src/routes/api/public/cron/offer-push-dispatch.ts` |
| Delivery receipt endpoint | `src/routes/api/public/fcm-delivery-receipt.ts` |
| Per-offer delivery timeline (admin) | `src/routes/admin.offer-delivery.$id.tsx` |
| Hardened partner picker | DB function `pick_scored_partner_for_queue` |
| Offer state machine | DB table `offer_delivery_events` |

## 10. Troubleshooting

- **Push lands in the tray but tapping it does nothing** → check the
  notification payload contains `data.type=offer`. The cron sets this
  automatically. Custom test pushes from the Firebase console must include
  the same `data` keys.
- **`FCM is not configured` in logs** → one of the three Firebase secrets is
  missing or has a typo. Re-paste `FIREBASE_PRIVATE_KEY` exactly as it
  appears in the service account JSON.
- **Token shows up but no push arrives** → check `offer_delivery_events`
  for a `push_failed` row; the `meta.errorCode` will be `UNREGISTERED` (token
  expired — the device must reinstall) or `SENDER_ID_MISMATCH`
  (`google-services.json` doesn't match the Firebase project you generated the
  service account from).
- **Partner is online in the app but not getting offers** → the picker now
  requires `last_seen` within the last 3 minutes AND a valid push token. Check
  both columns in the `partners` and `push_tokens` tables.
