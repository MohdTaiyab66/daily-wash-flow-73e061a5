@echo off
echo ============================================================
echo  Urban Wash - Sequential Build (Customer & Partner)
echo ============================================================

call build-customer.bat
if errorlevel 1 exit /b 1

echo.
echo Starting Partner Build...
echo.

call build-partner.bat
if errorlevel 1 exit /b 1

echo.
echo ============================================================
echo  ALL BUILDS COMPLETE
echo.
echo  CUSTOMER APK:
echo  %CD%\urbanwash-customer.apk
echo  PACKAGE:
echo  com.urbanwash.customer
echo.
echo  PARTNER APK:
echo  %CD%\urbanwash-partner.apk
echo  PACKAGE:
echo  com.urbanwash.partner
echo ============================================================
exit /b 0
