# Wiring the voxel face into the scene document

For the integrator. The face is finished and qualified on branch `claude/llmx-face-forge`;
what is missing is the ten call sites that make it **savable**, correctly sized and reachable —
eight in `agent-world-runtime.ts`, one wherever the face is mounted, one at the front door.
That file belongs to the integrator, so this is a proposal, not a change.

Until this lands, the mask exists only as a rig a host constructs by hand — which is what the
dev harness does. It cannot be authored, saved, reloaded or inspected, so the P5 library has
nothing to persist.

## État à la passation — 2026-09-13, pour Codex

**Branche `claude/llmx-face-forge`**, base `origin/main` d7c9937, 11 commits, poussée. 36 tests
purs (`node --test test/llmx-face-pose.test.mjs`), typecheck et lint scoped propres. Aucun
fichier partagé touché : `main.ts`, le runtime, `package.json`, les catalogues sont à toi.

**Vérifié dans la Forge (harnais dev, simulation, aucune conversation) :** assemblage de bas en
haut, bouche qui s'ouvre (3,5 cubes à speak 0,3 — 6 à speak 1), Penser et Attention lisibles,
regard vers la caméra (gazeY > 0 = haut, gazeX > 0 = +X), bascule de LOD en direct, profil
téléphone. Yanik a validé le concept plancher + autel ; ses trois retours structurels — bouche
fermée, « langue », expressions invisibles — sont corrigés (commits 8c4db54 → 894e623).

**L'autre moitié est sur `claude/llmx-forge`** (session Claude `graphysx-web-74`, même base) :
le monde de la Forge, l'éclairage, la caméra, la réaction aux créations, `docs/LLMX_FORGE.md`.
Les deux branches se sont développées à travers un seul point de couture,
`window.__LLMX_PREVIEW__.attachFace(rig)` dans `llmx-preview.html` / `src/llmx-preview.ts`
(à elle) et `src/llmx-face-attach.ts` (à moi, dev seulement, `?face=mobile|balanced|high`).
Intègre les deux ; ni l'une ni l'autre n'a modifié les fichiers de l'autre.

**Ce qui reste et qui est à toi :** les neuf raccords ci-dessous, `?app=llmx`, la conversation
et le « Hello ». Une fois `appearance` dans le runtime, `createForgeWorld()` posera
`appearance: { kind: "voxel-face" }` sur `llmx-face-anchor` et le masque se reconstruira au
chargement sans instanciation manuelle.

**Ouvert, non bloquant :** le caractère du masque (sévère, yeux étroits) est un arbitrage de
Yanik — c'est un paramètre du sculpteur, pas une remodélisation ; visèmes alignés sur le son
après la V1 ; commissures encore perfectibles à speak = 1.

**Cinq choses à ne pas réapprendre :**
- `.claude/launch.json` est **suivi** dans GraphysX ; ne l'écrase pas pour un harnais.
- Le « 15 fps » du panneau navigateur n'est pas une mesure : 66,6 ms identiques avec le
  visage masqué, c'est un plafond de cadence. `update()` du rig coûte 1,66 ms à 21 432 cubes.
- `speak` = amplitude de l'audio réellement joué ; `think` = signal du transport de
  conversation, jamais la charge GPU.
- `setQualityCeiling(host.qualityProfile.name)` au montage, et seulement quand le profil change.
- Le sculpteur (`node tools/llmx-face-sculptor.mjs`, 0,35 s) et la planche hors ligne
  (`node tools/llmx-face-preview.mjs high`) sont le cycle d'itération du visage ; le regarder
  dans la Forge à 7,4 m avec la parole reste le seul juge.

## What already exists

| Module | Owner | What it gives you |
| --- | --- | --- |
| `src/llmx-face-pose.ts` | face | Pure. Appearance types, `resolveAgentWorldAppearance`, `serializeAgentWorldAppearance`, drivers, pose maths. No Three.js, so `node --test` reaches it. |
| `src/agent-world-face.ts` | face | The renderer: `AgentWorldVoxelFace`, `findVoxelFace`, `createAppearanceObject`. Re-exports the config API, so one import is enough. |
| `src/llmx-face-forge.json` | face | The sculpted mask, 3 levels of detail. |
| `tools/llmx-face-sculptor.mjs` | face | Regenerates the JSON. Offline, 0.35 s. |

