# functional-media-parity-r1

Ordered, local-only patch delivery for the GraphysX-Web archive/media parity revival.
Nothing in this package has been pushed.

## Apply contract

- Repository baseline: `e3ece77c613e0fabeaf88d543efbb1347b4d83c7`
- Expected result tree: `91e0b0116c3cdb5b3859849e358eaabba7a1c94a`
- Source implementation head: `5b682fc2e69a0717878986c2070ab8cc9c094a16`
- Apply from PowerShell: `./patches/functional-media-parity-r1/APPLY-STEPS.ps1`
- Optional validation target: `./patches/functional-media-parity-r1/APPLY-STEPS.ps1 -RepositoryPath C:\path\to\baseline-clone`

The baseline already tracks an older copy of this bundle. The apply script therefore permits
tracked changes only inside its own package directory while rejecting every other dirty tracked
path; the five product patches do not touch the package directory.

`git am` preserves the authored commits but may produce different commit IDs because the
committer timestamp changes. The script verifies the resulting Git tree, which must match the
source implementation byte-for-byte.

## Ordered series

| Patch | Source commit | Purpose | Bytes | SHA-256 |
| --- | --- | --- | ---: | --- |
| `0001-audit-establish-archive-parity-census.patch` | `cd3cb021e488fc7c704f59c88d5702db1a8ea6e4` | Reproducible complete media/functionality census, evidence rules, strict stale-ledger audit. | 7,457,317 | `a47487ea44e07bf4f8273ed0cea37d970f43734b8b96bb0278979e1520d93452` |
| `0002-feat-physics-add-serializable-scene-joints.patch` | `695eeb63b1c5dc0721cde78db2fe5f435949be39` | Fixed, revolute and rope joints across Rapier, v2 documents, API/bridge/editor/undo/export/load and the Constraint Workshop. | 65,178 | `fd6662c5019bb2fb4848eea229161aff94ebd306d936a1dde9818e57e5913460` |
| `0003-feat-media-restore-authored-BallZ18-clear-sky.patch` | `1758dfd5edf416e3cdfe88efcff1acfb92e56e49` | Exact six authored 2048² BallZ18 sky PNGs, provenance, native cubemap orientation and visual regression coverage. | 12,682,791 | `30ad71fecb34bd5f4ae3ac642745db93221351a44f16190b81befdd6255b2906` |
| `0004-feat-compat-add-warning-first-SceneNET-export.patch` | `0b7ee70d5ceacaf4674da9c00311a995f38dd30e` | Expanded SceneNET imports plus deterministic warning-first flat v1.2 XML export in APIs, bridge and human UIs. | 56,184 | `fc6e2aadea9cd9b650e2528dc256a06dafead19665c3c32080ddf006eb0d2683` |
| `0005-docs-reconcile-archive-revival-status.patch` | `5b682fc2e69a0717878986c2070ab8cc9c094a16` | Append-only handoff/progress record and corrected product reality tables. | 25,999 | `dbcea0c5faf293b29b1bcfbab261b3a1f1914f67d8ccd38ec7ee7e0a03526e1f` |

## Final census

- 8,823 media paths; 5,949 unique SHA-256 hashes; 2,874 duplicate paths;
  5,688,234,500 bytes examined.
- Categories: 63 animation, 271 audio, 8 font, 6,156 image, 1,289 model,
  40 particle, 885 scene and 111 shader paths.
- Media dispositions: 545 REVIVED, 2,870 ALIASED, 3,421 SOURCE-ONLY,
  1,982 OUT OF SCOPE and 5 explicit zero-byte UNRECOVERABLE.
- Functionality dispositions: 66 REVIVED, 3 SOURCE-ONLY, 1 SUPERSEDED and
  1 OUT OF SCOPE across 71 records.

Remaining SOURCE-ONLY functionality is evidence-bounded: the unbound Projection effect,
the unbound BallZ fluid-layer shader and the physical Arduino panel without a faithful browser
device binding. Multiple overlay composition is explicitly OUT OF SCOPE. No placeholder use was
invented for any of them.

## Verification record

- Focused checks passed for joints/physics, Rapier Race, generative surfaces, exact sky,
  day/night, SceneNET XML, archive levels, 90-tool bridge parity, the 99/99 round-trip sweep,
  typecheck, production build, revival debt and archive parity.
- The required full command, `npm run verify -- --wait`, was run exactly once. Its matrix was
  45/46: all type/build/audit/node checks and 42 of 43 browser smokes passed. Rapier Race's two
  ephemeral preview servers timed out at navigation before any assertion.
- The exact unchanged Rapier Race smoke then passed against the same built `dist/` on a
  health-checked stable preview, covering real chassis motion, drive, suspension, steering,
  finite state, screenshot and zero console/page errors. The full matrix was not rerun and no
  assertion was weakened.
- After `origin/main` advanced to the two-body BallZ commit `e3ece77`, the series was replayed
  conflict-free on that exact current baseline. Typecheck, production build, both strict audits,
  joints, exact-sky and SceneNET XML focused smokes passed on the combined tree.
- The re-derived ordered patches were applied from the stated baseline in an independent detached
  worktree; the result was clean and its tree matched
  `91e0b0116c3cdb5b3859849e358eaabba7a1c94a` exactly.
- The same-repository upgrade path was also exercised with only this tracked package updated in
  the worktree. All five commits applied, package changes were preserved, and the resulting HEAD
  tree again matched `91e0b0116c3cdb5b3859849e358eaabba7a1c94a` exactly.

Inspected captures are recorded append-only in `HANDOFF.md` and `progress.md`; generated QA
output is intentionally not part of this patch delivery.
