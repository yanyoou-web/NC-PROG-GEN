Option Explicit

' ---------------------------------------------------------------------------
' 実装済み
' - 最小化されている画面を、最小化前の大きさに戻して前面に表示する
' - 起動が重なった場合も、同じ画面を複数開かない
' - 新しく開く前にNAS上のgui-v2.htmlを確認する
' - NAS上のgui-v2.htmlが見つからない場合は日本語で案内する
' - 初回起動時に専用アイコン付きのデスクトップショートカットを作成する
' - 通常は760×900px、小さいモニターでは表示可能範囲の90％に縮小して中央へ移動する
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
Dim iconSourcePath

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

Function PercentByte(value)
    PercentByte = "%" & Right("0" & Hex(value), 2)
End Function

Function EncodeUrlPath(value)
    Dim result
    Dim position
    Dim character
    Dim codePoint
    Dim lowCode

    result = ""
    position = 1

    Do While position <= Len(value)
        character = Mid(value, position, 1)
        codePoint = AscW(character)
        If codePoint < 0 Then
            codePoint = codePoint + 65536
        End If

        If codePoint >= 55296 And codePoint <= 56319 And _
            position < Len(value) Then

            lowCode = AscW(Mid(value, position + 1, 1))
            If lowCode < 0 Then
                lowCode = lowCode + 65536
            End If

            If lowCode >= 56320 And lowCode <= 57343 Then
                codePoint = 65536 + _
                    (codePoint - 55296) * 1024 + _
                    (lowCode - 56320)
                position = position + 1
            End If
        End If

        If (codePoint >= 48 And codePoint <= 57) Or _
            (codePoint >= 65 And codePoint <= 90) Or _
            (codePoint >= 97 And codePoint <= 122) Or _
            codePoint = 45 Or codePoint = 46 Or codePoint = 47 Or _
            codePoint = 58 Or codePoint = 95 Or codePoint = 126 Then

            result = result & Chr(codePoint)
        ElseIf codePoint <= 127 Then
            result = result & PercentByte(codePoint)
        ElseIf codePoint <= 2047 Then
            result = result & _
                PercentByte(192 + Int(codePoint / 64)) & _
                PercentByte(128 + (codePoint Mod 64))
        ElseIf codePoint <= 65535 Then
            result = result & _
                PercentByte(224 + Int(codePoint / 4096)) & _
                PercentByte(128 + (Int(codePoint / 64) Mod 64)) & _
                PercentByte(128 + (codePoint Mod 64))
        Else
            result = result & _
                PercentByte(240 + Int(codePoint / 262144)) & _
                PercentByte(128 + (Int(codePoint / 4096) Mod 64)) & _
                PercentByte(128 + (Int(codePoint / 64) Mod 64)) & _
                PercentByte(128 + (codePoint Mod 64))
        End If

        position = position + 1
    Loop

    EncodeUrlPath = result
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
        "$process.Refresh()" & vbCrLf & _
        "$memberDefinition = @'" & vbCrLf & _
        "[System.Runtime.InteropServices.DllImport(""user32.dll"")]" & vbCrLf & _
        "public static extern bool IsIconic(System.IntPtr hWnd);" & vbCrLf & _
        "[System.Runtime.InteropServices.DllImport(""user32.dll"")]" & vbCrLf & _
        "public static extern bool ShowWindowAsync(System.IntPtr hWnd, int nCmdShow);" & vbCrLf & _
        "[System.Runtime.InteropServices.DllImport(""user32.dll"")]" & vbCrLf & _
        "public static extern bool SetForegroundWindow(System.IntPtr hWnd);" & vbCrLf & _
        "[System.Runtime.InteropServices.DllImport(""user32.dll"")]" & vbCrLf & _
        "public static extern bool IsZoomed(System.IntPtr hWnd);" & vbCrLf & _
        "[System.Runtime.InteropServices.StructLayout(" & _
        "System.Runtime.InteropServices.LayoutKind.Sequential)]" & vbCrLf & _
        "public struct RECT { public int Left; public int Top; " & _
        "public int Right; public int Bottom; }" & vbCrLf & _
        "[System.Runtime.InteropServices.StructLayout(" & _
        "System.Runtime.InteropServices.LayoutKind.Sequential)]" & vbCrLf & _
        "public struct MONITORINFO { public int cbSize; public RECT rcMonitor; " & _
        "public RECT rcWork; public int dwFlags; }" & vbCrLf & _
        "[System.Runtime.InteropServices.DllImport(""user32.dll"")]" & vbCrLf & _
        "public static extern System.IntPtr MonitorFromWindow(" & _
        "System.IntPtr hWnd, uint dwFlags);" & vbCrLf & _
        "[System.Runtime.InteropServices.DllImport(""user32.dll"", " & _
        "CharSet=System.Runtime.InteropServices.CharSet.Auto)]" & vbCrLf & _
        "public static extern bool GetMonitorInfo(" & _
        "System.IntPtr hMonitor, ref MONITORINFO lpmi);" & vbCrLf & _
        "[System.Runtime.InteropServices.DllImport(""user32.dll"")]" & vbCrLf & _
        "public static extern bool SetWindowPos(System.IntPtr hWnd, " & _
        "System.IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, " & _
        "uint uFlags);" & vbCrLf & _
        "'@" & vbCrLf & _
        "Add-Type -Name NativeMethods -Namespace Launcher " & _
        "-MemberDefinition $memberDefinition" & vbCrLf & _
        "$windowHandle = $process.MainWindowHandle" & vbCrLf & _
        "if ([Launcher.NativeMethods]::IsIconic($windowHandle) -or " & _
        "[Launcher.NativeMethods]::IsZoomed($windowHandle)) {" & vbCrLf & _
        "    [void][Launcher.NativeMethods]::ShowWindowAsync($windowHandle, 9)" & vbCrLf & _
        "    Start-Sleep -Milliseconds 100" & vbCrLf & _
        "}" & vbCrLf & _
        "$monitorInfo = New-Object 'Launcher.NativeMethods+MONITORINFO'" & vbCrLf & _
        "$monitorInfo.cbSize = " & _
        "[System.Runtime.InteropServices.Marshal]::SizeOf($monitorInfo)" & vbCrLf & _
        "$monitor = [Launcher.NativeMethods]::MonitorFromWindow(" & _
        "$windowHandle, 2)" & vbCrLf & _
        "if ([Launcher.NativeMethods]::GetMonitorInfo(" & _
        "$monitor, [ref]$monitorInfo)) {" & vbCrLf & _
        "    $workWidth = $monitorInfo.rcWork.Right - " & _
        "$monitorInfo.rcWork.Left" & vbCrLf & _
        "    $workHeight = $monitorInfo.rcWork.Bottom - " & _
        "$monitorInfo.rcWork.Top" & vbCrLf & _
        "    $targetWidth = [Math]::Min(760, [int]($workWidth * 0.90))" & vbCrLf & _
        "    $targetHeight = [Math]::Min(900, [int]($workHeight * 0.90))" & vbCrLf & _
        "    $centerX = $monitorInfo.rcWork.Left + " & _
        "[int](($workWidth - $targetWidth) / 2)" & vbCrLf & _
        "    $centerY = $monitorInfo.rcWork.Top + " & _
        "[int](($workHeight - $targetHeight) / 2)" & vbCrLf & _
        "    [void][Launcher.NativeMethods]::SetWindowPos(" & _
        "$windowHandle, [System.IntPtr]::Zero, $centerX, $centerY, " & _
        "$targetWidth, $targetHeight, 68)" & vbCrLf & _
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

