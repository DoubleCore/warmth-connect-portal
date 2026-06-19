# Kill leftover Hermes desktop processes so re-installs / re-runs start clean.
#
# We must NOT blindly kill every node.exe (the dev environment / Claude tooling
# uses node too). Instead we target:
#   - HermesAI.exe          the Electron shell
#   - fastclaw.exe          the agent gateway
#   - node.exe processes whose command line points at our staged/installed
#     backend or frontend entry (dist\server.js / frontend-server.mjs).
$ErrorActionPreference = "Continue"

function Kill-ByName($name) {
    Get-Process -Name $name -ErrorAction SilentlyContinue | ForEach-Object {
        Write-Host "[kill] $($_.ProcessName) pid=$($_.Id)"
        try { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue } catch {}
    }
}

Kill-ByName "HermesAI"
Kill-ByName "fastclaw"

# Orphaned dev-mode Electron instances (run via `electron .` against staged
# resources) share the same single-instance lock as the installed app — if they
# linger they make the next launch quit with gotLock=false. Kill any electron.exe
# spawned from this project's node_modules.
try {
    $electrons = Get-CimInstance Win32_Process -Filter "Name = 'electron.exe'" -ErrorAction SilentlyContinue
    foreach ($e in $electrons) {
        if ($e.ExecutablePath -and $e.ExecutablePath -match "node_modules\\electron") {
            Write-Host "[kill] electron pid=$($e.ProcessId) :: $($e.ExecutablePath)"
            try { Stop-Process -Id $e.ProcessId -Force -ErrorAction SilentlyContinue } catch {}
        }
    }
} catch {
    Write-Host "[kill] electron scan skipped: $($_.Exception.Message)"
}

# Targeted node.exe cleanup via command-line match.
try {
    $procs = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue
    foreach ($p in $procs) {
        $cl = $p.CommandLine
        if ($cl -and ($cl -match "dist\\server\.js" -or $cl -match "frontend-server\.mjs" -or $cl -match "dist\\db\\migrate\.js")) {
            Write-Host "[kill] node pid=$($p.ProcessId) :: $cl"
            try { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue } catch {}
        }
    }
} catch {
    Write-Host "[kill] node command-line scan skipped: $($_.Exception.Message)"
}

Write-Host "[kill] done."
