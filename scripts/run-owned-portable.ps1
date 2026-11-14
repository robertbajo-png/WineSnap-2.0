param(
  [ValidateSet('SelfTest','Preflight','Create','Rehearse','RecoverFiles','Export','Status')][string]$Action='Status',
  [string]$BackupPath,
  [switch]$PrepareImages
)
$ErrorActionPreference='Stop'
if(-not $IsWindows){throw 'PowerShell 7 on Windows is required.'}
if($PrepareImages -and $Action -notin @('Rehearse','RecoverFiles')){throw 'Image preparation is only available for explicit recovery.'}
. (Join-Path $PSScriptRoot 'lib/owned-windows-runtime.ps1')
$portable=Join-Path ([Environment]::GetFolderPath('UserProfile')) 'WineSnapPortable'
$root=Split-Path -Parent $PSScriptRoot
$node=Join-Path $HOME '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
$run=[guid]::NewGuid().ToString('N').Substring(0,16)
$selfTest=$Action -eq 'SelfTest'
$report=[ordered]@{project='winesnap-owned-local';action=$Action;completed=$false;testOnly=$selfTest;recoverableBackupCreated=$false;productionTouched=$false;actualOtherComputerTested=$false;offDeviceCopyVerified=$false}
$lock=$null;$sourceLock=$null;$password=$null;$plain=$null;$process=$null;$start=$null;$job=$null;$recovery=$null;$stage=$null
$testDirectory=$null;$rehearsalStarted=$false;$phase='private_directory'
function Assert-Safe([string]$Path) {
  $current=[IO.Path]::GetFullPath($Path)
  while($current -and $current -ne [IO.Path]::GetPathRoot($current)){
    if((Test-Path -LiteralPath $current) -and ((Get-Item -LiteralPath $current -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Redirected paths are not accepted.'}
    $current=[IO.Path]::GetDirectoryName($current)
  }
}
function Assert-Private([string]$Path) {
  Assert-Safe $Path
  $acl=Get-Acl -LiteralPath $Path
  $owner=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  foreach($rule in $acl.Access){
    $sid=$rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
    if($rule.AccessControlType -eq 'Allow' -and $sid -notin @($owner,'S-1-5-18')){throw 'Private owner permissions are required.'}
  }
}
function Initialize-PortableDirectory {
  Assert-Safe $portable
  if(-not (Test-Path -LiteralPath $portable)){
    New-Item -ItemType Directory -Path $portable|Out-Null
    $acl=Get-Acl -LiteralPath $portable;$acl.SetAccessRuleProtection($true,$false)
    $owner=[Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl.SetOwner($owner)
    foreach($sid in @($owner,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'))){
      $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
    }
    [IO.FileSystemAclExtensions]::SetAccessControl((Get-Item -LiteralPath $portable),$acl)
  }
  Assert-Private $portable
}
function Write-Status {
  $report.checkedAt=[DateTime]::UtcNow.ToString('o')
  $file=Join-Path $portable 'portable-status.json';$pending=Join-Path $portable 'portable-status.pending.json'
  Assert-Safe $file;Assert-Safe $pending
  [IO.File]::WriteAllText($pending,($report|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
  Move-Item -LiteralPath $pending -Destination $file -Force
}
function Read-PrivateArchive([string]$Path,[long]$Limit) {
  Assert-Private $Path
  $item=Get-Item -LiteralPath $Path -Force
  if(-not $item.PSIsContainer -and $item.Length -gt 0 -and $item.Length -le $Limit){
    $bytes=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($Path),$null,'CurrentUser')
    try {return ([Text.Encoding]::UTF8.GetString($bytes)|ConvertFrom-Json -AsHashtable -Depth 40)} finally {[Array]::Clear($bytes,0,$bytes.Length)}
  }
  throw 'No bounded archive is available.'
}
function Read-SnapshotStore([string]$Value) {
  $bytes=[Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($Value),$null,'CurrentUser')
  try{return ([Text.Encoding]::UTF8.GetString($bytes)|ConvertFrom-Json -AsHashtable)}finally{[Array]::Clear($bytes,0,$bytes.Length)}
}
function Get-Passphrase([bool]$Create) {
  Add-Type -AssemblyName System.Windows.Forms;Add-Type -AssemblyName System.Drawing
  $form=[Windows.Forms.Form]::new();$first=$null;$confirm=$null
  try {
    $form.Text='WineSnap - Portable Backup';$form.ClientSize=[Drawing.Size]::new(650,390)
    $form.StartPosition='CenterScreen';$form.FormBorderStyle='FixedDialog';$form.MaximizeBox=$false;$form.MinimizeBox=$false
    $form.Font=[Drawing.Font]::new('Segoe UI',11)
    $label=[Windows.Forms.Label]::new();$label.SetBounds(20,15,610,115)
    $label.Text=if($Create){"Choose a NEW recovery passphrase (20+ characters).`r`nKeep it in a password manager or another safe place outside this PC.`r`nIt is NOT your WineSnap or Windows password.`r`nThe passphrase is not saved or sent to chat."}else{"Enter the portable backup's recovery passphrase.`r`nNo password from the original Windows account is needed.`r`nThis does not replace or publish an active installation."}
    $first=[Windows.Forms.TextBox]::new();$first.UseSystemPasswordChar=$true;$first.MaxLength=256;$first.SetBounds(20,140,610,32)
    $confirm=[Windows.Forms.TextBox]::new();$confirm.UseSystemPasswordChar=$true;$confirm.MaxLength=256;$confirm.SetBounds(20,205,610,32)
    $caption=[Windows.Forms.Label]::new();$caption.Text='Confirm recovery passphrase';$caption.SetBounds(20,180,610,24)
    $kept=[Windows.Forms.CheckBox]::new();$kept.Text='I have kept this passphrase separately from this PC.';$kept.SetBounds(20,255,610,34)
    if(-not $Create){$confirm.Visible=$false;$caption.Visible=$false;$kept.Visible=$false}
    $save=[Windows.Forms.Button]::new();$save.Text=if($Create){'Create and test backup'}else{'Continue'};$save.SetBounds(315,325,200,42)
    $save.Add_Click({
      if($first.Text.Length -ge 20 -and [Text.Encoding]::UTF8.GetByteCount($first.Text) -le 512 -and $first.Text -notmatch '[\x00\r\n]' -and (-not $Create -or ($first.Text -ceq $confirm.Text -and $kept.Checked))){$form.DialogResult=[Windows.Forms.DialogResult]::OK;$form.Close()}
      else{[Windows.Forms.MessageBox]::Show('Use at least 20 characters. For a new backup, confirm the same phrase and keep it separately.','WineSnap')|Out-Null}
    })
    $cancel=[Windows.Forms.Button]::new();$cancel.Text='Cancel';$cancel.SetBounds(525,325,105,42);$cancel.DialogResult=[Windows.Forms.DialogResult]::Cancel
    $form.Controls.AddRange(@($label,$first,$confirm,$caption,$kept,$save,$cancel));$form.AcceptButton=$save;$form.CancelButton=$cancel
    $form.Add_Shown({$first.Focus()|Out-Null})
    if($form.ShowDialog() -ne [Windows.Forms.DialogResult]::OK){throw 'Recovery passphrase entry cancelled.'}
    return ,[Text.Encoding]::UTF8.GetBytes($first.Text)
  } finally {if($first){$first.Clear()};if($confirm){$confirm.Clear()};$form.Dispose()}
}
function Initialize-PortableJob {
  if('WineSnapOwned.ProcessJob' -as [type]){return}
  # Reuse the existing trusted job-object definition without requiring an installed stack.
  $tokens=$null;$errors=$null
  $ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'lib/owned-windows-runtime.ps1'),[ref]$tokens,[ref]$errors)
  if($errors.Count){throw 'Job helper source did not parse.'}
  $functions=@($ast.FindAll({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Initialize-OwnedProcessJob'},$true))
  if($functions.Count -ne 1){throw 'Unexpected job helper.'}
  $strings=@($functions[0].Body.FindAll({param($n)$n -is [Management.Automation.Language.StringConstantExpressionAst] -and $n.StringConstantType -eq 'SingleQuotedHereString'},$true))
  if($strings.Count -ne 1){throw 'Unexpected job helper source.'}
  Add-Type -TypeDefinition $strings[0].Value
}
function Invoke-Portable([string]$Kind,$Payload) {
  $start=[Diagnostics.ProcessStartInfo]::new();$start.FileName=$node;$start.WorkingDirectory=$root;$start.UseShellExecute=$false;$start.CreateNoWindow=$true
  $start.RedirectStandardInput=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true;$start.Environment.Clear()
  foreach($key in @('PATH','PATHEXT','COMSPEC','SystemRoot','WINDIR','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP')){$value=[Environment]::GetEnvironmentVariable($key);if($value){$start.Environment[$key]=$value}}
  $start.Environment['WINESNAP_PORTABLE_PIPE']='1';$start.ArgumentList.Add((Join-Path $PSScriptRoot 'portable/worker.mjs'));$start.ArgumentList.Add($Kind)
  $job=[WineSnapOwned.ProcessJob]::new();$process=$null
  try {
    $process=[Diagnostics.Process]::Start($start);$job.Assign($process.Handle)
    $output=$process.StandardOutput.ReadToEndAsync();$errors=$process.StandardError.ReadToEndAsync()
    $privateJson=$Payload|ConvertTo-Json -Depth 40 -Compress
    $process.StandardInput.Write($privateJson);$process.StandardInput.Close();$privateJson=$null
    if(-not $process.WaitForExit(900000)){throw 'Portable operation timed out.'}
    if(-not [Threading.Tasks.Task]::WaitAll([Threading.Tasks.Task[]]@($output,$errors),5000)){throw 'Portable output did not close.'}
    $raw=$output.GetAwaiter().GetResult();$errors.GetAwaiter().GetResult()|Out-Null
    if(-not $raw -or $raw.Length -gt 256MB){throw 'Unexpected portable output.'}
    $value=$raw|ConvertFrom-Json -AsHashtable -Depth 40;$raw=$null
    if($value.report.project -ne 'winesnap-owned-local' -or $value.report.productionTouched -ne $false){throw 'Unexpected portable scope.'}
    if($process.ExitCode -ne 0 -or $value.report.completed -ne $true){throw 'Portable operation was not accepted.'}
    return $value
  } finally {if($job){$job.Dispose()};if($process){$process.Dispose()};$start.Environment.Clear()}
}
function Read-CipherFile([string]$Path) {
  Assert-Safe $Path;$item=Get-Item -LiteralPath $Path -Force
  if($item.PSIsContainer -or $item.Name -notmatch '^winesnap-portable-\d{8}-\d{9}\.age$' -or $item.Length -lt 128 -or $item.Length -gt 177MB){throw 'Unexpected portable file.'}
  return ,[IO.File]::ReadAllBytes($item.FullName)
}
function Protect-Json($Value,[string]$Path) {
  Assert-Safe $Path
  $bytes=[Text.Encoding]::UTF8.GetBytes(($Value|ConvertTo-Json -Depth 40 -Compress))
  try {
    $cipher=[Security.Cryptography.ProtectedData]::Protect($bytes,$null,'CurrentUser')
    $handle=[IO.File]::Open($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try{$handle.Write($cipher,0,$cipher.Length)}finally{$handle.Dispose()}
    $acl=Get-Acl -LiteralPath $Path;$acl.SetAccessRuleProtection($true,$true)
    [IO.FileSystemAclExtensions]::SetAccessControl((Get-Item -LiteralPath $Path),$acl)
    $check=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($Path),$null,'CurrentUser')
    try{if(-not [Security.Cryptography.CryptographicOperations]::FixedTimeEquals([Security.Cryptography.SHA256]::HashData($bytes),[Security.Cryptography.SHA256]::HashData($check))){throw 'Recovered file encryption did not round-trip.'}}finally{[Array]::Clear($check,0,$check.Length)}
  } finally {[Array]::Clear($bytes,0,$bytes.Length)}
}
function Clear-PortableRehearsal {
  $docker=Join-Path $env:LOCALAPPDATA 'Programs/DockerDesktop/resources/bin/docker.exe'
  $engine=& $docker --host npipe:////./pipe/dockerDesktopLinuxEngine version --format '{{.Server.Os}}' 2>$null
  if($LASTEXITCODE -ne 0 -or $engine -ne 'linux'){return $false}
  $prefix='winesnap-owned-restore-'+$run;$clean=$true
  $targets=@('storage','rest','auth','probe','db')|ForEach-Object {@{name=($prefix+'-'+$_);scope='owned-backup-rehearsal';label='winesnap.restore';network=$prefix}}
  $targets+=@{name=('winesnap-portable-gate-'+$run);scope='owned-portable-recovery';label='winesnap.portable';network='none'}
  foreach($target in $targets){
    $format='{{index .Config.Labels "winesnap.scope"}}|{{index .Config.Labels "'+$target.label+'"}}|{{.HostConfig.NetworkMode}}|{{.HostConfig.ReadonlyRootfs}}|{{len .HostConfig.PortBindings}}|{{len .HostConfig.Binds}}|{{range .Mounts}}{{.Type}},{{end}}'
    $identity=& $docker --host npipe:////./pipe/dockerDesktopLinuxEngine inspect --format $format $target.name 2>$null
    if($LASTEXITCODE -eq 0){
      $parts=$identity -split '\|'
      if($parts.Count -eq 7 -and $parts[0] -eq $target.scope -and $parts[1] -eq $run -and $parts[2] -eq $target.network -and $parts[3] -eq 'true' -and $parts[4] -eq '0' -and $parts[5] -eq '0' -and $parts[6] -match '^(tmpfs,)*$'){
        & $docker --host npipe:////./pipe/dockerDesktopLinuxEngine rm --force $target.name 2>$null|Out-Null
        if($LASTEXITCODE -ne 0){$clean=$false}
      }else{$clean=$false}
    }
  }
  $network=& $docker --host npipe:////./pipe/dockerDesktopLinuxEngine network inspect --format '{{index .Labels "winesnap.scope"}}|{{index .Labels "winesnap.restore"}}|{{.Internal}}' $prefix 2>$null
  if($LASTEXITCODE -eq 0){
    if($network -eq "owned-backup-rehearsal|$run|true"){
      & $docker --host npipe:////./pipe/dockerDesktopLinuxEngine network rm $prefix 2>$null|Out-Null
      if($LASTEXITCODE -ne 0){$clean=$false}
    }else{$clean=$false}
  }
  return $clean
}
try {
  Initialize-PortableDirectory
  Assert-Safe (Join-Path $portable 'portable.lock')
  $lock=[IO.File]::Open((Join-Path $portable 'portable.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
  if($Action -eq 'Status'){$report.completed=$true;$report.privateDirectoryPrepared=$true}
  else {
    if($Action -notin @('Create','SelfTest','Preflight') -and -not $BackupPath){$BackupPath=(Get-ChildItem -LiteralPath $portable -File|Where-Object {$_.Name -match '^winesnap-portable-\d{8}-\d{9}\.age$'}|Sort-Object Name -Descending|Select-Object -First 1).FullName}
    if($Action -notin @('Export','Preflight')){
      Initialize-PortableJob
      $phase='passphrase';$report.phase=$phase;Write-Status
      $password=if($selfTest){[Text.Encoding]::UTF8.GetBytes(('synthetic-selftest-'+[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))))}else{Get-Passphrase ($Action -eq 'Create')}
      $payload=@{password=[Convert]::ToBase64String($password);run=$run}
    }
    if($Action -eq 'Preflight'){Initialize-PortableJob;$payload=@{run=$run}}
    if($Action -in @('Create','SelfTest','Preflight')){
      $phase='read_verified_snapshots'
      $report.phase=$phase;Write-Status
      $sourceLock=Open-OwnedRuntimeLock -Name operation -WaitMs 120000
      if(-not $sourceLock){throw 'Owned operation is busy.'}
      $source=Assert-OwnedRuntimeDirectory
      $sourceInfo=@{}
      foreach($entry in @(@('application','backups','owned','restore'),@('gate','internet-backups','gate','gate-restore'))){
        $folder=Join-Path $source $entry[1];Assert-Private $folder
        $latest=Get-ChildItem -LiteralPath $folder -File|Where-Object {$_.Name -match ('^'+$entry[2]+'-\d{8}-\d{9}\.dpapi$')}|Sort-Object Name -Descending|Select-Object -First 1
        if(-not $latest){throw 'A verified source snapshot is required.'}
        $statusPath=Join-Path $source ($entry[3]+'-status.json');Assert-Private $statusPath
        if((Get-Item -LiteralPath $statusPath).Length -gt 64KB){throw 'Oversized restore status.'}
        $status=Get-Content -LiteralPath $statusPath -Raw|ConvertFrom-Json
        if($status.project -ne 'winesnap-owned-local' -or $status.completed -ne $true -or $status.cleanupCompleted -ne $true -or $status.backupFile -ne $latest.Name -or [DateTimeOffset]$status.checkedAt -lt [DateTimeOffset]::UtcNow.AddHours(-26) -or [DateTimeOffset]$status.checkedAt -gt [DateTimeOffset]::UtcNow.AddMinutes(5)){throw 'Source restore evidence is not current.'}
        $payload[$entry[0]]=Read-PrivateArchive $latest.FullName $(if($entry[0] -eq 'application'){130MB}else{32MB})
        $sourceInfo[$entry[0]+'Backup']=$latest.Name
      }
      $sourceInfo.toolCommit=(& git -C $root rev-parse HEAD).Trim()
      if($LASTEXITCODE -ne 0 -or $sourceInfo.toolCommit -notmatch '^[a-f0-9]{40}$'){throw 'Unknown source revision.'}
      if($Action -eq 'Create' -and (& git -C $root status --porcelain)){throw 'Commit portable tools before creating a real backup.'}
      $payload.source=$sourceInfo
      $payload.credentials=@{gate=(Read-SnapshotStore $payload.gate.gateStore);tunnel=(Read-SnapshotStore $payload.gate.tunnelStore)}
      $payload.gate.Remove('gateStore')|Out-Null;$payload.gate.Remove('tunnelStore')|Out-Null
      $sourceLock.Dispose();$sourceLock=$null
      $phase='validate_portable_source';$result=Invoke-Portable $(if($Action -eq 'Preflight'){'CheckSource'}else{'Create'}) $payload;$payload.Clear();$payload=$null
      if($Action -eq 'Preflight'){
        foreach($key in $result.report.Keys){$report[$key]=$result.report[$key]}
        $result=$null
      }else{
      $cipher=[Convert]::FromBase64String($result.ciphertext);$result=$null
      $backupDirectory=$portable
      if($selfTest){$testDirectory=Join-Path $portable ('selftest-'+$run);Assert-Safe $testDirectory;New-Item -ItemType Directory -Path $testDirectory|Out-Null;$backupDirectory=$testDirectory}
      $BackupPath=Join-Path $backupDirectory ('winesnap-portable-'+[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmssfff')+'.age');Assert-Safe $BackupPath
      $handle=[IO.File]::Open($BackupPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
      try{$handle.Write($cipher,0,$cipher.Length)}finally{$handle.Dispose()}
      [Array]::Clear($cipher,0,$cipher.Length);$cipher=$null
      $report.backupFile=[IO.Path]::GetFileName($BackupPath);$report.encryptedRoundtripVerified=$true
      $report.archiveSha256=(Get-FileHash -LiteralPath $BackupPath -Algorithm SHA256).Hash.ToLowerInvariant()
      }
    }
    if($Action -in @('Create','SelfTest','Rehearse','RecoverFiles')){
      $plain=Read-CipherFile $BackupPath
      $payload=@{password=[Convert]::ToBase64String($password);ciphertext=[Convert]::ToBase64String($plain);run=$run;prepareImages=[bool]$PrepareImages}
      [Array]::Clear($plain,0,$plain.Length);$plain=$null
      $phase=if($Action -eq 'RecoverFiles'){'recover_new_user_files'}else{'standalone_restore_rehearsal'}
      $report.phase=$phase;Write-Status;$rehearsalStarted=$true
      $result=Invoke-Portable $(if($Action -eq 'RecoverFiles' -or $selfTest){'RecoverFiles'}else{'Rehearse'}) $payload;$payload.Clear();$payload=$null
      foreach($key in $result.report.Keys){$report[$key]=$result.report[$key]}
      $report.backupFile=[IO.Path]::GetFileName($BackupPath)
      if($Action -eq 'RecoverFiles' -or $selfTest){
        $recovery=$result.recovery;$result=$null
        $stamp=[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmssfff')+'-'+$run
        $stageParent=if($selfTest){$testDirectory}else{$portable}
        $stage=Join-Path $stageParent ('recovering-'+$stamp)
        Assert-Safe $stage;New-Item -ItemType Directory -Path $stage|Out-Null
        Protect-Json $recovery.application.configuration (Join-Path $stage 'backend.dpapi')
        Protect-Json $recovery.credentials.gate (Join-Path $stage 'internet-gate.dpapi')
        Protect-Json $recovery.credentials.tunnel (Join-Path $stage 'internet-tunnel.dpapi')
        foreach($folder in @('backups','internet-backups')){New-Item -ItemType Directory -Path (Join-Path $stage $folder)|Out-Null}
        Protect-Json $recovery.application (Join-Path $stage ('backups/'+$recovery.source.applicationBackup))
        $gateBytes=[Text.Encoding]::UTF8.GetBytes(($recovery.credentials.gate|ConvertTo-Json -Compress))
        $tunnelBytes=[Text.Encoding]::UTF8.GetBytes(($recovery.credentials.tunnel|ConvertTo-Json -Compress))
        try {
          $recovery.gate.gateStore=[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($gateBytes,$null,'CurrentUser'))
          $recovery.gate.tunnelStore=[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($tunnelBytes,$null,'CurrentUser'))
          Protect-Json $recovery.gate (Join-Path $stage ('internet-backups/'+$recovery.source.gateBackup))
        }finally{[Array]::Clear($gateBytes,0,$gateBytes.Length);[Array]::Clear($tunnelBytes,0,$tunnelBytes.Length)}
        foreach($name in @('ingress-control','tunnel-control')){
          [IO.File]::WriteAllText((Join-Path $stage ($name+'-status.json')),(@{project='winesnap-owned-local';enabled=$false;checkedAt=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json -Compress))
        }
        [IO.File]::WriteAllText((Join-Path $stage 'RECOVERY.json'),(@{project='winesnap-owned-local';complete=$true;activeInstallationCreated=$false;providersIncluded=$false;internetDisabled=$true;backupFile=$report.backupFile}|ConvertTo-Json -Compress))
        $final=Join-Path $stageParent ('recovered-'+$stamp);Assert-Safe $final
        if(Test-Path -LiteralPath $final){throw 'Recovery destination exists.'}
        Move-Item -LiteralPath $stage -Destination $final;$stage=$final
        $report.recoveredDirectory=[IO.Path]::GetFileName($stage);$report.recoveredFilesEncryptedForCurrentUser=$true
        $recovery=$null
      }
    }
    if($Action -eq 'Create'){$report.recoverableBackupCreated=$true}
    if($Action -in @('Create','Export')){
      $phase='optional_encrypted_copy'
      $report.phase=$phase;Write-Status
      Add-Type -AssemblyName System.Windows.Forms
      $dialog=[Windows.Forms.SaveFileDialog]::new()
      try {
        $dialog.Title='WineSnap - Save an additional encrypted copy (USB or a folder you choose)';$dialog.Filter='Encrypted WineSnap backup (*.age)|*.age';$dialog.FileName=[IO.Path]::GetFileName($BackupPath);$dialog.InitialDirectory=[Environment]::GetFolderPath('Desktop')
        if($dialog.ShowDialog() -eq [Windows.Forms.DialogResult]::OK -and [IO.Path]::GetFullPath($dialog.FileName) -ne [IO.Path]::GetFullPath($BackupPath)){
          Assert-Safe $dialog.FileName
          $sourceStream=[IO.File]::OpenRead($BackupPath);$target=$null
          try{$target=[IO.File]::Open($dialog.FileName,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);$sourceStream.CopyTo($target)}finally{if($target){$target.Dispose()};$sourceStream.Dispose()}
          if((Get-FileHash -LiteralPath $BackupPath -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $dialog.FileName -Algorithm SHA256).Hash){throw 'Encrypted copy did not match.'}
          $report.additionalCopyCreated=$true;$report.copyPath=$dialog.FileName
        }
      } catch {$report.additionalCopyCreated=$false;$report.copyFailure='encrypted_copy_not_created'} finally {$dialog.Dispose()}
    }
    $report.completed=$true
  }
}catch{$report.completed=$false;$report.failure='portable_operation_not_accepted';$report.phase=$phase}
finally {
  if($password){[Array]::Clear($password,0,$password.Length)};if($plain){[Array]::Clear($plain,0,$plain.Length)}
  $payload=$null;$result=$null;$recovery=$null
  if($rehearsalStarted){
    try{if(-not (Clear-PortableRehearsal)){throw 'Unverified portable cleanup.'}}
    catch{$report.completed=$false;$report.cleanupCompleted=$false;$report.failure='portable_cleanup_not_verified'}
  }
  if($selfTest -and $testDirectory){
    try{
      if([IO.Path]::GetFullPath($testDirectory) -ne (Join-Path $portable ('selftest-'+$run))){throw 'Unexpected self-test cleanup path.'}
      Assert-Safe $testDirectory
      foreach($item in @(Get-ChildItem -LiteralPath $testDirectory -Recurse -Force)){Assert-Safe $item.FullName}
      Remove-Item -LiteralPath $testDirectory -Recurse -Force
      $report.temporaryRecoveryFilesRemoved=$true;$report.Remove('backupFile');$report.Remove('recoveredDirectory')
    }catch{$report.completed=$false;$report.failure='portable_selftest_cleanup_not_verified'}
  }
  if($sourceLock){$sourceLock.Dispose()}
  if($report.completed){$report.phase='complete'}
  if($lock){try{Write-Status}catch{};$lock.Dispose()}
}
$report|ConvertTo-Json -Depth 5
if(-not $report.completed){exit 1}
