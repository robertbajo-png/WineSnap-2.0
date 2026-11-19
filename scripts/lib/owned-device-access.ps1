function Read-OwnedDeviceAccess([string]$InstallationId) {
  $path=Join-Path (Assert-OwnedRuntimeDirectory) 'device-access.json'
  if(-not (Test-Path -LiteralPath $path)){return $null}
  $item=Get-Item -LiteralPath $path -Force
  if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $item.Length -gt 4096){throw 'Unsafe device binding.'}
  $acl=Get-Acl -LiteralPath $path
  if(-not $acl.AreAccessRulesProtected){throw 'Private device binding required.'}
  $owner=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  foreach($rule in $acl.Access){$sid=$rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value;if($rule.AccessControlType -eq 'Allow' -and $sid -notin @($owner,'S-1-5-18')){throw 'Device binding permits another account.'}}
  $value=Get-Content -LiteralPath $path -Raw|ConvertFrom-Json -AsHashtable
  if((($value.Keys|Sort-Object)-join ',') -ne 'enabled,hostname,installationId,ownerId,project,version' -or $value.version -ne 1 -or $value.project -ne 'winesnap-owned-local' -or $value.hostname -ne 'winesnap.boleoai.se' -or $value.installationId -cne $InstallationId -or $value.enabled -isnot [bool] -or $value.ownerId -notmatch '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'){throw 'Unexpected device binding.'}
  return $value
}
