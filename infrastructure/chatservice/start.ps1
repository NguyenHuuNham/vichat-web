$ErrorActionPreference = "Stop"

$infraDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoDir = (Resolve-Path (Join-Path $infraDir "..\..")).Path
$envPath = Join-Path $infraDir ".env"
$examplePath = Join-Path $infraDir ".env.example"
$composePath = Join-Path $infraDir "compose.yaml"

function Invoke-ChatmgtCompose {
    & docker compose --env-file $envPath -f $composePath @args
    if ($LASTEXITCODE -ne 0) {
        throw "Docker Compose failed with exit code $LASTEXITCODE."
    }
}

function New-RandomBase64([int]$count) {
    $bytes = New-Object byte[] $count
    $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
    return [Convert]::ToBase64String($bytes)
}

function Set-EnvValue([string]$path, [string]$key, [string]$value) {
    $lines = [Collections.Generic.List[string]]::new()
    foreach ($line in Get-Content -LiteralPath $path) {
        [void]$lines.Add($line)
    }
    $replacement = "$key=$value"
    $matched = $false
    for ($index = 0; $index -lt $lines.Count; $index++) {
        if ($lines[$index] -match "^$([Regex]::Escape($key))=") {
            $lines[$index] = $replacement
            $matched = $true
            break
        }
    }
    if (-not $matched) { [void]$lines.Add($replacement) }
    [IO.File]::WriteAllLines($path, [string[]]$lines, [Text.UTF8Encoding]::new($false))
}

function Ensure-Secret([string]$key, [int]$byteCount, [int]$minimumLength) {
    $current = ''
    foreach ($line in Get-Content -LiteralPath $envPath) {
        if ($line -match "^$([Regex]::Escape($key))=(.*)$") {
            $current = $Matches[1]
        }
    }
    if ([string]::IsNullOrWhiteSpace($current) -or $current.StartsWith('replace-with-') -or $current.Length -lt $minimumLength) {
        Set-EnvValue $envPath $key (New-RandomBase64 $byteCount)
    }
}

function Wait-Chatmgt {
    $appPort = 8093
    foreach ($line in Get-Content -LiteralPath $envPath) {
        if ($line -match '^CHATSERVICE_APP_PORT=(\d+)$') { $appPort = [int]$Matches[1] }
    }
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        try {
            $response = Invoke-WebRequest -Uri "http://127.0.0.1:$appPort/api/v1/auth/health" -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { return }
        } catch {
            # The process may still be loading Python dependencies after restart.
        }
        Start-Sleep -Seconds 1
    }
    throw "Chatmgt did not become reachable on port $appPort."
}

function Wait-Postgres([string]$user, [string]$database) {
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        & docker compose --env-file $envPath -f $composePath exec -T postgres `
            pg_isready -U $user -d $database *> $null
        if ($LASTEXITCODE -eq 0) { return }
        Start-Sleep -Seconds 1
    }
    throw "PostgreSQL did not become ready."
}

if (-not (Test-Path -LiteralPath $envPath)) {
    Copy-Item -LiteralPath $examplePath -Destination $envPath
    throw "Created infrastructure/chatservice/.env. Update CHATSERVICE_DB_PASSWORD, then run this script again."
}

Ensure-Secret 'APP_SECRET_KEY' 48 32
Ensure-Secret 'AUTH_PASSWORD_SALT' 32 16
Ensure-Secret 'SESSION_COOKIE_SALT' 48 32
Ensure-Secret 'CHAT_AUTH_JWT_SECRET' 48 32

$envContent = Get-Content -Raw -LiteralPath $envPath
if ($envContent -notmatch '(?m)^TINODE_API_KEY=.+$') {
    Set-EnvValue $envPath 'TINODE_API_KEY' 'AQEAAAABAAD_rAp4DJh05a1HAwFT3A6K'
}

$composeDbUser = "chatservice"
$composeDbName = "chatservice"
$composeDbPassword = ""
foreach ($line in Get-Content -LiteralPath $envPath) {
    if ($line -match '^CHATSERVICE_DB_USER=(.+)$') { $composeDbUser = $Matches[1].Trim() }
    if ($line -match '^CHATSERVICE_DB_NAME=(.+)$') { $composeDbName = $Matches[1].Trim() }
    if ($line -match '^CHATSERVICE_DB_PASSWORD=(.+)$') { $composeDbPassword = $Matches[1] }
}
if ([string]::IsNullOrWhiteSpace($composeDbPassword) -or $composeDbPassword.StartsWith('replace-with-')) {
    throw "Replace CHATSERVICE_DB_PASSWORD in infrastructure/chatservice/.env before starting Chatmgt."
}

Invoke-ChatmgtCompose up -d postgres redis
Invoke-ChatmgtCompose build chatmgt
Wait-Postgres $composeDbUser $composeDbName

# Existing PostgreSQL volumes keep the password from their first initialization.
# Synchronize the role so chatmgt and pgAdmin use the current private .env value.
$sqlUser = $composeDbUser.Replace('"', '""')
$sqlPassword = $composeDbPassword.Replace("'", "''")
$alterRoleSql = "ALTER ROLE `"$sqlUser`" WITH PASSWORD '$sqlPassword';"
Invoke-ChatmgtCompose exec -T postgres `
    psql -v ON_ERROR_STOP=1 -U $composeDbUser -d $composeDbName `
    -c $alterRoleSql

Invoke-ChatmgtCompose run --rm --no-deps chatmgt `
    alembic -c alembic.ini upgrade head
Invoke-ChatmgtCompose up -d chatmgt
Wait-Chatmgt
Invoke-ChatmgtCompose ps
