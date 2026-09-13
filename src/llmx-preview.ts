import { BoxGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, type Object3D } from "three";
import { PlatformHost } from "./platform-host";
import { createForgeWorld, forgeIntroAt, FORGE_INTRO, LLMX_FACE_ANCHOR_ID } from "./llmx-forge";
import { mountForgePresentation } from "./llmx-forge-presentation";
// The product's page styles: they size #app to the viewport and give the HUD the brand font.
import "./styles.css";

/**
 * LLMx Forge preview — a development harness, not the application.
 *
 * Opens the Nocturnal Forge document in the real `PlatformHost` (same renderer, lights, post,
 * one frame loop) and runs the entry choreography against a stand-in mask so the world can be
 * looked at before the application, the conversation and the face rig are integrated. It exists
 * because the project's rule is to look at anything visual before shipping it, and booting the
 * full gate for every lighting tweak is a 40-minute lock.
 *
 * What is simulated here, and says so on screen: assembly progress, speech amplitude, thinking,
 * attention. None of it is evidence of a connected conversation. The face rig
 * (`agent-world-face.ts`, owned by the face session) plugs in through
 * `window.__LLMX_PREVIEW__.attachFace(rig)`, replacing the stand-in.
 *
 * Route: `/llmx-preview.html` on the dev server. Query: `intro=0` skips the entry,
 * `t=<seconds>` seeks the intro (for screenshots), `speak=1` starts the simulated speech.
 */

/** Structural mirror of the rig's `FaceDrivers` (src/llmx-face-pose.ts); every field 0–1 unless noted. */
type PreviewDrivers = {
  build: number;
  speak: number;
  speakTone: number;
  blink: number;
  /** -1..1 */
  gazeX: number;
  /** -1..1 */
  gazeY: number;
  attention: number;
  think: number;
  /** -1..1 */
  warmth: number;
  breath: number;
};

/** The rig contract the face session fixed on 2026-09-13 (see LLMX_RESTART_HANDOFF, interface 2). */
type PreviewFaceRig = {
  readonly object: Object3D;
  setDrivers: (drivers: Partial<PreviewDrivers>) => void;
  update: (deltaSeconds: number) => void;
  describe: () => { build: number; speaking: boolean };
  dispose: () => void;
};

const params = new URLSearchParams(window.location.search);
const root = document.getElementById("app");
if (!root) throw new Error("llmx-preview: #app missing");

const forge = createForgeWorld();
const { anchors } = forge;
const host = new PlatformHost(root, {
  world: forge.document,
  interactive: false,
  editorVisible: false,
  autoOrbit: false,
  framing: anchors.cameraEntry,
  intro: false,
});
const presentation = mountForgePresentation(host.scene, anchors);

// ---------------------------------------------------------------------------
// The face slot: a stand-in until the rig is attached.
// ---------------------------------------------------------------------------

const anchorObject = requireAnchor();
function requireAnchor(): Object3D {
  const object = host.world.getEntityObject(LLMX_FACE_ANCHOR_ID);
  if (!object) throw new Error(`llmx-preview: ${LLMX_FACE_ANCHOR_ID} not in the loaded world`);
  return object;
}

function createStandIn(): PreviewFaceRig {
  // The mask's measured extents, as a dark metal block with two cyan eyes: enough to judge
  // framing, key light and rim, and obviously not the face.
  const group = new Group();
  group.name = "FaceStandIn";
  const body = new Mesh(
    new BoxGeometry(1.43, 2.25, 1.15),
    new MeshStandardMaterial({ color: "#2a2e36", roughness: 0.5, metalness: 0.75 }),
  );
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  for (const side of [-1, 1]) {
    const eye = new Mesh(
      new SphereGeometry(0.15, 16, 12),
      new MeshStandardMaterial({ color: "#66dcff", emissive: "#66dcff", emissiveIntensity: 1.8, roughness: 0.3 }),
    );
    eye.position.set(side * 0.29, 0.1, 0.5);
    group.add(eye);
  }
  let build = 1;
  let speaking = false;
  let blink = 0;
  return {
    object: group,
    setDrivers: (drivers) => {
      if (drivers.build !== undefined) build = drivers.build;
      if (drivers.speak !== undefined) speaking = drivers.speak > 0.05;
      if (drivers.blink !== undefined) blink = drivers.blink;
    },
    update: () => {
      // Grows from the chin up, like the rig's bottom-up assembly.
      body.scale.y = Math.max(0.001, build);
      body.position.y = -1.125 + 1.125 * build;
      const eyes = group.children.slice(1) as Mesh[];
      for (const eye of eyes) {
        eye.visible = build > 0.98;
        eye.scale.y = Math.max(0.05, 1 - blink);
      }
    },
    describe: () => ({ build, speaking }),
    dispose: () => {
      body.geometry.dispose();
      body.material.dispose();
    },
  };
}

