$ErrorActionPreference='Stop'
if(-not $IsWindows){throw 'Windows is required.'}
. (Join-Path $PSScriptRoot 'lib/owned-windows-runtime.ps1')
$directory=Assert-OwnedRuntimeDirectory
$path=Join-Path $directory 'operation.lock'
$item=Get-Item -LiteralPath $path -Force
if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Unexpected operation lock.'}
$held=$false
try{$probe=[IO.File]::Open($path,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None);$probe.Dispose()}
catch [IO.IOException]{if(($_.Exception.HResult -band 0xffff) -notin @(32,33)){throw};$held=$true}
$source=@'
using System;
using System.Runtime.InteropServices;
using System.Text;
namespace WineSnapOwnedLockRead {
  public static class Probe {
    [StructLayout(LayoutKind.Sequential)] public struct UniqueProcess { public uint Id; public System.Runtime.InteropServices.ComTypes.FILETIME Started; }
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct ProcessInfo {
      public UniqueProcess Process;
      [MarshalAs(UnmanagedType.ByValTStr, SizeConst=256)] public string Name;
      [MarshalAs(UnmanagedType.ByValTStr, SizeConst=64)] public string Service;
      public uint Type; public uint Status; public uint Session;
      [MarshalAs(UnmanagedType.Bool)] public bool Restartable;
    }
    [DllImport("rstrtmgr.dll", CharSet=CharSet.Unicode)] static extern int RmStartSession(out uint handle, uint flags, StringBuilder key);
    [DllImport("rstrtmgr.dll", CharSet=CharSet.Unicode)] static extern int RmRegisterResources(uint handle, uint files, string[] names, uint processes, IntPtr apps, uint services, IntPtr serviceNames);
    [DllImport("rstrtmgr.dll")] static extern int RmGetList(uint handle, out uint needed, ref uint count, [In,Out] ProcessInfo[] apps, ref uint reasons);
    [DllImport("rstrtmgr.dll")] static extern int RmEndSession(uint handle);
    public static uint[] Holders(string path) {
      uint handle; int result=RmStartSession(out handle,0,new StringBuilder(33));
      if(result!=0) throw new InvalidOperationException("Lock inspection unavailable.");
      try {
        if(RmRegisterResources(handle,1,new string[]{path},0,IntPtr.Zero,0,IntPtr.Zero)!=0) throw new InvalidOperationException("Resource inspection unavailable.");
        uint needed=0,count=0,reasons=0;
        result=RmGetList(handle,out needed,ref count,null,ref reasons);
        if(result==0) return new uint[0];
        if(result!=234 || needed>64) throw new InvalidOperationException("Lock inspection incomplete.");
        var apps=new ProcessInfo[needed]; count=needed;
        if(RmGetList(handle,out needed,ref count,apps,ref reasons)!=0) throw new InvalidOperationException("Lock owner changed.");
        var ids=new uint[count]; for(int i=0;i<count;i++) ids[i]=apps[i].Process.Id; return ids;
      } finally { RmEndSession(handle); }
    }
  }
}
'@
Add-Type -TypeDefinition $source
$session=(Get-Process -Id $PID).SessionId
$ownerIds=if($held){[WineSnapOwnedLockRead.Probe]::Holders($path)}else{@()}
$owners=@(foreach($ownerId in $ownerIds){
  $process=Get-CimInstance Win32_Process -Filter "ProcessId=$ownerId"
  $kind='unknown';$owned=$false
  if($process -and $process.Name -in @('pwsh.exe','powershell.exe')){
    foreach($script in @('run-owned-windows.ps1','run-owned-ingress.ps1','run-owned-tunnel.ps1','rehearse-owned-recovery.ps1','invoke-owned-runtime-action.ps1')){
      if($process.CommandLine.Contains((Join-Path $PSScriptRoot $script))){$owned=$true;$kind=$script}
    }
  }
  $action='unknown'
  if($owned -and $process.CommandLine -match '(?i)(?:-Action\s+)(Resume|Verify|Maintain|Backup|Update|Install|Start|Stop)(?:\s|"|$)'){$action=$Matches[1]}
  $parent=if($process){Get-CimInstance Win32_Process -Filter "ProcessId=$($process.ParentProcessId)"}else{$null}
  [ordered]@{processId=$ownerId;ownedWrapper=$owned;kind=$kind;action=$action;sameSession=($process.SessionId -eq $session);startedAt=$process.CreationDate;parentExists=[bool]$parent;parentStartedAfterChild=[bool]($parent -and $parent.CreationDate -gt $process.CreationDate)}
})
[ordered]@{project='winesnap-owned-local';readOnly=$true;productionTouched=$false;held=$held;ownerIdentified=($owners.Count -gt 0);owners=$owners;checkedAt=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json -Depth 4
