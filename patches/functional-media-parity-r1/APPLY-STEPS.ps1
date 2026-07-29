[CmdletBinding()]
param(
  [string]$RepositoryPath = (Join-Path $PSScriptRoot "..\..")
)

$ErrorActionPreference = "Stop"
$graphysxRepo = (Resolve-Path -LiteralPath $RepositoryPath).Path
$graphysxExpectedBaseline = "e3ece77c613e0fabeaf88d543efbb1347b4d83c7"
$graphysxExpectedTree = "91e0b0116c3cdb5b3859849e358eaabba7a1c94a"
$graphysxActualBaseline = (& git -C $graphysxRepo rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw "Not a readable Git repository: $graphysxRepo" }
if ($graphysxActualBaseline -ne $graphysxExpectedBaseline) { throw "Expected baseline $graphysxExpectedBaseline, found $graphysxActualBaseline" }
$graphysxTrackedStatus = & git -C $graphysxRepo status --porcelain --untracked-files=no
if ($LASTEXITCODE -ne 0) { throw "Could not inspect repository status: $graphysxRepo" }
$graphysxPackageRelative = [IO.Path]::GetRelativePath($graphysxRepo, $PSScriptRoot).Replace("\", "/")
$graphysxUnexpectedTrackedStatus = @($graphysxTrackedStatus | Where-Object {
  $graphysxChangedPath = $_.Substring(3).Replace("\", "/")
  -not ($graphysxChangedPath -eq $graphysxPackageRelative -or $graphysxChangedPath.StartsWith("$graphysxPackageRelative/"))
})
if ($graphysxUnexpectedTrackedStatus) { throw "Tracked changes outside this patch package are present; commit or stash them before applying this series." }

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