let face: PreviewFaceRig = createStandIn();
let faceIsStandIn = true;
anchorObject.add(face.object);

function attachFace(rig: PreviewFaceRig): void {
  anchorObject.remove(face.object);
  face.dispose();
  face = rig;
  faceIsStandIn = false;
  anchorObject.add(rig.object);
  rig.setDrivers(drivers);
  render();
}

// ---------------------------------------------------------------------------
// Simulation state. Every number here is invented for the preview and labelled as such.
// ---------------------------------------------------------------------------

const drivers: PreviewDrivers = { build: 1, speak: 0, speakTone: 0.5, blink: 0, gazeX: 0, gazeY: 0, attention: 0.25, think: 0, warmth: 0, breath: 0 };
let introTime: number | null = null;
let approachStarted = false;
let simulateSpeech = params.get("speak") === "1";
let simulateThink = false;
let simulateAttention = false;
let reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
let clock = 0;
let nextBlink = 2.5;
let blinkPhase = 0;

function restartIntro(seek = 0): void {
  introTime = seek;
  approachStarted = false;
  host.frameView(anchors.cameraEntry.position, anchors.cameraEntry.target, 0);
  drivers.build = 0;
  drivers.blink = 1;
}

function restCamera(): void {
  host.frameView(anchors.cameraRest.position, anchors.cameraRest.target, 0.9);
}

/** A syllable-like envelope: bursts of 1.4 s with 0.5 s gaps. Not speech; a stand-in for its amplitude. */
function speechEnvelope(t: number): number {
  const period = 1.9;
  const phase = t % period;
  if (phase > 1.4) return 0;
  const syllables = Math.max(0, Math.sin(phase * 11) * 0.55 + Math.sin(phase * 27) * 0.25 + 0.3);
  return Math.min(1, syllables);
}

const unsubscribe = host.subscribeFrame((deltaSeconds) => {
  clock += deltaSeconds;

  if (introTime !== null) {
    introTime += deltaSeconds;
    const frame = forgeIntroAt(introTime, reducedMotion);
    presentation.setIntro(frame);
    drivers.build = frame.assembly;
    // Lids stay shut until the wake band; the gaze finds the camera as they open.
    drivers.blink = 1 - frame.wake;
    drivers.attention = 0.25 + 0.4 * frame.wake;
    const scale = reducedMotion ? FORGE_INTRO.reducedSeconds / FORGE_INTRO.seconds : 1;
    if (!approachStarted && introTime >= FORGE_INTRO.approach.start * scale) {
      approachStarted = true;
      host.frameView(anchors.cameraRest.position, anchors.cameraRest.target, (FORGE_INTRO.approach.end - FORGE_INTRO.approach.start) * scale);
    }
    if (frame.done) introTime = null;
  } else {
    // Idle blinks, deterministic enough to look alive and cheap enough to ignore.
    if (clock >= nextBlink) {
      blinkPhase += deltaSeconds * 9;
      drivers.blink = Math.sin(Math.min(Math.PI, blinkPhase));
      if (blinkPhase >= Math.PI) {
        blinkPhase = 0;
        nextBlink = clock + 2.2 + 2.6 * ((Math.sin(clock * 7.3) + 1) / 2);
        drivers.blink = 0;
      }
    }
    drivers.attention = simulateAttention ? 0.85 : 0.25;
  }

  drivers.speak = simulateSpeech && drivers.build > 0.98 ? speechEnvelope(clock) : 0;
  drivers.speakTone = 0.5 + 0.3 * Math.sin(clock * 1.7);
  drivers.think = simulateThink ? 0.8 : 0;
  drivers.breath = clock * 1.1;

  face.setDrivers(drivers);
  face.update(deltaSeconds);
  const described = face.describe();
  presentation.setActivity({ speaking: described.speaking, build: described.build });
  presentation.update(deltaSeconds);
  render();
});

