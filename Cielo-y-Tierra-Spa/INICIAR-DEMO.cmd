@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Instala Node.js 22 o posterior desde https://nodejs.org/
 pause
 exit /b 1
)
if not exist node_modules (
 call npm.cmd ci --no-audit --no-fund
 if errorlevel 1 exit /b 1
)
echo Abre http://localhost:3000
echo Usuario: demo@localhost
echo Clave: SpaDemo-2026!
call npm.cmd run demo
pause
