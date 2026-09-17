param(
  [string]$ServiceName = "KpfWeightScalePrintAgent",
  [string]$NssmPath = ""
)

$ErrorActionPreference = "Stop"

$workingDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path

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

& $NssmPath stop $ServiceName 2>$null | Out-Null
& $NssmPath remove $ServiceName confirm

Write-Host "Removed Windows service: $ServiceName"
