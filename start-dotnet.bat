@echo off
REM Inicia la aplicación .NET PetSmart.
SETLOCAL
if not exist "PetSmart.csproj" (
  echo No se encontró PetSmart.csproj en este directorio.
  pause
  exit /b 1
)

echo Restaurando paquetes...
dotnet restore
if errorlevel 1 (
  echo Error restaurando paquetes.
  pause
  exit /b 1
)

echo Iniciando la aplicación .NET...
dotnet run
