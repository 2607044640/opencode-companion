Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.Run "node serve.mjs", 0, False
WshShell.Run "powershell -WindowStyle Hidden -Command ""Start-Sleep -Seconds 1; Start-Process msedge.exe -ArgumentList '--app=http://127.0.0.1:5173/'""", 0, False
