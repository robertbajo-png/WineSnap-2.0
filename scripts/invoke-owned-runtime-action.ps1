param([ValidateSet('Resume','Verify','Maintain','Backup','IngressResume','GateBackup','TunnelResume')][string]$Action)
$ErrorActionPreference='Stop'
if(-not $IsWindows -or [Console]::In.ReadLine() -cne 'WineSnap-owned-supervisor-v1'){throw 'Owned supervisor handshake required.'}
if($Action -in @('IngressResume','GateBackup')){
  $ingressAction=if($Action -eq 'IngressResume'){'Resume'}else{'Backup'}
  & (Join-Path $PSScriptRoot 'run-owned-ingress.ps1') -Action $ingressAction
}elseif($Action -eq 'TunnelResume'){
  & (Join-Path $PSScriptRoot 'run-owned-tunnel.ps1') -Action Resume
}else{
  & (Join-Path $PSScriptRoot 'run-owned-windows.ps1') -Action $Action
}
