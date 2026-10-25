$ErrorActionPreference='Stop'
if(-not $IsWindows){throw 'PowerShell 7 on Windows is required.'}
$dockerRoot=Join-Path $env:LOCALAPPDATA 'Programs/DockerDesktop'
$docker=Join-Path $dockerRoot 'resources/bin/docker.exe'
try {
  $ready=(& $docker --host npipe:////./pipe/dockerDesktopLinuxEngine info --format '{{.OSType}}' 2>$null) -eq 'linux'
  if(-not $ready){
    Start-Process -FilePath (Join-Path $dockerRoot 'Docker Desktop.exe') -WindowStyle Hidden | Out-Null
    $deadline=[DateTime]::UtcNow.AddMinutes(5)
    do{Start-Sleep -Seconds 5;$ready=(& $docker --host npipe:////./pipe/dockerDesktopLinuxEngine info --format '{{.OSType}}' 2>$null) -eq 'linux'}
    while(-not $ready -and [DateTime]::UtcNow -lt $deadline)
  }
  if(-not $ready){throw 'Local Docker engine not ready.'}
  & (Join-Path $PSScriptRoot 'run-owned-windows.ps1') -Action Start | Out-Null
  if($LASTEXITCODE -ne 0){throw 'Local backend not ready.'}
  $watch=Join-Path $PSScriptRoot 'watch-owned-windows.ps1'
  Start-Process -FilePath (Get-Process -Id $PID).Path -WindowStyle Hidden -ArgumentList @('-NoProfile','-NonInteractive','-File',"`"$watch`"") | Out-Null
} catch {
  Write-Output 'WineSnap owned-local startup was not accepted. No hosted project was contacted.'
  exit 1
}
exit 0
