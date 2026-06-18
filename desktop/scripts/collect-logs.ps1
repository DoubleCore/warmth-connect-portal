# Copy runtime logs the installed app wrote to %APPDATA%\HermesAI\logs into the
# repo's logs\runtime so each cycle's diagnostics are captured for inspection.
$ErrorActionPreference = "Continue"

$AppDataLogDir = Join-Path $env:APPDATA "HermesAI\logs"
$TargetLogDir = Join-Path $PSScriptRoot "..\logs\runtime"

if (-not (Test-Path $TargetLogDir)) {
    New-Item -ItemType Directory -Path $TargetLogDir -Force | Out-Null
}

if (Test-Path $AppDataLogDir) {
    Copy-Item "$AppDataLogDir\*" $TargetLogDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "[logs] runtime logs copied to $TargetLogDir"
    Get-ChildItem $TargetLogDir -ErrorAction SilentlyContinue | ForEach-Object {
        Write-Host "       $($_.Name)  ($($_.Length) bytes)"
    }
} else {
    Write-Warning "[logs] runtime log dir not found: $AppDataLogDir"
}
