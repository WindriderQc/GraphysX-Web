import * as THREE from "three";

export type Rng = () => number;

/** Small deterministic generator so a course seed always gives the same layout. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("2D canvas unavailable");
  }
  return [canvas, ctx];
}

function toTexture(canvas: HTMLCanvasElement, repeatX = 1, repeatY = 1): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

interface CircuitPalette {
  base: string;
  block: string;
  light: string;
  dark: string;
  trace: string;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Dark techno maze: the relief seen between the film's green tunnel rings. */
function drawCircuit(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  w: number,
  h: number,
  rng: Rng,
  palette: CircuitPalette
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, w, h);
  ctx.clip();
  ctx.fillStyle = palette.base;
  ctx.fillRect(x0, y0, w, h);

  const area = (w * h) / (256 * 256);
  for (let i = 0; i < 46 * area; i += 1) {
    const bw = 6 + rng() * 38;
    const bh = 6 + rng() * 38;
    const x = x0 + rng() * (w - bw);
    const y = y0 + rng() * (h - bh);
    ctx.fillStyle = palette.block;
    ctx.fillRect(x, y, bw, bh);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = palette.light;
    ctx.beginPath();
    ctx.moveTo(x, y + bh);
    ctx.lineTo(x, y);
    ctx.lineTo(x + bw, y);
    ctx.stroke();
    ctx.strokeStyle = palette.dark;
    ctx.beginPath();
    ctx.moveTo(x + bw, y);
    ctx.lineTo(x + bw, y + bh);
    ctx.lineTo(x, y + bh);
    ctx.stroke();
  }

  for (let i = 0; i < 70 * area; i += 1) {
    let x = x0 + Math.floor((rng() * w) / 4) * 4;
    let y = y0 + Math.floor((rng() * h) / 4) * 4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const steps = 3 + Math.floor(rng() * 6);
    for (let s = 0; s < steps; s += 1) {
      const len = 4 * (2 + Math.floor(rng() * 8));
      if (rng() < 0.5) {
        x = clamp(x + (rng() < 0.5 ? -len : len), x0, x0 + w);
      } else {
        y = clamp(y + (rng() < 0.5 ? -len : len), y0, y0 + h);
      }
      ctx.lineTo(x, y);
    }
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = palette.dark;
    ctx.stroke();
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = palette.trace;
    ctx.stroke();
  }
  ctx.restore();
}

const TEAL: CircuitPalette = {
  base: "#0a1c1f",
  block: "#14302f",
  light: "#3f7a76",
  dark: "#030a0b",
  trace: "#2c6461"
};

export function circuitTexture(seed = 7, repeatX = 1, repeatY = 1): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 256);
  drawCircuit(ctx, 0, 0, 256, 256, mulberry32(seed), TEAL);
  return toTexture(canvas, repeatX, repeatY);
}

/**
 * Tunnel wall texture: one bright green band (the film's polygon rings) followed by
 * circuit relief. U runs along the tunnel, V around it.
 */
export function tunnelTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 256);
  const band = 210;
  const grad = ctx.createLinearGradient(0, 0, band, 0);
  grad.addColorStop(0, "#1fae38");
  grad.addColorStop(0.12, "#36d851");
  grad.addColorStop(0.88, "#36d851");
  grad.addColorStop(1, "#1fae38");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, band, 256);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(10, 0, 6, 256);
  drawCircuit(ctx, band, 0, 512 - band, 256, mulberry32(11), TEAL);
  ctx.fillStyle = "#0c3a14";
  ctx.fillRect(band - 3, 0, 6, 256);
  ctx.fillRect(0, 0, 3, 256);
  return toTexture(canvas);
}

/** Light riveted metal used on the spiked mines and the floating triangle shards. */
export function rivetedMetalTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 256);
  const rng = mulberry32(23);
  ctx.fillStyle = "#a7bcc4";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i += 1) {
    const v = 150 + Math.floor(rng() * 60);
    ctx.fillStyle = `rgba(${v},${v + 12},${v + 18},0.25)`;
    ctx.fillRect(rng() * 256, rng() * 256, 2 + rng() * 6, 1 + rng() * 2);
  }
  const panels: Array<[number, number, number, number]> = [
    [4, 4, 120, 80],
    [132, 4, 120, 120],
    [4, 92, 120, 160],
    [132, 132, 56, 120],
    [196, 132, 56, 120]
  ];
  for (const [x, y, w, h] of panels) {
    ctx.strokeStyle = "#5f7680";
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h);
    ctx.strokeStyle = "#dbe8ec";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
    for (let px = x + 8; px < x + w - 4; px += 10) {
      rivet(ctx, px, y + 8);
      rivet(ctx, px, y + h - 8);
    }
    for (let py = y + 18; py < y + h - 12; py += 10) {
      rivet(ctx, x + 8, py);
      rivet(ctx, x + w - 8, py);
    }
  }
  return toTexture(canvas);
}

