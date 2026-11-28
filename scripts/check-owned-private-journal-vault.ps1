param([ValidateSet('SelfTest','RestartFixture','DatabaseFixture')][string]$Mode = 'SelfTest')
$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'Synthetic Windows test only.' }
. (Join-Path $PSScriptRoot 'lib/owned-private-journal-vault.ps1')

function Require([bool]$Condition) { if (-not $Condition) { throw 'Private vault fixture assertion failed.' } }
function Write-FixtureMessage($Message) { [Console]::WriteLine(($Message | ConvertTo-Json -Depth 8 -Compress)); [Console]::Out.Flush() }
function Read-FixtureMessage {
  $line = [Console]::ReadLine()
  if (-not $line -or $line.Length -gt 384KB) { throw 'Unexpected private fixture response.' }
  return (ConvertFrom-Json -InputObject $line -AsHashtable -Depth 8 -DateKind String)
}
function Invoke-FixtureAdapter([string]$Request, [byte[]]$Bytes) {
  $message = @{request=$Request}
  if ($Bytes) { $message.bytes = [Convert]::ToBase64String($Bytes) }
  Write-FixtureMessage $message
  $reply = Read-FixtureMessage
  Require ($reply.request -ceq $Request -and $reply.accepted -eq $true)
  return $reply
}

$root = Split-Path -Parent $PSScriptRoot
$fixtureScript = $PSCommandPath
$output = Assert-OwnedJournalPath (Join-Path $root 'dist')
if ($Mode -ne 'SelfTest' -and (-not [Console]::IsInputRedirected -or -not [Console]::IsOutputRedirected)) { throw 'Private test pipe required.' }
if ($Mode -eq 'RestartFixture') {
  try {
    $restartRequest = Read-FixtureMessage
    Require ($restartRequest.fixture -cmatch '^[0-9a-f]{32}$')
    $vault = Join-Path $output ('journal-vault-' + $restartRequest.fixture + '\vault')
    $clock = { [DateTimeOffset]::FromUnixTimeMilliseconds([long]$restartRequest.now) }
    $callback = {
      param([byte[]]$Bytes)
      $digest = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($Bytes)).ToLowerInvariant()
      Require ($digest -ceq $restartRequest.expectedDigest)
      @{status=200; goals=1; readings=1}
    }
    $restored = Invoke-OwnedJournalRestore $vault $restartRequest.installation $restartRequest.archive $callback $clock
    Write-FixtureMessage @{completed=$restored.completed}
    if ($restored.completed) { exit 0 }
  } catch { Write-FixtureMessage @{completed=$false} }
  exit 1
}

function Verify-FixtureRestart($Request) {
  $start = [Diagnostics.ProcessStartInfo]::new()
  $start.FileName = (Get-Process -Id $PID).Path
  $start.UseShellExecute = $false; $start.CreateNoWindow = $true
  $start.RedirectStandardInput = $true; $start.RedirectStandardOutput = $true; $start.RedirectStandardError = $true
  foreach ($part in @('-NoProfile','-NonInteractive','-File',$fixtureScript,'-Mode','RestartFixture')) { $start.ArgumentList.Add($part) }
  $child = [Diagnostics.Process]::Start($start)
  try {
    $stdout = $child.StandardOutput.ReadToEndAsync(); $stderr = $child.StandardError.ReadToEndAsync()
    $child.StandardInput.WriteLine(($Request | ConvertTo-Json -Compress)); $child.StandardInput.Close()
    if (-not $child.WaitForExit(30000)) { $child.Kill($true); $child.WaitForExit(); throw 'Fixture restart timed out.' }
    $null = $stderr.GetAwaiter().GetResult()
    $reply = $stdout.GetAwaiter().GetResult()
    Require ($reply.Length -lt 1024 -and $child.ExitCode -eq 0 -and (ConvertFrom-Json $reply).completed -eq $true)
  } finally { $child.Dispose() }
}

