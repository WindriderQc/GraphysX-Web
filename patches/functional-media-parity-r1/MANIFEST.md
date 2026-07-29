# functional-media-parity-r1

Ordered, local-only patch delivery for the GraphysX-Web archive/media parity revival.
Nothing in this package has been pushed.

## Apply contract

- Repository baseline: `2ff08fad1a2ee006dee240fe0cc557bf7e2fa157`
- Expected result tree: `89b009dd5927b9cb36dc7fd883ccdd4df7a25e8b`
- Source implementation head: `f0013f686911d261c15301319ef0a47cb4e5a781`
- Apply from PowerShell: `./patches/functional-media-parity-r1/APPLY-STEPS.ps1`
- Optional validation target: `./patches/functional-media-parity-r1/APPLY-STEPS.ps1 -RepositoryPath C:\path\to\baseline-clone`

`git am` preserves the authored commits but may produce different commit IDs because the
committer timestamp changes. The script verifies the resulting Git tree, which must match the
source implementation byte-for-byte.

## Ordered series

| Patch | Source commit | Purpose | Bytes | SHA-256 |
| --- | --- | --- | ---: | --- |
| `0001-audit-establish-archive-parity-census.patch` | `5c5558fcb90a0c68a90945fe6001f39c0bb30e72` | Reproducible complete media/functionality census, evidence rules, strict stale-ledger audit. | 7,457,317 | `98d82ebf2b2fe898941494ca6effcc077615912b2159e0cb6367e835b36e7383` |
| `0002-feat-physics-add-serializable-scene-joints.patch` | `f6bffce1541a54ac604dc6c22a094022625c55e2` | Fixed, revolute and rope joints across Rapier, v2 documents, API/bridge/editor/undo/export/load and the Constraint Workshop. | 65,178 | `9c421b54d7d8ca556ca0acf1cded59889618d27c5f4cee181d66b33e93a0de1a` |
| `0003-feat-media-restore-authored-BallZ18-clear-sky.patch` | `382bec43d0e673f166d2ea64925f99c5ed4fe757` | Exact six authored 2048² BallZ18 sky PNGs, provenance, native cubemap orientation and visual regression coverage. | 12,682,791 | `3d90a8bfbc59c2a7952ad855cdd00dd6ebf7cb2c1fa3e47276e2ae63b3bd87d7` |
| `0004-feat-compat-add-warning-first-SceneNET-export.patch` | `1a45f3555c099003bedbb2333b954f89a2fa1813` | Expanded SceneNET imports plus deterministic warning-first flat v1.2 XML export in APIs, bridge and human UIs. | 56,184 | `d784b28c936feda15f988f955e6f2d815f432de3605c837db74e83ae68fd200a` |
| `0005-docs-reconcile-archive-revival-status.patch` | `f0013f686911d261c15301319ef0a47cb4e5a781` | Append-only handoff/progress record and corrected product reality tables. | 25,999 | `f1838f945c590c09a09de19651fe086905a3d66017fba0fab91f10243ecd5398` |

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
- The ordered patches were applied from the stated baseline in an independent detached worktree;
  the result was clean and its tree matched `89b009dd5927b9cb36dc7fd883ccdd4df7a25e8b` exactly.

Inspected captures are recorded append-only in `HANDOFF.md` and `progress.md`; generated QA
output is intentionally not part of this patch delivery.
