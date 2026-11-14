@echo off
rem Abre el menu local de VTP. Si no hay Node.js, lo instala con winget (cualquier version sirve:
rem el menu descarga Node 24 solo para el proyecto en .tools\).
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo No encuentro Node.js. Lo instalo con winget...
  winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
  if errorlevel 1 (
    echo No se pudo instalar Node.js. Instalalo desde https://nodejs.org y vuelve a abrir este archivo.
    pause
    exit /b 1
  )
  set "PATH=%ProgramFiles%\nodejs;%PATH%"
)
node "%~dp0infrastructure\scripts\menu.mjs" %*
if errorlevel 1 pause
