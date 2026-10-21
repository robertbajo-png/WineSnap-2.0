param([switch]$Browser, [switch]$RememberKeys, [switch]$StoreKeysOnly)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$project = 'pzniyupmgwvlldvztzqh'
# The .env. prefix also keeps this encrypted XML out of Vite's file server.
$keyPath = Join-Path $root '.env.winesnap-test-keys.local'

function Save-TestKeys([System.Security.SecureString]$Public, [System.Security.SecureString]$Secret) {
  if (-not $IsWindows) { throw 'Encrypted test key storage requires Windows.' }
  if ((Test-Path -LiteralPath $keyPath) -and
    ((Get-Item -LiteralPath $keyPath -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw 'Refusing a redirected key file.'
  }
  $temporary = Join-Path $root ('.env.winesnap-test-keys.' + [guid]::NewGuid().ToString('N') + '.local')
  try {
    $stored = [pscustomobject]@{
      Version = 1
      Project = $project
      Publishable = [pscredential]::new('publishable', $Public)
      Secret = [pscredential]::new('secret', $Secret)
    }
    $stored | Export-Clixml -LiteralPath $temporary -Depth 4 -Encoding utf8
    $acl = [System.Security.AccessControl.FileSecurity]::new()
    $owner = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl.SetOwner($owner)
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($sid in @($owner, [System.Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
      $acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new(
        $sid, [System.Security.AccessControl.FileSystemRights]::FullControl,
        [System.Security.AccessControl.AccessControlType]::Allow))
    }
    Set-Acl -LiteralPath $temporary -AclObject $acl
    Move-Item -LiteralPath $temporary -Destination $keyPath -Force
    Write-Host 'Encrypted WineSnap-test keys saved locally for this Windows account.'
  } finally {
    if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
  }
}

# This mode only encrypts local input. It never starts Node or makes network calls.
if ($StoreKeysOnly) {
  $public = $null
  $secret = $null
  try {
    if ($Browser -or $RememberKeys -or -not [Console]::IsInputRedirected) {
      throw 'Use the local storage mode with redirected input only.'
    }
    $inputText = [Console]::In.ReadToEnd()
    if ($inputText.Length -gt 8192) { throw 'Input too large.' }
    $inputKeys = $inputText | ConvertFrom-Json
    if ($inputKeys.project -ne $project -or
      -not $inputKeys.publishable.StartsWith('sb_publishable_') -or
      -not $inputKeys.secret.StartsWith('sb_secret_')) { throw 'Expected existing test keys.' }
    $public = ConvertTo-SecureString -String $inputKeys.publishable -AsPlainText -Force
    $secret = ConvertTo-SecureString -String $inputKeys.secret -AsPlainText -Force
    $inputText = $null
    $inputKeys = $null
    Save-TestKeys $public $secret
  } catch {
    Write-Host 'Local encrypted test key storage failed. No key values are reported.'
    exit 1
  } finally {
    $inputText = $null
    $inputKeys = $null
    if ($public) { $public.Dispose() }
    if ($secret) { $secret.Dispose() }
  }
  exit 0
}

$node = Get-Command node -ErrorAction SilentlyContinue
$executable = if ($node) { $node.Source } else {
  Join-Path $HOME '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
}
if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
  throw 'Node.js is required to run the test.'
}

Write-Host 'Only WineSnap-test (pzniyupmgwvlldvztzqh) will be tested.'
if (Test-Path -LiteralPath $keyPath) {
  if (-not $IsWindows -or
    ((Get-Item -LiteralPath $keyPath -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw 'Refusing unsupported or redirected key storage.'
  }
  $stored = Import-Clixml -LiteralPath $keyPath
  if ($stored.Version -ne 1 -or $stored.Project -ne $project -or
    $stored.Publishable -isnot [pscredential] -or $stored.Secret -isnot [pscredential]) {
    throw 'Expected encrypted credentials for this test project and Windows account.'
  }
  $public = $stored.Publishable.Password
  $secret = $stored.Secret.Password
  $stored = $null
  Write-Host 'Using locally encrypted test keys. No manual key entry is needed.'
} else {
  Write-Host 'Use its existing publishable and secret keys. Do not paste them into chat.'
  $public = Read-Host 'Test publishable key (hidden)' -AsSecureString
  $secret = Read-Host 'Test secret key (hidden)' -AsSecureString
}
$start = [System.Diagnostics.ProcessStartInfo]::new()
$exitCode = 1
try {
  $publicValue = [System.Net.NetworkCredential]::new('', $public).Password.Trim()
  $secretValue = [System.Net.NetworkCredential]::new('', $secret).Password.Trim()
  if (-not $publicValue.StartsWith('sb_publishable_') -or -not $secretValue.StartsWith('sb_secret_')) {
    throw 'Use the existing test publishable and secret API keys, not legacy JWT keys.'
  }
  if ($RememberKeys) { Save-TestKeys $public $secret }
  $start.FileName = $executable
  $start.WorkingDirectory = $root
  $start.UseShellExecute = $false
  $start.CreateNoWindow = $true
  $entry = if ($Browser) { 'run-hosted-image-browser.mjs' } else { 'check-hosted-image-proxy.mjs' }
  $start.ArgumentList.Add((Join-Path $PSScriptRoot $entry))
  $start.Environment['WINESNAP_TEST_PUBLISHABLE_KEY'] = $publicValue
  $start.Environment['WINESNAP_TEST_SECRET_KEY'] = $secretValue
  $process = [System.Diagnostics.Process]::Start($start)
  $process.WaitForExit()
  $exitCode = $process.ExitCode
  $process.Dispose()
} finally {
  $start.Environment.Remove('WINESNAP_TEST_PUBLISHABLE_KEY') | Out-Null
  $start.Environment.Remove('WINESNAP_TEST_SECRET_KEY') | Out-Null
  $publicValue = $null
  $secretValue = $null
  $public.Dispose()
  $secret.Dispose()
}
if ($Browser) {
  Write-Host 'Safe session report: dist/hosted-image-browser-session.json'
} else {
  Write-Host 'Safe report: dist/hosted-image-proxy-report.json'
}
exit $exitCode
