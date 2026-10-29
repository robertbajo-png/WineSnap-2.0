param([string]$SnapshotFile)
$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'PowerShell 7 on Windows is required.' }
$root = Split-Path -Parent $PSScriptRoot
$directory = Join-Path $env:LOCALAPPDATA 'WineSnapHosting/backups'
$docker = Join-Path $env:LOCALAPPDATA 'Programs/DockerDesktop/resources/bin/docker.exe'
$invocation = [guid]::NewGuid().ToString('N').Substring(0,16)
$name = "winesnap-snapshot-restore-$invocation"
$report = [ordered]@{project='pzniyupmgwvlldvztzqh';completed=$false;fullDatabaseBackup=$false;productionTouched=$false}
$bytes = $null
$process = $null
$phase = 'encrypted_snapshot'
try {
  if (-not $SnapshotFile) {
    $SnapshotFile = (Get-ChildItem -LiteralPath $directory -Filter 'snapshot-*.dpapi' -File | Sort-Object Name -Descending | Select-Object -First 1).FullName
  }
  $base = [IO.Path]::GetFullPath($directory) + [IO.Path]::DirectorySeparatorChar
  $resolved = [IO.Path]::GetFullPath($SnapshotFile)
  if (-not $resolved.StartsWith($base,[StringComparison]::OrdinalIgnoreCase) -or
    [IO.Path]::GetFileName($resolved) -notmatch '^snapshot-\d{8}-\d{9}\.dpapi$') {throw 'Unexpected snapshot path.'}
  $report.snapshotFile = [IO.Path]::GetFileName($resolved)
  $file = Get-Item -LiteralPath $resolved -Force
  if ($file.Length -gt 100MB) {throw 'Unexpected snapshot size.'}
  $owner = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  foreach($path in @((Split-Path -Parent $directory),$directory,$file.FullName)) {
    if ((Get-Item -LiteralPath $path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {throw 'Redirected snapshot storage refused.'}
  }
  $acl=Get-Acl -LiteralPath $file.FullName
  if (-not (Get-Acl -LiteralPath $directory).AreAccessRulesProtected) {throw 'Private snapshot directory required.'}
  foreach($rule in $acl.Access) {
    $sid=$rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
    if ($rule.AccessControlType -eq 'Allow' -and $sid -notin @($owner,'S-1-5-18')) {throw 'Snapshot is readable by another account.'}
  }
  $bytes=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($file.FullName),$null,'CurrentUser')
  if ($bytes.Length -gt 80MB) {throw 'Snapshot exceeds rehearsal limits.'}
  $start=[Diagnostics.ProcessStartInfo]::new()
  $start.FileName=Join-Path $HOME '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
  $start.WorkingDirectory=$root
  $start.UseShellExecute=$false; $start.CreateNoWindow=$true
  $start.RedirectStandardInput=$true; $start.RedirectStandardOutput=$true; $start.RedirectStandardError=$true
  $start.Environment.Clear()
  foreach($key in @('PATH','PATHEXT','COMSPEC','SystemRoot','WINDIR','SystemDrive','ProgramData','ALLUSERSPROFILE','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP')) {
    $value=[Environment]::GetEnvironmentVariable($key)
    if ($value) {$start.Environment[$key]=$value}
  }
  $start.Environment['WINESNAP_RESTORE_ID']=$invocation
  $start.ArgumentList.Add((Join-Path $PSScriptRoot 'check-local-snapshot-restore.mjs'))
  $phase='isolated_restore'
  $process=[Diagnostics.Process]::Start($start)
  $output=$process.StandardOutput.ReadToEndAsync(); $errors=$process.StandardError.ReadToEndAsync()
  $process.StandardInput.BaseStream.Write($bytes,0,$bytes.Length); $process.StandardInput.Close()
  [Array]::Clear($bytes,0,$bytes.Length); $bytes=$null
  if (-not $process.WaitForExit(600000)) {$process.Kill($true);throw 'Isolated restore timed out.'}
  $result=$output.GetAwaiter().GetResult() | ConvertFrom-Json
  $errors.GetAwaiter().GetResult() | Out-Null
  if ($result.project -ne $report.project -or $result.fullDatabaseBackup -ne $false) {throw 'Unexpected rehearsal scope.'}
  foreach($property in $result.PSObject.Properties) {$report[$property.Name]=$property.Value}
  if ($process.ExitCode -ne 0 -or -not $result.completed) {throw 'Isolated application restore failed.'}
} catch {
  $report.completed=$false; $report.failure='application_restore_not_accepted'
  if (-not $report.phase) {$report.phase=$phase}
} finally {
  if ($bytes) {[Array]::Clear($bytes,0,$bytes.Length)}
  if ($process) {$process.Dispose()}
  if ($start) {$start.Environment.Clear()}
  # Also clean this invocation's sandbox if the helper timed out before its finally block.
  $identity=& $docker --context desktop-linux inspect --format '{{index .Config.Labels "winesnap.scope"}}|{{.HostConfig.NetworkMode}}' $name 2>$null
  if ($LASTEXITCODE -eq 0) {
    if ($identity -eq 'local-snapshot-restore|none') {
      & $docker --context desktop-linux rm --force $name 2>$null | Out-Null
      $report.cleanupCompleted=$LASTEXITCODE -eq 0
    } else {$report.cleanupCompleted=$false}
  }
  if ($report.cleanupCompleted -eq $false) {$report.completed=$false}
  $report.checkedAt=[DateTime]::UtcNow.ToString('o')
  $report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path (Split-Path -Parent $directory) 'restore-status.json') -Encoding utf8
}
$report | ConvertTo-Json -Depth 6
if (-not $report.completed) {exit 1}
exit 0
