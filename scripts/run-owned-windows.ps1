param(
  [ValidateSet('Start','Resume','RestartApp','Verify','Update','NutritionUpdate','TextAiUpdate','MealPhotoUpdate','PrivateJournalUpdate','MealPhotoAccept','MealPhotoCleanup','NutritionAccept','NutritionCleanup','Backup','Accept','ScanAccept','Features','FeaturesAi','Offline','PilotAccept','PlanningAccept','PantryAccept','PantryCleanup','PilotJourneys','PilotDemo','PilotDemoAccept','PilotDemoCleanup','BrowserPrepare','BrowserInspect','BrowserConflict','BrowserMemory','BrowserCleanup','Maintain')][string]$Action='Start',
  [ValidateSet('https://winesnap.boleoai.se')][string]$PublicOrigin,
  [ValidateSet('Dark','Classic')][string]$PilotUi,
  [switch]$LocalOnly,
  [switch]$ReplayApprovedImage,
  [switch]$KitchenRecoveryOnly,
  [switch]$AccountIsolationOnly,
  [switch]$WaitForBackupLock,
  [switch]$RequirePlanningMigration,
  [switch]$RequirePantryMigration,
  [ValidatePattern('^owned-\d{8}-\d{9}\.dpapi$')][string]$VerifiedPantryBackup,
  [ValidatePattern('^owned-\d{8}-\d{9}\.dpapi$')][string]$VerifiedNutritionBackup,
  [ValidateSet('OpenAI','Gemini')][string]$AiTextProvider,
  [ValidateSet('gpt-6-luna','gpt-6.2-sol')][string]$AiTextModel,
  [ValidatePattern('^owned-\d{8}-\d{9}\.dpapi$')][string]$VerifiedAiTextBackup,
  [ValidatePattern('^owned-\d{8}-\d{9}\.dpapi$')][string]$VerifiedMealPhotoBackup,
  [ValidatePattern('^[a-f0-9]{40}$')][string]$ExpectedMealPhotoRevision,
  [ValidatePattern('^sha256:[a-f0-9]{64}$')][string]$ExpectedMealPhotoPreviousImage,
  [switch]$ConfirmMealPhotoMaintenance,
  [ValidatePattern('^owned-\d{8}-\d{9}\.dpapi$')][string]$VerifiedPrivateJournalBackup,
  [ValidatePattern('^[a-f0-9]{40}$')][string]$ExpectedPrivateJournalRevision,
  [ValidatePattern('^sha256:[a-f0-9]{64}$')][string]$ExpectedPrivateJournalPreviousImage,
  [switch]$ConfirmPrivateJournalMaintenance
)
$ErrorActionPreference='Stop'
if(-not $IsWindows){throw 'PowerShell 7 on Windows is required.'}
if(($PublicOrigin -or $LocalOnly) -and $Action -ne 'Update'){throw 'Changing the app origin requires an explicit Update.'}
if($PublicOrigin -and $LocalOnly){throw 'Choose one owned origin mode.'}
if($PilotUi -and $Action -ne 'Update'){throw 'Changing the pilot UI requires an explicit Update.'}
if($ReplayApprovedImage -and $Action -ne 'PilotJourneys'){throw 'Image replay is only for manual pilot acceptance.'}
if($KitchenRecoveryOnly -and $Action -ne 'PilotAccept'){throw 'Focused kitchen acceptance requires PilotAccept.'}
if($AccountIsolationOnly -and ($Action -ne 'PilotAccept' -or $KitchenRecoveryOnly)){throw 'Focused account acceptance requires PilotAccept without another scope.'}
if($WaitForBackupLock -and $Action -ne 'Backup'){throw 'Backup lock waiting is only for an explicitly requested Backup.'}
if($RequirePlanningMigration -and ($Action -ne 'Update' -or $PublicOrigin -or $LocalOnly -or $PilotUi)){throw 'DEV-06 requires an explicit Update without origin or UI changes.'}
if($RequirePantryMigration -and ($Action -ne 'Update' -or $PublicOrigin -or $LocalOnly -or $PilotUi -or $RequirePlanningMigration -or -not $VerifiedPantryBackup)){throw 'DEV-07 requires its own explicit Update and the exact freshly restored backup, without origin or UI changes.'}
if($VerifiedPantryBackup -and -not $RequirePantryMigration){throw 'The archive is only used for the guarded DEV-07 Update.'}
if($Action -eq 'NutritionUpdate' -and -not $VerifiedNutritionBackup){throw 'DEV-08 requires the exact freshly restored backup.'}
if($VerifiedNutritionBackup -and $Action -ne 'NutritionUpdate'){throw 'The archive is only used for the web-only DEV-08 update.'}
if($Action -eq 'TextAiUpdate' -and (-not $AiTextProvider -or -not $VerifiedAiTextBackup)){throw 'Text AI requires an explicit provider and the exact freshly restored backup.'}
if(($AiTextProvider -or $AiTextModel -or $VerifiedAiTextBackup) -and $Action -ne 'TextAiUpdate'){throw 'AI settings require a separate web-only TextAiUpdate.'}
if($AiTextModel -and $AiTextProvider -ne 'OpenAI'){throw 'An OpenAI model requires the OpenAI provider.'}
if($Action -eq 'MealPhotoUpdate' -and (-not $ConfirmMealPhotoMaintenance -or -not $VerifiedMealPhotoBackup -or -not $ExpectedMealPhotoRevision -or -not $ExpectedMealPhotoPreviousImage)){throw 'DEV-10 needs an approved window, reviewed revision, exact previous web image and freshly restored backup.'}
if(($VerifiedMealPhotoBackup -or $ExpectedMealPhotoRevision -or $ExpectedMealPhotoPreviousImage -or $ConfirmMealPhotoMaintenance) -and $Action -ne 'MealPhotoUpdate'){throw 'DEV-10 inputs belong only to the dedicated MealPhotoUpdate action.'}
if($Action -eq 'PrivateJournalUpdate' -and (-not $ConfirmPrivateJournalMaintenance -or -not $VerifiedPrivateJournalBackup -or -not $ExpectedPrivateJournalRevision -or -not $ExpectedPrivateJournalPreviousImage)){throw 'DEV-11 dormant delivery needs its own approved window, exact reviewed checkout, previous image and freshly restored backup.'}
if(($VerifiedPrivateJournalBackup -or $ExpectedPrivateJournalRevision -or $ExpectedPrivateJournalPreviousImage -or $ConfirmPrivateJournalMaintenance) -and $Action -ne 'PrivateJournalUpdate'){throw 'DEV-11 inputs belong only to the dedicated PrivateJournalUpdate action.'}
$root=Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'lib/owned-windows-runtime.ps1')
. (Join-Path $PSScriptRoot 'lib/owned-device-access.ps1')
$directory=Get-OwnedRuntimeDirectory
$store=Join-Path $directory 'backend.dpapi'
$node=Join-Path $HOME '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
$docker=Join-Path $env:LOCALAPPDATA 'Programs/DockerDesktop/resources/bin/docker.exe'
$operationLock=$null
$acquired=$false;$bytes=$null;$payload=$null;$keys=$null;$provider=$null;$process=$null
$phase='private_storage'
$report=[ordered]@{project='winesnap-owned-local';completed=$false;productionTouched=$false;hostedTestTouched=$false;localOnly=$true}
function Assert-Safe([string]$Path) {
  foreach($item in @($directory,$Path)){
    if((Test-Path -LiteralPath $item) -and ((Get-Item -LiteralPath $item -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Redirected local storage refused.'}
  }
}
function Set-Private([string]$Path,[switch]$Folder) {
  Assert-Safe $Path
  $owner=[Security.Principal.WindowsIdentity]::GetCurrent().User
  $acl=Get-Acl -LiteralPath $Path
  foreach($rule in @($acl.Access)){$acl.PurgeAccessRules($rule.IdentityReference)}
  $acl.SetOwner($owner);$acl.SetAccessRuleProtection($true,$false)
  foreach($sid in @($owner,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'))){
    $inherit=if($Folder){[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit'}else{[Security.AccessControl.InheritanceFlags]::None}
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl',$inherit,'None','Allow'))
  }
  [IO.FileSystemAclExtensions]::SetAccessControl((Get-Item -LiteralPath $Path -Force),$acl)
}
function Assert-Private([string]$Path) {
  Assert-Safe $Path
  $acl=Get-Acl -LiteralPath $Path
  if(-not $acl.AreAccessRulesProtected){throw 'Private local permissions required.'}
  $owner=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  foreach($rule in $acl.Access){
    $sid=$rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
    if($rule.AccessControlType -eq 'Allow' -and $sid -notin @($owner,'S-1-5-18')){throw 'Local secret is readable by another account.'}
  }
}
try {
  Assert-Safe $store
  if($Action -eq 'PrivateJournalUpdate'){Assert-Private $directory}
  else {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    Set-Private $directory -Folder
  }
  $waitMs=if($Action -in @('Accept','Offline','PilotAccept','PlanningAccept','PantryAccept','PantryCleanup','NutritionAccept','NutritionCleanup','MealPhotoAccept','MealPhotoCleanup','PilotJourneys','PilotDemo','PilotDemoAccept','BrowserCleanup')){300000}elseif($Action -in @('NutritionUpdate','TextAiUpdate','MealPhotoUpdate','PrivateJournalUpdate')){120000}elseif($Action -eq 'Update' -or $WaitForBackupLock){120000}else{0}
  $operationLock=Open-OwnedRuntimeLock -Name operation -WaitMs $waitMs
  $acquired=[bool]$operationLock
  if(-not $acquired){$report.skipped='operation_already_running';throw 'Operation is already running.'}
  $phase='local_engine'
  $engine=Test-OwnedDockerEngine
  $report.engineLinux=$engine
  if(-not $engine){throw 'Local Docker Desktop Linux engine required.'}
  if(-not (Test-Path -LiteralPath $store -PathType Leaf)) {
    if($RequirePlanningMigration){throw 'DEV-06 requires the existing owned installation.'}
    if($RequirePantryMigration){throw 'DEV-07 requires the existing owned installation.'}
    if($Action -notin @('Start','Update')){throw 'Local backend has not been provisioned.'}
    $existing=& $docker --host npipe:////./pipe/dockerDesktopLinuxEngine volume ls --filter 'name=^winesnap-owned-' --format '{{.Name}}'
    if($LASTEXITCODE -ne 0 -or $existing){throw 'Existing data volumes require their original encrypted credentials.'}
    $new=[ordered]@{version=1;project='winesnap-owned-local';installationId=[guid]::NewGuid().ToString('N');issuedAt=[DateTimeOffset]::UtcNow.ToUnixTimeSeconds()}
    foreach($field in @('dbPassword','jwtSecret','cronSecret','privacyCronSecret')){
      $new[$field]=[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant()
    }
    $bytes=[Text.Encoding]::UTF8.GetBytes(($new | ConvertTo-Json -Compress))
    [IO.File]::WriteAllBytes($store,[Security.Cryptography.ProtectedData]::Protect($bytes,$null,'CurrentUser'))
    Set-Private $store
    [Array]::Clear($bytes,0,$bytes.Length);$bytes=$null;$new=$null
  }
  $phase='local_credentials'
  Assert-Private $store
  if((Get-Item -LiteralPath $store).Length -gt 32KB){throw 'Oversized local credential store.'}
  $bytes=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($store),$null,'CurrentUser')
  $keys=[Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json -AsHashtable
  [Array]::Clear($bytes,0,$bytes.Length);$bytes=$null
  if($keys.project -ne 'winesnap-owned-local' -or $keys.version -ne 1){throw 'Unexpected local backend credentials.'}
  # Reuse only already-authorized WineSnap provider slots. Never import hosted
  # database/API keys, and never copy provider secrets into the new disk store.
  $providerPath=Join-Path $directory 'ai-keys.clixml'
  if(Test-Path -LiteralPath $providerPath -PathType Leaf) {
    Assert-Private $providerPath
    $provider=Import-Clixml -LiteralPath $providerPath
    if($provider.Version -ne 1 -or $provider.Purpose -ne 'WineSnap-local-test'){throw 'Unexpected provider store.'}
    foreach($slot in @(@('OpenAI','openai','OPENAI_API_KEY'),@('Gemini','gemini','GEMINI_API_KEY'))){
      $credential=$provider.($slot[0])
      if($credential -is [pscredential]){
        if($credential.UserName -ne $slot[2]){throw 'Unexpected provider credential type.'}
        $keys[$slot[1]]=$credential.GetNetworkCredential().Password.Trim()
      }
    }
  }
  $deviceBinding=Read-OwnedDeviceAccess -InstallationId $keys.installationId
  $payload=$keys | ConvertTo-Json -Compress;$keys.Clear();$keys=$null
  $start=[Diagnostics.ProcessStartInfo]::new()
  $start.FileName=$node;$start.WorkingDirectory=$root;$start.UseShellExecute=$false;$start.CreateNoWindow=$true
  $start.RedirectStandardInput=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
  $start.Environment.Clear()
  foreach($key in @('PATH','PATHEXT','COMSPEC','SystemRoot','WINDIR','SystemDrive','ProgramData','ALLUSERSPROFILE','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP')){
    $value=[Environment]::GetEnvironmentVariable($key);if($value){$start.Environment[$key]=$value}
  }
  $start.Environment['WINESNAP_OWNED_PIPE']='1'
  if($deviceBinding -and $deviceBinding.enabled){$start.Environment['WINESNAP_OWNED_DEVICE_OWNER_ID']=$deviceBinding.ownerId}
  if($PublicOrigin){$start.Environment['WINESNAP_OWNED_PUBLIC_ORIGIN']=$PublicOrigin}
  if($LocalOnly){$start.Environment['WINESNAP_OWNED_ORIGIN_RESET']='1'}
  if($PilotUi){$start.Environment['WINESNAP_OWNED_PILOT_UI']=$PilotUi}
  if($AiTextProvider){$start.Environment['WINESNAP_OWNED_AI_TEXT_PROVIDER']=$AiTextProvider.ToLowerInvariant()}
  if($AiTextModel){$start.Environment['WINESNAP_OWNED_AI_TEXT_MODEL']=$AiTextModel.ToLowerInvariant()}
  if($VerifiedAiTextBackup){$start.Environment['WINESNAP_OWNED_AI_TEXT_BACKUP']=$VerifiedAiTextBackup}
  if($ReplayApprovedImage){$start.Environment['WINESNAP_OWNED_REPLAY_APPROVED_IMAGE']='1'}
  if($KitchenRecoveryOnly){$start.Environment['WINESNAP_OWNED_KITCHEN_RECOVERY_ONLY']='1'}
  if($AccountIsolationOnly){$start.Environment['WINESNAP_OWNED_ACCOUNT_ISOLATION_ONLY']='1'}
  if($RequirePlanningMigration){$start.Environment['WINESNAP_OWNED_REQUIRE_PLANNING_MIGRATION']='1'}
  if($RequirePantryMigration){$start.Environment['WINESNAP_OWNED_PANTRY_BACKUP']=$VerifiedPantryBackup}
  if($Action -eq 'NutritionUpdate'){$start.Environment['WINESNAP_OWNED_NUTRITION_BACKUP']=$VerifiedNutritionBackup}
  if($Action -eq 'MealPhotoUpdate'){
    $start.Environment['WINESNAP_OWNED_MEAL_PHOTO_APPROVED']='1'
    $start.Environment['WINESNAP_OWNED_MEAL_PHOTO_BACKUP']=$VerifiedMealPhotoBackup
    $start.Environment['WINESNAP_OWNED_MEAL_PHOTO_REVISION']=$ExpectedMealPhotoRevision
    $start.Environment['WINESNAP_OWNED_MEAL_PHOTO_PREVIOUS_IMAGE']=$ExpectedMealPhotoPreviousImage
  }
  if($Action -eq 'PrivateJournalUpdate'){
    $start.Environment['WINESNAP_OWNED_JOURNAL_APPROVED']='1'
    $start.Environment['WINESNAP_OWNED_JOURNAL_BACKUP']=$VerifiedPrivateJournalBackup
    $start.Environment['WINESNAP_OWNED_JOURNAL_REVISION']=$ExpectedPrivateJournalRevision
    $start.Environment['WINESNAP_OWNED_JOURNAL_PREVIOUS_IMAGE']=$ExpectedPrivateJournalPreviousImage
  }
  $start.ArgumentList.Add((Join-Path $PSScriptRoot 'manage-owned-backend.mjs'));$start.ArgumentList.Add($Action)
  $phase='owned_backend_operation'
  $process=[Diagnostics.Process]::Start($start)
  $output=$process.StandardOutput.ReadToEndAsync();$errors=$process.StandardError.ReadToEndAsync()
  $process.StandardInput.Write($payload);$process.StandardInput.Close();$payload=$null
  if(-not $process.WaitForExit(1200000)){$process.Kill($true);throw 'Owned backend operation timed out.'}
  if(-not [Threading.Tasks.Task]::WaitAll([Threading.Tasks.Task[]]@($output,$errors),5000)){throw 'Owned operation output did not close.'}
  $raw=$output.GetAwaiter().GetResult();$errors.GetAwaiter().GetResult() | Out-Null
  if($raw.Length -gt 128MB){throw 'Oversized operation result.'}
  $result=$raw | ConvertFrom-Json -Depth 30;$raw=$null
  if($result.archive -and ($Action -ne 'Backup' -or -not $result.report.completed)) {throw 'Private archive cannot be copied into a public status report.'}
  if($Action -eq 'Backup' -and $result.archive -and $result.report.completed){
    if($result.archive.project -ne 'winesnap-owned-local' -or -not $result.archive.writeQuiesced){throw 'Unexpected backup scope.'}
    $backupDirectory=Join-Path $directory 'backups'
    Assert-Safe $backupDirectory
    New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null;Set-Private $backupDirectory -Folder
    $bytes=[Text.Encoding]::UTF8.GetBytes(($result.archive | ConvertTo-Json -Depth 30 -Compress))
    $filename='owned-'+[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmssfff')+'.dpapi'
    $file=Join-Path $backupDirectory $filename
    [IO.File]::WriteAllBytes($file,[Security.Cryptography.ProtectedData]::Protect($bytes,$null,'CurrentUser'))
    Set-Private $file
    $encrypted=[IO.File]::ReadAllBytes($file)
    $archiveHash=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($encrypted)).ToLowerInvariant()
    $roundtrip=[Security.Cryptography.ProtectedData]::Unprotect($encrypted,$null,'CurrentUser')
    $encrypted=$null
    if(-not [Security.Cryptography.CryptographicOperations]::FixedTimeEquals([Security.Cryptography.SHA256]::HashData($bytes),[Security.Cryptography.SHA256]::HashData($roundtrip))){throw 'Backup encryption verification failed.'}
    [Array]::Clear($roundtrip,0,$roundtrip.Length)
    $report=$result.report | ConvertTo-Json | ConvertFrom-Json -AsHashtable
    $report.backupFile=$filename;$report.encryptedRoundtripVerified=$true;$report.backupArchiveSha256=$archiveHash
    $files=@(Get-ChildItem -LiteralPath $backupDirectory -Filter 'owned-*.dpapi' -File | Sort-Object Name -Descending)
    for($i=0;$i -lt $files.Count;$i++){
      $item=$files[$i]
      if($item.Name -notmatch '^owned-\d{8}-\d{9}\.dpapi$' -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Unsafe backup entry.'}
      if($i -ge 7 -or $item.LastWriteTimeUtc -lt [DateTime]::UtcNow.AddDays(-7)){Remove-Item -LiteralPath $item.FullName}
    }
  } else {
    foreach($property in $result.PSObject.Properties){$report[$property.Name]=$property.Value}
  }
  if($process.ExitCode -ne 0){$report.completed=$false}
} catch {
  $type=$_.Exception.GetType().FullName
  if($type -match '^[A-Za-z0-9_.]+$'){$report.errorType=$type}
  $report.failureLine=$_.InvocationInfo.ScriptLineNumber
  $report.completed=$false
  if(-not $report.failure){$report.failure='owned_backend_operation_failed'}
  if(-not $report.phase){$report.phase=$phase}
} finally {
  if($bytes){[Array]::Clear($bytes,0,$bytes.Length)}
  if($provider){foreach($slot in @('OpenAI','Gemini')){if($provider.$slot -is [pscredential]){$provider.$slot.Password.Dispose()}}}
  $payload=$null;$result=$null;$keys=$null
  if($process){$process.Dispose()};if($start){$start.Environment.Clear()}
  $report.checkedAt=[DateTime]::UtcNow.ToString('o')
  if($acquired){
    $file=Join-Path $directory ($Action.ToLowerInvariant()+'-status.json');Assert-Safe $file
    $report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $file -Encoding utf8
  }
  if($operationLock){$operationLock.Dispose()}
}
$report | ConvertTo-Json -Depth 6
if(-not $report.completed -and -not $report.skipped){exit 1}
exit 0