Function CreateShortcutIcon(sourcePngPath, destinationIconPath)
    Dim tempFolder
    Dim tempPsPath
    Dim psFile
    Dim psScript
    Dim command
    Dim exitCode

    CreateShortcutIcon = False

    If Not fso.FileExists(sourcePngPath) Then
        Exit Function
    End If

    tempFolder = shell.ExpandEnvironmentStrings("%TEMP%")
    tempPsPath = fso.BuildPath(tempFolder, fso.GetTempName & ".ps1")

    psScript = _
        "param([string]$SourcePng, [string]$DestinationIco)" & vbCrLf & _
        "Add-Type -AssemblyName System.Drawing" & vbCrLf & _
        "$bitmap = [System.Drawing.Bitmap]::FromFile($SourcePng)" & vbCrLf & _
        "try {" & vbCrLf & _
        "    $icon = [System.Drawing.Icon]::FromHandle($bitmap.GetHicon())" & vbCrLf & _
        "    try {" & vbCrLf & _
        "        $stream = [System.IO.File]::Open(" & _
        "$DestinationIco, [System.IO.FileMode]::Create)" & vbCrLf & _
        "        try { $icon.Save($stream) } finally { $stream.Dispose() }" & vbCrLf & _
        "    } finally { $icon.Dispose() }" & vbCrLf & _
        "} finally { $bitmap.Dispose() }" & vbCrLf & _
        "if (Test-Path -LiteralPath $DestinationIco) { exit 0 }" & vbCrLf & _
        "exit 1"

    On Error Resume Next
    Set psFile = fso.CreateTextFile(tempPsPath, True, False)

    If Err.Number = 0 Then
        psFile.Write psScript
        psFile.Close

        command = "powershell.exe -NoProfile -NonInteractive " & _
                  "-ExecutionPolicy Bypass -WindowStyle Hidden -File """ & _
                  tempPsPath & """ """ & sourcePngPath & """ """ & _
                  destinationIconPath & """"
        exitCode = shell.Run(command, 0, True)

        If Err.Number = 0 And exitCode = 0 And _
           fso.FileExists(destinationIconPath) Then
            CreateShortcutIcon = True
        End If
    End If

    Err.Clear
    If fso.FileExists(tempPsPath) Then
        fso.DeleteFile tempPsPath, True
    End If
    On Error GoTo 0
End Function

Sub EnsureDesktopShortcut(scriptPath, workingFolder, sourcePngPath, edgeExecutable)
    Dim desktopFolder
    Dim shortcutPath
    Dim iconFolder
    Dim iconPath
    Dim launcher
    Dim wscriptPath

    On Error Resume Next

    desktopFolder = shell.SpecialFolders("Desktop")
    shortcutPath = fso.BuildPath(desktopFolder, appTitle & ".lnk")

    ' Keep an existing shortcut exactly as the user configured it.
    If fso.FileExists(shortcutPath) Then
        On Error GoTo 0
        Exit Sub
    End If

    iconFolder = fso.BuildPath( _
        shell.ExpandEnvironmentStrings("%LOCALAPPDATA%"), "NC-PROG-GEN")

    If Not fso.FolderExists(iconFolder) Then
        fso.CreateFolder iconFolder
    End If

    iconPath = fso.BuildPath(iconFolder, "NC-PROG-GEN.ico")

    If Not fso.FileExists(iconPath) Then
        CreateShortcutIcon sourcePngPath, iconPath
    End If

    wscriptPath = fso.BuildPath( _
        shell.ExpandEnvironmentStrings("%SystemRoot%"), "System32\wscript.exe")

    Set launcher = shell.CreateShortcut(shortcutPath)
    launcher.TargetPath = wscriptPath
    launcher.Arguments = """" & scriptPath & """"
    launcher.WorkingDirectory = workingFolder
    launcher.Description = appTitle

    If fso.FileExists(iconPath) Then
        launcher.IconLocation = iconPath & ",0"
    ElseIf fso.FileExists(edgeExecutable) Then
        launcher.IconLocation = edgeExecutable & ",0"
    End If

    launcher.Save
    On Error GoTo 0
End Sub

appFolder = fso.GetParentFolderName(WScript.ScriptFullName)
edgePath = shell.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & _
           "\Microsoft\Edge\Application\msedge.exe"

If Not fso.FileExists(edgePath) Then
    edgePath = shell.ExpandEnvironmentStrings("%ProgramFiles%") & _
               "\Microsoft\Edge\Application\msedge.exe"
End If

iconSourcePath = fso.BuildPath(appFolder, "assets\icon-192.png")
EnsureDesktopShortcut WScript.ScriptFullName, appFolder, iconSourcePath, edgePath

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
    fileUrl = "file:" & EncodeUrlPath(Replace(htmlPath, "\", "/"))
Else
    fileUrl = "file:///" & EncodeUrlPath(Replace(htmlPath, "\", "/"))
End If

If Not fso.FileExists(edgePath) Then
    ReleaseLaunchLock lockPath
    MsgBox "Microsoft Edge was not found.", _
           vbExclamation, appTitle
    WScript.Quit 1
End If

' Open the HTML file in a dedicated Edge app window.
shell.Run """" & edgePath & """ --app=""" & fileUrl & """", 1, False

' Wait for the new window, then move it to the center as well.
For waitCount = 1 To 6
    WScript.Sleep 1500

    If RestoreExistingEdgeWindow(appTitle) Then
        shell.AppActivate appTitle
        Exit For
    End If
Next

ReleaseLaunchLock lockPath
