@echo off
setlocal

echo ============================
echo   Sore Chat setup
echo ============================
echo.

if exist "%~dp0desktop\node_modules" (
    echo [desktop] already installed, skipping
) else (
    echo [desktop] installing...
    cd /d "%~dp0desktop"
    call npm install
)
echo.

if exist "%~dp0mobile\node_modules" (
    echo [mobile] already installed, skipping
) else (
    echo [mobile] installing...
    cd /d "%~dp0mobile"
    call npm install
)
echo.

if exist "%~dp0backend\functions\node_modules" (
    echo [backend functions] already installed, skipping
) else (
    echo [backend functions] installing...
    cd /d "%~dp0backend\functions"
    call npm install
)
echo.

cd /d "%~dp0"
echo ============================
echo   Done. All set up.
echo ============================
pause
