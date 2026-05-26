@echo off
setlocal

set "FASTCLAW_ROOT=%~dp0"
set "PROJECT_ROOT=%FASTCLAW_ROOT%.."

REM Reuse backend local LLM/FastClaw env when present. Explicit shell env wins.
if exist "%PROJECT_ROOT%\backend\.env" (
  for /f "usebackq tokens=1,* delims==" %%A in ("%PROJECT_ROOT%\backend\.env") do (
    if not defined AGENT_API_KEY if "%%A"=="LLM_API_KEY" set "AGENT_API_KEY=%%B"
    if not defined AGENT_API_BASE if "%%A"=="LLM_API_BASE_URL" set "AGENT_API_BASE=%%B"
    if not defined AGENT_MODEL if "%%A"=="LLM_CHAT_MODEL" set "AGENT_MODEL=%%B"
    if not defined FASTCLAW_API_KEY if "%%A"=="FASTCLAW_API_KEY" set "FASTCLAW_API_KEY=%%B"
  )
)

if not defined AGENT_MODEL set "AGENT_MODEL=gpt-4o-mini"

cd /d "%FASTCLAW_ROOT%"
go run .\cmd\hermes-fastclaw\ -config .\config\hermes-agents.json -bind 127.0.0.1 -port 18953
