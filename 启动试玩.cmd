@echo off
cd /d "%~dp0"
if not exist node_modules (
  call npm.cmd ci --no-audit --no-fund
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
call npm.cmd run dev -- --port 5173 --strictPort --open
pause
