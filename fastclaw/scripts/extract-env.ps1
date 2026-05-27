[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$EnvFile,
    [Parameter(Mandatory = $true)][string]$OutFile
)

# Pull a fixed whitelist of KEY=VALUE entries out of backend/.env (UTF-8) and
# write them to $OutFile in plain ASCII-safe form, renaming the LLM_* keys to
# the AGENT_* names that fastclaw expects. The output file is consumed by
# start-hermes-fastclaw.bat via `for /f` and deleted right after.
#
# Why a separate script: cmd's `for /f "usebackq delims="` together with an
# inline PowerShell command becomes a quoting minefield once the inline command
# contains single quotes. Putting the logic in a script keeps the bat side
# trivial (`-File path`) and avoids that whole class of bugs.

$rename = @{
    'LLM_API_KEY'      = 'AGENT_API_KEY'
    'LLM_API_BASE_URL' = 'AGENT_API_BASE'
    'LLM_CHAT_MODEL'   = 'AGENT_MODEL'
    'FASTCLAW_API_KEY' = 'FASTCLAW_API_KEY'
}

if (-not (Test-Path -LiteralPath $EnvFile)) {
    Set-Content -LiteralPath $OutFile -Value '' -Encoding ASCII
    return
}

$lines = Get-Content -Encoding UTF8 -LiteralPath $EnvFile
$out = New-Object System.Collections.Generic.List[string]
foreach ($line in $lines) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    if ($line.TrimStart().StartsWith('#')) { continue }
    $eq = $line.IndexOf('=')
    if ($eq -le 0) { continue }
    $key = $line.Substring(0, $eq).Trim()
    $value = $line.Substring($eq + 1)
    if (-not $rename.ContainsKey($key)) { continue }
    $mapped = $rename[$key]
    # `for /f` will choke on real CRLF / CR mid-value, but plain spaces are fine.
    $clean = $value -replace "[\r\n]", ''
    $out.Add("$mapped=$clean")
}

# ASCII output keeps the bat-side `for /f` happy; values themselves are ASCII
# (urls, hex tokens, model ids), so no info is lost.
Set-Content -LiteralPath $OutFile -Value $out -Encoding ASCII
