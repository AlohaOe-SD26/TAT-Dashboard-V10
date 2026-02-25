@echo off
setlocal EnableDelayedExpansion

:: ============================================================
:: CONFIGURATION
:: ============================================================
set "LOGFILE=launcher_log.txt"
title Universal Script Launcher

:MENU_START
cls
echo ============================================================
echo    UNIVERSAL SCRIPT LAUNCHER
echo ============================================================
echo.
echo Scanning for .bat, .py, and .pyw files...
echo.

:: Initialize counter
set "count=0"

:: Loop through files, exclude THIS script, and store in array
for %%f in (*.bat *.py *.pyw) do (
    if /I not "%%f"=="%~nx0" (
        set /a count+=1
        set "file[!count!]=%%f"
        echo [!count!] %%f
    )
)

:: Check if no files were found
if %count%==0 (
    echo No .bat, .py, or .pyw files found in this directory.
    echo.
    pause
    goto :EOF
)

echo.
echo ============================================================
set /p "choice=Select a file number to run (or Q to quit): "

:: Handle Quit
if /I "%choice%"=="Q" goto :EOF

:: Validate Input (Check if numeric and within range)
if %choice% LEQ 0 goto INVALID_INPUT
if %choice% GTR %count% goto INVALID_INPUT

:: Get the filename from the array based on choice
set "selected_file=!file[%choice%]!"

:: ============================================================
:: EXECUTION BLOCK
:: ============================================================
cls
echo ============================================================
echo LAUNCHING: "!selected_file!"
echo TIME: %DATE% %TIME%
echo ============================================================
echo.

:: Log the start attempt
echo [%DATE% %TIME%] STARTING: "!selected_file!" >> "%LOGFILE%"

:: Determine extension to decide how to run it
set "extension=%selected_file:~-4%"
set "extension3=%selected_file:~-3%"

:: Capture the exit code. We initialize it to 0.
set "exit_code=0"

:: ----------------------------------------------------------
:: RUN LOGIC
:: We use 2>&1 to capture Standard Error and print it to screen 
:: and we also append errors to the log file.
:: ----------------------------------------------------------

if /I "%extension%"==".bat" (
    call "!selected_file!" || set "exit_code=1"
) else if /I "%extension3%"==".py" (
    python "!selected_file!" || set "exit_code=1"
) else if /I "%extension%"==".pyw" (
    :: Note: .pyw usually suppresses console, but we run with python 
    :: here to catch errors in this window if requested.
    python "!selected_file!" || set "exit_code=1"
) else (
    echo Unknown file type.
    set "exit_code=999"
)

:: ============================================================
:: ERROR HANDLING & LOGGING
:: ============================================================

if !exit_code! NEQ 0 (
    echo.
    echo ============================================================
    echo [ERROR] The script encountered an error! (Code: !exit_code!)
    echo [INFO]  Check "%LOGFILE%" for history.
    echo ============================================================
    
    :: Log the failure
    echo [%DATE% %TIME%] [ERROR] Failed to run "!selected_file!". Exit Code: !exit_code! >> "%LOGFILE%"
    echo ------------------------------------------------------------ >> "%LOGFILE%"
) else (
    echo.
    echo ============================================================
    echo [SUCCESS] Script finished successfully.
    echo ============================================================
    
    :: Log the success
    echo [%DATE% %TIME%] [SUCCESS] Finished "!selected_file!" >> "%LOGFILE%"
    echo ------------------------------------------------------------ >> "%LOGFILE%"
)

echo.
pause
goto :MENU_START

:INVALID_INPUT
echo.
echo [!] Invalid selection. Please enter a number from the list.
pause
goto :MENU_START