function rivet(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = "#4b5f68";
  ctx.beginPath();
  ctx.arc(x + 0.8, y + 0.8, 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#eef6f8";
  ctx.beginPath();
  ctx.arc(x - 0.4, y - 0.4, 1.2, 0, Math.PI * 2);
  ctx.fill();
}

export function checkerTexture(repeatX = 1, repeatY = 1): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(64, 64);
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      ctx.fillStyle = (x + y) % 2 === 0 ? "#f2f2f2" : "#111111";
      ctx.fillRect(x * 8, y * 8, 8, 8);
    }
  }
  const texture = toTexture(canvas, repeatX, repeatY);
  texture.magFilter = THREE.NearestFilter;
  return texture;
}

/** Red / tan / grey bands of the floating strips in the last sector. */
export function bandTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(64, 256);
  const rows: Array<[number, number, string]> = [
    [0, 90, "#c42a3e"],
    [90, 120, "#d9b98a"],
    [120, 150, "#8f9da3"],
    [150, 256, "#c42a3e"]
  ];
  for (const [a, b, color] of rows) {
    ctx.fillStyle = color;
    ctx.fillRect(0, a, 64, b - a);
  }
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(0, 4, 64, 6);
  return toTexture(canvas);
}

/** Blue hexagon cells with a few hot pink ones (the finale's hex world). */
export function hexTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 222; // two periods of offset hex rows (r = 37): tiles vertically
  const [canvas, ctx] = makeCanvas(w, h);
  const rng = mulberry32(31);
  ctx.fillStyle = "#06061c";
  ctx.fillRect(0, 0, w, h);
  const r = 37;
  const dx = r * Math.sqrt(3);
  const dy = r * 1.5;
  for (let row = -1; row <= Math.ceil(h / dy) + 1; row += 1) {
    for (let col = -1; col <= Math.ceil(w / dx) + 1; col += 1) {
      const cx = col * dx + (row % 2 === 0 ? 0 : dx / 2);
      const cy = row * dy;
      const roll = rng();
      const fill = roll < 0.08 ? "#ff3a8c" : roll < 0.16 ? "#6a72ff" : roll < 0.6 ? "#2c31d8" : "#3a3ff0";
      ctx.beginPath();
      for (let k = 0; k < 6; k += 1) {
        const a = Math.PI / 6 + (k * Math.PI) / 3;
        const px = cx + Math.cos(a) * (r - 4);
        const py = cy + Math.sin(a) * (r - 4);
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = "rgba(190,200,255,0.45)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
  return toTexture(canvas);
}

/** Diagonal purple / orange / white bands; spun on a cone it reads as a vortex. */
export function swirlTexture(): THREE.CanvasTexture {
  const size = 256;
  const [canvas, ctx] = makeCanvas(size, size);
  const img = ctx.createImageData(size, size);
  const rng = mulberry32(5);
  const noise = Array.from({ length: 64 }, () => rng());
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const n = noise[Math.floor(u * 8) + Math.floor(v * 8) * 8] * 0.35;
      const t = Math.sin((u * 3 + v * 2) * Math.PI * 2 + n * 4) * 0.5 + 0.5;
      const glow = Math.pow(Math.sin((u * 6 + v * 4) * Math.PI * 2) * 0.5 + 0.5, 8);
      const i = (y * size + x) * 4;
      img.data[i] = Math.min(255, 70 + t * 170 + glow * 120);
      img.data[i + 1] = Math.min(255, 20 + t * t * 90 + glow * 160);
      img.data[i + 2] = Math.min(255, 150 + (1 - t) * 90 + glow * 120);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(canvas);
}

/** Orange-red horizon fading to a black-purple top (the opening VR game's sky). */
export function sunsetTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(8, 256);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "#070310");
  g.addColorStop(0.3, "#2a0a2a");
  g.addColorStop(0.44, "#a8241c");
  g.addColorStop(0.5, "#f08a2a");
  g.addColorStop(0.53, "#5a2a12");
  g.addColorStop(1, "#140a06");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
