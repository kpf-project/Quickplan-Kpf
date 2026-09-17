param(
  [switch]$InstallNodeIfMissing = $true,
  [switch]$StartNow = $true,
  [string]$TaskName = "KPF Weight Scale Print Agent"
)

$ErrorActionPreference = "Stop"

function Refresh-ProcessPath {
  $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  [Environment]::SetEnvironmentVariable("Path", "$machinePath;$userPath", "Process")
}

function Resolve-NodePath {
  $command = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $localNode = Join-Path $PSScriptRoot "node\node.exe"
  if (Test-Path -LiteralPath $localNode) {
    return $localNode
  }

  return $null
}

function Install-NodeWithWinget {
  $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
  if (-not $winget) {
    throw "Node.js is not installed and winget.exe was not found. Install Node.js LTS manually, then run this installer again."
  }

  Write-Host "Installing Node.js LTS with winget..."
  & $winget.Source install OpenJS.NodeJS.LTS `
    --silent `
    --accept-package-agreements `
    --accept-source-agreements

  if ($LASTEXITCODE -ne 0) {
    throw "winget failed to install Node.js LTS. Exit code: $LASTEXITCODE"
  }

  Refresh-ProcessPath
}

$workingDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$configPath = Join-Path $workingDirectory "config.json"
$exampleConfigPath = Join-Path $workingDirectory "config.example.json"
$installTaskPath = Join-Path $workingDirectory "install-task.ps1"

if (-not (Test-Path -LiteralPath $installTaskPath)) {
  throw "install-task.ps1 was not found at $installTaskPath"
}

if (-not (Test-Path -LiteralPath $configPath) -and (Test-Path -LiteralPath $exampleConfigPath)) {
  Copy-Item -LiteralPath $exampleConfigPath -Destination $configPath
  Write-Host "Created config.json from config.example.json"
}

$nodePath = Resolve-NodePath
if (-not $nodePath -and $InstallNodeIfMissing) {
  Install-NodeWithWinget
  $nodePath = Resolve-NodePath
}

if (-not $nodePath) {
  throw "Node.js is required but was not found. Install Node.js LTS, then run this installer again."
}

Write-Host "Using Node.js: $nodePath"

$installArgs = @{
  TaskName = $TaskName
}
if ($StartNow) {
  $installArgs.StartNow = $true
}

& $installTaskPath @installArgs

Start-Sleep -Seconds 2

try {
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:41951/health" -Method Get -TimeoutSec 5
  if ($health.ok -eq $true) {
    Write-Host "Local print agent is running."
    Write-Host "Open the weight scale page, choose Local Agent, refresh printers, and select the printer."
    exit 0
  }
} catch {
  Write-Warning "The scheduled task was installed, but the health check did not respond yet: $($_.Exception.Message)"
  Write-Warning "Check http://127.0.0.1:41951/health after a few seconds."
  exit 0
}

Write-Warning "The scheduled task was installed, but the health response was unexpected."
