Option Explicit

' ---------------------------------------------------------------------------
' 今後追加できる機能の候補
' - Edge／Chromeを起動時に選択できるようにする
' - Edgeが見つからない場合はChromeで自動起動する
' - 最小化されている画面を元の大きさに戻す
' - 全画面表示や、ブラウザの枠がない専用画面で開く
' - 二重起動の防止をさらに確実にする
' - NASへの接続を確認してから起動する
' - NASが見つからない場合に分かりやすい案内を表示する
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

appTitle = "NC" & _
           ChrW(&H30D7) & ChrW(&H30ED) & ChrW(&H30B0) & _
           ChrW(&H30E9) & ChrW(&H30E0) & ChrW(&H30B8) & _
           ChrW(&H30A7) & ChrW(&H30CD) & ChrW(&H30EC) & _
           ChrW(&H30FC) & ChrW(&H30BF) & ChrW(&H30FC) & " v2"

Set shell = CreateObject("WScript.Shell")

' Focus the existing app window instead of opening another one.
If shell.AppActivate(appTitle) Then
    WScript.Quit 0
End If

Set fso = CreateObject("Scripting.FileSystemObject")
appFolder = fso.GetParentFolderName(WScript.ScriptFullName)
htmlPath = fso.GetAbsolutePathName(fso.BuildPath(appFolder, "gui-v2.html"))

If Not fso.FileExists(htmlPath) Then
    MsgBox "gui-v2.html was not found." & vbCrLf & _
           "Keep this launcher in the same folder as gui-v2.html.", _
           vbExclamation, appTitle
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
    MsgBox "Microsoft Edge was not found.", _
           vbExclamation, appTitle
    WScript.Quit 1
End If

' Open the HTML file in a dedicated Edge app window.
shell.Run """" & edgePath & """ --app=""" & fileUrl & """", 1, False
