@echo off
cd /d "%~dp0"
node scripts\serve-ballsy-slime.mjs --open
if errorlevel 1 pause
