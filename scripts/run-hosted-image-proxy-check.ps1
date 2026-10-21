param([switch]$Browser)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$node = Get-Command node -ErrorAction SilentlyContinue
$executable = if ($node) { $node.Source } else {
  Join-Path $HOME '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
}
if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
  throw 'Node.js is required to run the test.'
}

Write-Host 'Only WineSnap-test (pzniyupmgwvlldvztzqh) will be tested.'
Write-Host 'Use its existing publishable and secret keys. Do not paste them into chat.'
$public = Read-Host 'Test publishable key (hidden)' -AsSecureString
$secret = Read-Host 'Test secret key (hidden)' -AsSecureString
$start = [System.Diagnostics.ProcessStartInfo]::new()
$exitCode = 1
try {
  $publicValue = [System.Net.NetworkCredential]::new('', $public).Password.Trim()
  $secretValue = [System.Net.NetworkCredential]::new('', $secret).Password.Trim()
  if (-not $publicValue.StartsWith('sb_publishable_') -or -not $secretValue.StartsWith('sb_secret_')) {
    throw 'Use the existing test publishable and secret API keys, not legacy JWT keys.'
  }
  $start.FileName = $executable
  $start.WorkingDirectory = $root
  $start.UseShellExecute = $false
  $start.CreateNoWindow = $true
  $entry = if ($Browser) { 'run-hosted-image-browser.mjs' } else { 'check-hosted-image-proxy.mjs' }
  $start.ArgumentList.Add((Join-Path $PSScriptRoot $entry))
  $start.Environment['WINESNAP_TEST_PUBLISHABLE_KEY'] = $publicValue
  $start.Environment['WINESNAP_TEST_SECRET_KEY'] = $secretValue
  $process = [System.Diagnostics.Process]::Start($start)
  $process.WaitForExit()
  $exitCode = $process.ExitCode
  $process.Dispose()
} finally {
  $start.Environment.Remove('WINESNAP_TEST_PUBLISHABLE_KEY') | Out-Null
  $start.Environment.Remove('WINESNAP_TEST_SECRET_KEY') | Out-Null
  $publicValue = $null
  $secretValue = $null
  $public.Dispose()
  $secret.Dispose()
}
if ($Browser) {
  Write-Host 'Safe session report: dist/hosted-image-browser-session.json'
} else {
  Write-Host 'Safe report: dist/hosted-image-proxy-report.json'
}
exit $exitCode
