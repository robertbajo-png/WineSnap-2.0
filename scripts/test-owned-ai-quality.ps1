param()
$ErrorActionPreference='Stop'
if(-not $IsWindows){throw 'PowerShell 7 on Windows is required.'}
. (Join-Path $PSScriptRoot 'lib/owned-windows-runtime.ps1')
$directory=Assert-OwnedRuntimeDirectory
$lock=$null;$keys=$null;$provider=$null;$process=$null;$start=$null;$job=$null;$payload=$null
$report=[ordered]@{project='winesnap-owned-local';completed=$false;productionTouched=$false;configurationChanged=$false;failure='owned_ai_quality_incomplete'}
function Assert-Private([string]$Path){
  $item=Get-Item -LiteralPath $Path -Force
  if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $item.Length -gt 32KB){throw 'Unsafe private input.'}
  $acl=Get-Acl -LiteralPath $Path
  if(-not $acl.AreAccessRulesProtected){throw 'Protected private input required.'}
  $owner=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  foreach($rule in $acl.Access){$sid=$rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value;if($rule.AccessControlType -eq 'Allow' -and $sid -notin @($owner,'S-1-5-18')){throw 'Unexpected private input permissions.'}}
}
try{
  $lock=Open-OwnedRuntimeLock -Name operation -WaitMs 300000
  if(-not $lock){throw 'Owned operation is busy.'}
  $file=Join-Path $directory 'backend.dpapi';Assert-Private $file
  $bytes=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($file),$null,'CurrentUser')
  try{$keys=[Text.Encoding]::UTF8.GetString($bytes)|ConvertFrom-Json -AsHashtable}finally{[Array]::Clear($bytes,0,$bytes.Length)}
  if($keys.version -ne 1 -or $keys.project -ne 'winesnap-owned-local'){throw 'Unexpected backend scope.'}
  $file=Join-Path $directory 'ai-keys.clixml';Assert-Private $file
  $provider=Import-Clixml -LiteralPath $file
  if($provider.Version -ne 1 -or $provider.Purpose -ne 'WineSnap-local-test'){throw 'Existing WineSnap provider store required.'}
  foreach($slot in @(@('OpenAI','openai','OPENAI_API_KEY'),@('Gemini','gemini','GEMINI_API_KEY'))){
    $credential=$provider.($slot[0])
    if($credential -isnot [pscredential] -or $credential.UserName -ne $slot[2]){throw 'Existing provider credential required.'}
    $keys[$slot[1]]=$credential.GetNetworkCredential().Password.Trim()
  }
  $payload=$keys|ConvertTo-Json -Compress;$keys.Clear();$keys=$null
  Initialize-OwnedProcessJob;$job=[WineSnapOwned.ProcessJob]::new()
  $start=[Diagnostics.ProcessStartInfo]::new();$start.FileName=Join-Path $HOME '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
  $start.WorkingDirectory=Split-Path -Parent $PSScriptRoot;$start.UseShellExecute=$false;$start.CreateNoWindow=$true
  $start.RedirectStandardInput=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true;$start.Environment.Clear()
  foreach($name in @('PATH','PATHEXT','COMSPEC','SystemRoot','WINDIR','SystemDrive','ProgramData','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP')){$value=[Environment]::GetEnvironmentVariable($name);if($value){$start.Environment[$name]=$value}}
  $start.Environment['WINESNAP_OWNED_QUALITY_PIPE']='1'
  $start.ArgumentList.Add('--import');$start.ArgumentList.Add('tsx');$start.ArgumentList.Add((Join-Path $PSScriptRoot 'check-owned-ai-quality.ts'))
  $process=[Diagnostics.Process]::Start($start);$job.Assign($process.Handle)
  $out=$process.StandardOutput.ReadToEndAsync();$err=$process.StandardError.ReadToEndAsync()
  $process.StandardInput.Write($payload);$process.StandardInput.Close();$payload=$null
  if(-not $process.WaitForExit(900000)){throw 'Quality evaluation timed out.'}
  if(-not [Threading.Tasks.Task]::WaitAll([Threading.Tasks.Task[]]@($out,$err),10000)){throw 'Quality output did not close.'}
  $raw=$out.GetAwaiter().GetResult();$err.GetAwaiter().GetResult()|Out-Null
  if(-not $raw -or $raw.Length -gt 128KB){throw 'Unexpected quality output.'}
  $result=$raw|ConvertFrom-Json
  if($result.suite -ne 'winesnap-ai-quality-live-v1' -or $result.project -ne 'winesnap-owned-local' -or $result.productionTouched -ne $false -or $result.configurationChanged -ne $false){throw 'Unexpected quality scope.'}
  $report=$result
}catch{$report.completed=$false;$report.failure='owned_ai_quality_incomplete'}
finally{
  if($keys){$keys.Clear()};$payload=$null
  if($provider){foreach($slot in @('OpenAI','Gemini')){if($provider.$slot -is [pscredential]){$provider.$slot.Password.Dispose()}}}
  $provider=$null;$credential=$null
  if($job){$job.Dispose()};if($process){$process.Dispose()};if($start){$start.Environment.Clear()};if($lock){$lock.Dispose()}
}
$report|ConvertTo-Json -Depth 12
if(-not $report.completed){exit 1}
