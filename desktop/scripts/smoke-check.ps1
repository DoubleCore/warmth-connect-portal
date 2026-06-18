# Smoke test — validates the installed app's backend is alive.
# The desktop backend listens on 18787 (see electron/main.js BACKEND_PORT).
$ErrorActionPreference = "Stop"

$HealthUrl = "http://127.0.0.1:18787/health"
$FrontendUrl = "http://127.0.0.1:15173/"
$MaxRetry = 40
$BackendOk = $false
$FrontendOk = $false

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
