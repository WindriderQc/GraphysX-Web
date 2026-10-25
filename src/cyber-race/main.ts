import * as THREE from "three";
import { RaceAudio } from "./audio";
import { FilmPlayer } from "./film";
import { Music, Voice, type Theme } from "./music";
import { CHAPTERS, evolution, loadProgress, objectiveMet, objectiveText, saveProgress, type Chapter } from "./story";
import { GhostRecorder, courseSeed, formatTime, ghostAt, loadRecord, recordKey, saveRecord, type RunRecord } from "./records";
import { RaceInput, type PilotInput, type UiEvent } from "./input";
import { JOBE_LOOK, PETER_LOOK, createFlyer, type FlyerLook, type FlyerModel } from "./models";
import { mulberry32 } from "./textures";
import { PLANS, Track, type SectorKind } from "./track";
import { CYBERJOBE_AHEAD, GATE_BONUS, RaceWorld, createSkies, type Difficulty, type Obstacle } from "./world";

/*
 * Cyber Race: the two-player virtual race Jobe and Peter play in
 * The Lawnmower Man (1992, around 00:40:20 of the director's cut),
 * extended with two more boards taken from the film's other VR scenes.
 */

/** Length of one board (sector), per course setting. */
const COURSES = [
  { label: "COURT", perSector: 600 },
  { label: "NORMAL", perSector: 1000 },
  { label: "LONG", perSector: 1500 },
  { label: "MARATHON", perSector: 2300 }
];

const LEVELS: Array<{ label: string; diff: Difficulty }> = [
  { label: "FACILE", diff: { density: 0.6, plateSpan: 0.7, plateSpin: 0.3 } },
  { label: "NORMAL", diff: { density: 1.0, plateSpan: 0.95, plateSpin: 0.6 } },
  { label: "DIFFICILE", diff: { density: 1.5, plateSpan: 1.15, plateSpin: 0.9 } },
  { label: "BRUTAL", diff: { density: 2.2, plateSpan: 1.35, plateSpin: 1.3 } }
];

const MODES = ["2 JOUEURS", "1 JOUEUR CONTRE L'ORDINATEUR"];
const PLAN_KEYS = ["film", "extended", "ultimate"] as const;
const PLAN_LABELS = ["3 TABLEAUX DU FILM", "7 TABLEAUX", "9 TABLEAUX (+ INSPIRÉS)"];

const CRUISE = 62;
const BOOST = 50;
const DRAFT = 12;
const LAT_ACC = 70;
const LAT_MAX = 17;
const CHEVRONS = 14;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById("race-canvas") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setScissorTest(true);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType("local");

