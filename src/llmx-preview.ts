import { BoxGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, type Object3D } from "three";
import { PlatformHost } from "./platform-host";
import { createForgeWorld, forgeIntroAt, forgeThinkingEmitter, FORGE_INTRO, LLMX_FACE_ANCHOR_ID, LLMX_THINKING_EMITTER_ID } from "./llmx-forge";
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
  describe: () => { build: number; speaking: boolean; level?: string; renderedLevel?: string };
  /**
   * Cap the rendered density to the viewing machine's profile. A property of the viewer, kept
   * out of the saved `level` on purpose: autosave on a phone must not write the phone's limit
   * into everyone's world. Called once at attach and again only when the host's profile changes.
   */
  setQualityCeiling?: (profile: "high" | "balanced" | "mobile") => void;
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

// The voxel rig lives in the face session's worktree. When its module is present next to this
// file it is attached automatically; when it is not, the glob matches nothing and the stand-in
// stays — so the harness runs on both sides of the split without either side editing the other.
type FaceRigModule = {
  AgentWorldVoxelFace: new (config: unknown) => PreviewFaceRig;
  resolveAgentWorldFace: (source: undefined) => unknown;
};
const rigModules = import.meta.glob<FaceRigModule>("./agent-world-face.ts");
const loadRig = rigModules["./agent-world-face.ts"];
if (loadRig) {
  loadRig()
    .then((module) => attachFace(new module.AgentWorldVoxelFace(module.resolveAgentWorldFace(undefined))))
    .catch((error: unknown) => { console.error("llmx-preview: voxel rig failed to load; keeping the stand-in", error); });
}

function attachFace(rig: PreviewFaceRig): void {
  anchorObject.remove(face.object);
  face.dispose();
  face = rig;
  faceIsStandIn = false;
  anchorObject.add(rig.object);
  rig.setDrivers(drivers);
  rig.setQualityCeiling?.(host.qualityProfile.name);
  render();
}

// The host announces a real profile change on its canvas (resize across a tier boundary); the
// ceiling follows it then and only then, so density never oscillates mid-conversation.
host.renderer.domElement.addEventListener("graphysx-render-profile-change", () => {
  face.setQualityCeiling?.(host.qualityProfile.name);
  render();
});

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
let gazeHold: { point: [number, number, number]; until: number } | null = null;
/** Diagnostic: pin the speak driver to a constant (e.g. 1 for the maximal mouth opening). */
let speakHold: number | null = null;
let creationCount = 0;
let cameraReturnAt: number | null = null;

/**
 * Simulate an accepted creation: an ordinary `api.spawn` of an ephemeral copper block dropped
 * into the build zone (the same call an agent's accepted proposal would make), then the
 * presentation accent and a two-second glance. What is simulated is the *decision*; the
 * object is real scene state and lands on the real floor collider.
 */
function simulateCreation(): void {
  const { center, radius } = anchors.buildZone;
  creationCount += 1;
  const angle = creationCount * 2.4;
  const spread = radius * 0.55;
  const x = center[0] + Math.cos(angle) * spread * ((creationCount % 3) / 3);
  const z = center[2] + Math.sin(angle) * spread * ((creationCount % 3) / 3);
  const receipt = host.api.spawn({
    id: `preview-creation-${creationCount}`,
    label: `Preview creation ${creationCount}`,
    type: creationCount % 2 === 0 ? "cylinder" : "box",
    transform: { position: [x, 1.4, z], rotationDegrees: [0, creationCount * 37, 0] },
    geometry: { width: 0.7, height: 0.7, depth: 0.7, radius: 0.36, radialSegments: 24 },
    material: { color: "#8a5a34", emissive: "#5a2c10", emissiveIntensity: 0.6, roughness: 0.35, metalness: 0.85 },
    physics: { mode: "dynamic", mass: 2 },
    castShadow: true,
    receiveShadow: true,
    ephemeral: true,
    tags: ["preview-creation"],
  });
  if (!receipt.ok) {
    console.error("llmx-preview: simulated creation refused", receipt.error);
    return;
  }
  presentation.announceCreation([x, center[1], z]);
  gazeHold = { point: [x, 0.5, z], until: clock + 2.2 };
  // Pull back so the visitor sees where it lands and the mask looking at it, then come home.
  host.frameView(anchors.cameraCreation.position, anchors.cameraCreation.target, 0.8);
  cameraReturnAt = clock + 3.4;
}

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

