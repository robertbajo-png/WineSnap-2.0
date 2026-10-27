function Get-OwnedRuntimeDirectory {
  return (Join-Path ([Environment]::GetFolderPath('UserProfile')) 'WineSnapOwned')
}
function Open-OwnedRuntimeLock([ValidateSet('operation','session','supervisor')][string]$Name,[int]$WaitMs=0) {
  $directory=Assert-OwnedRuntimeDirectory
  $path=Join-Path $directory ($Name+'.lock')
  if(Test-Path -LiteralPath $path){
    $item=Get-Item -LiteralPath $path -Force
    if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Redirected operation lock refused.'}
  }
  $deadline=[DateTimeOffset]::UtcNow.AddMilliseconds($WaitMs)
  do {
    try{return [IO.File]::Open($path,[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)}
    catch [IO.IOException] {
      if(($_.Exception.HResult -band 0xffff) -notin @(32,33)){throw}
      if([DateTimeOffset]::UtcNow -ge $deadline){return $null}
      Start-Sleep -Milliseconds 200
    }
  }while($true)
}
function Test-OwnedDockerEngine {
  Initialize-OwnedProcessJob
  $job=[WineSnapOwned.ProcessJob]::new();$process=$null
  try {
    $start=[Diagnostics.ProcessStartInfo]::new()
    $start.FileName=Join-Path $env:LOCALAPPDATA 'Programs/DockerDesktop/resources/bin/docker.exe'
    $start.UseShellExecute=$false;$start.CreateNoWindow=$true
    $start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
    foreach($arg in @('--host','npipe:////./pipe/dockerDesktopLinuxEngine','version','--format','{{.Server.Os}}')){$start.ArgumentList.Add($arg)}
    $process=[Diagnostics.Process]::Start($start)
    try{$job.Assign($process.Handle)}catch{if(-not $process.HasExited){throw}}
    $output=$process.StandardOutput.ReadToEndAsync();$errors=$process.StandardError.ReadToEndAsync()
    if(-not $process.WaitForExit(10000)){return $false}
    if(-not [Threading.Tasks.Task]::WaitAll([Threading.Tasks.Task[]]@($output,$errors),5000)){return $false}
    $value=$output.GetAwaiter().GetResult();$errors.GetAwaiter().GetResult()|Out-Null
    return ($process.ExitCode -eq 0 -and $value.Trim() -eq 'linux')
  } catch { return $false } finally {$job.Dispose();if($process){$process.Dispose()}}
}
function Invoke-OwnedRuntimeAction([ValidateSet('Resume','Verify','Maintain','Backup')][string]$Action) {
  Initialize-OwnedProcessJob
  $job=[WineSnapOwned.ProcessJob]::new()
  $process=$null
  try {
    $start=[Diagnostics.ProcessStartInfo]::new()
    $start.FileName=(Get-Process -Id $PID).Path
    $start.UseShellExecute=$false;$start.CreateNoWindow=$true
    $start.RedirectStandardInput=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
    $start.Environment.Clear()
    foreach($key in @('PATH','PATHEXT','COMSPEC','SystemRoot','WINDIR','SystemDrive','ProgramData','ALLUSERSPROFILE','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP')){
      $value=[Environment]::GetEnvironmentVariable($key);if($value){$start.Environment[$key]=$value}
    }
    foreach($arg in @('-NoProfile','-NonInteractive','-File',(Join-Path (Split-Path -Parent $PSScriptRoot) 'invoke-owned-runtime-action.ps1'),'-Action',$Action)){$start.ArgumentList.Add($arg)}
    $process=[Diagnostics.Process]::Start($start)
    $job.Assign($process.Handle)
    $output=$process.StandardOutput.ReadToEndAsync();$errors=$process.StandardError.ReadToEndAsync()
    # No operation can start before the kill-on-close job owns its process tree.
    $process.StandardInput.WriteLine('WineSnap-owned-supervisor-v1');$process.StandardInput.Close()
    $limit=@{Resume=300000;Verify=180000;Maintain=600000;Backup=1200000}[$Action]
    if(-not $process.WaitForExit($limit)){throw [TimeoutException]::new('Owned supervisor child timed out.')}
    if(-not [Threading.Tasks.Task]::WaitAll([Threading.Tasks.Task[]]@($output,$errors),5000)){throw [TimeoutException]::new('Owned child output did not close.')}
    $raw=$output.GetAwaiter().GetResult();$errors.GetAwaiter().GetResult() | Out-Null
    if(-not $raw -or $raw.Length -gt 64KB){throw 'Unexpected owned child report.'}
    $result=$raw | ConvertFrom-Json
    if($result.project -ne 'winesnap-owned-local'){throw 'Unexpected owned report scope.'}
    return $result
  } finally {$job.Dispose();if($process){$process.Dispose()}}
}
function Initialize-OwnedProcessJob {
  if('WineSnapOwned.ProcessJob' -as [type]){return}
  $source=@'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
namespace WineSnapOwned {
  public sealed class ProcessJob : IDisposable {
    [StructLayout(LayoutKind.Sequential)] struct Basic {
      public long ProcessTime, JobTime; public uint Flags;
      public UIntPtr MinWorking, MaxWorking; public uint ActiveProcesses;
      public UIntPtr Affinity; public uint Priority, Scheduling;
    }
    [StructLayout(LayoutKind.Sequential)] struct Io {
      public ulong ReadOps, WriteOps, OtherOps, ReadBytes, WriteBytes, OtherBytes;
    }
    [StructLayout(LayoutKind.Sequential)] struct Limits {
      public Basic Basic; public Io Io; public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
    }
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr security,string name);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int kind,ref Limits limits,uint size);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    IntPtr handle;
    public ProcessJob() {
      handle=CreateJobObject(IntPtr.Zero,null);
      if(handle==IntPtr.Zero) throw new Win32Exception();
      var limits=new Limits(); limits.Basic.Flags=0x2000;
      if(!SetInformationJobObject(handle,9,ref limits,(uint)Marshal.SizeOf<Limits>())) {
        int error=Marshal.GetLastWin32Error();CloseHandle(handle);handle=IntPtr.Zero;throw new Win32Exception(error);
      }
    }
    public void Assign(IntPtr process) {
      if(!AssignProcessToJobObject(handle,process)) throw new Win32Exception();
    }
    public void Dispose() {
      if(handle!=IntPtr.Zero){CloseHandle(handle);handle=IntPtr.Zero;}
    }
  }
}
'@
  Import-OwnedNativeHelper -Kind process-job -Source $source
}
function Get-OwnedNativeHelperPath([ValidateSet('process-job','power')][string]$Kind,[string]$Source) {
  $directory=Assert-OwnedRuntimeDirectory
  $native=Join-Path $directory 'native'
  if(Test-Path -LiteralPath $native){
    $item=Get-Item -LiteralPath $native -Force
    if(-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Redirected native runtime refused.'}
  }
  $normalized=$Source.Replace("`r`n","`n")+"`nCLR="+[Environment]::Version.Major
  $hash=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($normalized))).ToLowerInvariant()
  return (Join-Path $native ($Kind+'-'+$hash+'.dll'))
}
function Import-OwnedNativeHelper([ValidateSet('process-job','power')][string]$Kind,[string]$Source) {
  $path=Get-OwnedNativeHelperPath $Kind $Source
  foreach($file in @($path,($path+'.sha256'))){
    $item=Get-Item -LiteralPath $file -Force
    if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $item.Length -gt 256KB){throw 'Unsafe compiled helper.'}
  }
  $expected=[IO.File]::ReadAllText($path+'.sha256').Trim()
  if($expected -notmatch '^[a-f0-9]{64}$' -or (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected){throw 'Compiled helper verification failed.'}
  Add-Type -Path $path
}
function Install-OwnedNativeHelpers {
  $file=Join-Path $PSScriptRoot 'owned-windows-runtime.ps1'
  $tokens=$null;$errors=$null
  $ast=[Management.Automation.Language.Parser]::ParseFile($file,[ref]$tokens,[ref]$errors)
  if($errors.Count){throw 'Native helper source failed to parse.'}
  foreach($entry in @(@{Name='Initialize-OwnedProcessJob';Kind='process-job'},@{Name='Initialize-OwnedPowerProtection';Kind='power'})){
    $functions=@($ast.FindAll({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $entry.Name},$true))
    if($functions.Count -ne 1){throw 'Unexpected native source function.'}
    $strings=@($functions[0].Body.FindAll({param($n)$n -is [Management.Automation.Language.StringConstantExpressionAst] -and $n.StringConstantType -eq 'SingleQuotedHereString'},$true))
    if($strings.Count -ne 1){throw 'Unexpected native source payload.'}
    $source=$strings[0].Value
    $path=Get-OwnedNativeHelperPath $entry.Kind $source
    $directory=Split-Path -Parent $path
    if(-not (Test-Path -LiteralPath $directory)){New-Item -ItemType Directory -Path $directory|Out-Null}
    if(Test-Path -LiteralPath $path){Import-OwnedNativeHelper $entry.Kind $source;continue}
    $pending=Join-Path $directory ('pending-'+[guid]::NewGuid().ToString('N')+'.dll')
    Add-Type -TypeDefinition $source -OutputAssembly $pending -OutputType Library
    $hash=(Get-FileHash -LiteralPath $pending -Algorithm SHA256).Hash.ToLowerInvariant()
    Move-Item -LiteralPath $pending -Destination $path
    [IO.File]::WriteAllText($path+'.sha256',$hash,[Text.UTF8Encoding]::new($false))
    Import-OwnedNativeHelper $entry.Kind $source
  }
}
function Assert-OwnedRuntimeDirectory {
  $directory=Get-OwnedRuntimeDirectory
  $item=Get-Item -LiteralPath $directory -Force
  if(-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Private owned runtime directory required.'}
  $acl=Get-Acl -LiteralPath $directory
  $owner=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  if(-not $acl.AreAccessRulesProtected){throw 'Private runtime permissions required.'}
  foreach($rule in $acl.Access){
    $sid=$rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
    if($rule.AccessControlType -eq 'Allow' -and $sid -notin @($owner,'S-1-5-18')){throw 'Runtime directory is readable by another account.'}
  }
  return $directory
}
function Read-OwnedJobStatus([string]$Name) {
  if($Name -notin @('maintain','backup')){throw 'Unexpected owned job.'}
  $directory=Assert-OwnedRuntimeDirectory
  $path=Join-Path $directory ($Name+'-status.json')
  if(-not (Test-Path -LiteralPath $path)){return $null}
  $item=Get-Item -LiteralPath $path -Force
  if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $item.Length -gt 64KB){throw 'Unsafe job report.'}
  try{
    $last=Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
    if($last.project -ne 'winesnap-owned-local' -or -not $last.checkedAt -or [DateTimeOffset]$last.checkedAt -gt [DateTimeOffset]::UtcNow.AddMinutes(5)){return $null}
    return $last
  }catch{return $null}
}
function Write-OwnedRuntimeStatus($State,[ValidateSet('watch','startup')][string]$Kind='watch') {
  $directory=Assert-OwnedRuntimeDirectory
  foreach($name in @(($Kind+'-status.json'),($Kind+'-status.pending.json'))){
    $path=Join-Path $directory $name
    if(Test-Path -LiteralPath $path){
      $item=Get-Item -LiteralPath $path -Force
      if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Redirected watch report refused.'}
    }
  }
  $pending=Join-Path $directory ($Kind+'-status.pending.json')
  $State | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $pending -Encoding utf8
  Move-Item -LiteralPath $pending -Destination (Join-Path $directory ($Kind+'-status.json')) -Force
}
function Initialize-OwnedPowerProtection {
  if('WineSnapOwned.HostingPower' -as [type]){return}
  $source=@'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
namespace WineSnapOwned {
  public sealed class HostingPower : IDisposable {
    [StructLayout(LayoutKind.Sequential)] struct Reason { public uint Version, Flags; public IntPtr Text; }
    [StructLayout(LayoutKind.Sequential)] struct PowerStatus {
      public byte AC, Battery, Percent, Reserved; public uint Life, FullLife;
    }
    [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr PowerCreateRequest(ref Reason reason);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool PowerSetRequest(IntPtr handle, int type);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool PowerClearRequest(IntPtr handle, int type);
    [DllImport("kernel32.dll")] static extern bool GetSystemPowerStatus(out PowerStatus status);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    IntPtr handle; public bool Active { get; private set; }
    public HostingPower() {
      var text=Marshal.StringToHGlobalUni("WineSnap local hosting while connected to AC power");
      try {
        var reason=new Reason { Version=0, Flags=1, Text=text };
        handle=PowerCreateRequest(ref reason);
        if(handle==IntPtr.Zero || handle==new IntPtr(-1)) throw new Win32Exception();
      } finally { Marshal.FreeHGlobal(text); }
    }
    public bool Update(bool healthy) {
      PowerStatus status;
      bool wanted=healthy && GetSystemPowerStatus(out status) && status.AC==1;
      if(wanted!=Active) {
        bool ok=wanted ? PowerSetRequest(handle,1) : PowerClearRequest(handle,1);
        if(!ok) throw new Win32Exception();
        Active=wanted;
      }
      return Active;
    }
    public void Dispose() {
      if(handle==IntPtr.Zero) return;
      if(Active) PowerClearRequest(handle,1);
      CloseHandle(handle); handle=IntPtr.Zero; Active=false;
    }
  }
}
'@
  Import-OwnedNativeHelper -Kind power -Source $source
}
