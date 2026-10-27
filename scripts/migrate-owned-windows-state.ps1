$ErrorActionPreference='Stop'
if(-not $IsWindows){throw 'PowerShell 7 on Windows is required.'}
. (Join-Path $PSScriptRoot 'lib/owned-windows-runtime.ps1')
$source=Join-Path $env:LOCALAPPDATA 'WineSnapOwned'
$destination=Get-OwnedRuntimeDirectory
$operationLock=$null
$acquired=$false;$copied=0
function Assert-PrivateStatePath([string]$Path) {
  $item=Get-Item -LiteralPath $Path -Force
  if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected state refused.'}
  $acl=Get-Acl -LiteralPath $Path
  $owner=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  foreach($rule in $acl.Access){
    $sid=$rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
    if($rule.AccessControlType -eq 'Allow' -and $sid -notin @($owner,'S-1-5-18')){throw 'Private state permissions required.'}
  }
}
function Protect-StatePath([string]$Path,[switch]$Folder) {
  $item=Get-Item -LiteralPath $Path -Force
  if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected destination refused.'}
  $owner=[Security.Principal.WindowsIdentity]::GetCurrent().User
  $acl=Get-Acl -LiteralPath $Path
  foreach($rule in @($acl.Access)){$acl.PurgeAccessRules($rule.IdentityReference)}
  $acl.SetOwner($owner);$acl.SetAccessRuleProtection($true,$false)
  foreach($sid in @($owner,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'))){
    $inherit=if($Folder){[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit'}else{[Security.AccessControl.InheritanceFlags]::None}
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl',$inherit,'None','Allow'))
  }
  [IO.FileSystemAclExtensions]::SetAccessControl($item,$acl)
}
function Copy-StateFile([string]$From,[string]$To,[long]$Limit,[switch]$Immutable) {
  Assert-PrivateStatePath $From
  $item=Get-Item -LiteralPath $From -Force
  if($item.PSIsContainer -or $item.Length -gt $Limit){throw 'Unexpected state file.'}
  if(Test-Path -LiteralPath $To){
    Assert-PrivateStatePath $To
    if($Immutable -and (Get-FileHash -LiteralPath $From -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $To -Algorithm SHA256).Hash){throw 'Refusing to replace different existing credentials or archives.'}
    return
  }
  Copy-Item -LiteralPath $From -Destination $To
  Protect-StatePath $To
  if((Get-FileHash -LiteralPath $From -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $To -Algorithm SHA256).Hash){throw 'Encrypted state copy verification failed.'}
  $script:copied++
}
try {
  Assert-PrivateStatePath $source
  if(-not (Test-Path -LiteralPath (Join-Path $source 'backend.dpapi') -PathType Leaf)){throw 'Original encrypted backend configuration required.'}
  if(-not (Test-Path -LiteralPath $destination)){New-Item -ItemType Directory -Path $destination | Out-Null;Protect-StatePath $destination -Folder}
  Assert-PrivateStatePath $destination
  $operationLock=Open-OwnedRuntimeLock -Name operation
  $acquired=[bool]$operationLock
  if(-not $acquired){throw 'An owned operation is running; no files were copied.'}
  $files=@(Get-ChildItem -LiteralPath $source -File)
  if($files.Count -gt 100){throw 'Unexpected state inventory.'}
  foreach($item in $files){
    if($item.Name -eq 'backend.dpapi'){
      Copy-StateFile $item.FullName (Join-Path $destination $item.Name) 32KB -Immutable
    }elseif($item.Name -eq 'browser-fixture.json' -or $item.Name -match '^[a-z]+-status\.json$'){
      Copy-StateFile $item.FullName (Join-Path $destination $item.Name) 64KB
    }
  }
  $provider=Join-Path $env:LOCALAPPDATA 'WineSnapHosting/ai-keys.clixml'
  if(Test-Path -LiteralPath $provider){Copy-StateFile $provider (Join-Path $destination 'ai-keys.clixml') 64KB -Immutable}
  $archives=Join-Path $source 'backups'
  if(Test-Path -LiteralPath $archives){
    Assert-PrivateStatePath $archives
    $target=Join-Path $destination 'backups'
    if(-not (Test-Path -LiteralPath $target)){New-Item -ItemType Directory -Path $target | Out-Null;Protect-StatePath $target -Folder}
    Assert-PrivateStatePath $target
    foreach($item in @(Get-ChildItem -LiteralPath $archives -File)){
      if($item.Name -notmatch '^owned-\d{8}-\d{9}\.dpapi$'){throw 'Unexpected archive name.'}
      Copy-StateFile $item.FullName (Join-Path $target $item.Name) 130MB -Immutable
    }
  }
  Assert-OwnedRuntimeDirectory | Out-Null
  [pscustomobject]@{project='winesnap-owned-local';completed=$true;copiedFiles=$copied;sourceRetained=$true;encryptedFilesNotDecrypted=$true;productionTouched=$false;volumesChanged=$false}|ConvertTo-Json
}finally{if($operationLock){$operationLock.Dispose()}}