function New-SyntheticSnapshot([string]$Installation, [DateTimeOffset]$At) {
  $json = @{
    version=1; installation=$Installation; owner='00000000-0000-4000-8000-000000000001'; capturedAt=$At.ToString('o');
    state=@{goal=@{period='meal';grams='23.42'}; readings=@(@{id='00000000-0000-4000-8000-000000000002';
      reading=@{method='breath';unit='ppm';value='11.37';at='2026-11-01T11:03:05.123456+02:00'}})}
  } | ConvertTo-Json -Compress -Depth 10
  return ,[Text.Encoding]::UTF8.GetBytes($json)
}

$report = [ordered]@{synthetic=$true; installedAppTouched=$false; productionTouched=$false; completed=$false; cleanupCompleted=$false; phase='setup'}
$fixture = [Guid]::NewGuid().ToString('N')
$sandbox = Join-Path $output ('journal-vault-' + $fixture)
$vault = Join-Path $sandbox 'vault'
$archives = Join-Path $vault 'archives'
$created = $false; $held = $null; $heldVault = $null; $snap = $null
$ordinary = Join-Path $sandbox 'ordinary-test.backup'
$ordinaryCanary = 'unrelated synthetic test file'
try {
  [void][IO.Directory]::CreateDirectory($output)
  $null = New-OwnedJournalDirectory $sandbox
  $created = $true
  [IO.File]::WriteAllText($ordinary, $ordinaryCanary)
  $id = [Guid]::NewGuid().ToString()
  $script:fakeNow = [DateTimeOffset]::Parse('2026-11-28T10:00:00Z')
  $base = $script:fakeNow
  $clock = { $script:fakeNow }
  if ($Mode -eq 'DatabaseFixture') {
    $hello = Read-FixtureMessage
    Require ($hello.hello -ceq 'winesnap-dev11-vault-fixture-v1')
    $id = $hello.installation
    $clock = { [DateTimeOffset]::UtcNow }
  }
  Initialize-OwnedJournalVault $vault $id $clock
  if ($Mode -eq 'DatabaseFixture') {
    $report.phase = 'database_capture'
    $prune = { (Invoke-FixtureAdapter 'prune').removed }
    $capture = { return ,[Convert]::FromBase64String((Invoke-FixtureAdapter 'capture').bytes) }
    $first = Invoke-OwnedJournalMaintenance $vault $id $prune $capture $clock
    $report.maintenance = $first.phase
    Require ($first.completed -and $first.archiveWritten -and $first.prunedReadings -eq 1)
    $report.sqlPurgeAndProtectedCapture = $true
    $archive = @(Get-OwnedJournalFiles $archives)
    Require ($archive.Count -eq 1)
    $report.phase = 'database_selective_restore'
    $null = Invoke-FixtureAdapter 'captured'
    $restore = { param([byte[]]$Bytes) (Invoke-FixtureAdapter 'restore' $Bytes).result }
    $changed = Invoke-OwnedJournalRestore $vault $id $archive[0].Name $restore $clock
    Require ($changed.completed -and $changed.readingsRestored -eq 1 -and $changed.goalsRestored -eq 0)
    $report.selectiveRestoreFromWindowsVault = $true
  } else {
    $script:pruneCalls = 0; $script:captureCalls = 0; $script:restoreCalls = 0
    $prune = { $script:pruneCalls++; return 1 }
    $capture = { $script:captureCalls++; New-SyntheticSnapshot $id $script:fakeNow }
    $restore = { param([byte[]]$Bytes) $script:restoreCalls++; @{status=200;goals=1;readings=1} }
    $report.phase = 'protected_capture'
    $snap = New-SyntheticSnapshot $id $base
    # This fixture passes the precomputed payload, so we can verify its exact bytes on restart.
    $first = Invoke-OwnedJournalMaintenance $vault $id $prune { return ,$snap.Clone() } $clock
    $report.maintenance = $first.phase
    Require ($first.completed -and $first.archiveWritten -and $first.prunedReadings -eq 1)
    $report.phase = 'protected_permissions'
    $name = Get-OwnedJournalArchiveName $base.ToUnixTimeMilliseconds()
    $file = Join-Path $archives $name
    $cipher = Read-OwnedJournalFile $file (257KB)
    Require (-not [Text.Encoding]::UTF8.GetString($cipher).Contains('11.37'))
    $null = Assert-OwnedJournalPrivate $vault $true
    $null = Assert-OwnedJournalPrivate (Join-Path $vault 'anchor.dpapi') $false
    $digest = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($snap)).ToLowerInvariant()
    $report.phase = 'dpapi_restart'
    Verify-FixtureRestart @{fixture=$fixture; installation=$id; archive=$name; now=$base.ToUnixTimeMilliseconds(); expectedDigest=$digest}
    $report.dpapiRestartExactOffsets = $true

    $report.phase = 'restore_guards'
    Require (-not (Invoke-OwnedJournalRestore $vault ([Guid]::NewGuid().ToString()) $name $restore $clock).completed)
    Require (-not (Invoke-OwnedJournalRestore $vault $id '..\ordinary-test.backup' $restore $clock).completed)
    $freshLooking = Get-OwnedJournalArchiveName $base.AddHours(1).ToUnixTimeMilliseconds()
    $renamed = Join-Path $archives $freshLooking
    [IO.File]::Move($file, $renamed)
    $script:fakeNow = $base.AddHours(1)
    try { Require (-not (Invoke-OwnedJournalRestore $vault $id $freshLooking $restore $clock).completed) }
    finally { [IO.File]::Move($renamed, $file) }
    $changed = [byte[]]$cipher.Clone(); $changed[$changed.Length-1] = $changed[$changed.Length-1] -bxor 1
    [IO.File]::WriteAllBytes($file, $changed)
    try { Require (-not (Invoke-OwnedJournalRestore $vault $id $name $restore $clock).completed) }
    finally { [IO.File]::WriteAllBytes($file, $cipher) }
    Require ($script:restoreCalls -eq 0)
    $report.bindingTamperAndRenameRefused = $true

    $report.phase = 'maintenance_while_backup_not_due'
    $anchor = Join-Path $vault 'anchor.dpapi'
    [IO.File]::WriteAllBytes((Join-Path $vault ('pending-' + [Guid]::NewGuid().ToString('N') + '.sealed')), [IO.File]::ReadAllBytes($anchor))
    [IO.File]::WriteAllBytes((Join-Path $archives ('pending-' + [Guid]::NewGuid().ToString('N') + '.sealed')), $cipher)
    $heldVault = Open-OwnedJournalVault $vault $id
    $busy = Invoke-OwnedJournalMaintenance $vault $id $prune $capture $clock
    Require (-not $busy.completed -and $busy.databasePruned -and $script:pruneCalls -eq 2)
    Close-OwnedJournalVault $heldVault; $heldVault = $null
    $daily = Invoke-OwnedJournalMaintenance $vault $id $prune $capture $clock
    Require ($daily.completed -and -not $daily.archiveWritten -and $daily.pendingRemoved -eq 2 -and $script:captureCalls -eq 0 -and $script:pruneCalls -eq 3)
    $report.databasePurgeAndInterruptedFileCleanupBeforeNextBackup = $true

    $report.phase = 'exact_expiry_offline_and_retry'
    # A filesystem timestamp must not extend retention, even if publication was recent.
    [IO.File]::SetLastWriteTimeUtc($file, $base.AddDays(6).UtcDateTime)
    $script:fakeNow = $base.AddDays(7).AddMilliseconds(-1)
    Require ((Invoke-OwnedJournalRestore $vault $id $name $restore $clock).completed)
    $script:fakeNow = $base.AddDays(7)
    Require (-not (Invoke-OwnedJournalRestore $vault $id $name $restore $clock).completed)
    $script:fakeNow = $base.AddDays(7).AddMilliseconds(-1)
    Require (-not (Invoke-OwnedJournalRestore $vault $id $name $restore $clock).completed)
    Require ($script:restoreCalls -eq 1)
    $script:fakeNow = $base.AddDays(7)
    $held = [IO.File]::Open($file, 'Open', 'Read', 'None')
    $blocked = Invoke-OwnedJournalMaintenance $vault $id $prune $capture $clock
    Require (-not $blocked.completed -and $blocked.fileFailures -eq 1 -and $blocked.prunedReadings -eq 1 -and $script:captureCalls -eq 0)
    $held.Dispose(); $held = $null
    $dbUnavailable = Invoke-OwnedJournalMaintenance $vault $id { throw 'Synthetic database unavailable.' } $capture $clock
    Require (-not $dbUnavailable.completed -and -not $dbUnavailable.databasePruned -and
      $dbUnavailable.expiredArchivesRemoved -eq 1 -and -not [IO.File]::Exists($file) -and $script:captureCalls -eq 0)
    $fixed = Invoke-OwnedJournalMaintenance $vault $id $prune { $null } $clock
    Require ($fixed.completed -and $fixed.databasePruned -and -not $fixed.archiveWritten)
    $report.expiryBeforeMaintenanceAndPhysicalDeletionRetry = $true

    $report.phase = 'missing_anchor_and_acl'
    $anchorBytes = [IO.File]::ReadAllBytes($anchor)
    [IO.File]::Delete($anchor)
    try {
      $noAnchor = Invoke-OwnedJournalMaintenance $vault $id $prune $capture $clock
      Require (-not $noAnchor.completed -and $noAnchor.databasePruned -and -not (Invoke-OwnedJournalRestore $vault $id $name $restore $clock).completed)
    }
    finally { [IO.File]::WriteAllBytes($anchor, $anchorBytes) }
    $acl = Get-Acl -LiteralPath $archives
    $broader = Get-Acl -LiteralPath $archives
    $broader.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-5-32-545'), 'Read', 'Allow'))
    [IO.FileSystemAclExtensions]::SetAccessControl((Get-Item -LiteralPath $archives), $broader)
    try { Require (-not (Invoke-OwnedJournalMaintenance $vault $id $prune $capture $clock).completed) }
    finally { [IO.FileSystemAclExtensions]::SetAccessControl((Get-Item -LiteralPath $archives), $acl) }
    Require ($script:captureCalls -eq 0 -and $script:pruneCalls -eq 7)
    $report.missingAnchorAndBroadAclFailClosed = $true
    $report.cleanupIndependentOfOtherStoreOutage = $true
  }
  Require ([IO.File]::ReadAllText($ordinary) -ceq $ordinaryCanary)
  $report.ordinaryBackupUntouched = $true
  $report.phase = 'done'; $report.completed = $true
} catch {
  $report.failureLine = $_.InvocationInfo.ScriptLineNumber
  $report.failureType = $_.Exception.GetType().Name
  $report.failureFrames = @($_.ScriptStackTrace -split '\r?\n' | ForEach-Object { if ($_ -match ': line (\d+)$') { [int]$Matches[1] } })
} finally {
  if ($held) { $held.Dispose() }
  Close-OwnedJournalVault $heldVault
  if ($snap -is [byte[]]) { [Array]::Clear($snap, 0, $snap.Length) }
  if ($created) {
    try {
      # No recursive deletion: inspect every generated destination and remove files by literal path.
      foreach ($dir in @($archives, $vault, $sandbox)) {
        if (-not [IO.Directory]::Exists($dir)) { continue }
        $dir = Assert-OwnedJournalPath $dir
        Require ($dir -ceq $sandbox -or $dir.StartsWith($sandbox + '\', [StringComparison]::OrdinalIgnoreCase))
        foreach ($item in (Get-ChildItem -LiteralPath $dir -Force)) {
          Require (-not $item.PSIsContainer -and -not ($item.Attributes -band [IO.FileAttributes]::ReparsePoint))
          [IO.File]::Delete($item.FullName)
        }
        [IO.Directory]::Delete($dir)
      }
      $report.cleanupCompleted = -not [IO.Directory]::Exists($sandbox)
    } catch { $report.cleanupCompleted = $false }
  }
}
Write-FixtureMessage @{report=$report}
if (-not $report.completed -or -not $report.cleanupCompleted) { exit 1 }
