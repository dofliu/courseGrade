@echo off
cd /d "%~dp0"
echo ============================================
echo   EduGrade AI - starting (keep this window open)
echo   Browser opens automatically when ready.
echo   To stop: close this window or press Ctrl+C
echo ============================================
node scripts/launch.mjs
pause