/** Mirrors `POSE_LIMITS.gazeRadians` in the rig: a full-scale gaze driver is this many radians. */
const GAZE_LIMIT_RADIANS = 0.34;
const clamp = (value: number, min: number, max: number): number => (value < min ? min : value > max ? max : value);

/** A syllable-like envelope: bursts of 1.4 s with 0.5 s gaps. Not speech; a stand-in for its amplitude. */
function speechEnvelope(t: number): number {
  const period = 1.9;
  const phase = t % period;
  if (phase > 1.4) return 0;
  const syllables = Math.max(0, Math.sin(phase * 11) * 0.55 + Math.sin(phase * 27) * 0.25 + 0.3);
  return Math.min(1, syllables);
}

/**
 * A synthetic stand-in voice, so "Parler (simulé)" is audible and — the part that matters — so
 * the mouth is driven the way the real one will be: from the amplitude of the audio actually
 * playing on this device (an AnalyserNode on the output bus), not from the envelope directly.
 * A buzzy vowel-ish tone with the syllable envelope on its gain and a slow formant sweep. It is
 * not speech and never will be; the real voice is VoiX, wired by the integrator.
 */
function createSimulatedVoice() {
  let context: AudioContext | null = null;
  let gain: GainNode | null = null;
  let filter: BiquadFilterNode | null = null;
  let analyser: AnalyserNode | null = null;
  let samples: Float32Array<ArrayBuffer> | null = null;
  return {
    /** Must run inside a user gesture: browsers refuse to start audio otherwise. */
    start(): void {
      if (context) { void context.resume(); return; }
      context = new AudioContext();
      const low = context.createOscillator();
      low.type = "sawtooth";
      low.frequency.value = 108;
      const high = context.createOscillator();
      high.type = "square";
      high.frequency.value = 216.5;
      const highGain = context.createGain();
      highGain.gain.value = 0.35;
      filter = context.createBiquadFilter();
      filter.type = "bandpass";
      filter.Q.value = 1.8;
      gain = context.createGain();
      gain.gain.value = 0;
      analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      samples = new Float32Array(analyser.fftSize);
      low.connect(filter);
      high.connect(highGain).connect(filter);
      filter.connect(gain).connect(analyser).connect(context.destination);
      low.start();
      high.start();
    },
    stop(): void {
      if (gain && context) gain.gain.setTargetAtTime(0, context.currentTime, 0.05);
    },
    /** Shape the tone from the envelope; the mouth does not read this, it reads level(). */
    drive(t: number, envelope: number): void {
      if (!context || !gain || !filter) return;
      gain.gain.setTargetAtTime(envelope * 0.16, context.currentTime, 0.02);
      filter.frequency.value = 420 + 760 * (0.5 + 0.5 * Math.sin(t * 1.7));
    },
    /** RMS of what is actually being played, 0–1. */
    level(): number {
      if (!analyser || !samples) return 0;
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i];
      return Math.min(1, Math.sqrt(sum / samples.length) * 22);
    },
    get active(): boolean { return context !== null; },
  };
}
const voice = createSimulatedVoice();

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

  // Gaze toward the camera, in the mask's frame: gazeX > 0 turns the eyes toward +X (the face
  // session's convention, confirmed 2026-09-13), normalised by the rig's 0.34 rad gaze limit.
  // Only once the eyes are open — a mask that tracks you before it wakes is not what the
  // choreography promises.
  if (drivers.build > 0.98 && drivers.blink < 0.5) {
    // A fresh creation holds the gaze for a moment, then the eyes return to the visitor.
    const focus = gazeHold && clock < gazeHold.until ? gazeHold.point : [host.camera.position.x, host.camera.position.y, host.camera.position.z];
    const dx = focus[0] - anchors.faceCenter[0];
    const dy = focus[1] - anchors.gazeTarget[1];
    const dz = focus[2] - anchors.faceCenter[2];
    drivers.gazeX = clamp(Math.atan2(dx, dz) / GAZE_LIMIT_RADIANS, -1, 1);
    drivers.gazeY = clamp(Math.atan2(dy, Math.hypot(dx, dz)) / GAZE_LIMIT_RADIANS, -1, 1);
  }

  if (simulateSpeech && drivers.build > 0.98) {
    const envelope = speechEnvelope(clock);
    voice.drive(clock, envelope);
    // With audio running the mouth follows the analyser, as it will with the real voice; without
    // a gesture (e.g. ?speak=1 on load) it falls back to the envelope so the motion is still visible.
    drivers.speak = voice.active ? voice.level() : envelope;
  } else {
    voice.stop();
    drivers.speak = 0;
  }
  if (speakHold !== null) drivers.speak = speakHold;
  drivers.speakTone = 0.5 + 0.3 * Math.sin(clock * 1.7);
  drivers.think = simulateThink ? 0.8 : 0;
  if (cameraReturnAt !== null && clock >= cameraReturnAt) {
    cameraReturnAt = null;
    restCamera();
  }
  drivers.breath = clock * 1.1;

  face.setDrivers(drivers);
  face.update(deltaSeconds);
  const described = face.describe();
  presentation.setActivity({ speaking: described.speaking, build: described.build, thinking: simulateThink });
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
const speakButton = button("Parler (simulé)", () => { simulateSpeech = !simulateSpeech; if (simulateSpeech) voice.start(); });
const thinkButton = button("Penser (simulé)", () => { simulateThink = !simulateThink; setThinkingEmitter(simulateThink); });

