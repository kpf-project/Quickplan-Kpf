param()

$ErrorActionPreference = "Stop"

$workingDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverPath = Join-Path $workingDirectory "server.js"
$localNodePath = Join-Path $workingDirectory "node\node.exe"
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue

if ($nodeCommand) {
  $nodePath = $nodeCommand.Source
} elseif (Test-Path -LiteralPath $localNodePath) {
  $nodePath = $localNodePath
} else {
  throw "node.exe was not found. Install Node.js LTS or place portable Node at $localNodePath"
}

if (-not (Test-Path -LiteralPath $serverPath)) {
  throw "server.js was not found at $serverPath"
}

$process = Start-Process `
  -FilePath $nodePath `
  -ArgumentList "`"$serverPath`"" `
  -WorkingDirectory $workingDirectory `
  -WindowStyle Hidden `
  -PassThru

$process.WaitForExit()
exit $process.ExitCode
