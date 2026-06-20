@echo off
chcp 65001 >nul
echo 停止 EduGrade 伺服器 (port 3000)...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"
echo 已停止。
timeout /t 2 >nul
