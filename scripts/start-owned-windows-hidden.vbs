Option Explicit

' Hide the console at process creation, before PowerShell or Windows Terminal
' can display it. Wait for the child so Task Scheduler retains supervision.
If WScript.Arguments.Count <> 2 Then WScript.Quit 2

Dim files, shell, runtime, scripts, entry, mode, result
Set files = CreateObject("Scripting.FileSystemObject")
runtime = WScript.Arguments(0)
mode = WScript.Arguments(1)
If InStr(runtime, Chr(34)) > 0 Then WScript.Quit 2
If LCase(files.GetFileName(runtime)) <> "pwsh.exe" Then WScript.Quit 2
If Not files.FileExists(runtime) Then WScript.Quit 2

scripts = files.GetParentFolderName(WScript.ScriptFullName)
Select Case mode
  Case "session"
    entry = files.BuildPath(scripts, "start-owned-windows-session.ps1")
  Case "docker"
    entry = files.BuildPath(scripts, "start-owned-docker-engine.ps1")
  Case Else
    WScript.Quit 2
End Select
If Not files.FileExists(entry) Then WScript.Quit 2

Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = files.GetParentFolderName(scripts)
result = shell.Run(Chr(34) & runtime & Chr(34) & _
  " -NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -File " & _
  Chr(34) & entry & Chr(34), 0, True)
WScript.Quit result
