param()

$startupFolder = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startupFolder "KPF Weight Scale Print Agent.lnk"
$workingDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$serverPath = Join-Path $workingDirectory "server.js"

$wshShell = New-Object -ComObject WScript.Shell
$shortcut = $wshShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $nodePath
$shortcut.Arguments = "`"$serverPath`""
$shortcut.WorkingDirectory = $workingDirectory
$shortcut.WindowStyle = 7
$shortcut.IconLocation = "$env:SystemRoot\System32\SHELL32.dll,13"
$shortcut.Description = "Start KPF Weight Scale Local Print Agent"
$shortcut.Save()

Write-Host "Installed startup shortcut at $shortcutPath"
