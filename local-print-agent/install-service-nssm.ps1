param(
  [string]$ServiceName = "KpfWeightScalePrintAgent",
  [string]$DisplayName = "KPF Weight Scale Print Agent",
  [string]$NssmPath = "",
  [switch]$StartNow
)

$ErrorActionPreference = "Stop"

$workingDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverPath = Join-Path $workingDirectory "server.js"
$configPath = Join-Path $workingDirectory "config.json"
$exampleConfigPath = Join-Path $workingDirectory "config.example.json"
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source

if (-not $NssmPath) {
  $candidate = Join-Path $workingDirectory "nssm.exe"
  if (Test-Path -LiteralPath $candidate) {
    $NssmPath = $candidate
  } else {
    $command = Get-Command nssm.exe -ErrorAction SilentlyContinue
    if ($command) {
      $NssmPath = $command.Source
    }
  }
}

if (-not $NssmPath -or -not (Test-Path -LiteralPath $NssmPath)) {
  throw "nssm.exe was not found. Put nssm.exe in this folder or pass -NssmPath C:\path\to\nssm.exe"
}

if (-not (Test-Path -LiteralPath $serverPath)) {
  throw "server.js was not found at $serverPath"
}

if (-not (Test-Path -LiteralPath $configPath) -and (Test-Path -LiteralPath $exampleConfigPath)) {
  Copy-Item -LiteralPath $exampleConfigPath -Destination $configPath
}

& $NssmPath stop $ServiceName 2>$null | Out-Null
& $NssmPath remove $ServiceName confirm 2>$null | Out-Null
& $NssmPath install $ServiceName $nodePath "`"$serverPath`""
& $NssmPath set $ServiceName AppDirectory $workingDirectory
& $NssmPath set $ServiceName DisplayName $DisplayName
& $NssmPath set $ServiceName Description "Runs the KPF local print agent on http://127.0.0.1:41951."
& $NssmPath set $ServiceName Start SERVICE_AUTO_START
& $NssmPath set $ServiceName AppStdout (Join-Path $workingDirectory "agent-service.log")
& $NssmPath set $ServiceName AppStderr (Join-Path $workingDirectory "agent-service.err.log")
& $NssmPath set $ServiceName AppRotateFiles 1
& $NssmPath set $ServiceName AppRotateOnline 1
& $NssmPath set $ServiceName AppRotateBytes 1048576
& $NssmPath set $ServiceName AppThrottle 1500
& $NssmPath set $ServiceName AppRestartDelay 5000

if ($StartNow) {
  & $NssmPath start $ServiceName
}

Write-Host "Installed Windows service: $ServiceName"
Write-Host "Agent folder: $workingDirectory"
Write-Host "Health check: http://127.0.0.1:41951/health"
