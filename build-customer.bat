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
set "DEST_PKG_DIR=android\app\src\main\java\com\urbanwash\customer"
if not exist "%DEST_PKG_DIR%" (
    echo [2.0] Creating destination directory...
    mkdir "%DEST_PKG_DIR%" || (echo [FAIL] Could not create %DEST_PKG_DIR% & goto :fail)
)

echo [2.1] Applying Customer MainActivity...
set "SRC_ACTIVITY=android-native\java\com\urbanwash\customer\MainActivity.java"
set "DEST_ACTIVITY=%DEST_PKG_DIR%\MainActivity.java"

if not exist "%SRC_ACTIVITY%" (
    echo [FAIL] Source MainActivity not found: %SRC_ACTIVITY%
    goto :fail
)

copy /Y "%SRC_ACTIVITY%" "%DEST_ACTIVITY%" >nul
if errorlevel 1 (
    echo [FAIL] Customer MainActivity injection failed
    goto :fail
)
echo [PASS] Customer MainActivity injected

echo [2.2] Applying Payment Plugin...
set "PAYMENT_SRC=android-native\java\com\urbanwash\payments\UrbanWashCheckoutPlugin.java"
set "PAYMENT_DEST_DIR=android\app\src\main\java\com\urbanwash\payments"
set "PAYMENT_DEST=%PAYMENT_DEST_DIR%\UrbanWashCheckoutPlugin.java"

if not exist "%PAYMENT_DEST_DIR%" (
    mkdir "%PAYMENT_DEST_DIR%" || (echo [FAIL] Could not create %PAYMENT_DEST_DIR% & goto :fail)
)

if not exist "%PAYMENT_SRC%" (
    echo [FAIL] Source Payment Plugin not found: %PAYMENT_SRC%
    goto :fail
)

copy /Y "%PAYMENT_SRC%" "%PAYMENT_DEST%" >nul
if errorlevel 1 (
    echo [FAIL] Payment Plugin injection failed
    goto :fail
)
echo [PASS] Payment Plugin injected

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
