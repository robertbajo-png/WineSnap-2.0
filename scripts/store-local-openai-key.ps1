param([switch]$Check, [switch]$SelfTest, [switch]$Window)
$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'PowerShell 7 on Windows is required.' }
if (($Check -and $SelfTest) -or ($Window -and ($Check -or $SelfTest))) { throw 'Choose one input/check mode.' }
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
      $value.Purpose -ne 'WineSnap-local-test' -or $value.OpenAI -isnot [pscredential] -or
      $value.OpenAI.UserName -ne 'OPENAI_API_KEY' -or $value.OpenAI.Password.Length -lt 20) {
    throw 'Expected encrypted WineSnap-test OpenAI credentials.'
  }
  return $value
}

function Read-PrivateKeyWindow {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  $form = [System.Windows.Forms.Form]::new()
  $form.Text = 'WineSnap - Private OpenAI Key'
  $form.ClientSize = [System.Drawing.Size]::new(620, 255)
  $form.StartPosition = 'CenterScreen'
  $form.FormBorderStyle = 'FixedDialog'
  $form.MaximizeBox = $false
  $form.MinimizeBox = $false
  $form.Font = [System.Drawing.Font]::new('Segoe UI', 11)
  $label = [System.Windows.Forms.Label]::new()
  $label.Text = "Paste your EXISTING OpenAI API key. Input stays hidden.`r`nLocal encrypted storage only. No upload or API request."
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
    if ($field.Text -cmatch '^sk-[A-Za-z0-9_-]{20,4093}$') {
      $form.DialogResult = [System.Windows.Forms.DialogResult]::OK
      $form.Close()
    } else {
      [System.Windows.Forms.MessageBox]::Show('Paste the existing OpenAI API key, not its name or a URL.', 'WineSnap') | Out-Null
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
    [pscustomobject]@{ provider='OpenAI'; project='pzniyupmgwvlldvztzqh'; saved=[bool]$stored; apiValidityChecked=$false } | ConvertTo-Json -Compress
    exit 0
  }
  New-Item -ItemType Directory -Path $folder -Force | Out-Null
  Set-PrivateAccess $folder -Directory
  if ($SelfTest) {
    $path = Join-Path $folder ('key-input-selftest-' + [guid]::NewGuid().ToString('N') + '.local')
    $inputKey = ConvertTo-SecureString 'sk-synthetic-encryption-test-not-a-real-key' -AsPlainText -Force
  } else {
    if (Test-Path -LiteralPath $path -PathType Leaf) { $stored = Read-KeyStore $path }
    if ($Window) {
      $inputKey = Read-PrivateKeyWindow
    } else {
      if ([Console]::IsInputRedirected -or [Console]::IsOutputRedirected) { throw 'Use the private interactive window.' }
      $Host.UI.RawUI.WindowTitle = 'WineSnap - Private OpenAI Key'
      Write-Host 'WineSnap local TEST - existing OpenAI key only.'
      Write-Host 'Paste the existing key below and press Enter. Input is hidden.'
      Write-Host 'It will be Windows-user encrypted locally. No API call, upload or production change is made.'
      Write-Host "Destination: $path"
      $inputKey = Read-Host 'OPENAI_API_KEY (hidden)' -AsSecureString
    }
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
  if (-not $Check -and -not $SelfTest -and -not $Window -and -not [Console]::IsInputRedirected) { Read-Host 'Press Enter to close' | Out-Null }
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
exit 0