const scene = new THREE.Scene();
const fog = new THREE.FogExp2(0x061416, 0.008);
scene.fog = fog;
const background = new THREE.Color(0x050b0d);
scene.background = background;
const skies = createSkies();
scene.add(skies.circuit, skies.sunset, skies.hexdots, skies.furnace);
scene.add(new THREE.HemisphereLight(0xa8d4e0, 0x10181c, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(0.4, 1, 0.3);
scene.add(sun);

const audio = new RaceAudio();
const film = new FilmPlayer(document.body);
const voice = new Voice();
let music: Music | null = null;

/** Pick the soundtrack for what is on screen (board of the leading pilot, menu, silence under clips). */
function updateMusic(): void {
  if (!music && audio.context && audio.output) music = new Music(audio.context, audio.output);
  if (!music) return;
  if (film.playing || !settings.sound) {
    if (music.current) music.stop();
    return;
  }
  let theme: Theme = "menu";
  if (track && (phase === "race" || phase === "countdown")) {
    const lead = Math.max(...pilots.filter((p) => p.active).map((p) => p.s));
    theme = track.sectorAt(lead).kind as Theme;
  }
  music.play(theme);
  music.urgency = world ? world.rage : 0;
}
/** Seconds the menu has been left alone (starts the film attract loop). */
let menuIdle = 0;
const input = new RaceInput();
input.onActivity = () => {
  if (settings.sound) audio.ensure();
};

// ---------------------------------------------------------------- light trails
class Trail {
  readonly mesh: THREE.Mesh;
  private readonly points: THREE.Vector3[] = [];
  private readonly sides: THREE.Vector3[] = [];
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly color: THREE.Color;
  private readonly geometry = new THREE.BufferGeometry();

  constructor(color: number, private readonly length = 40, private readonly width = 0.3) {
    this.color = new THREE.Color(color).multiplyScalar(0.85);
    this.positions = new Float32Array(length * 6);
    this.colors = new Float32Array(length * 6);
    const index: number[] = [];
    for (let i = 0; i < length - 1; i += 1) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geometry.setIndex(index);
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    // Fades out close to whichever camera is drawing, so a rival's ribbon
    // never fills the screen when it passes beside the viewer.
    const material = new THREE.ShaderMaterial({
      vertexShader: `
        attribute vec3 color;
        varying vec3 vColor;
        varying float vDepth;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vColor;
        varying float vDepth;
        void main() {
          gl_FragColor = vec4(vColor * smoothstep(4.0, 14.0, vDepth), 1.0);
        }`,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
  }

  reset(): void {
    this.points.length = 0;
    this.sides.length = 0;
    this.positions.fill(0);
    this.colors.fill(0);
    (this.geometry.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
  }

  push(point: THREE.Vector3, side: THREE.Vector3): void {
    this.points.unshift(point.clone());
    this.sides.unshift(side.clone());
    if (this.points.length > this.length) {
      this.points.pop();
      this.sides.pop();
    }
    const n = this.points.length;
    for (let i = 0; i < this.length; i += 1) {
      const k = Math.min(i, n - 1);
      const p = this.points[k];
      const sd = this.sides[k];
      const fade = Math.pow(1 - i / this.length, 1.6);
      const w = this.width * (0.35 + 0.65 * fade);
      const o = i * 6;
      this.positions[o] = p.x + sd.x * w;
      this.positions[o + 1] = p.y + sd.y * w;
      this.positions[o + 2] = p.z + sd.z * w;
      this.positions[o + 3] = p.x - sd.x * w;
      this.positions[o + 4] = p.y - sd.y * w;
      this.positions[o + 5] = p.z - sd.z * w;
      const c = i < n ? fade : 0;
      for (const j of [0, 3]) {
        this.colors[o + j] = this.color.r * c;
        this.colors[o + j + 1] = this.color.g * c;
        this.colors[o + j + 2] = this.color.b * c;
      }
    }
    (this.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
  }
}

// ---------------------------------------------------------------- sparks
/** Soft round dot so sparks are not drawn as squares. */
function roundSprite(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(255,255,255,0.6)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(canvas);
}

class Sparks {
  readonly points: THREE.Points;
  private readonly max = 600;
  private readonly pos = new Float32Array(600 * 3);
  private readonly col = new Float32Array(600 * 3);
  private readonly vel = new Float32Array(600 * 3);
  private readonly life = new Float32Array(600);
  private next = 0;

  constructor() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("color", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        size: 0.22,
        map: roundSprite(),
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false
      })
    );
    this.points.frustumCulled = false;
  }

  burst(at: THREE.Vector3, color: THREE.Color, count: number, speed: number): void {
    for (let n = 0; n < count; n += 1) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      v.multiplyScalar(speed * (0.3 + Math.random()));
      at.toArray(this.pos, i * 3);
      v.toArray(this.vel, i * 3);
      this.life[i] = 0.4 + Math.random() * 0.5;
      color.toArray(this.col, i * 3);
    }
  }

  clear(): void {
    this.life.fill(0);
    this.col.fill(0);
  }

  update(dt: number): void {
    for (let i = 0; i < this.max; i += 1) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const o = i * 3;
      const alive = this.life[i] > 0;
      for (let j = 0; j < 3; j += 1) {
        this.pos[o + j] += this.vel[o + j] * dt;
        this.vel[o + j] *= 1 - dt * 2;
        this.col[o + j] = alive ? this.col[o + j] * 0.985 : 0;
      }
    }
    (this.points.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
  }
}

const sparks = new Sparks();
scene.add(sparks.points);

// ---------------------------------------------------------------- screen HUD (one per pilot)
class Hud {
  readonly root: HTMLDivElement;
  private readonly score: HTMLDivElement;
  private readonly place: HTMLDivElement;
  private readonly speed: HTMLDivElement;
  private readonly msg: HTMLDivElement;
  private readonly flashEl: HTMLDivElement;
  private readonly rival: HTMLDivElement;
  private readonly progress: HTMLDivElement;
  private readonly chevrons: HTMLElement[] = [];
  private readonly dots: HTMLDivElement[] = [];
  private marks: HTMLElement[] = [];
  private readonly lcd: HTMLDivElement;
  private readonly lock: HTMLDivElement;
  private readonly washEl: HTMLDivElement;
  private msgTimer = 0;
  private flashTimer = 0;
  private washTimer = 0;
  messageText = "";

  constructor(container: HTMLElement, name: string, color: string) {
    this.root = document.createElement("div");
    this.root.className = "hud hidden";
    this.root.style.setProperty("--pilot", color);
    this.root.innerHTML = `
      <div class="cross-v"></div><div class="cross-h"></div>
      <svg class="pads" viewBox="0 0 400 80" preserveAspectRatio="none">
        <path d="M0 80 L0 38 Q40 18 92 26 L118 40 L112 80 Z" fill="#2a2c9a" stroke="#14165a" stroke-width="2"/>
        <path d="M400 80 L400 38 Q360 18 308 26 L282 40 L288 80 Z" fill="#2a2c9a" stroke="#14165a" stroke-width="2"/>
        <path d="M96 30 l10 -8 l4 10 Z M104 40 l12 -6 l0 10 Z M300 30 l-10 -8 l-4 10 Z M296 40 l-12 -6 l0 10 Z" fill="#e8d23a"/>
        <path d="M350 36 l9 14 l-5 0 l0 14 l-8 0 l0 -14 l-5 0 Z" fill="#e040d0"/>
      </svg>
      <div class="chev"></div>
      <div class="name">${name}</div>
      <div class="place"></div>
      <div class="score">00000</div>
      <div class="rival hidden"></div>
      <div class="progress"></div>
      <div class="speed"></div>
      <div class="lcd hidden"></div>
      <div class="lock hidden"><i></i><i></i><i></i><i></i></div>
      <div class="msg"></div>
      <div class="wash"></div>
      <div class="flash"></div>`;
    container.appendChild(this.root);
    const q = <T extends Element>(sel: string): T => this.root.querySelector(sel) as T;
    this.score = q(".score");
    this.place = q(".place");
    this.speed = q(".speed");
    this.msg = q(".msg");
    this.flashEl = q(".flash");
    this.rival = q(".rival");
    this.progress = q(".progress");
    this.lcd = q(".lcd");
    this.lock = q(".lock");
    this.washEl = q(".wash");
    const chev = q<HTMLDivElement>(".chev");
    for (let i = 0; i < CHEVRONS; i += 1) {
      const c = document.createElement("i");
      chev.appendChild(c);
      this.chevrons.push(c);
    }
    for (const pilotColor of ["var(--p1)", "var(--p2)"]) {
      const dot = document.createElement("div");
      dot.className = "dot";
      dot.style.background = pilotColor;
      this.progress.appendChild(dot);
      this.dots.push(dot);
    }
  }

  layout(left: number, width: number, visible: boolean): void {
    this.root.style.left = `${left}%`;
    this.root.style.width = `${width}%`;
    this.root.classList.toggle("hidden", !visible);
  }

  setSectors(track: Track): void {
    this.marks.forEach((m) => m.remove());
    this.marks = track.sectors.slice(0, -1).map((sector) => {
      const mark = document.createElement("b");
      mark.style.left = `${(sector.end / track.raceLength) * 100}%`;
      this.progress.insertBefore(mark, this.dots[0]);
      return mark;
    });
  }

  message(text: string, seconds: number, big = false, tone: "normal" | "warning" | "alert" = "normal"): void {
    this.messageText = text;
    this.msg.textContent = text;
    this.msg.classList.toggle("big", big);
    this.msg.classList.toggle("warning", tone === "warning");
    this.msg.classList.toggle("alert", tone === "alert");
    this.msg.style.opacity = "1";
    this.msgTimer = seconds;
  }

  clearMessage(): void {
    this.msgTimer = 0;
    this.messageText = "";
    this.msg.style.opacity = "0";
  }

  flash(): void {
    this.flashEl.classList.add("on");
    this.flashTimer = 0.12;
  }

  /** White-pink wash, as the film's screen flares on a burst of speed (00:40:54). */
  wash(): void {
    this.washEl.classList.add("on");
    this.washTimer = 0.1;
  }

  /** Cyberjobe's LCD timer (02:08:30): null hides it. */
  setTimer(seconds: number | null): void {
    this.lcd.classList.toggle("hidden", seconds === null);
    if (seconds === null) return;
    const s = Math.max(0, Math.ceil(seconds));
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    this.lcd.innerHTML = `<b>${mm}</b><i>m</i><b>${ss}</b><i>s</i>`;
    this.lcd.classList.toggle("urgent", s <= 10);
  }

  /** Red lock-on marks around the rival (percent of this HUD), or null to hide. */
  setLock(x: number | null, y = 0, size = 0): void {
    this.lock.classList.toggle("hidden", x === null);
    if (x === null) return;
    this.lock.style.left = `${x}%`;
    this.lock.style.top = `${y}%`;
    this.lock.style.setProperty("--lock", `${size}px`);
  }

  update(p: Pilot, other: Pilot, track: Track, dt: number, showRival: boolean): void {
    this.score.textContent = String(p.score).padStart(5, "0");
    const lit = Math.round((p.energy / 100) * CHEVRONS);
    for (let i = 0; i < CHEVRONS; i += 1) {
      this.chevrons[i].classList.toggle("on", CHEVRONS - 1 - i < lit);
    }
    this.root.classList.toggle("boosting", p.boosting);
    this.place.textContent = isLeading(p, other) ? "1ER" : "2E";
    this.speed.textContent = `${Math.round(p.speed * 3.6)} KM/H${p.drafting ? " · ASPIRATION" : ""}`;
    this.dots[0].style.left = `${clamp(pilots[0].s / track.raceLength, 0, 1) * 100}%`;
    this.dots[1].style.left = `${clamp(pilots[1].s / track.raceLength, 0, 1) * 100}%`;
    this.rival.classList.toggle("hidden", !showRival);
    if (showRival) {
      this.rival.textContent = `${other.name} ${String(other.score).padStart(5, "0")}`;
    }
    if (this.msgTimer > 0) {
      this.msgTimer -= dt;
      if (this.msgTimer <= 0) {
        this.clearMessage();
      }
    }
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.flashEl.classList.remove("on");
    }
    if (this.washTimer > 0) {
      this.washTimer -= dt;
      if (this.washTimer <= 0) this.washEl.classList.remove("on");
    }
  }
}

// ---------------------------------------------------------------- pilots
interface Pilot {
  index: 0 | 1;
  name: string;
  look: FlyerLook;
  model: FlyerModel;
  trail: Trail;
  light: THREE.PointLight;
  camera: THREE.PerspectiveCamera;
  camPos: THREE.Vector3;
  camLat: THREE.Vector2;
  hud: Hud;
  s: number;
  prevS: number;
  speed: number;
  ox: number;
  oy: number;
  vx: number;
  vy: number;
  energy: number;
  bonus: number;
  score: number;
  hitTimer: number;
  shake: number;
  boosting: boolean;
  drafting: boolean;
  finished: boolean;
  place: number;
  finishTime: number;
  cpu: boolean;
  sectorIndex: number;
  noiseX: number;
  noiseY: number;
  rings: number;
  hits: number;
  /** Current roll around the line (0 level, ±π/2 on the side). */
  roll: number;
  destroyed: boolean;
  /** Test hook: let the computer fly a human pilot (still counted as human for records). */
  autopilot: boolean;
  recorder: GhostRecorder;
  /** False when the pilot sits out (solo story chapters). */
  active: boolean;
  /** Jobe's story growth: multipliers on cruise speed, turbo and lateral agility. */
  power: { cruise: number; boost: number; agility: number };
}

const hudContainer = document.getElementById("huds") as HTMLDivElement;

function makePilot(index: 0 | 1, name: string, look: FlyerLook, color: string): Pilot {
  const model = createFlyer(look);
  scene.add(model.root);
  const trail = new Trail(look.trail);
  scene.add(trail.mesh);
  const light = new THREE.PointLight(look.flame, 60, 30, 2);
  scene.add(light);
  return {
    index,
    name,
    look,
    model,
    trail,
    light,
    camera: new THREE.PerspectiveCamera(70, 1, 0.1, 2000),
    camPos: new THREE.Vector3(),
    camLat: new THREE.Vector2(),
    hud: new Hud(hudContainer, name, color),
    s: 0,
    prevS: 0,
    speed: 0,
    ox: 0,
    oy: 0,
    vx: 0,
    vy: 0,
    energy: 100,
    bonus: 0,
    score: 0,
    hitTimer: 0,
    shake: 0,
    boosting: false,
    drafting: false,
    finished: false,
    place: 0,
    finishTime: 0,
    cpu: false,
    sectorIndex: 0,
    noiseX: 0,
    noiseY: 0,
    rings: 0,
    hits: 0,
    roll: 0,
    destroyed: false,
    autopilot: false,
    recorder: new GhostRecorder(),
    active: true,
    power: { cruise: 1, boost: 1, agility: 1 }
  };
}

/** A pilot no longer racing: finished, destroyed or sitting out. */
function isDone(p: Pilot): boolean {
  return !p.active || p.finished || p.destroyed;
}

// ---------------------------------------------------------------- records and ghost
let currentKey = "";
let record: RunRecord | null = null;
let newRecord = false;
const ghostCursor = { index: 0 };
const ghost = createFlyer(JOBE_LOOK);
{
  const ghostMat = new THREE.MeshBasicMaterial({
    color: 0x3ff6ff,
    transparent: true,
    opacity: 0.42,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  ghost.root.traverse((child) => {
    if (child instanceof THREE.Mesh) child.material = ghostMat;
  });
  // Floating "RECORD" tag so the ghost never reads as the rival.
  const tag = document.createElement("canvas");
  tag.width = 256;
  tag.height = 64;
  const tctx = tag.getContext("2d") as CanvasRenderingContext2D;
  tctx.font = "900 40px Bahnschrift, Arial Black, sans-serif";
  tctx.textAlign = "center";
  tctx.fillStyle = "#3ff6ff";
  tctx.shadowColor = "#3ff6ff";
  tctx.shadowBlur = 10;
  tctx.fillText("RECORD", 128, 46);
  const label = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(tag), transparent: true, depthWrite: false, fog: false })
  );
  label.scale.set(3.2, 0.8, 1);
  label.position.set(0, 1.6, 0);
  ghost.root.add(label);
  ghost.root.visible = false;
  scene.add(ghost.root);
}

function placeGhost(): void {
  const t = track;
  const pose = record && t && (phase === "race" || phase === "countdown") ? ghostAt(record.ghost, raceTime, ghostCursor) : null;
  if (!pose || !t) {
    ghost.root.visible = false;
    return;
  }
  ghost.root.visible = true;
  t.toWorld(pose.s, pose.ox, pose.oy, ghost.root.position);
  t.basis(pose.s, ghost.root.quaternion);
  tmpE.set(0, 0, pose.roll);
  ghost.root.quaternion.multiply(tmpQ.setFromEuler(tmpE));
}

