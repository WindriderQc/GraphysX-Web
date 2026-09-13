# Wiring the voxel face into the scene document

For the integrator. The face is finished and qualified on branch `claude/llmx-face-forge`;
what is missing is the eight call sites in `agent-world-runtime.ts` that make it **savable**.
That file belongs to the integrator, so this is a proposal, not a change.

Until this lands, the mask exists only as a rig a host constructs by hand — which is what the
dev harness does. It cannot be authored, saved, reloaded or inspected, so the P5 library has
nothing to persist.

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

## What to check once it is wired

The pure half is covered by `test/llmx-face-pose.test.mjs` (30 tests), including the appearance
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
