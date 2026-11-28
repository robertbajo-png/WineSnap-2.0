param([ValidateSet('Check','Window','NetworkCheck','SelfTest')][string]$Action='Check')
$ErrorActionPreference='Stop'
if(-not $IsWindows) {throw 'PowerShell 7 on Windows is required.'}
$project='pzniyupmgwvlldvztzqh'
$purpose='WineSnap-test-postgres'
$folder=Join-Path $env:LOCALAPPDATA 'WineSnapHosting'
$path=Join-Path $folder 'database-credentials.clixml'
$statusPath=Join-Path $folder 'database-connection-status.json'
$node=Join-Path $HOME '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
$root=Split-Path -Parent $PSScriptRoot
$temporary=$null;$password=$null;$stored=$null;$plain=$null;$process=$null
$phase='private_store'
$report=[ordered]@{project=$project;completed=$false;productionTouched=$false;readOnly=$true;authenticationChecked=$false;fullBackupCreated=$false}

function Assert-SafePath([string]$Item) {
  foreach($entry in @($folder,$Item)) {
    if((Test-Path -LiteralPath $entry) -and ((Get-Item -LiteralPath $entry -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {throw 'Redirected database credential path refused.'}
  }
}
function Set-PrivateAccess([string]$Item,[switch]$Directory) {
  Assert-SafePath $Item
  $owner=[Security.Principal.WindowsIdentity]::GetCurrent().User
  $acl=Get-Acl -LiteralPath $Item
  foreach($rule in @($acl.Access)) {$acl.PurgeAccessRules($rule.IdentityReference)}
  $acl.SetOwner($owner);$acl.SetAccessRuleProtection($true,$false)
  foreach($sid in @($owner,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
    $inherit=if($Directory){[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit'}else{[Security.AccessControl.InheritanceFlags]::None}
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl',$inherit,'None','Allow'))
  }
  [IO.FileSystemAclExtensions]::SetAccessControl((Get-Item -LiteralPath $Item -Force),$acl)
}
function Assert-PrivateAccess([string]$Item) {
  Assert-SafePath $Item
  $acl=Get-Acl -LiteralPath $Item
  if(-not $acl.AreAccessRulesProtected) {throw 'Private database credential ACL required.'}
  $owner=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  foreach($rule in $acl.Access) {
    $sid=$rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
    if($rule.AccessControlType -eq 'Allow' -and $sid -notin @($owner,'S-1-5-18')) {throw 'Database credentials readable by another account.'}
  }
}
function Read-DatabaseStore([string]$Item) {
  Assert-PrivateAccess $Item
  if((Get-Item -LiteralPath $Item).Length -gt 64KB) {throw 'Oversized database credential store.'}
  $value=Import-Clixml -LiteralPath $Item
  if($value.Version -ne 1 -or $value.Project -ne $project -or $value.Purpose -ne $purpose -or
    $value.Port -ne 5432 -or $value.Database -ne 'postgres' -or $value.Credential -isnot [pscredential]) {throw 'Unexpected database credential metadata.'}
  $session=$value.Host -eq 'aws-1-eu-west-1.pooler.supabase.com' -and $value.Credential.UserName -eq "postgres.$project"
  $direct=$value.Host -eq "db.$project.supabase.co" -and $value.Credential.UserName -eq 'postgres'
  if((-not $session -and -not $direct) -or $value.Credential.Password.Length -lt 1 -or $value.Credential.Password.Length -gt 4096) {throw 'Only the approved test database is allowed.'}
  return $value
}
function Read-DatabaseWindow {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  $form=[Windows.Forms.Form]::new()
  $form.Text='WineSnap-test - databasanslutning'
  $form.ClientSize=[Drawing.Size]::new(660,355)
  $form.StartPosition='CenterScreen';$form.FormBorderStyle='FixedDialog'
  $form.MaximizeBox=$false;$form.MinimizeBox=$false;$form.ShowInTaskbar=$true
  $form.Font=[Drawing.Font]::new('Segoe UI',11)
  $label=[Windows.Forms.Label]::new()
  $label.Text="ENDAST WineSnap-test ($project)`r`nAnge databasens befintliga lösenord, inte en API-nyckel.`r`nDet sparas Windows-krypterat. Provet är skrivskyddat."
  $label.SetBounds(20,16,620,80)
  $mode=[Windows.Forms.ComboBox]::new();$mode.DropDownStyle='DropDownList'
  $mode.Items.Add('Session pooler - IPv4 (rekommenderas)') | Out-Null
  $mode.Items.Add('Direktanslutning - IPv6') | Out-Null
  $mode.SelectedIndex=0;$mode.SetBounds(20,100,620,32)
  $field=[Windows.Forms.TextBox]::new();$field.UseSystemPasswordChar=$true
  $field.MaxLength=4096;$field.SetBounds(20,149,620,32)
  $hint=[Windows.Forms.Label]::new()
  $hint.Text="Minns du inte lösenordet? Välj 'Jag saknar lösenordet'.`r`nIngen återställning görs automatiskt och produktionen berörs inte."
  $hint.SetBounds(20,193,620,64)
  $missing=[Windows.Forms.Button]::new();$missing.Text='Jag saknar lösenordet'
  $missing.SetBounds(20,289,215,42)
  $missing.Add_Click({$form.DialogResult=[Windows.Forms.DialogResult]::Retry;$form.Close()})
  $save=[Windows.Forms.Button]::new();$save.Text='Spara krypterat och testa'
  $save.SetBounds(245,289,255,42)
  $save.Add_Click({
    if($field.Text.Length -ge 1 -and $field.Text -notmatch '[\x00\r\n]' -and $field.Text -notmatch '^\w+://') {
      $form.DialogResult=[Windows.Forms.DialogResult]::OK;$form.Close()
    } else {[Windows.Forms.MessageBox]::Show('Ange endast lösenordet, inte en URL.','WineSnap-test') | Out-Null}
  })
  $cancel=[Windows.Forms.Button]::new();$cancel.Text='Avbryt'
  $cancel.DialogResult=[Windows.Forms.DialogResult]::Cancel;$cancel.SetBounds(510,289,130,42)
  $form.Controls.AddRange(@($label,$mode,$field,$hint,$missing,$save,$cancel))
  $form.AcceptButton=$save;$form.CancelButton=$cancel
  $form.Add_Shown({$field.Focus() | Out-Null})
  try {
    $result=$form.ShowDialog()
    if($result -eq [Windows.Forms.DialogResult]::Retry) {return [pscustomobject]@{Missing=$true}}
    if($result -ne [Windows.Forms.DialogResult]::OK) {throw 'Private input cancelled.'}
    return [pscustomobject]@{Missing=$false;Direct=($mode.SelectedIndex -eq 1);Password=(ConvertTo-SecureString $field.Text -AsPlainText -Force)}
  } finally {$field.Clear();$form.Dispose()}
}
function Invoke-DatabaseProbe([string]$Payload) {
  $start=[Diagnostics.ProcessStartInfo]::new()
  $start.FileName=$node;$start.WorkingDirectory=$root
  $start.UseShellExecute=$false;$start.CreateNoWindow=$true
  $start.RedirectStandardInput=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
  $start.Environment.Clear()
  foreach($key in @('PATH','PATHEXT','COMSPEC','SystemRoot','WINDIR','SystemDrive','ProgramData','ALLUSERSPROFILE','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP')) {
    $value=[Environment]::GetEnvironmentVariable($key);if($value){$start.Environment[$key]=$value}
  }
  $start.Environment['WINESNAP_TEST_DATABASE_PIPE']='1'
  $start.ArgumentList.Add((Join-Path $PSScriptRoot 'check-test-database-connection.mjs'))
  if($Action -eq 'NetworkCheck') {$start.ArgumentList.Add('--network-check')}
  try {
    $script:process=[Diagnostics.Process]::Start($start)
    $output=$process.StandardOutput.ReadToEndAsync();$errors=$process.StandardError.ReadToEndAsync()
    if($Payload){$process.StandardInput.Write($Payload)};$process.StandardInput.Close()
    if(-not $process.WaitForExit(60000)) {$process.Kill($true);throw 'Database connection check timed out.'}
    $raw=$output.GetAwaiter().GetResult();$errors.GetAwaiter().GetResult() | Out-Null
    if($raw.Length -gt 16KB) {throw 'Unexpected connection report.'}
    $result=$raw | ConvertFrom-Json
    if($result.project -ne $project -or $result.productionTouched -ne $false -or $result.readOnly -ne $true -or $result.fullBackupCreated -ne $false) {throw 'Unexpected connection report scope.'}
    return $result
  } finally {
    if($script:process){$script:process.Dispose();$script:process=$null}
    $start.Environment.Clear()
  }
}
try {
  Assert-SafePath $path
  if($Action -eq 'Check' -and -not (Test-Path -LiteralPath $path -PathType Leaf)) {
    $report.failure='database_password_not_saved';$report.configured=$false
  } else {
    if($Action -in @('Window','SelfTest')) {
      $phase='private_input'
      if($Action -eq 'SelfTest') {
        $path=Join-Path $folder ('database-input-selftest-'+[guid]::NewGuid().ToString('N')+'.clixml')
        $password=ConvertTo-SecureString 'synthetic-database-encryption-check-only' -AsPlainText -Force
        $direct=$false
      } else {
        $report.pendingInput=$true
        if(Test-Path -LiteralPath $folder -PathType Container) {
          Assert-SafePath $statusPath
          $report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $statusPath -Encoding utf8
        }
        $entry=Read-DatabaseWindow
        $report.pendingInput=$false
        if($entry.Missing) {$report.failure='existing_database_password_required';$report.resetPerformed=$false;throw 'Database password handoff required.'}
        $password=$entry.Password;$direct=$entry.Direct;$entry=$null
      }
      New-Item -ItemType Directory -Path $folder -Force | Out-Null
      Set-PrivateAccess $folder -Directory
      $stored=[pscustomobject]@{Version=1;Project=$project;Purpose=$purpose;Port=5432;Database='postgres';
        Host=$(if($direct){"db.$project.supabase.co"}else{'aws-1-eu-west-1.pooler.supabase.com'});
        Credential=[pscredential]::new($(if($direct){'postgres'}else{"postgres.$project"}),$password)}
      $phase='encrypt_existing_password'
      $temporary=Join-Path $folder ('database-write-'+[guid]::NewGuid().ToString('N')+'.clixml')
      $stored | Export-Clixml -LiteralPath $temporary -Depth 4 -Encoding utf8
      Set-PrivateAccess $temporary
      $verified=Read-DatabaseStore $temporary
      if($verified.Credential.Password.Length -ne $password.Length) {throw 'Database encryption verification failed.'}
      $verified.Credential.Password.Dispose()
      Move-Item -LiteralPath $temporary -Destination $path -Force;$temporary=$null
      Set-PrivateAccess $path
      if($Action -eq 'SelfTest') {
        if([IO.File]::ReadAllText($path).Contains('synthetic-database-encryption-check-only')) {throw 'Plaintext detected.'}
        $report.completed=$true;$report.encryptionSelfTest=$true;$report.networkUsed=$false;$report.realCredentialTouched=$false
      }
    }
    if($Action -ne 'SelfTest') {
      $payload=$null
      if($Action -ne 'NetworkCheck') {
        if($stored){$stored.Credential.Password.Dispose()}
        $stored=Read-DatabaseStore $path
        $plain=$stored.Credential.GetNetworkCredential().Password
        $payload=@{version=1;project=$project;purpose=$purpose;host=$stored.Host;port=5432;database='postgres';user=$stored.Credential.UserName;password=$plain} | ConvertTo-Json -Compress
        $plain=$null;$report.configured=$true
      }
      $phase='read_only_probe'
      $result=Invoke-DatabaseProbe $payload;$payload=$null
      foreach($property in $result.PSObject.Properties) {$report[$property.Name]=$property.Value}
    }
  }
} catch {
  $report.completed=$false
  if(-not $report.failure){$report.failure='database_connection_not_verified'}
  if(-not $report.phase){$report.phase=$phase}
} finally {
  if($Action -eq 'Window') {$report.pendingInput=$false}
  $plain=$null;$payload=$null
  if($stored -and $stored.Credential -is [pscredential]) {$stored.Credential.Password.Dispose()}
  if($password){$password.Dispose()}
  foreach($item in @($temporary,$(if($Action -eq 'SelfTest'){$path}))) {
    if($item -and (Split-Path -Parent $item) -eq $folder -and
      [IO.Path]::GetFileName($item) -match '^database-(write|input-selftest)-[a-f0-9]{32}\.clixml$' -and
      (Test-Path -LiteralPath $item -PathType Leaf)) {Assert-SafePath $item;Remove-Item -LiteralPath $item}
  }
  $report.checkedAt=[DateTime]::UtcNow.ToString('o')
  if($Action -ne 'SelfTest' -and (Test-Path -LiteralPath $folder -PathType Container)) {
    Assert-SafePath $statusPath
    $report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $statusPath -Encoding utf8
  }
}
$report | ConvertTo-Json -Depth 5
if(-not $report.completed){exit 1}
exit 0
