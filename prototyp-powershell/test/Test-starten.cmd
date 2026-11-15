@echo off
rem Testmodus ohne DATEV: startet Fake-DATEVconnect mit Testmandanten und den Kanzlei-Helfer. Mails landen als .eml in test\ausgang.
start "Fake-DATEVconnect" powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0fake-datevconnect.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\app\server.ps1" -Test
if errorlevel 1 pause
