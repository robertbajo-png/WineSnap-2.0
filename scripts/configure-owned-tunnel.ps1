param([ValidateSet('Prepare','Import','Status')][string]$Action='Status')
$ErrorActionPreference='Stop'
if(-not $IsWindows){throw 'PowerShell 7 on Windows is required.'}
. (Join-Path $PSScriptRoot 'lib/owned-windows-runtime.ps1')
$directory=Assert-OwnedRuntimeDirectory
$file=Join-Path $directory 'internet-tunnel.dpapi'
$keyFile=Join-Path $directory 'internet-transfer-key.dpapi'
$transfer=Join-Path (Split-Path -Parent $PSScriptRoot) 'dist/owned-tunnel-transfer'
$accountId='e52a9db99ad554c58db919e0c8296e81'
$tunnelId='3c24ecc7-ab97-48dc-95ff-7d72c84918d0'
$plain=$null;$decoded=$null;$private=$null;$rsa=$null
$phase='private_store'
$report=[ordered]@{project='winesnap-owned-local';completed=$false;productionTouched=$false;publicRouteCreated=$false}
function Assert-File([string]$Path,[long]$Limit) {
  $item=Get-Item -LiteralPath $Path -Force
  if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $item.Length -gt $Limit){throw 'Unsafe transfer file.'}
}
function Save-Encrypted([string]$Path,[byte[]]$Bytes) {
  $cipher=[Security.Cryptography.ProtectedData]::Protect($Bytes,$null,'CurrentUser')
  $handle=[IO.File]::Open($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try{$handle.Write($cipher,0,$cipher.Length)}finally{$handle.Dispose()}
  $acl=Get-Acl -LiteralPath $Path
  $acl.SetAccessRuleProtection($true,$true)
  [IO.FileSystemAclExtensions]::SetAccessControl((Get-Item -LiteralPath $Path),$acl)
}
try {
  if(Test-Path -LiteralPath $file){Assert-File $file 16KB}
  if($Action -eq 'Status'){
    $report.encryptedStorePresent=Test-Path -LiteralPath $file -PathType Leaf
    $report.readOnly=$true;$report.completed=$true
  }elseif($Action -eq 'Prepare'){
    if(Test-Path -LiteralPath $file){throw 'The approved tunnel is already configured.'}
    foreach($path in @((Split-Path -Parent $transfer),$transfer)){
      if(-not (Test-Path -LiteralPath $path)){New-Item -ItemType Directory -Path $path|Out-Null}
      $item=Get-Item -LiteralPath $path -Force
      if(-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Redirected transfer directory refused.'}
    }
    $rsa=[Security.Cryptography.RSA]::Create(4096)
    if(Test-Path -LiteralPath $keyFile){
      Assert-File $keyFile 16KB
      $private=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($keyFile),$null,'CurrentUser')
      $read=0;$rsa.ImportPkcs8PrivateKey($private,[ref]$read)
    }else{
      $private=$rsa.ExportPkcs8PrivateKey();Save-Encrypted $keyFile $private
    }
    $public=Join-Path $transfer 'public.pem'
    if(Test-Path -LiteralPath $public){Assert-File $public 4KB}
    [IO.File]::WriteAllText($public,$rsa.ExportSubjectPublicKeyInfoPem(),[Text.UTF8Encoding]::new($false))
    $report.publicKeyReady=$true;$report.completed=$true
  }else{
    if(Test-Path -LiteralPath $file){throw 'Refusing to replace an existing tunnel credential.'}
    Assert-File $keyFile 16KB
    $envelope=Join-Path $transfer 'encrypted.bin';Assert-File $envelope 512
    $cipher=[IO.File]::ReadAllBytes($envelope)
    if($cipher.Length -ne 512){throw 'Unexpected RSA envelope size.'}
    $private=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($keyFile),$null,'CurrentUser')
    $rsa=[Security.Cryptography.RSA]::Create(4096);$read=0;$rsa.ImportPkcs8PrivateKey($private,[ref]$read)
    $phase='tunnel_identity'
    $received=$rsa.Decrypt($cipher,[Security.Cryptography.RSAEncryptionPadding]::OaepSHA256)
    $token=[Text.Encoding]::UTF8.GetString($received).Trim()
    [Array]::Clear($received,0,$received.Length)
    if($token -notmatch '^[A-Za-z0-9+/_=-]{100,8192}$'){throw 'Unexpected tunnel token format.'}
    $encoded=$token.Replace('-','+').Replace('_','/')
    $encoded=$encoded.PadRight($encoded.Length+((4-($encoded.Length%4))%4),'=')
    $decoded=[Convert]::FromBase64String($encoded)
    $identity=[Text.Encoding]::UTF8.GetString($decoded)|ConvertFrom-Json
    if($identity.a -cne $accountId -or $identity.t -cne $tunnelId -or $identity.s -notmatch '^[A-Za-z0-9+/=_-]{32,256}$'){throw 'Token belongs to another tunnel or account.'}
    $payload=[ordered]@{version=1;project='winesnap-owned-local';hostname='winesnap.boleoai.se';accountId=$accountId;tunnelId=$tunnelId;token=$token}
    $phase='encrypted_store'
    $plain=[Text.Encoding]::UTF8.GetBytes(($payload|ConvertTo-Json -Compress))
    Save-Encrypted $file $plain
    $report.completed=$true;$report.encryptedStorePresent=$true;$report.tunnelIdentityVerified=$true
    # Only the exact temporary transfer files created for this operation.
    foreach($path in @($keyFile,$envelope,(Join-Path $transfer 'public.pem'))){
      Assert-File $path 16KB;Remove-Item -LiteralPath $path
    }
  }
}catch{
  $report.failure='owned_tunnel_configuration_not_accepted';$report.phase=$phase
  $report.errorType=$_.Exception.GetType().FullName
}finally{
  foreach($bytes in @($plain,$decoded,$private)){if($bytes){[Array]::Clear($bytes,0,$bytes.Length)}}
  $token=$null;$payload=$null;$identity=$null;$encoded=$null
  if($rsa){$rsa.Dispose()}
}
$report|ConvertTo-Json
if(-not $report.completed){exit 1}
