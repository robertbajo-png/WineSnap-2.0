param(
  [ValidateSet('Start', 'Stop', 'Status', 'Resume')][string]$Action = 'Status',
  [string]$AllowedMail
)
$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'PowerShell 7 on Windows is required.' }
$root = Split-Path -Parent $PSScriptRoot
$name = 'winesnap-local-tunnel'
$image = 'cloudflare/cloudflared@sha256:faa8e0a1475f137c910be6025f43c8e4092fdd35461b31e19fd1390657a1ff39'
$command = Get-Command docker -ErrorAction SilentlyContinue
$docker = if ($command) { $command.Source } else { Join-Path $env:LOCALAPPDATA 'Programs/DockerDesktop/resources/bin/docker.exe' }

function Invoke-TunnelDocker([string[]]$Arguments) {
  $result = & $docker --context desktop-linux @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) { throw 'Local tunnel Docker operation failed.' }
  return ($result -join "`n")
}

function Read-Tunnel {
  $id = Invoke-TunnelDocker @('ps', '--all', '--filter', "name=^/$name$", '--format', '{{.ID}}')
  if (-not $id.Trim()) { return $null }
  $container = (Invoke-TunnelDocker @('inspect', $id.Trim()) | ConvertFrom-Json)[0]
  $mailIndex = [array]::IndexOf($container.Config.Cmd, '--allowed-mail')
  if ($container.Config.Labels.'winesnap.scope' -ne 'local-windows-tunnel' -or
      $container.Config.Image -ne $image -or
      $container.Config.Cmd -notcontains '--allowed-mail' -or
      $container.Config.Cmd -notcontains 'http://winesnap-local-web-1:3000' -or
      $mailIndex -lt 0 -or $mailIndex + 1 -ge $container.Config.Cmd.Count -or
      $container.Config.Cmd[$mailIndex + 1] -notmatch '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' -or
      @($container.Mounts).Count -ne 0 -or
      $container.HostConfig.PublishAllPorts -or $container.HostConfig.NetworkMode -ne 'winesnap-local_default' -or
      @($container.HostConfig.PortBindings.PSObject.Properties).Count -ne 0) {
    throw 'Refusing an unexpected or unprotected tunnel container.'
  }
  return $container
}

$context = Invoke-TunnelDocker @('context', 'inspect', 'desktop-linux') | ConvertFrom-Json
if ($context[0].Endpoints.docker.Host -ne 'npipe:////./pipe/dockerDesktopLinuxEngine') { throw 'Local engine required.' }
$container = Read-Tunnel
if ($Action -eq 'Stop') {
  if ($container) { Invoke-TunnelDocker @('stop', $container.Id) | Out-Null }
  Write-Host 'Only the WineSnap test tunnel was stopped.'
  exit 0
}
if ($Action -eq 'Status' -and (-not $container -or -not $container.State.Running)) {
  Write-Host 'WineSnap test tunnel is not running.'
  exit 0
}
if ($Action -in @('Start', 'Resume')) {
  & (Join-Path $PSScriptRoot 'run-local-windows.ps1') -Action Verify
  if (-not $container) {
    if ($Action -eq 'Resume') { Write-Host 'No test tunnel has been installed.'; exit 0 }
    if ($AllowedMail -notmatch '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$') {
      throw 'Start requires one exact owner email; wildcard/public access is not supported.'
    }
    Invoke-TunnelDocker @(
      'run', '--detach', '--name', $name, '--network', 'winesnap-local_default',
      '--label', 'winesnap.scope=local-windows-tunnel', '--restart', 'unless-stopped',
      '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
      '--memory', '128m', '--cpus', '0.5', '--pids-limit', '64',
      '--log-opt', 'max-size=5m', '--log-opt', 'max-file=2', $image,
      'tunnel', '--no-autoupdate', '--protocol', 'http2', '--metrics', '127.0.0.1:20241',
      '--url', 'http://winesnap-local-web-1:3000', '--allowed-mail', $AllowedMail
    ) | Out-Null
  } elseif (-not $container.State.Running) {
    Invoke-TunnelDocker @('start', $container.Id) | Out-Null
  }
}

$handler = [System.Net.Http.HttpClientHandler]::new()
$handler.AllowAutoRedirect = $false
$handler.UseProxy = $false
$client = [System.Net.Http.HttpClient]::new($handler)
$client.Timeout = [TimeSpan]::FromSeconds(10)
$verified = $false
try {
  $deadline = [DateTime]::UtcNow.AddSeconds(120)
  do {
    $container = Read-Tunnel
    if (-not $container.State.Running) { throw 'Test tunnel exited.' }
    $logs = Invoke-TunnelDocker @('logs', '--since', $container.State.StartedAt, $container.Id)
    $matches = [regex]::Matches($logs, 'https://[a-z0-9-]+\.trycloudflare\.com')
    if ($matches.Count) {
      $url = $matches[$matches.Count - 1].Value
      try {
        $response = $client.GetAsync($url + '/api/health').GetAwaiter().GetResult()
        try {
          $location = $response.Headers.Location
          $authHost = if ($location -and $location.IsAbsoluteUri) { $location.Host } else { '' }
          $verified = [int]$response.StatusCode -in @(302, 303, 307) -and
            $authHost -eq 'login.trycloudflare.com' -and $location.AbsolutePath -eq '/authorize'
          if ([int]$response.StatusCode -eq 200) { throw 'Unauthenticated access must not reach the app.' }
        } finally { $response.Dispose() }
      } catch {
        if ($_.Exception.Message -eq 'Unauthenticated access must not reach the app.') { throw }
      }
    }
    if ($verified) { break }
    Start-Sleep -Seconds 3
  } while ([DateTime]::UtcNow -lt $deadline)
  if (-not $verified) { throw 'Could not verify the email access gate.' }
  $statePath = Join-Path $env:LOCALAPPDATA 'WineSnapHosting'
  New-Item -ItemType Directory -Path $statePath -Force | Out-Null
  [pscustomobject]@{ url=$url; checkedAt=[DateTime]::UtcNow.ToString('o'); emailProtected=$true; temporary=$true } |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $statePath 'internet-status.json') -Encoding utf8
  Write-Host "Email-protected WineSnap test URL: $url"
  Write-Host 'This temporary address changes when the tunnel reconnects. Production DNS is unchanged.'
} catch {
  # Never leave an unverifiable public route running.
  if ($Action -in @('Start', 'Resume')) { Invoke-TunnelDocker @('stop', $name) | Out-Null }
  throw
} finally {
  $client.Dispose()
  $handler.Dispose()
}
