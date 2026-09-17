param(
  [string]$TaskName = "KPF Local Scale Agent",
  [switch]$StartNow
)

$ErrorActionPreference = "Stop"

$workingDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverPath = Join-Path $workingDirectory "server.js"
$launcherPath = Join-Path $workingDirectory "run-agent-hidden.ps1"
$configPath = Join-Path $workingDirectory "config.json"
$exampleConfigPath = Join-Path $workingDirectory "config.example.json"
$powershellPath = (Get-Command powershell.exe -ErrorAction Stop).Source

if (-not (Test-Path -LiteralPath $serverPath)) {
  throw "server.js was not found at $serverPath"
}

if (-not (Test-Path -LiteralPath $launcherPath)) {
  throw "run-agent-hidden.ps1 was not found at $launcherPath"
}

if (-not (Test-Path -LiteralPath $configPath) -and (Test-Path -LiteralPath $exampleConfigPath)) {
  Copy-Item -LiteralPath $exampleConfigPath -Destination $configPath
}

$action = New-ScheduledTaskAction `
  -Execute $powershellPath `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcherPath`"" `
  -WorkingDirectory $workingDirectory

$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Days 365) `
  -RestartCount 5 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -StartWhenAvailable

$principal = New-ScheduledTaskPrincipal `
  -UserId "$env:USERDOMAIN\$env:USERNAME" `
  -LogonType Interactive `
  -RunLevel Highest

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Description "Runs the KPF local scale agent on http://127.0.0.1:41952 after Windows sign-in." `
  | Out-Null

if ($StartNow) {
  Start-ScheduledTask -TaskName $TaskName
}

Write-Host "Installed scheduled task: $TaskName"
Write-Host "Agent folder: $workingDirectory"
Write-Host "Health check: http://127.0.0.1:41952/health"
