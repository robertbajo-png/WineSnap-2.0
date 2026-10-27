$ErrorActionPreference='Stop'
if(-not $IsWindows){throw 'PowerShell 7 on Windows is required.'}
. (Join-Path $PSScriptRoot 'lib/owned-windows-runtime.ps1')
$directory=Assert-OwnedRuntimeDirectory
$report=[ordered]@{project='winesnap-owned-local';healthy=$false;productionTouched=$false;readOnly=$true;checkedAt=[DateTime]::UtcNow.ToString('o')}
try {
  $path=Join-Path $directory 'watch-status.json'
  $item=Get-Item -LiteralPath $path -Force
  if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $item.Length -gt 64KB){throw 'Unsafe watch status.'}
  $state=Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
  if($state.project -ne 'winesnap-owned-local'){throw 'Unexpected status project.'}
  $age=([DateTimeOffset]::UtcNow-[DateTimeOffset]$state.finishedAt).TotalSeconds
  $report.heartbeatFresh=($age -ge -300 -and $age -lt 300)
  $report.jobsHealthy=($state.jobsHealthy -eq $true)
  $report.keepAwakeOnAC=($state.keepAwakeOnAC -eq $true)
  $report.currentSupervisorVersion=($state.supervisorVersion -eq '2026-10-27-guarded-v2')
  $task=Get-ScheduledTask -TaskName 'WineSnap Owned Local' -TaskPath '\'
  $report.taskVerified=($task.Description -eq 'WineSnap owned Windows supervisor v1 - no production or public exposure' -and $task.Principal.RunLevel -eq 'Limited' -and $task.Principal.LogonType -eq 'Interactive')
  $report.taskRunning=($task.State -eq 'Running')
  $process=if($state.processId -is [long] -or $state.processId -is [int]){Get-CimInstance Win32_Process -Filter "ProcessId=$($state.processId)"}else{$null}
  $entry=Join-Path $PSScriptRoot 'start-owned-windows-session.ps1'
  $report.supervisorRunning=[bool]($process -and $process.Name -eq 'pwsh.exe' -and $process.CommandLine.Contains($entry))
  $report.healthy=($state.completed -eq $true -and $report.currentSupervisorVersion -and $report.heartbeatFresh -and $report.jobsHealthy -and $report.taskVerified -and $report.taskRunning -and $report.supervisorRunning)
}catch{$report.failure='owned_supervisor_not_healthy'}
$report | ConvertTo-Json
if(-not $report.healthy){exit 1}
