import type { AgentLevelState } from "./agent-level-library";

/**
 * Curated scenes have stable, build-captured 3D previews. Keep this list explicit so a newly
 * added scene gets an honest generated fallback instead of causing a production 404.
 * `scripts/capture-shelf-thumbnails.mjs` regenerates the files from the real product route.
 */
export const SHELF_SCENE_THUMBNAIL_IDS: ReadonlySet<string> = new Set([
  "archive-maison",
  "archive-math-lab",
  "archive-voie-lactee",
  "archive-flock-planet",
  "archive-forces-garden",
  "archive-garage",
  "living-systems",
  "prefab-plaza",
  "glow-garden",
  "signal-outpost",
  "signal-trail",
  "physics-sketchbook",
  "archive-skybox-spiral",
  "archive-world1",
] as const);

export function createSceneThumbnail(id: string, label: string): HTMLImageElement {
  const image = document.createElement("img");
  image.className = "gx-shelf-thumb";
  image.alt = `${label} preview`;
  // Opening the gallery is an explicit request to see it. Load the compact set together so
  // scrolling never reveals empty cards and a missing checked-in preview fails visibly.
  image.loading = "eager";
  image.decoding = "async";
  image.src = SHELF_SCENE_THUMBNAIL_IDS.has(id)
    ? `/assets/shelf-thumbnails/${encodeURIComponent(id)}.jpg`
    : makeFallbackThumbnail(label);
  return image;
}

/**
 * Level rows are editable and user-created, so a checked-in screenshot would become wrong as
 * soon as somebody paints a tile. Render the stored level as a compact top-down map instead:
 * it is immediate, offline, and always reflects the current revision.
 */
export function createLevelThumbnail(level: AgentLevelState): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.className = "gx-shelf-thumb gx-shelf-thumb--level";
  canvas.width = 320;
  canvas.height = 180;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", `${level.label || level.id} level preview`);

  const context = canvas.getContext("2d");
  if (!context) return canvas;

  const palette: Record<AgentLevelState["tiles"][number], string> = {
    floor: "#163643",
    wall: "#587887",
    start: "#52e0b4",
    ring: "#ffd36b",
    half: "#8fa0e0",
    finish: "#f48667",
    hazard: "#c34c56",
    fire: "#ff8b47",
    ice: "#69c8ef",
  };
  const gap = 1;
  const cell = Math.max(2, Math.min((canvas.width - 30) / level.width, (canvas.height - 26) / level.height));
  const left = (canvas.width - cell * level.width) / 2;
  const top = (canvas.height - cell * level.height) / 2;

  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "#071824");
  gradient.addColorStop(1, "#102d3a");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < level.height; y += 1) {
    for (let x = 0; x < level.width; x += 1) {
      const tile = level.tiles[y * level.width + x] ?? "floor";
      context.fillStyle = palette[tile];
      context.fillRect(left + x * cell, top + y * cell, Math.max(1, cell - gap), Math.max(1, cell - gap));
      if (tile === "ring") {
        context.strokeStyle = "#fff2b8";
        context.lineWidth = Math.max(1, cell * 0.11);
        context.beginPath();
        context.arc(left + (x + 0.5) * cell, top + (y + 0.5) * cell, cell * 0.22, 0, Math.PI * 2);
        context.stroke();
      }
    }
  }
  return canvas;
}

export const SHELF_THUMBNAIL_CSS = `
.gx-shelf-visual{position:relative;display:block;width:100%;aspect-ratio:16/9;overflow:hidden;
  border-radius:8px 8px 3px 3px;background:linear-gradient(135deg,#071824,#173b49)}
.gx-shelf-thumb{display:block;width:100%;height:100%;object-fit:cover;transition:transform .28s ease,
  filter .28s ease;filter:saturate(.92) brightness(.88)}
button:hover .gx-shelf-thumb,button:focus-visible .gx-shelf-thumb{transform:scale(1.035);
  filter:saturate(1.08) brightness(1.02)}
.gx-shelf-visual::after{content:"";position:absolute;inset:0;pointer-events:none;
  background:linear-gradient(180deg,transparent 52%,rgba(4,13,21,.48));box-shadow:inset 0 0 0 1px rgba(120,240,208,.12)}
.gx-shelf-copy{display:flex;min-width:0;flex-direction:column;align-items:flex-start;gap:3px;padding:2px 2px 1px}
`;

function makeFallbackThumbnail(label: string): string {
  const initials = label.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]?.toUpperCase()).join("");
  const safeInitials = escapeXml(initials || "GX");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180">
    <defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#092232"/><stop offset="1" stop-color="#195061"/></linearGradient></defs>
    <rect width="320" height="180" fill="url(#g)"/><circle cx="252" cy="34" r="78" fill="#78f0d0" opacity=".1"/>
    <path d="M0 148L70 94l48 32 55-68 147 122H0z" fill="#06151f" opacity=".72"/>
    <text x="22" y="54" fill="#eafaff" font-family="system-ui,sans-serif" font-weight="700" font-size="28">${safeInitials}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeXml(value: string): string {
  const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
  return value.replace(/[&<>"']/g, (character) => entities[character] ?? character);
}
