$ErrorActionPreference='Stop'
if(-not $IsWindows){throw 'PowerShell 7 on Windows is required.'}
# This runs from the user's Startup folder, never from the WineSnap task job.
. (Join-Path $PSScriptRoot 'lib/owned-windows-runtime.ps1')
$root=Join-Path $env:LOCALAPPDATA 'Programs/DockerDesktop'
$ready=Test-OwnedDockerEngine
if(-not $ready){Start-Process -FilePath (Join-Path $root 'Docker Desktop.exe') -WindowStyle Hidden | Out-Null}
