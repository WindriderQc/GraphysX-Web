@echo off
cd /d "%~dp0"
node scripts\play-ballsy-local.mjs
if errorlevel 1 pause
