' 雙擊啟動 EduGrade AI（不開終端機視窗；伺服器就緒後自動開瀏覽器）
' 第一次使用前，請先在此資料夾執行過一次 npm install。
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
proj = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = proj
' 0 = 隱藏視窗、False = 不等待
sh.Run "cmd /c node scripts\launch.mjs", 0, False
