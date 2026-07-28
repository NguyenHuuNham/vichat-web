[CmdletBinding()]
param(
  [string]$BaseUrl = 'http://127.0.0.1:8093',
  [string]$Tenant = 'song-hong',
  [string]$AdminUser = 'admin',
  [string]$AdminPassword = '123456',
  [string]$MemberUser = 'tuan',
  [string]$MemberPassword = '123456'
)

$ErrorActionPreference = 'Stop'

function Invoke-Json([Microsoft.PowerShell.Commands.WebRequestSession]$Session, [string]$Method, [string]$Path, [object]$Body) {
  $params = @{ Uri = "$BaseUrl$Path"; Method = $Method; WebSession = $Session; UseBasicParsing = $true }
  if ($null -ne $Body) {
    $params.ContentType = 'application/json'
    $params.Body = ($Body | ConvertTo-Json -Compress)
  }
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    try {
      $response = Invoke-WebRequest @params
      return [pscustomobject]@{ Status = [int]$response.StatusCode; Body = ($response.Content | ConvertFrom-Json) }
    } catch {
      $response = $_.Exception.Response
      if ($response) {
        $reader = New-Object IO.StreamReader($response.GetResponseStream())
        $content = $reader.ReadToEnd()
        return [pscustomobject]@{ Status = [int]$response.StatusCode; Body = ($content | ConvertFrom-Json) }
      }
      if ($attempt -eq 19) { throw }
      Start-Sleep -Seconds 1
    }
  }
}

function Assert-Status($Result, [int]$Expected, [string]$Name) {
  if ($Result.Status -ne $Expected) {
    $detail = $Result.Body.error_message
    if (-not $detail) { $detail = $Result.Body.error_code }
    throw "$Name expected HTTP $Expected but received $($Result.Status). $detail"
  }
  Write-Host "PASS $Name ($($Result.Status))" -ForegroundColor Green
}

$anonymous = New-Object Microsoft.PowerShell.Commands.WebRequestSession
Assert-Status (Invoke-Json $anonymous 'GET' '/api/v1/auth/health' $null) 200 'Authentication health endpoint'
Assert-Status (Invoke-Json $anonymous 'GET' '/api/v1/chat/users' $null) 401 'Anonymous users are rejected'
Assert-Status (Invoke-Json $anonymous 'POST' '/api/v1/auth/forgot-password' @{ tenant_id = $Tenant; identity = 'missing-account' }) 202 'Forgot password hides account existence'
Assert-Status (Invoke-Json $anonymous 'POST' '/api/v1/auth/reset-password' @{ token = 'invalid-token'; new_password = 'ValidPass#2026' }) 400 'Invalid reset token is rejected'

$admin = New-Object Microsoft.PowerShell.Commands.WebRequestSession
Assert-Status (Invoke-Json $admin 'POST' '/login' @{ tenant_id = $Tenant; identity = $AdminUser; password = $AdminPassword }) 200 'Admin login'
$adminProfile = Invoke-Json $admin 'GET' '/api/v1/auth/me' $null
Assert-Status $adminProfile 200 'Current profile access'
Assert-Status (Invoke-Json $admin 'PUT' '/api/v1/auth/profile' @{
  name = $adminProfile.Body.user.name
  email = $adminProfile.Body.user.email
  title = $adminProfile.Body.user.title
  department = $adminProfile.Body.user.department
}) 200 'Current profile update'
Assert-Status (Invoke-Json $admin 'GET' '/api/v1/chat/users' $null) 200 'Admin directory access'
Assert-Status (Invoke-Json $admin 'GET' '/api/v1/chat/threads?limit=10' $null) 200 'Tenant thread list access'
Assert-Status (Invoke-Json $admin 'POST' '/api/v1/auth/logout' @{}) 200 'Admin logout'
Assert-Status (Invoke-Json $admin 'GET' '/api/v1/chat/users' $null) 401 'Logged-out admin is rejected'

$member = New-Object Microsoft.PowerShell.Commands.WebRequestSession
Assert-Status (Invoke-Json $member 'POST' '/login' @{ tenant_id = $Tenant; identity = $MemberUser; password = $MemberPassword }) 200 'Member login'
Assert-Status (Invoke-Json $member 'GET' '/api/v1/chat/users' $null) 200 'Member directory access'
Write-Host 'Security checks passed.' -ForegroundColor Green
