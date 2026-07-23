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
    pause
    exit /b 1
)

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
    echo [エラー] このフォルダは Git リポジトリではありません。
    echo pull.bat はリポジトリのルートフォルダに置いて実行してください。
    echo.
    pause
    exit /b 1
)

echo main ブランチに切り替えています...
git checkout main
if errorlevel 1 (
    echo.
    echo [エラー] main ブランチへの切り替えに失敗しました。
    echo ローカルに未コミットの変更が残っていないか確認してください。
    echo.
    pause
    exit /b 1
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
    pause
    exit /b 1
)

echo.
echo ============================================
echo   MAIN ブランチとの同期が完了しました。
echo ============================================
echo.
pause
endlocal
exit /b 0