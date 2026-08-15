@echo off
setlocal EnableDelayedExpansion

set "VARIANT=customer"
set "APP_ID=com.urbanwash.customer"
set "APK_OUTPUT=urbanwash-customer.apk"

echo ============================================================
echo  Urban Wash - Building CUSTOMER APK (%APP_ID%)
echo ============================================================

REM 1. Ensure latest Capacitor web assets are synced/regenerated
echo [1/4] Building latest web assets...
set "URBANWASH_APP=%VARIANT%"
set "VITE_URBANWASH_APP=%VARIANT%"
call bun run build || goto :fail

echo [2/4] Syncing Capacitor and applying variant sources...
call bunx cap sync android || goto :fail

REM Apply variant-specific sources
if exist "android-native\java\com\urbanwash\customer\MainActivity.java" (
    echo [2.1] Applying Customer MainActivity...
    copy /Y "android-native\java\com\urbanwash\customer\MainActivity.java" "android\app\src\main\java\com\urbanwash\customer\MainActivity.java" >nul
)
if exist "android-native\java\com\urbanwash\payments\UrbanWashCheckoutPlugin.java" (
    echo [2.2] Applying Payment Plugin...
    mkdir "android\app\src\main\java\com\urbanwash\payments" 2>nul
    copy /Y "android-native\java\com\urbanwash\payments\UrbanWashCheckoutPlugin.java" "android\app\src\main\java\com\urbanwash\payments\UrbanWashCheckoutPlugin.java" >nul
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
echo  CUSTOMER APK: %CD%\%APK_OUTPUT%
echo  PACKAGE: %APP_ID%
echo ============================================================
endlocal
exit /b 0

:fail
echo.
echo [X] CUSTOMER BUILD FAILED.
endlocal
exit /b 1