const pilots: [Pilot, Pilot] = [makePilot(0, "JOBE", JOBE_LOOK, "#c45cff"), makePilot(1, "PETER", PETER_LOOK, "#4f9bff")];

function isLeading(p: Pilot, other: Pilot): boolean {
  if (!other.active) return true;
  if (p.finished || other.finished) {
    return p.finished && (!other.finished || p.place < other.place);
  }
  return p.s > other.s || (p.s === other.s && p.index === 0);
}

// ---------------------------------------------------------------- settings
interface Settings {
  course: number;
  level: number;
  mode: number;
  plan: number;
  sound: boolean;
  /** The film's sighting lines across the HUD (off by default). */
  crosshair: boolean;
}

const SETTINGS_KEY = "graphysx.cyberRace.settings";
const settings: Settings = { course: 1, level: 1, mode: 0, plan: 0, sound: true, crosshair: false };
try {
  const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null") as Partial<Settings> | null;
  if (saved && typeof saved === "object") {
    const pick = (value: unknown, max: number, fallback: number): number =>
      Number.isInteger(value) && (value as number) >= 0 && (value as number) <= max ? (value as number) : fallback;
    settings.course = pick(saved.course, COURSES.length - 1, settings.course);
    settings.level = pick(saved.level, LEVELS.length - 1, settings.level);
    settings.mode = pick(saved.mode, MODES.length - 1, settings.mode);
    settings.plan = pick(saved.plan, PLAN_KEYS.length - 1, settings.plan);
    settings.sound = typeof saved.sound === "boolean" ? saved.sound : settings.sound;
    settings.crosshair = typeof saved.crosshair === "boolean" ? saved.crosshair : settings.crosshair;
  }
} catch {
  // Storage unavailable or corrupt: keep defaults.
}

function saveSettings(): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Not critical.
  }
}

// ---------------------------------------------------------------- DOM
const menuEl = document.getElementById("menu") as HTMLDivElement;
const helpEl = document.getElementById("help") as HTMLDivElement;
const pauseEl = document.getElementById("pause") as HTMLDivElement;
const overEl = document.getElementById("gameover") as HTMLDivElement;
const resultsEl = document.getElementById("results") as HTMLDivElement;
const dividerEl = document.getElementById("divider") as HTMLDivElement;
const captionEl = document.getElementById("menu-caption") as HTMLDivElement;
const statusEl = document.getElementById("menu-status") as HTMLDivElement;
const toastEl = document.getElementById("toast") as HTMLDivElement;
let toastTimer = 0;

function toast(text: string, seconds = 3): void {
  toastEl.textContent = text;
  toastEl.style.opacity = "1";
  toastTimer = seconds;
}

/** Vertical or horizontal list of buttons driven by keyboard and pads. */
class ChoiceList {
  private index = 0;
  readonly buttons: HTMLButtonElement[];

  constructor(root: HTMLElement, private readonly onPick: (choice: string) => void) {
    this.buttons = Array.from(root.querySelectorAll<HTMLButtonElement>(".choice"));
    this.buttons.forEach((b, i) => {
      b.tabIndex = -1;
      b.addEventListener("mousedown", (e) => e.preventDefault());
      b.addEventListener("click", () => {
        this.index = i;
        this.pick();
      });
      b.addEventListener("mouseenter", () => {
        this.index = i;
        this.render();
      });
    });
  }

  reset(): void {
    this.index = 0;
    this.render();
  }

  move(delta: number): void {
    this.index = (this.index + delta + this.buttons.length) % this.buttons.length;
    audio.click();
    this.render();
  }

  pick(): void {
    this.onPick(this.buttons[this.index].dataset.choice ?? "");
  }

  get labels(): string[] {
    return this.buttons.map((b) => b.textContent ?? "");
  }

  get focus(): number {
    return this.index;
  }

  render(): void {
    this.buttons.forEach((b, i) => b.classList.toggle("focus", i === this.index));
  }
}

const pauseChoices = new ChoiceList(pauseEl, (choice) => {
  if (choice === "resume") setPaused(false);
  else if (choice === "restart") startRace(false);
  else if (choice === "menu") showMenu();
});

const overChoices = new ChoiceList(overEl, (choice) => {
  if (choice === "again") startRace(false);
  else if (choice === "menu") {
    const fromStory = storyChapter !== null;
    showMenu();
    if (fromStory) openStory();
  }
});

// ---------------------------------------------------------------- race state
type Phase = "menu" | "countdown" | "race" | "over";
let phase: Phase = "menu";
let paused = false;
let track: Track | null = null;
let world: RaceWorld | null = null;
let raceTime = 0;
let countdown = 0;
let lastCount = 0;
let finishers = 0;
let endDeadline = Infinity;
let worldTime = 0;
let seed = 1992;

/** Cyberjobe's countdown over the final vortex (02:08-02:10). */
const finale = { started: false, exploded: false, left: 0, total: 0, lastTick: 0 };
const FINALE_SLACK = [1.35, 1.2, 1.08, 0.98];

// ---------------------------------------------------------------- VR (Quest through Link)
let vrSession: XRSession | null = null;
let vrSupported = false;
const rig = new THREE.Group();
const xrCamera = new THREE.PerspectiveCamera(70, 1, 0.05, 2000);
rig.add(xrCamera);
scene.add(rig);
const rigLat = new THREE.Vector2();
const flipY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

/** Panel floating below the view inside the headset: score, turbo, messages, menus. */
class VrHud {
  readonly mesh: THREE.Mesh;
  private readonly canvas = document.createElement("canvas");
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private timer = 0;

  constructor() {
    this.canvas.width = 1024;
    this.canvas.height = 512;
    this.ctx = this.canvas.getContext("2d") as CanvasRenderingContext2D;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 0.8),
      new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthTest: false, depthWrite: false, fog: false })
    );
    this.mesh.position.set(0, -0.55, -1.5);
    this.mesh.rotation.x = -0.35;
    this.mesh.renderOrder = 999;
    this.mesh.visible = false;
    rig.add(this.mesh);
  }

  update(dt: number, force = false): void {
    this.timer -= dt;
    if (this.timer > 0 && !force) return;
    this.timer = 1 / 15;
    const ctx = this.ctx;
    const p = pilots[0];
    const o = pilots[1];
    ctx.clearRect(0, 0, 1024, 512);
    ctx.fillStyle = "rgba(4,12,16,0.55)";
    ctx.fillRect(0, 300, 1024, 212);
    ctx.font = "900 72px Bahnschrift, Arial Black, sans-serif";
    ctx.fillStyle = "#6ff0b4";
    ctx.textAlign = "right";
    ctx.fillText(String(p.score).padStart(5, "0"), 1000, 390);
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(isLeading(p, o) ? "1ER" : "2E", 24, 390);
    ctx.font = "700 30px Bahnschrift, Arial Black, sans-serif";
    ctx.fillStyle = "#4f9bff";
    ctx.fillText(`${o.name} ${String(o.score).padStart(5, "0")}`, 24, 440);
    ctx.fillStyle = "#6ff0b4";
    ctx.textAlign = "right";
    ctx.fillText(`${Math.round(p.speed * 3.6)} KM/H`, 1000, 440);
    // Turbo bar.
    ctx.fillStyle = "#4a3b0c";
    ctx.fillRect(24, 468, 976, 22);
    ctx.fillStyle = p.boosting ? "#fff3a8" : "#e9b526";
    ctx.fillRect(24, 468, (976 * p.energy) / 100, 22);
    // Big centre line: countdown, sector, overlays.
    ctx.textAlign = "center";
    const overlay = phase === "over" ? overChoices : paused ? pauseChoices : null;
    if (overlay) {
      ctx.fillStyle = "rgba(10,20,40,0.85)";
      ctx.fillRect(112, 0, 800, 290);
      ctx.font = "900 64px Bahnschrift, Arial Black, sans-serif";
      ctx.fillStyle = phase === "over" ? "#ff4058" : "#ffffff";
      ctx.fillText(phase === "over" ? "GAME OVER" : "PAUSE", 512, 76);
      ctx.font = "700 34px Bahnschrift, Arial Black, sans-serif";
      overlay.labels.forEach((label, i) => {
        ctx.fillStyle = i === overlay.focus ? "#ffe14a" : "#c8d4dc";
        ctx.fillText(`${i === overlay.focus ? "▶ " : ""}${label}`, 512, 140 + i * 48);
      });
    } else if (finale.started && !finale.exploded) {
      ctx.font = "900 80px Bahnschrift, Arial Black, sans-serif";
      ctx.fillStyle = finale.left <= 10 ? "#ff4058" : "#bfe8ff";
      const s = Math.max(0, Math.ceil(finale.left));
      ctx.fillText(`${String(Math.floor(s / 60)).padStart(2, "0")}m ${String(s % 60).padStart(2, "0")}s`, 512, 200);
    } else if (p.hud.messageText) {
      ctx.font = "900 70px Bahnschrift, Arial Black, sans-serif";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(p.hud.messageText, 512, 200);
    }
    this.texture.needsUpdate = true;
  }
}

const vrHud = new VrHud();

async function checkVrSupport(): Promise<void> {
  try {
    vrSupported = Boolean(navigator.xr && (await navigator.xr.isSessionSupported("immersive-vr")));
  } catch {
    vrSupported = false;
  }
  refreshMenu();
}

async function enterVr(): Promise<void> {
  if (vrSession) return;
  if (!navigator.xr) {
    toast("Ce navigateur n'a pas WebXR : utilisez Edge ou Chrome sur le PC.", 5);
    return;
  }
  try {
    // Must start from a click or a key press (a gamepad button is not enough for the browser).
    const session = await navigator.xr.requestSession("immersive-vr", { optionalFeatures: ["local-floor"] });
    vrSession = session;
    session.addEventListener("end", () => {
      vrSession = null;
      vrHud.mesh.visible = false;
      input.setXrPads([]);
      renderer.setScissorTest(true);
      if (phase !== "menu") layoutHuds();
      refreshMenu();
    });
    await renderer.xr.setSession(session);
    vrHud.mesh.visible = true;
    startRace(true);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    toast(`Casque VR indisponible (${reason}). Branchez le Quest avec Link, puis cliquez ou appuyez sur Entrée.`, 6);
  }
}

