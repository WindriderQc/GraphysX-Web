@echo off
cd /d "%~dp0"
node scripts\serve-ballsy-loop.mjs --open
if errorlevel 1 pause
