param([ValidateSet('Status','Install','Resume','Verify','Stop')][string]$Action='Status')
$ErrorActionPreference='Stop'
if(-not $IsWindows){throw 'PowerShell 7 on Windows is required.'}
. (Join-Path $PSScriptRoot 'lib/owned-windows-runtime.ps1')
$directory=Assert-OwnedRuntimeDirectory
$report=[ordered]@{project='winesnap-owned-local';completed=$false;productionTouched=$false;dnsChanged=$false}
$lock=$null;$job=$null;$process=$null;$start=$null;$plain=$null;$payload=$null;$acquired=$false
function Read-TunnelPrivateStore([string]$Name) {
  if($Name -notin @('backend.dpapi','internet-tunnel.dpapi')){throw 'Unexpected connector store.'}
  $file=Join-Path $directory $Name;$item=Get-Item -LiteralPath $file -Force
  if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $item.Length -gt 32KB){throw 'Unsafe connector store.'}
  $acl=Get-Acl -LiteralPath $file
  if(-not $acl.AreAccessRulesProtected){throw 'Private connector permissions are required.'}
  $owner=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  foreach($rule in $acl.Access){
    $sid=$rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
    if($rule.AccessControlType -eq 'Allow' -and $sid -notin @($owner,'S-1-5-18')){throw 'Connector store permits another account.'}
  }
  $bytes=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($file),$null,'CurrentUser')
  try{return ([Text.Encoding]::UTF8.GetString($bytes)|ConvertFrom-Json -AsHashtable)}finally{[Array]::Clear($bytes,0,$bytes.Length)}
}
function Write-TunnelStatus([bool]$Control,[bool]$Enabled=$false) {
  $name=if($Control){'tunnel-control'}else{'tunnel'}
  $file=Join-Path $directory ($name+'-status.json');$pending=Join-Path $directory ($name+'-status.pending.json')
  foreach($path in @($file,$pending)){
    if(Test-Path -LiteralPath $path){$item=Get-Item -LiteralPath $path -Force;if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Redirected connector status.'}}
  }
  $value=if($Control){@{project='winesnap-owned-local';enabled=$Enabled;checkedAt=[DateTime]::UtcNow.ToString('o')}}else{$report}
  [IO.File]::WriteAllText($pending,($value|ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false))
  Move-Item -LiteralPath $pending -Destination $file -Force
}
try {
  if($Action -eq 'Status'){
    $report.encryptedStorePresent=Test-Path -LiteralPath (Join-Path $directory 'internet-tunnel.dpapi') -PathType Leaf
    $report.readOnly=$true;$report.completed=$true
  }else{
    $lock=Open-OwnedRuntimeLock -Name operation -WaitMs 120000
    if(-not $lock){$report.skipped='operation_already_running';throw 'Owned operation is busy.'}
    $acquired=$true
    if($Action -eq 'Stop'){Write-TunnelStatus -Control $true -Enabled $false}
    if($Action -ne 'Stop'){
      $ingress=Read-OwnedJobStatus 'ingress-control'
      if($ingress.enabled -ne $true){throw 'The private gate must be enabled first.'}
    }
    if($Action -eq 'Install'){
      $backup=Read-OwnedJobStatus 'gate-backup';$restore=Read-OwnedJobStatus 'gate-restore'
      if($backup.completed -ne $true -or $restore.completed -ne $true -or $backup.backupFile -ne $restore.backupFile){throw 'Matching encrypted gate backup and isolated restore are required.'}
    }
    $backend=Read-TunnelPrivateStore 'backend.dpapi'
    if($backend.project -ne 'winesnap-owned-local' -or $backend.version -ne 1 -or $backend.installationId -notmatch '^[a-f0-9]{32}$'){throw 'Unexpected owned installation.'}
    $data=@{installationId=$backend.installationId;tunnel=$null};$backend.Clear();$backend=$null
    if($Action -in @('Install','Resume')){$data.tunnel=Read-TunnelPrivateStore 'internet-tunnel.dpapi'}
    $payload=$data|ConvertTo-Json -Compress -Depth 5
    if($data.tunnel){$data.tunnel.Clear()};$data.Clear();$data=$null
    Initialize-OwnedProcessJob;$job=[WineSnapOwned.ProcessJob]::new()
    $start=[Diagnostics.ProcessStartInfo]::new()
    $start.FileName=Join-Path $HOME '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
    $start.WorkingDirectory=Split-Path -Parent $PSScriptRoot;$start.UseShellExecute=$false;$start.CreateNoWindow=$true
    $start.RedirectStandardInput=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
    $start.Environment.Clear()
    foreach($key in @('PATH','PATHEXT','COMSPEC','SystemRoot','WINDIR','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP')){
      $value=[Environment]::GetEnvironmentVariable($key);if($value){$start.Environment[$key]=$value}
    }
    $start.Environment['WINESNAP_OWNED_TUNNEL_PIPE']='1'
    $start.ArgumentList.Add((Join-Path $PSScriptRoot 'manage-owned-tunnel.mjs'));$start.ArgumentList.Add($Action)
    $process=[Diagnostics.Process]::Start($start);$job.Assign($process.Handle)
    $output=$process.StandardOutput.ReadToEndAsync();$errors=$process.StandardError.ReadToEndAsync()
    $process.StandardInput.Write($payload);$process.StandardInput.Close();$payload=$null
    if(-not $process.WaitForExit(380000)){throw 'Owned connector operation timed out.'}
    if(-not [Threading.Tasks.Task]::WaitAll([Threading.Tasks.Task[]]@($output,$errors),5000)){throw 'Connector output did not close.'}
    $raw=$output.GetAwaiter().GetResult();$errors.GetAwaiter().GetResult()|Out-Null
    if(-not $raw -or $raw.Length -gt 16KB){throw 'Unexpected connector output.'}
    $value=$raw|ConvertFrom-Json;$raw=$null
    if($value.project -ne 'winesnap-owned-local' -or $value.productionTouched -ne $false -or $value.dnsChanged -ne $false){throw 'Unexpected connector operation scope.'}
    foreach($property in $value.PSObject.Properties){
      if($property.Name -notin @('project','completed','productionTouched','dnsChanged','publishedPorts','connectorConnected','stopped','failure','phase')){throw 'Unexpected connector report field.'}
      $report[$property.Name]=$property.Value
    }
    if($process.ExitCode -ne 0){$report.completed=$false}
    if($Action -eq 'Install' -and $report.completed){Write-TunnelStatus -Control $true -Enabled $true}
  }
}catch{
  $report.completed=$false;$report.failure='owned_connector_not_ready';$report.errorType=$_.Exception.GetType().FullName
}finally{
  $payload=$null;$data=$null;$backend=$null
  if($plain){[Array]::Clear($plain,0,$plain.Length)}
  if($job){$job.Dispose()};if($process){$process.Dispose()};if($start){$start.Environment.Clear()}
  if($acquired){$report.checkedAt=[DateTime]::UtcNow.ToString('o');Write-TunnelStatus -Control $false}
  if($lock){$lock.Dispose()}
}
$report|ConvertTo-Json -Depth 4
if(-not $report.completed -and -not $report.skipped){exit 1}
