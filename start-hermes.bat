@echo off
REM ============================================================
REM  Hermes / Warmth Connect Portal - start all 3 services
REM
REM  Each service runs in its OWN console window (start cmd /k),
REM  so it is NOT a child of this script. Closing this window
REM  (or Claude) does NOT kill them. To stop one: close its
REM  window, or press Ctrl+C inside it. Or run stop-hermes.bat.
REM
REM  Ports: frontend 5173 / backend 8787 / FastClaw 18953
REM ============================================================
setlocal
set "ROOT=%~dp0"
set "FASTCLAW_HOME=C:\Users\AORUS\.fastclaw"
set "FASTCLAW_BIN=%ROOT%fastclaw\.upgrade\fastclaw.exe"

echo ============================================================
echo  Hermes local launcher
echo  ROOT = %ROOT%
echo ============================================================

REM ---------- 1. FastClaw gateway (official v0.45.0) ----------
echo [*] Starting FastClaw gateway :18953 ...
if not exist "%FASTCLAW_BIN%" (
    echo     [!] not found: %FASTCLAW_BIN%
    echo         skipping FastClaw - put the official binary there first.
) else (
    REM FASTCLAW_ALLOW_HOST_EXEC=true: enable the host_exec escape hatch so the
    REM agent can run shell commands directly on the Windows host when the Docker
    REM sandbox is unavailable (no Docker Desktop). Without this the default docker
    REM backend fails and all exec (curl/python/ssh) tool calls die.
    start "Hermes FastClaw 18953" cmd /k "set FASTCLAW_HOME=%FASTCLAW_HOME%&& set FASTCLAW_PORT=18953&& set FASTCLAW_ALLOW_HOST_EXEC=true&& "%FASTCLAW_BIN%" gateway --port 18953"
)

REM ---------- 2. Backend (Hono + tsx watch) ----------
echo [*] Starting backend :8787 ...
if not exist "%ROOT%backend\.env" (
    echo     [!] backend\.env missing - copy from .env.example and configure.
)
start "Hermes Backend 8787" cmd /k "cd /d "%ROOT%backend" && npm run dev"

REM ---------- 3. Frontend (Vite) ----------
echo [*] Starting frontend :5173 ...
start "Hermes Frontend 5173" cmd /k "cd /d "%ROOT%fronted" && npx vite dev --port 5173"

echo.
echo [OK] All three services launched in their own windows.
echo      frontend  http://localhost:5173
echo      backend   http://localhost:8787/health
echo      gateway   http://127.0.0.1:18953/healthz
echo.
echo  You can close THIS window - it does not affect the services.
echo ============================================================
endlocal
