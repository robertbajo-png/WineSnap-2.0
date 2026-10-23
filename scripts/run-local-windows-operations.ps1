param([ValidateSet('Maintain', 'Backup', 'VerifyBackup')][string]$Action = 'Maintain')
$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'PowerShell 7 on Windows is required.' }
$root = Split-Path -Parent $PSScriptRoot
$project = 'pzniyupmgwvlldvztzqh'
$directory = Join-Path $env:LOCALAPPDATA 'WineSnapHosting/backups'
$docker = Join-Path $env:LOCALAPPDATA 'Programs/DockerDesktop/resources/bin/docker.exe'
$report = [ordered]@{ project=$project; action=$Action; completed=$false; productionTouched=$false }
$bytes = $null
$raw = $null
$process = $null
$phase = 'private_directory'
$mutex = [Threading.Mutex]::new($false, "Local\WineSnap-Test-Operations-$([Security.Principal.WindowsIdentity]::GetCurrent().User.Value)")
$acquired = $false
function Remove-ExpiredSnapshots {
  $base = [IO.Path]::GetFullPath($directory) + [IO.Path]::DirectorySeparatorChar
  $all = @(Get-ChildItem -LiteralPath $directory -Filter 'snapshot-*.dpapi' -File | Sort-Object Name -Descending)
  for ($i=0; $i -lt $all.Count; $i++) {
    $file = $all[$i]
    if ($file.Name -notmatch '^snapshot-\d{8}-\d{9}\.dpapi$') { throw 'Unexpected backup filename.' }
    if (-not [IO.Path]::GetFullPath($file.FullName).StartsWith($base, [StringComparison]::OrdinalIgnoreCase) -or ($file.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Unsafe backup path.' }
    if ($i -ge 7 -or $file.LastWriteTimeUtc -lt [DateTime]::UtcNow.AddDays(-7)) { Remove-Item -LiteralPath $file.FullName }
  }
}
try {
  try { $acquired = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $acquired = $true }
  if (-not $acquired) { $report.skipped = 'job_already_running'; throw 'A local maintenance or backup job is already running.' }
  foreach ($path in @((Split-Path -Parent $directory), $directory)) {
    if (Test-Path -LiteralPath $path) {
      if ((Get-Item -LiteralPath $path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected backup storage refused.' }
    }
  }
  New-Item -ItemType Directory -Path $directory -Force | Out-Null
  $owner = [Security.Principal.WindowsIdentity]::GetCurrent().User
  $acl = [Security.AccessControl.DirectorySecurity]::new()
  $acl.SetOwner($owner)
  $acl.SetAccessRuleProtection($true, $false)
  foreach ($sid in @($owner, [Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))
  }
  [IO.FileSystemAclExtensions]::SetAccessControl((Get-Item -LiteralPath $directory -Force), $acl)
  # Prune on failed/offline jobs too, not only when a fresh backup succeeds.
  Remove-ExpiredSnapshots
  if ($Action -ne 'VerifyBackup') {
    $phase = 'engine_identity'
    $context = & $docker --context desktop-linux context inspect desktop-linux | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0 -or $context[0].Endpoints.docker.Host -ne 'npipe:////./pipe/dockerDesktopLinuxEngine') { throw 'Only the local engine is allowed.' }
    $identity = & $docker --context desktop-linux inspect --format '{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "winesnap.scope"}}|{{.State.Running}}' winesnap-local-web-1
    if ($LASTEXITCODE -ne 0 -or $identity -ne 'winesnap-local|local-windows-test|true') { throw 'Unexpected local container.' }
    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = $docker
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.Environment.Clear()
    foreach ($key in @('PATH', 'SystemRoot', 'WINDIR', 'SystemDrive', 'ProgramData', 'ALLUSERSPROFILE', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP')) {
      $value = [Environment]::GetEnvironmentVariable($key)
      if ($value) { $start.Environment[$key] = $value }
    }
    $code = [IO.File]::ReadAllText((Join-Path $root 'config/local-windows/operations-client.mjs'))
    $mode = if ($Action -eq 'Backup') { 'backup' } else { 'maintain' }
    foreach ($arg in @('--context', 'desktop-linux', 'exec', 'winesnap-local-web-1', 'node', '--input-type=module', '--eval', $code, '--', $mode)) { $start.ArgumentList.Add($arg) }
    $process = [Diagnostics.Process]::Start($start)
    $phase = 'container_operation'
    $output = $process.StandardOutput.ReadToEndAsync()
    $errors = $process.StandardError.ReadToEndAsync()
    if (-not $process.WaitForExit(600000)) { $process.Kill(); throw 'Local operation timed out.' }
    $raw = $output.GetAwaiter().GetResult()
    $diagnostic = $errors.GetAwaiter().GetResult()
    if ($process.ExitCode -ne 0 -and $Action -ne 'Maintain') { throw 'Local operation failed.' }
    $result = $raw | ConvertFrom-Json -Depth 100
    if ($result.project -ne $project) { throw 'Unexpected project.' }
    if ($Action -eq 'Maintain') {
      $report.results = $result.results
      $report.completed = [bool]$result.completed
    } else {
      $phase = 'encrypt_snapshot'
      if ($result.version -ne 1) { throw 'Unexpected snapshot.' }
      $bytes = [Text.Encoding]::UTF8.GetBytes($raw)
      $cipher = [Security.Cryptography.ProtectedData]::Protect($bytes, $null, 'CurrentUser')
      $path = Join-Path $directory ("snapshot-" + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmssfff') + '.dpapi')
      [IO.File]::WriteAllBytes($path, $cipher)
      $plain = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($path), $null, 'CurrentUser')
      if (-not [Security.Cryptography.CryptographicOperations]::FixedTimeEquals([Security.Cryptography.SHA256]::HashData($bytes), [Security.Cryptography.SHA256]::HashData($plain))) { throw 'Backup roundtrip failed.' }
      $report.backupFile = [IO.Path]::GetFileName($path)
    }
  }
  if ($Action -in @('Backup', 'VerifyBackup')) {
    $phase = 'verify_snapshot'
    $latest = Get-ChildItem -LiteralPath $directory -Filter 'snapshot-*.dpapi' -File | Sort-Object Name -Descending | Select-Object -First 1
    if (-not $latest -or ($latest.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Expected a local encrypted backup.' }
    $bytes = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($latest.FullName), $null, 'CurrentUser')
    $snapshot = [Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json -Depth 100
    if ($snapshot.project -ne $project -or $snapshot.version -ne 1 -or @($snapshot.tables.PSObject.Properties).Count -lt 20) { throw 'Incomplete application snapshot.' }
    foreach ($file in $snapshot.files) {
      $content = [Convert]::FromBase64String($file.base64)
      $hash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($content)).ToLowerInvariant()
      if ($hash -ne $file.sha256) { throw 'Backup image checksum failed.' }
    }
    $report.verifiedTables = @($snapshot.tables.PSObject.Properties).Count
    $report.verifiedFiles = @($snapshot.files).Count
    $report.fullDatabaseBackup = $false
    $report.completed = $true
    Remove-ExpiredSnapshots
  }
} catch {
  $report.failure = 'local_operation_failed'
  $report.phase = $phase
  $report.errorType = $_.Exception.GetType().Name
} finally {
  if ($process) { $process.Dispose() }
  if ($start) { $start.Environment.Clear() }
  if ($bytes) { [Array]::Clear($bytes, 0, $bytes.Length) }
  if ($plain) { [Array]::Clear($plain, 0, $plain.Length) }
  if ($content) { [Array]::Clear($content, 0, $content.Length) }
  $raw = $null
  $snapshot = $null
  $result = $null
  $report.checkedAt = [DateTime]::UtcNow.ToString('o')
  $statusPath = Join-Path (Split-Path -Parent $directory) ($Action.ToLowerInvariant() + '-status.json')
  if ($acquired) { $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $statusPath -Encoding utf8 }
  if ($acquired) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
$report | ConvertTo-Json -Depth 8
if (-not $report.completed -and -not $report.skipped) { exit 1 }
