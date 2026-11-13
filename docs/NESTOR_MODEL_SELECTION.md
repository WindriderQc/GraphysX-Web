# Nestor voxel face and future facial asset

Nestor uses the original Forge voxel sculpt, graphite with copper-orange accents. The uplift reshapes the upper/lower lips, brow arches and eyelid caps without increasing voxel density. The smile moves the commissures and cheeks with coordinated lids while keeping pupils visible. Explicit curiosity and surprise poses use bounded fields and the existing interpolation clock; these are authored presentation, not emotion detection.

The asset retains its format, identity, three quality profiles and six instanced meshes. Appearance/save contracts, audio playback and conversation transport are unchanged. `speak` follows the amplitude of audio actually played, `speakTone` its spectral brightness, and `think` the current conversation's waiting/generating state. These signals do not identify phonemes or GPU activity. The deep-mouth ember is restrained so lips and the cavity carry the opening.

| Tier | Spacing | Asset cubes before / after | Animated cubes before / after |
| --- | ---: | ---: | ---: |
| High | 0.024 m | 22,325 / 21,710 | 14,194 / 13,583 |
| Balanced | 0.038 m | 8,382 / 8,174 | 5,120 / 4,914 |
| Mobile | 0.072 m | 2,162 / 2,126 | 1,257 / 1,223 |

These are rig counts, not whole-scene performance or FPS. The complete Forge and real conversation/playback require their own acceptance. Focused tests cover mouth continuity, attached lips, stable teeth, pupil visibility, opaque blinking, curiosity/surprise, interpolation and disposal. Rebuild the original asset with `node tools/llmx-face-sculptor.mjs`.

Only the voxel runtime is included in this release. Rejected smooth-head experiments and their different appearance type are not promoted. The local study checkout retains its comparison tools and approved concept sheet as future reference; the approved illustration is an artistic target, not a promised voxel reproduction.

## Confirmed future option: MPFB / TalkingHead

The [author's CC0 grant](https://github.com/met4citizen/TalkingHead/blob/1563de184c19b310de4b636664d5835e2c74dbba/README.md#L371) applies specifically to `mpfb.glb`. The [exact inspected GLB](https://raw.githubusercontent.com/met4citizen/TalkingHead/1563de184c19b310de4b636664d5835e2c74dbba/avatars/mpfb.glb) was downloaded and rendered with the existing Three.js GLTFLoader, without the TalkingHead runtime. Smile, blink and jaw morphs were actually driven.

- File size: 36,815,920 bytes.
- SHA-256: `63c645a2a863b9972e9a9c2ed576a1de4c390b8475508e1473e69c87a3ee299c`.
- Main body mesh `base`: 66 morphs, 21,380 triangles.
- Complete model: 83,686 triangles, 67-joint skeleton, separate animated eyes, brows, lashes, teeth and tongue, and no authored animation clips.
- Inspection poses: smile `mouthSmileLeft/Right = 0.75`, cheek squints `0.35`, eye squints `0.12`, jaw `0.035`; blink `eyeBlinkLeft/Right = 1`; mouth inspection `jawOpen = 0.5`, `mouthFunnel = 0.2`.

The file is a usable facial rig, but remains a human full-body avatar. A graphite material swap does not supply the approved character's silhouette. A future polished Nestor still needs deliberate sculpt/proportion adaptation, lip/eye edge loops and artistic review. No unused external GLB or human-head runtime is shipped here. The local review harness and original captures remain in the study checkout; its downloads are ignored research output.

Full inspected `base` morph inventory:

```text
browDownLeft, browDownRight, browInnerUp, browOuterUpLeft, browOuterUpRight
eyeBlinkLeft, eyeBlinkRight, eyeSquintLeft, eyeSquintRight, eyeWideLeft, eyeWideRight
eyeLookInLeft, eyeLookInRight, eyeLookOutLeft, eyeLookOutRight, eyeLookUpLeft, eyeLookUpRight, eyeLookDownLeft, eyeLookDownRight
cheekPuff, cheekSquintLeft, cheekSquintRight, noseSneerLeft, noseSneerRight
jawOpen, jawForward, jawLeft, jawRight, tongueOut
mouthClose, mouthFunnel, mouthPucker, mouthLeft, mouthRight, mouthSmileLeft, mouthSmileRight
mouthFrownLeft, mouthFrownRight, mouthDimpleLeft, mouthDimpleRight, mouthStretchLeft, mouthStretchRight
mouthPressLeft, mouthPressRight, mouthRollUpper, mouthRollLower, mouthShrugUpper, mouthShrugLower
mouthUpperUpLeft, mouthUpperUpRight, mouthLowerDownLeft, mouthLowerDownRight
viseme_aa, viseme_E, viseme_I, viseme_O, viseme_U, viseme_PP, viseme_FF, viseme_TH, viseme_SS, viseme_DD, viseme_kk, viseme_nn, viseme_RR, viseme_CH
```
