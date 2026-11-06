param([ValidateSet('Window','Status')][string]$Action='Status')
$ErrorActionPreference='Stop'
if(-not $IsWindows){throw 'PowerShell 7 on Windows is required.'}
. (Join-Path $PSScriptRoot 'lib/owned-windows-runtime.ps1')
$directory=Assert-OwnedRuntimeDirectory
$file=Join-Path $directory 'internet-gate.dpapi'
$report=[ordered]@{project='winesnap-owned-local';completed=$false;productionTouched=$false;publicRouteCreated=$false}
$form=$null;$first=$null;$confirm=$null;$process=$null;$bytes=$null;$raw=$null;$plain=$null;$start=$null
try {
  if(Test-Path -LiteralPath $file){
    $item=Get-Item -LiteralPath $file -Force
    if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $item.Length -gt 16KB){throw 'Unsafe gate store.'}
  }
  if($Action -eq 'Status'){
    $report.encryptedStorePresent=Test-Path -LiteralPath $file -PathType Leaf
    $report.readOnly=$true;$report.completed=$true
  }else{
    if(Test-Path -LiteralPath $file){throw 'Gate setup exists; password rotation requires a separate request.'}
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $form=[Windows.Forms.Form]::new()
    $form.Text='WineSnap - Private Internet Access'
    $form.ClientSize=[Drawing.Size]::new(620,335)
    $form.StartPosition='CenterScreen';$form.FormBorderStyle='FixedDialog'
    $form.MaximizeBox=$false;$form.MinimizeBox=$false;$form.ShowInTaskbar=$true
    $form.Font=[Drawing.Font]::new('Segoe UI',11)
    $label=[Windows.Forms.Label]::new()
    $label.Text="winesnap.boleoai.se - outer access gate`r`nUsername: robert`r`nChoose a NEW password (16+ characters).`r`nYour existing WineSnap login stays unchanged."
    $label.SetBounds(20,16,580,100)
    $first=[Windows.Forms.TextBox]::new();$first.UseSystemPasswordChar=$true;$first.MaxLength=128;$first.SetBounds(20,126,580,32)
    $confirmLabel=[Windows.Forms.Label]::new();$confirmLabel.Text='Confirm the new password';$confirmLabel.SetBounds(20,170,580,26)
    $confirm=[Windows.Forms.TextBox]::new();$confirm.UseSystemPasswordChar=$true;$confirm.MaxLength=128;$confirm.SetBounds(20,200,580,32)
    $save=[Windows.Forms.Button]::new();$save.Text='Save encrypted';$save.SetBounds(310,270,170,42)
    $save.Add_Click({
      if($first.Text.Length -ge 16 -and [Text.Encoding]::UTF8.GetByteCount($first.Text) -le 256 -and $first.Text -ceq $confirm.Text -and $first.Text -notmatch '[\x00\r\n]'){
        $form.DialogResult=[Windows.Forms.DialogResult]::OK;$form.Close()
      }else{[Windows.Forms.MessageBox]::Show('Use matching passwords with at least 16 characters.','WineSnap')|Out-Null}
    })
    $cancel=[Windows.Forms.Button]::new();$cancel.Text='Cancel';$cancel.SetBounds(490,270,110,42);$cancel.DialogResult=[Windows.Forms.DialogResult]::Cancel
    $form.Controls.AddRange(@($label,$first,$confirmLabel,$confirm,$save,$cancel));$form.AcceptButton=$save;$form.CancelButton=$cancel
    $form.Add_Shown({$first.Focus()|Out-Null})
    if($form.ShowDialog() -ne [Windows.Forms.DialogResult]::OK){throw 'Password setup cancelled.'}
    $bytes=[Text.Encoding]::UTF8.GetBytes($first.Text);$first.Clear();$confirm.Clear()
    $start=[Diagnostics.ProcessStartInfo]::new()
    $start.FileName=Join-Path $HOME '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
    $start.WorkingDirectory=Split-Path -Parent $PSScriptRoot
    $start.UseShellExecute=$false;$start.CreateNoWindow=$true
    $start.RedirectStandardInput=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
    $start.Environment.Clear()
    foreach($key in @('PATH','PATHEXT','COMSPEC','SystemRoot','WINDIR','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP')){
      $value=[Environment]::GetEnvironmentVariable($key);if($value){$start.Environment[$key]=$value}
    }
    $start.Environment['WINESNAP_OWNED_GATE_SETUP_PIPE']='1'
    $start.ArgumentList.Add((Join-Path $PSScriptRoot 'create-owned-gate-key.mjs'))
    $process=[Diagnostics.Process]::Start($start)
    $output=$process.StandardOutput.ReadToEndAsync();$errors=$process.StandardError.ReadToEndAsync()
    $process.StandardInput.BaseStream.Write($bytes,0,$bytes.Length);$process.StandardInput.Close()
    [Array]::Clear($bytes,0,$bytes.Length);$bytes=$null
    if(-not $process.WaitForExit(60000)){$process.Kill($true);throw 'Password setup timed out.'}
    if(-not [Threading.Tasks.Task]::WaitAll([Threading.Tasks.Task[]]@($output,$errors),5000)){throw 'Password helper output did not close.'}
    $raw=$output.GetAwaiter().GetResult();$errors.GetAwaiter().GetResult()|Out-Null
    if($process.ExitCode -ne 0 -or -not $raw -or $raw.Length -gt 16KB){throw 'Private password helper failed.'}
    $value=$raw|ConvertFrom-Json
    if($value.project -ne 'winesnap-owned-local' -or $value.hostname -ne 'winesnap.boleoai.se' -or $value.username -ne 'robert' -or $value.version -ne 1 -or $value.PSObject.Properties.Name.Count -ne 8){throw 'Unexpected private password payload.'}
    foreach($name in @('sessionSecret','storageKey','resetSecret')){if($value.$name -notmatch '^[a-f0-9]{64}$'){throw 'Invalid gate secret.'}}
    if($value.passwordHash -notmatch '^\$argon2id\$v=19\$m=65536,t=3,p=4\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$'){throw 'Unexpected password hash.'}
    $plain=[Text.Encoding]::UTF8.GetBytes($raw);$raw=$null;$value=$null
    $cipher=[Security.Cryptography.ProtectedData]::Protect($plain,$null,'CurrentUser')
    $handle=[IO.File]::Open($file,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try{$handle.Write($cipher,0,$cipher.Length)}finally{$handle.Dispose()}
    $acl=Get-Acl -LiteralPath $file;$acl.SetAccessRuleProtection($true,$true)
    [IO.FileSystemAclExtensions]::SetAccessControl((Get-Item -LiteralPath $file),$acl)
    $report.completed=$true;$report.encryptedStorePresent=$true
  }
}catch{
  $report.failure='owned_gate_setup_not_accepted';$report.errorType=$_.Exception.GetType().FullName
}finally{
  foreach($buffer in @($bytes,$plain)){if($buffer){[Array]::Clear($buffer,0,$buffer.Length)}}
  $raw=$null;$value=$null
  if($first){$first.Clear()};if($confirm){$confirm.Clear()};if($form){$form.Dispose()}
  if($process){$process.Dispose()};if($start){$start.Environment.Clear()}
}
if($Action -eq 'Window'){$report|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $directory 'gate-setup-status.json') -Encoding utf8}
$report|ConvertTo-Json
if(-not $report.completed){exit 1}
