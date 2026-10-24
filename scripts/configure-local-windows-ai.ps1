param([ValidateSet('Install', 'Check', 'Test', 'TestGemini', 'TestFeatures', 'TestPrices', 'TestCooking')][string]$Action = 'Install')
$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'PowerShell 7 on Windows is required.' }
$root = Split-Path -Parent $PSScriptRoot
$project = 'pzniyupmgwvlldvztzqh'
$docker = Join-Path $env:LOCALAPPDATA 'Programs/DockerDesktop/resources/bin/docker.exe'
$name = 'winesnap-local-web-1'
$testKeys = $null
$aiKeys = $null
$payload = $null
$process = $null
$phase = 'engine'
$isTest = $Action -in @('Test', 'TestGemini', 'TestFeatures', 'TestPrices', 'TestCooking')

function Read-PrivateStore([string]$Path) {
  foreach ($item in @((Split-Path -Parent $Path), $Path)) {
    if ((Get-Item -LiteralPath $item -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {
      throw 'Redirected credential storage is not supported.'
    }
  }
  $acl = Get-Acl -LiteralPath $Path
  $owner = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  if (-not $acl.AreAccessRulesProtected) { throw 'Private credential ACL required.' }
  foreach ($rule in $acl.Access) {
    $sid = $rule.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value
    if ($rule.AccessControlType -eq 'Allow' -and $sid -notin @($owner, 'S-1-5-18')) {
      throw 'Private credential ACL required.'
    }
  }
  return Import-Clixml -LiteralPath $Path
}

try {
  $context = & $docker --context desktop-linux context inspect desktop-linux | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0 -or $context[0].Endpoints.docker.Host -ne 'npipe:////./pipe/dockerDesktopLinuxEngine') {
    throw 'Only the local Docker engine is allowed.'
  }
  # Inspect only identity labels and the test destination, never the environment values.
  $phase = 'container_identity'
  $identity = & $docker --context desktop-linux inspect --format '{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "winesnap.scope"}}|{{.State.Running}}' $name
  if ($LASTEXITCODE -ne 0 -or $identity -ne 'winesnap-local|local-windows-test|true') { throw 'Expected the running local WineSnap container.' }
  $start = [Diagnostics.ProcessStartInfo]::new()
  $start.FileName = $docker
  $start.WorkingDirectory = $root
  $start.UseShellExecute = $false
  $start.CreateNoWindow = $true
  $start.RedirectStandardInput = $true
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  $start.Environment.Clear()
  foreach ($key in @('PATH', 'PATHEXT', 'COMSPEC', 'SystemRoot', 'WINDIR', 'SystemDrive', 'ProgramData', 'ALLUSERSPROFILE', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP')) {
    $value = [Environment]::GetEnvironmentVariable($key)
    if ($value) { $start.Environment[$key] = $value }
  }
  $installer = [IO.File]::ReadAllText((Join-Path $root 'config/local-windows/install-ai-credentials.mjs'))
  if ($isTest) {
    $start.FileName = Join-Path $HOME '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
    $entry = if ($Action -eq 'TestCooking') { 'check-local-windows-cooking.mjs' } elseif ($Action -in @('TestFeatures', 'TestPrices')) { 'check-local-windows-features.mjs' } elseif ($Action -eq 'TestGemini') { 'check-local-windows-gemini.mjs' } else { 'check-local-windows-ai.mjs' }
    if ($Action -eq 'TestPrices') { $start.Environment['WINESNAP_FEATURE_SCOPE'] = 'prices' }
    $start.ArgumentList.Add((Join-Path $PSScriptRoot $entry))
  } else {
    foreach ($argument in @('--context', 'desktop-linux', 'exec', '-i', $name, 'node', '--input-type=module', '--eval', $installer)) {
      $start.ArgumentList.Add($argument)
    }
  }
  if ($Action -eq 'Check') { $start.ArgumentList.Add('--'); $start.ArgumentList.Add('--check') }
  else {
    $phase = 'test_credential_store'
    $testKeys = Read-PrivateStore (Join-Path $root '.env.winesnap-test-keys.local')
    $phase = 'ai_credential_store'
    $aiKeys = Read-PrivateStore (Join-Path $env:LOCALAPPDATA 'WineSnapHosting/ai-keys.clixml')
    $phase = 'credential_metadata'
    if ($testKeys.Version -ne 1 -or $testKeys.Project -ne $project -or
      $testKeys.Publishable -isnot [pscredential] -or $testKeys.Secret -isnot [pscredential] -or
      $aiKeys.Version -ne 1 -or $aiKeys.Project -ne $project -or $aiKeys.Purpose -ne 'WineSnap-local-test' -or
      $aiKeys.OpenAI -isnot [pscredential] -or $aiKeys.OpenAI.UserName -ne 'OPENAI_API_KEY') {
      throw 'Expected the approved encrypted test credentials.'
    }
    if ($aiKeys.Gemini -and ($aiKeys.Gemini -isnot [pscredential] -or $aiKeys.Gemini.UserName -ne 'GEMINI_API_KEY')) {
      throw 'Unexpected encrypted Gemini credential type.'
    }
    $values = @{
      version=1; project=$project;
      publishable=$testKeys.Publishable.GetNetworkCredential().Password.Trim();
      secret=$testKeys.Secret.GetNetworkCredential().Password.Trim();
      openai=$aiKeys.OpenAI.GetNetworkCredential().Password.Trim()
    }
    if ($aiKeys.Gemini -is [pscredential]) { $values.gemini = $aiKeys.Gemini.GetNetworkCredential().Password.Trim() }
    $payload = $values | ConvertTo-Json -Compress
    $values.Clear()
  }
  $phase = 'local_process'
  $process = [Diagnostics.Process]::Start($start)
  $output = $process.StandardOutput.ReadToEndAsync()
  $errors = $process.StandardError.ReadToEndAsync()
  if ($payload) { $process.StandardInput.Write($payload) }
  $process.StandardInput.Close()
  $payload = $null
  $timeout = if ($isTest) { 600000 } else { 30000 }
  if (-not $process.WaitForExit($timeout)) { $process.Kill(); throw 'Local AI operation timed out.' }
  $phase = 'runtime_installation'
  $rawOutput = $output.GetAwaiter().GetResult()
  if ($process.ExitCode -ne 0 -and -not $isTest) { throw 'Local runtime rejected credential installation.' }
  $result = $rawOutput | ConvertFrom-Json
  $errors.GetAwaiter().GetResult() | Out-Null
  if ($isTest) {
    $report = if ($Action -eq 'TestCooking') { 'dist/local-windows-cooking-report.json' } elseif ($Action -eq 'TestPrices') { 'dist/local-windows-prices-report.json' } elseif ($Action -eq 'TestFeatures') { 'dist/local-windows-features-report.json' } elseif ($Action -eq 'TestGemini') { 'dist/local-windows-gemini-report.json' } else { 'dist/local-windows-ai-report.json' }
    [pscustomobject]@{ completed=[bool]$result.completed; project=$project; report=$report } | ConvertTo-Json -Compress
    if ($process.ExitCode -ne 0 -or -not $result.completed) { exit 1 }
    exit 0
  }
  if ($process.ExitCode -ne 0 -or $result.configured -ne $true -or $result.project -ne $project) {
    throw 'Local credential installation failed.'
  }
  [pscustomobject]@{ configured=$true; project=$project; provider='OpenAI'; model='gpt-6.1-sol'; geminiConfigured=[bool]$result.geminiConfigured; operationsConfigured=[bool]$result.operationsConfigured; apiValidityChecked=$false } | ConvertTo-Json -Compress
} catch {
  Write-Host "Local AI configuration failed at $phase. No keys reported; production was not contacted."
  exit 1
} finally {
  $payload = $null
  if ($process) { $process.Dispose() }
  if ($start) { $start.Environment.Clear() }
  if ($testKeys) { $testKeys.Publishable.Password.Dispose(); $testKeys.Secret.Password.Dispose() }
  if ($aiKeys) { $aiKeys.OpenAI.Password.Dispose() }
  if ($aiKeys -and $aiKeys.Gemini -is [pscredential]) { $aiKeys.Gemini.Password.Dispose() }
}