function exitVr(): void {
  void vrSession?.end();
}

// ---------------------------------------------------------------- story mode
let storyChapter: Chapter | null = null;
let storyProgress = loadProgress();
let storyVerdict: { met: boolean; newlyDone: boolean } | null = null;

function twoPlayers(): boolean {
  return settings.mode === 0 && !vrSession && !storyChapter;
}

// ---------------------------------------------------------------- flow
function setPaused(value: boolean): void {
  paused = value;
  pauseEl.classList.toggle("hidden", !paused);
  document.body.classList.toggle("racing", !paused && (phase === "race" || phase === "countdown"));
  if (paused) {
    pauseChoices.reset();
    for (let i = 0; i < 2; i += 1) audio.engine(i, 0, false, false);
  }
  vrHud.update(0, true);
}

function startRace(newSeed: boolean): void {
  if (settings.sound) audio.ensure();
  audio.setMuted(!settings.sound);
  voice.muted = !settings.sound;
  // Fixed track per course: records and ghosts stay comparable.
  void newSeed;
  seed = storyChapter ? 7000 + storyChapter.id * 131 : courseSeed(settings.plan, settings.course);
  currentKey = storyChapter ? `graphysx.cyberRace.story.record.${storyChapter.id}` : recordKey(settings.plan, settings.course, settings.level);
  record = loadRecord(currentKey);
  ghostCursor.index = 0;
  newRecord = false;
  world?.dispose();
  const rng = mulberry32(seed);
  const plan: SectorKind[] = storyChapter ? storyChapter.plan : PLANS[PLAN_KEYS[settings.plan]];
  const perSector = storyChapter ? storyChapter.perSector : COURSES[settings.course].perSector;
  track = new Track(plan, perSector * plan.length, rng);
  world = new RaceWorld(track, LEVELS[storyChapter ? 1 : settings.level].diff, rng);
  storyVerdict = null;
  scene.add(world.group);
  sparks.clear();

  for (const p of pilots) {
    Object.assign(p, {
      s: 0,
      prevS: 0,
      speed: 0,
      ox: p.index === 0 ? -2.6 : 2.6,
      oy: -1,
      vx: 0,
      vy: 0,
      energy: 100,
      bonus: 0,
      score: 0,
      hitTimer: 0,
      shake: 0,
      boosting: false,
      drafting: false,
      finished: false,
      place: 0,
      finishTime: 0,
      sectorIndex: 0,
      rings: 0,
      hits: 0,
      roll: 0,
      destroyed: false
    });
    p.model.root.visible = true;
    p.hud.setTimer(null);
    p.hud.setLock(null);
    p.cpu = p.index === 1 && !twoPlayers();
    p.active = !(storyChapter && p.index === 1 && !storyChapter.rival);
    p.power = storyChapter && p.index === 0 ? evolution(storyProgress.completed) : { cruise: 1, boost: 1, agility: 1 };
    if (!p.active) p.s = p.prevS = -10000;
    p.model.root.visible = p.active;
    p.light.visible = p.active;
    p.trail.mesh.visible = p.active;
    p.trail.reset();
    p.recorder.reset();
    p.hud.setSectors(track);
    p.hud.clearMessage();
    placePilot(p, 0);
    updateCamera(p, 1, true);
  }
  updateRig(1, true);
  layoutHuds();
  finishers = 0;
  endDeadline = Infinity;
  raceTime = 0;
  Object.assign(finale, { started: false, exploded: false, left: 0, total: 0, lastTick: 0 });
  world.rage = 0;
  countdown = 3.6;
  lastCount = 4;
  phase = "countdown";
  menuEl.classList.add("hidden");
  overEl.classList.add("hidden");
  helpEl.classList.add("hidden");
  setPaused(false);
  for (const p of pilots) {
    p.hud.message(`TABLEAU 1 · ${track.sectors[0].info.name}`, 2.2);
  }
}

function showMenu(): void {
  if (vrSession) exitVr();
  storyChapter = null;
  for (const p of pilots) {
    p.active = true;
    p.model.root.visible = true;
    p.light.visible = true;
    p.trail.mesh.visible = true;
  }
  phase = "menu";
  paused = false;
  document.body.classList.remove("racing");
  menuEl.classList.remove("hidden");
  overEl.classList.add("hidden");
  pauseEl.classList.add("hidden");
  dividerEl.classList.add("hidden");
  for (const p of pilots) {
    p.hud.layout(0, 0, false);
  }
  for (let i = 0; i < 2; i += 1) {
    audio.engine(i, 0, false, false);
  }
  refreshMenu();
}

function layoutHuds(): void {
  if (twoPlayers()) {
    pilots[0].hud.layout(0, 50, true);
    pilots[1].hud.layout(50, 50, true);
    dividerEl.classList.remove("hidden");
  } else {
    pilots[0].hud.layout(0, 100, true);
    pilots[1].hud.layout(0, 0, false);
    dividerEl.classList.add("hidden");
  }
}

/** Keep the fastest human finish of this race if it beats the stored record. */
function settleRecord(): void {
  const humans = pilots.filter((p) => !p.cpu && p.finished && !p.destroyed);
  if (humans.length === 0) return;
  const best = humans.reduce((a, b) => (b.finishTime < a.finishTime ? b : a));
  if (record && record.time <= best.finishTime) return;
  const run: RunRecord = {
    name: best.name,
    time: Math.round(best.finishTime * 100) / 100,
    score: best.score,
    date: new Date().toISOString().slice(0, 10),
    ghost: best.recorder.samples.slice()
  };
  newRecord = saveRecord(currentKey, run);
  if (newRecord) record = run;
}

/** Judge a story chapter on Jobe's run and unlock the next one. */
function settleStory(): void {
  if (!storyChapter) return;
  const p = pilots[0];
  const met = objectiveMet(storyChapter.objective, {
    finished: p.finished,
    destroyed: p.destroyed,
    place: p.place,
    time: p.finishTime,
    rings: p.rings,
    hits: p.hits
  });
  const newlyDone = met && storyChapter.id > storyProgress.completed;
  if (newlyDone) {
    storyProgress = { completed: storyChapter.id };
    saveProgress(storyProgress);
  }
  storyVerdict = { met, newlyDone };
}

function endRace(): void {
  phase = "over";
  settleRecord();
  settleStory();
  voice.say(newRecord ? "Game over. New record." : "Game over.", true);
  document.body.classList.remove("racing");
  audio.gameOver();
  for (let i = 0; i < 2; i += 1) {
    audio.engine(i, 0, false, false);
  }
  const ranked = pilots.filter((p) => p.active).sort((a, b) => {
    const pa = a.place || 3;
    const pb = b.place || 3;
    return pa !== pb ? pa - pb : b.s - a.s;
  });
  resultsEl.innerHTML = ranked
    .map((p, i) => {
      const status = p.destroyed ? "DÉTRUIT PAR CYBERJOBE" : p.finished ? `${p.finishTime.toFixed(2)} s` : "N'A PAS FINI";
      const who = p.cpu ? `${p.name} (CPU)` : p.name;
      return `<div><div class="who" style="color:${p.index === 0 ? "#7a1fa8" : "#1f4fb0"}">${i === 0 ? "GAGNANT · " : ""}${who}</div>
        <div class="pts">${String(p.score).padStart(5, "0")}</div><div>${status}</div>
        <div class="stats">${p.rings} ANNEAUX · ${p.hits} CHOCS</div></div>`;
    })
    .join("");
  if (storyChapter && storyVerdict) {
    const grow = evolution(storyProgress.completed);
    resultsEl.insertAdjacentHTML(
      "afterbegin",
      `<div class="story-verdict ${storyVerdict.met ? "ok" : "ko"}">CHAPITRE ${storyChapter.id} · ${storyChapter.title}<br /><b>${storyVerdict.met ? "RÉUSSI" : "ÉCHEC"}</b><br />${objectiveText(storyChapter.objective)}${
        storyVerdict.newlyDone
          ? `<br /><span class="grow">JOBE ÉVOLUE · VITESSE +${Math.round((grow.cruise - 1) * 100)} % · TURBO +${Math.round((grow.boost - 1) * 100)} % · MANIABILITÉ +${Math.round((grow.agility - 1) * 100)} %</span>`
          : ""
      }</div>`
    );
  }
  resultsEl.insertAdjacentHTML(
    "beforeend",
    record
      ? `<div class="record${newRecord ? " new" : ""}">${newRecord ? "NOUVEAU RECORD !" : "RECORD"}<br /><b>${formatTime(record.time)}</b><br />${record.name} · ${record.date}</div>`
      : ""
  );
  const showResults = (): void => {
    if (phase !== "over") return;
    // White flash, then GAME OVER on brushed silver (00:41:25).
    overEl.classList.remove("hidden", "flashin");
    void overEl.offsetWidth;
    overEl.classList.add("flashin");
    overChoices.reset();
    vrHud.update(0, true);
  };
  if (film.has("outro") && !vrSession) {
    // The film's own ending first: checker line, GAME OVER, Jobe pulling the headset off.
    void film.play("outro", { muted: !settings.sound }).then(showResults);
  } else {
    showResults();
  }
}

// ---------------------------------------------------------------- simulation
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpV3 = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const sparkColor = new THREE.Color();

function pilotInput(p: Pilot): PilotInput {
  return p.cpu || p.autopilot ? cpuInput(p) : input.pilot(p.index);
}