The appearance API is deliberately small:

```ts
type AgentWorldAppearance = { kind: "voxel-face" } & AgentWorldFace;
resolveAgentWorldAppearance(source): ResolvedAgentWorldAppearance  // throws on unknown kind
serializeAgentWorldAppearance(resolved): AgentWorldAppearance
createAppearanceObject(resolved): Group
```

## The eight hunks

Follows how `formula` threads through, so nothing below is a new pattern. Line numbers are from
`origin/main` d7c9937 and will have drifted.

1. **`AgentWorldEntityDefinition`** (near the `formula?:` field, ~line 643)

   ```ts
   /** Optional rendered appearance. Only valid on `agent` entities. */
   appearance?: AgentWorldAppearance | null;
   ```

2. **`AgentWorldEntityPatch`** (near ~line 716)

   ```ts
   /** Patch the appearance of an `agent` entity. Replaces the configuration. */
   appearance?: AgentWorldAppearance | null;
   ```

3. **`AgentWorldEntityState`** (near the `formula:` readout, ~line 967)

   ```ts
   appearance: ResolvedAgentWorldAppearance | null;
   ```
   plus the live readout from `findVoxelFace(runtime.object)?.describe()` if you want `build`
   and `speaking` visible to an agent — useful, not required.

4. **The patch handler** (beside the `patch.formula` branch, ~line 2529)

   ```ts
   if (patch.appearance !== undefined) {
     if (definition.type !== "agent") throw new Error("Only agent entities accept an appearance");
     definition.appearance = patch.appearance ? resolveAgentWorldAppearance(patch.appearance) : null;
     // A changed appearance rebuilds the avatar; there is no in-place morph between kinds.
   }
   ```

5. **`resolveEntity`** (beside the `formula` resolution, ~line 3833)

   ```ts
   const appearance = source.type === "agent" && source.appearance
     ? resolveAgentWorldAppearance(source.appearance)
     : null;
   if (source.type !== "agent" && source.appearance) {
     throw new Error("Only agent entities accept an appearance");
   }
   ```

6. **`createAgentAvatar`** (~line 4338) — one branch at the top:

   ```ts
   if (definition.appearance) return createAppearanceObject(definition.appearance);
   ```

7. **`serializeEntity`** (beside the `formula` carry, ~line 5276)

   ```ts
   ...(definition.appearance ? { appearance: serializeAgentWorldAppearance(definition.appearance) } : {}),
   ```

8. **Disposal** — wherever entity objects are torn down, call `findVoxelFace(object)?.dispose()`.
   The rig owns three `InstancedMesh`es, their geometries and their materials.

## Driving it

The rig does not animate itself. Whatever owns the conversation calls, from the host's frame
loop and never from a new one:

```ts
const face = findVoxelFace(entityObject);
face?.setDrivers({ speak, attention, think, gazeX, gazeY });
face?.update(deltaSeconds);   // inside host.subscribeFrame
```

`setDrivers` takes **targets**; the rig eases toward them, so pushing a value every frame or
once a second gives the same motion. Every field is clamped, and a non-finite value becomes the
minimum rather than NaN geometry.

Two fields carry a rule that is in the source and should survive integration:

- **`speak` is amplitude, not phonemes** — the energy of the audio actually playing on this
  device. Not token arrival, not a scheduled buffer.
- **`think` is a conversation-transport signal.** Never feed it from GPU load. Another job on a
  shared host is not this conversation thinking, and a face that frowns at someone else's batch
  is lying to the person in front of it.

## The ninth hunk: cap the density to the device

Measured in the Forge on a 375x812 phone viewport: the host reports profile `mobile`, and the
face still renders `high` — 5174 cubes. **Nothing currently connects the two.** Whoever mounts
the face has to:

```ts
face.setQualityCeiling(host.qualityProfile.name);   // "high" | "balanced" | "mobile"
```

