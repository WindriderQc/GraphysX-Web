# revival-r2 delta series — 5 patches on top of origin/main @ 3b15306
# (docs(revival): reconcile archive debt ledgers). Verified: full gate 36/36 green.
# Run each line from the repo root, one at a time.

cd C:\Users\Yanik\codes\GraphysX-Web

git fetch origin

git status

# Confirm you are on main at 3b15306 (or later — if later, stop and tell Claude):
git log --oneline -1 origin/main

git checkout main

git pull --ff-only origin main

git am --3way patches\revival-r2\0001-feat-clearblue-hd-Level-1-s-recorded-sky-legible-a-d.patch

git am --3way patches\revival-r2\0002-feat-humans-Level-2-s-recorded-iNumHuman-10-stands-a.patch

git am --3way patches\revival-r2\0003-feat-suzanne1-the-40x40-ASCII-arena-joins-the-machin.patch

git am --3way patches\revival-r2\0004-fix-provenance-the-GridXL-classic-skin-is-adapted-no.patch

git am --3way patches\revival-r2\0005-docs-record-revival-r2-two-parallel-sweeps-reconcile.patch

# Sanity: five new commits on top of 3b15306
git log --oneline -6

# Optional local gate before pushing (heavy — software-GL smokes):
npm run verify

git push origin main

# If any `git am` fails: run `git am --abort` and tell Claude the error text.
