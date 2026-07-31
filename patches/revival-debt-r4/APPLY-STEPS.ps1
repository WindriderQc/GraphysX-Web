param(
  [Parameter(Mandatory = $true)]
  [string]$RepositoryPath
)

$ErrorActionPreference = "Stop"
$expectedBase = "26256437dafd939cfdd6d1f39b3d0f9189c5c979"
$expectedTree = "e75f24de7378439dc7c68929ffcd0be9f25a757d"
$patchNames = @(
  "0001-feat-revival-vendor-TVM-glyph-and-prop-vocabulary.patch",
  "0002-feat-ballz-restore-classic-presets-and-level-binding.patch",
  "0003-feat-revival-restore-Suzanne-machinery-course.patch",
  "0004-docs-revival-reconcile-archive-debt-ledgers.patch"
)

$patchRoot = $PSScriptRoot
$resolvedRepository = (Resolve-Path -LiteralPath $RepositoryPath).Path
Set-Location -LiteralPath $resolvedRepository

if (git status --porcelain) {
  throw "The target repository must be clean before applying revival-debt-r4."
}

$currentHead = git rev-parse HEAD
if ($LASTEXITCODE -ne 0 -or $currentHead -ne $expectedBase) {
  throw "revival-debt-r4 requires baseline $expectedBase; found $currentHead."
}

foreach ($patchName in $patchNames) {
  git am --3way (Join-Path $patchRoot $patchName)
  if ($LASTEXITCODE -ne 0) {
    git am --abort
    throw "Failed to apply $patchName. The interrupted git am was aborted."
  }
}

$actualTree = git rev-parse 'HEAD^{tree}'
if ($LASTEXITCODE -ne 0 -or $actualTree -ne $expectedTree) {
  throw "Unexpected result tree: expected $expectedTree; found $actualTree."
}

Write-Output "revival-debt-r4 applied successfully; tree $actualTree"
