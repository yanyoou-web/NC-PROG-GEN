Option Explicit

' ---------------------------------------------------------------------------
' 実装済み
' - 最小化されている画面を、最小化前の大きさに戻して前面に表示する
' - 起動が重なった場合も、同じ画面を複数開かない
' - 新しく開く前にNAS上のgui-v2.htmlを確認する
' - NAS上のgui-v2.htmlが見つからない場合は日本語で案内する
'
' 今後追加できる機能の候補
' - Edge／Chromeを起動時に選択できるようにする
' - Edgeが見つからない場合はChromeで自動起動する
' - 全画面表示や、ブラウザの枠がない専用画面で開く
' - 複数のNAS保存場所から本体を自動検索する
' - 起動前にGitHubの最新版を取り込む
' - 更新がある場合だけ確認画面を表示する
' - 起動日時やエラー内容を記録する
' - 設定ファイルでブラウザや表示方法を変更できるようにする
' - 専用アイコン付きのデスクトップショートカットを自動作成する
' - パソコンごとに異なる設定を使い分ける
' - 指定時間操作がなければ画面を閉じる
' - Windows起動時に自動で開く
' - キーボードの特定キーから呼び出せるようにする
' ---------------------------------------------------------------------------

Dim appTitle
Dim shell
Dim fso
Dim appFolder
Dim htmlPath
Dim fileUrl
Dim edgePath
Dim lockPath
Dim hasLaunchLock
Dim waitCount
Dim nasMessage

appTitle = "NC" & _
           ChrW(&H30D7) & ChrW(&H30ED) & ChrW(&H30B0) & _
           ChrW(&H30E9) & ChrW(&H30E0) & ChrW(&H30B8) & _
           ChrW(&H30A7) & ChrW(&H30CD) & ChrW(&H30EC) & _
           ChrW(&H30FC) & ChrW(&H30BF) & ChrW(&H30FC) & " v2"

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

Function UnicodeText(hexValues)
    Dim values
    Dim value
    Dim result

    values = Split(hexValues, " ")
    result = ""

    For Each value In values
        result = result & ChrW(CLng("&H" & value))
    Next

    UnicodeText = result
End Function

