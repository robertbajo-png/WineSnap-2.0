param([switch]$Once)
$ErrorActionPreference='Stop'
if(-not $IsWindows){throw 'PowerShell 7 on Windows is required.'}
. (Join-Path $PSScriptRoot 'lib/owned-windows-runtime.ps1')
$directory=Get-OwnedRuntimeDirectory
$watchLock=$null
$acquired=$false
$power=$null
function Due($Last,[double]$Hours) {
  if(-not $Last){return $true}
  $hoursToWait=if($Last.completed){$Hours}else{1.0/6}
  return ([DateTimeOffset]$Last.checkedAt) -lt [DateTimeOffset]::UtcNow.AddHours(-$hoursToWait)
}
try {
  $watchLock=Open-OwnedRuntimeLock -Name supervisor
  $acquired=[bool]$watchLock
  if(-not $acquired){exit 0}
  Assert-OwnedRuntimeDirectory | Out-Null
  Initialize-OwnedPowerProtection
  $power=[WineSnapOwned.HostingPower]::new()
  do {
    $state=[ordered]@{project='winesnap-owned-local';supervisorVersion='2026-11-01-private-ingress-v3';completed=$false;productionTouched=$false;hostedTestTouched=$false;processId=$PID;checkedAt=[DateTime]::UtcNow.ToString('o')}
    try {
      $state.phase='verify'
      $verified=Invoke-OwnedRuntimeAction -Action Verify
      if($verified.skipped -eq 'operation_already_running'){
        $state.busy=$true
        $state.keepAwakeOnAC=$power.Update($true)
        $state.finishedAt=[DateTime]::UtcNow.ToString('o')
        Write-OwnedRuntimeStatus $state
        if($Once){exit 0}
        Start-Sleep -Seconds 30
        continue
      }
      if(-not $verified.completed){throw 'Local services are not running.'}
      $state.completed=$true;$state.jobsHealthy=$true
      $ingress=Read-OwnedJobStatus 'ingress-control'
      $jobs=@(@{Action='Maintain';Name='maintain';Hours=1},@{Action='Backup';Name='backup';Hours=24})
      if($ingress.enabled -eq $true){
        $state.phase='private_ingress'
        $private=Invoke-OwnedRuntimeAction -Action IngressResume
        if($private.skipped -eq 'operation_already_running'){$state.busy=$true}
        elseif(-not $private.completed){throw 'Private ingress is not ready.'}
        $state.ingressHealthy=($private.completed -eq $true)
        $jobs+=@{Action='GateBackup';Name='gate-backup';Hours=24}
        $tunnel=Read-OwnedJobStatus 'tunnel-control'
        if($tunnel.enabled -eq $true){
          $state.phase='owned_tunnel'
          $connector=Invoke-OwnedRuntimeAction -Action TunnelResume
          if($connector.skipped -eq 'operation_already_running'){$state.busy=$true}
          elseif(-not $connector.completed){throw 'Owned tunnel is not ready.'}
          $state.tunnelHealthy=($connector.completed -eq $true)
        }
      }
      foreach($job in $jobs){
        $state.phase=$job.Action.ToLowerInvariant()
        $last=Read-OwnedJobStatus $job.Name
        if(Due $last $job.Hours){
          Invoke-OwnedRuntimeAction -Action $job.Action | Out-Null
          $last=Read-OwnedJobStatus $job.Name
        }
        if(-not $last.completed){$state.jobsHealthy=$false}
      }
      $state.phase='healthy'
    } catch {
      $state.failure='owned_local_watch_not_ready'
      $state.completed=$false
      $errorType=$_.Exception.GetType().FullName
      if($errorType -match '^[A-Za-z0-9_.]+$'){$state.errorType=$errorType}
      $state.failureLine=$_.InvocationInfo.ScriptLineNumber
    }
    $state.keepAwakeOnAC=$power.Update([bool]$state.completed)
    $state.finishedAt=[DateTime]::UtcNow.ToString('o')
    Write-OwnedRuntimeStatus $state
    if(-not $Once){Start-Sleep -Seconds 60}
  } while(-not $Once)
} finally {if($power){$power.Dispose()};if($watchLock){$watchLock.Dispose()}}
if($Once -and (-not $state.completed -or -not $state.jobsHealthy)){exit 1}
exit 0
