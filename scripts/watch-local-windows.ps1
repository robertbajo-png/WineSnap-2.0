param([switch]$Once, [switch]$SelfTest)
$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'PowerShell 7 on Windows is required.' }
function Test-LocalJobDue($Last, [double]$Hours, [DateTimeOffset]$Now = [DateTimeOffset]::UtcNow) {
  if (-not $Last) { return $true }
  $interval = if (-not $Last.completed) { 1.0/6 } else { $Hours }
  # ConvertFrom-Json may return a DateTime. Never stringify it and lose its zone.
  return ([DateTimeOffset]$Last.checkedAt) -lt $Now.AddHours(-$interval)
}
if ($SelfTest) {
  $now = [DateTimeOffset]'2026-10-23T16:00:00Z'
  foreach ($stamp in @('2026-10-23T15:59:00Z', '2026-10-23T17:59:00+02:00')) {
    $record = [pscustomobject]@{ completed=$true; checkedAt=$stamp }
    foreach ($sample in @($record, ($record | ConvertTo-Json | ConvertFrom-Json))) {
      if (Test-LocalJobDue $sample 1 $now) { throw 'Fresh hourly job was repeated.' }
      if (Test-LocalJobDue $sample 24 $now) { throw 'Fresh daily backup was repeated.' }
      $sample.completed = $false
      if (Test-LocalJobDue $sample 1 $now) { throw 'Failed job retried before ten minutes.' }
    }
  }
  if (-not (Test-LocalJobDue ([pscustomobject]@{ completed=$true; checkedAt='2026-10-23T14:59:00Z' }) 1 $now)) { throw 'Overdue job skipped.' }
  if (-not (Test-LocalJobDue ([pscustomobject]@{ completed=$false; checkedAt='2026-10-23T15:49:00Z' }) 24 $now)) { throw 'Overdue retry skipped.' }
  Write-Output 'Verified UTC, offset and deserialized DateTime scheduling without starting jobs or reading credentials.'
  exit 0
}
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$mutex = [Threading.Mutex]::new($false, "Local\WineSnap-Test-Watch-$sid")
$acquired = $false
$statePath = Join-Path $env:LOCALAPPDATA 'WineSnapHosting'
$docker = Join-Path $env:LOCALAPPDATA 'Programs/DockerDesktop/resources/bin/docker.exe'
try {
  try { $acquired = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $acquired = $true }
  if (-not $acquired) { exit 0 }
  do {
    $state = [ordered]@{ checkedAt=[DateTime]::UtcNow.ToString('o'); healthy=$false; credentialsRestored=$false; productionTouched=$false }
    $phase = 'engine'
    try {
      $context = & $docker --context desktop-linux context inspect desktop-linux 2>$null | ConvertFrom-Json
      if ($LASTEXITCODE -ne 0 -or $context[0].Endpoints.docker.Host -ne 'npipe:////./pipe/dockerDesktopLinuxEngine') { throw 'engine_unavailable' }
      $identity = & $docker --context desktop-linux inspect --format '{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "winesnap.scope"}}|{{.State.Running}}|{{.State.Health.Status}}' winesnap-local-web-1 2>$null
      if ($LASTEXITCODE -ne 0 -or $identity -ne 'winesnap-local|local-windows-test|true|healthy') { throw 'app_unavailable' }
      $phase = 'credentials'
      $configuredText = & (Join-Path $PSScriptRoot 'configure-local-windows-ai.ps1') -Action Check
      $needsRestore = $LASTEXITCODE -ne 0
      if (-not $needsRestore) {
        $configured = $configuredText | ConvertFrom-Json
        $needsRestore = -not $configured.configured -or -not $configured.operationsConfigured
      }
      if ($needsRestore) {
        & (Join-Path $PSScriptRoot 'configure-local-windows-ai.ps1') | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'credential_restore_failed' }
        $state.credentialsRestored = $true
      }
      $phase = 'health'
      $health = Invoke-RestMethod 'http://127.0.0.1:5210/api/health' -TimeoutSec 10 -NoProxy
      if ($health.status -ne 'ok') { throw 'health_failed' }
      $phase = 'jobs'
      foreach ($job in @(
        @{ Action='Maintain'; File='maintain-status.json'; Hours=1 },
        @{ Action='Backup'; File='backup-status.json'; Hours=24 }
      )) {
        $statusFile = Join-Path $statePath $job.File
        $last = if (Test-Path -LiteralPath $statusFile) { Get-Content -LiteralPath $statusFile -Raw | ConvertFrom-Json } else { $null }
        if (($state.credentialsRestored -and $job.Action -eq 'Maintain') -or (Test-LocalJobDue $last $job.Hours)) {
          & (Join-Path $PSScriptRoot 'run-local-windows-operations.ps1') -Action $job.Action | Out-Null
          if ($LASTEXITCODE -ne 0) { $state[$job.Action.ToLowerInvariant() + 'Failed'] = $true }
        }
      }
      $state.healthy = $true
    } catch { $state.failure = 'local_watch_check_failed'; $state.phase = $phase }
    $state | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $statePath 'watch-status.json') -Encoding utf8
    if (-not $Once) { Start-Sleep -Seconds 60 }
  } while (-not $Once)
} finally {
  if ($acquired) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
if ($Once -and $acquired -and -not $state.healthy) { exit 1 }
