@echo off
cd /d "%~dp0"
node scripts\serve-vr-lab.mjs
if errorlevel 1 pause
