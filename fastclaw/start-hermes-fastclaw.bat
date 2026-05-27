@echo off
setlocal

set "FASTCLAW_ROOT=%~dp0"
set "PROJECT_ROOT=%FASTCLAW_ROOT%.."

REM Force Go HTTP client to use HTTP/1.1.
REM On Tailscale + some OpenAI-compatible gateways (e.g. xfyun maas-coding-api),
REM Go's default HTTP/2 handshake hangs at "timeout awaiting response headers".
REM Falling back to h1 makes the calls go through. See net/http GODEBUG docs.
set "GODEBUG=http2client=0"

REM Pull selected env from backend\.env via a PowerShell helper. The helper writes
REM ASCII KEY=VALUE lines to a temp file so the bat-side `for /f` cannot trip
REM over UTF-8 / Chinese comments. Explicit shell env still wins.
set "FASTCLAW_ENV_TMP=%TEMP%\hermes-fastclaw-env.tmp"
if exist "%PROJECT_ROOT%\backend\.env" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%FASTCLAW_ROOT%scripts\extract-env.ps1" -EnvFile "%PROJECT_ROOT%\backend\.env" -OutFile "%FASTCLAW_ENV_TMP%" >nul
  if exist "%FASTCLAW_ENV_TMP%" (
    for /f "usebackq tokens=1,* delims==" %%A in ("%FASTCLAW_ENV_TMP%") do (
      if not defined %%A set "%%A=%%B"
    )
    del "%FASTCLAW_ENV_TMP%"
  )
)

if not defined AGENT_MODEL set "AGENT_MODEL=gpt-4o-mini"

cd /d "%FASTCLAW_ROOT%"
go run .\cmd\hermes-fastclaw\ -config .\config\hermes-agents.json -bind 127.0.0.1 -port 18953
