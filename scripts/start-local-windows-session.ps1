$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'PowerShell 7 on Windows is required.' }
$statePath = Join-Path $env:LOCALAPPDATA 'WineSnapHosting'
New-Item -ItemType Directory -Path $statePath -Force | Out-Null
$status = [ordered]@{ checkedAt=[DateTime]::UtcNow.ToString('o'); completed=$false; productionTouched=$false }
try {
  $dockerRoot = Join-Path $env:LOCALAPPDATA 'Programs/DockerDesktop'
  $docker = Join-Path $dockerRoot 'resources/bin/docker.exe'
  $desktop = Join-Path $dockerRoot 'Docker Desktop.exe'
  if (-not (Test-Path -LiteralPath $desktop -PathType Leaf)) { throw 'desktop_not_found' }
  $ready = (& $docker --context desktop-linux info --format '{{.OSType}}' 2>$null) -eq 'linux'
  if (-not $ready) {
    Start-Process -FilePath $desktop -WindowStyle Hidden | Out-Null
    $deadline = [DateTime]::UtcNow.AddMinutes(5)
    do {
      Start-Sleep -Seconds 5
      $ready = (& $docker --context desktop-linux info --format '{{.OSType}}' 2>$null) -eq 'linux'
    } while (-not $ready -and [DateTime]::UtcNow -lt $deadline)
  }
  if (-not $ready) { throw 'engine_not_ready' }
  & (Join-Path $PSScriptRoot 'run-local-windows.ps1') -Action Resume
  & (Join-Path $PSScriptRoot 'run-local-windows-internet.ps1') -Action Resume
  $status.completed = $true
} catch {
  $status.failure = 'local_session_start_failed'
  $global:LASTEXITCODE = 1
} finally {
  $status.finishedAt = [DateTime]::UtcNow.ToString('o')
  $status | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $statePath 'session-status.json') -Encoding utf8
}
if (-not $status.completed) { exit 1 }
