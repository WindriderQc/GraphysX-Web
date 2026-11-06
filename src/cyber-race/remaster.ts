import * as THREE from "three";
import type { Track } from "./track";

/*
 * "Notre version" look kit (docs/CYBER_RACE_NOTRE_VERSION.md). Quest first: nothing here relies
 * on a post-processing pass, which three.js cannot run inside a WebXR session. Glow comes from
 * tone-mapped emissive values, additive halos and shader pulses; reflections from a small neon
 * environment map.
 */

const TAU = Math.PI * 2;

/** Neon room baked once into a prefiltered environment map: chrome flyers, glossy panels. */
export function createNeonEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const room = new THREE.Scene();
  room.background = new THREE.Color(0x020406);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const strip = (color: number, intensity: number, pos: [number, number, number], size: [number, number, number]): void => {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity) });
    const mesh = new THREE.Mesh(box, mat);
    mesh.position.set(...pos);
    mesh.scale.set(...size);
    room.add(mesh);
  };
  // A soft white key above, green and magenta strips around, cyan floor lines.
  strip(0xffffff, 6, [0, 9, 0], [10, 0.2, 10]);
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * TAU;
    strip(i % 2 ? 0x3cff8a : 0xff3cc8, 4, [Math.cos(a) * 9, 1.5, Math.sin(a) * 9], [1.2, 6, 1.2]);
  }
  for (let i = -4; i <= 4; i += 2) strip(0x40d8ff, 2.5, [i * 2, -6, 0], [0.25, 0.1, 20]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(room, 0.03).texture;
  pmrem.dispose();
  box.dispose();
  room.traverse((child) => {
    if (child instanceof THREE.Mesh) (child.material as THREE.Material).dispose();
  });
  return env;
}

let haloTex: THREE.CanvasTexture | null = null;

