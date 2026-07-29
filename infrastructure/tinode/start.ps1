[CmdletBinding()]
param(
  [switch]$SkipWebConfig
)

$ErrorActionPreference = 'Stop'
$infraDir = $PSScriptRoot
$projectDir = (Resolve-Path (Join-Path $infraDir '..\..')).Path
$secretFile = Join-Path $infraDir '.env'
$composeFile = Join-Path $infraDir 'compose.yaml'

function New-RandomBase64([int]$count) {
  $bytes = New-Object byte[] $count
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
  return [Convert]::ToBase64String($bytes)
}

function New-RandomHex([int]$count) {
  $bytes = New-Object byte[] $count
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
  return ([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
}

function Set-EnvValues([string]$path, [hashtable]$values) {
  $lines = [Collections.Generic.List[string]]::new()
  if (Test-Path -LiteralPath $path) {
    foreach ($existingLine in Get-Content -LiteralPath $path) {
      [void]$lines.Add($existingLine)
    }
  }
  foreach ($key in $values.Keys) {
    $replacement = "$key=$($values[$key])"
    $matched = $false
    for ($index = 0; $index -lt $lines.Count; $index++) {
      if ($lines[$index] -match "^$([Regex]::Escape($key))=") {
        $lines[$index] = $replacement
        $matched = $true
        break
      }
    }
    if (-not $matched) { [void]$lines.Add($replacement) }
  }
  [IO.File]::WriteAllLines($path, [string[]]$lines, [Text.UTF8Encoding]::new($false))
}

function Find-DockerExecutable {
  $command = Get-Command docker -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }

  $candidates = @(
    'D:\DockerDesktop\resources\bin\docker.exe',
    (Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin\docker.exe'),
    (Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin\docker.exe')
  )
  return $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}

$dockerExe = Find-DockerExecutable
if (-not $dockerExe) {
  throw 'Docker not found. Install and open Docker Desktop, then run this script again.'
}
$dockerBin = Split-Path -Parent $dockerExe
if (($env:Path -split ';') -notcontains $dockerBin) {
  $env:Path = "$dockerBin;$env:Path"
}

if (-not (Test-Path -LiteralPath $secretFile)) {
  $secretLines = @(
    "TINODE_DB_PASSWORD=$(New-RandomHex 24)",
    "TINODE_AUTH_TOKEN_KEY=$(New-RandomBase64 32)",
    "TINODE_UID_ENCRYPTION_KEY=$(New-RandomBase64 16)",
    'TINODE_TOKEN_EXPIRE_IN=300',
    'TINODE_PORT=6060',
    'TINODE_UPGRADE_DB=false',
    'TINODE_CORS_ORIGINS=["http://127.0.0.1:5173"]'
  )
  [IO.File]::WriteAllLines($secretFile, $secretLines, [Text.UTF8Encoding]::new($false))
  Write-Host 'Created private random keys for Tinode.' -ForegroundColor Green
}

& $dockerExe compose --env-file $secretFile -f $composeFile up -d
if ($LASTEXITCODE -ne 0) { throw 'Could not start Tinode with Docker Compose.' }

$ready = $false
for ($attempt = 0; $attempt -lt 60; $attempt++) {
  try {
    $response = Invoke-WebRequest -Uri 'http://127.0.0.1:6060/' -UseBasicParsing -TimeoutSec 2
    if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
      $ready = $true
      break
    }
  } catch {
    Start-Sleep -Seconds 2
  }
}

if (-not $ready) {
  & $dockerExe compose --env-file $secretFile -f $composeFile logs --tail 100 chatapi
  throw 'Tinode was not ready after 120 seconds. Recent logs are shown above.'
}

if (-not $SkipWebConfig) {
  Set-EnvValues (Join-Path $projectDir '.env.local') ([ordered]@{
    VITE_TINODE_HOST = '127.0.0.1:6060'
    VITE_TINODE_API_KEY = 'AQEAAAABAAD_rAp4DJh05a1HAwFT3A6K'
    VITE_TINODE_SECURE = 'false'
    VITE_TINODE_TRANSPORT = 'ws'
    VITE_TINODE_PERSIST = 'true'
    VITE_TINODE_APP_NAME = 'SONGHONG/1.0'
  })
  Write-Host 'Configured .env.local for the web app to connect to Tinode.' -ForegroundColor Green
}

Write-Host 'Tinode + PostgreSQL are ready at http://127.0.0.1:6060/' -ForegroundColor Green
Write-Host 'Restart Vite to load the new .env.local configuration.' -ForegroundColor Yellow
