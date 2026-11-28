# DEV-11 operator library. Nothing here enrols an account or schedules a live job.
$script:JournalArchiveName = '^journal-(\d{8}-\d{9})\.wsj$'
$script:JournalPayloadLimit = 256KB
$script:JournalLifetimeMs = [long]604800000
$script:JournalCaptureIntervalMs = [long]86400000
$script:JournalUtf8 = [Text.UTF8Encoding]::new($false, $true)

function Assert-OwnedJournalPath([string]$Path) {
  if (-not $IsWindows -or -not [IO.Path]::IsPathFullyQualified($Path)) { throw 'Local Windows vault required.' }
  $full = [IO.Path]::GetFullPath($Path)
  if ($full -notmatch '^[A-Za-z]:\\' -or $full.Substring(2).Contains(':') -or
    $full -match '(?i)(^|[\\/])OneDrive(?:[^\\/]*)?([\\/]|$)' -or
    [IO.DriveInfo]::new([IO.Path]::GetPathRoot($full)).DriveType -ne [IO.DriveType]::Fixed) {
    throw 'An unsynced fixed local drive is required.'
  }
  foreach ($name in @('OneDrive', 'OneDriveConsumer', 'OneDriveCommercial')) {
    $cloud = [Environment]::GetEnvironmentVariable($name)
    if ($cloud -and [IO.Path]::IsPathFullyQualified($cloud)) {
      $cloud = [IO.Path]::GetFullPath($cloud).TrimEnd('\', '/')
      if ($full.Equals($cloud, [StringComparison]::OrdinalIgnoreCase) -or
        $full.StartsWith($cloud + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Synced vault refused.' }
    }
  }
  for ($part = $full; $part -and $part -ne [IO.Path]::GetPathRoot($part); $part = [IO.Path]::GetDirectoryName($part)) {
    if (Test-Path -LiteralPath $part) {
      $item = Get-Item -LiteralPath $part -Force
      if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected vault refused.' }
    }
  }
  return $full
}

function Assert-OwnedJournalPrivate([string]$Path, [bool]$Directory) {
  $full = Assert-OwnedJournalPath $Path
  $item = Get-Item -LiteralPath $full -Force
  if ($item.PSIsContainer -ne $Directory -or $item.LinkType) { throw 'Unsafe vault item.' }
  $acl = Get-Acl -LiteralPath $full
  $owner = [Security.Principal.WindowsIdentity]::GetCurrent().User
  if ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -cne $owner.Value -or
    ($Directory -and -not $acl.AreAccessRulesProtected)) { throw 'Private vault owner required.' }
  foreach ($entry in $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
    if ($entry.AccessControlType -eq 'Allow' -and $entry.IdentityReference.Value -notin @($owner.Value, 'S-1-5-18')) {
      throw 'Vault is accessible to another account.'
    }
  }
  return $full
}

function New-OwnedJournalDirectory([string]$Path) {
  $full = Assert-OwnedJournalPath $Path
  if ((Test-Path -LiteralPath $full) -or -not [IO.Directory]::Exists([IO.Path]::GetDirectoryName($full))) {
    throw 'Vault must be initialized in a new directory.'
  }
  $owner = [Security.Principal.WindowsIdentity]::GetCurrent().User
  $acl = [Security.AccessControl.DirectorySecurity]::new()
  $acl.SetOwner($owner)
  $acl.SetAccessRuleProtection($true, $false)
  foreach ($sid in @($owner, [Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))
  }
  [IO.FileSystemAclExtensions]::Create([IO.DirectoryInfo]::new($full), $acl)
  return (Assert-OwnedJournalPrivate $full $true)
}

function Read-OwnedJournalFile([string]$Path, [int]$Limit) {
  $full = Assert-OwnedJournalPrivate $Path $false
  $stream = [IO.File]::Open($full, 'Open', 'Read', 'Read')
  try {
    if ($stream.Length -lt 1 -or $stream.Length -gt $Limit) { throw 'Vault file size refused.' }
    $bytes = [byte[]]::new([int]$stream.Length)
    $stream.ReadExactly($bytes, 0, $bytes.Length)
    return ,$bytes
  } finally { $stream.Dispose() }
}

function Write-OwnedJournalCipher([string]$Path, [byte[]]$Bytes, [bool]$Replace = $false) {
  $directory = Assert-OwnedJournalPrivate ([IO.Path]::GetDirectoryName($Path)) $true
  $pending = Join-Path $directory ('pending-' + [Guid]::NewGuid().ToString('N') + '.sealed')
  $stream = [IO.File]::Open($pending, 'CreateNew', 'Write', 'None')
  try { $stream.Write($Bytes, 0, $Bytes.Length); $stream.Flush($true) }
  finally { $stream.Dispose() }
  $null = Assert-OwnedJournalPrivate $pending $false
  if ($Replace) { $null = Assert-OwnedJournalPrivate $Path $false }
  [IO.File]::Move($pending, $Path, $Replace)
}

function Get-OwnedJournalBinding([string]$Installation) {
  if ($Installation -cnotmatch '^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$') { throw 'Invalid vault binding.' }
  return ,$script:JournalUtf8.GetBytes('WineSnap:DEV-11:Windows:v1:' + $Installation)
}

function Write-OwnedJournalAnchor($Vault, [long]$Observed, [bool]$Replace) {
  $plain = [byte[]]::new(40)
  try {
    [Array]::Copy($Vault.Key, $plain, 32)
    [Array]::Copy([BitConverter]::GetBytes($Observed), 0, $plain, 32, 8)
    $protected = [Security.Cryptography.ProtectedData]::Protect($plain, $Vault.Binding, 'CurrentUser')
    Write-OwnedJournalCipher (Join-Path $Vault.Root 'anchor.dpapi') $protected $Replace
  } finally { [Array]::Clear($plain, 0, $plain.Length) }
}

function Initialize-OwnedJournalVault([string]$Root, [string]$Installation, [scriptblock]$Clock = { [DateTimeOffset]::UtcNow }) {
  $binding = Get-OwnedJournalBinding $Installation
  $now = (& $Clock).ToUnixTimeMilliseconds()
  if ($now -lt 0) { throw 'Untrusted vault time.' }
  $directory = New-OwnedJournalDirectory $Root
  $null = New-OwnedJournalDirectory (Join-Path $directory 'archives')
  $key = [Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
  try { Write-OwnedJournalAnchor @{Root=$directory; Key=$key; Binding=$binding} $now $false }
  finally { [Array]::Clear($key, 0, $key.Length) }
}

function Open-OwnedJournalVault([string]$Root, [string]$Installation) {
  $binding = Get-OwnedJournalBinding $Installation
  $directory = Assert-OwnedJournalPrivate $Root $true
  $archives = Assert-OwnedJournalPrivate (Join-Path $directory 'archives') $true
  $path = Join-Path $directory 'operation.lock'
  if (Test-Path -LiteralPath $path) { $null = Assert-OwnedJournalPrivate $path $false }
  $lock = [IO.File]::Open($path, 'OpenOrCreate', 'ReadWrite', 'None')
  try {
    $protected = Read-OwnedJournalFile (Join-Path $directory 'anchor.dpapi') 4096
    $plain = [Security.Cryptography.ProtectedData]::Unprotect($protected, $binding, 'CurrentUser')
    try {
      if ($plain.Length -ne 40) { throw 'Unrecognized vault anchor.' }
      $observed = [BitConverter]::ToInt64($plain, 32)
      if ($observed -lt 0 -or $observed -gt 253402300799999) { throw 'Invalid vault time.' }
      $key = [byte[]]::new(32)
      [Array]::Copy($plain, $key, 32)
      return @{Root=$directory; Archives=$archives; Installation=$Installation; Binding=$binding; Key=$key; Observed=$observed; Lock=$lock}
    } finally { [Array]::Clear($plain, 0, $plain.Length) }
  } catch { $lock.Dispose(); throw }
}

function Close-OwnedJournalVault($Vault) {
  if ($Vault) { [Array]::Clear($Vault.Key, 0, $Vault.Key.Length); $Vault.Lock.Dispose() }
}

function Update-OwnedJournalTime($Vault, [scriptblock]$Clock) {
  $now = (& $Clock).ToUnixTimeMilliseconds()
  if ($now -lt $Vault.Observed) { throw 'Vault clock moved backwards.' }
  if ($now -gt $Vault.Observed) {
    Write-OwnedJournalAnchor $Vault $now $true
    $Vault.Observed = $now
  }
  return $now
}

function Get-OwnedJournalSnapshotInfo([byte[]]$Bytes, [string]$Installation) {
  if (-not $Bytes -or $Bytes.Length -gt $script:JournalPayloadLimit) { throw 'Vault snapshot size refused.' }
  $document = [Text.Json.JsonDocument]::Parse([ReadOnlyMemory[byte]]::new($Bytes))
  try {
    $item = $document.RootElement
    if ($item.GetProperty('version').GetInt32() -ne 1 -or
      $item.GetProperty('installation').GetString() -cne $Installation -or
      $item.GetProperty('owner').GetString() -cnotmatch '^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$') { throw 'Private snapshot binding refused.' }
    $stamp = $item.GetProperty('capturedAt').GetString()
    if ($stamp -cnotmatch '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,7})?(?:Z|[+-]\d\d:\d\d)$') { throw 'Invalid capture time.' }
    $at = [DateTimeOffset]::Parse($stamp, [Globalization.CultureInfo]::InvariantCulture).ToUnixTimeMilliseconds()
    $state = $item.GetProperty('state')
    $count = $state.GetProperty('readings').GetArrayLength()
    $goal = $state.GetProperty('goal').ValueKind
    if ($at -lt 0 -or $count -gt 600 -or $goal -notin @('Null', 'Object')) { throw 'Invalid journal snapshot.' }
    return @{At=$at; HasContent=($count -gt 0 -or $goal -eq 'Object')}
  } finally { $document.Dispose() }
}

function Protect-OwnedJournalBytes($Vault, [byte[]]$Plain) {
  $nonce = [Security.Cryptography.RandomNumberGenerator]::GetBytes(12)
  $tag = [byte[]]::new(16)
  $cipher = [byte[]]::new($Plain.Length)
  $aes = [Security.Cryptography.AesGcm]::new($Vault.Key, 16)
  try {
    $aes.Encrypt($nonce, $Plain, $cipher, $tag, $script:JournalUtf8.GetBytes('winesnap-dev11-v1:' + $Vault.Installation))
    return ,([byte[]]($nonce + $tag + $cipher))
  } finally { $aes.Dispose() }
}

function Unprotect-OwnedJournalBytes($Vault, [byte[]]$Cipher) {
  if ($Cipher.Length -le 28 -or $Cipher.Length -gt ($script:JournalPayloadLimit + 28)) { throw 'Invalid journal envelope.' }
  $plain = [byte[]]::new($Cipher.Length - 28)
  $aes = [Security.Cryptography.AesGcm]::new($Vault.Key, 16)
  try {
    $aes.Decrypt([byte[]]$Cipher[0..11], [byte[]]$Cipher[28..($Cipher.Length-1)], [byte[]]$Cipher[12..27], $plain,
      $script:JournalUtf8.GetBytes('winesnap-dev11-v1:' + $Vault.Installation))
    return ,$plain
  } catch { [Array]::Clear($plain, 0, $plain.Length); throw }
  finally { $aes.Dispose() }
}

function Get-OwnedJournalArchiveName([long]$Captured) {
  return ('journal-' + [DateTimeOffset]::FromUnixTimeMilliseconds($Captured).ToString('yyyyMMdd-HHmmssfff', [Globalization.CultureInfo]::InvariantCulture) + '.wsj')
}

function Read-OwnedJournalEntry($Vault, [string]$Name) {
  if ($Name -cnotmatch $script:JournalArchiveName) { throw 'Unexpected journal backup ID.' }
  $cipher = Read-OwnedJournalFile (Join-Path $Vault.Archives $Name) ($script:JournalPayloadLimit + 28)
  $plain = Unprotect-OwnedJournalBytes $Vault $cipher
  try {
    $info = Get-OwnedJournalSnapshotInfo $plain $Vault.Installation
    if ($Name -cne (Get-OwnedJournalArchiveName $info.At)) { throw 'Journal backup name does not match its sealed time.' }
    return @{Captured=$info.At; Bytes=$plain}
  } catch { [Array]::Clear($plain, 0, $plain.Length); throw }
}

function Get-OwnedJournalFiles([string]$Directory) {
  $full = Assert-OwnedJournalPrivate $Directory $true
  $items = @(Get-ChildItem -LiteralPath $full -Force | Select-Object -First 33)
  if ($items.Count -gt 32) { throw 'Unbounded vault inventory.' }
  return $items
}

function Invoke-OwnedJournalSweep($Vault, [long]$Now, $Report) {
  $latest = $null
  foreach ($directory in @($Vault.Root, $Vault.Archives)) {
    $isArchives = $directory -ceq $Vault.Archives
    foreach ($item in (Get-OwnedJournalFiles $directory)) {
      if (-not $isArchives -and $item.Name -cin @('anchor.dpapi', 'archives', 'operation.lock')) { continue }
      $entry = $null
      try {
        $path = Assert-OwnedJournalPrivate $item.FullName $false
        if ($item.Name -cmatch '^pending-[0-9a-f]{32}\.sealed$') {
          [IO.File]::Delete($path)
          $Report.pendingRemoved++
        } elseif ($isArchives -and $item.Name -cmatch $script:JournalArchiveName) {
          $entry = Read-OwnedJournalEntry $Vault $item.Name
          if ($entry.Captured -gt $Now) { throw 'Future journal capture.' }
          if ($entry.Captured -le $Now - $script:JournalLifetimeMs) {
            [IO.File]::Delete($path)
            $Report.expiredArchivesRemoved++
          } elseif ($null -eq $latest -or $entry.Captured -gt $latest) { $latest = $entry.Captured }
        } else { throw 'Unrecognized vault file.' }
      } catch { $Report.fileFailures++ }
      finally { if ($entry) { [Array]::Clear($entry.Bytes, 0, $entry.Bytes.Length) } }
    }
  }
  return $latest
}

# Trusted adapters supply only the operator-only prune/capture calls, never browser input.
function Invoke-OwnedJournalMaintenance([string]$Root, [string]$Installation, [scriptblock]$Prune, [scriptblock]$Capture,
  [scriptblock]$Clock = { [DateTimeOffset]::UtcNow }) {
  $report = @{completed=$false; databasePruned=$false; expiredArchivesRemoved=0; pendingRemoved=0; fileFailures=0; prunedReadings=0; archiveWritten=$false; phase='vault'}
  $vault = $null; $bytes = $null
  # Either store can be unavailable. Attempt both cleanups before considering capture.
  try {
    $removed = & $Prune
    if ($removed -isnot [int] -and $removed -isnot [long]) { throw 'Unverified database cleanup.' }
    if ($removed -lt 0 -or $removed -gt 600) { throw 'Unexpected cleanup count.' }
    $report.prunedReadings = $removed
    $report.databasePruned = $true
  } catch { $report.databasePruned = $false }
  try {
    $vault = Open-OwnedJournalVault $Root $Installation
    $now = Update-OwnedJournalTime $vault $Clock
    $report.phase = 'retire_files'
    $latest = Invoke-OwnedJournalSweep $vault $now $report
    if ($report.fileFailures) { return $report }
    if (-not $report.databasePruned) { $report.phase = 'expire_readings'; return $report }
    if ($null -eq $latest -or $latest -le $now - $script:JournalCaptureIntervalMs) {
      $report.phase = 'capture'
      $bytes = & $Capture
      if ($null -ne $bytes) {
        if ($bytes -isnot [byte[]]) { throw 'Unverified private snapshot.' }
        $now = Update-OwnedJournalTime $vault $Clock
        $info = Get-OwnedJournalSnapshotInfo $bytes $Installation
        if ($info.At -gt $now -or $info.At -le $now - $script:JournalCaptureIntervalMs) { throw 'Unexpected capture time.' }
        if ($info.HasContent) {
          $name = Get-OwnedJournalArchiveName $info.At
          Write-OwnedJournalCipher (Join-Path $vault.Archives $name) (Protect-OwnedJournalBytes $vault $bytes)
          $report.archiveWritten = $true
        }
      }
    }
    $report.phase = 'done'; $report.completed = $true
  } catch { return $report }
  finally {
    if ($bytes -is [byte[]]) { [Array]::Clear($bytes, 0, $bytes.Length) }
    Close-OwnedJournalVault $vault
  }
  return $report
}

function Invoke-OwnedJournalRetentionTick([string]$Root, [string]$Installation, [hashtable]$Operator,
  [scriptblock]$Clock = { [DateTimeOffset]::UtcNow }) {
  $attempt = $null
  try {
    $candidate = & $Operator.Begin
    if ($candidate -is [string] -and $candidate -cmatch '^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$') {
      $attempt = $candidate
    }
  } catch { $attempt = $null }
  $prune = {
    if (-not $attempt) { throw 'No current maintenance attempt.' }
    & $Operator.Prune $attempt
  }
  $capture = { & $Operator.Capture $attempt }
  $report = Invoke-OwnedJournalMaintenance $Root $Installation $prune $capture $Clock
  $report.healthPublished = $false
  if (-not $attempt -or -not $report.completed) { return $report }
  $report.completed = $false
  $report.phase = 'publish_health'
  try {
    $ack = & $Operator.Pass $attempt
    if ($ack -is [bool] -and $ack) {
      $report.healthPublished = $true
      $report.completed = $true
      $report.phase = 'done'
    }
  } catch { $report.healthPublished = $false }
  return $report
}

# The restore adapter must consult independent live permits; it never returns journal data.
function Invoke-OwnedJournalRestore([string]$Root, [string]$Installation, [string]$Name, [scriptblock]$Restore,
  [scriptblock]$Clock = { [DateTimeOffset]::UtcNow }) {
  $vault = $null; $entry = $null
  try {
    $vault = Open-OwnedJournalVault $Root $Installation
    $now = Update-OwnedJournalTime $vault $Clock
    if ($Name -cnotmatch $script:JournalArchiveName) { throw 'Invalid journal backup ID.' }
    $claimed = [DateTimeOffset]::ParseExact($Matches[1], 'yyyyMMdd-HHmmssfff', [Globalization.CultureInfo]::InvariantCulture,
      [Globalization.DateTimeStyles]::AssumeUniversal).ToUnixTimeMilliseconds()
    if ($claimed -gt $now -or $claimed -le $now - $script:JournalLifetimeMs) { throw 'Journal backup is past its recovery window.' }
    $entry = Read-OwnedJournalEntry $vault $Name
    $now = Update-OwnedJournalTime $vault $Clock
    if ($entry.Captured -gt $now -or $entry.Captured -le $now - $script:JournalLifetimeMs) { throw 'Journal backup is past its recovery window.' }
    $result = & $Restore $entry.Bytes
    if ($result.status -ne 200 -or $result.goals -notin @(0, 1) -or
      ($result.goals -isnot [int] -and $result.goals -isnot [long]) -or $result.readings -lt 0 -or $result.readings -gt 600 -or
      ($result.readings -isnot [int] -and $result.readings -isnot [long])) { throw 'Private restore refused.' }
    return @{completed=$true; goalsRestored=[int]$result.goals; readingsRestored=[int]$result.readings}
  } catch { return @{completed=$false} }
  finally {
    if ($entry) { [Array]::Clear($entry.Bytes, 0, $entry.Bytes.Length) }
    Close-OwnedJournalVault $vault
  }
}
