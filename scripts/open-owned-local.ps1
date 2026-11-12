param([ValidateSet('Open','Check','Status')][string]$Action='Open',[string]$OwnerEmail)
$ErrorActionPreference='Stop'
if(-not $IsWindows){throw 'PowerShell 7 on Windows is required.'}
. (Join-Path $PSScriptRoot 'lib/owned-windows-runtime.ps1')
. (Join-Path $PSScriptRoot 'lib/owned-device-access.ps1')
$directory=Assert-OwnedRuntimeDirectory
$statusFile=Join-Path $directory 'local-view-status.json'
$viewLock=$null;$lock=$null;$job=$null;$process=$null;$start=$null;$keys=$null;$payload=$null;$ownsView=$false
$report=[ordered]@{project='winesnap-owned-local';completed=$false;ready=$false;productionTouched=$false;loopbackOnly=$true}
function Assert-LocalPrivateFile([string]$Path) {
  $item=Get-Item -LiteralPath $Path -Force
  if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $item.Length -gt 32KB){throw 'Unexpected local operator file.'}
  $acl=Get-Acl -LiteralPath $Path
  if(-not $acl.AreAccessRulesProtected){throw 'Protected local operator file required.'}
  $owner=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  foreach($rule in $acl.Access){$sid=$rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value;if($rule.AccessControlType -eq 'Allow' -and $sid -notin @($owner,'S-1-5-18')){throw 'Foreign local operator permissions.'}}
}
function Protect-LocalReport {
  if(Test-Path -LiteralPath $statusFile){Assert-LocalPrivateFile $statusFile}
  else{[IO.File]::WriteAllText($statusFile,'{}')}
  $acl=[Security.AccessControl.FileSecurity]::new();$acl.SetAccessRuleProtection($true,$false)
  $owner=[Security.Principal.WindowsIdentity]::GetCurrent().User;$acl.SetOwner($owner)
  foreach($sid in @($owner,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'))){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','Allow'))}
  [IO.FileSystemAclExtensions]::SetAccessControl((Get-Item -LiteralPath $statusFile),$acl)
  Assert-LocalPrivateFile $statusFile
}
function Read-LocalReport {
  Assert-LocalPrivateFile $statusFile
  $value=Get-Content -LiteralPath $statusFile -Raw|ConvertFrom-Json
  if($value.project -ne 'winesnap-owned-local' -or $value.productionTouched -ne $false -or $value.loopbackOnly -ne $true){throw 'Unexpected local view scope.'}
  return $value|Select-Object project,completed,ready,productionTouched,loopbackOnly,internetPaused,acceptance,ownerSessionVerified,app,phase,blockedExternalRequests,blockedAiRequests,probeSessionLoggedOut,failure,errorType,checkedAt
}
try {
  if($Action -eq 'Status'){$report=Read-LocalReport;$report|ConvertTo-Json;exit 0}
  if($OwnerEmail -cnotmatch '^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$'){throw 'Explicit owner email required.'}
  $lockPath=Join-Path $directory 'local-view.lock'
  if(Test-Path -LiteralPath $lockPath){$item=Get-Item -LiteralPath $lockPath -Force;if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Unexpected local view lock.'}}
  try{$viewLock=[IO.File]::Open($lockPath,[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None);$ownsView=$true}
  catch [IO.IOException]{if(($_.Exception.HResult -band 0xffff) -in @(32,33)){[pscustomobject]@{project='winesnap-owned-local';alreadyOpen=$true;productionTouched=$false}|ConvertTo-Json;if($Action -eq 'Check'){exit 1}else{exit 0}};throw}
  $lock=Open-OwnedRuntimeLock -Name operation -WaitMs 120000
  if(-not $lock){throw 'Owned operation is busy.'}
  $store=Join-Path $directory 'backend.dpapi';Assert-LocalPrivateFile $store
  $plain=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($store),$null,'CurrentUser')
  try{$keys=[Text.Encoding]::UTF8.GetString($plain)|ConvertFrom-Json -AsHashtable}finally{[Array]::Clear($plain,0,$plain.Length)}
  if($keys.project -ne 'winesnap-owned-local' -or $keys.installationId -notmatch '^[a-f0-9]{32}$'){throw 'Unexpected owned installation.'}
  $binding=Read-OwnedDeviceAccess -InstallationId $keys.installationId
  if(-not $binding -or -not $binding.enabled){throw 'Existing owner binding required.'}
  $tunnel=Read-OwnedJobStatus 'tunnel-control'
  if($tunnel.enabled -ne $false){throw 'Pause owned internet before local-only development.'}
  Protect-LocalReport
  $report.phase='opening_local_owner';$report.checkedAt=[DateTime]::UtcNow.ToString('o')
  [IO.File]::WriteAllText($statusFile,($report|ConvertTo-Json))
  $payload=@{keys=$keys;binding=$binding;ownerEmail=$OwnerEmail}|ConvertTo-Json -Depth 5 -Compress
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
}catch{$report=[ordered]@{project='winesnap-owned-local';completed=$false;ready=$false;productionTouched=$false;loopbackOnly=$true;failure='owned_local_view_not_ready';errorType=$_.Exception.GetType().Name;checkedAt=[DateTime]::UtcNow.ToString('o')};if($ownsView){Protect-LocalReport;[IO.File]::WriteAllText($statusFile,($report|ConvertTo-Json))}}
finally{$payload=$null;if($keys){$keys.Clear()};if($lock){$lock.Dispose()};if($viewLock){$viewLock.Dispose()};if($job){$job.Dispose()};if($process){$process.Dispose()};if($start){$start.Environment.Clear()}}
$report|ConvertTo-Json
if(-not $report.completed){exit 1}
