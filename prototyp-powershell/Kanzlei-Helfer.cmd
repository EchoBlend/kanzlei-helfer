@echo off
rem Startet den Kanzlei-Helfer (Browser oeffnet sich). Beenden: das schwarze Fenster schliessen.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0app\server.ps1"
if errorlevel 1 pause
