[CmdletBinding()]
param(
    [string]$EnvFile = '',
    [switch]$Mock
)

$ErrorActionPreference = 'Stop'
$repoDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$exampleFile = Join-Path $repoDir '.env.local-ai-api.example'
if ([string]::IsNullOrWhiteSpace($EnvFile)) {
    $EnvFile = Join-Path $repoDir '.env.local-ai-api'
}

if (-not (Test-Path -LiteralPath $EnvFile)) {
    Copy-Item -LiteralPath $exampleFile -Destination $EnvFile
    throw "Created $EnvFile. Fill the Knowledge API key and local token, then run again."
}

foreach ($line in Get-Content -LiteralPath $EnvFile) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
    $separator = $trimmed.IndexOf('=')
    if ($separator -lt 1) { continue }
    $name = $trimmed.Substring(0, $separator).Trim()
    $value = $trimmed.Substring($separator + 1)
    [Environment]::SetEnvironmentVariable($name, $value, 'Process')
}
if ($Mock) { $env:LOCAL_AI_MOCK = 'true' }

if ([string]::IsNullOrWhiteSpace($env:LOCAL_AI_API_TOKEN) -or
    $env:LOCAL_AI_API_TOKEN -like 'replace-with-*') {
    throw 'LOCAL_AI_API_TOKEN is not configured in .env.local-ai-api.'
}
if (-not $Mock -and ([string]::IsNullOrWhiteSpace($env:LOCAL_AI_KNOWLEDGE_KEY) -or
    $env:LOCAL_AI_KNOWLEDGE_KEY -like 'replace-with-*')) {
    throw 'LOCAL_AI_KNOWLEDGE_KEY is not configured in .env.local-ai-api.'
}

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) { throw 'Python 3.8+ is required.' }
$script = Join-Path $repoDir 'scripts\local_vichat_ai_api.py'
$ipAddresses = Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
    Select-Object -ExpandProperty IPAddress

Write-Host 'Local ViChat AI API:' -ForegroundColor Green
foreach ($address in $ipAddresses) {
    Write-Host ("  http://{0}:{1}/api/ask" -f $address, $env:LOCAL_AI_PORT)
}
Write-Host 'Health: /healthz' -ForegroundColor Green
Write-Host 'Press Ctrl+C to stop. The process must be running while the other service calls it.' -ForegroundColor Yellow

& $python.Source $script --env-file $EnvFile --host $env:LOCAL_AI_HOST --port ([int]$env:LOCAL_AI_PORT)
exit $LASTEXITCODE
