@echo off
setlocal EnableDelayedExpansion

set "VARIANT=partner"
set "APP_ID=com.urbanwash.partner"
set "APK_OUTPUT=urbanwash-partner.apk"

echo ============================================================
echo  Urban Wash - Building PARTNER APK (%APP_ID%)
echo ============================================================

REM 1. Ensure latest Capacitor web assets are synced/regenerated
echo [1/4] Building latest web assets...
set "URBANWASH_APP=%VARIANT%"
set "VITE_URBANWASH_APP=%VARIANT%"
call bun run build || goto :fail

echo [2/4] Syncing Capacitor and applying variant sources...
call bunx cap sync android || goto :fail

REM Apply variant-specific sources (Clean old variant sources)
if exist "android\app\src\main\java\com\urbanwash\payments" rd /S /Q "android\app\src\main\java\com\urbanwash\payments"

if exist "android-native\java\com\urbanwash\partner\MainActivity.java" (
    echo [2.1] Applying Partner MainActivity...
    copy /Y "android-native\java\com\urbanwash\partner\MainActivity.java" "android\app\src\main\java\com\urbanwash\partner\MainActivity.java" >nul
)

REM 2. Build APK
echo [3/4] Building APK...
pushd android || goto :fail
call gradlew.bat clean assembleDebug -PURBANWASH_APP=%VARIANT% || (popd & goto :fail)
popd

REM 3. Verify Package ID and Replace Official APK
echo [4/4] Verifying APK and updating official output...
set "BUILT_APK=android\app\build\outputs\apk\debug\app-debug.apk"
if not exist "%BUILT_APK%" (
    echo [X] Build failed: APK not found at %BUILT_APK%
    goto :fail
)

REM Use verify-apk-native.mjs if it exists, otherwise do a basic check
if exist "scripts\verify-apk-native.mjs" (
    call node scripts\verify-apk-native.mjs "%BUILT_APK%" || goto :fail
)

copy /Y "%BUILT_APK%" "%APK_OUTPUT%" >nul || goto :fail

echo ============================================================
echo  PARTNER APK: %CD%\%APK_OUTPUT%
echo  PACKAGE: %APP_ID%
echo ============================================================
endlocal
exit /b 0

:fail
echo.
echo [X] PARTNER BUILD FAILED.
endlocal
exit /b 1
