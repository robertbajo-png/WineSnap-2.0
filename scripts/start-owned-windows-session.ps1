$ErrorActionPreference='Stop'
if(-not $IsWindows){throw 'PowerShell 7 on Windows is required.'}
$sessionLock=$null
$sessionAcquired=$false
. (Join-Path $PSScriptRoot 'lib/owned-windows-runtime.ps1')
$phase='local_engine'
$state=[ordered]@{project='winesnap-owned-local';supervisorVersion='2026-10-27-guarded-v2';completed=$false;productionTouched=$false;hostedTestTouched=$false;processId=$PID;checkedAt=[DateTime]::UtcNow.ToString('o')}
try {
  $sessionLock=Open-OwnedRuntimeLock -Name session
  $sessionAcquired=[bool]$sessionLock
  if(-not $sessionAcquired){exit 0}
  Write-OwnedRuntimeStatus $state -Kind startup
  $ready=Test-OwnedDockerEngine
  if(-not $ready){
    # Docker starts separately from the user's Startup folder. Never attach the
    # shared engine's lifetime to this task's restart/termination process group.
    $deadline=[DateTime]::UtcNow.AddMinutes(5)
    do{Start-Sleep -Seconds 5;$ready=Test-OwnedDockerEngine}
    while(-not $ready -and [DateTime]::UtcNow -lt $deadline)
  }
  if(-not $ready){throw 'Local Docker engine not ready.'}
  $phase='resume_existing_installation'
  for($attempt=0;$attempt -lt 30;$attempt++){
    $result=Invoke-OwnedRuntimeAction -Action Resume
    if($result.skipped -ne 'operation_already_running'){break}
    $state.busy=$true;$state.phase='waiting_for_owned_operation';$state.checkedAt=[DateTime]::UtcNow.ToString('o')
    Write-OwnedRuntimeStatus $state -Kind startup
    Start-Sleep -Seconds 10
  }
  $state.resumeReceived=[bool]$result
  $state.resumeSkipped=($result.skipped -eq 'operation_already_running')
  $state.resumeCompleted=[bool]$result.completed
  if($result.phase -match '^[a-z_]+$'){$state.resumePhase=$result.phase}
  if($result.failure -in @('owned_backend_operation_failed','owned_backend_not_ready')){$state.resumeFailure=$result.failure}
  foreach($field in @('engineLinux','engineExitCode','failureLine','errorType')){
    if($result.PSObject.Properties.Name -contains $field){$state['resume_'+$field]=$result.$field}
  }
  if(-not $result.completed){throw 'Installed local backend not ready.'}
  $phase='watching'
  $state.completed=$true;$state.phase=$phase;$state.checkedAt=[DateTime]::UtcNow.ToString('o')
  Write-OwnedRuntimeStatus $state -Kind startup
  $watch=Join-Path $PSScriptRoot 'watch-owned-windows.ps1'
  # Keep the supervisor attached to Task Scheduler, not the editor process.
  & $watch
} catch {
  $errorType=$_.Exception.GetType().FullName
  if($errorType -match '^[A-Za-z0-9_.]+$'){$state.errorType=$errorType}
  $errorId=$_.FullyQualifiedErrorId
  if($errorId -match '^[A-Za-z0-9_.,]+$'){$state.errorId=$errorId}
  $state.completed=$false;$state.phase=$phase;$state.failure='owned_startup_not_ready';$state.checkedAt=[DateTime]::UtcNow.ToString('o')
  if($_.Exception -is [Management.Automation.CommandNotFoundException]){$state.category='command_not_found'}
  elseif($_.Exception -is [UnauthorizedAccessException]){$state.category='access_denied'}
  else {$state.category='startup_failed'}
  Write-OwnedRuntimeStatus $state -Kind startup
  Write-Output 'WineSnap owned-local startup was not accepted. No hosted project was contacted.'
  exit 1
} finally {if($sessionLock){$sessionLock.Dispose()}}
exit 0
