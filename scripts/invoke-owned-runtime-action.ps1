param([ValidateSet('Resume','Verify','Maintain','Backup')][string]$Action)
$ErrorActionPreference='Stop'
if(-not $IsWindows -or [Console]::In.ReadLine() -cne 'WineSnap-owned-supervisor-v1'){throw 'Owned supervisor handshake required.'}
& (Join-Path $PSScriptRoot 'run-owned-windows.ps1') -Action $Action
