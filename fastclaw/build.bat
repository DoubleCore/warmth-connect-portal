@echo off
REM Build script for hermes-fastclaw multi-agent server
REM Usage: build.bat [windows|linux|all]

if not exist dist mkdir dist

if "%1"=="" goto all
if "%1"=="windows" goto windows
if "%1"=="linux" goto linux
if "%1"=="all" goto all
echo Unknown target: %1
echo Usage: build.bat [windows^|linux^|all]
exit /b 1

:windows
echo Building for Windows (amd64)...
set CGO_ENABLED=0
set GOOS=windows
set GOARCH=amd64
go build -ldflags "-s -w" -o dist\hermes-fastclaw.exe .\cmd\hermes-fastclaw\
if %errorlevel% neq 0 exit /b %errorlevel%
echo   -^> dist\hermes-fastclaw.exe
goto done

:linux
echo Building for Linux (amd64)...
set CGO_ENABLED=0
set GOOS=linux
set GOARCH=amd64
go build -ldflags "-s -w" -o dist\hermes-fastclaw-linux-amd64 .\cmd\hermes-fastclaw\
if %errorlevel% neq 0 exit /b %errorlevel%
echo   -^> dist\hermes-fastclaw-linux-amd64
goto done

:all
echo Building all platforms...
echo.

echo [1/3] Windows amd64
set CGO_ENABLED=0
set GOOS=windows
set GOARCH=amd64
go build -ldflags "-s -w" -o dist\hermes-fastclaw.exe .\cmd\hermes-fastclaw\
if %errorlevel% neq 0 exit /b %errorlevel%

echo [2/3] Linux amd64
set GOOS=linux
set GOARCH=amd64
go build -ldflags "-s -w" -o dist\hermes-fastclaw-linux-amd64 .\cmd\hermes-fastclaw\
if %errorlevel% neq 0 exit /b %errorlevel%

echo [3/3] Linux arm64
set GOOS=linux
set GOARCH=arm64
go build -ldflags "-s -w" -o dist\hermes-fastclaw-linux-arm64 .\cmd\hermes-fastclaw\
if %errorlevel% neq 0 exit /b %errorlevel%

echo.
echo Build complete:
dir /b dist\

:done
