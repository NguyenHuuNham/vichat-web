[CmdletBinding()]
param(
    [string]$ServerPath = 'D:\ViChatLocalAI\llama\b10423\llama-server.exe',
    [string]$ModelPath = 'D:\ViChatLocalAI\models\qwen2.5-1.5b-instruct-q4_k_m.gguf',
    [int]$Port = 8080,
    [int]$ContextSize = 4096,
    [int]$Threads = 6
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $ServerPath -PathType Leaf)) {
    throw "llama-server.exe not found at $ServerPath. Download the portable runtime first."
}
if (-not (Test-Path -LiteralPath $ModelPath -PathType Leaf)) {
    throw "Local model not found at $ModelPath. Download the Qwen GGUF model first."
}

$existing = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
if ($existing) {
    try {
        $health = Invoke-RestMethod -Uri ("http://127.0.0.1:{0}/health" -f $Port) -TimeoutSec 3
        if ($health.status -eq 'ok') {
            Write-Host ("Local LLM is already healthy on 127.0.0.1:{0}." -f $Port) -ForegroundColor Green
            exit 0
        }
    } catch {
        throw ("Port {0} is already in use by another process." -f $Port)
    }
}

Write-Host ("Starting Qwen local LLM on http://127.0.0.1:{0}. Keep this window open." -f $Port) -ForegroundColor Green
& $ServerPath `
    --model $ModelPath `
    --host 127.0.0.1 `
    --port $Port `
    --ctx-size $ContextSize `
    --threads $Threads `
    --threads-batch $Threads `
    --parallel 1 `
    --alias 'qwen2.5:1.5b'
exit $LASTEXITCODE
