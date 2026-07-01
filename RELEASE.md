# Urban Wash — Release Playbook

This is the operational guide for cutting Urban Wash releases: setting up a
fresh workstation, building the two Android APKs, publishing backend changes,
promoting builds through Google Play Internal Testing, and rolling back when
a trial build goes wrong.

For the mechanical "how do I build one APK on Windows?" walkthrough see
[`BUILD.md`](./BUILD.md). This file is the higher-level release process that
uses those scripts.

---

## 0. Repository layout at a glance

| Path                                        | Purpose                                              |
| ------------------------------------------- | ---------------------------------------------------- |
| `src/`                                      | Web app (Customer, Partner, Admin) — TanStack Start  |
| `android/`                                  | Capacitor-generated native project (shared, per build) |
| `resources/customer/`, `resources/partner/` | Launcher icon + splash sources (1024/1920 PNGs)      |
| `android-config/customer/`, `.../partner/`  | Variant-specific `google-services.json` (git-ignored) |
| `build-customer.bat`, `build-partner.bat`   | One-click Windows build scripts                      |
| `capacitor.config.ts`                       | Reads `URBANWASH_APP` to switch appId/appName        |
| `docs/MOBILE.md`                            | Deep-dive on FCM, service accounts, cron dispatcher  |
| `BUILD.md`                                  | Step-by-step Windows APK build instructions          |

Admin is **web-only** — never bundled into an APK. It ships automatically with
the backend deploy at <https://daily-wash-flow.lovable.app/admin>.

---

## 1. Initial environment setup (one-time, per workstation)

Install on Windows:

1. **Node.js 20+** — <https://nodejs.org/en/download>
2. **Bun** — `powershell -c "irm bun.sh/install.ps1 | iex"`
3. **Java JDK 17** — <https://adoptium.net/temurin/releases/?version=17>
4. **Android Studio** (includes Android SDK) — <https://developer.android.com/studio>
   - First launch → accept all SDK licenses
   - SDK Manager → install **Android SDK Platform 34** and **Build-Tools 34.x**
5. Set `ANDROID_HOME`:
   ```bat
   setx ANDROID_HOME "%LOCALAPPDATA%\Android\Sdk"
   ```
   Re-open Command Prompt so it picks up.

Clone the project and install dependencies:

```bat
cd %USERPROFILE%\Downloads
git clone <repo-url> urban-wash
cd urban-wash
bun install
```

Verify with `node -v`, `bun -v`, `java -version`.

---

## 2. Firebase setup (Cloud Messaging)

Two Android Firebase apps are required — one per package ID.

1. <https://console.firebase.google.com> → **Add project** → `urbanwash-prod`.
2. **Add app → Android** twice, once per package name:
   - `com.urbanwash.customer`
   - `com.urbanwash.partner`
3. Download each app's `google-services.json` and place them at:
   ```
   android-config\customer\google-services.json
   android-config\partner\google-services.json
   ```
   (The build scripts copy the right one into `android\app\` each run.)
4. **Generate a service account**: Firebase → ⚙ Project settings → Service
   accounts → *Generate new private key*.
5. In the Lovable backend, set these three secrets from that JSON:
   - `FIREBASE_PROJECT_ID` — `project_id`
   - `FIREBASE_CLIENT_EMAIL` — `client_email`
   - `FIREBASE_PRIVATE_KEY` — `private_key` exactly as-is (keep the literal `\n`)

Full FCM detail (delivery receipts, token debugging, cron cadence) lives in
[`docs/MOBILE.md`](./docs/MOBILE.md).

---

## 3. Google Maps setup

The Admin Route Manager and Coverage Manager use Google Maps JavaScript API +
Places + Geocoding. Only the web needs a key — the APKs render maps through
the same web bundle.

1. <https://console.cloud.google.com> → create project `urbanwash-maps`.
2. **APIs & Services → Library** — enable:
   - Maps JavaScript API
   - Places API
   - Geocoding API
3. **Credentials → Create Credentials → API key**.
4. Restrict the key:
   - **Application restrictions → HTTP referrers**:
     - `https://daily-wash-flow.lovable.app/*`
     - `https://*.lovable.app/*` (for previews)
     - `http://localhost:8080/*` (local dev)
   - **API restrictions**: limit to the three APIs above.
5. In Lovable backend secrets set `GOOGLE_MAPS_API_KEY` and
   `VITE_GOOGLE_MAPS_API_KEY` (the client-side reader) to the same value.

Rotate the key if it ever leaks — usage shows up in the Cloud Console
dashboard within an hour.

---

## 4. Razorpay setup

Razorpay powers subscription purchase, Daily Shine top-ups, and addon
payments.

1. Create a Razorpay account at <https://dashboard.razorpay.com> (or use the
   existing Urban Wash account).
