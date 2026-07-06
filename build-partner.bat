@echo off
REM ============================================================
REM  Urban Wash - Partner APK one-click build (Windows)
REM ============================================================
setlocal EnableDelayedExpansion

set "VARIANT=partner"
set "APP_ID=com.urbanwash.partner"
set "GSJSON=android-config\partner\google-services.json"
set "PARTNER_APP_VERSION=1.0.27"
set "PARTNER_VERSION_CODE=27"
set "PARTNER_BUILD_ID=2026-07-04-01"

echo.
echo ============================================================
echo  Urban Wash - Building %VARIANT% APK (%APP_ID%)
echo  Partner version: %PARTNER_APP_VERSION% ^(%PARTNER_VERSION_CODE%^) / %PARTNER_BUILD_ID%
echo ============================================================
echo.

REM -- 1. Dependency checks -----------------------------------------------
echo [1/6] Verifying required tools...

where node >nul 2>&1
if errorlevel 1 (
  echo   [X] Node.js not found. Install Node 20+ from https://nodejs.org
  goto :fail
)
for /f "delims=" %%v in ('node -v') do echo   [OK] Node %%v

where bun >nul 2>&1
if errorlevel 1 (
  echo   [X] Bun not found. Install with: powershell -c "irm bun.sh/install.ps1 ^| iex"
  goto :fail
)
for /f "delims=" %%v in ('bun -v') do echo   [OK] Bun %%v

where java >nul 2>&1
if errorlevel 1 (
  echo   [X] Java JDK not found. Install JDK 17 from https://adoptium.net
  goto :fail
)
java -version 2>&1 | findstr /R "version" >nul && echo   [OK] Java present

if not defined ANDROID_HOME if not defined ANDROID_SDK_ROOT (
  echo   [X] ANDROID_HOME / ANDROID_SDK_ROOT not set.
  echo       Open Android Studio ^> SDK Manager, then set:
  echo         setx ANDROID_HOME "%%LOCALAPPDATA%%\Android\Sdk"
  echo       Re-open Command Prompt and re-run this script.
  goto :fail
)
if defined ANDROID_HOME (
  if not exist "%ANDROID_HOME%\platform-tools" (
    echo   [X] ANDROID_HOME is set but "%ANDROID_HOME%\platform-tools" is missing.
    echo       Install Android SDK Platform 34 + Build-Tools via Android Studio SDK Manager.
    goto :fail
  )
  echo   [OK] Android SDK at %ANDROID_HOME%
) else (
  echo   [OK] Android SDK at %ANDROID_SDK_ROOT%
)

REM -- 2. Firebase config -------------------------------------------------
echo.
echo [2/6] Checking Firebase config...
if not exist "%GSJSON%" (
  echo   [X] Missing %GSJSON%
  echo       Download google-services.json for Firebase Android app %APP_ID%
  echo       and place it at the path above. See BUILD.md section 3.
  goto :fail
)
echo   [OK] Found %GSJSON%

REM -- 3. Set variant env -------------------------------------------------
echo.
echo [3/6] Setting variant environment...
set "URBANWASH_APP=%VARIANT%"
set "VITE_URBANWASH_APP=%VARIANT%"
echo   URBANWASH_APP=%URBANWASH_APP%
echo   VITE_URBANWASH_APP=%VITE_URBANWASH_APP%

REM -- 4. Install deps (only if node_modules missing) --------------------
echo.
echo [4/6] Installing JS dependencies (if needed)...
if not exist "node_modules" (
  call bun install || goto :fail
) else (
  echo   [OK] node_modules present - skipping bun install
)

if not exist "node_modules\.bin\cap.cmd" (
  echo   Capacitor CLI missing from node_modules - refreshing dependencies...
  call bun install || goto :fail
)

if not exist "node_modules\.bin\cap.cmd" (
  echo   [X] Capacitor CLI still missing after bun install.
  echo       Run: bun add @capacitor/cli @capacitor/core @capacitor/android
  echo       Then re-run: build-partner.bat
  goto :fail
)

REM -- 5. Build web bundle + cap sync ------------------------------------
echo.
echo [5/6] Building web bundle...
echo   Source marker: public\build-info.json
type public\build-info.json || goto :fail
call bun run build || goto :fail

if not exist ".output\public\build-info.json" (
  echo   [X] Missing latest dist asset: .output\public\build-info.json
  goto :fail
)
echo   [OK] Latest dist asset present: .output\public\build-info.json
type .output\public\build-info.json || goto :fail

if not exist "android" (
  echo   android/ folder missing - running: npx cap add android
  call bunx cap add android || goto :fail
)

echo   Copying Firebase config into android\app\google-services.json
copy /Y "%GSJSON%" "android\app\google-services.json" >nul || goto :fail

echo   Syncing Capacitor...
call bunx cap sync android || goto :fail

if not exist "android\app\src\main\assets\public\build-info.json" (
  echo   [X] Capacitor did not copy latest web assets into Android.
  echo       Missing android\app\src\main\assets\public\build-info.json
  goto :fail
)
echo   [OK] Android asset copied from latest dist:
type android\app\src\main\assets\public\build-info.json || goto :fail

echo   Stamping Android version and verifying synced build marker...
call node scripts\stamp-android-version.mjs || goto :fail

echo   Patching Android permissions and Maps intents...
call node scripts\patch-android-manifest.mjs || goto :fail

REM -- 6. Build APK -------------------------------------------------------
echo.
echo [6/6] Building Android debug APK...
pushd android || goto :fail
echo   Gradle project: %CD%
call gradlew.bat assembleDebug || (popd & goto :fail)
popd

if not exist "android\app\build\outputs\apk\debug\app-debug.apk" (
  echo   [X] APK was not created at android\app\build\outputs\apk\debug\app-debug.apk
  goto :fail
)
copy /Y "android\app\build\outputs\apk\debug\app-debug.apk" "urbanwash-partner.apk" >nul || goto :fail
for %%A in ("urbanwash-partner.apk") do echo   [OK] Fresh APK copied: %%~fA ^(%%~zA bytes^)

echo.
echo ============================================================
echo  APK build complete for %VARIANT% (%APP_ID%)
echo  Version visible in app: Partner Build v%PARTNER_APP_VERSION% / %PARTNER_BUILD_ID%
echo ============================================================
echo.
echo  APK ready:
echo    urbanwash-partner.apk
echo    android\app\build\outputs\apk\debug\app-debug.apk
echo.
echo  Install on device:
echo    adb install -r urbanwash-partner.apk
echo.
endlocal
exit /b 0

:fail
echo.
echo ============================================================
echo  BUILD FAILED - see message above.
echo ============================================================
endlocal
exit /b 1
