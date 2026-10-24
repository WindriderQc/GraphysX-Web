<#
.SYNOPSIS
  GamX launcher for Cyber Race 1992 (installed by scripts/install-cyber-race-gamx.mjs).

.DESCRIPTION
  Verifies the channel's page against its receipt (channel.json), then opens it in an Edge app
  window, fullscreen, with the channel's own profile, and waits until the window closes so
  Playnite tracks the session. Channels: Atelier (development) and Validee (owner-approved).

.EXAMPLE
  powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File Start-CyberRace.ps1 -Channel Atelier
#>
param(
  [ValidateSet("Atelier", "Validee")]
  [string]$Channel = "Atelier",
  [switch]$CheckOnly
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$dir = Join-Path $root $Channel
$page = Join-Path $dir "cyber-race.html"
$receipt = Join-Path $dir "channel.json"

if (-not (Test-Path $page) -or -not (Test-Path $receipt)) {
  throw "Cyber Race $Channel is not installed in $dir"
}
$expected = (Get-Content $receipt -Raw | ConvertFrom-Json).sha256
$actual = (Get-FileHash -Algorithm SHA256 $page).Hash.ToLowerInvariant()
if ($expected -ne $actual) {
  throw "Cyber Race $Channel page does not match its receipt (expected $expected, found $actual)"
}

$edge = Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { $edge = Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe" }
if (-not (Test-Path $edge)) { throw "Microsoft Edge was not found" }

if ($CheckOnly) {
  "Cyber Race $Channel OK: $actual"
  exit 0
}

$url = "file:///" + ($page -replace "\\", "/")
$profileDir = Join-Path $dir "profile"
$edgeArgs = @(
  "--app=`"$url`"",
  "--start-fullscreen",
  "--user-data-dir=`"$profileDir`"",
  "--autoplay-policy=no-user-gesture-required",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-features=Translate",
  "--disable-pinch",
  "--overscroll-history-navigation=0"
)
# A private profile keeps this Edge process alive until the game window closes.
Start-Process -FilePath $edge -ArgumentList $edgeArgs -WorkingDirectory $dir -Wait