function cpuInput(p: Pilot): PilotInput {
  const w = world as RaceWorld;
  let tx = 0;
  let ty = 0;
  for (const ring of w.rings) {
    if (ring.s > p.s + 140) break;
    if (ring.s > p.s + 3 && !ring.taken[p.index]) {
      tx = ring.ox;
      ty = ring.oy;
      break;
    }
  }
  const look = 30 + p.speed * 0.6;
  let danger = false;
  let roll = 0;
  for (let i = w.firstObstacleFrom(p.s); i < w.obstacles.length; i += 1) {
    const o: Obstacle = w.obstacles[i];
    if (o.s > p.s + look) break;
    if (o.kind === "plate") {
      const eta = (o.s - p.s) / Math.max(p.speed, 10);
      const gap = w.plateGap(o, worldTime + eta);
      const radius = (track as Track).boundAt(o.s) * 0.6;
      tx = Math.cos(gap) * radius;
      ty = Math.sin(gap) * radius;
      danger = true;
      break;
    }
    if (o.kind === "porthole") {
      tx = o.ox;
      ty = o.oy;
      danger = true;
      break;
    }
    if (o.kind === "blades" || o.kind === "slot") {
      const nx = -Math.sin(o.angle);
      const ny = Math.cos(o.angle);
      const across = (tx - o.ox) * nx + (ty - o.oy) * ny;
      tx -= nx * across;
      ty -= ny * across;
      if (o.kind === "slot" && o.s - p.s < 45) roll = 1;
      danger = true;
      break;
    }
    if (o.kind === "firewall") {
      // Head for the open cell nearest to where we are.
      const half = RaceWorld.NET_HALF;
      const cell = (half * 2) / 3;
      let best = Infinity;
      for (let i = 0; i < 9; i += 1) {
        if ((o.span & (1 << i)) === 0) continue;
        const cx = -half + cell * (i % 3) + cell / 2;
        const cy = -half + cell * Math.floor(i / 3) + cell / 2;
        const d = Math.hypot(cx - p.ox, cy - p.oy);
        if (d < best) {
          best = d;
          tx = cx;
          ty = cy;
        }
      }
      danger = true;
      break;
    }
    if (o.kind === "geyser") {
      const eta = (o.s - p.s) / Math.max(p.speed, 10);
      if (w.geyserActive(o, worldTime + eta) && Math.abs(tx - o.ox) < o.r + 3) {
        tx = o.ox + (tx >= o.ox ? 1 : -1) * (o.r + 4);
        danger = true;
      }
      continue;
    }
    if (o.kind === "beam") {
      const eta = (o.s - p.s) / Math.max(p.speed, 10);
      const a = w.beamAngle(o, worldTime + eta);
      const side = -p.ox * Math.sin(a) + p.oy * Math.cos(a) >= 0 ? 1 : -1;
      tx = -Math.sin(a) * side * 6;
      ty = Math.cos(a) * side * 6;
      danger = true;
      break;
    }
    if (o.kind === "log") {
      const need = 3;
      const d = w.logDistance(o, tx, ty);
      if (Math.abs(d) < need) {
        const side = w.logDistance(o, p.ox, p.oy) >= 0 ? 1 : -1;
        const shift = side * need - d;
        tx += -Math.sin(o.angle) * shift;
        ty += Math.cos(o.angle) * shift;
        danger = true;
      }
      break;
    }
    const need = o.r + 2.4;
    const dx = tx - o.ox;
    const dy = ty - o.oy;
    const d = Math.hypot(dx, dy);
    if (d < need) {
      if (d > 0.01) {
        tx = o.ox + (dx / d) * need;
        ty = o.oy + (dy / d) * need;
      } else {
        tx = o.ox + need;
      }
      danger = true;
    }
    if (o.s - p.s < 25 && Math.hypot(p.ox - o.ox, p.oy - o.oy) < need) {
      danger = true;
    }
  }
  for (const q of w.projectiles) {
    if (q.s < p.s || q.s > p.s + 60) continue;
    if (Math.hypot(tx - q.toX, ty - q.toY) < q.r + 2.5) {
      tx += (tx >= q.toX ? 1 : -1) * 4;
      danger = true;
    }
  }
  const floor = w.waveHeight(p.s + 25, tx, worldTime + 25 / Math.max(p.speed, 10));
  if (Number.isFinite(floor)) {
    ty = Math.max(ty, floor + 4);
    danger = true;
  }
  const bound = (track as Track).boundAt(p.s + 20) - 0.5;
  const tr = Math.hypot(tx, ty);
  if (tr > bound) {
    tx *= bound / tr;
    ty *= bound / tr;
  }
  p.noiseX = clamp(p.noiseX + (Math.random() - 0.5) * 0.6, -2.5, 2.5);
  p.noiseY = clamp(p.noiseY + (Math.random() - 0.5) * 0.6, -2.5, 2.5);
  // Steadier aim near set pieces that need precision.
  const sloppiness = (1 - settings.level * 0.25) * (danger ? 0.25 : 1);
  const ex = tx - p.ox + p.noiseX * sloppiness;
  const ey = ty - p.oy + p.noiseY * sloppiness;
  return {
    x: clamp(ex * 0.3 - p.vx * 0.1, -1, 1),
    y: clamp(ey * 0.3 - p.vy * 0.1, -1, 1),
    boost: !danger && p.energy > 30 && p.hitTimer <= 0,
    roll
  };
}

function hit(p: Pilot, dx: number, dy: number): void {
  p.speed = Math.max(14, p.speed * 0.3);
  p.hitTimer = 1.1;
  p.energy = Math.max(0, p.energy - 15);
  p.shake = 0.6;
  p.hits += 1;
  const len = Math.hypot(dx, dy) || 1;
  p.vx += (dx / len) * 10;
  p.vy += (dy / len) * 10;
  audio.hit();
  p.hud.flash();
  sparkColor.setHex(0xffd060);
  sparks.burst(p.model.root.position, sparkColor, 70, 14);
}

function collide(p: Pilot): void {
  const w = world as RaceWorld;
  if (p.hitTimer > 0) return;
  for (let i = w.projectiles.length - 1; i >= 0; i -= 1) {
    const q = w.projectiles[i];
    const ds = p.s - q.s;
    const dx = p.ox - q.ox;
    const dy = p.oy - q.oy;
    const rr = q.r + 0.9;
    if (ds * ds + dx * dx + dy * dy < rr * rr) {
      w.removeProjectile(i);
      hit(p, dx, dy);
      return;
    }
  }
  for (let i = w.firstObstacleFrom(p.s - 5); i < w.obstacles.length; i += 1) {
    const o = w.obstacles[i];
    if (o.s > p.s + 5) break;
    const push = w.collision(o, p.prevS, p.s, p.ox, p.oy, worldTime, p.roll);
    if (push) {
      if (o.kind === "plate" || o.kind === "porthole" || o.kind === "blades" || o.kind === "slot") p.s = o.s - 0.6;
      hit(p, push[0], push[1]);
      return;
    }
    const bonus = GATE_BONUS[o.kind];
    if (bonus && p.prevS < o.s && p.s >= o.s) {
      p.bonus += bonus;
      p.hud.message(`+${bonus}`, 0.8);
      if (!p.cpu) audio.gate();
    }
  }
}

function collectRings(p: Pilot): void {
  const w = world as RaceWorld;
  for (const ring of w.rings) {
    if (ring.s > p.s) break;
    if (ring.s <= p.prevS || ring.taken[p.index]) continue;
    if (Math.hypot(p.ox - ring.ox, p.oy - ring.oy) < ring.r - 0.3) {
      ring.taken[p.index] = true;
      ring.flash = 1;
      p.bonus += 1000;
      p.rings += 1;
      p.energy = Math.min(100, p.energy + 30);
      audio.ring();
      p.hud.message("+1000", 0.9);
      sparkColor.setHex(0x9ff8ff);
      sparks.burst(ring.mesh.position, sparkColor, 40, 9);
    }
  }
}

