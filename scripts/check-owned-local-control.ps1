$ErrorActionPreference='Stop'
if(-not $IsWindows -or $args.Count){throw 'Use PowerShell 7 on Windows without arguments.'}
$report=[ordered]@{synthetic=$true;productionTouched=$false;completed=$false;cleanupCompleted=$false;checks=0}
$directory=$null;$lockHandle=$null;$files=@()
try {
  $tokens=$null;$errors=$null
  $ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'open-owned-local.ps1'),[ref]$tokens,[ref]$errors)
  if($errors.Count){throw 'Local wrapper syntax failed.'}
  $names=@('Assert-LocalPrivateFile','Protect-LocalReport','Read-LocalReport','Test-LocalViewerActive','Get-LocalStatus','Focus-LocalViewer','Resume-LocalBackend')
  $definitions=@($ast.FindAll({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -in $names},$false))
  if($definitions.Count -ne $names.Count){throw 'Unexpected local control functions.'}
  foreach($definition in $definitions){. ([scriptblock]::Create($definition.Extent.Text))}
  $directory=[IO.Path]::GetFullPath((Join-Path ([IO.Path]::GetTempPath()) ('winesnap-local-control-'+[guid]::NewGuid().ToString('N'))))
  $created=[IO.Directory]::CreateDirectory($directory)
  if($created.FullName -cne $directory -or ($created.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Unsafe fixture directory.'}
  $statusFile=Join-Path $directory 'local-view-status.json';$controlFile=Join-Path $directory 'local-view-control.json';$lockPath=Join-Path $directory 'local-view.lock';$files=@($statusFile,$controlFile,$lockPath)
  Protect-LocalReport;Protect-LocalReport $controlFile
  $clock=[DateTimeOffset]::UtcNow
  $value=@{project='winesnap-owned-local';version=2;runId=[guid]::NewGuid().ToString('D');completed=$false;ready=$true;authenticated=$true;viewerRunning=$true;supportsFocus=$true;productionTouched=$false;loopbackOnly=$true;phase='ready';checkedAt=$clock.ToString('o')}
  [IO.File]::WriteAllText($statusFile,($value|ConvertTo-Json))
  $inactive=Get-LocalStatus -Now $clock
  if($inactive.operatorActive -or $inactive.ready -or $inactive.phase -ne 'interrupted'){throw 'Stale readiness was accepted.'};$report.checks++
  $lockHandle=[IO.File]::Open($lockPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
  $before=Get-FileHash -LiteralPath $statusFile
  $active=Get-LocalStatus -Now $clock
  if(-not $active.operatorActive -or -not $active.ready -or -not $active.authenticated -or -not $active.heartbeatFresh){throw 'Active readiness not recognized.'}
  if((Get-FileHash -LiteralPath $statusFile).Hash -ne $before.Hash){throw 'Status modified its input.'};$report.checks++
  $value.checkedAt=$clock.AddMinutes(-1).ToString('o');[IO.File]::WriteAllText($statusFile,($value|ConvertTo-Json))
  $stale=Get-LocalStatus -Now $clock
  if($stale.ready -or $stale.authenticated -or $stale.phase -ne 'unresponsive'){throw 'Expired heartbeat accepted.'};$report.checks++
  foreach($phase in @('signed_out','backend_unavailable')){
    $value.ready=$false;$value.authenticated=$false;$value.phase=$phase
    [IO.File]::WriteAllText($statusFile,($value|ConvertTo-Json))
    $stale=Get-LocalStatus -Now $clock
    if($stale.phase -ne 'unresponsive'){throw 'Stale session state accepted.'}
  };$report.checks++
  $value.version=1;$value.checkedAt=$clock.ToString('o');[IO.File]::WriteAllText($statusFile,($value|ConvertTo-Json))
  $legacy=Get-LocalStatus -Now $clock
  if($legacy.ready -or $legacy.phase -ne 'legacy_viewer'){throw 'Legacy result attested as current.'};$report.checks++
  $script:messages=@();function Show-LocalOpenMessage([string]$Kind){$script:messages+=,$Kind}
  $reply=Focus-LocalViewer
  if($reply.focused -or $script:messages[-1] -ne 'legacy'){throw 'Legacy viewer was replaced.'};$report.checks++
  $script:resumeCalls=@();$script:resumeBusy=$true
  function Invoke-OwnedRuntimeAction([string]$Action){$script:resumeCalls+=,$Action;if($script:resumeBusy){$script:resumeBusy=$false;return @{project='winesnap-owned-local';productionTouched=$false;hostedTestTouched=$false;completed=$false;skipped='operation_already_running'}};return @{project='winesnap-owned-local';productionTouched=$false;hostedTestTouched=$false;completed=$true}}
  Resume-LocalBackend
  if(($script:resumeCalls -join ',') -ne 'Resume,Resume'){throw 'Startup used another action.'};$report.checks++
  function Invoke-OwnedRuntimeAction([string]$Action){return @{project='unexpected';productionTouched=$false;hostedTestTouched=$false;completed=$true}}
  $denied=$false;try{Resume-LocalBackend}catch{$denied=$true};if(-not $denied){throw 'Foreign startup scope accepted.'};$report.checks++
  $report.completed=$true
}catch{$report.failure='synthetic_local_control_not_accepted';$report.errorType=$_.Exception.GetType().Name}
finally{
  if($lockHandle){$lockHandle.Dispose()}
  try{
    foreach($file in $files){if([IO.Path]::GetFullPath($file) -cne (Join-Path $directory ([IO.Path]::GetFileName($file)))){throw 'Unsafe cleanup path.'};if(Test-Path -LiteralPath $file){$item=Get-Item -LiteralPath $file -Force;if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Unexpected fixture item.'};Remove-Item -LiteralPath $file -Force}}
    if($directory){[IO.Directory]::Delete($directory,$false)}
    $report.cleanupCompleted=$true
  }catch{$report.completed=$false}
}
$report|ConvertTo-Json
if(-not $report.completed){exit 1}
