param()

$startupFolder = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startupFolder "KPF Weight Scale Print Agent.lnk"

if (Test-Path -LiteralPath $shortcutPath) {
  Remove-Item -LiteralPath $shortcutPath -Force
  Write-Host "Removed startup shortcut at $shortcutPath"
} else {
  Write-Host "Startup shortcut not found."
}
