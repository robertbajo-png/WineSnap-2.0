param(
  [ValidateSet('Window','Status')][string]$Action='Status',
  [string]$OwnerEmail,
  [switch]$GateOnly
)
$ErrorActionPreference='Stop'
if(-not $IsWindows){throw 'PowerShell 7 on Windows is required.'}
. (Join-Path $PSScriptRoot 'lib/owned-windows-runtime.ps1')
. (Join-Path $PSScriptRoot 'lib/owned-device-access.ps1')
$directory=Assert-OwnedRuntimeDirectory
$statusFile=Join-Path $directory 'password-reset-status.json'
$gateFile=Join-Path $directory 'internet-gate.dpapi'
$form=$null;$fields=@();$lock=$null;$windowLock=$null;$ownsWindow=$false;$keys=$null;$gate=$null;$gatePassword=$null;$pending=$null;$binding=$null
$report=[ordered]@{project='winesnap-owned-local';completed=$false;productionTouched=$false;phase='preflight';gateOnly=$GateOnly.IsPresent;appPasswordUpdated=$false;appLoginVerified=$false;gateStoreUpdated=$false;gateLoginVerified=$false;ownerBindingVerified=$false;ownerSessionVerified=$false;appPasswordUnchanged=$false}

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
function Protect-PasswordFile([string]$Path) {
  $acl=[Security.AccessControl.FileSecurity]::new()
  $acl.SetAccessRuleProtection($true,$false)
  $owner=[Security.Principal.WindowsIdentity]::GetCurrent().User
  $acl.SetOwner($owner)
  foreach($sid in @($owner,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'))){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','Allow'))}
  [IO.FileSystemAclExtensions]::SetAccessControl((Get-Item -LiteralPath $Path),$acl)
  Assert-PrivateFile $Path
}
function Write-Status {
  if(Test-Path -LiteralPath $statusFile){Assert-PrivateFile $statusFile}
  $report.checkedAt=[DateTime]::UtcNow.ToString('o')
  [IO.File]::WriteAllText($statusFile,($report|ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false))
  $acl=Get-Acl -LiteralPath $statusFile;$acl.SetAccessRuleProtection($true,$true)
  [IO.FileSystemAclExtensions]::SetAccessControl((Get-Item -LiteralPath $statusFile),$acl)
}
function Invoke-PrivateWorker([ValidateSet('Rotate','RotateGate','VerifyGate','VerifyOwnerGate')][string]$Mode,[string]$AppPassword) {
  $process=$null;$start=$null;$job=$null;$payload=$null
  try {
    $input=@{keys=$keys;gate=$gate;ownerEmail=$OwnerEmail;gatePassword=$gatePassword;appPassword=$(if($Mode -eq 'Rotate'){$AppPassword}else{$null})}
    if($Mode -in @('RotateGate','VerifyOwnerGate')){$input.binding=$binding}
    $payload=$input|ConvertTo-Json -Depth 5 -Compress;$input=$null
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
    foreach($name in @('appPasswordUpdated','appLoginVerified','appRefreshSessionsRevoked','gateLoginVerified','ownerBindingVerified','ownerSessionVerified','appPasswordUnchanged')){if($value.report.ContainsKey($name)){$report[$name]=($value.report[$name] -eq $true)}}
    if($process.ExitCode -ne 0 -or $value.report.completed -ne $true){throw 'Password operation was not accepted.'}
    return $value
  } finally {
    $payload=$null;$input=$null;$AppPassword=$null
    if($job){$job.Dispose()};if($process){$process.Dispose()};if($start){$start.Environment.Clear()}
  }
}
try {
  if($Action -eq 'Status'){
    Assert-PrivateFile $statusFile
    $saved=Get-Content -LiteralPath $statusFile -Raw|ConvertFrom-Json
    if($saved.project -ne 'winesnap-owned-local'){throw 'Unexpected password status.'}
    $saved|Select-Object project,completed,productionTouched,phase,storageStep,errorType,gateOnly,appPasswordUpdated,appLoginVerified,appRefreshSessionsRevoked,gateStoreUpdated,gateLoginVerified,ownerBindingVerified,ownerSessionVerified,appPasswordUnchanged,cancelled,failure,checkedAt|ConvertTo-Json -Depth 4
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
  $form.Text=$(if($GateOnly){'WineSnap - ett sparat losenord'}else{'WineSnap - nya lokala losenord'});$form.ClientSize=[Drawing.Size]::new(660,$(if($GateOnly){380}else{555}))
  $form.StartPosition='CenterScreen';$form.FormBorderStyle='FixedDialog';$form.MaximizeBox=$false;$form.MinimizeBox=$false;$form.ShowInTaskbar=$true
  $form.Font=[Drawing.Font]::new('Segoe UI',11)
  $heading=[Windows.Forms.Label]::new();$heading.SetBounds(22,15,616,80)
  $heading.Text=$(if($GateOnly){"Valj ett nytt losenord for winesnap.boleoai.se, anvandare robert.`r`nSpara det i mobilens losenordshanterare vid forsta inloggningen.`r`nDitt WineSnap-konto och den gamla appen andras inte."}else{"Endast din egen WineSnap pa winesnap.boleoai.se.`r`nValj tva olika losenord. Du behover logga in igen.`r`nKontot, vinerna och bilderna behalls. Gamla appen andras inte."})
  $form.Controls.Add($heading)
  $labels=@("Skyddssidan: robert (minst 16 tecken)",'Bekrafta skyddssidans losenord',"WineSnap: $OwnerEmail (minst 12 tecken)",'Bekrafta WineSnap-losenordet')
  $fieldCount=if($GateOnly){2}else{4}
  for($i=0;$i -lt $fieldCount;$i++){
    $label=[Windows.Forms.Label]::new();$label.Text=$labels[$i];$label.SetBounds(22,(105+$i*86),616,27)
    $field=[Windows.Forms.TextBox]::new();$field.UseSystemPasswordChar=$true;$field.MaxLength=$(if($i -lt 2){128}else{64});$field.SetBounds(22,(134+$i*86),616,32)
    $fields+=,$field;$form.Controls.AddRange(@($label,$field))
  }
  $buttonY=if($GateOnly){310}else{480}
  $save=[Windows.Forms.Button]::new();$save.Text='Spara och kontrollera';$save.SetBounds(280,$buttonY,225,46)
  $save.Add_Click({
    $valid=$fields[0].Text.Length -ge 16 -and [Text.Encoding]::UTF8.GetByteCount($fields[0].Text) -le 256 -and $fields[0].Text -ceq $fields[1].Text
    if(-not $GateOnly){$valid=$valid -and $fields[2].Text.Length -ge 12 -and [Text.Encoding]::UTF8.GetByteCount($fields[2].Text) -le 72 -and $fields[2].Text -ceq $fields[3].Text -and $fields[0].Text -cne $fields[2].Text}
    foreach($field in $fields){if($field.Text -match '[\x00\r\n]'){$valid=$false}}
    if($valid){$form.DialogResult=[Windows.Forms.DialogResult]::OK;$form.Close()}
    else{$message=if($GateOnly){'Anvand minst 16 tecken (max 256 UTF-8 byte). Bekraftelsen maste matcha.'}else{'Anvand tva olika losenord. Bekraftelserna maste matcha. Skyddet kraver minst 16 tecken, appen minst 12 (max 72 UTF-8 byte).'};[Windows.Forms.MessageBox]::Show($message,'WineSnap')|Out-Null}
  })
  $cancel=[Windows.Forms.Button]::new();$cancel.Text='Avbryt';$cancel.SetBounds(515,$buttonY,123,46);$cancel.DialogResult=[Windows.Forms.DialogResult]::Cancel
  $form.Controls.AddRange(@($save,$cancel));$form.AcceptButton=$save;$form.CancelButton=$cancel
  $form.Add_Shown({$fields[0].Focus()|Out-Null;$form.Activate()})
  $report.phase='awaiting_passwords';Write-Status
  if($form.ShowDialog() -ne [Windows.Forms.DialogResult]::OK){$report.cancelled=$true;throw 'Password entry cancelled.'}
  $gatePassword=$fields[0].Text;$appPassword=$(if($GateOnly){$null}else{$fields[2].Text})
  foreach($field in $fields){$field.Clear()}
  $report.phase='waiting_for_owned_operation';Write-Status
  $lock=Open-OwnedRuntimeLock -Name operation -WaitMs 300000
  if(-not $lock){throw 'Owned operation is busy.'}
  $keys=Read-Private 'backend.dpapi';$gate=Read-Private 'internet-gate.dpapi'
  if($GateOnly){$binding=Read-OwnedDeviceAccess -InstallationId $keys.installationId;if(-not $binding -or -not $binding.enabled){throw 'Existing owner handoff is required.'}}
  $report.phase=$(if($GateOnly){'updating_owned_gate'}else{'updating_owned_account'});Write-Status
  $result=Invoke-PrivateWorker $(if($GateOnly){'RotateGate'}else{'Rotate'}) $appPassword;$appPassword=$null
  $gate=$result.gate;$result=$null
  $report.phase='saving_encrypted_gate';$report.storageStep='encrypt_pending';Write-Status
  $plain=[Text.Encoding]::UTF8.GetBytes(($gate|ConvertTo-Json -Compress))
  try {$fingerprint=[Security.Cryptography.SHA256]::HashData($plain);$cipher=[Security.Cryptography.ProtectedData]::Protect($plain,$null,'CurrentUser')}finally{[Array]::Clear($plain,0,$plain.Length);$plain=$null}
  $suffix=[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmssfff')+'-'+[guid]::NewGuid().ToString('N')
  $pending=Join-Path $directory ('password-reset-'+$suffix+'.pending.dpapi')
  $backup=Join-Path $directory ('password-reset-'+$suffix+'.previous.dpapi')
  $handle=[IO.File]::Open($pending,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try{$handle.Write($cipher,0,$cipher.Length)}finally{$handle.Dispose()}
  $report.storageStep='protect_pending_acl';Write-Status
  Protect-PasswordFile $pending
  Assert-PrivateFile $gateFile
  $report.storageStep='verify_encrypted_roundtrip';Write-Status
  $roundtrip=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($pending),$null,'CurrentUser')
  try{if(-not [Security.Cryptography.CryptographicOperations]::FixedTimeEquals($fingerprint,[Security.Cryptography.SHA256]::HashData($roundtrip))){throw 'Encrypted gate verification failed.'}}finally{[Array]::Clear($roundtrip,0,$roundtrip.Length);$roundtrip=$null}
  $report.storageStep='replace_existing_gate';Write-Status
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
  $result=Invoke-PrivateWorker $(if($GateOnly){'VerifyOwnerGate'}else{'VerifyGate'});$result=$null
  if(-not $report.gateLoginVerified -or ($GateOnly -and -not $report.ownerSessionVerified) -or (-not $GateOnly -and -not $report.appLoginVerified)){throw 'Password verification is incomplete.'}
  $report.completed=$true;$report.phase='complete'
} catch {
  if($Action -eq 'Status'){throw 'Password status is unavailable.'}
  $report.failure='owned_password_reset_incomplete'
  $report.errorType=$_.Exception.GetType().Name
} finally {
  $appPassword=$null;$gatePassword=$null;$result=$null;$cipher=$null;$binding=$null
  if($keys){$keys.Clear()};if($gate){$gate.Clear()}
  foreach($field in $fields){$field.Clear()};if($form){$form.Dispose()};if($lock){$lock.Dispose()}
  if($Action -eq 'Window' -and $ownsWindow){Write-Status}
  if($windowLock){$windowLock.Dispose()}
}
if($Action -eq 'Window'){
  $message=if($report.completed -and $GateOnly){'Klart! Oppna https://winesnap.boleoai.se/?device_login=1 och logga in med robert och det nya losenordet. Spara det pa mobilen. Ditt vanliga WineSnap-konto oppnas automatiskt; ingen enhetsnyckel behovs.'}elseif($report.completed){'Klart! Bada nya losenorden har kontrollerats. Logga in pa winesnap.boleoai.se med robert och sedan ditt WineSnap-konto.'}elseif($report.cancelled){'Avbrutet. Inga losenord har andrats.'}elseif($GateOnly){'Kontrollen blev inte klar. Skyddssidans losenord kan ha andrats, men appens losenord ar oforandrat. Status finns lokalt; skicka inga losenord i chatten.'}else{'Kontrollen blev inte klar. Appens losenord kan ha andrats. Status finns lokalt; skicka inga losenord i chatten.'}
  if($form){[Windows.Forms.MessageBox]::Show($message,'WineSnap')|Out-Null}
}
$report|ConvertTo-Json -Depth 4
if(-not $report.completed -and -not $report.cancelled){exit 1}
