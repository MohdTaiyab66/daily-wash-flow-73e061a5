@echo off
REM ============================================================
REM  Urban Wash - Customer APK one-click build (Windows)
REM ============================================================
setlocal EnableDelayedExpansion

set "VARIANT=customer"
set "APP_ID=com.urbanwash.customer"
set "GSJSON=android-config\customer\google-services.json"
set "CAP_CLI=node_modules\@capacitor\cli\bin\capacitor"

echo.
echo ============================================================
echo  Urban Wash - Building %VARIANT% APK (%APP_ID%)
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

if not exist "%CAP_CLI%" (
  echo   Capacitor CLI missing from node_modules - refreshing dependencies...
  call bun install || goto :fail
)

if not exist "%CAP_CLI%" (
  echo   [X] Capacitor CLI still missing after bun install.
  echo       Run: bun add @capacitor/cli @capacitor/core @capacitor/android
  echo       Then re-run: build-customer.bat
  goto :fail
)

REM -- 5. Build web bundle + cap sync ------------------------------------
echo.
echo [5/6] Building web bundle...
call bun run build || goto :fail

echo   Preparing mobile web shell (Capacitor webDir)...
call node scripts\prepare-mobile-shell.mjs || goto :fail

if not exist "mobile-shell\index.html" (
  echo   [X] Missing mobile-shell\index.html after prepare-mobile-shell
  goto :fail
)
if not exist "mobile-shell\build-info.json" (
  echo   [X] Missing mobile-shell\build-info.json after prepare-mobile-shell
  goto :fail
)
echo   [OK] Capacitor webDir ready: mobile-shell\index.html



if not exist "android" (
  echo   android/ folder missing - running: Capacitor add android
  call node "%CAP_CLI%" add android || goto :fail
)

echo   Copying Firebase config into android\app\google-services.json
copy /Y "%GSJSON%" "android\app\google-services.json" >nul || goto :fail

echo   Syncing Capacitor with local CLI (no npx/npm)...
echo     node "%CAP_CLI%" sync android
call node "%CAP_CLI%" sync android
if errorlevel 1 (
  echo.
  echo   [X] Capacitor sync failed.
  echo       If the message above says "npm error could not determine executable to run",
  echo       your local build-customer.bat is still using npx. Replace that line with:
  echo         call node "%%CAP_CLI%%" sync android ^|^| goto :fail
  goto :fail
)

echo   Patching Android permissions and Maps intents...
call node scripts\patch-android-manifest.mjs || goto :fail

REM -- 6. Build APK -------------------------------------------------------
echo.
echo [6/6] Building Android debug APK...
pushd android || goto :fail
call gradlew.bat assembleDebug || (popd & goto :fail)
popd

if not exist "android\app\build\outputs\apk\debug\app-debug.apk" (
  echo   [X] APK was not created at android\app\build\outputs\apk\debug\app-debug.apk
  goto :fail
)
copy /Y "android\app\build\outputs\apk\debug\app-debug.apk" "urbanwash-customer.apk" >nul || goto :fail

echo.
echo ============================================================
echo  APK build complete for %VARIANT% (%APP_ID%)
echo ============================================================
echo.
echo  APK ready:
echo    urbanwash-customer.apk
echo    android\app\build\outputs\apk\debug\app-debug.apk
echo.
echo  Install on device:
echo    adb install -r urbanwash-customer.apk
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
