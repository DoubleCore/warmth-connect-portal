@echo off
REM ============================================================
REM  Warmth Connect Portal - 启动器
REM  双击运行，Ctrl+C 停止
REM ============================================================

title Warmth Connect Portal

REM 加载 .env
if exist "%~dp0.env" (
    for /f "usebackq tokens=1,* delims==" %%a in ("%~dp0.env") do (
        set "%%a=%%b"
    )
)

REM 启动 Agent Runtime (后台)
echo [*] Starting Agent Runtime on port 18953...
start /b "" "%~dp0agentruntime.exe" ^
    -port 18953 ^
    -bind 127.0.0.1 ^
    -model "%AGENT_MODEL%" ^
    -api-key "%AGENT_API_KEY%" ^
    -api-base "%AGENT_API_BASE%" ^
    -home "%~dp0agents\paper-deployer" ^
    -workspace "%~dp0workspace" ^
    -auth-token "%FASTCLAW_API_KEY%"

REM 等待 Agent Runtime 启动
timeout /t 2 /nobreak >nul

REM 启动后端服务器
echo [*] Starting Portal Server on port %PORT%...
echo.
echo ============================================================
echo   Portal:  http://localhost:%PORT%
echo   Agent:   http://localhost:18953/health
echo ============================================================
echo.
echo Press Ctrl+C to stop.
echo.

cd /d "%~dp0server"
node server.js
