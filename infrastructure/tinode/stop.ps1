$ErrorActionPreference = 'Stop'
$secretFile = Join-Path $PSScriptRoot '.env'
$composeFile = Join-Path $PSScriptRoot 'compose.yaml'
$dockerExe = @(
  (Get-Command docker -ErrorAction SilentlyContinue).Source,
  'D:\DockerDesktop\resources\bin\docker.exe',
  (Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin\docker.exe'),
  (Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin\docker.exe')
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1

if (-not $dockerExe) { throw 'Docker executable not found.' }
$dockerBin = Split-Path -Parent $dockerExe
if (($env:Path -split ';') -notcontains $dockerBin) {
  $env:Path = "$dockerBin;$env:Path"
}

if (-not (Test-Path -LiteralPath $secretFile)) {
  throw 'infrastructure/tinode/.env does not exist. Tinode has not been initialized.'
}

& $dockerExe compose --env-file $secretFile -f $composeFile down

Write-Host 'Containers stopped. Database, messages, and files remain in Docker volumes.' -ForegroundColor Green
