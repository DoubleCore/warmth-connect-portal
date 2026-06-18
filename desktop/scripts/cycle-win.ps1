# ============================================================================
# Hermes AI desktop — full engineering cycle:
#   build -> package(NSIS) -> silent install -> launch -> smoke -> stop ->
#   collect logs -> uninstall.
# Adapted from WINDOWS_PACKAGING_ENGINEERING_LOOP_v0.1.md to the real 3-runtime
# architecture (Electron shell + Node backend + Node SSR frontend + FastClaw).
# ============================================================================
$ErrorActionPreference = "Stop"

$AppName        = "HermesAI"
$DesktopDir     = Split-Path -Parent $PSScriptRoot
$TestInstallDir = "C:\Temp\HermesAI-E2E"
$ReleaseDir     = Join-Path $DesktopDir "release"
$LogDir         = Join-Path $DesktopDir "logs"

Push-Location $DesktopDir
try {
    Write-Host "==== 0. Kill old processes ===="
    powershell -ExecutionPolicy Bypass -File "$PSScriptRoot\kill-app.ps1"

    Write-Host "==== 1. Clean old test install + release ===="
    if (Test-Path $TestInstallDir) { Remove-Item $TestInstallDir -Recurse -Force }
    # release\ can briefly stay locked by AV scanners / blockmap handles right
    # after a build. Retry a few times before giving up.
    if (Test-Path $ReleaseDir) {
        for ($r = 1; $r -le 8; $r++) {
            try {
                Remove-Item $ReleaseDir -Recurse -Force -ErrorAction Stop
                break
            } catch {
                if ($r -eq 8) { throw "release dir stayed locked after 8 retries: $($_.Exception.Message)" }
                Write-Host "  release locked (attempt $r), retrying in 2s..."
                Start-Sleep -Seconds 2
            }
        }
    }
    if (-not (Test-Path $LogDir))  { New-Item -ItemType Directory -Path $LogDir | Out-Null }

    Write-Host "==== 2. Prepare resources (build all 3 runtimes + bundle node) ===="
    npm run prepare:resources
    if ($LASTEXITCODE -ne 0) { throw "prepare:resources failed" }

    Write-Host "==== 3. Build NSIS installer ===="
    npm run build:win
    if ($LASTEXITCODE -ne 0) { throw "build:win failed" }

    Write-Host "==== 4. Find installer ===="
    $Installer = Get-ChildItem $ReleaseDir -Filter "*.exe" |
        Where-Object { $_.Name -match "Setup" -or $_.Name -match $AppName } |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $Installer) { throw "No NSIS installer found in $ReleaseDir" }
    Write-Host "Installer: $($Installer.FullName)"

    Write-Host "==== 5. Silent install to $TestInstallDir ===="
    # NSIS assisted installer detaches; wait for its process to actually exit so
    # the large extraResources (node.exe ~84MB, fastclaw ~43MB) finish copying
    # before we validate. -Wait on the spawned process is unreliable for the NSIS
    # elevate relaunch, so we also poll for the last/largest staged file.
    $installProc = Start-Process -FilePath $Installer.FullName -ArgumentList @("/S", "/D=$TestInstallDir") -PassThru
    try { $installProc | Wait-Process -Timeout 180 -ErrorAction SilentlyContinue } catch {}

    $ExePath  = Join-Path $TestInstallDir "$AppName.exe"
    $NodePath = Join-Path $TestInstallDir "resources\node\node.exe"
    Write-Host "  waiting for install to settle (exe + bundled node, size-stable)..."
    $lastSize = -1
    for ($i = 0; $i -lt 120; $i++) {
        if ((Test-Path $ExePath) -and (Test-Path $NodePath)) {
            $sz = (Get-Item $NodePath).Length
            if ($sz -gt 0 -and $sz -eq $lastSize) { Write-Host "  install settled after $i s"; break }
            $lastSize = $sz
        }
        Start-Sleep -Seconds 1
    }

    Write-Host "==== 6. Validate installed files ===="
    $checks = @{
        "App exe"          = $ExePath
        "Bundled node"     = (Join-Path $TestInstallDir "resources\node\node.exe")
        "Backend server"   = (Join-Path $TestInstallDir "resources\backend\dist\server.js")
        "Backend sqlite"   = (Join-Path $TestInstallDir "resources\backend\node_modules\better-sqlite3\build\Release\better_sqlite3.node")
        "Backend migrations" = (Join-Path $TestInstallDir "resources\backend\dist\db\migrations")
        "Frontend server"  = (Join-Path $TestInstallDir "resources\frontend\frontend-server.mjs")
        "Frontend dist"    = (Join-Path $TestInstallDir "resources\frontend\dist\server\server.js")
    }
    foreach ($k in $checks.Keys) {
        if (-not (Test-Path $checks[$k])) { throw "Missing [$k]: $($checks[$k])" }
        Write-Host "  OK  $k -> $($checks[$k])"
    }
    # FastClaw is optional.
    $fc = Join-Path $TestInstallDir "resources\fastclaw\fastclaw.exe"
    if (Test-Path $fc) { Write-Host "  OK  FastClaw -> $fc" } else { Write-Warning "  FastClaw binary absent (non-fatal)" }

    Write-Host "==== 7. Launch installed app ===="
    $proc = Start-Process $ExePath -PassThru
    Write-Host "Launched pid=$($proc.Id)"

    Write-Host "==== 8. Smoke check ===="
    powershell -ExecutionPolicy Bypass -File "$PSScriptRoot\smoke-check.ps1"
    if ($LASTEXITCODE -ne 0) { throw "smoke-check failed" }

    Write-Host "==== 9. Stop app ===="
    powershell -ExecutionPolicy Bypass -File "$PSScriptRoot\kill-app.ps1"
    Start-Sleep -Seconds 2

    Write-Host "==== 10. Verify no orphan processes ===="
    $orphans = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match "dist\\server\.js" -or $_.CommandLine -match "frontend-server\.mjs" }
    if ($orphans) {
        $orphans | ForEach-Object { Write-Warning "Orphan node pid=$($_.ProcessId): $($_.CommandLine)" }
        throw "Backend/frontend processes lingered after shutdown"
    }
    Write-Host "  OK  no orphan backend/frontend node processes"

    Write-Host "==== 11. Collect logs ===="
    powershell -ExecutionPolicy Bypass -File "$PSScriptRoot\collect-logs.ps1"

    Write-Host "==== 12. Uninstall ===="
    $Uninstaller = Get-ChildItem $TestInstallDir -Filter "Uninstall*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($Uninstaller) {
        & $Uninstaller.FullName /S
        Start-Sleep -Seconds 4
        Write-Host "  Uninstaller ran: $($Uninstaller.Name)"
    } else {
        Write-Warning "  Uninstaller not found in $TestInstallDir"
    }

    Write-Host ""
    Write-Host "==== CYCLE PASSED ====" -ForegroundColor Green
}
finally {
    Pop-Location
}
