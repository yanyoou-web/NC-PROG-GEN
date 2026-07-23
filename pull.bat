@echo off
chcp 65001 > nul
setlocal

title NC-PROG-GEN MAIN ブランチ同期

cd /d "%~dp0"

echo ============================================
echo   NC-PROG-GEN  MAIN ブランチ同期ツール
echo ============================================
echo.

where git >nul 2>&1
if errorlevel 1 (
    echo [エラー] Git が見つかりません。
    echo Git for Windows をインストールしてから再実行してください。
    echo.
    goto :keep_open
)

echo 現在の変更状況を確認しています...
echo.
git status
if errorlevel 1 (
    echo.
    echo [エラー] このフォルダの変更状況を確認できませんでした。
    echo pull.bat はリポジトリのルートフォルダに置いて実行してください。
    echo.
    goto :keep_open
)

echo.
echo main ブランチに切り替えています...
git checkout main
if errorlevel 1 (
    echo.
    echo [エラー] main ブランチへの切り替えに失敗しました。
    echo ローカルに未コミットの変更が残っていないか確認してください。
    echo.
    goto :keep_open
)

echo.
echo リモートの最新の変更を取得しています...
echo.
git pull origin main
if errorlevel 1 (
    echo.
    echo ============================================
    echo   同期に失敗しました。上記のメッセージを確認してください。
    echo ============================================
    echo.
    goto :keep_open
)

echo.
echo ============================================
echo   MAIN ブランチとの同期が完了しました。
echo ============================================
echo.

:keep_open
echo このままコマンドを入力できます。
echo 画面を閉じるときは exit と入力してください。
echo.
endlocal
cmd /k
