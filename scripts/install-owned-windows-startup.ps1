$ErrorActionPreference='Stop'
if(-not $IsWindows){throw 'PowerShell 7 on Windows is required.'}
. (Join-Path $PSScriptRoot 'lib/owned-windows-runtime.ps1')
Install-OwnedNativeHelpers
$entry=Join-Path $PSScriptRoot 'start-owned-windows-session.ps1'
$root=Split-Path -Parent $PSScriptRoot
$pwsh=(Get-Process -Id $PID).Path
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
$name='WineSnap Owned Local'
$marker='WineSnap owned Windows supervisor v1 - no production or public exposure'
$dockerEntry=Join-Path $PSScriptRoot 'start-owned-docker-engine.ps1'
$dockerPath=Join-Path ([Environment]::GetFolderPath('Startup')) 'WineSnap Docker Engine.lnk'
$dockerMarker='WineSnap shared Docker startup - independent current-user launcher'
$shell=New-Object -ComObject WScript.Shell
$dockerShortcut=$shell.CreateShortcut($dockerPath)
if((Test-Path -LiteralPath $dockerPath) -and $dockerShortcut.Description -ne $dockerMarker){throw 'Unrelated Docker startup shortcut refused.'}
$existing=Get-ScheduledTask -TaskName $name -TaskPath '\' -ErrorAction SilentlyContinue
if($existing){
  $storedUser=$existing.Principal.UserId
  $storedSid=if($storedUser -match '^S-1-'){$storedUser}else{([Security.Principal.NTAccount]::new($storedUser)).Translate([Security.Principal.SecurityIdentifier]).Value}
  if($existing.Description -ne $marker -or $storedSid -ne $identity.User.Value){throw 'Unrelated scheduled task refused.'}
}
$action=New-ScheduledTaskAction -Execute $pwsh -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -File `"$entry`"" -WorkingDirectory $root
$principal=New-ScheduledTaskPrincipal -UserId $identity.User.Value -LogonType Interactive -RunLevel Limited
$trigger=New-ScheduledTaskTrigger -AtLogOn -User $identity.Name
$recoveryTrigger=New-ScheduledTaskTrigger -Once -At ([DateTime]::Now.AddMinutes(1)) -RepetitionInterval ([TimeSpan]::FromMinutes(2))
$settings=New-ScheduledTaskSettingsSet -MultipleInstances Parallel -Priority 4 -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval ([TimeSpan]::FromMinutes(1)) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $name -TaskPath '\' -Action $action -Principal $principal -Trigger @($trigger,$recoveryTrigger) -Settings $settings -Description $marker -Force | Out-Null
$check=Get-ScheduledTask -TaskName $name -TaskPath '\'
if($check.Description -ne $marker -or $check.Actions.Count -ne 1 -or $check.Actions[0].Execute -ne $pwsh -or $check.Actions[0].Arguments -ne $action.Arguments -or $check.Principal.RunLevel -ne 'Limited' -or $check.Principal.LogonType -ne 'Interactive'){throw 'Scheduled startup verification failed.'}
$dockerShortcut.TargetPath=$pwsh
$dockerShortcut.Arguments="-NoProfile -NonInteractive -WindowStyle Hidden -File `"$dockerEntry`""
$dockerShortcut.WorkingDirectory=$root;$dockerShortcut.WindowStyle=7;$dockerShortcut.Description=$dockerMarker;$dockerShortcut.Save()
$dockerCheck=$shell.CreateShortcut($dockerPath)
if($dockerCheck.TargetPath -ne $pwsh -or $dockerCheck.Arguments -ne $dockerShortcut.Arguments){throw 'Independent Docker startup verification failed.'}
# Retire only our previous exact shortcut after the task has been verified.
$path=Join-Path ([Environment]::GetFolderPath('Startup')) 'WineSnap Local.lnk'
if(Test-Path -LiteralPath $path){
  $shortcut=$shell.CreateShortcut($path)
  if($shortcut.Description -eq 'WineSnap owned local backend - loopback only' -and $shortcut.TargetPath -eq $pwsh -and $shortcut.Arguments.Contains($entry)){
    Remove-Item -LiteralPath $path
  }
}
Write-Output 'WineSnap current-user supervisor installed. No password, elevation, reboot or public tunnel is configured.'
