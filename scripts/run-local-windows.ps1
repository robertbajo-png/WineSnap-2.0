param([ValidateSet('Start', 'Stop', 'Status', 'Restart', 'Verify')][string]$Action = 'Start')
$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'This launcher requires PowerShell 7 on Windows.' }
$root = Split-Path -Parent $PSScriptRoot
$project = 'pzniyupmgwvlldvztzqh'
$origin = "https://$project.supabase.co"
$app = 'http://127.0.0.1:5210'
$name = 'winesnap-local-web-1'
$docker = (Get-Command docker -ErrorAction Stop).Source
$keyPath = Join-Path $root '.env.winesnap-test-keys.local'
$publicValue = $null
$stored = $null

function Invoke-LocalDocker([string[]]$Arguments) {
  $start = [System.Diagnostics.ProcessStartInfo]::new()
  $start.FileName = $docker
  $start.WorkingDirectory = $root
  $start.UseShellExecute = $false
  $start.CreateNoWindow = $true
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  $start.Environment.Clear()
  foreach ($key in @('PATH', 'SystemRoot', 'WINDIR', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'COMSPEC', 'PATHEXT', 'ProgramData')) {
    $value = [Environment]::GetEnvironmentVariable($key)
    if ($value) { $start.Environment[$key] = $value }
  }
  if ($publicValue) { $start.Environment['WINESNAP_LOCAL_PUBLISHABLE_KEY'] = $publicValue }
  foreach ($argument in @('--context', 'desktop-linux') + $Arguments) { $start.ArgumentList.Add($argument) }
  $process = [System.Diagnostics.Process]::Start($start)
  try {
    $output = $process.StandardOutput.ReadToEndAsync()
    $errors = $process.StandardError.ReadToEndAsync()
    $process.WaitForExit()
    $text = $output.GetAwaiter().GetResult()
    $diagnostic = $errors.GetAwaiter().GetResult()
    if ($publicValue) {
      $text = $text.Replace($publicValue, '[public test key]')
      $diagnostic = $diagnostic.Replace($publicValue, '[public test key]')
    }
    if ($process.ExitCode -ne 0) {
      throw "Local Docker command failed ($($process.ExitCode)). $diagnostic"
    }
    return $text
  } finally {
    $start.Environment.Clear()
    $process.Dispose()
  }
}

function Read-LocalContainer {
  $ids = Invoke-LocalDocker @('ps', '--all', '--filter', "name=^/$name$", '--format', '{{.ID}}')
  if (-not $ids.Trim()) { return $null }
  $container = (Invoke-LocalDocker @('inspect', $ids.Trim()) | ConvertFrom-Json)[0]
  if ($container.Config.Labels.'com.docker.compose.project' -ne 'winesnap-local' -or
      $container.Config.Labels.'winesnap.scope' -ne 'local-windows-test') {
    throw 'Refusing to operate on an unrelated container.'
  }
  return $container
}

function Test-LocalContainer($Container) {
  if (-not $Container -or $Container.State.Health.Status -ne 'healthy') { throw 'WineSnap is not healthy.' }
  $bindings = @($Container.HostConfig.PortBindings.'3000/tcp')
  if ($bindings.Count -ne 1 -or $bindings[0].HostIp -ne '127.0.0.1' -or $bindings[0].HostPort -ne '5210' -or
      $Container.Config.User -ne 'node' -or -not $Container.HostConfig.ReadonlyRootfs -or
      $Container.HostConfig.Memory -ne 805306368 -or @($Container.Mounts).Count -ne 0 -or
      $Container.Config.Env -notcontains "SUPABASE_URL=$origin" -or
      ($Container.Config.Env -join "`n") -match '(?m)^(?:OPENAI_API_KEY|GEMINI_API_KEY|SUPABASE_SERVICE_ROLE_KEY|CRON_SECRET)=') {
    throw 'Local isolation or runtime configuration check failed.'
  }
  $health = Invoke-WebRequest "$app/api/health" -TimeoutSec 15 -NoProxy
  if ($health.StatusCode -ne 200 -or $health.Headers.'Cache-Control' -notcontains 'no-store' -or
      ($health.Content | ConvertFrom-Json).status -ne 'ok') { throw 'Health endpoint check failed.' }
  Write-Host 'Verified: healthy, loopback only, non-root, read-only, 768 MB limit, no admin/provider keys.'
}

