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

/** Cream lace tile with a dark lattice, as the acceleration sequence's spiral (01:01). */
export function ornateTileTexture(): THREE.CanvasTexture {
  const size = 128;
  const [canvas, ctx] = makeCanvas(size, size);
  ctx.fillStyle = "#f1e6cf";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "#2a1a2e";
  ctx.lineWidth = 3;
  ctx.strokeRect(6, 6, size - 12, size - 12);
  ctx.lineWidth = 2;
  const c = size / 2;
  // Eight-fold lattice: arcs and diagonals mirrored around the centre.
  for (let k = 0; k < 8; k += 1) {
    const a = (k * Math.PI) / 4;
    ctx.beginPath();
    ctx.arc(c + Math.cos(a) * 30, c + Math.sin(a) * 30, 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.lineTo(c + Math.cos(a) * 56, c + Math.sin(a) * 56);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(c, c, 12, 0, Math.PI * 2);
  ctx.fillStyle = "#2a1a2e";
  ctx.fill();
  for (const [x, y] of [[14, 14], [size - 14, 14], [14, size - 14], [size - 14, size - 14]]) {
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  return toTexture(canvas);
}

/** Dark blue with branching cyan lightning: the electric brain-globe (01:02, 01:14). */
export function lightningTexture(): THREE.CanvasTexture {
  const w = 1024;
  const h = 512;
  const [canvas, ctx] = makeCanvas(w, h);
  const rng = mulberry32(41);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#1a1a6a");
  g.addColorStop(0.5, "#2a2a9a");
  g.addColorStop(1, "#141450");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const bolt = (x: number, y: number, len: number, angle: number, width: number, depth: number): void => {
    ctx.beginPath();
    ctx.moveTo(x, y);
    let px = x;
    let py = y;
    const steps = 6 + Math.floor(rng() * 6);
    for (let i = 0; i < steps; i += 1) {
      angle += (rng() - 0.5) * 1.1;
      px += Math.cos(angle) * (len / steps);
      py += Math.sin(angle) * (len / steps);
      ctx.lineTo(px, py);
      if (depth < 2 && rng() < 0.25) bolt(px, py, len * 0.5, angle + (rng() - 0.5) * 1.6, width * 0.6, depth + 1);
    }
    ctx.lineWidth = width * 3;
    ctx.strokeStyle = "rgba(120,200,255,0.25)";
    ctx.stroke();
    ctx.lineWidth = width;
    ctx.strokeStyle = "#dff6ff";
    ctx.stroke();
  };
  for (let i = 0; i < 70; i += 1) {
    bolt(rng() * w, rng() * h, 60 + rng() * 160, rng() * Math.PI * 2, 1 + rng() * 2, 0);
  }
  for (let i = 0; i < 40; i += 1) {
    ctx.fillStyle = `rgba(${200 + rng() * 55},${80 + rng() * 80},${rng() * 60},0.35)`;
    ctx.beginPath();
    ctx.arc(rng() * w, rng() * h, 4 + rng() * 14, 0, Math.PI * 2);
    ctx.fill();
  }
  return toTexture(canvas);
}

/** Gold with darker grid lines for the undulating sheet (01:14). */
export function goldGridTexture(): THREE.CanvasTexture {
  const size = 64;
  const [canvas, ctx] = makeCanvas(size, size);
  ctx.fillStyle = "#f2c23a";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#ffe48a";
  ctx.fillRect(0, 0, size, 6);
  ctx.strokeStyle = "#8a5a10";
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, size, size);
  return toTexture(canvas);
}

/** Deep purple with rows of small hex dots, the backdrop of Jobe's interface (01:14). */
export function hexDotsTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 256;
  const [canvas, ctx] = makeCanvas(w, h);
  ctx.fillStyle = "#160628";
  ctx.fillRect(0, 0, w, h);
  const r = 5;
  for (let row = 0; row < h / 14 + 1; row += 1) {
    for (let col = 0; col < w / 16 + 1; col += 1) {
      const x = col * 16 + (row % 2 ? 8 : 0);
      const y = row * 14;
      ctx.beginPath();
      for (let k = 0; k < 6; k += 1) {
        const a = Math.PI / 6 + (k * Math.PI) / 3;
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fillStyle = (row * 7 + col * 3) % 11 === 0 ? "#7a2a8a" : "#3a1458";
      ctx.fill();
    }
  }
  return toTexture(canvas);
}

/** Skin with gold streaks for Cyberjobe's face; the face centre sits at u = 0.25 (sphere +z). */
export function cyberjobeSkinTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 256;
  const [canvas, ctx] = makeCanvas(w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#d09060");
  g.addColorStop(0.5, "#e8b890");
  g.addColorStop(1, "#c08058");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const rng = mulberry32(61);
  for (let i = 0; i < 26; i += 1) {
    const x = rng() * w;
    ctx.strokeStyle = `rgba(${230 + rng() * 25},${170 + rng() * 40},60,${0.5 + rng() * 0.4})`;
    ctx.lineWidth = 2 + rng() * 5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(x + (rng() - 0.5) * 60, h * 0.3, x + (rng() - 0.5) * 60, h * 0.6, x + (rng() - 0.5) * 40, h);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Gold suit with dark circuit lines (Cyberjobe's body). */
export function goldCircuitTexture(): THREE.CanvasTexture {
  const size = 256;
  const [canvas, ctx] = makeCanvas(size, size);
  ctx.fillStyle = "#e8b040";
  ctx.fillRect(0, 0, size, size);
  const rng = mulberry32(73);
  for (let i = 0; i < 40; i += 1) {
    let x = Math.floor(rng() * 16) * 16;
    let y = Math.floor(rng() * 16) * 16;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 4; s += 1) {
      if (rng() < 0.5) x += (rng() < 0.5 ? -1 : 1) * 32;
      else y += (rng() < 0.5 ? -1 : 1) * 32;
      ctx.lineTo(x, y);
    }
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#2a1606";
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#ffe08a";
    ctx.stroke();
  }
  return toTexture(canvas);
}

/** Cyan maze traces on deep navy: the network corridor (after 01:57:40). */
export function networkTexture(): THREE.CanvasTexture {
  const size = 256;
  const [canvas, ctx] = makeCanvas(size, size);
  const rng = mulberry32(91);
  ctx.fillStyle = "#031628";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "rgba(60,200,255,0.18)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= size; i += 16) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }
  for (let i = 0; i < 40; i += 1) {
    let x = Math.floor(rng() * 16) * 16;
    let y = Math.floor(rng() * 16) * 16;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 5; s += 1) {
      if (rng() < 0.5) x += (rng() < 0.5 ? -1 : 1) * 32;
      else y += (rng() < 0.5 ? -1 : 1) * 32;
      ctx.lineTo(x, y);
    }
    ctx.lineWidth = 3;
    ctx.strokeStyle = rng() < 0.15 ? "#ff3a8c" : "#3ad8ff";
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 6;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  return toTexture(canvas);
}

/** Molten orange with dark crust, for the lava sea and glowing rock cracks. */
export function lavaTexture(): THREE.CanvasTexture {
  const size = 256;
  const [canvas, ctx] = makeCanvas(size, size);
  const rng = mulberry32(97);
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, "#ff7a10");
  g.addColorStop(0.5, "#ffd23a");
  g.addColorStop(1, "#ff5a08");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 60; i += 1) {
    ctx.fillStyle = `rgba(${40 + rng() * 40},${10 + rng() * 10},4,${0.6 + rng() * 0.3})`;
    ctx.beginPath();
    const x = rng() * size;
    const y = rng() * size;
    for (let k = 0; k < 7; k += 1) {
      const a = (k / 7) * Math.PI * 2;
      const r = 8 + rng() * 22;
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  }
  return toTexture(canvas);
}

/** Furnace sky: yellow-white glare low, deep red and smoke high (after 01:35:20). */
export function furnaceSkyTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(8, 256);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "#1a0402");
  g.addColorStop(0.3, "#6a1404");
  g.addColorStop(0.46, "#ff7a14");
  g.addColorStop(0.5, "#fff0a0");
  g.addColorStop(0.56, "#ff5a08");
  g.addColorStop(1, "#2a0602");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