2. **Settings → API Keys** — generate a key pair for each mode:
   - **Test Mode**: `rzp_test_...` + secret
   - **Live Mode**: `rzp_live_...` + secret (only after KYC is approved)
3. Set these Lovable backend secrets:
   - `RAZORPAY_KEY_ID`
   - `RAZORPAY_KEY_SECRET`
   - `RAZORPAY_WEBHOOK_SECRET` (see step 4)
   - `VITE_RAZORPAY_KEY_ID` — public key id, safe to expose to the browser
4. **Settings → Webhooks → Add New Webhook**:
   - URL: `https://daily-wash-flow.lovable.app/api/public/razorpay-webhook`
   - Secret: generate a random string and paste the same value as
     `RAZORPAY_WEBHOOK_SECRET` above.
   - Events: `payment.captured`, `payment.failed`, `subscription.activated`,
     `subscription.charged`, `subscription.cancelled`.
5. Test with a ₹1 order in test mode → confirm the row lands in `payments`
   and `subscriptions` (if applicable) in the backend.

Never commit either secret. Switching test → live is a secret swap only; no
code change required.

---

## 5. Building the Customer APK

From a fresh Command Prompt in the project root:

```bat
build-customer.bat
```

The script:

1. Verifies Node / Bun / Java / Android SDK are present.
2. Confirms `android-config\customer\google-services.json` exists.
3. Sets `URBANWASH_APP=customer` and `VITE_URBANWASH_APP=customer`.
4. Runs `bun install` (only if `node_modules` is missing), `bun run build`,
   `npx cap sync android`.
5. Opens Android Studio.

In Android Studio: **Build → Build App Bundle(s) / APK(s) → Build APK(s)**.
Grab the artifact at:

```
android\app\build\outputs\apk\debug\app-debug.apk
```

Rename to `urbanwash-customer-vX.Y.Z.apk` and archive alongside the release
notes.

---

## 6. Building the Partner APK

Close any Android Studio window open for the Customer build first — the
`android\` folder is shared.

```bat
build-partner.bat
```

Same flow as Customer. Output APK → rename to
`urbanwash-partner-vX.Y.Z.apk`.

Two APKs, distinct package IDs (`com.urbanwash.customer` /
`com.urbanwash.partner`), distinct icons and splash screens, same backend.

---

## 7. Publishing backend changes

The web app (Customer, Partner, Admin), server functions, edge functions,
migrations, RPCs, and cron endpoints all deploy together from Lovable.

1. Verify preview: <https://id-preview--1206e21a-d7b1-4465-ae7c-4fc59022829f.lovable.app>
2. Click **Publish → Update** in Lovable. Backend migrations run
   automatically; frontend goes live at
   <https://daily-wash-flow.lovable.app>.
3. Post-publish smoke test (5 minutes):
   - Admin dashboard loads and shows today's routes.
   - Customer app home shows correct coverage.
   - Partner app `Today's Route` loads without a console error.
   - `pg_cron` job `urbanwash-push-dispatch` last ran within 90 seconds
     (Admin → DAR / marketplace panels).

Rule of thumb: **backend changes ship instantly on Publish; APKs only need
rebuilding when Capacitor config, native plugins, or the app-shell logic
changes.**

---

## 8. Updating APKs after UI changes

Because Capacitor loads the same web bundle you just published, most UI
changes reach installed APKs immediately with **no rebuild** — the app fetches
the latest routes and assets on next launch.

You DO need to rebuild and reship APKs when any of these change:

- `capacitor.config.ts`
- Anything under `android/`
- `resources/customer/*` or `resources/partner/*` (icons/splash)
- `android-config/*/google-services.json`
- A new Capacitor plugin is added (any `@capacitor/*` or `capacitor-*` in
  `package.json`)
- New native permission required in `AndroidManifest.xml`
- Bumping `versionCode` / `versionName` in `android/app/build.gradle`

Rebuild flow when required:

1. Bump `versionCode` (integer, +1) and `versionName` (semver) in
   `android/app/build.gradle` for the variant.
2. Run `build-customer.bat` and `build-partner.bat` as needed.
3. Follow **§9. Google Play Internal Testing** below to distribute.

---

## 9. Releasing through Google Play Internal Testing

Two separate Play Console apps — one per package ID. Each has its own
Internal Testing track.

**One-time per app:**

1. Play Console → **Create app** → set package name to
   `com.urbanwash.customer` (repeat for `com.urbanwash.partner`).
2. **Setup → App integrity** → let Play manage the signing key (Play App
   Signing). Upload your upload keystore (`urbanwash-upload.jks`) — keep the
   `.jks` and password in the shared password manager. **Losing it means you
   can never ship an update for that package.**
3. **Testing → Internal testing → Testers** → create an email list
   (`urbanwash-trial-testers`) and add tester Gmail addresses. Copy the
   opt-in URL and share with testers.

**Per release:**

