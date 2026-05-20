@echo off
cd /d "%~dp0"

set "PYTHON_CMD="
set "LOG_DIR=%~dp0dados\logs"
set "LOG_FILE=%LOG_DIR%\erro_cantina.txt"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

echo ===== Cantina TUFI ===== > "%LOG_FILE%"
echo Pasta: %~dp0 >> "%LOG_FILE%"
echo Data: %DATE% %TIME% >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"

for %%P in (
    "C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python314\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python310\python.exe"
    "%PROGRAMFILES%\Python314\python.exe"
    "%PROGRAMFILES%\Python313\python.exe"
    "%PROGRAMFILES%\Python312\python.exe"
    "%PROGRAMFILES%\Python311\python.exe"
    "%PROGRAMFILES%\Python310\python.exe"
) do (
    if exist "%%~P" set "PYTHON_CMD=%%~P"
)

if not defined PYTHON_CMD (
    python --version >nul 2>nul
    if not errorlevel 1 set "PYTHON_CMD=python"
)

if not defined PYTHON_CMD (
    py --version >nul 2>nul
    if not errorlevel 1 set "PYTHON_CMD=py"
)

if not defined PYTHON_CMD (
    echo Python nao encontrado pelo terminal.
    echo Python nao encontrado pelo terminal. >> "%LOG_FILE%"
    echo.
    echo Vou abrir o arquivo no VSCode para voce executar pelo Python configurado la.
    echo.
    where code >nul 2>nul
    if not errorlevel 1 (
        code "%~dp0cantina_pro.py"
    ) else (
        echo Abra esta pasta no VSCode:
        echo %~dp0
        echo.
        echo Depois abra e execute este arquivo:
        echo cantina_pro.py
    )
    pause
    exit /b 1
)

echo Python usado: %PYTHON_CMD%
echo Python usado: %PYTHON_CMD% >> "%LOG_FILE%"

echo Iniciando Cantina TUFI...
%PYTHON_CMD% "%~dp0iniciar_cantina.py"

echo.
echo Se o aplicativo nao abriu, veja o arquivo:
echo %LOG_FILE%

pause
