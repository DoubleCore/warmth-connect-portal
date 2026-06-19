# Smoke test — validates the installed app's backend is alive.
# The desktop backend listens on 8787 (see electron/main.js BACKEND_PORT).
$ErrorActionPreference = "Stop"

$HealthUrl = "http://127.0.0.1:8787/health"
$FrontendUrl = "http://127.0.0.1:15173/"
$MaxRetry = 40
$BackendOk = $false
$FrontendOk = $false

# Guard against a false pass: 8787 is shared with the dev backend. If the
# packaged app quit at its port-in-use preflight but a dev backend is answering
# 8787, the health probe below would pass for the WRONG server. Require the
# HermesAI process to actually be running so we know we're testing our app.
if (-not (Get-Process -Name "HermesAI" -ErrorAction SilentlyContinue)) {
    throw "[smoke] HermesAI process is not running — app failed to launch or quit (e.g. port 8787 held by a foreign backend). Refusing to trust the health probe."
}
Write-Host "[smoke] HermesAI process is alive"

Write-Host "[smoke] probing backend $HealthUrl"
for ($i = 1; $i -le $MaxRetry; $i++) {
    try {
        $r = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 2
        if ($r.StatusCode -eq 200) {
            Write-Host "[smoke] backend health 200 (attempt $i)"
            Write-Host "[smoke] body: $($r.Content)"
            $BackendOk = $true
            break
        }
    } catch {
        Start-Sleep -Milliseconds 750
    }
}

if (-not $BackendOk) {
    throw "[smoke] backend health check FAILED: $HealthUrl"
}

Write-Host "[smoke] probing frontend $FrontendUrl"
for ($i = 1; $i -le $MaxRetry; $i++) {
    try {
        $r = Invoke-WebRequest -Uri $FrontendUrl -UseBasicParsing -TimeoutSec 2
        if ($r.StatusCode -eq 200 -and $r.Content -match "<!doctype") {
            Write-Host "[smoke] frontend 200 + HTML (attempt $i)"
            $FrontendOk = $true
            break
        }
    } catch {
        Start-Sleep -Milliseconds 750
    }
}

if (-not $FrontendOk) {
    throw "[smoke] frontend check FAILED: $FrontendUrl"
}

Write-Host "[smoke] PASSED — backend + frontend both healthy."
