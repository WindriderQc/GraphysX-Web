@echo off
cd /d "%~dp0"
node scripts\serve-ballsy-shared-vr.mjs --open
if errorlevel 1 pause
