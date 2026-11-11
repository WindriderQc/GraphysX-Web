# Face rotation cache: validation

The voxel rig caches fixed jitter rotations in Float64 bases at construction.
Frame updates write scale and translation directly into the existing instance
buffers. This preserves geometry, shaders, expressions and update frequency.
The additional CPU memory cost is 72 bytes per voxel.

## Numerical and visual checks

- 125 focused face tests pass, including exact matrix and colour equality with
  the previous Matrix4.compose path at all three detail levels.
- TypeScript, repository lint, production build and the standalone face build pass.
- The built face embed browser smoke passes: visible mask, room lighting and
  WebGL restoration, speech/interruption, legacy busy presence, math/function
  scenes and cleanup. Speaking and busy-state screenshots were inspected.
- Independent static review found no blocking issue.

## Existing Windows failures isolated

Against main 3e4791815fc84fd6ec53a1b47733a0ac3e67aed5 and the candidate, the same
command (`node --test test/world-fork.test.mjs test/world-reliability.test.mjs`)
produces 13 passing and four failing tests. Failure names, messages and source
stack locations match exactly:

- world-fork:101: startup fork checkpoint, fsync EPERM at archive.mjs:41.
- world-reliability:109: checkpoint sha256 read from null at test line 124.
- world-reliability:157: bounded queue archive, fsync EPERM at archive.mjs:41.
- world-reliability:204: recovery checkpoint, fsync EPERM at archive.mjs:41.

The affected world-service source/tests and dependency lockfiles are unchanged
between main and this candidate. The aggregate run reports 1,296 tests:
1,291 pass, four fail, one skipped. It is not a completely green local gate.

## Performance scope

`node scripts/bench-face-update.mjs <baseline-checkout>` measures only CPU time
inside face.update. Five short alternating samples initially showed median
1.514 -> 1.350 ms at high detail, 0.562 -> 0.528 ms balanced and
0.166 -> 0.123 ms mobile on one Windows desktop. These exploratory results
are not browser FPS, GPU measurements, memory savings or target-device claims.

No live target rollout or ArtX effect comparison has been performed. Those
remain separate acceptance steps; deployment is intentionally withheld.
