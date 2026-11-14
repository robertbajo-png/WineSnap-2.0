param([switch]$ImageOnly,[ValidateRange(1,3)][int]$ImageAttempts=3,[switch]$SolImage)
$ErrorActionPreference='Stop'
if(-not $IsWindows){throw 'PowerShell 7 on Windows is required.'}
if($SolImage){$ImageOnly=$true}
. (Join-Path $PSScriptRoot 'lib/owned-windows-runtime.ps1')
$directory=Assert-OwnedRuntimeDirectory
$lock=$null;$keys=$null;$provider=$null;$process=$null;$start=$null;$job=$null;$payload=$null
$report=[ordered]@{project='winesnap-owned-local';model='gpt-6.1-terra';completed=$false;productionTouched=$false;configurationChanged=$false}
if($SolImage){$report.model='gpt-6.1-sol'}
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
  if($provider.Version -ne 1 -or $provider.Purpose -ne 'WineSnap-local-test' -or $provider.OpenAI -isnot [pscredential] -or $provider.OpenAI.UserName -ne 'OPENAI_API_KEY'){throw 'Existing WineSnap OpenAI credential required.'}
  $keys.openai=$provider.OpenAI.GetNetworkCredential().Password.Trim()
  $payload=$keys|ConvertTo-Json -Compress;$keys.Clear();$keys=$null;$provider=$null
  Initialize-OwnedProcessJob;$job=[WineSnapOwned.ProcessJob]::new()
  $start=[Diagnostics.ProcessStartInfo]::new();$start.FileName=Join-Path $HOME '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
  $start.WorkingDirectory=Split-Path -Parent $PSScriptRoot;$start.UseShellExecute=$false;$start.CreateNoWindow=$true
  $start.RedirectStandardInput=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true;$start.Environment.Clear()
  foreach($name in @('PATH','PATHEXT','COMSPEC','SystemRoot','WINDIR','SystemDrive','ProgramData','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP')){$value=[Environment]::GetEnvironmentVariable($name);if($value){$start.Environment[$name]=$value}}
  $start.Environment['WINESNAP_OWNED_TERRA_PIPE']='1'
  if($ImageOnly){$start.Environment['WINESNAP_OWNED_TERRA_IMAGE_ONLY']='1';$start.Environment['WINESNAP_OWNED_TERRA_IMAGE_ATTEMPTS']=[string]$ImageAttempts}
  if($SolImage){$start.Environment['WINESNAP_OWNED_SOL_IMAGE']='1'}
  $start.ArgumentList.Add('--import');$start.ArgumentList.Add('tsx');$start.ArgumentList.Add((Join-Path $PSScriptRoot 'check-owned-terra.ts'))
  $process=[Diagnostics.Process]::Start($start);$job.Assign($process.Handle)
  $out=$process.StandardOutput.ReadToEndAsync();$err=$process.StandardError.ReadToEndAsync()
  $process.StandardInput.Write($payload);$process.StandardInput.Close();$payload=$null
  if(-not $process.WaitForExit(1800000)){throw 'Evaluation timed out.'}
  if(-not [Threading.Tasks.Task]::WaitAll([Threading.Tasks.Task[]]@($out,$err),10000)){throw 'Evaluation output did not close.'}
  $raw=$out.GetAwaiter().GetResult();$err.GetAwaiter().GetResult()|Out-Null
  if(-not $raw -or $raw.Length -gt 128KB){throw 'Unexpected evaluation output.'}
  $result=$raw|ConvertFrom-Json
  if($result.project -ne 'winesnap-owned-local' -or $result.productionTouched -ne $false -or $result.configurationChanged -ne $false){throw 'Unexpected evaluation result.'}
  $report=$result
}catch{$report.failure='owned_terra_evaluation_incomplete';$report.completed=$false}
finally{if($keys){$keys.Clear()};$payload=$null;$provider=$null;if($lock){$lock.Dispose()};if($job){$job.Dispose()};if($process){$process.Dispose()};if($start){$start.Environment.Clear()}}
$report|ConvertTo-Json -Depth 12
if(-not $report.completed){exit 1}
