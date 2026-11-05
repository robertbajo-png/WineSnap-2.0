param([ValidateSet('Status','Prepare','Enable','Enroll')][string]$Action='Status',[string]$OwnerEmail)
$ErrorActionPreference='Stop'
if(-not $IsWindows){throw 'PowerShell 7 on Windows is required.'}
. (Join-Path $PSScriptRoot 'lib/owned-windows-runtime.ps1')
. (Join-Path $PSScriptRoot 'lib/owned-device-access.ps1')
$directory=Assert-OwnedRuntimeDirectory
$node=Join-Path $HOME '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
$pwsh=Join-Path $HOME '.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe'
$lock=$null;$keys=$null;$gate=$null;$enrollment=$null;$process=$null;$job=$null;$payload=$null;$start=$null
$report=[ordered]@{project='winesnap-owned-local';completed=$false;productionTouched=$false;phase='preflight';passwordlessEnabled=$false;publicAccessOpened=$false}
function Assert-File([string]$Path) {
  $item=Get-Item -LiteralPath $Path -Force
  if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $item.Length -gt 32KB){throw 'Unsafe device access file.'}
  $acl=Get-Acl -LiteralPath $Path
  if(-not $acl.AreAccessRulesProtected){throw 'Private device access file required.'}
  $owner=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  foreach($rule in $acl.Access){$sid=$rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value;if($rule.AccessControlType -eq 'Allow' -and $sid -notin @($owner,'S-1-5-18')){throw 'Device file permits another account.'}}
}
function Read-Encrypted([string]$Name) {
  if($Name -notin @('backend.dpapi','internet-gate.dpapi','device-enrollment.dpapi')){throw 'Unexpected private input.'}
  $path=Join-Path $directory $Name;Assert-File $path
  $bytes=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($path),$null,'CurrentUser')
  try{return [Text.Encoding]::UTF8.GetString($bytes)|ConvertFrom-Json -AsHashtable}finally{[Array]::Clear($bytes,0,$bytes.Length)}
}
function Write-Private([string]$Name,$Value,[switch]$Encrypted,[switch]$RetainPrevious) {
  if($Name -notin @('device-access.json','device-enrollment.dpapi','internet-gate.dpapi')){throw 'Unexpected device output.'}
  $path=Join-Path $directory $Name
  if(Test-Path -LiteralPath $path){Assert-File $path}
  $pending=Join-Path $directory ('device-write-'+[guid]::NewGuid().ToString('N')+'.pending')
  $plain=[Text.Encoding]::UTF8.GetBytes(($Value|ConvertTo-Json -Depth 6 -Compress))
  try {
    $report.storageTarget=$Name
    $report.storageStep='encrypt_pending'
    $data=if($Encrypted){[Security.Cryptography.ProtectedData]::Protect($plain,$null,'CurrentUser')}else{$plain}
    $handle=[IO.File]::Open($pending,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try{$handle.Write($data,0,$data.Length)}finally{$handle.Dispose()}
    $report.storageStep='protect_pending_acl'
    $acl=[Security.AccessControl.FileSecurity]::new()
    $acl.SetAccessRuleProtection($true,$false)
    $owner=[Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl.SetOwner($owner)
    foreach($sid in @($owner,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'))){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','Allow'))}
    [IO.FileSystemAclExtensions]::SetAccessControl((Get-Item -LiteralPath $pending),$acl);Assert-File $pending
    if($Encrypted){
      $report.storageStep='verify_encryption_roundtrip'
      $roundtrip=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($pending),$null,'CurrentUser')
      try{if(-not [Security.Cryptography.CryptographicOperations]::FixedTimeEquals([Security.Cryptography.SHA256]::HashData($plain),[Security.Cryptography.SHA256]::HashData($roundtrip))){throw 'Device encryption round trip failed.'}}finally{[Array]::Clear($roundtrip,0,$roundtrip.Length)}
    }
    if(Test-Path -LiteralPath $path){
      $report.storageStep='replace_existing_private_file'
      if($RetainPrevious){
        $backup=Join-Path $directory ('gate-before-device-'+[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmssfff')+'-'+[guid]::NewGuid().ToString('N')+'.dpapi')
        [IO.File]::Replace($pending,$path,$backup,$false)
      }else{[IO.File]::Replace($pending,$path,[NullString]::Value,$false)}
    }else{$report.storageStep='move_new_private_file';[IO.File]::Move($pending,$path)}
    Assert-File $path
  } finally {[Array]::Clear($plain,0,$plain.Length);$data=$null}
}
try {
  if($Action -eq 'Status'){
    $report.readOnly=$true
    $path=Join-Path $directory 'device-access.json'
    if(Test-Path -LiteralPath $path){Assert-File $path;$binding=Get-Content -LiteralPath $path -Raw|ConvertFrom-Json;$report.passwordlessEnabled=($binding.enabled -eq $true)}
    $path=Join-Path $directory 'device-enrollment-status.json'
    if(Test-Path -LiteralPath $path){$saved=Get-Content -LiteralPath $path -Raw|ConvertFrom-Json;$report.enrollment=$saved|Select-Object completed,phase,failedPhase,passkeyRegistered,passkeyBackupVerified,passkeyLoginVerified,appOwnerSessionVerified,failure,checkedAt}
    $report.completed=$true
  }else{
    $lock=Open-OwnedRuntimeLock -Name operation -WaitMs 300000
    if(-not $lock){throw 'Owned operation is busy.'}
    $report.phase='validating_owned_installation'
    $keys=Read-Encrypted 'backend.dpapi';$gate=Read-Encrypted 'internet-gate.dpapi'
    if($keys.project -ne 'winesnap-owned-local' -or $keys.version -ne 1 -or $keys.installationId -notmatch '^[a-f0-9]{32}$'){throw 'Unexpected owned installation.'}
    $binding=Read-OwnedDeviceAccess -InstallationId $keys.installationId
    if($Action -eq 'Prepare'){
      $report.phase='preparing_existing_owner'
      if($OwnerEmail -cnotmatch '^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$'){throw 'Explicit owner email required.'}
      $input=@{keys=$keys;gate=$gate;ownerEmail=$OwnerEmail}
    }elseif($Action -eq 'Enroll'){
      $report.phase='opening_owner_enrollment'
      if(-not $binding -or -not $binding.enabled){throw 'Device access has not been enabled.'}
      $enrollment=Read-Encrypted 'device-enrollment.dpapi'
      $input=@{keys=$keys;gate=$gate;binding=$binding;enrollment=$enrollment}
      # Do not hold the maintenance lock while the human approves their authenticator.
      $lock.Dispose();$lock=$null
    }else{
      $report.phase='validating_enrollment'
      if(-not $binding){throw 'Device access has not been prepared.'}
      $enrollment=Read-Encrypted 'device-enrollment.dpapi'
      if($enrollment.version -ne 1 -or $enrollment.project -ne 'winesnap-owned-local' -or $enrollment.installationId -cne $keys.installationId -or $enrollment.ownerId -cne $binding.ownerId -or [DateTimeOffset]$enrollment.expiresAt -le [DateTimeOffset]::UtcNow){throw 'Device preparation is expired or mismatched.'}
      foreach($name in @('version','project','hostname','username','sessionSecret','storageKey','resetSecret')){if($enrollment.gate[$name] -cne $gate[$name]){throw 'Existing gate identity must be preserved.'}}
      if($enrollment.gate.passwordHash -notmatch '^\$argon2id\$v=19\$m=65536,t=3,p=4\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$'){throw 'Invalid enrollment credential.'}
      if($gate.passwordHash -ceq $enrollment.previousPasswordHash){Write-Private 'internet-gate.dpapi' $enrollment.gate -Encrypted -RetainPrevious}
      elseif($gate.passwordHash -cne $enrollment.gate.passwordHash){throw 'Another password change has taken place.'}
      $binding.enabled=$true;Write-Private 'device-access.json' $binding
      $report.passwordlessEnabled=$true
      $lock.Dispose();$lock=$null
      $report.phase='injecting_owner_binding'
      $verified=& $pwsh -NoLogo -NoProfile -File (Join-Path $PSScriptRoot 'run-owned-windows.ps1') -Action Verify|ConvertFrom-Json
      if($verified.completed -ne $true){throw 'Application device binding was not installed.'}
      $report.phase='enabling_native_passkeys'
      $restarted=& $pwsh -NoLogo -NoProfile -File (Join-Path $PSScriptRoot 'run-owned-ingress.ps1') -Action Restart|ConvertFrom-Json
      if($restarted.completed -ne $true){throw 'Passkey gate configuration was not installed.'}
      $report.completed=$true;$report.phase='ready_for_owner_enrollment'
    }
    if($Action -in @('Prepare','Enroll')){
      $payload=$input|ConvertTo-Json -Depth 6 -Compress;$input=$null
      Initialize-OwnedProcessJob;$job=[WineSnapOwned.ProcessJob]::new()
      $start=[Diagnostics.ProcessStartInfo]::new();$start.FileName=$node;$start.WorkingDirectory=Split-Path -Parent $PSScriptRoot
      $start.UseShellExecute=$false;$start.CreateNoWindow=$true
      $start.RedirectStandardInput=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
      $start.Environment.Clear()
      foreach($name in @('PATH','PATHEXT','COMSPEC','SystemRoot','WINDIR','SystemDrive','ProgramData','ProgramFiles','ProgramFiles(x86)','ALLUSERSPROFILE','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP')){$value=[Environment]::GetEnvironmentVariable($name);if($value){$start.Environment[$name]=$value}}
      $start.Environment['WINESNAP_OWNED_DEVICE_OPERATOR_PIPE']='1'
      $start.ArgumentList.Add((Join-Path $PSScriptRoot 'owned-device-operator.mjs'));$start.ArgumentList.Add($Action)
      $process=[Diagnostics.Process]::Start($start);$job.Assign($process.Handle)
      $out=$process.StandardOutput.ReadToEndAsync();$err=$process.StandardError.ReadToEndAsync()
      $process.StandardInput.Write($payload);$process.StandardInput.Close();$payload=$null
      if($Action -eq 'Enroll'){$process.WaitForExit()}elseif(-not $process.WaitForExit(180000)){throw 'Owner preparation timed out.'}
      if(-not [Threading.Tasks.Task]::WaitAll([Threading.Tasks.Task[]]@($out,$err),5000)){throw 'Device helper output did not close.'}
      $raw=$out.GetAwaiter().GetResult();$err.GetAwaiter().GetResult()|Out-Null
      if(-not $raw -or $raw.Length -gt 32KB){throw 'Unexpected device helper output.'}
      $result=$raw|ConvertFrom-Json -AsHashtable;$raw=$null
      if($result.report.phase -in @('private_input','validating_owned_containers','locating_existing_owner','creating_private_enrollment','prepared_not_enabled','authenticating_private_setup_session','awaiting_owner_passkey_registration','backing_up_registered_passkey','awaiting_owner_passkey_sign_in','complete','needs_attention')){$report.phase=$result.report.phase}
      if($result.report.project -ne 'winesnap-owned-local' -or $result.report.productionTouched -ne $false -or $result.report.completed -ne $true -or $process.ExitCode -ne 0){throw 'Device operation was not accepted.'}
      if($Action -eq 'Prepare'){
        if($binding){if($binding.ownerId -cne $result.binding.ownerId){throw 'Existing device owner cannot be silently replaced.'};$result.binding.enabled=$binding.enabled}
        $report.phase='saving_encrypted_enrollment'
        Write-Private 'device-enrollment.dpapi' $result.enrollment -Encrypted
        $report.phase='saving_disabled_binding'
        Write-Private 'device-access.json' $result.binding
      }
      $report.completed=$true;$report.phase=$result.report.phase
      $result=$null
    }
  }
}catch{$report.failure='owned_device_access_not_complete';$report.errorType=$_.Exception.GetType().Name;if($_.Exception.InnerException){$report.innerErrorType=$_.Exception.InnerException.GetType().Name;$report.errorHResult=$_.Exception.InnerException.HResult.ToString('X8')};$report.completed=$false}
finally{
  $payload=$null;$input=$null;$result=$null
  if($keys){$keys.Clear()};if($gate){$gate.Clear()};if($enrollment){$enrollment.Clear()}
  if($lock){$lock.Dispose()};if($job){$job.Dispose()};if($process){$process.Dispose()};if($start){$start.Environment.Clear()}
  $report.checkedAt=[DateTime]::UtcNow.ToString('o')
}
$report|ConvertTo-Json -Depth 5
if(-not $report.completed){exit 1}