function updatePilot(p: Pilot, other: Pilot, dt: number): void {
  const t = track as Track;
  const racing = phase === "race";
  if (!p.active) return;
  if (p.destroyed) {
    p.speed = 0;
    p.boosting = false;
    p.drafting = false;
    return;
  }
  const control = pilotInput(p);

  // Knife-edge: roll onto the side to slip through narrow slots (00:41:17).
  const rollTarget = (control.roll * Math.PI) / 2;
  p.roll += (rollTarget - p.roll) * (1 - Math.exp(-7 * dt));

  // Lateral flight inside the cross-section.
  p.vx += control.x * LAT_ACC * p.power.agility * dt;
  p.vy += control.y * LAT_ACC * p.power.agility * dt;
  const damp = Math.exp(-3 * dt);
  p.vx *= damp;
  p.vy *= damp;
  const lat = Math.hypot(p.vx, p.vy);
  if (lat > LAT_MAX) {
    p.vx *= LAT_MAX / lat;
    p.vy *= LAT_MAX / lat;
  }
  p.ox += p.vx * dt;
  p.oy += p.vy * dt;
  const limit = t.boundAt(p.s);
  const rho = Math.hypot(p.ox, p.oy);
  if (rho > limit) {
    const nx = p.ox / rho;
    const ny = p.oy / rho;
    p.ox = nx * limit;
    p.oy = ny * limit;
    const out = p.vx * nx + p.vy * ny;
    if (out > 0) {
      p.vx -= nx * out * 1.4;
      p.vy -= ny * out * 1.4;
    }
    if (t.tubeAt(p.s) > 0 && racing) {
      p.speed *= 1 - 0.6 * dt;
      if (Math.random() < 0.5) {
        sparkColor.setHex(0x8cff9a);
        sparks.burst(p.model.root.position, sparkColor, 3, 6);
      }
    }
  }

  // The golden sheet is solid: crests that reach a pilot knock it back up (01:14).
  const floor = (world as RaceWorld).waveHeight(p.s, p.ox, worldTime);
  if (Number.isFinite(floor) && p.oy < floor + 1) {
    p.oy = floor + 1;
    if (p.vy < 4) p.vy = 4;
    if (racing && !p.finished && p.hitTimer <= 0) hit(p, 0, 1);
  }

  // Forward speed, turbo and slipstream.
  const wasBoosting = p.boosting;
  p.hitTimer = Math.max(0, p.hitTimer - dt);
  p.shake = Math.max(0, p.shake - dt);
  p.boosting = racing && !p.finished && control.boost && p.energy > 2 && p.hitTimer <= 0;
  p.energy = clamp(p.energy + (p.boosting ? -30 : 7) * dt, 0, 100);
  const ahead = other.s - p.s;
  p.drafting = racing && !p.finished && ahead > 3 && ahead < 22 && Math.hypot(p.ox - other.ox, p.oy - other.oy) < 3;
  if (p.boosting && !wasBoosting && !p.cpu) p.hud.wash();
  let target = racing ? CRUISE * p.power.cruise + (p.boosting ? BOOST * p.power.boost : 0) + (p.drafting ? DRAFT : 0) : 0;
  if (p.finished) {
    target = 30;
    // Coast to a halt in front of Cyberjobe rather than through him.
    if (world?.cyberjobe) target = 30 * clamp((t.raceLength + CYBERJOBE_AHEAD - 14 - p.s) / 18, 0, 1);
  }
  const rate = p.speed < target ? 0.9 : p.finished ? 3 : 1.6;
  p.speed += (target - p.speed) * (1 - Math.exp(-rate * dt));
  p.prevS = p.s;
  p.s = Math.min(p.s + p.speed * dt, t.totalLength - 30);
  if (p.finished && world?.cyberjobe) p.s = Math.min(p.s, t.raceLength + CYBERJOBE_AHEAD - 12);

  if (racing && !p.finished) {
    collide(p);
    collectRings(p);
  }

  const sector = t.sectorAt(p.s);
  if (sector.index !== p.sectorIndex && p.s < t.raceLength) {
    p.sectorIndex = sector.index;
    if (sector.kind === "wave") {
      // The film flashes a red WARNING as Jobe reaches into the network (01:14:35).
      p.hud.message("WARNING", 2.4, false, "warning");
      if (!p.cpu) {
        audio.warning();
        voice.say("Warning. Warning.", true);
      }
    } else {
      p.hud.message(`TABLEAU ${sector.index + 1} · ${sector.info.name}${sector.info.inspired ? " (INSPIRÉ)" : ""}`, 2.2);
      if (!p.cpu) audio.sector();
    }
  }

  if (!p.finished && p.s >= t.raceLength) {
    p.finished = true;
    finishers += 1;
    p.place = finishers;
    p.finishTime = raceTime;
    p.bonus += p.place === 1 ? 5000 : 2500;
    let extra = "";
    if (finale.started && !finale.exploded) {
      const saved = Math.ceil(finale.left) * 100;
      p.bonus += saved;
      extra = ` +${saved}`;
    }
    p.hud.message(p.place === 1 ? `ARRIVÉE · 1ER !${extra}` : `ARRIVÉE · 2E${extra}`, 4);
    audio.finish();
    if (finishers === 1) endDeadline = raceTime + 12;
  }
  p.score = Math.floor(Math.min(p.s, t.raceLength) * 15) + p.bonus;
}

function bump(a: Pilot, b: Pilot): void {
  if (Math.abs(a.s - b.s) > 2.5) return;
  let dx = a.ox - b.ox;
  let dy = a.oy - b.oy;
  let d = Math.hypot(dx, dy);
  if (d > 2) return;
  if (d < 0.01) {
    dx = 1;
    dy = 0;
    d = 1;
  }
  a.vx += (dx / d) * 7;
  a.vy += (dy / d) * 7;
  b.vx -= (dx / d) * 7;
  b.vy -= (dy / d) * 7;
}

function placePilot(p: Pilot, time: number): void {
  if (!p.active) return;
  const t = track as Track;
  const root = p.model.root;
  t.toWorld(p.s, p.ox, p.oy, root.position);
  root.position.addScaledVector(t.upAt(p.s, tmpV), Math.sin(time * 2.2 + p.index * 2) * 0.12);
  t.basis(p.s, root.quaternion);
  const level = 1 - Math.min(1, Math.abs(p.roll) / (Math.PI / 2));
  tmpE.set(clamp(-p.vy * 0.025, -0.4, 0.4), 0, p.roll + clamp(p.vx * 0.05, -0.7, 0.7) * level);
  tmpQ.setFromEuler(tmpE);
  if (p.hitTimer > 0) {
    tmpQ2.setFromAxisAngle(tmpV2.set(0, 0, 1), p.hitTimer * 9);
    tmpQ.multiply(tmpQ2);
  }
  root.quaternion.multiply(tmpQ);

  const thrust = 0.6 + p.speed / 90 + (p.boosting ? 0.6 : 0);
  for (const flame of p.model.flames) {
    flame.scale.set(1, 1, thrust * (0.85 + Math.random() * 0.3));
  }
  p.light.position.copy(root.position);
  p.light.intensity = 40 + (p.boosting ? 60 : 0);

  // Vertical ribbon behind the feet: reads as a thin streak from the chase camera.
  const back = tmpV.copy(root.position).addScaledVector(t.tangent(p.s, tmpV2), -2.2);
  p.trail.push(back, t.upAt(p.s, tmpV3));
}

function updateCamera(p: Pilot, dt: number, snap = false): void {
  const t = track as Track;
  const camS = p.s - 9;
  let cx = p.ox * 0.72;
  let cy = p.oy * 0.72 + 2.6;
  const ta = t.tubeAt(camS);
  const tb = t.tubeAt(camS + 6);
  const tube = ta && tb ? Math.min(ta, tb) : ta || tb;
  if (tube > 0) {
    const r = Math.hypot(cx, cy);
    const lim = tube - 1.2;
    if (r > lim) {
      cx *= lim / r;
      cy *= lim / r;
    }
  }
  // Smooth only the lateral offset; the distance behind the pilot stays exact.
  if (snap) {
    p.camLat.set(cx, cy);
  } else {
    const k = 1 - Math.exp(-8 * dt);
    p.camLat.x += (cx - p.camLat.x) * k;
    p.camLat.y += (cy - p.camLat.y) * k;
  }
  t.toWorld(camS, p.camLat.x, p.camLat.y, p.camPos);
  const cam = p.camera;
  cam.position.copy(p.camPos);
  if (p.shake > 0) {
    cam.position.x += (Math.random() - 0.5) * p.shake;
    cam.position.y += (Math.random() - 0.5) * p.shake;
  }
  const up = t.upAt(p.s, tmpV2);
  up.applyAxisAngle(t.tangent(p.s, tmpV3), clamp(-p.vx * 0.012, -0.25, 0.25));
  cam.up.copy(up);
  cam.lookAt(t.toWorld(p.s + 12, p.ox * 0.85, p.oy * 0.85 + 0.4, tmpV));
  const fov = 68 + clamp((p.speed - CRUISE) * 0.25, -6, 16);
  if (Math.abs(cam.fov - fov) > 0.05) {
    cam.fov += (fov - cam.fov) * (snap ? 1 : 1 - Math.exp(-4 * dt));
    cam.updateProjectionMatrix();
  }
}

/** Headset seat: just behind and above Jobe, horizon locked to the line (no roll, no shake). */
function updateRig(dt: number, snap = false): void {
  if (!track) return;
  const p = pilots[0];
  const t = track;
  const s = p.s - 4.5;
  let cx = p.ox * 0.9;
  let cy = p.oy * 0.9 + 1.3;
  const tube = t.tubeAt(s);
  if (tube > 0) {
    const r = Math.hypot(cx, cy);
    const lim = tube - 1.2;
    if (r > lim) {
      cx *= lim / r;
      cy *= lim / r;
    }
  }
  if (snap) {
    rigLat.set(cx, cy);
  } else {
    const k = 1 - Math.exp(-6 * dt);
    rigLat.x += (cx - rigLat.x) * k;
    rigLat.y += (cy - rigLat.y) * k;
  }
  t.toWorld(s, rigLat.x, rigLat.y, rig.position);
  t.basis(p.s, rig.quaternion).multiply(flipY);
}

function updateFinale(dt: number): void {
  const t = track as Track;
  const w = world as RaceWorld;
  const last = t.sectors[t.sectors.length - 1];
  if (!finale.started) {
    if (Math.max(pilots[0].s, pilots[1].s) < last.start) return;
    finale.started = true;
    finale.total = ((t.raceLength - last.start) / CRUISE) * FINALE_SLACK[settings.level] + 1;
    finale.left = finale.total;
    finale.lastTick = Math.ceil(finale.left);
    for (const p of pilots) p.hud.message("CYBERJOBE !", 2.2, false, "alert");
    audio.warning();
    voice.say("Cyberjobe. Countdown initiated.", true);
  }
  if (finale.exploded) return;
  if (pilots.every(isDone)) return;
  finale.left -= dt;
  w.rage = clamp(1 - finale.left / finale.total, 0, 1);
  const whole = Math.ceil(finale.left);
  if (whole !== finale.lastTick) {
    finale.lastTick = whole;
    if (whole <= 10 && whole > 0) audio.tick(whole <= 3);
  }
  if (finale.left <= 0) {
    finale.exploded = true;
    audio.explode();
    voice.say("System destroyed.", true);
    for (const p of pilots) {
      if (p.finished) continue;
      p.destroyed = true;
      p.speed = 0;
      sparkColor.setHex(0xfff2c0);
      sparks.burst(p.model.root.position, sparkColor, 160, 22);
      p.model.root.visible = false;
      p.hud.message("DÉTRUIT PAR CYBERJOBE", 3, false, "alert");
      p.hud.flash();
    }
    endDeadline = Math.min(endDeadline, raceTime + 2.6);
  }
}

