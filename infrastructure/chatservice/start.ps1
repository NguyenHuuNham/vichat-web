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

function Wait-Chatmgt {
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        try {
            $response = Invoke-WebRequest -Uri "http://127.0.0.1:8093/api/v1/auth/health" -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { return }
        } catch {
            # The process may still be loading Python dependencies after restart.
        }
        Start-Sleep -Seconds 1
    }
    throw "Chatmgt did not become reachable on port 8093."
}

if (-not (Test-Path -LiteralPath $envPath)) {
    Copy-Item -LiteralPath $examplePath -Destination $envPath
    throw "Created infrastructure/chatservice/.env. Update CHATSERVICE_DB_PASSWORD, then run this script again."
}

$envContent = Get-Content -Raw -LiteralPath $envPath
if ($envContent -notmatch '(?m)^CHAT_AUTH_JWT_SECRET=.{32,}$') {
    $bytes = New-Object byte[] 48
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $rng.Dispose()
    $secret = [Convert]::ToBase64String($bytes)
    Add-Content -LiteralPath $envPath -Value "`r`nCHAT_AUTH_JWT_SECRET=$secret"
}

$envContent = Get-Content -Raw -LiteralPath $envPath
if ($envContent -notmatch '(?m)^TINODE_API_KEY=.+$') {
    Add-Content -LiteralPath $envPath -Value "`r`nTINODE_API_KEY=AQEAAAABAAD_rAp4DJh05a1HAwFT3A6K"
}

$composeDbUser = "chatservice"
$composeDbName = "chatservice"
$composeDbPassword = ""
foreach ($line in Get-Content -LiteralPath $envPath) {
    if ($line -match '^CHATSERVICE_DB_USER=(.+)$') { $composeDbUser = $Matches[1].Trim() }
    if ($line -match '^CHATSERVICE_DB_NAME=(.+)$') { $composeDbName = $Matches[1].Trim() }
    if ($line -match '^CHATSERVICE_DB_PASSWORD=(.+)$') { $composeDbPassword = $Matches[1] }
}
if ([string]::IsNullOrWhiteSpace($composeDbPassword)) {
    throw "CHATSERVICE_DB_PASSWORD is missing from infrastructure/chatservice/.env."
}

Invoke-ChatmgtCompose up -d --build

# Existing PostgreSQL volumes keep the password from their first initialization.
# Synchronize the role so chatmgt and pgAdmin use the current private .env value.
$sqlUser = $composeDbUser.Replace('"', '""')
$sqlPassword = $composeDbPassword.Replace("'", "''")
$alterRoleSql = "ALTER ROLE `"$sqlUser`" WITH PASSWORD '$sqlPassword';"
Invoke-ChatmgtCompose exec -T postgres `
    psql -v ON_ERROR_STOP=1 -U $composeDbUser -d $composeDbName `
    -c $alterRoleSql

Get-ChildItem -LiteralPath (Join-Path $repoDir "chatservice-main\migrations") -Filter "*.sql" |
    Sort-Object Name |
    ForEach-Object {
        $containerMigration = "/docker-entrypoint-initdb.d/$($_.Name)"
        Invoke-ChatmgtCompose exec -T postgres `
            psql -v ON_ERROR_STOP=1 -U $composeDbUser -d $composeDbName `
            -f $containerMigration
    }
Invoke-ChatmgtCompose restart chatmgt
Wait-Chatmgt
Invoke-ChatmgtCompose ps
