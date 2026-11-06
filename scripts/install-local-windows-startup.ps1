param([switch]$Remove)
$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'PowerShell 7 on Windows is required.' }
$root = Split-Path -Parent $PSScriptRoot
$entry = Join-Path $PSScriptRoot 'start-local-windows-session.ps1'
$pwsh = (Get-Process -Id $PID).Path
$startup = [Environment]::GetFolderPath('Startup')
$path = Join-Path $startup 'WineSnap Local Test.lnk'
$marker = 'WineSnap isolated local test session'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($path)
if ((Test-Path -LiteralPath $path) -and $shortcut.Description -ne $marker) { throw 'Refusing an unrelated startup shortcut.' }
if ($Remove) {
  if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path }
  Write-Host 'WineSnap user-logon startup removed; other startup applications are unchanged.'
  exit 0
}
if (-not (Test-Path -LiteralPath $entry -PathType Leaf)) { throw 'Session entry point is missing.' }
$shortcut.TargetPath = $pwsh
$shortcut.Arguments = "-NoProfile -NonInteractive -WindowStyle Hidden -File `"$entry`""
$shortcut.WorkingDirectory = $root
$shortcut.WindowStyle = 7
$shortcut.Description = $marker
$shortcut.Save()
$check = $shell.CreateShortcut($path)
if ($check.TargetPath -ne $pwsh -or $check.Arguments -ne $shortcut.Arguments) { throw 'Startup verification failed.' }
Write-Host 'Installed WineSnap startup for this Windows user only, after sign-in, without a saved password or administrator privileges.'
