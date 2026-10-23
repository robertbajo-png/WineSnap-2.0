param([switch]$Check, [switch]$SelfTest)
$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'PowerShell 7 on Windows is required.' }
if ($Check -and $SelfTest) { throw 'Choose one check mode.' }
$folder = Join-Path $env:LOCALAPPDATA 'WineSnapHosting'
$path = Join-Path $folder 'ai-keys.clixml'
$temporary = $null
$inputKey = $null
$stored = $null

function Assert-NotRedirected([string]$Path) {
  if ((Test-Path -LiteralPath $Path) -and
      ((Get-Item -LiteralPath $Path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw 'Redirected credential storage is not supported.'
  }
}

function Set-PrivateAccess([string]$Path, [switch]$Directory) {
  $owner = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
  $acl = if ($Directory) { [System.Security.AccessControl.DirectorySecurity]::new() } else { [System.Security.AccessControl.FileSecurity]::new() }
  $acl.SetOwner($owner)
  $acl.SetAccessRuleProtection($true, $false)
  foreach ($sid in @($owner, [System.Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
    $inherit = if ($Directory) { [System.Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit' } else { [System.Security.AccessControl.InheritanceFlags]::None }
    $acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new(
      $sid, [System.Security.AccessControl.FileSystemRights]::FullControl,
      $inherit, [System.Security.AccessControl.PropagationFlags]::None,
      [System.Security.AccessControl.AccessControlType]::Allow))
  }
  Set-Acl -LiteralPath $Path -AclObject $acl
}

function Assert-PrivateAccess([string]$Path) {
  $acl = Get-Acl -LiteralPath $Path
  if (-not $acl.AreAccessRulesProtected) { throw 'Credential storage must have a private ACL.' }
  $owner = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  foreach ($rule in $acl.Access) {
    $sid = $rule.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value
    if ($rule.AccessControlType -eq 'Allow' -and $sid -notin @($owner, 'S-1-5-18')) {
      throw 'Credential storage is readable by another account.'
    }
  }
}

function Read-KeyStore([string]$Path) {
  Assert-NotRedirected $Path
  Assert-PrivateAccess $Path
  $value = Import-Clixml -LiteralPath $Path
  if ($value.Version -ne 1 -or $value.Project -ne 'pzniyupmgwvlldvztzqh' -or
      $value.Purpose -ne 'WineSnap-local-test' -or $value.OpenAI -isnot [pscredential] -or
      $value.OpenAI.UserName -ne 'OPENAI_API_KEY' -or $value.OpenAI.Password.Length -lt 20) {
    throw 'Expected encrypted WineSnap-test OpenAI credentials.'
  }
  return $value
}

try {
  Assert-NotRedirected $folder
  Assert-NotRedirected $path
  if ($Check) {
    if (Test-Path -LiteralPath $path -PathType Leaf) { $stored = Read-KeyStore $path }
    [pscustomobject]@{ provider='OpenAI'; project='pzniyupmgwvlldvztzqh'; saved=[bool]$stored; apiValidityChecked=$false } | ConvertTo-Json -Compress
    exit 0
  }
  New-Item -ItemType Directory -Path $folder -Force | Out-Null
  Set-PrivateAccess $folder -Directory
  if ($SelfTest) {
    $path = Join-Path $folder ('key-input-selftest-' + [guid]::NewGuid().ToString('N') + '.local')
    $inputKey = ConvertTo-SecureString 'sk-synthetic-encryption-test-not-a-real-key' -AsPlainText -Force
  } else {
    if ([Console]::IsInputRedirected -or [Console]::IsOutputRedirected) { throw 'Use the private interactive window.' }
    $Host.UI.RawUI.WindowTitle = 'WineSnap - Private OpenAI Key'
    Write-Host 'WineSnap local TEST - existing OpenAI key only.'
    Write-Host 'Paste the existing key below and press Enter. Input is hidden.'
    Write-Host 'It will be Windows-user encrypted locally. No API call, upload or production change is made.'
    Write-Host "Destination: $path"
    if (Test-Path -LiteralPath $path -PathType Leaf) { $stored = Read-KeyStore $path }
    $inputKey = Read-Host 'OPENAI_API_KEY (hidden)' -AsSecureString
    $plain = [System.Net.NetworkCredential]::new('', $inputKey).Password
    $valid = $plain -cmatch '^sk-[A-Za-z0-9_-]{20,4093}$'
    $plain = $null
    if (-not $valid) { throw 'The pasted value is not a supported OpenAI API key.' }
  }
  if (-not $stored) {
    $stored = [pscustomobject]@{
      Version=1; Project='pzniyupmgwvlldvztzqh'; Purpose='WineSnap-local-test'; OpenAI=$null
    }
  }
  $stored.OpenAI = [pscredential]::new('OPENAI_API_KEY', $inputKey)
  $temporary = Join-Path $folder ('ai-key-write-' + [guid]::NewGuid().ToString('N') + '.local')
  $stored | Export-Clixml -LiteralPath $temporary -Depth 4 -Encoding utf8
  Set-PrivateAccess $temporary
  $verified = Read-KeyStore $temporary
  if ($verified.OpenAI.Password.Length -ne $inputKey.Length) { throw 'Encrypted storage verification failed.' }
  $verified.OpenAI.Password.Dispose()
  Move-Item -LiteralPath $temporary -Destination $path -Force
  $temporary = $null
  Assert-PrivateAccess $path
  if ($SelfTest) {
    $encryptedText = [IO.File]::ReadAllText($path)
    if ($encryptedText.Contains('sk-synthetic-encryption-test-not-a-real-key')) { throw 'Plaintext found in encrypted storage.' }
    [pscustomobject]@{ selfTestPassed=$true; privateAcl=$true; encrypted=$true; realCredentialTouched=$false } | ConvertTo-Json -Compress
  } else {
    Write-Host 'Saved and encryption verified. API access has not been tested.' -ForegroundColor Green
    Start-Sleep -Seconds 3
  }
} catch {
  Write-Host 'The key was not saved. Check the pasted value and try again. No key values are reported.' -ForegroundColor Red
  if (-not $Check -and -not $SelfTest -and -not [Console]::IsInputRedirected) { Read-Host 'Press Enter to close' | Out-Null }
  exit 1
} finally {
  $plain = $null
  if ($inputKey) { $inputKey.Dispose() }
  if ($stored -and $stored.OpenAI) { $stored.OpenAI.Password.Dispose() }
  if ($temporary -and (Test-Path -LiteralPath $temporary)) { Remove-Item -LiteralPath $temporary -Force }
  if ($SelfTest -and (Split-Path -Leaf $path) -like 'key-input-selftest-*.local' -and
      (Split-Path -Parent $path) -eq $folder -and (Test-Path -LiteralPath $path)) {
    Remove-Item -LiteralPath $path -Force
  }
}
