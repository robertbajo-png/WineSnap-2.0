param(
  [ValidateSet('Window','Status')][string]$Action='Status',
  [string]$OwnerEmail
)
$ErrorActionPreference='Stop'
if(-not $IsWindows){throw 'PowerShell 7 on Windows is required.'}
. (Join-Path $PSScriptRoot 'lib/owned-windows-runtime.ps1')
$directory=Assert-OwnedRuntimeDirectory
$statusFile=Join-Path $directory 'password-reset-status.json'
$gateFile=Join-Path $directory 'internet-gate.dpapi'
$form=$null;$fields=@();$lock=$null;$windowLock=$null;$ownsWindow=$false;$keys=$null;$gate=$null;$gatePassword=$null;$pending=$null
$report=[ordered]@{project='winesnap-owned-local';completed=$false;productionTouched=$false;phase='preflight';appPasswordUpdated=$false;appLoginVerified=$false;gateStoreUpdated=$false;gateLoginVerified=$false}

function Assert-PrivateFile([string]$Path) {
  $item=Get-Item -LiteralPath $Path -Force
  if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $item.Length -gt 32KB){throw 'Unsafe private store.'}
  $acl=Get-Acl -LiteralPath $Path
  if(-not $acl.AreAccessRulesProtected){throw 'Protected private file required.'}
  $owner=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  foreach($rule in $acl.Access){$sid=$rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value;if($rule.AccessControlType -eq 'Allow' -and $sid -notin @($owner,'S-1-5-18')){throw 'Private file permits another account.'}}
}
function Read-Private([string]$Name) {
  if($Name -notin @('backend.dpapi','internet-gate.dpapi')){throw 'Unexpected store.'}
  $path=Join-Path $directory $Name;Assert-PrivateFile $path
  $bytes=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($path),$null,'CurrentUser')
  try{return ([Text.Encoding]::UTF8.GetString($bytes)|ConvertFrom-Json -AsHashtable)}finally{[Array]::Clear($bytes,0,$bytes.Length)}
}
function Write-Status {
  if(Test-Path -LiteralPath $statusFile){Assert-PrivateFile $statusFile}
  $report.checkedAt=[DateTime]::UtcNow.ToString('o')
  [IO.File]::WriteAllText($statusFile,($report|ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false))
  $acl=Get-Acl -LiteralPath $statusFile;$acl.SetAccessRuleProtection($true,$true)
  [IO.FileSystemAclExtensions]::SetAccessControl((Get-Item -LiteralPath $statusFile),$acl)
}
function Invoke-PrivateWorker([ValidateSet('Rotate','VerifyGate')][string]$Mode,[string]$AppPassword) {
  $process=$null;$start=$null;$job=$null;$payload=$null
  try {
    $payload=@{keys=$keys;gate=$gate;ownerEmail=$OwnerEmail;gatePassword=$gatePassword;appPassword=$(if($Mode -eq 'Rotate'){$AppPassword}else{$null})}|ConvertTo-Json -Depth 5 -Compress
    Initialize-OwnedProcessJob;$job=[WineSnapOwned.ProcessJob]::new()
    $start=[Diagnostics.ProcessStartInfo]::new()
    $start.FileName=Join-Path $HOME '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
    $start.WorkingDirectory=Split-Path -Parent $PSScriptRoot
    $start.UseShellExecute=$false;$start.CreateNoWindow=$true
    $start.RedirectStandardInput=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
    $start.Environment.Clear()
    foreach($key in @('PATH','PATHEXT','COMSPEC','SystemRoot','WINDIR','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP')){$value=[Environment]::GetEnvironmentVariable($key);if($value){$start.Environment[$key]=$value}}
    $start.Environment['WINESNAP_OWNED_PASSWORD_RESET_PIPE']='1'
    $start.ArgumentList.Add((Join-Path $PSScriptRoot 'reset-owned-passwords-worker.mjs'));$start.ArgumentList.Add($Mode)
    $process=[Diagnostics.Process]::Start($start);$job.Assign($process.Handle)
    $output=$process.StandardOutput.ReadToEndAsync();$errors=$process.StandardError.ReadToEndAsync()
    $process.StandardInput.Write($payload);$process.StandardInput.Close();$payload=$null
    if(-not $process.WaitForExit(180000)){throw 'Password operation timed out.'}
    if(-not [Threading.Tasks.Task]::WaitAll([Threading.Tasks.Task[]]@($output,$errors),5000)){throw 'Password operation did not close.'}
    $raw=$output.GetAwaiter().GetResult();$errors.GetAwaiter().GetResult()|Out-Null
    if(-not $raw -or $raw.Length -gt 16KB){throw 'Unexpected private operation result.'}
    $value=$raw|ConvertFrom-Json -AsHashtable;$raw=$null
    if($value.report.project -ne 'winesnap-owned-local' -or $value.report.productionTouched -ne $false){throw 'Unexpected password scope.'}
    foreach($name in @('appPasswordUpdated','appLoginVerified','appRefreshSessionsRevoked','gateLoginVerified')){if($value.report.ContainsKey($name)){$report[$name]=($value.report[$name] -eq $true)}}
    if($process.ExitCode -ne 0 -or $value.report.completed -ne $true){throw 'Password operation was not accepted.'}
    return $value
  } finally {
    $payload=$null;$AppPassword=$null
    if($job){$job.Dispose()};if($process){$process.Dispose()};if($start){$start.Environment.Clear()}
  }
}
try {
  if($Action -eq 'Status'){
    Assert-PrivateFile $statusFile
    $saved=Get-Content -LiteralPath $statusFile -Raw|ConvertFrom-Json
    if($saved.project -ne 'winesnap-owned-local'){throw 'Unexpected password status.'}
    $saved|Select-Object project,completed,productionTouched,phase,appPasswordUpdated,appLoginVerified,appRefreshSessionsRevoked,gateStoreUpdated,gateLoginVerified,cancelled,failure,checkedAt|ConvertTo-Json -Depth 4
    exit 0
  }
  if($OwnerEmail -cnotmatch '^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$'){throw 'An explicit normalized owner email is required.'}
  $windowLockPath=Join-Path $directory 'password-reset.lock'
  if(Test-Path -LiteralPath $windowLockPath){$item=Get-Item -LiteralPath $windowLockPath -Force;if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Unsafe password window lock.'}}
  $windowLock=[IO.File]::Open($windowLockPath,[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None);$ownsWindow=$true
  foreach($name in @('backend.dpapi','internet-gate.dpapi')){Assert-PrivateFile (Join-Path $directory $name)}
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  $form=[Windows.Forms.Form]::new()
  $form.Text='WineSnap - nya lokala losenord';$form.ClientSize=[Drawing.Size]::new(660,555)
  $form.StartPosition='CenterScreen';$form.FormBorderStyle='FixedDialog';$form.MaximizeBox=$false;$form.MinimizeBox=$false;$form.ShowInTaskbar=$true
  $form.Font=[Drawing.Font]::new('Segoe UI',11)
  $heading=[Windows.Forms.Label]::new();$heading.SetBounds(22,15,616,80)
  $heading.Text="Endast din egen WineSnap pa winesnap.boleoai.se.`r`nValj tva olika losenord. Du behover logga in igen.`r`nKontot, vinerna och bilderna behalls. Gamla appen andras inte."
  $form.Controls.Add($heading)
  $labels=@("Skyddssidan: robert (minst 16 tecken)",'Bekrafta skyddssidans losenord',"WineSnap: $OwnerEmail (minst 12 tecken)",'Bekrafta WineSnap-losenordet')
  for($i=0;$i -lt 4;$i++){
    $label=[Windows.Forms.Label]::new();$label.Text=$labels[$i];$label.SetBounds(22,(105+$i*86),616,27)
    $field=[Windows.Forms.TextBox]::new();$field.UseSystemPasswordChar=$true;$field.MaxLength=$(if($i -lt 2){128}else{64});$field.SetBounds(22,(134+$i*86),616,32)
    $fields+=,$field;$form.Controls.AddRange(@($label,$field))
  }
  $save=[Windows.Forms.Button]::new();$save.Text='Spara och kontrollera';$save.SetBounds(280,480,225,46)
  $save.Add_Click({
    $valid=$fields[0].Text.Length -ge 16 -and [Text.Encoding]::UTF8.GetByteCount($fields[0].Text) -le 256 -and $fields[0].Text -ceq $fields[1].Text -and $fields[2].Text.Length -ge 12 -and [Text.Encoding]::UTF8.GetByteCount($fields[2].Text) -le 72 -and $fields[2].Text -ceq $fields[3].Text -and $fields[0].Text -cne $fields[2].Text
    foreach($field in $fields){if($field.Text -match '[\x00\r\n]'){$valid=$false}}
    if($valid){$form.DialogResult=[Windows.Forms.DialogResult]::OK;$form.Close()}
    else{[Windows.Forms.MessageBox]::Show('Anvand tva olika losenord. Bekraftelserna maste matcha. Skyddet kraver minst 16 tecken, appen minst 12 (max 72 UTF-8 byte).','WineSnap')|Out-Null}
  })
  $cancel=[Windows.Forms.Button]::new();$cancel.Text='Avbryt';$cancel.SetBounds(515,480,123,46);$cancel.DialogResult=[Windows.Forms.DialogResult]::Cancel
  $form.Controls.AddRange(@($save,$cancel));$form.AcceptButton=$save;$form.CancelButton=$cancel
  $form.Add_Shown({$fields[0].Focus()|Out-Null;$form.Activate()})
  $report.phase='awaiting_passwords';Write-Status
  if($form.ShowDialog() -ne [Windows.Forms.DialogResult]::OK){$report.cancelled=$true;throw 'Password entry cancelled.'}
  $gatePassword=$fields[0].Text;$appPassword=$fields[2].Text
  foreach($field in $fields){$field.Clear()}
  $report.phase='waiting_for_owned_operation';Write-Status
  $lock=Open-OwnedRuntimeLock -Name operation -WaitMs 300000
  if(-not $lock){throw 'Owned operation is busy.'}
  $keys=Read-Private 'backend.dpapi';$gate=Read-Private 'internet-gate.dpapi'
  $report.phase='updating_owned_account';Write-Status
  $result=Invoke-PrivateWorker Rotate $appPassword;$appPassword=$null
  $gate=$result.gate;$result=$null
  $plain=[Text.Encoding]::UTF8.GetBytes(($gate|ConvertTo-Json -Compress))
  try {$fingerprint=[Security.Cryptography.SHA256]::HashData($plain);$cipher=[Security.Cryptography.ProtectedData]::Protect($plain,$null,'CurrentUser')}finally{[Array]::Clear($plain,0,$plain.Length);$plain=$null}
  $suffix=[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmssfff')+'-'+[guid]::NewGuid().ToString('N')
  $pending=Join-Path $directory ('password-reset-'+$suffix+'.pending.dpapi')
  $backup=Join-Path $directory ('password-reset-'+$suffix+'.previous.dpapi')
  $handle=[IO.File]::Open($pending,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try{$handle.Write($cipher,0,$cipher.Length)}finally{$handle.Dispose()}
  $acl=Get-Acl -LiteralPath $gateFile
  [IO.FileSystemAclExtensions]::SetAccessControl((Get-Item -LiteralPath $pending),$acl)
  Assert-PrivateFile $pending;Assert-PrivateFile $gateFile
  $roundtrip=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($pending),$null,'CurrentUser')
  try{if(-not [Security.Cryptography.CryptographicOperations]::FixedTimeEquals($fingerprint,[Security.Cryptography.SHA256]::HashData($roundtrip))){throw 'Encrypted gate verification failed.'}}finally{[Array]::Clear($roundtrip,0,$roundtrip.Length);$roundtrip=$null}
  [IO.File]::Replace($pending,$gateFile,$backup,$false);$pending=$null;$report.gateStoreUpdated=$true
  Assert-PrivateFile $gateFile;Assert-PrivateFile $backup
  $report.phase='restarting_private_gate';Write-Status
  $lock.Dispose();$lock=$null
  $pwsh=Join-Path $HOME '.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe'
  $ingress=& $pwsh -NoLogo -NoProfile -File (Join-Path $PSScriptRoot 'run-owned-ingress.ps1') -Action Restart | ConvertFrom-Json
  if($ingress.completed -ne $true){throw 'Private gate restart was not accepted.'}
  $lock=Open-OwnedRuntimeLock -Name operation -WaitMs 300000
  if(-not $lock){throw 'Owned operation is busy.'}
  $report.phase='verifying_new_gate_login';Write-Status
  $result=Invoke-PrivateWorker VerifyGate;$result=$null
  if(-not $report.gateLoginVerified -or -not $report.appLoginVerified){throw 'Password verification is incomplete.'}
  $report.completed=$true;$report.phase='complete'
} catch {
  if($Action -eq 'Status'){throw 'Password status is unavailable.'}
  $report.failure='owned_password_reset_incomplete'
} finally {
  $appPassword=$null;$gatePassword=$null;$result=$null;$cipher=$null
  if($keys){$keys.Clear()};if($gate){$gate.Clear()}
  foreach($field in $fields){$field.Clear()};if($form){$form.Dispose()};if($lock){$lock.Dispose()}
  if($Action -eq 'Window' -and $ownsWindow){Write-Status}
  if($windowLock){$windowLock.Dispose()}
}
if($Action -eq 'Window'){
  $message=if($report.completed){'Klart! Bada nya losenorden har kontrollerats. Logga in pa winesnap.boleoai.se med robert och sedan ditt WineSnap-konto.'}elseif($report.cancelled){'Avbrutet. Inga losenord har andrats.'}else{'Kontrollen blev inte klar. Appens losenord kan ha andrats. Status finns lokalt; skicka inga losenord i chatten.'}
  if($form){[Windows.Forms.MessageBox]::Show($message,'WineSnap')|Out-Null}
}
$report|ConvertTo-Json -Depth 4
if(-not $report.completed -and -not $report.cancelled){exit 1}
