param()

$ErrorActionPreference = "Stop"
$workingDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverPath = Join-Path $workingDirectory "server.js"
$localNodePath = Join-Path $workingDirectory "node\node.exe"
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$env:KPF_SCALE_AGENT_PROFILE = "piece-rate"
$env:KPF_SCALE_AGENT_PORT = "41953"
$env:KPF_SCALE_AGENT_CONFIG_PATH = Join-Path $workingDirectory "config.piece-rate.json"

if ($nodeCommand) { $nodePath = $nodeCommand.Source }
elseif (Test-Path -LiteralPath $localNodePath) { $nodePath = $localNodePath }
else { throw "node.exe was not found." }

$process = Start-Process -FilePath $nodePath -ArgumentList "`"$serverPath`"" -WorkingDirectory $workingDirectory -WindowStyle Hidden -PassThru
$process.WaitForExit()
exit $process.ExitCode
