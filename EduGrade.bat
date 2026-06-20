@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   EduGrade AI - 啟動中（請勿關閉此視窗）
echo   伺服器就緒後會自動開啟瀏覽器
echo   要停止：關閉此視窗，或按 Ctrl+C
echo ============================================
node scripts\launch.mjs
pause
