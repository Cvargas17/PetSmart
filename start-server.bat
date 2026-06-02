@echo off
REM Inicia el servidor Node para la integración Arduino.
SETLOCAL ENABLEDELAYEDEXPANSION

echo.
echo === Iniciando servidor PetSmart ===
pause

if "!ARDUINO_PORT!"=="" (
  echo.
  echo Puerto Arduino no configurado.
  echo Ejemplo: COM3, COM4, /dev/ttyUSB0, etc.
  echo.
  set /p ARDUINO_PORT="Ingresa el puerto Arduino (o presiona Enter para modo demo): "
)

echo Instalando dependencias npm...
npm install
if errorlevel 1 (
  echo.
  echo ERROR: Fallo npm install
  pause
  exit /b 1
)

echo Instalacion completada.
pause

if "!ARDUINO_PORT!"=="" (
  echo.
  echo Iniciando en MODO DEMO (sin Arduino)...
  echo La web estara disponible en http://localhost:3000
  set ARDUINO_PORT=DEMO
) else (
  echo.
  echo Usando puerto Arduino: !ARDUINO_PORT!
)

echo.
echo Iniciando servidor...
echo Puerto: !ARDUINO_PORT!
pause
node server.js
pause
