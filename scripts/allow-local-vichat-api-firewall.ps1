[CmdletBinding()]
param(
    [int]$Port = 8000
)

$ErrorActionPreference = 'Stop'
$ruleName = 'ViChat Local AI API (Private Network)'
$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if (-not $existing) {
    New-NetFirewallRule -DisplayName $ruleName `
        -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port `
        -Profile Private -Description 'Allow the trusted Knowledge service on the local private network.' | Out-Null
    Write-Host "Created a Private-network firewall rule for TCP $Port." -ForegroundColor Green
} else {
    Write-Host "Firewall rule already exists for TCP $Port." -ForegroundColor Yellow
}
