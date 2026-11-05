param([ValidateSet('Status','Install','Resume','Restart','Verify','Stop','Backup','Rehearse')][string]$Action='Status')
$ErrorActionPreference='Stop'
if(-not $IsWindows){throw 'PowerShell 7 on Windows is required.'}
. (Join-Path $PSScriptRoot 'lib/owned-windows-runtime.ps1')
. (Join-Path $PSScriptRoot 'lib/owned-device-access.ps1')
$directory=Assert-OwnedRuntimeDirectory
$report=[ordered]@{project='winesnap-owned-local';completed=$false;productionTouched=$false;publicTunnelStarted=$false;dnsChanged=$false}
$lock=$null;$job=$null;$process=$null;$start=$null;$bytes=$null;$payload=$null;$acquired=$false
function Get-PrivateFile([string]$Name) {
  if($Name -notin @('backend.dpapi','internet-gate.dpapi','internet-tunnel.dpapi')){throw 'Unexpected private store.'}
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
  return $file
}
function Read-PrivateStore([string]$Name) {
  $file=Get-PrivateFile $Name
  $plain=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($file),$null,'CurrentUser')
  try{return ([Text.Encoding]::UTF8.GetString($plain)|ConvertFrom-Json -AsHashtable)}finally{[Array]::Clear($plain,0,$plain.Length)}
}
function Write-PrivateStatus([string]$Name,$Value) {
  if($Name -notin @('ingress-control','ingress','gate-backup','gate-restore')){throw 'Unexpected ingress status.'}
  if($Value -is [System.Collections.IDictionary] -and -not $Value.Contains('checkedAt')){$Value['checkedAt']=[DateTime]::UtcNow.ToString('o')}
  $file=Join-Path $directory ($Name+'-status.json');$pending=Join-Path $directory ($Name+'-status.pending.json')
  foreach($path in @($file,$pending)){
    if(Test-Path -LiteralPath $path){$item=Get-Item -LiteralPath $path -Force;if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Redirected ingress status.'}}
  }
  [IO.File]::WriteAllText($pending,($Value|ConvertTo-Json -Depth 6),[Text.UTF8Encoding]::new($false))
  Move-Item -LiteralPath $pending -Destination $file -Force
}
function Get-BackupDirectory {
  $path=Join-Path $directory 'internet-backups'
  if(Test-Path -LiteralPath $path){
    $item=Get-Item -LiteralPath $path -Force
    if(-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Unsafe gate backup directory.'}
  }else{New-Item -ItemType Directory -Path $path|Out-Null}
  $acl=Get-Acl -LiteralPath $path
  $owner=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  foreach($rule in $acl.Access){$sid=$rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value;if($rule.AccessControlType -eq 'Allow' -and $sid -notin @($owner,'S-1-5-18')){throw 'Gate backup directory permits another account.'}}
  $acl.SetAccessRuleProtection($true,$true)
  [IO.FileSystemAclExtensions]::SetAccessControl((Get-Item -LiteralPath $path),$acl)
  return $path
}
try {
  if($Action -eq 'Status'){
    $report.encryptedGatePresent=Test-Path -LiteralPath (Join-Path $directory 'internet-gate.dpapi') -PathType Leaf
    $report.readOnly=$true;$report.completed=$true
  }else{
    $lock=Open-OwnedRuntimeLock -Name operation -WaitMs 120000
    if(-not $lock){$report.skipped='operation_already_running';throw 'Owned operation is busy.'}
    $acquired=$true
    if($Action -eq 'Stop'){Write-PrivateStatus 'ingress-control' @{project='winesnap-owned-local';enabled=$false}}
    $backend=Read-PrivateStore 'backend.dpapi'
    if($backend.version -ne 1 -or $backend.project -ne 'winesnap-owned-local' -or $backend.installationId -notmatch '^[a-f0-9]{32}$'){throw 'Unexpected owned installation.'}
    $deviceBinding=Read-OwnedDeviceAccess -InstallationId $backend.installationId
    $inputData=@{installationId=$backend.installationId;gate=$null};$backend.Clear();$backend=$null
    if($Action -notin @('Stop','Verify','Rehearse')){$inputData.gate=Read-PrivateStore 'internet-gate.dpapi'}
    if($Action -eq 'Rehearse'){
      $backups=Get-BackupDirectory
      $latest=Get-ChildItem -LiteralPath $backups -File|Where-Object {$_.Name -match '^gate-\d{8}-\d{9}\.dpapi$'}|Sort-Object Name -Descending|Select-Object -First 1
      if(-not $latest -or ($latest.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $latest.Length -gt 32MB){throw 'No bounded gate archive is available.'}
      $bytes=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($latest.FullName),$null,'CurrentUser')
      $saved=[Text.Encoding]::UTF8.GetString($bytes)|ConvertFrom-Json -AsHashtable
      [Array]::Clear($bytes,0,$bytes.Length);$bytes=$null
      if($saved.project -ne 'winesnap-owned-local' -or $saved.installationId -ne $inputData.installationId -or -not $saved.gateStore){throw 'Unexpected gate backup scope.'}
      foreach($slot in @('gateStore','tunnelStore')){
        if(-not $saved[$slot]){if($slot -eq 'gateStore'){throw 'Missing backed-up gate credential.'};continue}
        $recoveredBytes=[Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($saved[$slot]),$null,'CurrentUser')
        try{
          $recovered=[Text.Encoding]::UTF8.GetString($recoveredBytes)|ConvertFrom-Json
          if($recovered.project -ne 'winesnap-owned-local' -or $recovered.version -ne 1 -or $recovered.hostname -ne 'winesnap.boleoai.se'){throw 'Credential recovery scope mismatch.'}
          if($slot -eq 'gateStore'){
            if($recovered.username -ne 'robert' -or $recovered.passwordHash -notmatch '^\$argon2id\$v=19\$m=65536,t=3,p=4\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$'){throw 'Invalid recovered owner credential.'}
            foreach($key in @('sessionSecret','storageKey','resetSecret')){if($recovered.$key -notmatch '^[a-f0-9]{64}$'){throw 'Invalid recovered gate key.'}}
          }elseif($recovered.accountId -ne 'e52a9db99ad554c58db919e0c8296e81' -or $recovered.tunnelId -ne '3c24ecc7-ab97-48dc-95ff-7d72c84918d0' -or $recovered.token -notmatch '^[A-Za-z0-9+/_=-]{100,8192}$'){throw 'Invalid recovered tunnel identity.'}
        }finally{[Array]::Clear($recoveredBytes,0,$recoveredBytes.Length);$recovered=$null}
      }
      $saved.Remove('gateStore')|Out-Null;$saved.Remove('tunnelStore')|Out-Null
      $inputData.archive=$saved;$saved=$null
    }
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
    if($deviceBinding -and $deviceBinding.enabled){$start.Environment['WINESNAP_OWNED_DEVICE_ACCESS']='1'}
    $start.ArgumentList.Add((Join-Path $PSScriptRoot 'manage-owned-ingress.mjs'));$start.ArgumentList.Add($Action)
    $process=[Diagnostics.Process]::Start($start);$job.Assign($process.Handle)
    $output=$process.StandardOutput.ReadToEndAsync();$errors=$process.StandardError.ReadToEndAsync()
    $process.StandardInput.Write($payload);$process.StandardInput.Close();$payload=$null
    if(-not $process.WaitForExit(260000)){throw 'Private ingress operation timed out.'}
    if(-not [Threading.Tasks.Task]::WaitAll([Threading.Tasks.Task[]]@($output,$errors),5000)){throw 'Private operation output did not close.'}
    $raw=$output.GetAwaiter().GetResult();$errors.GetAwaiter().GetResult()|Out-Null
    if(-not $raw -or $raw.Length -gt $(if($Action -eq 'Backup'){32MB}else{16KB})){throw 'Unexpected private ingress report.'}
    $value=$raw|ConvertFrom-Json
    $raw=$null
    if($Action -eq 'Backup' -and $value.report.completed -eq $true -and $value.archive){
      if($value.archive.project -ne 'winesnap-owned-local' -or $value.archive.format -ne 'owned-private-gate-sqlite-v1'){throw 'Unexpected private gate backup.'}
      $value.archive|Add-Member -NotePropertyName gateStore -NotePropertyValue ([Convert]::ToBase64String([IO.File]::ReadAllBytes((Get-PrivateFile 'internet-gate.dpapi'))))
      $tunnelFile=Join-Path $directory 'internet-tunnel.dpapi'
      if(Test-Path -LiteralPath $tunnelFile){$value.archive|Add-Member -NotePropertyName tunnelStore -NotePropertyValue ([Convert]::ToBase64String([IO.File]::ReadAllBytes((Get-PrivateFile 'internet-tunnel.dpapi'))))}
      $bytes=[Text.Encoding]::UTF8.GetBytes(($value.archive|ConvertTo-Json -Depth 8 -Compress))
      $cipher=[Security.Cryptography.ProtectedData]::Protect($bytes,$null,'CurrentUser')
      $name='gate-'+[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmssfff')+'.dpapi'
      $backups=Get-BackupDirectory;$file=Join-Path $backups $name
      $handle=[IO.File]::Open($file,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
      try{$handle.Write($cipher,0,$cipher.Length)}finally{$handle.Dispose()}
      $roundtrip=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($file),$null,'CurrentUser')
      try{if(-not [Security.Cryptography.CryptographicOperations]::FixedTimeEquals([Security.Cryptography.SHA256]::HashData($bytes),[Security.Cryptography.SHA256]::HashData($roundtrip))){throw 'Gate backup encryption check failed.'}}finally{[Array]::Clear($roundtrip,0,$roundtrip.Length)}
      [Array]::Clear($bytes,0,$bytes.Length);$bytes=$null
      $safe=$value.report;$value=$null;$value=$safe
      $value|Add-Member -NotePropertyName backupFile -NotePropertyValue $name
      $value|Add-Member -NotePropertyName encryptedRoundtripVerified -NotePropertyValue $true
      $files=@(Get-ChildItem -LiteralPath $backups -File|Where-Object {$_.Name -match '^gate-\d{8}-\d{9}\.dpapi$'}|Sort-Object Name -Descending)
      for($i=0;$i -lt $files.Count;$i++){
        if($files[$i].Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected old gate archive.'}
        if($i -ge 7 -or $files[$i].LastWriteTimeUtc -lt [DateTime]::UtcNow.AddDays(-7)){Remove-Item -LiteralPath $files[$i].FullName}
      }
    }
    if($value.project -ne 'winesnap-owned-local' -or $value.publicTunnelStarted -ne $false -or $value.dnsChanged -ne $false){throw 'Unexpected ingress operation scope.'}
    foreach($property in $value.PSObject.Properties){
      if($property.Name -notin @('project','completed','productionTouched','publicTunnelStarted','dnsChanged','publishedPorts','stopped','denials','durableRegulationStorage','failure','phase','backupQuiesced','backupFiles','resumedAfterBackup','backupFile','encryptedRoundtripVerified','restored','integrity','tables','files','cleanupCompleted','portableRecoveryVerified')){throw 'Unexpected report field.'}
      $report[$property.Name]=$property.Value
    }
    if($process.ExitCode -ne 0){$report.completed=$false}
    if($Action -eq 'Rehearse' -and $report.completed){$report.backupFile=$latest.Name;$report.credentialRecoveryVerified=$true}
    if($report.completed -and $Action -in @('Install','Restart')){Write-PrivateStatus 'ingress-control' @{project='winesnap-owned-local';enabled=$true}}
  }
}catch{
  $report.failure='private_ingress_not_ready';$report.completed=$false
  $report.errorType=$_.Exception.GetType().FullName
}finally{
  $payload=$null;$inputData=$null;$backend=$null
  if($bytes){[Array]::Clear($bytes,0,$bytes.Length)}
  if($job){$job.Dispose()};if($process){$process.Dispose()};if($start){$start.Environment.Clear()}
  if($acquired){
    $report.checkedAt=[DateTime]::UtcNow.ToString('o')
    $kind=if($Action -eq 'Backup'){'gate-backup'}elseif($Action -eq 'Rehearse'){'gate-restore'}else{'ingress'}
    Write-PrivateStatus $kind $report
  }
  if($lock){$lock.Dispose()}
}
$report|ConvertTo-Json -Depth 4
if(-not $report.completed -and -not $report.skipped){exit 1}
