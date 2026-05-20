Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

appDir = fso.GetParentFolderName(WScript.ScriptFullName)
launcher = appDir & "\ABRIR CANTINA TUFI.bat"

shell.CurrentDirectory = appDir

shell.Run """" & launcher & """", 7, False
