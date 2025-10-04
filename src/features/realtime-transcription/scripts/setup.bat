@echo off
REM Setup script for real-time transcription feature (Windows)
REM Creates a self-contained Python virtual environment

setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
set "VENV_DIR=%SCRIPT_DIR%venv"

echo 🔧 Setting up Real-Time Transcription environment...

REM Check if Python is available
where python >nul 2>&1
if %ERRORLEVEL% equ 0 (
    set "PYTHON_CMD=python"
) else (
    echo ❌ Python 3.8+ is required but not found.
    echo Please install Python from https://www.python.org/downloads/
    exit /b 1
)

REM Check Python version
for /f "tokens=2" %%V in ('%PYTHON_CMD% --version 2^>^&1') do set "PYTHON_VERSION=%%V"
echo 📍 Found Python %PYTHON_VERSION%

REM Create virtual environment if it doesn't exist
if not exist "%VENV_DIR%" (
    echo 📦 Creating virtual environment...
    %PYTHON_CMD% -m venv "%VENV_DIR%"
    echo ✅ Virtual environment created at %VENV_DIR%
) else (
    echo ✅ Virtual environment already exists
)

REM Activate virtual environment
call "%VENV_DIR%\Scripts\activate.bat"

REM Upgrade pip
echo 📥 Upgrading pip...
pip install --upgrade pip >nul 2>&1

REM Install dependencies
echo 📥 Installing dependencies...
pip install -r "%SCRIPT_DIR%requirements.txt"

echo.
echo ✅ Setup complete!
echo.
echo The transcription feature is now ready to use.
echo Obsidian will automatically use the virtual environment.
echo.
echo To test manually:
echo   %VENV_DIR%\Scripts\activate.bat
echo   python %SCRIPT_DIR%interbrain-transcribe.py --output test.md

endlocal
