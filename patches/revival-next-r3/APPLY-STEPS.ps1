# revival-next-r3 — 7 patches after the existing 5-patch revival-r2 prerequisite.
# Verified base: origin/main @ 3b1530606a8187f40c6a7d05ebf9d7fb4c287ff0.
# Run each command separately in PowerShell. Stop if a command fails.

Set-Location "C:\Users\Yanik\codes\GraphysX-Web"

git fetch origin

git switch main

git pull --ff-only origin main

git status --short

git am --3way "patches\revival-r2\0001-feat-clearblue-hd-Level-1-s-recorded-sky-legible-a-d.patch"

git am --3way "patches\revival-r2\0002-feat-humans-Level-2-s-recorded-iNumHuman-10-stands-a.patch"

git am --3way "patches\revival-r2\0003-feat-suzanne1-the-40x40-ASCII-arena-joins-the-machin.patch"

git am --3way "patches\revival-r2\0004-fix-provenance-the-GridXL-classic-skin-is-adapted-no.patch"

git am --3way "patches\revival-r2\0005-docs-record-revival-r2-two-parallel-sweeps-reconcile.patch"

git am --3way "patches\revival-next-r3\0001-feat-archive-make-Suzanne-2-a-source-shaped-v2-game.patch"

git am --3way "patches\revival-next-r3\0002-feat-archive-revive-scene-native-day-night-cycle.patch"

git am --3way "patches\revival-next-r3\0003-feat-archive-translate-meshlight-shader.patch"

git am --3way "patches\revival-next-r3\0004-feat-archive-compose-Level-3-catwalk-race.patch"

git am --3way "patches\revival-next-r3\0005-fix-smoke-scope-recovered-TVM-census.patch"

git am --3way "patches\revival-next-r3\0006-test-store-tolerate-loopback-recovery-after-full-gat.patch"

git am --3way "patches\revival-next-r3\0007-docs-progress-record-green-40-check-revival-gate.patch"

git log --oneline -13

npm ci

npm run verify -- --wait

git push origin main

# If git am fails, abort before doing anything else:
# git am --abort
