# Urban Wash — Android APK Build Guide (Windows)

This project ships **two Android APKs from the same codebase**:

| APK              | Package ID                | Opens into     | Splash / Theme       |
| ---------------- | ------------------------- | -------------- | -------------------- |
| Urban Wash       | `com.urbanwash.customer`  | Customer app   | Orange `#FF6B1A`     |
| Urban Wash Partner | `com.urbanwash.partner` | Partner app    | Navy `#0F172A`       |

**Admin stays web-only** at <https://daily-wash-flow.lovable.app/admin>. Do **not** build an Admin APK.

You switch between the two builds with a single environment variable:

```bat
set URBANWASH_APP=customer    REM Customer APK
set URBANWASH_APP=partner     REM Partner APK
```

Both APKs talk to the same Lovable Cloud backend, the same database, and the same realtime channels.

---

## 1. One-time setup (Windows)

Install once:

1. **Node.js 20+** — <https://nodejs.org/en/download>
2. **Bun** (used by this project) — open PowerShell and run:
   ```powershell
   powershell -c "irm bun.sh/install.ps1 | iex"
   ```
3. **Java JDK 17** — <https://adoptium.net/temurin/releases/?version=17>
4. **Android Studio** (includes the Android SDK & build tools) — <https://developer.android.com/studio>
   - On first launch, accept all SDK licenses when prompted.
   - In **More Actions → SDK Manager**, install **Android SDK Platform 34** and **Android SDK Build-Tools 34.x**.

Verify in a new Command Prompt window:

```bat
node -v
bun -v
java -version
```

You should see Node ≥ 20, Bun ≥ 1.0, and Java 17.

---

## 2. Download the project

In Lovable, click **GitHub → Connect to GitHub** (or use the **Download ZIP** option). Then in Command Prompt:

```bat
cd %USERPROFILE%\Downloads\urban-wash
bun install
```

---

## 3. Drop in your Firebase config files

Push notifications use Firebase Cloud Messaging. You need **two** Firebase Android apps (one per package ID), each with its own `google-services.json`.

Place the files like this **before** the first sync:

```
android-config\
  customer\google-services.json     ← from Firebase app  com.urbanwash.customer
  partner\google-services.json      ← from Firebase app  com.urbanwash.partner
```

(Create the `android-config\` folder yourself; it is git-ignored.)

The build commands below copy the right file into `android\app\` automatically.

> First-time only: in the **Lovable backend secrets**, set `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` from the same Firebase service-account JSON. See `docs/MOBILE.md` §2.

---

## 4. Build the Customer APK

Open a fresh Command Prompt in the project folder and run:

```bat
set URBANWASH_APP=customer
set VITE_URBANWASH_APP=customer
bun run build
if not exist android (npx cap add android)
copy /Y android-config\customer\google-services.json android\app\google-services.json
npx cap sync android
```

Then open the native project in Android Studio:

```bat
npx cap open android
```

In Android Studio:

1. Wait for the **Gradle sync** at the bottom to finish (first run downloads ~1 GB).
2. Menu **Build → Generate App Bundles or APKs → Generate APKs**.
3. When the toast appears in the bottom-right, click **locate** to open the output folder.
4. The file is at:
   ```
   android\app\build\outputs\apk\debug\app-debug.apk
   ```
   Rename it to `urbanwash-customer.apk` and copy to your phone.

---

## 5. Build the Partner APK

Close Android Studio first (the `android\` folder is shared between variants).

In Command Prompt, from the same project folder:

```bat
set URBANWASH_APP=partner
set VITE_URBANWASH_APP=partner
bun run build
copy /Y android-config\partner\google-services.json android\app\google-services.json
npx cap sync android
npx cap open android
```

In Android Studio again: **Build → Generate App Bundles or APKs → Generate APKs**, then grab:

```
android\app\build\outputs\apk\debug\app-debug.apk
```

Rename it to `urbanwash-partner.apk`. Done — two APKs, distinct package IDs, distinct branding, same backend.

---

## 6. Update icons and splash (optional)

Branding sources live in `resources\`:

```
resources\customer\icon.png       1024×1024 — Customer launcher icon
resources\customer\splash.png     1920×1920 — Customer splash
resources\partner\icon.png        1024×1024 — Partner launcher icon
resources\partner\splash.png      1920×1920 — Partner splash
```

The fastest way to regenerate every Android density from those source files is the **`@capacitor/assets`** tool. After changing a source PNG:

```bat
bun add -d @capacitor/assets

set URBANWASH_APP=customer
npx capacitor-assets generate --android --assetPath resources\customer

set URBANWASH_APP=partner
npx capacitor-assets generate --android --assetPath resources\partner
```

This writes the correct `mipmap-*` icon variants and `drawable-*\splash.png` files into `android\app\src\main\res\`. Re-run `npx cap sync android` afterwards.

If you prefer a GUI: in Android Studio, right-click `app\src\main\res` → **New → Image Asset** → pick the source PNG → Next → Finish.

---

## 7. Signed release APKs (Play Store)

The debug APKs above are fine for the internal trial (sideload via USB / share link). For Play Store you need a signed release build:

1. In Android Studio: **Build → Generate Signed Bundle / APK → APK → Create new keystore** (save the `.jks` file somewhere safe — losing it means you cannot publish updates).
2. Pick **release** build variant, then **Finish**.
3. Output: `android\app\build\outputs\apk\release\app-release.apk`.

Repeat for each variant by switching `URBANWASH_APP` and re-syncing.

---

## 8. Troubleshooting

- **`npx cap sync` says "android platform has not been added"** → run `npx cap add android` once.
- **The wrong app opens after install** → check `android\app\build.gradle` shows the right `applicationId` (must match the variant) and re-run `npx cap sync android`.
- **Push notifications don't arrive** → verify `google-services.json` package name matches the APK's package id exactly, and that the Firebase service-account secrets are set in the Lovable backend.
- **Gradle sync fails on first open** → in Android Studio: **File → Sync Project with Gradle Files**, then **Build → Clean Project**, then **Rebuild Project**.
- **Need a fresh slate** → delete the `android\` folder and re-run the build commands; Capacitor will scaffold it again.

For deeper FCM / publishing notes see `docs/MOBILE.md`.
