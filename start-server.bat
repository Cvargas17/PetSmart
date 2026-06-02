@echo off
REM Inicia el servidor Node para la integración Arduino.
SETLOCAL
if "%ARDUINO_PORT%"=="" (
  echo Por favor define ARDUINO_PORT, por ejemplo COM3.
  echo Uso: set ARDUINO_PORT=COM3
  echo Luego ejecuta este archivo de nuevo.
  pause
  exit /b 1
)

npm install
if errorlevel 1 (
  echo Error instalando dependencias.
  pause
  exit /b 1
)

echo Iniciando servidor en http://localhost:3000 ...
node server.js
