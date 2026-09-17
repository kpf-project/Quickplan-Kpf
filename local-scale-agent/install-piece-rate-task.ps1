param([switch]$StartNow)

$ErrorActionPreference = "Stop"
$taskName = "KPF Piece Rate Scale Agent"
$workingDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$launcherPath = Join-Path $workingDirectory "run-piece-rate-agent-hidden.ps1"
$configPath = Join-Path $workingDirectory "config.piece-rate.json"
$exampleConfigPath = Join-Path $workingDirectory "config.example.json"
$powershellPath = (Get-Command powershell.exe -ErrorAction Stop).Source

if (-not (Test-Path -LiteralPath $configPath)) {
  Copy-Item -LiteralPath $exampleConfigPath -Destination $configPath
}

$action = New-ScheduledTaskAction -Execute $powershellPath -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcherPath`"" -WorkingDirectory $workingDirectory
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Days 365) -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Highest

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "KPF Piece Rate scale agent on 127.0.0.1:41953" | Out-Null
if ($StartNow) { Start-ScheduledTask -TaskName $taskName }
Write-Host "Installed scheduled task: $taskName"
Write-Host "Health check: http://127.0.0.1:41953/health"
