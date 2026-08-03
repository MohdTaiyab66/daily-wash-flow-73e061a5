# Urban Wash — Payment Implementation Audit (report only, no code changed)

Scope: every payment-related file in the repo, JS + native + backend.

## 1. Inventory

| Layer | File | Status |
|---|---|---|
| Dep manifest | `package.json` — `capacitor-razorpay@^1.3.0` (only payment dep) | OK |
| Lockfile | `bun.lock` (no `package-lock.json`, no `yarn.lock`, no `pnpm-lock.yaml`) | OK — single lockfile |
| Capacitor config | `capacitor.config.ts` — variant switch customer/partner, remote `server.url` | OK, see F6 |
| App gradle | `android/app/build.gradle` — `[uw-razorpay-pin]` forces `com.razorpay:checkout:1.6.41` + direct `implementation` | see F1 |
| Root gradle | `android/build.gradle` — AGP 8.13.0, Kotlin 2.2.20, google-services 4.4.4 | OK |
| Settings | `android/settings.gradle` + `android/capacitor.settings.gradle` (`:capacitor-razorpay` included once) | OK |
| gradle.properties | contains `org.gradle.java.home=C:/Program Files/Eclipse Adoptium/jdk-21...` | see F5 |
| Manifest | `android/app/src/main/AndroidManifest.xml` — UPI `<queries>` present, no duplicate/stale payment activity | OK |
| MainActivity | `android/app/src/main/java/com/urbanwash/customer/MainActivity.java` — `registerPlugin(Checkout.class)`, `onActivityResult` → `Checkout.handleRazorpayActivityResult` | see F3, F7 |
| MainApplication | not present (Capacitor default) | OK |
| Proguard | `android/app/proguard-rules.pro` — default only; `minifyEnabled false` in release | see F8 |
| Native plugin | patched at build time by `scripts/patch-capacitor-java.mjs` (`@NativePlugin` → `@CapacitorPlugin`, `Checkout.setKeyID` + `open()`) | see F4 |
| Web/native opener | `src/lib/razorpay-checkout.ts` **and** an inline duplicate inside `src/routes/c/_authed/service.$slug.tsx` | see F2 |
| Order creation | `src/lib/payment.functions.ts` → `createRazorpayOrder` (server fn, `RAZORPAY_KEY_ID`/`_SECRET` read in handler) | OK |
| Verification | `verifyRazorpayPayment` — HMAC of `order_id|payment_id`, re-fetch payment, capture if authorized, then `activate_paid_booking` | OK |
| Webhook | `src/routes/api/public/razorpay-webhook.ts` — HMAC + `timingSafeEqual`, gated on `payment.captured`/`order.paid` **and** `status === captured` | OK |
| Env | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` — server only; key id sent to client with the order | OK |
| Isolation sample | `android-isolation/razorpay-official-sample/` (`checkout:1.6.41`, own applicationId) | Not in build graph — OK |

**Duplicate Razorpay SDKs: none.** No `cordova-razorpay`, no Cordova plugin dir (`android/capacitor-cordova-android-plugins/src/main/java` is empty), no vendored AAR/jar in `app/libs`. One Capacitor plugin, one Maven SDK coordinate.

## 2. Findings

**F1 — Mixed SDK version resolution (medium).**
`node_modules/capacitor-razorpay/android/build.gradle` declares the dynamic version `com.razorpay:checkout:1.6.+`. The `force 1.6.41` and `resolutionStrategy` live in `android/app/build.gradle` inside `configurations.all` of the **app module only** — the `:capacitor-razorpay` module resolves its own configurations independently, so it can compile against a newer 1.6.x than the app pins. Final APK gets one runtime class set (app wins at packaging), but compile/runtime can differ across machines and over time because `1.6.+` is not reproducible.

**F2 — Two payment implementations in the JS layer (high).**
- `src/lib/razorpay-checkout.ts` — shared native-first opener, used by `MonthlyAddonsSection.tsx`.
- `src/routes/c/_authed/service.$slug.tsx` — has its own `loadRazorpayCheckout()`, its own `window.Razorpay` declaration, its own native import of `capacitor-razorpay`, its own fallback and diagnostics.

Both paths call the same server fns, but the checkout option payloads, fallback rules and event/timeline logging differ. Any native fix applied to one is not applied to the other. This is the single biggest consistency defect and the most likely source of "works in one screen, not the other".

**F3 — Plugin registered twice (medium).**
`:capacitor-razorpay` is on the compile classpath via `capacitor.build.gradle`, so Capacitor auto-discovers the `@CapacitorPlugin(name = "Checkout")` class; `MainActivity.onCreate` also calls `registerPlugin(Checkout.class)` (injected by `scripts/patch-android-manifest.mjs`). Capacitor tolerates this (later registration replaces), but it is redundant and masks the case where auto-discovery has actually failed.

**F4 — Native plugin source is patched in `node_modules` (high, process risk).**
The working `Checkout.java` (SDK-initialised `setKeyID` + `open()` + `handleActivityResult`) only exists after `scripts/patch-capacitor-java.mjs` runs (`postinstall` + `build`). `npx cap sync android` does **not** run it. So any flow that installs deps with `--ignore-scripts`, or syncs without a prior `npm/bun install`/`build`, ships the **upstream** plugin — old `@NativePlugin` annotation, raw `CheckoutActivity` intent — which is exactly the "checkout opens and exits instantly" bug. There is no build gate asserting the patched marker is present in the APK (`scripts/verify-apk-native.mjs` checks push classes only, no Razorpay assertions).

**F5 — Non-portable toolchain pin.** `android/gradle.properties` hardcodes a Windows JDK path; the file is committed, so it breaks CI/macOS/Linux builds.

**F6 — Java/Kotlin target skew.** `capacitor.build.gradle` (generated) sets Java 21, `[uw-kotlin]` sets `jvmTarget = "21"`, while `patch-capacitor-java.mjs` rewrites `@capacitor/android` and `capacitor-razorpay` to Java **17**. It currently builds, but the two Capacitor modules compile at a different bytecode level from the app module — a fragile combination that changes behaviour with the host JDK.

**F7 — Stale/misleading native logging.** `MainActivity.java` under `com.urbanwash.customer` logs with tag `PARTNER_BUILD` and a hardcoded `BUILD_ID=2026-07-18-trace-01`, `GIT_SHA=unknown`. The single `android/` directory is variant-swapped between customer and partner builds (`android/.urbanwash-variant`), so a checked-in `android/` tree is always stale for one of the two apps — a real source of "I built customer, got partner behaviour".

**F8 — Proguard.** `minifyEnabled false`, so no rules are needed today; there are no Razorpay/Capacitor keep rules, so enabling minification later will break checkout callbacks.

**F9 — Dead / duplicated support code (low).** `scripts/patch-android-gradle.mjs.bak`, `razorpay-customer-deps.txt`, `razorpay-partner-deps.txt`, `partner.txt`, `partner-package.txt`, and the duplicated `window.Razorpay` global declaration in both `razorpay-checkout.ts` and `service.$slug.tsx`.

## 3. What is actually correct

- One payment provider, one plugin, one SDK coordinate, no Cordova residue.
- Server is the only authority: `activate_paid_booking` runs after signature verification or a captured webhook. NO PAYMENT = NO SERVICE holds on both paths.
- Webhook ignores `payment.authorized` / `payment.failed` and non-captured statuses.
- Secrets never reach the client; only `key_id` + `order_id` do.

## 4. Recommended order of work (not yet applied)

1. F2: delete the inline checkout in `service.$slug.tsx`, route it through `src/lib/razorpay-checkout.ts`.
2. F4: add a Razorpay assertion to `verify-apk-native.mjs` and run the patcher from the build script before `cap sync`, failing the build if the upstream annotation is still present.
3. F1: pin the plugin module to `1.6.41` (or apply the resolution strategy in `allprojects`).
4. F3: drop one of the two registrations.
5. F5/F6: remove the hardcoded `org.gradle.java.home`, settle on one Java target.

## 5. Clean-build procedure (Windows, customer APK)

```bat
rmdir /s /q android\.gradle
rmdir /s /q android\build
rmdir /s /q android\app\build
rmdir /s /q node_modules
bun install                              :: runs postinstall -> patch-capacitor-java.mjs
node scripts/patch-capacitor-java.mjs    :: idempotent, re-assert
set URBANWASH_APP=customer
npx cap sync android
node scripts/patch-android-gradle.mjs
node scripts/patch-android-manifest.mjs
cd android && gradlew.bat clean assembleRelease
```

Then confirm in the build log: `[uw-razorpay-resolved] ... com.razorpay:checkout:1.6.41`, and in logcat at checkout time: `Checkout Started: CheckoutActivity launched via SDK` followed by `Checkout Returned: resultCode=...`.

## 6. If it still fails

Needed next, before any further code change: the Android stack trace / logcat slice filtered on
`adb logcat -v time | findstr /R "PARTNER_BUILD Razorpay AndroidRuntime Capacitor"` from app launch through checkout dismissal.

---

## Stabilization outcome (F1–F4 + toolchain)

| ID | Fix | Proof |
|----|-----|-------|
| F4 | Native checkout is now app-owned source (`android/app/src/main/java/com/urbanwash/payments/UrbanWashCheckoutPlugin.java`, mirrored in `android-native/java/`). `capacitor-razorpay` removed from `package.json`, `node_modules`, and `capacitor.settings.gradle`. `scripts/patch-capacitor-java.mjs` deleted. | `npx cap sync android` lists 10 plugins, none Razorpay; plugin file still present afterwards. |
| F2 | One payment API: `openRazorpayCheckout()` in `src/lib/razorpay-checkout.ts`. The inline implementation in `service.$slug.tsx` is gone; add-ons and subscriptions call the same service. | No `window.Razorpay` usage outside `src/lib/razorpay-checkout.ts`. |
| F1 | `com.razorpay:checkout:1.6.41` pinned permanently in `android/app/build.gradle` (`[uw-payments]`), with `force` + an `eachDependency` guard that fails the build on any `+` version. | `gradlew :app:printRazorpayResolved` prints the resolved coordinate during every build. |
| F3 | `MainActivity` registers `UrbanWashCheckoutPlugin` exactly once and forwards `onActivityResult`. | `payments.registration.single` gate. |
| Java env | `org.gradle.java.home` removed; Gradle toolchain pins Java 21 for all modules (`[uw-java-toolchain]` in `android/build.gradle`), Kotlin `jvmTarget = 21`. | `build.java.no-machine-path` gate. |
| Cleanup | `PARTNER_BUILD` logging and the WebView cache-bust hack removed from the customer `MainActivity`. | `payments.mainactivity.clean` gate. |

`scripts/verify-apk-native.mjs` now hard-fails the build (and `build-customer.bat` deletes the APK) if the upstream plugin reappears, the pin goes dynamic, registration is duplicated, or `UrbanWashCheckoutPlugin` / the Razorpay SDK is missing from `classes*.dex`.
