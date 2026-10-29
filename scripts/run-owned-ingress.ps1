param([ValidateSet('Status','Install','Resume','Restart','Verify','Stop')][string]$Action='Status')
$ErrorActionPreference='Stop'
if(-not $IsWindows){throw 'PowerShell 7 on Windows is required.'}
. (Join-Path $PSScriptRoot 'lib/owned-windows-runtime.ps1')
$directory=Assert-OwnedRuntimeDirectory
$report=[ordered]@{project='winesnap-owned-local';completed=$false;productionTouched=$false;publicTunnelStarted=$false;dnsChanged=$false}
$lock=$null;$job=$null;$process=$null;$start=$null;$bytes=$null;$payload=$null
function Read-PrivateStore([string]$Name) {
  if($Name -notin @('backend.dpapi','internet-gate.dpapi')){throw 'Unexpected private store.'}
  $file=Join-Path $directory $Name
  $item=Get-Item -LiteralPath $file -Force
  if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $item.Length -gt 32KB){throw 'Unsafe private store.'}
  $acl=Get-Acl -LiteralPath $file
  if(-not $acl.AreAccessRulesProtected){throw 'Private store permissions are required.'}
  $owner=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  foreach($rule in $acl.Access){
    $sid=$rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
    if($rule.AccessControlType -eq 'Allow' -and $sid -notin @($owner,'S-1-5-18')){throw 'Private store permits another account.'}
  }
  $plain=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($file),$null,'CurrentUser')
  try{return ([Text.Encoding]::UTF8.GetString($plain)|ConvertFrom-Json -AsHashtable)}finally{[Array]::Clear($plain,0,$plain.Length)}
}
try {
  if($Action -eq 'Status'){
    $report.encryptedGatePresent=Test-Path -LiteralPath (Join-Path $directory 'internet-gate.dpapi') -PathType Leaf
    $report.readOnly=$true;$report.completed=$true
  }else{
    $lock=Open-OwnedRuntimeLock -Name operation -WaitMs 120000
    if(-not $lock){$report.skipped='operation_already_running';throw 'Owned operation is busy.'}
    $backend=Read-PrivateStore 'backend.dpapi'
    if($backend.version -ne 1 -or $backend.project -ne 'winesnap-owned-local' -or $backend.installationId -notmatch '^[a-f0-9]{32}$'){throw 'Unexpected owned installation.'}
    $inputData=@{installationId=$backend.installationId;gate=$null};$backend.Clear();$backend=$null
    if($Action -notin @('Stop','Verify')){$inputData.gate=Read-PrivateStore 'internet-gate.dpapi'}
    $payload=$inputData|ConvertTo-Json -Depth 6 -Compress
    if($inputData.gate){$inputData.gate.Clear()};$inputData.Clear();$inputData=$null
    Initialize-OwnedProcessJob
    $job=[WineSnapOwned.ProcessJob]::new()
    $start=[Diagnostics.ProcessStartInfo]::new()
    $start.FileName=Join-Path $HOME '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
    $start.WorkingDirectory=Split-Path -Parent $PSScriptRoot
    $start.UseShellExecute=$false;$start.CreateNoWindow=$true
    $start.RedirectStandardInput=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
    $start.Environment.Clear()
    foreach($key in @('PATH','PATHEXT','COMSPEC','SystemRoot','WINDIR','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP')){
      $value=[Environment]::GetEnvironmentVariable($key);if($value){$start.Environment[$key]=$value}
    }
    $start.Environment['WINESNAP_OWNED_INGRESS_PIPE']='1'
    $start.ArgumentList.Add((Join-Path $PSScriptRoot 'manage-owned-ingress.mjs'));$start.ArgumentList.Add($Action)
    $process=[Diagnostics.Process]::Start($start);$job.Assign($process.Handle)
    $output=$process.StandardOutput.ReadToEndAsync();$errors=$process.StandardError.ReadToEndAsync()
    $process.StandardInput.Write($payload);$process.StandardInput.Close();$payload=$null
    if(-not $process.WaitForExit(260000)){throw 'Private ingress operation timed out.'}
    if(-not [Threading.Tasks.Task]::WaitAll([Threading.Tasks.Task[]]@($output,$errors),5000)){throw 'Private operation output did not close.'}
    $raw=$output.GetAwaiter().GetResult();$errors.GetAwaiter().GetResult()|Out-Null
    if(-not $raw -or $raw.Length -gt 16KB){throw 'Unexpected private ingress report.'}
    $value=$raw|ConvertFrom-Json
    if($value.project -ne 'winesnap-owned-local' -or $value.publicTunnelStarted -ne $false -or $value.dnsChanged -ne $false){throw 'Unexpected ingress operation scope.'}
    foreach($property in $value.PSObject.Properties){
      if($property.Name -notin @('project','completed','productionTouched','publicTunnelStarted','dnsChanged','publishedPorts','stopped','denials','durableRegulationStorage','failure','phase')){throw 'Unexpected report field.'}
      $report[$property.Name]=$property.Value
    }
    if($process.ExitCode -ne 0){$report.completed=$false}
  }
}catch{
  $report.failure='private_ingress_not_ready';$report.completed=$false
  $report.errorType=$_.Exception.GetType().FullName
}finally{
  $payload=$null;$inputData=$null;$backend=$null
  if($bytes){[Array]::Clear($bytes,0,$bytes.Length)}
  if($job){$job.Dispose()};if($process){$process.Dispose()};if($start){$start.Environment.Clear()}
  if($lock){$lock.Dispose()}
}
$report|ConvertTo-Json -Depth 4
if(-not $report.completed -and -not $report.skipped){exit 1}