/** The thinking rings: an ordinary ephemeral emitter, spawned when thinking starts, removed when it ends. */
function setThinkingEmitter(on: boolean): void {
  const present = host.api.query({ ids: [LLMX_THINKING_EMITTER_ID] }).length === 1;
  if (on && !present) {
    const receipt = host.api.spawn(forgeThinkingEmitter(anchors));
    if (!receipt.ok) console.error("llmx-preview: thinking emitter refused", receipt.error);
  } else if (!on && present) {
    host.api.remove(LLMX_THINKING_EMITTER_ID);
  }
}
const attentionButton = button("Attention (simulé)", () => { simulateAttention = !simulateAttention; });
const reducedButton = button("Mouvements réduits", () => { reducedMotion = !reducedMotion; });
button("Créer (simulé)", simulateCreation);
hud.append(title, readout, buttons);
root.append(hud);

function render(): void {
  const phase = introTime !== null ? `entrée ${introTime.toFixed(1)}s` : "repos";
  const described = face.describe();
  readout.textContent =
    `visage   ${faceIsStandIn ? "stand-in (bloc)" : "rig voxel"}\n` +
    `phase    ${phase}${reducedMotion ? " · réduit" : ""}\n` +
    `build    ${described.build.toFixed(2)}   speak ${drivers.speak.toFixed(2)} ${voice.active ? "· son synthétique" : "· sans son"}\n` +
    `think    ${drivers.think.toFixed(2)}   attention ${drivers.attention.toFixed(2)}\n` +
    `profil   ${host.qualityProfile.name}   rendu ${described.renderedLevel ?? "-"} (monde ${described.level ?? "-"})\n` +
    `frames   ${host.frameCount}`;
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
  simulateCreation,
  holdSpeak: (value: number | null): void => { speakHold = value; },
  rig: (): PreviewFaceRig => face,
  dispose: (): void => { unsubscribe(); voice.stop(); presentation.dispose(); face.dispose(); hud.remove(); host.dispose(); },
};