try {
  $context = Invoke-LocalDocker @('context', 'inspect', 'desktop-linux') | ConvertFrom-Json
  if ($context[0].Endpoints.docker.Host -ne 'npipe:////./pipe/dockerDesktopLinuxEngine') {
    throw 'Only the local Docker Desktop Linux engine is allowed.'
  }
  $container = Read-LocalContainer
  if ($Action -eq 'Stop') {
    if ($container) { Invoke-LocalDocker @('stop', $container.Id) | Out-Null }
    Write-Host 'Local WineSnap stopped. No data or other containers were changed.'
    exit 0
  }
  if ($Action -eq 'Status') {
    if (-not $container) { Write-Host 'Local WineSnap is not installed.'; exit 0 }
    Write-Host "Local WineSnap: $($container.State.Status); health: $($container.State.Health.Status); $app"
    exit 0
  }
  if ($Action -eq 'Verify') { Test-LocalContainer $container; exit 0 }
  if ($Action -eq 'Restart') {
    if (-not $container) { throw 'Run Start first.' }
    Invoke-LocalDocker @('restart', $container.Id) | Out-Null
  } else {
    if (-not $container -and (Get-NetTCPConnection -State Listen -LocalPort 5210 -ErrorAction SilentlyContinue)) {
      throw 'Port 5210 is occupied. No existing process will be stopped.'
    }
    if (-not (Test-Path -LiteralPath $keyPath -PathType Leaf) -or
        ((Get-Item -LiteralPath $keyPath -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
      throw 'Expected the existing encrypted WineSnap-test key file; no keys are accepted as arguments.'
    }
    $acl = Get-Acl -LiteralPath $keyPath
    $owner = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    if (-not $acl.AreAccessRulesProtected) { throw 'Test key file must have a private ACL.' }
    foreach ($rule in $acl.Access) {
      $sid = $rule.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value
      if ($rule.AccessControlType -eq 'Allow' -and $sid -notin @($owner, 'S-1-5-18')) {
        throw 'Test key file is readable by another account.'
      }
    }
    $stored = Import-Clixml -LiteralPath $keyPath
    if ($stored.Version -ne 1 -or $stored.Project -ne $project -or $stored.Publishable -isnot [pscredential]) {
      throw 'Expected the approved test project and encrypted public key.'
    }
    # Only the public credential is unlocked. The admin credential stays encrypted.
    $publicValue = $stored.Publishable.GetNetworkCredential().Password.Trim()
    if ($publicValue -notmatch '^sb_publishable_[A-Za-z0-9_-]+$') { throw 'Invalid public test key.' }
    Write-Host 'Building and starting local WineSnap. Only the hosted test backend is connected.'
    $compose = @('compose', '--project-name', 'winesnap-local', '--file', (Join-Path $root 'config/local-windows/compose.json'), '--env-file', (Join-Path $root 'config/local-windows/compose.env'))
    Invoke-LocalDocker ($compose + @('up', '--detach', '--build', '--wait', '--wait-timeout', '120')) | Out-Null
  }
  $deadline = [DateTime]::UtcNow.AddSeconds(120)
  do {
    $container = Read-LocalContainer
    if ($container.State.Health.Status -eq 'healthy') { break }
    Start-Sleep -Seconds 2
  } while ([DateTime]::UtcNow -lt $deadline)
  Test-LocalContainer $container
  Write-Host "WineSnap is running at $app (test environment, not production)."
} finally {
  $publicValue = $null
  if ($stored) {
    $stored.Publishable.Password.Dispose()
    if ($stored.Secret -is [pscredential]) { $stored.Secret.Password.Dispose() }
  }
  $stored = $null
}
