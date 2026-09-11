# KidX LEGO EV3 instruction references

The owner supplied 28 PDFs under `docs/Lego/` on 2026-09-10. This index records
the local source material for future KidX visual and construction work. The PDFs
remain local references; they are not runtime assets or build dependencies.
Paths below are relative to this document. Page numbers are one-based PDF pages.

## First Drive: the most useful pages

| Source | Pages | What the illustrations establish |
| --- | --- | --- |
| [TRACK3R](Lego/31313_X_TRACK3R.pdf) | 2 | Five mission builds, with Mission 01 on pages 3-37. |
| TRACK3R | 4-20 | Progressive construction of the tracked base, before the front tool and sensor assembly. |
| TRACK3R | 14 | Axles, gears and side liftarms in the track assembly. |
| TRACK3R | 17 | Two 25 cm leads connecting the large drive motors to brick outputs B and C; clear rear view of the brick, ports and motor mounts. |
| TRACK3R | 20 | Clear three-quarter view of the base: two black tracks, white/gray brick, gray motors with red output hubs, black Technic structure and white decorated side panels. |
| TRACK3R | 24, 31, 33, 35 | Medium motor and front attachment, followed by the rear sensor and its cable. These belong to the fuller Mission 01 robot. |
| [Kit booklet 6124045](Lego/6124045.pdf) | 1-8 | Identifies set 31313, introduces its models and starts the TRACK3R build. This is the kit booklet, not another robot model. |
| Kit booklet 6124045 | 42 | Illustrated on-brick button and screen sequence. |
| Kit booklet 6124045 | 43 | The packaging unfolds into a play mat with a red route, colored targets and a pale blue border. This is a perspective reference, not flat texture artwork. |

The strongest source for a First Drive interpretation of **set 31313** is the
TRACK3R base shown on page 20. Using that base without the later attachments would
be a deliberate KidX adaptation, not the complete Mission 01 build.

The current First Drive mesh is still the original, wheeled, Education-inspired
model described in [KIDX_VISUALS.md](KIDX_VISUALS.md). It does not reproduce TRACK3R.
Its rounded shell, wheel-and-caster chassis and custom mat should not be presented
as faithful reproductions of the owner's newly supplied instructions. This source
review does not change that mesh or the simulated driving behavior.

For a future TRACK3R model, prioritize the recognizable silhouette and construction:
paired tracks with visible gears, the brick's faceted housing and gray button
cluster, correctly placed red motor hubs, actual Technic hole spacing, white side
panels, and the B/C cable routing. Review the rendered model against pages 17 and
20 from comparable camera angles. Keep any changes to physical dimensions or
tracked steering separate from claims established by the illustrations alone.

## Collection inventory

The collection combines the 31313 model family with Education Core and Expansion
instructions. Their presence does not establish which Education parts the owner
has. No separate Education Driving Base instruction PDF is present in this snapshot.

### Set 31313 and related model instructions

| Local PDF | Pages |
| --- | ---: |
| [Kit booklet / TRACK3R starter](Lego/6124045.pdf) | 48 |
| [TRACK3R](Lego/31313_X_TRACK3R.pdf) | 92 |
| [EV3RSTORM](Lego/31313_X_EV3RSTORM.pdf) | 131 |
| [R3PTAR](Lego/31313_X_R3PTAR.pdf) | 102 |
| [SPIK3R](Lego/31313_X_SPIK3R.pdf) | 89 |
| [BANNER PRINT3R](Lego/31313_X_BANNER%20PRINT3R.pdf) | 59 |
| [BOBB3E](Lego/31313_X_BOBB3E.pdf) | 72 |
| [DINOR3X (filename DINOREX)](Lego/31313_X_DINOREX.pdf) | 125 |
| [EL3CTRIC GUITAR](Lego/31313_X_EL3CTRIC%20GUITAR.pdf) | 50 |
| [EV3 GAME](Lego/31313_X_EV3%20GAME.pdf) | 43 |
| [EV3D4](Lego/31313_X_EV3D4.pdf) | 128 |
| [EV3MEG](Lego/31313_X_EV3MEG.pdf) | 118 |
| [KRAZ3](Lego/31313_X_KRAZ3.pdf) | 124 |
| [MR B3AM](Lego/31313_X_MR%20B3AM.pdf) | 88 |
| [RAC3 TRUCK](Lego/31313_X_RAC3%20TRUCK.pdf) | 32 |
| [ROBODOZ3R](Lego/31313_X_ROBODOZ3R.pdf) | 63 |
| [WACK3M](Lego/31313_X_WACK3M.pdf) | 123 |

The booklet introduces GRIPP3R, but this snapshot has no standalone GRIPP3R build PDF.

### Education builds and program descriptions

| Model | Build PDF / pages | Program description / pages |
| --- | --- | --- |
| Color Sorter | [Core build](Lego/ev3-model-core-set-color-sorter.pdf) / 115 | [Program](Lego/ev3-program-description-color-sorter.pdf) / 1 |
| GyroBoy | [Core build](Lego/ev3-model-core-set-gyro-boy.pdf) / 119 | [Program](Lego/ev3-program-description-gyroboy.pdf) / 3 |
| Puppy | [Core build](Lego/ev3-model-core-set-puppy.pdf) / 134 | [Program](Lego/ev3-program-description-puppy.pdf) / 4 |
| Robot Arm H25 | [Core build](Lego/ev3-model-core-set-robot-arm-h25.pdf) / 109 | [Program](Lego/ev3-program-description-robotarm.pdf) / 1 |
| Stair Climber | [Expansion build](Lego/ev3-model-expansion-set-stair-climber.pdf) / 163 | No matching program PDF in this snapshot |
| Tank Bot | [Expansion build](Lego/ev3-model-expansion-set-tank-bot.pdf) / 73 | No matching program PDF in this snapshot |

The remaining six-page [brick hardware schematic](Lego/Appendix_LEGO_MINDSTORMS_EV3_programmable_brick_main_hardware_schematics.pdf)
documents electronics and interfaces, rather than an exterior construction model.

## Review evidence

Page counts and document metadata were extracted from all 28 files. Every cover
was rendered and inspected, along with selected TRACK3R and kit-booklet assembly
pages cited above. Image-only instructions need visual review; empty extracted
text does not mean the page is empty. This is a source inventory and focused
visual review, not a complete audit of every model's assembly or program.

Local review outputs are in `output/pdf/lego-reference/`: `inventory.json`,
`covers-1.jpg` through `covers-3.jpg`, and named page renders such as
`31313_X_TRACK3R-p020.png` and `6124045-p043.png`.
