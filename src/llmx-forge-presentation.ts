import {
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PointLight,
  type Scene,
} from "three";
import type { ForgeAnchors, ForgeIntroFrame } from "./llmx-forge";

/**
 * The Forge's *presentation* layer: what moves with the conversation but is not scene state.
 *
 * The world itself is a document (`llmx-forge.ts`). This module owns the transient effects that
 * would be wrong to write into that document sixty times a second — the light running along the
 * copper ribs at entry, the copper rim breathing while the agent speaks — the same way
 * `live-agent-presence.ts` owns membership projections and `showroom-environment.ts` owns the
 * showroom's sun. Nothing here is exported, saved or undoable, and nothing here reaches into an
 * entity's material: the strips are the layer's own meshes laid over the document's ribs.
 *
 * Driven from the host's one frame loop through {@link ForgePresentation.update}; there is no
 * second `requestAnimationFrame`.
 */

export type ForgeActivity = Readonly<{
  /** True while audio the agent is speaking is actually playing. Amplitude lives in the rig. */
  speaking: boolean;
  /** The rig's assembly progress, 0–1, so the rim only breathes over a present face. */
  build: number;
}>;

export type ForgePresentation = Readonly<{
  /** Set the entry frame (from `forgeIntroAt`). Idempotent; call every frame during the intro. */
  setIntro: (frame: ForgeIntroFrame) => void;
  /** What the face is doing, at most once per frame. */
  setActivity: (activity: ForgeActivity) => void;
  update: (deltaSeconds: number) => void;
  dispose: () => void;
}>;

/** Segments per rib. 24 keeps the running light smooth over an 11 m rib at 30 fps. */
const SEGMENTS = 24;
/** Copper at rest, over-bright while the pulse passes so the bloom threshold is crossed. */
const COPPER = new Color("#c47a3a");
const CALM = 0.1;
const PULSE = 2.6;

export function mountForgePresentation(scene: Scene, anchors: ForgeAnchors): ForgePresentation {
  const group = new Group();
  group.name = "ForgePresentation";
  const strips = anchors.ribs.map((run, index) => buildStrip(run, index));
  for (const strip of strips) group.add(strip.mesh);

  // A breathing copper light behind the mask, on top of the document's steady rim. Zero at
  // rest so the document's look is exactly what the person authored.
  const breath = new PointLight("#ffa050", 0, 9);
  breath.position.set(anchors.faceCenter[0], anchors.faceCenter[1] + 0.9, anchors.faceCenter[2] - 2.2);
  group.add(breath);
  scene.add(group);

  let circuit = 1;
  let activity: ForgeActivity = { speaking: false, build: 1 };
  let clock = 0;
  const color = new Color();

  const writeStrips = (): void => {
    for (const strip of strips) {
      for (let i = 0; i < SEGMENTS; i += 1) {
        // The front of the running light, in normalised rib length, with a short tail. Once
        // the circuit is complete every segment settles to the calm glow.
        const along = (i + 0.5) / SEGMENTS;
        const front = circuit * 1.15;
        const behind = front - along;
        let gain = CALM;
        if (behind >= 0 && circuit < 1) gain = CALM + (PULSE - CALM) * Math.max(0, 1 - behind * 6);
        else if (behind < 0) gain = 0;
        // Speech runs a faint ripple outward from the socket, over a present face only.
        if (activity.speaking && activity.build > 0.95) {
          gain += 0.35 * Math.max(0, Math.sin(clock * 5 - along * 9));
        }
        color.copy(COPPER).multiplyScalar(gain);
        strip.mesh.setColorAt(i, color);
      }
      if (strip.mesh.instanceColor) strip.mesh.instanceColor.needsUpdate = true;
    }
  };
  writeStrips();

  return {
    setIntro: (frame) => {
      circuit = frame.circuit;
    },
    setActivity: (next) => {
      activity = next;
    },
    update: (deltaSeconds) => {
      clock += deltaSeconds;
      writeStrips();
      const target = activity.speaking && activity.build > 0.95 ? 6 + 3 * Math.sin(clock * 4.2) : 0;
      // Attack fast, release slow: the light should answer the first syllable and fade after
      // the last, not flicker between words.
      const rate = target > breath.intensity ? 12 : 3;
      breath.intensity += (target - breath.intensity) * Math.min(1, deltaSeconds * rate);
    },
    dispose: () => {
      scene.remove(group);
      for (const strip of strips) {
        strip.mesh.geometry.dispose();
        (strip.mesh.material as MeshBasicMaterial).dispose();
        strip.mesh.dispose();
      }
      breath.dispose();
    },
  };
}

function buildStrip(run: ForgeAnchors["ribs"][number], index: number): { mesh: InstancedMesh } {
  const dx = run.to[0] - run.from[0];
  const dz = run.to[2] - run.from[2];
  const length = Math.hypot(dx, dz);
  const alongX = Math.abs(dx) > Math.abs(dz);
  const segment = length / SEGMENTS;
  // Thin, slightly narrower than the rib and a hair above it, so it reads as the rib lighting
  // up rather than as a second object. Unlit material: it is the light source.
  const geometry = new BoxGeometry(alongX ? segment * 0.82 : 0.1, 0.02, alongX ? 0.1 : segment * 0.82);
  const material = new MeshBasicMaterial({ color: "#ffffff" });
  const mesh = new InstancedMesh(geometry, material, SEGMENTS);
  mesh.name = `ForgeRibGlow-${index}`;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  const matrix = new Matrix4();
  for (let i = 0; i < SEGMENTS; i += 1) {
    const t = (i + 0.5) / SEGMENTS;
    matrix.setPosition(run.from[0] + dx * t, run.from[1] + 0.045, run.from[2] + dz * t);
    mesh.setMatrixAt(i, matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return { mesh };
}