Function RestoreExistingEdgeWindow(windowTitle)
    Dim tempFolder
    Dim tempPsPath
    Dim psFile
    Dim psScript
    Dim command
    Dim exitCode

    RestoreExistingEdgeWindow = False
    tempFolder = shell.ExpandEnvironmentStrings("%TEMP%")
    tempPsPath = fso.BuildPath(tempFolder, fso.GetTempName & ".ps1")

    psScript = _
        "param([string]$WindowTitle)" & vbCrLf & _
        "$process = Get-Process msedge -ErrorAction SilentlyContinue | " & _
        "Where-Object { $_.MainWindowTitle.StartsWith($WindowTitle, " & _
        "[System.StringComparison]::OrdinalIgnoreCase) } | " & _
        "Select-Object -First 1" & vbCrLf & _
        "if ($null -eq $process) { exit 1 }" & vbCrLf & _
        "$memberDefinition = @'" & vbCrLf & _
        "[System.Runtime.InteropServices.DllImport(""user32.dll"")]" & vbCrLf & _
        "public static extern bool IsIconic(System.IntPtr hWnd);" & vbCrLf & _
        "[System.Runtime.InteropServices.DllImport(""user32.dll"")]" & vbCrLf & _
        "public static extern bool ShowWindowAsync(System.IntPtr hWnd, int nCmdShow);" & vbCrLf & _
        "[System.Runtime.InteropServices.DllImport(""user32.dll"")]" & vbCrLf & _
        "public static extern bool SetForegroundWindow(System.IntPtr hWnd);" & vbCrLf & _
        "'@" & vbCrLf & _
        "Add-Type -Name NativeMethods -Namespace Launcher " & _
        "-MemberDefinition $memberDefinition" & vbCrLf & _
        "$windowHandle = $process.MainWindowHandle" & vbCrLf & _
        "if ([Launcher.NativeMethods]::IsIconic($windowHandle)) {" & vbCrLf & _
        "    [void][Launcher.NativeMethods]::ShowWindowAsync($windowHandle, 9)" & vbCrLf & _
        "    Start-Sleep -Milliseconds 100" & vbCrLf & _
        "}" & vbCrLf & _
        "[void][Launcher.NativeMethods]::SetForegroundWindow($windowHandle)" & vbCrLf & _
        "exit 0"

    On Error Resume Next
    Set psFile = fso.CreateTextFile(tempPsPath, True, False)

    If Err.Number = 0 Then
        psFile.Write psScript
        psFile.Close

        command = "powershell.exe -NoProfile -NonInteractive " & _
                  "-ExecutionPolicy Bypass -WindowStyle Hidden -File """ & _
                  tempPsPath & """ """ & windowTitle & """"
        exitCode = shell.Run(command, 0, True)

        If Err.Number = 0 And exitCode = 0 Then
            RestoreExistingEdgeWindow = True
        End If
    End If

    Err.Clear
    If fso.FileExists(tempPsPath) Then
        fso.DeleteFile tempPsPath, True
    End If
    On Error GoTo 0
End Function

Function AcquireLaunchLock(folderPath)
    Dim lockFolder

    AcquireLaunchLock = False

    On Error Resume Next
    If fso.FolderExists(folderPath) Then
        Set lockFolder = fso.GetFolder(folderPath)

        If DateDiff("s", lockFolder.DateCreated, Now) > 15 Then
            fso.DeleteFolder folderPath, True
        End If
    End If

    Err.Clear
    fso.CreateFolder folderPath

    If Err.Number = 0 Then
        AcquireLaunchLock = True
    End If
    On Error GoTo 0
End Function

Sub ReleaseLaunchLock(folderPath)
    On Error Resume Next
    If fso.FolderExists(folderPath) Then
        fso.DeleteFolder folderPath, True
    End If
    On Error GoTo 0
End Sub

' Restore and focus an existing Edge app window, including a minimized window.
If RestoreExistingEdgeWindow(appTitle) Then
    shell.AppActivate appTitle
    WScript.Quit 0
End If

lockPath = fso.BuildPath(shell.ExpandEnvironmentStrings("%TEMP%"), _
                         "NC-PROG-GEN-launch.lock")
hasLaunchLock = AcquireLaunchLock(lockPath)

' Another launcher may be waiting for Edge to finish opening.
If Not hasLaunchLock Then
    For waitCount = 1 To 32
        WScript.Sleep 250

        If Not fso.FolderExists(lockPath) Then
            Exit For
        End If
    Next

    If RestoreExistingEdgeWindow(appTitle) Then
        shell.AppActivate appTitle
        WScript.Quit 0
    End If

    hasLaunchLock = AcquireLaunchLock(lockPath)

    If Not hasLaunchLock Then
        WScript.Quit 0
    End If
End If

' Recheck after taking the lock in case the window appeared meanwhile.
If RestoreExistingEdgeWindow(appTitle) Then
    ReleaseLaunchLock lockPath
    shell.AppActivate appTitle
    WScript.Quit 0
End If

appFolder = fso.GetParentFolderName(WScript.ScriptFullName)
htmlPath = fso.GetAbsolutePathName(fso.BuildPath(appFolder, "gui-v2.html"))

If Not fso.FileExists(htmlPath) Then
    ReleaseLaunchLock lockPath

    nasMessage = _
        UnicodeText("4E 41 53 306B 63A5 7D9A 3067 304D 306A 3044 305F 3081 3001 " & _
                    "4E 43 30D7 30ED 30B0 30E9 30E0 3092 8D77 52D5 3067 304D " & _
                    "307E 305B 3093 3002") & vbCrLf & _
        UnicodeText("4E 41 53 304C 8D77 52D5 3057 3066 3044 308B 3053 3068 3068 " & _
                    "3001 30CD 30C3 30C8 30EF 30FC 30AF 63A5 7D9A 3092 78BA 8A8D " & _
                    "3057 3066 304F 3060 3055 3044 3002") & vbCrLf & vbCrLf & _
        UnicodeText("5BFE 8C61 30D5 30A1 30A4 30EB 3A 20") & htmlPath

    MsgBox nasMessage, vbExclamation, appTitle
    WScript.Quit 1
End If

' Support both UNC paths on a NAS and local drive paths.
If Left(htmlPath, 2) = "\\" Then
    fileUrl = "file:" & Replace(htmlPath, "\", "/")
Else
    fileUrl = "file:///" & Replace(htmlPath, "\", "/")
End If

edgePath = shell.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & _
           "\Microsoft\Edge\Application\msedge.exe"

If Not fso.FileExists(edgePath) Then
    edgePath = shell.ExpandEnvironmentStrings("%ProgramFiles%") & _
               "\Microsoft\Edge\Application\msedge.exe"
End If

If Not fso.FileExists(edgePath) Then
    ReleaseLaunchLock lockPath
    MsgBox "Microsoft Edge was not found.", _
           vbExclamation, appTitle
    WScript.Quit 1
End If

' Open the HTML file in a dedicated Edge app window.
shell.Run """" & edgePath & """ --app=""" & fileUrl & """", 1, False

' Keep the lock briefly while Edge creates its window.
WScript.Sleep 4000
ReleaseLaunchLock lockPath
