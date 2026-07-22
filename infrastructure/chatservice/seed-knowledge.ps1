$ErrorActionPreference = "Stop"

$infraDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoDir = Split-Path -Parent (Split-Path -Parent $infraDir)
$envPath = Join-Path $infraDir ".env"
$examplePath = Join-Path $infraDir ".env.example"
$dataFile = if ($args.Count -gt 0) { $args[0] } else { "songhong-default.json" }

if (-not (Test-Path -LiteralPath $envPath)) {
    Copy-Item -LiteralPath $examplePath -Destination $envPath
    Write-Warning "Created infrastructure/chatservice/.env. Set a strong CHATSERVICE_DB_PASSWORD before production use."
}

$composeFile = Join-Path $infraDir "compose.yaml"
$containerFile = "knowledge/" + [IO.Path]::GetFileName($dataFile)
if (-not (Test-Path -LiteralPath (Join-Path $repoDir "chatservice-main\knowledge\$([IO.Path]::GetFileName($dataFile))"))) {
    throw "Knowledge file not found under chatservice-main/knowledge: $dataFile"
}

docker-compose --env-file $envPath -f $composeFile exec -T chatservice `
    python scripts/seed_knowledge.py --file $containerFile
