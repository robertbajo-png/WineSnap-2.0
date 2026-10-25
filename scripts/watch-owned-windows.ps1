param([switch]$Once)
$ErrorActionPreference='Stop'
if(-not $IsWindows){throw 'PowerShell 7 on Windows is required.'}
$directory=Join-Path $env:LOCALAPPDATA 'WineSnapOwned'
$mutex=[Threading.Mutex]::new($false,"Local\WineSnap-Owned-Watch-$([Security.Principal.WindowsIdentity]::GetCurrent().User.Value)")
$acquired=$false
function Due($Last,[double]$Hours) {
  if(-not $Last){return $true}
  $hoursToWait=if($Last.completed){$Hours}else{1.0/6}
  return ([DateTimeOffset]$Last.checkedAt) -lt [DateTimeOffset]::UtcNow.AddHours(-$hoursToWait)
}
try {
  try{$acquired=$mutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$acquired=$true}
  if(-not $acquired){exit 0}
  do {
    $state=[ordered]@{project='winesnap-owned-local';completed=$false;productionTouched=$false;hostedTestTouched=$false;checkedAt=[DateTime]::UtcNow.ToString('o')}
    try {
      $raw=& (Join-Path $PSScriptRoot 'run-owned-windows.ps1') -Action Verify
      $verified=$raw | ConvertFrom-Json
      if(-not $verified.completed){throw 'Local services are not running.'}
      $state.completed=$true;$state.jobsHealthy=$true
      foreach($job in @(@{Action='Maintain';Hours=1},@{Action='Backup';Hours=24})){
        $file=Join-Path $directory ($job.Action.ToLowerInvariant()+'-status.json')
        $last=if(Test-Path -LiteralPath $file){Get-Content -LiteralPath $file -Raw | ConvertFrom-Json}else{$null}
        if(Due $last $job.Hours){
          & (Join-Path $PSScriptRoot 'run-owned-windows.ps1') -Action $job.Action | Out-Null
          $last=Get-Content -LiteralPath $file -Raw | ConvertFrom-Json
        }
        if(-not $last.completed){$state.jobsHealthy=$false}
      }
    } catch {$state.failure='owned_local_watch_not_ready'}
    $state.finishedAt=[DateTime]::UtcNow.ToString('o')
    $state | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $directory 'watch-status.json') -Encoding utf8
    if(-not $Once){Start-Sleep -Seconds 60}
  } while(-not $Once)
} finally {if($acquired){$mutex.ReleaseMutex()};$mutex.Dispose()}
if($Once -and (-not $state.completed -or -not $state.jobsHealthy)){exit 1}
exit 0