function step(dt: number): void {
  if (!track || !world) return;
  if (phase === "countdown") {
    countdown -= dt;
    const n = Math.ceil(countdown);
    if (n !== lastCount && n <= 3) {
      lastCount = n;
      if (n > 0) {
        audio.countdown(false);
        voice.say(["", "One", "Two", "Three"][n] ?? "", true);
        for (const p of pilots) p.hud.message(String(n), 0.9, true);
      }
    }
    if (countdown <= 0) {
      phase = "race";
      document.body.classList.add("racing");
      audio.countdown(true);
      voice.say("Go!", true);
      for (const p of pilots) p.hud.message("GO !", 1.0, true);
    }
  }
  if (phase === "race") raceTime += dt;
  worldTime += dt;
  const racers = pilots.filter((p) => p.active);
  world.update(worldTime, dt, racers.map((p) => p.s));
  if (phase === "race") {
    const flying = racers.filter((p) => !p.finished && !p.destroyed);
    world.updateBoss(
      worldTime,
      dt,
      Math.max(...racers.map((p) => p.s)),
      flying.map((p) => [p.ox, p.oy] as [number, number]),
      Math.min(...racers.map((p) => p.s))
    );
  }
  if (phase === "race" && world.cyberjobe) updateFinale(dt);
  updatePilot(pilots[0], pilots[1], dt);
  updatePilot(pilots[1], pilots[0], dt);
  if (phase === "race" && pilots[1].active) bump(pilots[0], pilots[1]);
  for (const p of pilots) {
    placePilot(p, worldTime);
    updateCamera(p, dt);
    audio.engine(p.index, p.speed, p.boosting, p.active && (phase === "race" || phase === "countdown"));
  }
  updateRig(dt);
  if (phase === "race") {
    for (const p of pilots) {
      if (!p.cpu && !p.finished && !p.destroyed) p.recorder.sample(raceTime, p.s, p.ox, p.oy, p.roll);
    }
  }
  placeGhost();
  sparks.update(dt);
  pilots[0].hud.update(pilots[0], pilots[1], track, dt, !twoPlayers() && pilots[1].active);
  pilots[1].hud.update(pilots[1], pilots[0], track, dt, false);
  const running = finale.started && !finale.exploded && !pilots.every(isDone);
  const timer = running ? finale.left : null;
  for (const p of pilots) p.hud.setTimer(timer);
  // Once everyone is home, hold the view a moment (Cyberjobe screams), then GAME OVER.
  if (phase === "race" && pilots.every(isDone)) {
    endDeadline = Math.min(endDeadline, raceTime + 3);
  }
  if (phase === "race" && raceTime > endDeadline) {
    endRace();
  }
}

// ---------------------------------------------------------------- render
let viewW = 0;
let viewH = 0;

function resize(): void {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w !== viewW || h !== viewH) {
    viewW = w;
    viewH = h;
    renderer.setSize(w, h, false);
  }
}

/** Sky, fog and background for whatever board a camera is in. */
function applyAtmosphere(s: number, at: THREE.Vector3): void {
  const info = (track as Track).sectorAt(s).info;
  skies.circuit.visible = info.sky === "circuit";
  skies.sunset.visible = info.sky === "sunset";
  skies.hexdots.visible = info.sky === "hexdots";
  skies.furnace.visible = info.sky === "furnace";
  skies.furnace.position.copy(at);
  skies.circuit.position.copy(at);
  skies.sunset.position.copy(at);
  skies.hexdots.position.copy(at);
  fog.density = info.fog;
  fog.color.setHex(info.fogColor);
  background.setHex(info.fogColor);
}

function renderView(p: Pilot, x: number, w: number): void {
  const cam = p.camera;
  const aspect = w / Math.max(1, viewH);
  if (Math.abs(cam.aspect - aspect) > 1e-3) {
    cam.aspect = aspect;
    cam.updateProjectionMatrix();
  }
  renderer.setViewport(x, 0, w, viewH);
  renderer.setScissor(x, 0, w, viewH);
  applyAtmosphere(p.s - 6, cam.position);
  renderer.render(scene, cam);
  updateLock(p, p.index === 0 ? pilots[1] : pilots[0]);
}

/** Red lock-on marks around the rival ahead, as in the film's pilot view (00:41:13-00:41:24). */
function updateLock(p: Pilot, other: Pilot): void {
  const ahead = other.s - p.s;
  if ((phase !== "race" && phase !== "countdown") || !other.active || other.destroyed || ahead < 4 || ahead > 140) {
    p.hud.setLock(null);
    return;
  }
  tmpV.copy(other.model.root.position).project(p.camera);
  if (tmpV.z > 1 || Math.abs(tmpV.x) > 0.95 || Math.abs(tmpV.y) > 0.95) {
    p.hud.setLock(null);
    return;
  }
  p.hud.setLock((tmpV.x * 0.5 + 0.5) * 100, (0.5 - tmpV.y * 0.5) * 100, clamp(1800 / ahead, 18, 90));
}

function render(): void {
  if (renderer.xr.isPresenting) {
    renderer.setScissorTest(false);
    if (track) applyAtmosphere(pilots[0].s - 4, rig.position);
    renderer.render(scene, xrCamera);
    return;
  }
  resize();
  if (!track || phase === "menu") {
    renderer.setScissor(0, 0, viewW, viewH);
    renderer.setViewport(0, 0, viewW, viewH);
    renderer.clear();
    return;
  }
  if (twoPlayers()) {
    const half = Math.floor(viewW / 2);
    renderView(pilots[0], 0, half);
    renderView(pilots[1], half, viewW - half);
  } else {
    renderView(pilots[0], 0, viewW);
  }
}

// ---------------------------------------------------------------- menu
const menuButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("#menu-grid .ico"));
let focusIndex = menuButtons.findIndex((b) => b.dataset.action === "start");
type MenuGroup = "course" | "level" | "mode" | "plan";

function refreshMenu(): void {
  for (const b of menuButtons) {
    const group = b.dataset.group as MenuGroup | undefined;
    if (group) {
      b.classList.toggle("selected", Number(b.dataset.value) === settings[group]);
    }
    if (b.dataset.action === "sound") {
      b.classList.toggle("selected", settings.sound);
      const wave = b.querySelector<SVGPathElement>(".wave");
      if (wave) wave.style.opacity = settings.sound ? "1" : "0.15";
    }
    if (b.dataset.action === "vr") {
      b.classList.toggle("disabled", !vrSupported);
      b.classList.toggle("selected", Boolean(vrSession));
    }
    if (b.dataset.action === "crosshair") {
      b.classList.toggle("selected", settings.crosshair);
    }
    if (b.dataset.action === "fullscreen") {
      b.classList.toggle("selected", Boolean(document.fullscreenElement));
    }
    b.classList.toggle("focus", menuButtons[focusIndex] === b);
  }
  document.body.classList.toggle("crosshair", settings.crosshair);
  captionEl.textContent = `${PLAN_LABELS[settings.plan]} · PARCOURS ${COURSES[settings.course].label} · ${LEVELS[settings.level].label} · ${MODES[settings.mode]}`;
  const best = loadRecord(recordKey(settings.plan, settings.course, settings.level));
  captionEl.textContent += best ? ` · RECORD ${formatTime(best.time)} (${best.name})` : "";
  const pads = input.padCount();
  statusEl.textContent = `MANETTES : ${pads} · CASQUE VR : ${vrSupported ? "PRÊT (BOUTON LUNETTES)" : "NON DÉTECTÉ"}`;
}

function toggleFullscreen(): void {
  const done = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
  done.then(refreshMenu).catch(() => toast("Plein écran refusé : appuyez sur F11.", 3));
}

function quitGame(): void {
  // Online, "quit" means back to the GraphysX front door.
  if (window.location.protocol.startsWith("http")) {
    window.location.assign(new URL("./", window.location.href).href);
    return;
  }
  window.close();
  window.setTimeout(() => toast("Fermez la fenêtre avec Alt+F4 (le navigateur bloque la fermeture).", 4), 300);
}

function activate(b: HTMLButtonElement): void {
  audio.click();
  const group = b.dataset.group as MenuGroup | undefined;
  const action = b.dataset.action;
  if (group) {
    settings[group] = Number(b.dataset.value);
  } else if (action === "sound") {
    settings.sound = !settings.sound;
    if (settings.sound) audio.ensure();
    audio.setMuted(!settings.sound);
    film.setMuted(!settings.sound);
    voice.muted = !settings.sound;
  } else if (action === "story") {
    openStory();
    return;
  } else if (action === "crosshair") {
    settings.crosshair = !settings.crosshair;
    toast(settings.crosshair ? "Réticule du film activé" : "Réticule du film désactivé", 2);
  } else if (action === "help") {
    helpEl.classList.remove("hidden");
  } else if (action === "fullscreen") {
    toggleFullscreen();
  } else if (action === "vr") {
    if (vrSupported) void enterVr();
    else toast("Aucun casque : installez Meta Quest Link, branchez le Quest et activez Link.", 5);
  } else if (action === "quit") {
    quitGame();
  } else if (action === "start") {
    saveSettings();
    startRace(true);
    return;
  }
  saveSettings();
  refreshMenu();
}

for (const [i, b] of menuButtons.entries()) {
  b.tabIndex = -1;
  b.addEventListener("mousedown", (e) => e.preventDefault());
  b.addEventListener("click", () => {
    focusIndex = i;
    activate(b);
  });
}
helpEl.addEventListener("click", () => helpEl.classList.add("hidden"));

