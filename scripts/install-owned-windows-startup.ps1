$ErrorActionPreference='Stop'
if(-not $IsWindows){throw 'PowerShell 7 on Windows is required.'}
$entry=Join-Path $PSScriptRoot 'start-owned-windows-session.ps1'
$root=Split-Path -Parent $PSScriptRoot
$pwsh=(Get-Process -Id $PID).Path
$path=Join-Path ([Environment]::GetFolderPath('Startup')) 'WineSnap Local.lnk'
$marker='WineSnap owned local backend - loopback only'
$shell=New-Object -ComObject WScript.Shell
$shortcut=$shell.CreateShortcut($path)
if((Test-Path -LiteralPath $path) -and $shortcut.Description -ne $marker){throw 'Unrelated startup shortcut refused.'}
$shortcut.TargetPath=$pwsh
$shortcut.Arguments="-NoProfile -NonInteractive -WindowStyle Hidden -File `"$entry`""
$shortcut.WorkingDirectory=$root;$shortcut.WindowStyle=7;$shortcut.Description=$marker;$shortcut.Save()
$check=$shell.CreateShortcut($path)
if($check.TargetPath -ne $pwsh -or $check.Arguments -ne $shortcut.Arguments){throw 'Startup check failed.'}
Write-Output 'Owned-local WineSnap startup installed for this Windows user. No public tunnel is started.'
