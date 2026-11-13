param([ValidateSet('Open','Check','Status')][string]$Action='Open',[string]$OwnerEmail)
$ErrorActionPreference='Stop'
if(-not $IsWindows){throw 'PowerShell 7 on Windows is required.'}
. (Join-Path $PSScriptRoot 'lib/owned-windows-runtime.ps1')
. (Join-Path $PSScriptRoot 'lib/owned-device-access.ps1')
$directory=Assert-OwnedRuntimeDirectory
$statusFile=Join-Path $directory 'local-view-status.json'
$controlFile=Join-Path $directory 'local-view-control.json'
$viewLock=$null;$lock=$null;$job=$null;$process=$null;$start=$null;$keys=$null;$payload=$null;$ownsView=$false
$report=[ordered]@{project='winesnap-owned-local';version=2;completed=$false;ready=$false;authenticated=$false;viewerRunning=$false;productionTouched=$false;loopbackOnly=$true;runId=[guid]::NewGuid().ToString('D')}
function Assert-LocalPrivateFile([string]$Path) {
  $item=Get-Item -LiteralPath $Path -Force
  if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $item.Length -gt 32KB){throw 'Unexpected local operator file.'}
  $acl=Get-Acl -LiteralPath $Path
  if(-not $acl.AreAccessRulesProtected){throw 'Protected local operator file required.'}
  $owner=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  foreach($rule in $acl.Access){$sid=$rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value;if($rule.AccessControlType -eq 'Allow' -and $sid -notin @($owner,'S-1-5-18')){throw 'Foreign local operator permissions.'}}
}
function Protect-LocalReport([string]$Path=$statusFile) {
  if($Path -cnotin @($statusFile,$controlFile)){throw 'Unexpected local report path.'}
  if(Test-Path -LiteralPath $Path){Assert-LocalPrivateFile $Path}
  else{[IO.File]::WriteAllText($Path,'{}')}
  $acl=[Security.AccessControl.FileSecurity]::new();$acl.SetAccessRuleProtection($true,$false)
  $owner=[Security.Principal.WindowsIdentity]::GetCurrent().User;$acl.SetOwner($owner)
  foreach($sid in @($owner,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'))){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','Allow'))}
  [IO.FileSystemAclExtensions]::SetAccessControl((Get-Item -LiteralPath $Path),$acl)
  Assert-LocalPrivateFile $Path
}
function Read-LocalReport {
  Assert-LocalPrivateFile $statusFile
  $value=Get-Content -LiteralPath $statusFile -Raw|ConvertFrom-Json
  if($value.project -ne 'winesnap-owned-local' -or $value.productionTouched -ne $false -or $value.loopbackOnly -ne $true){throw 'Unexpected local view scope.'}
  return $value|Select-Object project,version,runId,completed,ready,authenticated,viewerRunning,supportsFocus,lastFocusRequestId,focusResult,lastVerifiedAt,productionTouched,loopbackOnly,internetPaused,acceptance,ownerSessionVerified,app,phase,blockedExternalRequests,blockedAiRequests,probeSessionLoggedOut,failure,errorType,checkedAt
}
function Test-LocalViewerActive {
  $path=Join-Path $directory 'local-view.lock'
  if(-not (Test-Path -LiteralPath $path)){return $false}
  $item=Get-Item -LiteralPath $path -Force
  if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Unexpected viewer lock.'}
  try{$handle=[IO.File]::Open($path,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None);$handle.Dispose();return $false}
  catch [IO.IOException]{if(($_.Exception.HResult -band 0xffff) -in @(32,33)){return $true};throw}
}
function Show-LocalOpenMessage([ValidateSet('starting','legacy','unavailable','focus_failed')][string]$Kind) {
  if($Action -ne 'Open'){return}
  $pwsh=Join-Path $HOME '.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe'
  Start-Process -FilePath $pwsh -WindowStyle Normal -ArgumentList @('-NoProfile','-STA','-File',('"'+(Join-Path $PSScriptRoot 'show-owned-local-message.ps1')+'"'),'-Kind',$Kind)|Out-Null
}
function Get-LocalStatus([DateTimeOffset]$Now=[DateTimeOffset]::UtcNow) {
  $value=Read-LocalReport
  $active=Test-LocalViewerActive
  $value|Add-Member NoteProperty operatorActive $active -Force
  $value|Add-Member NoteProperty observedAt ($Now.ToUniversalTime().ToString('o')) -Force
  $fresh=$false
  try{$stamp=[DateTimeOffset]$value.checkedAt;$age=($Now-$stamp).TotalSeconds;$fresh=$age -ge -5 -and $age -le 30}catch{}
  $value|Add-Member NoteProperty heartbeatFresh $fresh -Force
  if(-not $active){$value.ready=$false;$value.authenticated=$false;$value.viewerRunning=$false;if($value.phase -notin @('complete','closed','needs_attention')){$value.phase='interrupted'}}
  elseif($value.version -ne 2){$value.ready=$false;$value.authenticated=$false;$value.phase='legacy_viewer'}
  elseif(-not $fresh){$value.ready=$false;$value.authenticated=$false;$value.phase='unresponsive'}
  return $value
}
function Focus-LocalViewer {
  $current=Read-LocalReport
  if($current.version -ne 2 -or $current.supportsFocus -ne $true -or $current.runId -notmatch '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'){Show-LocalOpenMessage legacy;return [pscustomobject]@{alreadyOpen=$true;focused=$false;phase='legacy_viewer';productionTouched=$false}}
  Protect-LocalReport $controlFile
  $requestId=[guid]::NewGuid().ToString('D')
  $request=@{project='winesnap-owned-local';version=1;action='focus';runId=$current.runId;requestId=$requestId;issuedAt=[DateTime]::UtcNow.ToString('o')}
  [IO.File]::WriteAllText($controlFile,($request|ConvertTo-Json -Compress))
  $deadline=[DateTimeOffset]::UtcNow.AddSeconds(15)
  do{
    try{$reply=Read-LocalReport;if($reply.runId -eq $current.runId -and $reply.lastFocusRequestId -eq $requestId){$focused=$reply.focusResult -eq 'focused';if(-not $focused){Show-LocalOpenMessage focus_failed};return [pscustomobject]@{alreadyOpen=$true;focused=$focused;phase=$reply.phase;productionTouched=$false}}}catch{}
    Start-Sleep -Milliseconds 250
  }while([DateTimeOffset]::UtcNow -lt $deadline)
  Show-LocalOpenMessage $(if($current.ready){'focus_failed'}else{'starting'})
  return [pscustomobject]@{alreadyOpen=$true;focused=$false;phase='focus_not_confirmed';productionTouched=$false}
}
function Resume-LocalBackend {
  for($attempt=0;$attempt -lt 3;$attempt++){
    $result=Invoke-OwnedRuntimeAction -Action Resume
    if($result.project -ne 'winesnap-owned-local' -or $result.productionTouched -ne $false -or $result.hostedTestTouched -ne $false){throw 'Unexpected startup scope.'}
    if($result.completed -eq $true){return}
    if($result.skipped -ne 'operation_already_running'){throw 'Existing owned runtime could not resume.'}
    Start-Sleep -Seconds 2
  }
  throw 'Owned runtime is busy.'
}
try {
  if($Action -eq 'Status'){$report=Get-LocalStatus;$report|ConvertTo-Json;exit 0}
  if($OwnerEmail -cnotmatch '^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$'){throw 'Explicit owner email required.'}
  $lockPath=Join-Path $directory 'local-view.lock'
  if(Test-Path -LiteralPath $lockPath){$item=Get-Item -LiteralPath $lockPath -Force;if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Unexpected local view lock.'}}
  try{$viewLock=[IO.File]::Open($lockPath,[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None);$ownsView=$true}
  catch [IO.IOException]{if(($_.Exception.HResult -band 0xffff) -in @(32,33)){if($Action -eq 'Check'){[pscustomobject]@{alreadyOpen=$true;productionTouched=$false}|ConvertTo-Json;exit 1}else{Focus-LocalViewer|ConvertTo-Json;exit 0}};throw}
  $store=Join-Path $directory 'backend.dpapi';Assert-LocalPrivateFile $store
  $plain=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($store),$null,'CurrentUser')
  try{$keys=[Text.Encoding]::UTF8.GetString($plain)|ConvertFrom-Json -AsHashtable}finally{[Array]::Clear($plain,0,$plain.Length)}
  if($keys.project -ne 'winesnap-owned-local' -or $keys.installationId -notmatch '^[a-f0-9]{32}$'){throw 'Unexpected owned installation.'}
  $binding=Read-OwnedDeviceAccess -InstallationId $keys.installationId
  if(-not $binding -or -not $binding.enabled){throw 'Existing owner binding required.'}
  $tunnel=Read-OwnedJobStatus 'tunnel-control'
  if($tunnel.enabled -ne $false){throw 'Pause owned internet before local-only development.'}
  Protect-LocalReport
  Protect-LocalReport $controlFile
  $report.phase='starting_backend';$report.checkedAt=[DateTime]::UtcNow.ToString('o')
  [IO.File]::WriteAllText($statusFile,($report|ConvertTo-Json))
  Resume-LocalBackend
  $lock=Open-OwnedRuntimeLock -Name operation -WaitMs 120000
  if(-not $lock){throw 'Owned operation is busy.'}
  $binding=Read-OwnedDeviceAccess -InstallationId $keys.installationId
  if(-not $binding -or -not $binding.enabled){throw 'Owner binding changed during startup.'}
  $report.phase='opening_local_owner';$report.checkedAt=[DateTime]::UtcNow.ToString('o')
  [IO.File]::WriteAllText($statusFile,($report|ConvertTo-Json))
  $payload=@{keys=$keys;binding=$binding;ownerEmail=$OwnerEmail;runId=$report.runId}|ConvertTo-Json -Depth 5 -Compress
  $keys.Clear();$keys=$null;$binding=$null
  Initialize-OwnedProcessJob;$job=[WineSnapOwned.ProcessJob]::new()
  $start=[Diagnostics.ProcessStartInfo]::new();$start.FileName=Join-Path $HOME '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
  $start.WorkingDirectory=Split-Path -Parent $PSScriptRoot;$start.UseShellExecute=$false;$start.CreateNoWindow=$true
  $start.RedirectStandardInput=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
  $start.Environment.Clear()
  foreach($name in @('PATH','PATHEXT','COMSPEC','SystemRoot','WINDIR','SystemDrive','ProgramData','ProgramFiles','ProgramFiles(x86)','ALLUSERSPROFILE','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP')){$value=[Environment]::GetEnvironmentVariable($name);if($value){$start.Environment[$name]=$value}}
  $start.Environment['WINESNAP_OWNED_LOCAL_VIEW_PIPE']='1'
  $start.ArgumentList.Add((Join-Path $PSScriptRoot 'open-owned-local-worker.mjs'));$start.ArgumentList.Add($Action)
  $process=[Diagnostics.Process]::Start($start);$job.Assign($process.Handle)
  $output=$process.StandardOutput.ReadToEndAsync();$errors=$process.StandardError.ReadToEndAsync()
  $process.StandardInput.Write($payload);$process.StandardInput.Close();$payload=$null
  $deadline=[DateTimeOffset]::UtcNow.AddSeconds(120)
  while(-not $process.HasExited){
    if([DateTimeOffset]::UtcNow -ge $deadline){throw 'Local app did not become ready.'}
    try{$progress=Read-LocalReport}catch{Start-Sleep -Milliseconds 200;continue}
    if($progress.ready -eq $true -and $progress.ownerSessionVerified -eq $true){$lock.Dispose();$lock=$null;break}
    Start-Sleep -Milliseconds 500
  }
  if($Action -eq 'Check'){if(-not $process.WaitForExit(30000)){throw 'Local login check timed out.'}}else{$process.WaitForExit()}
  if(-not [Threading.Tasks.Task]::WaitAll([Threading.Tasks.Task[]]@($output,$errors),5000)){throw 'Local operator did not close.'}
  $raw=$output.GetAwaiter().GetResult();$errors.GetAwaiter().GetResult()|Out-Null
  if(-not $raw -or $raw.Length -gt 16KB){throw 'Unexpected local operator result.'}
  $value=$raw|ConvertFrom-Json;$raw=$null
  if($value.project -ne 'winesnap-owned-local' -or $value.productionTouched -ne $false -or $value.loopbackOnly -ne $true -or $value.completed -ne $true -or $process.ExitCode -ne 0){throw 'Local view was not accepted.'}
  $report=Read-LocalReport
}catch{$report=[ordered]@{project='winesnap-owned-local';version=2;completed=$false;ready=$false;authenticated=$false;viewerRunning=$false;productionTouched=$false;loopbackOnly=$true;phase='needs_attention';failure='owned_local_view_not_ready';errorType=$_.Exception.GetType().Name;checkedAt=[DateTime]::UtcNow.ToString('o')};if($ownsView){Protect-LocalReport;[IO.File]::WriteAllText($statusFile,($report|ConvertTo-Json))};Show-LocalOpenMessage unavailable}
finally{$payload=$null;if($keys){$keys.Clear()};if($lock){$lock.Dispose()};if($viewLock){$viewLock.Dispose()};if($job){$job.Dispose()};if($process){$process.Dispose()};if($start){$start.Environment.Clear()}}
$report|ConvertTo-Json
if(-not $report.completed){exit 1}