// ---------------------------------------------------------------------------
// HUD. Deliberately plain: it is a diagnostic, and it says SIMULATION in every state.
// ---------------------------------------------------------------------------

const hud = document.createElement("div");
hud.className = "llmx-preview-hud";
Object.assign(hud.style, {
  position: "fixed", left: "12px", top: "12px", zIndex: "60", maxWidth: "300px",
  padding: "10px 12px", borderRadius: "10px", background: "#0b1016e6", color: "#d6e2ea",
  font: "13px/1.45 var(--gx-font, system-ui, sans-serif)", border: "1px solid #2c3a48",
} satisfies Partial<CSSStyleDeclaration>);
const title = document.createElement("div");
title.innerHTML = "<b>LLMx — Forge preview</b><br><span style=\"color:#f0b05a;letter-spacing:1px;font-size:11px\">SIMULATION · aucune conversation, aucun audio</span>";
const readout = document.createElement("div");
readout.style.margin = "8px 0";
readout.style.whiteSpace = "pre";
readout.style.fontFamily = "ui-monospace, monospace";
readout.style.fontSize = "11px";
const buttons = document.createElement("div");
Object.assign(buttons.style, { display: "flex", flexWrap: "wrap", gap: "6px" });
const button = (label: string, action: () => void): HTMLButtonElement => {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  Object.assign(element.style, {
    font: "600 12px var(--gx-font, system-ui, sans-serif)", padding: "6px 9px", borderRadius: "7px",
    border: "1px solid #3d5062", background: "#17222d", color: "#e8f0f5", cursor: "pointer", minHeight: "32px",
  });
  element.addEventListener("click", () => { action(); render(); });
  buttons.append(element);
  return element;
};
button("Rejouer l'entrée", () => restartIntro());
button("Caméra repos", restCamera);
button("Caméra entrée", () => host.frameView(anchors.cameraEntry.position, anchors.cameraEntry.target, 0.9));
const speakButton = button("Parler (simulé)", () => { simulateSpeech = !simulateSpeech; });
const thinkButton = button("Penser (simulé)", () => { simulateThink = !simulateThink; });
const attentionButton = button("Attention (simulé)", () => { simulateAttention = !simulateAttention; });
const reducedButton = button("Mouvements réduits", () => { reducedMotion = !reducedMotion; });
hud.append(title, readout, buttons);
root.append(hud);

function render(): void {
  const phase = introTime !== null ? `entrée ${introTime.toFixed(1)}s` : "repos";
  const described = face.describe();
  readout.textContent =
    `visage   ${faceIsStandIn ? "stand-in (bloc)" : "rig voxel"}\n` +
    `phase    ${phase}${reducedMotion ? " · réduit" : ""}\n` +
    `build    ${described.build.toFixed(2)}   speak ${drivers.speak.toFixed(2)}\n` +
    `think    ${drivers.think.toFixed(2)}   attention ${drivers.attention.toFixed(2)}\n` +
    `profil   ${host.qualityProfile.name}   frames ${host.frameCount}`;
  const pressed = (element: HTMLButtonElement, on: boolean): void => {
    element.setAttribute("aria-pressed", String(on));
    element.style.background = on ? "#2b5a6e" : "#17222d";
  };
  pressed(speakButton, simulateSpeech);
  pressed(thinkButton, simulateThink);
  pressed(attentionButton, simulateAttention);
  pressed(reducedButton, reducedMotion);
}

if (params.get("intro") === "0") {
  restCamera();
} else {
  restartIntro(Number(params.get("t") ?? 0) || 0);
}
render();

// The probe surface for screenshots and for the face session to plug its rig in.
(window as unknown as { __LLMX_PREVIEW__: unknown }).__LLMX_PREVIEW__ = {
  host,
  forge,
  anchors,
  attachFace,
  drivers: (): PreviewDrivers => ({ ...drivers }),
  intro: { restart: restartIntro, time: (): number | null => introTime },
  setSpeaking: (on: boolean): void => { simulateSpeech = on; render(); },
  dispose: (): void => { unsubscribe(); presentation.dispose(); face.dispose(); hud.remove(); host.dispose(); },
};