1. Bump `versionCode` (+1) and `versionName` (e.g. `1.0.3`) in
   `android/app/build.gradle`.
2. In Android Studio: **Build → Generate Signed Bundle / APK → Android App
   Bundle → release**, sign with the upload keystore.
   Output: `android\app\build\outputs\bundle\release\app-release.aab`.
3. Play Console → target app → **Testing → Internal testing → Create new
   release**.
4. Upload the `.aab`. Fill in **Release notes** (mirror the entry from
   `CHANGELOG.md` — see §11).
5. **Review release → Start rollout to Internal testing**.
6. Testers get the update within ~10 minutes via the Play Store.

Repeat for the other package ID.

Promotion path: Internal Testing → Closed (Alpha) → Open (Beta) → Production.
Do not skip stages during the trial.

---

## 10. Rolling back a bad trial build

Two things can go wrong: the **backend** or the **APK**.

### Backend rollback (fast — minutes)

- Lovable **Publish** panel keeps prior deployments. Open the panel →
  **Deployment history** → pick the last known good version → **Restore**.
- This reverts the frontend, server functions, and edge functions atomically.
- **Database migrations are not auto-reverted.** If the bad build ran a
  destructive migration, restore from the latest daily backup:
  Admin → Backend → *Restore from backup* (or the equivalent Lovable Cloud
  action).
- Post-rollback: force-refresh the Admin dashboard, then re-run the smoke
  test from §7.

### APK rollback (Play Console)

Play does not let you delete a live release, but you CAN promote an older
version back into Internal Testing:

1. Play Console → target app → **Testing → Internal testing → Releases**.
2. Find the previous good release → **Create new release** → **Add from
   library** → pick that older `.aab`.
3. Bump `versionName` to something like `1.0.3-rollback` (versionCode must
   still be higher than any prior release — increment by +1).
4. Start rollout. Testers auto-update within ~10 minutes.

If the bad APK is already on tester devices and misbehaving badly, tell
testers to *Uninstall and reinstall from the Play Store opt-in URL* — this
guarantees they land on the rollback build.

**Halted rollout:** If you catch the issue during rollout, Play Console →
release → **Halt rollout** stops new installs immediately (existing installs
keep the bad version until they update).

### If backend and APK are both bad

Roll back the **backend first** (users of every APK version benefit
instantly), then ship the APK rollback. Don't do them in parallel — you want
to observe whether the backend rollback alone resolves the issue before
touching the mobile channel.

---

## 11. Versioning policy

Semantic versioning: **`vMAJOR.MINOR.PATCH`**, e.g. `v1.0.0`, `v1.0.1`,
`v1.2.0`, `v2.0.0`.

| Bump      | When to use                                                            | Example scenario                                      |
| --------- | ---------------------------------------------------------------------- | ----------------------------------------------------- |
| **PATCH** | Bug fixes, copy tweaks, UI polish, backend hotfixes, no schema change  | `v1.0.1` — fix Partner GPS accuracy                   |
| **MINOR** | New feature, backwards-compatible schema/API additions                 | `v1.1.0` — add Weekly Wash subscription plan          |
| **MAJOR** | Breaking schema change, pricing model change, mandatory re-onboarding  | `v2.0.0` — replace subscription engine                |

Additional rules:

- **`versionName`** in `android/app/build.gradle` mirrors the semver string
  without the `v` (`1.0.3`).
- **`versionCode`** is a monotonically increasing integer — **always +1**,
  even for rollbacks. It never resets. Play Console rejects any upload where
  `versionCode` is not strictly greater than the previously shipped one.
- Each release gets a **git tag**: `git tag v1.0.3 && git push --tags`.
- Each release gets a **`CHANGELOG.md` entry** at the top with:
  - Version + date
  - Grouped by `Added` / `Changed` / `Fixed` / `Security` / `Ops`
  - Whether backend, Customer APK, and/or Partner APK need updating
- **Trial phase** stays in the `v1.0.x` range until the trial exits. Ship
  patches liberally.
- After trial exit → cut `v1.1.0` for the first post-trial feature drop.

### Version bump checklist

Before tagging a release:

- [ ] `CHANGELOG.md` entry written
- [ ] `versionCode` +1 and `versionName` updated in
      `android/app/build.gradle` (for APK-bearing releases)
- [ ] Backend published from Lovable (§7)
- [ ] APKs rebuilt if native surface changed (§8)
- [ ] Uploaded to Play Internal Testing (§9)
- [ ] Git tag pushed (`git tag vX.Y.Z && git push --tags`)
- [ ] Release notes shared with the trial WhatsApp group

---

## 12. Related documents

- [`BUILD.md`](./BUILD.md) — step-by-step Windows APK build
- [`docs/MOBILE.md`](./docs/MOBILE.md) — Firebase/FCM deep dive
- `CHANGELOG.md` — human-readable changelog (create if missing at first
  release)
