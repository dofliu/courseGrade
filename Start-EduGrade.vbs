' Double-click to start EduGrade AI (no terminal window).
' Run npm install once in this folder before first use.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
proj = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = proj
sh.Run "cmd /c node scripts/launch.mjs", 0, False
