@echo off
REM ============================================================
REM  Urban Wash - Partner APK one-click build (Windows)
REM ============================================================
setlocal EnableDelayedExpansion

set "VARIANT=partner"
set "APP_ID=com.urbanwash.partner"
set "GSJSON=android-config\partner\google-services.json"
set "PARTNER_APP_VERSION=1.0.28"
set "PARTNER_VERSION_CODE=28"
set "PARTNER_BUILD_ID=2026-07-04-02"
set "CAP_CLI=node_modules\@capacitor\cli\bin\capacitor"

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
  echo   [X] Java JDK not found. Install JDK 21 from https://adoptium.net
  goto :fail
)
java -version 2>&1 | findstr /R "version" >nul && echo   [OK] Java present

for /f "tokens=2 delims==" %%v in ('java -XshowSettings:properties -version 2^>^&1 ^| findstr /C:"java.specification.version"') do set "JAVA_VERSION=%%v"
for /f "tokens=*" %%v in ("%JAVA_VERSION%") do set "JAVA_VERSION=%%v"
for /f "tokens=1 delims=." %%m in ("%JAVA_VERSION%") do set "JAVA_MAJOR=%%m"
for /f "tokens=2 delims==" %%v in ('java -XshowSettings:properties -version 2^>^&1 ^| findstr /C:"java.home"') do set "DETECTED_JAVA_HOME=%%v"
for /f "tokens=*" %%v in ("%DETECTED_JAVA_HOME%") do set "DETECTED_JAVA_HOME=%%v"
if not defined JAVA_MAJOR (
  echo   [X] Could not detect Java version. Install JDK 21 from https://adoptium.net
  goto :fail
)
if %JAVA_MAJOR% LSS 21 (
  echo   [X] Java %JAVA_VERSION% found, but Android build requires JDK 21+.
  echo       Install Temurin JDK 21, then set JAVA_HOME to the JDK 21 folder.
  goto :fail
)
echo   [OK] Java JDK %JAVA_VERSION%

REM Gradle uses JAVA_HOME before PATH. If JAVA_HOME points at an older JDK,
REM Gradle fails later with: "invalid source release: 21". Force this build
REM to use the same JDK 21+ that the java command above resolved.
if not defined DETECTED_JAVA_HOME (
  echo   [X] Could not detect java.home for Gradle. Reinstall JDK 21 and retry.
  goto :fail
)
if not exist "%DETECTED_JAVA_HOME%\bin\javac.exe" (
  echo   [X] Java on PATH is not a full JDK: %DETECTED_JAVA_HOME%
  echo       Install Temurin JDK 21, then re-run this script.
  goto :fail
)
if defined JAVA_HOME (
  if /I not "%JAVA_HOME%"=="%DETECTED_JAVA_HOME%" (
    echo   [!] JAVA_HOME was %JAVA_HOME%
    echo       Using JDK 21 for this build: %DETECTED_JAVA_HOME%
  )
) else (
  echo   [OK] JAVA_HOME not set - using detected JDK: %DETECTED_JAVA_HOME%
)
set "JAVA_HOME=%DETECTED_JAVA_HOME%"
set "PATH=%JAVA_HOME%\bin;%PATH%"

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
set "CAP_SERVER_URL=https://daily-wash-flow.lovable.app/auth"
echo   URBANWASH_APP=%URBANWASH_APP%
echo   VITE_URBANWASH_APP=%VITE_URBANWASH_APP%
echo   CAP_SERVER_URL=%CAP_SERVER_URL%

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
  echo       Then re-run: build-partner.bat
  goto :fail
)

REM -- 5. Build web bundle + cap sync ------------------------------------
echo.
echo [5/6] Building web bundle...
echo   Source marker: public\build-info.json
type public\build-info.json || goto :fail
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
findstr /C:"https://daily-wash-flow.lovable.app/auth" "mobile-shell\index.html" >nul || (
  echo   [X] mobile-shell\index.html does not point to the Partner login URL.
  goto :fail
)
findstr /C:"var url =" "mobile-shell\index.html" >nul || (
  echo   [X] mobile-shell\index.html was not regenerated correctly.
  goto :fail
)
if not exist ".output\public\build-info.json" (
  echo   [X] Missing latest dist asset: .output\public\build-info.json
  goto :fail
)
echo   [OK] Latest dist asset present: .output\public\build-info.json
type .output\public\build-info.json || goto :fail
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
  echo       your local build-partner.bat is still using npx. Replace that line with:
  echo         call node "%%CAP_CLI%%" sync android ^|^| goto :fail
  goto :fail
)

if not exist "android\app\src\main\assets\capacitor.config.json" (
  echo   [X] Missing synced Android Capacitor config.
  goto :fail
)
findstr /C:"https://daily-wash-flow.lovable.app/auth" "android\app\src\main\assets\capacitor.config.json" >nul || (
  echo   [X] Synced Capacitor config is missing the Partner login server.url.
  echo       Delete the android folder, re-run this script, and do not continue with this APK.
  type android\app\src\main\assets\capacitor.config.json
  goto :fail
)
findstr /C:"https://daily-wash-flow.lovable.app/auth" "android\app\src\main\assets\public\index.html" >nul || (
  echo   [X] Synced Android fallback shell is stale or broken.
  goto :fail
)

if not exist "android\app\src\main\assets\public\build-info.json" if not exist "android\app\src\main\assets\build-info.json" (
  echo   [X] Capacitor did not copy latest web assets into Android.
  echo       Missing android\app\src\main\assets\build-info.json
  goto :fail
)
echo   [OK] Android asset copied from latest dist:
if exist "android\app\src\main\assets\public\build-info.json" (
  type android\app\src\main\assets\public\build-info.json || goto :fail
) else (
  type android\app\src\main\assets\build-info.json || goto :fail
)

echo   Stamping Android version and verifying synced build marker...
call node scripts\stamp-android-version.mjs || goto :fail

echo   Patching Android permissions and Maps intents...
call node scripts\patch-android-manifest.mjs || goto :fail

echo   Pinning Gradle to detected JDK 21...
call node scripts\configure-gradle-jdk.mjs || goto :fail

REM -- 6. Build APK -------------------------------------------------------
echo.
echo [6/6] Building Android debug APK...
pushd android || goto :fail
echo   Stopping stale Gradle daemons...
call gradlew.bat --stop >nul 2>&1
echo   Gradle project: %CD%
echo   Gradle JVM check:
call gradlew.bat -version || (popd & goto :fail)
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
