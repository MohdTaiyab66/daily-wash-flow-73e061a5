@echo off
REM ============================================================
REM  Urban Wash - Android Java compatibility repair
REM ============================================================
setlocal

set "CAP_GRADLE=node_modules\@capacitor\android\capacitor\build.gradle"

echo.
echo ============================================================
echo  Urban Wash - Fixing Android Java compatibility
echo ============================================================
echo.

if not exist "%CAP_GRADLE%" (
  echo [X] Missing %CAP_GRADLE%
  echo     Run bun install first, then run fix-android-java.bat again.
  endlocal
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$p='%CAP_GRADLE%'; $s=Get-Content -Raw $p; $s=$s -replace 'JavaVersion\.VERSION_21','JavaVersion.VERSION_17'; Set-Content -NoNewline -Path $p -Value $s"
if errorlevel 1 (
  echo [X] Failed to patch %CAP_GRADLE%
  endlocal
  exit /b 1
)

findstr /C:"JavaVersion.VERSION_17" "%CAP_GRADLE%" >nul || (
  echo [X] Patch did not apply. Open %CAP_GRADLE% and replace VERSION_21 with VERSION_17 manually.
  endlocal
  exit /b 1
)

findstr /C:"JavaVersion.VERSION_21" "%CAP_GRADLE%" >nul && (
  echo [X] Patch incomplete. %CAP_GRADLE% still contains VERSION_21.
  endlocal
  exit /b 1
)

echo [OK] Capacitor Android Java level is now VERSION_17
echo.
echo Next command:
echo   build-partner.bat
echo.
endlocal
exit /b 0
