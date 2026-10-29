param([ValidatePattern('^owned-\d{8}-\d{9}\.dpapi$')][string]$BackupFile)
$ErrorActionPreference='Stop'
if(-not $IsWindows){throw 'PowerShell 7 on Windows is required.'}
$root=Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'lib/owned-windows-runtime.ps1')
$directory=Get-OwnedRuntimeDirectory
$backups=Join-Path $directory 'backups'
$docker=Join-Path $env:LOCALAPPDATA 'Programs/DockerDesktop/resources/bin/docker.exe'
$node=Join-Path $HOME '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
$id=[guid]::NewGuid().ToString('N').Substring(0,16)
$prefix="winesnap-owned-restore-$id"
$report=[ordered]@{project='winesnap-owned-local';completed=$false;productionTouched=$false;hostedTestTouched=$false;cleanupCompleted=$false;portableRecoveryVerified=$false}
$plain=$null;$process=$null;$phase='private_archive'
$operationLock=$null
$acquired=$false
function Assert-Private([string]$Path,[switch]$AllowInherited) {
  $item=Get-Item -LiteralPath $Path -Force
  if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected private archive refused.'}
  $acl=Get-Acl -LiteralPath $Path
  if(-not $AllowInherited -and -not $acl.AreAccessRulesProtected){throw 'Private archive permissions required.'}
  $owner=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  foreach($rule in $acl.Access){
    $sid=$rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
    if($rule.AccessControlType -eq 'Allow' -and $sid -notin @($owner,'S-1-5-18')){throw 'Archive readable by another account.'}
  }
}
try {
  $operationLock=Open-OwnedRuntimeLock -Name operation
  $acquired=[bool]$operationLock
  if(-not $acquired){$report.skipped='operation_already_running';throw 'Owned operation is already running.'}
  Assert-Private $directory;Assert-Private $backups
  if(-not $BackupFile){$BackupFile=(Get-ChildItem -LiteralPath $backups -File | Where-Object {$_.Name -match '^owned-\d{8}-\d{9}\.dpapi$'} | Sort-Object Name -Descending | Select-Object -First 1).Name}
  if(-not $BackupFile){throw 'No owned archive exists.'}
  $file=Join-Path $backups $BackupFile
  Assert-Private $file -AllowInherited
  $item=Get-Item -LiteralPath $file -Force
  if($item.Length -gt 130MB -or $item.Length -lt 1){throw 'Unexpected archive size.'}
  $plain=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($file),$null,'CurrentUser')
  if($plain.Length -gt 128MB){throw 'Oversized owned archive.'}
  $phase='isolated_restore'
  $start=[Diagnostics.ProcessStartInfo]::new()
  $start.FileName=$node;$start.WorkingDirectory=$root;$start.UseShellExecute=$false;$start.CreateNoWindow=$true
  $start.RedirectStandardInput=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
  $start.Environment.Clear()
  foreach($key in @('PATH','PATHEXT','COMSPEC','SystemRoot','WINDIR','SystemDrive','ProgramData','ALLUSERSPROFILE','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP')){
    $value=[Environment]::GetEnvironmentVariable($key);if($value){$start.Environment[$key]=$value}
  }
  $start.Environment['WINESNAP_OWNED_RESTORE_PIPE']='1';$start.Environment['WINESNAP_OWNED_RESTORE_ID']=$id
  $start.ArgumentList.Add((Join-Path $PSScriptRoot 'rehearse-owned-recovery.mjs'))
  $process=[Diagnostics.Process]::Start($start)
  $output=$process.StandardOutput.ReadToEndAsync();$errors=$process.StandardError.ReadToEndAsync()
  $process.StandardInput.BaseStream.Write($plain,0,$plain.Length);$process.StandardInput.Close()
  [Array]::Clear($plain,0,$plain.Length);$plain=$null
  if(-not $process.WaitForExit(600000)){$process.Kill($true);throw 'Owned restore timed out.'}
  if(-not [Threading.Tasks.Task]::WaitAll([Threading.Tasks.Task[]]@($output,$errors),5000)){throw 'Owned restore output did not close.'}
  $raw=$output.GetAwaiter().GetResult();$errors.GetAwaiter().GetResult() | Out-Null
  if($raw.Length -gt 32KB){throw 'Unexpected restore output.'}
  $restored=$raw | ConvertFrom-Json -Depth 8;$raw=$null
  if($restored.project -ne 'winesnap-owned-local' -or $restored.productionTouched -ne $false -or $restored.hostedTestTouched -ne $false){throw 'Unexpected restore scope.'}
  foreach($property in $restored.PSObject.Properties){$report[$property.Name]=$property.Value}
  $report.backupFile=$BackupFile
  if($process.ExitCode -ne 0){$report.completed=$false}
} catch {
  $report.completed=$false
  if(-not $report.failure){$report.failure='owned_restore_not_accepted'}
  if(-not $report.phase){$report.phase=$phase}
} finally {
  if($plain){[Array]::Clear($plain,0,$plain.Length)}
  if($process){$process.Dispose()};if($start){$start.Environment.Clear()}
  if($acquired){
    # Exact names and invocation labels only. No host paths or permanent volumes.
    $clean=$true
    foreach($suffix in @('storage','rest','auth','probe','db')){
      $name="$prefix-$suffix"
      $identity=& $docker --host npipe:////./pipe/dockerDesktopLinuxEngine inspect --format '{{index .Config.Labels "winesnap.scope"}}|{{index .Config.Labels "winesnap.restore"}}|{{.HostConfig.NetworkMode}}' $name 2>$null
      if($LASTEXITCODE -eq 0){
        if($identity -eq "owned-backup-rehearsal|$id|$prefix"){
          & $docker --host npipe:////./pipe/dockerDesktopLinuxEngine rm --force $name 2>$null | Out-Null
          if($LASTEXITCODE -ne 0){$clean=$false}
        }else{$clean=$false}
      }
    }
    $net=& $docker --host npipe:////./pipe/dockerDesktopLinuxEngine network inspect --format '{{index .Labels "winesnap.scope"}}|{{index .Labels "winesnap.restore"}}|{{.Internal}}' $prefix 2>$null
    if($LASTEXITCODE -eq 0){
      if($net -eq "owned-backup-rehearsal|$id|true"){
        & $docker --host npipe:////./pipe/dockerDesktopLinuxEngine network rm $prefix 2>$null | Out-Null
        if($LASTEXITCODE -ne 0){$clean=$false}
      }else{$clean=$false}
    }
    $report.cleanupCompleted=$clean
    if(-not $clean){$report.completed=$false}
    $report.checkedAt=[DateTime]::UtcNow.ToString('o')
    $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $directory 'restore-status.json') -Encoding utf8
  }
  if($operationLock){$operationLock.Dispose()}
}
$report | ConvertTo-Json -Depth 8
if(-not $report.completed -and -not $report.skipped){exit 1}
exit 0
