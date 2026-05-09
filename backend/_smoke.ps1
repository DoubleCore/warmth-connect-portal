Start-Sleep -Seconds 3
$base = 'http://127.0.0.1:8787/api/rag'

Write-Host '--- scope ---'
Invoke-RestMethod "$base/scope" | ConvertTo-Json -Depth 5

Write-Host '--- search: KV cache compression ---'
Invoke-RestMethod "$base/search?q=KV+cache+compression&limit=3" | ConvertTo-Json -Depth 6

Write-Host '--- search: attention mechanism bounds ---'
Invoke-RestMethod "$base/search?q=attention+mechanism+bounds&limit=3" | ConvertTo-Json -Depth 6

Write-Host '--- search: MoE routing stability ---'
Invoke-RestMethod "$base/search?q=MoE+routing+stability&limit=3" | ConvertTo-Json -Depth 6

Write-Host '--- search: empty/punctuation only ---'
Invoke-RestMethod "$base/search?q=%3F%21%40" | ConvertTo-Json -Depth 6
