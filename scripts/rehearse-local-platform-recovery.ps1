param([string]$BackupFile)
$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'PowerShell 7 on Windows is required.' }
$root = Split-Path -Parent $PSScriptRoot
$homeDirectory = Join-Path $env:LOCALAPPDATA 'WineSnapHosting'
$directory = Join-Path $homeDirectory 'platform-recovery'
$docker = Join-Path $env:LOCALAPPDATA 'Programs/DockerDesktop/resources/bin/docker.exe'
$node = Join-Path $HOME '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
$id = [guid]::NewGuid().ToString('N').Substring(0,16)
$report = [ordered]@{project='pzniyupmgwvlldvztzqh';completed=$false;productionTouched=$false;hostedTestExport=$false;fullPlatformRecoveryVerified=$false;cleanupCompleted=$false}
$plain = $null
$process = $null
$phase = 'private_directory'
$mutex = [Threading.Mutex]::new($false,"Local\WineSnap-Platform-Recovery-$([Security.Principal.WindowsIdentity]::GetCurrent().User.Value)")
$acquired = $false
function Invoke-PrivateRecovery([string]$Mode,[byte[]]$InputBytes) {
  $start = [Diagnostics.ProcessStartInfo]::new()
  $start.FileName = $node
  $start.WorkingDirectory = $root
  $start.UseShellExecute=$false; $start.CreateNoWindow=$true
  $start.RedirectStandardInput=$true; $start.RedirectStandardOutput=$true; $start.RedirectStandardError=$true
  $start.Environment.Clear()
  foreach($key in @('PATH','PATHEXT','COMSPEC','SystemRoot','WINDIR','SystemDrive','ProgramData','ALLUSERSPROFILE','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP')) {
    $value=[Environment]::GetEnvironmentVariable($key)
    if($value) {$start.Environment[$key]=$value}
  }
  $start.Environment['WINESNAP_PLATFORM_ID']=$id
  $start.Environment['WINESNAP_PLATFORM_PRIVATE_IO']='1'
  $start.ArgumentList.Add((Join-Path $PSScriptRoot 'check-local-platform-recovery.mjs'))
  $start.ArgumentList.Add($Mode)
  try {
    $script:process=[Diagnostics.Process]::Start($start)
    $output=$process.StandardOutput.ReadToEndAsync(); $errors=$process.StandardError.ReadToEndAsync()
    if($InputBytes) {$process.StandardInput.BaseStream.Write($InputBytes,0,$InputBytes.Length)}
    $process.StandardInput.Close()
    if(-not $process.WaitForExit(600000)) {$process.Kill($true);throw 'Platform rehearsal timed out.'}
    $raw=$output.GetAwaiter().GetResult()
    $errors.GetAwaiter().GetResult() | Out-Null
    if($raw.Length -gt 128MB) {throw 'Oversized recovery output.'}
    $result=$raw | ConvertFrom-Json -Depth 50
    if($process.ExitCode -ne 0) {
      # Only copy the code-controlled phase, never raw service/SQL diagnostics.
      if($result.phase -match '^[a-z_]+(:[a-zA-Z0-9_.-]+)?$') {$script:report.phase=$result.phase}
      throw 'Platform rehearsal failed.'
    }
    return $result
  } finally {
    if($script:process) {$script:process.Dispose();$script:process=$null}
    $start.Environment.Clear()
  }
}
try {
  try {$acquired=$mutex.WaitOne(0)} catch [Threading.AbandonedMutexException] {$acquired=$true}
  if(-not $acquired) {throw 'Another platform rehearsal is running.'}
  foreach($path in @($homeDirectory,$directory)) {
    if((Test-Path -LiteralPath $path) -and ((Get-Item -LiteralPath $path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {throw 'Redirected recovery directory refused.'}
  }
  New-Item -ItemType Directory -Path $directory -Force | Out-Null
  $owner=[Security.Principal.WindowsIdentity]::GetCurrent().User
  $acl=[Security.AccessControl.DirectorySecurity]::new()
  $acl.SetOwner($owner);$acl.SetAccessRuleProtection($true,$false)
  foreach($sid in @($owner,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
  }
  [IO.FileSystemAclExtensions]::SetAccessControl((Get-Item -LiteralPath $directory -Force),$acl)
  $expected=$null
  if(-not $BackupFile) {
    $phase='source_backup'
    $created=Invoke-PrivateRecovery 'create' $null
    if(-not $created.report.completed -or -not $created.report.cleanupCompleted -or $created.bundle.hostedTestExport -ne $false -or $created.bundle.project -ne $report.project) {throw 'Unexpected source scope.'}
    $phase='encrypted_roundtrip'
    $plain=[Text.Encoding]::UTF8.GetBytes(($created.bundle | ConvertTo-Json -Depth 50 -Compress))
    if($plain.Length -gt 128MB) {throw 'Oversized platform archive.'}
    $filename='platform-fixture-'+[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmssfff')+'.dpapi'
    $file=Join-Path $directory $filename
    if(Test-Path -LiteralPath $file) {throw 'Refusing to overwrite an archive.'}
    [IO.File]::WriteAllBytes($file,[Security.Cryptography.ProtectedData]::Protect($plain,$null,'CurrentUser'))
    $expected=[Security.Cryptography.SHA256]::HashData($plain)
    [Array]::Clear($plain,0,$plain.Length);$plain=$null;$created=$null
  } else {
    $phase='validate_existing_archive'
    $base=[IO.Path]::GetFullPath($directory)+[IO.Path]::DirectorySeparatorChar
    $file=[IO.Path]::GetFullPath($BackupFile)
    $filename=[IO.Path]::GetFileName($file)
    if(-not $file.StartsWith($base,[StringComparison]::OrdinalIgnoreCase) -or
      [IO.Path]::GetDirectoryName($file) -ne [IO.Path]::GetFullPath($directory) -or
      $filename -notmatch '^platform-fixture-\d{8}-\d{9}\.dpapi$') {throw 'Unexpected recovery archive path.'}
  }
  $item=Get-Item -LiteralPath $file -Force
  if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $item.Length -gt 130MB) {throw 'Unsafe recovery archive.'}
  foreach($rule in (Get-Acl -LiteralPath $file).Access) {
    $sid=$rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
    if($rule.AccessControlType -eq 'Allow' -and $sid -notin @($owner.Value,'S-1-5-18')) {throw 'Archive is readable by another account.'}
  }
  $plain=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($file),$null,'CurrentUser')
  if($plain.Length -gt 128MB) {throw 'Oversized recovery archive.'}
  if($expected -and -not [Security.Cryptography.CryptographicOperations]::FixedTimeEquals($expected,[Security.Cryptography.SHA256]::HashData($plain))) {throw 'Encrypted platform roundtrip failed.'}
  $phase='isolated_restore'
  $restored=Invoke-PrivateRecovery 'restore' $plain
  if($restored.project -ne $report.project -or $restored.fullPlatformRecoveryVerified -ne $false -or $restored.hostedTestExport -ne $false -or -not $restored.cleanupCompleted -or -not $restored.localPlatformRehearsalVerified) {throw 'Unexpected restore scope.'}
  foreach($property in $restored.PSObject.Properties) {$report[$property.Name]=$property.Value}
  $report.backupFile=$filename
  $report.encryptedRoundtripVerified=[bool]$expected
  $report.existingArchiveRestored=[bool]$BackupFile
} catch {
  $report.completed=$false;$report.failure='platform_rehearsal_not_accepted'
  if(-not $report.phase) {$report.phase=$phase}
} finally {
  if($plain) {[Array]::Clear($plain,0,$plain.Length)}
  if($process) {$process.Dispose()}
  if($acquired) {
    # Recover only this invocation's generated names after a timeout. Never use
    # a broad label prune or touch the running WineSnap application.
    $clean=$true
    foreach($suffix in @('probe','storage','auth','db')) {
      $name="winesnap-platform-$id-$suffix"
      $identity=& $docker --host npipe:////./pipe/dockerDesktopLinuxEngine inspect --format '{{index .Config.Labels "winesnap.scope"}}|{{.HostConfig.NetworkMode}}' $name 2>$null
      if($LASTEXITCODE -eq 0) {
        if($identity -eq "local-platform-recovery|winesnap-platform-$id") {
          & $docker --host npipe:////./pipe/dockerDesktopLinuxEngine rm --force $name 2>$null | Out-Null
          if($LASTEXITCODE -ne 0) {$clean=$false}
        } else {$clean=$false}
      }
    }
    $network=& $docker --host npipe:////./pipe/dockerDesktopLinuxEngine network inspect --format '{{index .Labels "winesnap.scope"}}|{{.Internal}}' "winesnap-platform-$id" 2>$null
    if($LASTEXITCODE -eq 0) {
      if($network -eq 'local-platform-recovery|true') {
        & $docker --host npipe:////./pipe/dockerDesktopLinuxEngine network rm "winesnap-platform-$id" 2>$null | Out-Null
        if($LASTEXITCODE -ne 0) {$clean=$false}
      } else {$clean=$false}
    }
    $report.cleanupCompleted=$clean
    if(-not $clean) {$report.completed=$false}
    # Synthetic archives still contain password hashes. Bound their retention.
    $base=[IO.Path]::GetFullPath($directory)+[IO.Path]::DirectorySeparatorChar
    $all=@(Get-ChildItem -LiteralPath $directory -Filter 'platform-fixture-*.dpapi' -File | Sort-Object Name -Descending)
    for($i=0;$i -lt $all.Count;$i++) {
      $item=$all[$i]
      if($item.Name -match '^platform-fixture-\d{8}-\d{9}\.dpapi$' -and
        [IO.Path]::GetFullPath($item.FullName).StartsWith($base,[StringComparison]::OrdinalIgnoreCase) -and
        -not ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -and
        ($i -ge 7 -or $item.LastWriteTimeUtc -lt [DateTime]::UtcNow.AddDays(-7))) {Remove-Item -LiteralPath $item.FullName}
    }
    $report.checkedAt=[DateTime]::UtcNow.ToString('o')
    $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $homeDirectory 'platform-recovery-status.json') -Encoding utf8
    $mutex.ReleaseMutex()
  }
  $mutex.Dispose()
}
$report | ConvertTo-Json -Depth 8
if(-not $report.completed) {exit 1}