This is deliberately *not* part of `configure`. The ceiling is a property of the machine
looking at the mask; the authored `level` is a property of the world. Folding the cap into the
configuration would mean opening a world on a phone and letting it autosave writes the phone's
limit back into the document — the mask is then permanently coarse for everyone, the author
included, with nothing recording why. `describe()` reports `level` and `renderedLevel`
separately so "why does it look coarse here" is answerable from outside.

Re-cap only when the profile actually changes. Each change rebuilds the instance buffers, and
the plan is explicit that density must not oscillate during a conversation.

The face was qualified at `mobile` (1552 cubes): same mask, chunkier — eyes, brow, nose, mouth
and jaw all still read, on a phone viewport, with the controls usable.

## The tenth hunk: the front door

There is no LLMx button yet, and that is the front door's own rule rather than an oversight.
`showroom-welcome.ts` adds each destination **only when a caller supplies its hook** — "so the
button can never be a dead control: the front door should not advertise a room that is not
there." Today `?app=llmx` mounts nothing: the Forge lives on `claude/llmx-forge`, the face on
`claude/llmx-face-forge`, and the conversation is not built. The button appears in the same
change that makes the room real.

Three edits, following exactly how KidX reaches its lab.

1. **`showroom-welcome.ts`** — one more optional hook beside `onOpenKidX`:

   ```ts
   onOpenLlmx?: () => void;
   ```

   and, beside the KidX block near the end of `mountWelcome`:

   ```ts
   if (hooks?.onOpenLlmx) {
     const llmx = document.createElement("button");
     llmx.type = "button";
     llmx.className = "gx-go-llmx";
     llmx.style.gridColumn = "1 / -1";
     llmx.textContent = "LLMx · Nocturnal Forge";
     llmx.addEventListener("click", hooks.onOpenLlmx);
     overlay.querySelector(".gx-actions")?.append(llmx);
   }
   ```

   The button's class is load-bearing: the headless smokes select on these.

2. **`main.ts`**, in the `mountWelcome` hooks beside `onOpenKidX`:

   ```ts
   onOpenLlmx: () => { window.location.search = "?app=llmx"; },
   ```

3. **`main.ts`**, in `openApplication` — it is specialised to `ev3-lab` today, so this is where
   the small common application contract the plan asks for earns its keep:

   ```ts
   if (id === "llmx") {
     applicationOpen = true;
     requestShowroomInteraction(false);
     void import("./llmx-app").then(({ mountLlmxApp }) => {
       appSurface = mountLlmxApp(root, host.api, () => { … }, {
         subscribeFrame: host.subscribeFrame.bind(host),
         frameView: (position, target, seconds) => host.frameView(position, target, seconds),
         qualityProfile: () => host.qualityProfile.name,
       });
     }).catch((error: unknown) => showStartupError(root, error));
     return true;
   }
   ```

   `qualityProfile` is the ninth hunk's other half: the mount needs it to call
   `setQualityCeiling`. Note `autoOrbit: !editorFirst && appParam !== "ev3-lab"` near line 848
   also needs `&& appParam !== "llmx"` — an idle orbit fighting the entry choreography is the
   same bug KidX already fixed once.

Until that lands, the way to look at the Forge and the mask is the dev harness on the Forge
branch (`llmx-preview.html`, its own vite port), which is what every screenshot in this lane
came from.

## What to check once it is wired

The pure half is covered by `test/llmx-face-pose.test.mjs` (32 tests), including the appearance
round-trip and the refusal of an unknown `kind`. What that file cannot reach, and what the
runtime tests should add:

- An `agent` with an appearance survives export → import → export unchanged.
- An appearance on a non-`agent` entity is refused.
- A document whose appearance `kind` this build does not know **fails loudly**. It must not
  quietly fall back to the capsule avatar: doing that and then autosaving is how a world loses
  its mask permanently, and the library work in P5 makes that autosave real.
- Removing the appearance (`appearance: null`) returns the default avatar and disposes the rig.

## One caution

`resolveAgentWorldFace` ignores an unknown `level` and falls back to `high` rather than
throwing — a level is a rendering budget, and refusing to draw a face because a profile name
changed would be worse than drawing it densely. `kind` is the opposite and throws, because it
decides whether the face is the right face at all. That asymmetry is deliberate.
