param(
  [ValidateSet('Start','Resume','RestartApp','Verify','Update','Backup','Accept','Features','FeaturesAi','Offline','BrowserPrepare','BrowserInspect','BrowserConflict','BrowserMemory','BrowserCleanup','Maintain')][string]$Action='Start',
  [ValidateSet('https://winesnap.boleoai.se')][string]$PublicOrigin,
  [switch]$LocalOnly
)
$ErrorActionPreference='Stop'
if(-not $IsWindows){throw 'PowerShell 7 on Windows is required.'}
if(($PublicOrigin -or $LocalOnly) -and $Action -ne 'Update'){throw 'Changing the app origin requires an explicit Update.'}
if($PublicOrigin -and $LocalOnly){throw 'Choose one owned origin mode.'}
$root=Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'lib/owned-windows-runtime.ps1')
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
  New-Item -ItemType Directory -Path $directory -Force | Out-Null
  Set-Private $directory -Folder
  $operationLock=Open-OwnedRuntimeLock -Name operation -WaitMs $(if($Action -eq 'Offline'){300000}else{0})
  $acquired=[bool]$operationLock
  if(-not $acquired){$report.skipped='operation_already_running';throw 'Operation is already running.'}
  $phase='local_engine'
  $engine=Test-OwnedDockerEngine
  $report.engineLinux=$engine
  if(-not $engine){throw 'Local Docker Desktop Linux engine required.'}
  if(-not (Test-Path -LiteralPath $store -PathType Leaf)) {
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
  $payload=$keys | ConvertTo-Json -Compress;$keys.Clear();$keys=$null
  $start=[Diagnostics.ProcessStartInfo]::new()
  $start.FileName=$node;$start.WorkingDirectory=$root;$start.UseShellExecute=$false;$start.CreateNoWindow=$true
  $start.RedirectStandardInput=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
  $start.Environment.Clear()
  foreach($key in @('PATH','PATHEXT','COMSPEC','SystemRoot','WINDIR','SystemDrive','ProgramData','ALLUSERSPROFILE','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP')){
    $value=[Environment]::GetEnvironmentVariable($key);if($value){$start.Environment[$key]=$value}
  }
  $start.Environment['WINESNAP_OWNED_PIPE']='1'
  if($PublicOrigin){$start.Environment['WINESNAP_OWNED_PUBLIC_ORIGIN']=$PublicOrigin}
  if($LocalOnly){$start.Environment['WINESNAP_OWNED_ORIGIN_RESET']='1'}
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
    $roundtrip=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($file),$null,'CurrentUser')
    if(-not [Security.Cryptography.CryptographicOperations]::FixedTimeEquals([Security.Cryptography.SHA256]::HashData($bytes),[Security.Cryptography.SHA256]::HashData($roundtrip))){throw 'Backup encryption verification failed.'}
    [Array]::Clear($roundtrip,0,$roundtrip.Length)
    $report=$result.report | ConvertTo-Json | ConvertFrom-Json -AsHashtable
    $report.backupFile=$filename;$report.encryptedRoundtripVerified=$true
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
