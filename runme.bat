@echo off
setlocal
cd /d "%~dp0"

echo ==========================================
echo  Rugby Management
echo ==========================================
echo.

REM Make sure Node is on PATH. New shells should already have it,
REM but if Node was installed after this shell started, fall back
REM to the default install location.
where node >nul 2>nul
if errorlevel 1 (
    if exist "%ProgramFiles%\nodejs\node.exe" (
        set "PATH=%ProgramFiles%\nodejs;%PATH%"
    ) else if exist "%ProgramFiles(x86)%\nodejs\node.exe" (
        set "PATH=%ProgramFiles(x86)%\nodejs;%PATH%"
    ) else if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" (
        set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
    ) else (
        echo ERROR: node.js not found.
        echo Install Node 20+ from https://nodejs.org and re-run.
        pause
        exit /b 1
    )
)

for /f "tokens=*" %%v in ('node --version') do set NODE_VERSION=%%v
echo Using Node %NODE_VERSION%

REM Make sure npm global bin (where claude.cmd lives) is on PATH
if exist "%APPDATA%\npm\claude.cmd" (
    set "PATH=%APPDATA%\npm;%PATH%"
    echo Claude CLI found at %APPDATA%\npm\claude.cmd
) else (
    echo NOTE: Claude CLI not installed. Match Report will not work.
    echo Install with: npm install -g @anthropic-ai/claude-code
)
echo.

if not exist "node_modules" (
    echo Installing dependencies ^(first run only^)...
    call npm install
    if errorlevel 1 (
        echo npm install failed.
        pause
        exit /b 1
    )
    echo.
)

echo Starting server on http://localhost:3001
echo Press Ctrl+C in this window to stop.
echo.

start "" "http://localhost:3001"
call npm run dev

endlocal
