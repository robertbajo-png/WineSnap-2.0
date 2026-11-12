$ErrorActionPreference='Stop'
if(-not $IsWindows -or $args.Count){throw 'Run without arguments in PowerShell 7 on Windows.'}
$report=[ordered]@{synthetic=$true;completed=$false;productionTouched=$false;cleanupCompleted=$false}
$directory=$null;$files=@();$before=$null;$after=$null;$oldCipher=$null;$newCipher=$null
try {
  $tokens=$null;$errors=$null
  $ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'reset-owned-passwords.ps1'),[ref]$tokens,[ref]$errors)
  if($errors.Count){throw 'Password wrapper syntax failed.'}
  $definitions=@($ast.FindAll({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -in @('Assert-PrivateFile','Protect-PasswordFile')},$false))
  if($definitions.Count -ne 2){throw 'Expected exact password storage functions.'}
  foreach($definition in $definitions){. ([scriptblock]::Create($definition.Extent.Text))}

  $directory=[IO.Path]::GetFullPath((Join-Path ([IO.Path]::GetTempPath()) ('winesnap-password-storage-'+[guid]::NewGuid().ToString('N'))))
  $created=[IO.Directory]::CreateDirectory($directory)
  if($created.FullName -cne $directory -or ($created.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Unsafe synthetic directory.'}
  $live=Join-Path $directory 'live.dpapi';$pending=Join-Path $directory 'pending.dpapi';$backup=Join-Path $directory 'previous.dpapi'
  $files=@($live,$pending,$backup)
  $before=[Text.Encoding]::UTF8.GetBytes('synthetic-before')
  $after=[Text.Encoding]::UTF8.GetBytes('synthetic-after')
  $oldCipher=[Security.Cryptography.ProtectedData]::Protect($before,$null,'CurrentUser')
  $newCipher=[Security.Cryptography.ProtectedData]::Protect($after,$null,'CurrentUser')
  foreach($pair in @(@($live,$oldCipher),@($pending,$newCipher))){
    $handle=[IO.File]::Open($pair[0],[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try{$handle.Write($pair[1],0,$pair[1].Length)}finally{$handle.Dispose()}
  }
  Protect-PasswordFile $live
  $oldAcl=Get-Acl -LiteralPath $live
  [IO.FileSystemAclExtensions]::SetAccessControl((Get-Item -LiteralPath $pending),$oldAcl)
  $report.legacyCopyProtected=(Get-Acl -LiteralPath $pending).AreAccessRulesProtected
  Protect-PasswordFile $pending
  $report.pendingProtected=$true
  [IO.File]::Replace($pending,$live,$backup,$false)
  Assert-PrivateFile $live;Assert-PrivateFile $backup
  $report.replacementProtected=$true
  $report.rollbackProtected=$true
  foreach($pair in @(@($live,$after),@($backup,$before))){
    $plain=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($pair[0]),$null,'CurrentUser')
    try{if(-not [Security.Cryptography.CryptographicOperations]::FixedTimeEquals($plain,$pair[1])){throw 'Synthetic storage roundtrip failed.'}}finally{[Array]::Clear($plain,0,$plain.Length)}
  }
  $report.encryptedRoundtrip=$true;$report.completed=$true
}catch{$report.failure='synthetic_password_storage_not_accepted';$report.errorType=$_.Exception.GetType().Name}
finally{
  try{
    if($directory){
      foreach($file in $files){
        if([IO.Path]::GetFullPath($file) -cne (Join-Path $directory ([IO.Path]::GetFileName($file)))){throw 'Unsafe synthetic cleanup.'}
        if(Test-Path -LiteralPath $file){
          $item=Get-Item -LiteralPath $file -Force
          if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Unexpected synthetic file.'}
          Remove-Item -LiteralPath $file -Force
        }
      }
      [IO.Directory]::Delete($directory,$false)
    }
    $report.cleanupCompleted=$true
  }catch{$report.completed=$false;$report.cleanupCompleted=$false}
  foreach($bytes in @($before,$after,$oldCipher,$newCipher)){if($bytes){[Array]::Clear($bytes,0,$bytes.Length)}}
}
$report|ConvertTo-Json
if(-not $report.completed){exit 1}
