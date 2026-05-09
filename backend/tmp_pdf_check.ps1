$ErrorActionPreference = "Continue"
$base = "http://localhost:8787"

Write-Host "=== list papers ==="
$resp = Invoke-RestMethod -Uri "$base/api/papers?pageSize=10"
$resp.data.items | ForEach-Object {
  Write-Host ("  {0} | {1} | year={2}" -f $_.id, $_.title.Substring(0,[Math]::Min(60,$_.title.Length)), $_.publishedYear)
}

$idAttention = ($resp.data.items | Where-Object { $_.title -match "Attention" }).id
$idCondMem   = ($resp.data.items | Where-Object { $_.title -match "Conditional Memory" }).id
$idCoT       = ($resp.data.items | Where-Object { $_.title -match "Chain-of-Thought" }).id
$idRag       = ($resp.data.items | Where-Object { $_.title -match "Retrieval-Augmented" }).id

function Probe-Pdf($label, $id) {
  Write-Host ""
  Write-Host "--- $label ($id) ---"
  # Use -MaximumRedirection 0 to observe the server-side behavior; treat 302 as success.
  try {
    $r = Invoke-WebRequest -Uri "$base/api/papers/$id/pdf" -MaximumRedirection 0 -UseBasicParsing -ErrorAction Stop
    Write-Host "  status      : $([int]$r.StatusCode)"
    Write-Host "  content-type: $($r.Headers.'Content-Type')"
    Write-Host "  content-len : $($r.Headers.'Content-Length')"
    Write-Host "  disposition : $($r.Headers.'Content-Disposition')"
    Write-Host "  x-request-id: $($r.Headers.'X-Request-Id')"
    # Verify the first bytes really look like a PDF.
    if ($r.RawContentLength -gt 0) {
      $bytes = [System.Text.Encoding]::ASCII.GetString($r.Content[0..4])
      Write-Host "  magic bytes : $bytes"
    }
  } catch {
    $resp = $_.Exception.Response
    $status = if ($resp) { [int]$resp.StatusCode } else { -1 }
    Write-Host "  status      : $status (redirect or error)"
    if ($resp) {
      Write-Host "  location    : $($resp.Headers.Location)"
      Write-Host "  x-request-id: $($resp.Headers['X-Request-Id'])"
    }
  }
}

Probe-Pdf "local: Attention Is All You Need"      $idAttention
Probe-Pdf "local: Conditional Memory..."          $idCondMem
Probe-Pdf "remote redirect: CoT"                  $idCoT
Probe-Pdf "remote redirect: RAG"                  $idRag