/** Soft round glow, white; tint it with the sprite colour. */
export function haloTexture(): THREE.CanvasTexture {
  if (haloTex) return haloTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d") as CanvasRenderingContext2D;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.18, "rgba(255,255,255,0.55)");
  g.addColorStop(0.5, "rgba(255,255,255,0.12)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  haloTex = new THREE.CanvasTexture(c);
  haloTex.colorSpace = THREE.SRGBColorSpace;
  return haloTex;
}

/** Additive glow sprite: the headset-safe stand-in for bloom around a light source. */
export function makeHalo(color: number, size: number, strength = 1): THREE.Sprite {
  const material = new THREE.SpriteMaterial({
    map: haloTexture(),
    color: new THREE.Color(color).multiplyScalar(strength),
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.setScalar(size);
  return sprite;
}

/**
 * Tube along the line between s0 and s1 with a radius that may vary along it. Normals point
 * outwards (draw with BackSide). uv.x is the distance along the line in metres, uv.y the angle
 * around it in turns, so shaders can pulse along the board.
 */
export function profiledTube(
  track: Track,
  s0: number,
  s1: number,
  radiusAt: (s: number) => number,
  radial: number,
  step = 2
): THREE.BufferGeometry {
  const rows = Math.ceil((s1 - s0) / step) + 1;
  const cols = radial + 1;
  const pos = new Float32Array(rows * cols * 3);
  const nor = new Float32Array(rows * cols * 3);
  const uv = new Float32Array(rows * cols * 2);
  const c = new THREE.Vector3();
  const r = new THREE.Vector3();
  const u = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < rows; i += 1) {
    const s = Math.min(s1, s0 + i * step);
    track.position(s, c);
    track.rightAt(s, r);
    track.upAt(s, u);
    const radius = radiusAt(s);
    for (let j = 0; j < cols; j += 1) {
      const a = (j / radial) * TAU;
      n.copy(r).multiplyScalar(Math.cos(a)).addScaledVector(u, Math.sin(a));
      const k = (i * cols + j) * 3;
      pos[k] = c.x + n.x * radius;
      pos[k + 1] = c.y + n.y * radius;
      pos[k + 2] = c.z + n.z * radius;
      nor[k] = n.x;
      nor[k + 1] = n.y;
      nor[k + 2] = n.z;
      uv[(i * cols + j) * 2] = s;
      uv[(i * cols + j) * 2 + 1] = j / radial;
    }
  }
  const index: number[] = [];
  for (let i = 0; i < rows - 1; i += 1) {
    for (let j = 0; j < radial; j += 1) {
      const a = i * cols + j;
      const b = a + cols;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setIndex(index);
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geo;
}

export interface PulseUniforms {
  uTime: { value: number };
  uPulseColor: { value: THREE.Color };
  uAlertColor: { value: THREE.Color };
  /** Alert colour blends in from uAlert.x to uAlert.y (metres along the line). */
  uAlert: { value: THREE.Vector2 };
  /** Metres between pulses, pulse speed (m/s), pulse brightness. */
  uPulse: { value: THREE.Vector3 };
}

/**
 * Glossy tube wall whose emissive light runs in pulses along the board (uv.x in metres) and
 * turns to an alert colour over a stretch. Lit, fogged and tone-mapped like any standard
 * material, so it reads the same on screen and in the headset.
 */
export function pulseTubeMaterial(
  map: THREE.Texture,
  emissiveMap: THREE.Texture,
  options: { pulse: number; alert: number; alertFrom: number; alertTo: number; gap?: number; speed?: number; gain?: number }
): { material: THREE.MeshStandardMaterial; uniforms: PulseUniforms } {
  const uniforms: PulseUniforms = {
    uTime: { value: 0 },
    uPulseColor: { value: new THREE.Color(options.pulse) },
    uAlertColor: { value: new THREE.Color(options.alert) },
    uAlert: { value: new THREE.Vector2(options.alertFrom, options.alertTo) },
    uPulse: { value: new THREE.Vector3(options.gap ?? 36, options.speed ?? 30, options.gain ?? 2.2) }
  };
  const material = new THREE.MeshStandardMaterial({
    map,
    emissiveMap,
    emissive: 0xffffff,
    emissiveIntensity: 1,
    side: THREE.BackSide,
    roughness: 0.28,
    metalness: 0.55,
    envMapIntensity: 0.7
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vTrack;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvTrack = uv;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec2 vTrack;
uniform float uTime;
uniform vec3 uPulseColor;
uniform vec3 uAlertColor;
uniform vec2 uAlert;
uniform vec3 uPulse;`
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
{
  float alert = smoothstep(uAlert.x, uAlert.y, vTrack.x);
  vec3 tint = mix(uPulseColor, uAlertColor, alert);
  // Seams and traces glow in the board colour.
  totalEmissiveRadiance *= tint;
  // Rings of light running along the tube, brighter in the alert stretch.
  float phase = fract((vTrack.x - uTime * uPulse.y) / uPulse.x);
  float ring = smoothstep(0.86, 0.97, phase) * (1.0 - smoothstep(0.97, 1.0, phase));
  // A gentle flicker only: hard strobing at speed is harsh inside a headset.
  float flicker = 1.0 - 0.15 * alert * (0.5 + 0.5 * sin(uTime * 9.0 + vTrack.x * 0.3));
  totalEmissiveRadiance += tint * ring * uPulse.z * (1.0 + 0.35 * alert) * flicker;
}`
      );
  };
  material.customProgramCacheKey = () => "cyber-race-pulse-tube";
  return { material, uniforms };
}

/** Dark glossy panels with glowing seams and circuit traces: colour map and emissive mask. */
export function hyperPanelTextures(): { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture } {
  const size = 512;
  const make = (): [HTMLCanvasElement, CanvasRenderingContext2D] => {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    return [c, c.getContext("2d") as CanvasRenderingContext2D];
  };
  const [mc, m] = make();
  const [ec, e] = make();
  let seed = 7;
  const rnd = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  // Base panels: four columns, two rows, bevelled.
  m.fillStyle = "#0a1512";
  m.fillRect(0, 0, size, size);
  e.fillStyle = "#000";
  e.fillRect(0, 0, size, size);
  const cols = 4;
  const rows = 2;
  const pw = size / cols;
  const ph = size / rows;
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const px = x * pw;
      const py = y * ph;
      const g = m.createLinearGradient(px, py, px + pw, py + ph);
      g.addColorStop(0, "#1d3a33");
      g.addColorStop(1, "#0c1a17");
      m.fillStyle = g;
      m.fillRect(px + 6, py + 6, pw - 12, ph - 12);
      m.strokeStyle = "#3d6a5d";
      m.lineWidth = 2;
      m.strokeRect(px + 8, py + 8, pw - 16, ph - 16);
      // Circuit traces: right-angled runs ending in pads.
      e.strokeStyle = "rgba(255,255,255,0.55)";
      m.strokeStyle = "#2f5a4e";
      for (let k = 0; k < 4; k += 1) {
        let cx = px + 20 + rnd() * (pw - 40);
        let cy = py + 20 + rnd() * (ph - 40);
        e.beginPath();
        m.beginPath();
        e.moveTo(cx, cy);
        m.moveTo(cx, cy);
        for (let seg = 0; seg < 3; seg += 1) {
          if (seg % 2 === 0) cx = px + 20 + rnd() * (pw - 40);
          else cy = py + 20 + rnd() * (ph - 40);
          e.lineTo(cx, cy);
          m.lineTo(cx, cy);
        }
        e.lineWidth = 2;
        m.lineWidth = 3;
        e.stroke();
        m.stroke();
        e.fillStyle = "#fff";
        e.fillRect(cx - 3, cy - 3, 6, 6);
      }
    }
  }
  // Seams between panels: bright lines in the emissive mask.
  e.fillStyle = "#fff";
  for (let x = 0; x <= cols; x += 1) e.fillRect(x * pw - 2, 0, 4, size);
  for (let y = 0; y <= rows; y += 1) e.fillRect(0, y * ph - 2, size, 4);
  m.fillStyle = "#04100c";
  for (let x = 0; x <= cols; x += 1) m.fillRect(x * pw - 3, 0, 6, size);
  for (let y = 0; y <= rows; y += 1) m.fillRect(0, y * ph - 3, size, 6);
  const map = new THREE.CanvasTexture(mc);
  map.colorSpace = THREE.SRGBColorSpace;
  const emissive = new THREE.CanvasTexture(ec);
  emissive.colorSpace = THREE.SRGBColorSpace;
  for (const t of [map, emissive]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
  }
  return { map, emissive };
}

/** Yellow chevrons pointing forward, for boost pads (additive). */
export function chevronTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 256;
  const ctx = c.getContext("2d") as CanvasRenderingContext2D;
  ctx.fillStyle = "rgba(0,0,0,0)";
  ctx.clearRect(0, 0, 128, 256);
  for (let i = 0; i < 3; i += 1) {
    const y = 40 + i * 70;
    ctx.beginPath();
    ctx.moveTo(10, y + 40);
    ctx.lineTo(64, y);
    ctx.lineTo(118, y + 40);
    ctx.lineTo(118, y + 62);
    ctx.lineTo(64, y + 22);
    ctx.lineTo(10, y + 62);
    ctx.closePath();
    ctx.fillStyle = i === 0 ? "#fff6c0" : "#ffc020";
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Thin streaks of light hanging in the tube around a pilot. They stand still on the line, so
 * flying past them reads as speed; they stretch with the pilot's speed. World-space, so they
 * work in the headset as well as on screen.
 */
export class SpeedStreaks {
  readonly mesh: THREE.InstancedMesh;
  private readonly items: Array<{ s: number; ox: number; oy: number }> = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly sc = new THREE.Vector3();

  constructor(color: number, private readonly count = 90) {
    const geo = new THREE.BoxGeometry(0.035, 0.035, 1);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(1.6),
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0.55,
      depthWrite: false
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < count; i += 1) this.items.push({ s: -1e9, ox: 0, oy: 0 });
  }

  update(track: Track, s: number, ox: number, oy: number, speed: number, bound: (s: number) => number): void {
    const stretch = Math.max(0.6, speed * 0.07);
    for (let i = 0; i < this.count; i += 1) {
      const it = this.items[i];
      if (it.s < s - 6 || it.s > s + 140) {
        // Respawn ahead, around the pilot but never right on its path.
        it.s = s + 20 + Math.random() * 110;
        const limit = Math.max(2, bound(it.s) - 0.6);
        for (let tries = 0; tries < 4; tries += 1) {
          const a = Math.random() * TAU;
          const r = limit * Math.sqrt(0.15 + 0.85 * Math.random());
          it.ox = Math.cos(a) * r;
          it.oy = Math.sin(a) * r;
          if (Math.hypot(it.ox - ox, it.oy - oy) > 2.2) break;
        }
      }
      track.toWorld(it.s, it.ox, it.oy, this.p);
      track.basis(it.s, this.q);
      this.sc.set(1, 1, stretch);
      this.m.compose(this.p, this.q, this.sc);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