/** Move menu focus to the visually nearest button in a direction. */
function moveFocus(dx: number, dy: number): void {
  const from = menuButtons[focusIndex].getBoundingClientRect();
  let best = -1;
  let bestScore = Infinity;
  for (const [i, b] of menuButtons.entries()) {
    if (i === focusIndex) continue;
    const r = b.getBoundingClientRect();
    const vx = r.left - from.left;
    const vy = r.top - from.top;
    const along = vx * dx + vy * dy;
    if (along <= 4) continue;
    const score = along + (Math.abs(vx * dy) + Math.abs(vy * dx)) * 3;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  if (best >= 0) {
    focusIndex = best;
    audio.click();
    refreshMenu();
  }
}

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] } as const;

function handleEvents(events: UiEvent[]): void {
  if (events.length > 0) menuIdle = 0;
  if (film.playing) {
    if (events.some((e) => e.action === "ok" || e.action === "back" || e.action === "pause")) film.stop();
    return;
  }
  for (const { action, source } of events) {
    if (!helpEl.classList.contains("hidden")) {
      if (action === "ok" || action === "back" || action === "pause") helpEl.classList.add("hidden");
      continue;
    }
    if (phase === "menu" && handleStoryEvent(action)) continue;
    if (phase === "menu") {
      if (action in DIRS) {
        const [dx, dy] = DIRS[action as keyof typeof DIRS];
        moveFocus(dx, dy);
      } else if (action === "ok") {
        activate(menuButtons[focusIndex]);
      } else if (action === "pause" && source !== "key") {
        saveSettings();
        startRace(true);
      }
      continue;
    }
    if (phase === "over") {
      if (action === "left" || action === "up") overChoices.move(-1);
      else if (action === "right" || action === "down") overChoices.move(1);
      else if (action === "ok") overChoices.pick();
      else if (action === "pause") startRace(false);
      else if (action === "back" || action === "menu") showMenu();
      continue;
    }
    // countdown / race
    if (paused) {
      if (action === "up" || action === "left") pauseChoices.move(-1);
      else if (action === "down" || action === "right") pauseChoices.move(1);
      else if (action === "ok") pauseChoices.pick();
      else if (action === "pause" || action === "back") setPaused(false);
      else if (action === "menu") showMenu();
      continue;
    }
    // Xbox B stays free during the race; Escape, P, Start, View and Quest B pause.
    const pauses = action === "pause" || action === "menu" || (action === "back" && source !== "pad");
    if (pauses) setPaused(true);
  }
}

window.addEventListener("blur", () => {
  if (!vrSession && !paused && (phase === "race" || phase === "countdown")) setPaused(true);
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && !vrSession && !paused && (phase === "race" || phase === "countdown")) setPaused(true);
});
document.addEventListener("fullscreenchange", refreshMenu);
window.addEventListener("gamepadconnected", (e) => {
  toast(`Manette ${e.gamepad.index + 1} connectée`, 2);
  refreshMenu();
});
window.addEventListener("gamepaddisconnected", (e) => {
  toast(`Manette ${e.gamepad.index + 1} débranchée`, 3);
  if (phase === "race" && !paused) setPaused(true);
  refreshMenu();
});

// ---------------------------------------------------------------- story screens
const storyEl = document.getElementById("story") as HTMLDivElement;
const storyListEl = document.getElementById("story-list") as HTMLDivElement;
const chapterEl = document.getElementById("chapter") as HTMLDivElement;
let storyChoices: ChoiceList | null = null;
let chapterCard: Chapter | null = null;

function openStory(): void {
  storyProgress = loadProgress();
  storyListEl.innerHTML = CHAPTERS.map((ch) => {
    const done = ch.id <= storyProgress.completed;
    const locked = ch.id > storyProgress.completed + 1;
    const mark = done ? " ✓" : locked ? " · VERROUILLÉ" : "";
    return `<button class="choice${locked ? " locked" : ""}" data-choice="${ch.id}">${ch.id}. ${ch.title}${mark}</button>`;
  }).join("") + `<button class="choice" data-choice="back">RETOUR</button>`;
  storyChoices = new ChoiceList(storyEl, (choice) => {
    if (choice === "back") {
      closeStory();
      return;
    }
    const ch = CHAPTERS.find((c) => String(c.id) === choice);
    if (!ch) return;
    if (ch.id > storyProgress.completed + 1) {
      toast("Termine d'abord le chapitre précédent.", 2.5);
      return;
    }
    openChapter(ch);
  });
  const next = Math.min(storyProgress.completed, CHAPTERS.length - 1);
  storyChoices.reset();
  for (let i = 0; i < next; i += 1) storyChoices.move(1);
  menuEl.classList.add("hidden");
  storyEl.classList.remove("hidden");
}

function closeStory(): void {
  storyEl.classList.add("hidden");
  chapterEl.classList.add("hidden");
  storyChoices = null;
  chapterCard = null;
  menuEl.classList.remove("hidden");
  refreshMenu();
}

function openChapter(ch: Chapter): void {
  chapterCard = ch;
  const grow = evolution(storyProgress.completed);
  (chapterEl.querySelector(".ch-title") as HTMLElement).textContent = `CHAPITRE ${ch.id} · ${ch.title}`;
  (chapterEl.querySelector(".ch-source") as HTMLElement).textContent = ch.source.startsWith("inspiré") ? ch.source.toUpperCase() : `D'APRÈS LE FILM, ${ch.source}`;
  (chapterEl.querySelector(".ch-story") as HTMLElement).textContent = ch.story;
  (chapterEl.querySelector(".ch-goal") as HTMLElement).textContent = `OBJECTIF : ${objectiveText(ch.objective)}`;
  (chapterEl.querySelector(".ch-jobe") as HTMLElement).textContent =
    `JOBE · VITESSE ${Math.round(grow.cruise * 100)} % · TURBO ${Math.round(grow.boost * 100)} % · MANIABILITÉ ${Math.round(grow.agility * 100)} %`;
  storyEl.classList.add("hidden");
  chapterEl.classList.remove("hidden");
}

function startChapter(): void {
  const ch = chapterCard;
  if (!ch) return;
  chapterEl.classList.add("hidden");
  storyChoices = null;
  chapterCard = null;
  storyChapter = ch;
  saveSettings();
  if (film.has(ch.clip) && !vrSession) {
    void film.play(ch.clip, { title: `CHAPITRE ${ch.id} · ${ch.title}`, muted: !settings.sound }).then(() => {
      if (storyChapter === ch && phase === "menu") startRace(true);
    });
  } else {
    startRace(true);
  }
}

/** Story screens take menu input while open. Returns true when they consumed it. */
function handleStoryEvent(action: UiEvent["action"]): boolean {
  if (!chapterEl.classList.contains("hidden")) {
    if (action === "ok" || action === "pause") startChapter();
    else if (action === "back") {
      chapterEl.classList.add("hidden");
      openStory();
    }
    return true;
  }
  if (!storyEl.classList.contains("hidden") && storyChoices) {
    if (action === "up" || action === "left") storyChoices.move(-1);
    else if (action === "down" || action === "right") storyChoices.move(1);
    else if (action === "ok") storyChoices.pick();
    else if (action === "back") closeStory();
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- main loop
const clock = new THREE.Clock();
/** Test hook: stop the live loop's simulation so a check can pose an exact frame. */
let frozen = false;

function frame(): void {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  const session = renderer.xr.getSession();
  if (session) {
    input.setXrPads(
      Array.from(session.inputSources)
        .map((source) => source.gamepad)
        .filter((g): g is Gamepad => Boolean(g))
    );
  }
  input.poll(dt);
  handleEvents(input.takeEvents());
  if (phase !== "menu" && !paused && !frozen) {
    step(dt);
  }
  if (phase === "menu" && !film.playing && helpEl.classList.contains("hidden")) {
    menuIdle += dt;
    if (menuIdle > 30 && film.has("attract")) {
      menuIdle = 0;
      void film.play("attract", { loop: true, title: "APPUYEZ SUR START", muted: !settings.sound });
    }
  }
  if (vrSession) vrHud.update(dt);
  updateMusic();
  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0) toastEl.style.opacity = "0";
  }
  render();
}

refreshMenu();
void checkVrSupport();
// Film clips only ever come from a local install (file://, e.g. GamX); online the game never
// looks for them, so no film material is requested from the site. ?film=1 forces the probe.
const filmAllowed = window.location.protocol === "file:" || new URLSearchParams(window.location.search).has("film");
void (filmAllowed ? film.probe(["intro", "attract", "outro", ...CHAPTERS.map((c) => c.clip)]) : Promise.resolve()).then(async () => {
  if (!film.has("intro") || phase !== "menu") return;
  menuEl.classList.add("hidden");
  await film.play("intro", { title: "CYBER RACE 1992", muted: !settings.sound });
  if (phase === "menu") menuEl.classList.remove("hidden");
});
renderer.setAnimationLoop(frame);

// Exposed for automated checks in the browser.
(window as unknown as { cyberRace: unknown }).cyberRace = {
  get phase() {
    return phase;
  },
  get paused() {
    return paused;
  },
  pilots,
  settings,
  start: () => startRace(true),
  /** Advance the simulation by fixed 60 Hz steps, then draw one frame. */
  advance: (seconds: number) => {
    for (let i = 0; i < Math.round(seconds * 60); i += 1) {
      if (phase === "menu" || phase === "over" || paused) break;
      step(1 / 60);
    }
    render();
    return phase;
  },
  /** Freeze the live loop (rendering continues) for exact captures. */
  freeze: (value: boolean) => {
    frozen = value;
  },
  /** Feed menu actions as if a pad sent them. */
  ui: (actions: UiEvent["action"][], source: UiEvent["source"] = "pad") => {
    handleEvents(actions.map((action) => ({ action, source })));
    return { phase, paused };
  },
  get world() {
    return world;
  },
  finale,
  story: {
    open: () => openStory(),
    chapter: (id: number) => {
      const ch = CHAPTERS.find((c) => c.id === id);
      if (ch) openChapter(ch);
    },
    start: () => startChapter(),
    get progress() {
      return storyProgress;
    }
  }
};
