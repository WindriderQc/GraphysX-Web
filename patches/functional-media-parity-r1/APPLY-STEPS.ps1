[CmdletBinding()]
param(
  [string]$RepositoryPath = (Join-Path $PSScriptRoot "..\..")
)

$ErrorActionPreference = "Stop"
$graphysxRepo = (Resolve-Path -LiteralPath $RepositoryPath).Path
$graphysxExpectedBaseline = "2ff08fad1a2ee006dee240fe0cc557bf7e2fa157"
$graphysxExpectedTree = "89b009dd5927b9cb36dc7fd883ccdd4df7a25e8b"
$graphysxActualBaseline = (& git -C $graphysxRepo rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw "Not a readable Git repository: $graphysxRepo" }
if ($graphysxActualBaseline -ne $graphysxExpectedBaseline) { throw "Expected baseline $graphysxExpectedBaseline, found $graphysxActualBaseline" }
$graphysxTrackedStatus = & git -C $graphysxRepo status --porcelain --untracked-files=no
if ($LASTEXITCODE -ne 0) { throw "Could not inspect repository status: $graphysxRepo" }
if ($graphysxTrackedStatus) { throw "Tracked changes are present; commit or stash them before applying this series." }

& git -C $graphysxRepo am -- "$PSScriptRoot\0001-audit-establish-archive-parity-census.patch"
if ($LASTEXITCODE -ne 0) { throw "Patch 0001 failed. Resolve it or run: git -C `"$graphysxRepo`" am --abort" }
& git -C $graphysxRepo am -- "$PSScriptRoot\0002-feat-physics-add-serializable-scene-joints.patch"
if ($LASTEXITCODE -ne 0) { throw "Patch 0002 failed. Resolve it or run: git -C `"$graphysxRepo`" am --abort" }
& git -C $graphysxRepo am -- "$PSScriptRoot\0003-feat-media-restore-authored-BallZ18-clear-sky.patch"
if ($LASTEXITCODE -ne 0) { throw "Patch 0003 failed. Resolve it or run: git -C `"$graphysxRepo`" am --abort" }
& git -C $graphysxRepo am -- "$PSScriptRoot\0004-feat-compat-add-warning-first-SceneNET-export.patch"
if ($LASTEXITCODE -ne 0) { throw "Patch 0004 failed. Resolve it or run: git -C `"$graphysxRepo`" am --abort" }
& git -C $graphysxRepo am -- "$PSScriptRoot\0005-docs-reconcile-archive-revival-status.patch"
if ($LASTEXITCODE -ne 0) { throw "Patch 0005 failed. Resolve it or run: git -C `"$graphysxRepo`" am --abort" }

$graphysxActualTree = (& git -C $graphysxRepo rev-parse "HEAD^{tree}").Trim()
if ($LASTEXITCODE -ne 0) { throw "Could not read the applied tree." }
if ($graphysxActualTree -ne $graphysxExpectedTree) { throw "Applied series completed but tree verification failed: expected $graphysxExpectedTree, found $graphysxActualTree" }
Write-Host "Applied functional-media-parity-r1 successfully."
Write-Host "Result tree: $graphysxActualTree"
