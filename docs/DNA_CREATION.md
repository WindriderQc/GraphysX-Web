# DNA welcome creation

Open `?app=dna`, or choose **Créer une variante ADN** on the welcome screen. The
three steps stay reachable through **Muter / Observer / Garder** on desktop and
compact touch layouts. The existing Garden workshop remains available separately.

## A visible, reproducible change

Two `dna-tree` entities use the same deterministic seed and genome. The visitor
chooses one structural change at a time: trunk length, branch angle, or branching
probability. Each choice starts from the reference genome. The renderer's exported
growth function supplies the branch height/count shown in the comparison; no
second growth algorithm or private scene state is maintained by the welcome app.

The trees are procedural, not a biological selection model. The recovered DNA
growth implementation retains its existing provenance; this composition and its
structural mutation choices are a new creation experience.

## Actual physics, explicit limits

Two identical dynamic spheres start at the measured maximum branch height of their
respective tree, above identical static platforms placed in front of the foliage.
They share radius, mass, restitution, friction and gravity. Trees/leaves are visual
geometry, not colliders. The height changes gravitational potential energy; no
mass-dependent fall or invented fitness score is presented.

The app observes body position/vertical velocity through World API v2 and records
the highest sampled point of the first bounce. It subtracts the sphere radius and
platform top from center height. Values are observed scene units, not analytical
or device-precision measurements. If the first bounce is missed or interrupted,
the app reports an incomplete observation. It never fabricates a result.
An external API step that skips the observation interval also pauses with an
incomplete result instead of labelling a later bounce as the first.

Pause/reset and the bounded deterministic test clock use canonical `api.*`
operations. Only `PlatformHost.subscribeFrame` reads telemetry; there is no
second renderer, animation loop or physics implementation. Reduced motion skips
the camera arrival; physics starts only after an explicit release in every mode.

## Save, resume and Studio

**Enregistrer** stores the complete authored v2 document in the existing named
local-scene slots. Runtime falling positions and the observed result are transient;
the saved launch positions allow the same experiment to be replayed. The save is
read back before the Studio link appears. Browser storage failure keeps the open
variant and its unsaved state. A different scene using the same name, or a slot
changed since it was loaded, requires a new name instead of silently overwriting.

The DNA resume pointer is separate from the Garden pointer. Malformed/missing
saved data is preserved and a new experiment is offered with an explicit notice.
Saved scenes are local to this browser/origin; clearing site data removes them.
Studio's existing JSON export provides a portable copy.

The Studio URL loads that exact named document and explicitly pauses it. Studio
edits survive subsequent DNA resumption. If the comparison apparatus/genome was
changed incompatibly, mutation/drop helpers are disabled; the saved document is
not rebuilt from a template. Additional ordinary authored scenery is retained.

## Qualification

`test/agent-world-bridge-live.test.mjs` exercises actual rendering matrices,
browser/storage validators and Rapier, including single-gene changes, reload
identity, higher real bounce and unchanged authored launch poses.

`scripts/smoke-dna-creation.mjs` drives the welcome entry, all mutations, physical
pause/reset/results, exact named save, Studio handoff/save/edit/resume, name and
stale-slot conflicts, storage failure and malformed recovery. It covers desktop,
390px and 320px touch layouts with reduced motion and records screenshots/JSON.
It is registered in the default verification gate. The standard game client is
also run separately with inspected canvas captures and projected application state.

Release qualification and public deployment receipts are recorded in `progress.md`
and ignored `output/`; local browser proof is separate from CI and public identity.
