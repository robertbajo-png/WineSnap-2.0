param([switch]$Check, [switch]$SelfTest, [switch]$Window, [ValidateSet('OpenAI', 'Gemini')][string]$Provider = 'OpenAI')
$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'PowerShell 7 on Windows is required.' }
if (($Check -and $SelfTest) -or ($Window -and ($Check -or $SelfTest))) { throw 'Choose one input/check mode.' }
$folder = Join-Path $env:LOCALAPPDATA 'WineSnapHosting'
$path = Join-Path $folder 'ai-keys.clixml'
$temporary = $null
$inputKey = $null
$stored = $null
$keyName = if ($Provider -eq 'Gemini') { 'GEMINI_API_KEY' } else { 'OPENAI_API_KEY' }
$keyPattern = if ($Provider -eq 'Gemini') { '^[A-Za-z0-9_-]{20,4096}$' } else { '^sk-[A-Za-z0-9_-]{20,4093}$' }

function Assert-NotRedirected([string]$Path) {
  if ((Test-Path -LiteralPath $Path) -and
      ((Get-Item -LiteralPath $Path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw 'Redirected credential storage is not supported.'
  }
}

function Set-PrivateAccess([string]$Path, [switch]$Directory) {
  $owner = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
  # Preserve the existing descriptor so hardening does not request audit/SACL privileges.
  $acl = Get-Acl -LiteralPath $Path
  foreach ($rule in @($acl.Access)) { $acl.PurgeAccessRules($rule.IdentityReference) }
  $acl.SetOwner($owner)
  $acl.SetAccessRuleProtection($true, $false)
  foreach ($sid in @($owner, [System.Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
    $inherit = if ($Directory) { [System.Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit' } else { [System.Security.AccessControl.InheritanceFlags]::None }
    $acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new(
      $sid, [System.Security.AccessControl.FileSystemRights]::FullControl,
      $inherit, [System.Security.AccessControl.PropagationFlags]::None,
      [System.Security.AccessControl.AccessControlType]::Allow))
  }
  $item = Get-Item -LiteralPath $Path -Force
  [System.IO.FileSystemAclExtensions]::SetAccessControl($item, $acl)
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
      $value.Purpose -ne 'WineSnap-local-test') {
    throw 'Expected encrypted WineSnap-test provider credentials.'
  }
  foreach ($item in @(@('OpenAI', 'OPENAI_API_KEY'), @('Gemini', 'GEMINI_API_KEY'))) {
    $credential = $value.($item[0])
    if ($null -ne $credential -and ($credential -isnot [pscredential] -or
      $credential.UserName -ne $item[1] -or $credential.Password.Length -lt 20)) {
      throw 'Unexpected provider credential type.'
    }
  }
  return $value
}

function Read-PrivateKeyWindow {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  $form = [System.Windows.Forms.Form]::new()
  $form.Text = "WineSnap - Private $Provider Key"
  $form.ClientSize = [System.Drawing.Size]::new(620, 255)
  $form.StartPosition = 'CenterScreen'
  $form.FormBorderStyle = 'FixedDialog'
  $form.MaximizeBox = $false
  $form.MinimizeBox = $false
  $form.Font = [System.Drawing.Font]::new('Segoe UI', 11)
  $label = [System.Windows.Forms.Label]::new()
  $label.Text = "Paste your EXISTING $Provider API key. Input stays hidden.`r`nLocal encrypted storage only. Other saved keys are preserved."
  $label.SetBounds(20, 18, 580, 52)
  $field = [System.Windows.Forms.TextBox]::new()
  $field.UseSystemPasswordChar = $true
  $field.MaxLength = 4096
  $field.SetBounds(20, 82, 580, 30)
  $destination = [System.Windows.Forms.Label]::new()
  $destination.Text = "Encrypted destination:`r`n$path"
  $destination.SetBounds(20, 124, 580, 52)
  $save = [System.Windows.Forms.Button]::new()
  $save.Text = 'Save'
  $save.SetBounds(370, 198, 110, 36)
  $save.Add_Click({
    if ($field.Text -cmatch $keyPattern) {
      $form.DialogResult = [System.Windows.Forms.DialogResult]::OK
      $form.Close()
    } else {
      [System.Windows.Forms.MessageBox]::Show("Paste the existing $Provider API key, not its name or a URL.", 'WineSnap') | Out-Null
    }
  })
  $cancel = [System.Windows.Forms.Button]::new()
  $cancel.Text = 'Cancel'
  $cancel.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
  $cancel.SetBounds(490, 198, 110, 36)
  $form.Controls.AddRange(@($label, $field, $destination, $save, $cancel))
  $form.AcceptButton = $save
  $form.CancelButton = $cancel
  $form.Add_Shown({ $field.Focus() | Out-Null })
  try {
    if ($form.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { throw 'Private input cancelled.' }
    return (ConvertTo-SecureString -String $field.Text -AsPlainText -Force)
  } finally {
    $field.Clear()
    $form.Dispose()
  }
}

try {
  Assert-NotRedirected $folder
  Assert-NotRedirected $path
  if ($Check) {
    if (Test-Path -LiteralPath $path -PathType Leaf) { $stored = Read-KeyStore $path }
    [pscustomobject]@{ provider=$Provider; project='pzniyupmgwvlldvztzqh'; saved=($stored.$Provider -is [pscredential]); apiValidityChecked=$false } | ConvertTo-Json -Compress
    exit 0
  }
  New-Item -ItemType Directory -Path $folder -Force | Out-Null
  Set-PrivateAccess $folder -Directory
  if ($SelfTest) {
    $path = Join-Path $folder ('key-input-selftest-' + [guid]::NewGuid().ToString('N') + '.local')
    $inputKey = ConvertTo-SecureString 'sk-synthetic-encryption-test-not-a-real-key' -AsPlainText -Force
  } else {
    if ($Window) {
      $inputKey = Read-PrivateKeyWindow
    } else {
      if ([Console]::IsInputRedirected -or [Console]::IsOutputRedirected) { throw 'Use the private interactive window.' }
      $Host.UI.RawUI.WindowTitle = "WineSnap - Private $Provider Key"
      Write-Host "WineSnap local TEST - existing $Provider key only."
      Write-Host 'Paste the existing key below and press Enter. Input is hidden.'
      Write-Host 'It will be Windows-user encrypted locally. No API call, upload or production change is made.'
      Write-Host "Destination: $path"
      $inputKey = Read-Host "$keyName (hidden)" -AsSecureString
    }
    $plain = [System.Net.NetworkCredential]::new('', $inputKey).Password
    $valid = $plain -cmatch $keyPattern
    $plain = $null
    if (-not $valid) { throw 'The pasted value is not a supported provider API key.' }
    # Read other provider slots after input, so a long-open dialog does not restore stale keys.
    if (Test-Path -LiteralPath $path -PathType Leaf) { $stored = Read-KeyStore $path }
  }
  if (-not $stored) {
    $stored = [pscustomobject]@{
      Version=1; Project='pzniyupmgwvlldvztzqh'; Purpose='WineSnap-local-test'; OpenAI=$null
    }
  }
  $stored | Add-Member -NotePropertyName $Provider -NotePropertyValue ([pscredential]::new($keyName, $inputKey)) -Force
  $temporary = Join-Path $folder ('ai-key-write-' + [guid]::NewGuid().ToString('N') + '.local')
  $stored | Export-Clixml -LiteralPath $temporary -Depth 4 -Encoding utf8
  Set-PrivateAccess $temporary
  $verified = Read-KeyStore $temporary
  if ($verified.$Provider.Password.Length -ne $inputKey.Length) { throw 'Encrypted storage verification failed.' }
  foreach ($name in @('OpenAI', 'Gemini')) {
    if ($verified.$name -is [pscredential]) { $verified.$name.Password.Dispose() }
  }
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
  if (-not $Check -and -not $SelfTest -and -not $Window -and -not [Console]::IsInputRedirected) { Read-Host 'Press Enter to close' | Out-Null }
  exit 1
} finally {
  $plain = $null
  if ($inputKey) { $inputKey.Dispose() }
  foreach ($name in @('OpenAI', 'Gemini')) {
    if ($stored -and $stored.$name -is [pscredential]) { $stored.$name.Password.Dispose() }
  }
  if ($temporary -and (Test-Path -LiteralPath $temporary)) { Remove-Item -LiteralPath $temporary -Force }
  if ($SelfTest -and (Split-Path -Leaf $path) -like 'key-input-selftest-*.local' -and
      (Split-Path -Parent $path) -eq $folder -and (Test-Path -LiteralPath $path)) {
    Remove-Item -LiteralPath $path -Force
  }
}
exit 0
