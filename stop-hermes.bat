@echo off
REM ============================================================
REM  Hermes / Warmth Connect Portal - stop all services
REM  Kills by port: frontend 5173 / backend 8787 / FastClaw 18953
REM ============================================================
setlocal enabledelayedexpansion

echo [*] Stopping Hermes services ...
for %%P in (5173 8787 18953) do (
    set "FOUND="
    for /f "tokens=5" %%A in ('netstat -ano ^| findstr ":%%P " ^| findstr LISTENING') do (
        set "FOUND=1"
        echo     port %%P -^> PID %%A, killing...
        taskkill /F /PID %%A >nul 2>&1
    )
    if not defined FOUND echo     port %%P not listening.
)
echo [OK] Done.
endlocal
