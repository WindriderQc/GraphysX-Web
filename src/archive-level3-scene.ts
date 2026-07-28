import { Vector3 } from "three";
import {
  GRAPHYSX_AGENT_RULES_SCHEMA,
  GRAPHYSX_AGENT_WORLD_SCHEMA,
  type AgentWorldEntityDefinition,
  type AgentWorldVector3,
  type GraphysXAgentWorldApi,
} from "./agent-world-runtime";
import { loadBallzBallPreset } from "./ballz-ball-presets";
import type { PlatformHost } from "./platform-host";
import { ARCHIVE_LEVEL3_ROWS } from "./race-definitions";

/**
 * Archive Level 3 as ordinary v2 scene data.
 *
 * This is not a modern-grid transcription. BuildASCIIScene gives `M`, `r`, and `$` a
 * one-unit solid M platform, while `r` also gets a checkpoint and `$` is the authored
 * spawn. `levelList.xml` separately says `bAddFloor=true`: the recovered screenshot fixes
 * the relationship as yellow-arrow catwalks one unit above a purple Alien02 catch floor.
 * The four F/f/H/h cells are endpoints, so v2 can finally represent their full LINE gates
 * instead of the legacy race's average-z approximation.
 *
 * Faithful: exact 20×19 bytes and census, authored spawn, 20 elevated checkpoints, two
 * endpoint-defined gates and four posts, 0.3-radius recovered BallZ appearance, Alien02
 * diffuse + normal floor, arrow tops over Alien02 sides, NightSky, 3 laps and archived best.
 * Adapted: the old renderer's two very dim point lights receive the exposure values already
 * recorded in classic-level-style; PBR/friction and steering use the shared BallZ adapter.
 */

const COLUMNS = 20;
const ROWS = 19;
const X_OFFSET = (COLUMNS - 1) / 2;
const Z_OFFSET = (ROWS - 1) / 2;
const PLATFORM_HEIGHT = 1;

type Cell = { symbol: string; column: number; row: number; position: AgentWorldVector3 };

const cells: Cell[] = ARCHIVE_LEVEL3_ROWS.flatMap((line, row) =>
  [...line].map((symbol, column) => ({
    symbol,
    column,
    row,
    position: [column - X_OFFSET, 0, row - Z_OFFSET] as AgentWorldVector3,
  })),
);

const solidCells = cells.filter(({ symbol }) => symbol === "M" || symbol === "r" || symbol === "$");
const ringCells = cells.filter(({ symbol }) => symbol === "r");
const spawnCell = cells.find(({ symbol }) => symbol === "$");
const finishCells = cells.filter(({ symbol }) => symbol === "F" || symbol === "f");
const halfCells = cells.filter(({ symbol }) => symbol === "H" || symbol === "h");

if (!spawnCell || finishCells.length !== 2 || halfCells.length !== 2) {
  throw new Error("Archive Level 3 canonical rows lost their spawn or LINE endpoints");
}

export const ARCHIVE_LEVEL3_SPAWN: AgentWorldVector3 = [
  spawnCell.position[0],
  PLATFORM_HEIGHT + 0.35,
  spawnCell.position[2],
];

const lineGate = (
  id: string,
  label: string,
  endpoints: readonly Cell[],
  color: string,
): AgentWorldEntityDefinition => {
  const a = endpoints[0].position;
  const b = endpoints[1].position;
  const dx = b[0] - a[0];
  const dz = b[2] - a[2];
  return {
    id,
    type: "box",
    label,
    transform: {
      position: [(a[0] + b[0]) / 2, 1, (a[2] + b[2]) / 2],
      rotationDegrees: [0, (Math.atan2(-dz, dx) * 180) / Math.PI, 0],
    },
    geometry: { width: Math.hypot(dx, dz), height: 2, depth: 0.24 },
    material: { color, opacity: 0.14, emissive: color, emissiveIntensity: 0.72 },
    physics: { mode: "trigger" },
    castShadow: false,
    tags: ["archive-level3", "gate", id.includes("finish") ? "finish" : "halfway"],
  };
};

function buildEntities(): AgentWorldEntityDefinition[] {
  const entities: AgentWorldEntityDefinition[] = [
    {
      id: "archive-level3-floor",
      type: "box",
      label: "Alien02 Catch Floor",
      transform: { position: [0, -0.06, 0] },
      geometry: { width: COLUMNS, height: 0.12, depth: ROWS },
      material: {
        color: "#ffffff",
        roughness: 0.78,
        metalness: 0.02,
        texture: { id: "classic-alien02", repeat: [10, 10] },
        normalTexture: { id: "classic-alien02-normal", repeat: [10, 10] },
        normalScale: 0.82,
      },
      physics: { mode: "static", material: "ground" },
      receiveShadow: true,
      tags: ["archive-level3", "floor", "source-bAddFloor"],
    },
  ];

  for (const cell of solidCells) {
    const id = `archive-level3-tile-${cell.column}-${cell.row}`;
    entities.push(
      {
        id,
        type: "box",
        label: `Platform ${cell.symbol}`,
        transform: { position: [cell.position[0], PLATFORM_HEIGHT / 2, cell.position[2]] },
        geometry: { width: 1, height: PLATFORM_HEIGHT, depth: 1 },
        material: {
          color: "#ffffff",
          roughness: 0.7,
          metalness: 0.04,
          texture: { id: "classic-alien02", repeat: [1, 1] },
          normalTexture: { id: "classic-alien02-normal", repeat: [1, 1] },
          normalScale: 0.7,
        },
        physics: { mode: "static", material: "wall" },
        tags: ["archive-level3", "platform", `symbol:${cell.symbol}`],
      },
      {
        id: `${id}-arrow-top`,
        type: "box",
        label: "Yellow Two-Way Top",
        transform: { position: [cell.position[0], PLATFORM_HEIGHT + 0.018, cell.position[2]] },
        geometry: { width: 0.975, height: 0.036, depth: 0.975 },
        material: {
          color: "#fff6a4",
          roughness: 0.54,
          metalness: 0.02,
          texture: { id: "two-way", repeat: [1, 1] },
        },
        receiveShadow: true,
        tags: ["archive-level3", "platform-top", `symbol:${cell.symbol}`],
      },
    );
  }

  for (const [index, cell] of ringCells.entries()) {
    const id = `archive-level3-ring-${index + 1}`;
    entities.push({
      id,
      type: "sphere",
      label: `Checkpoint ${index + 1}`,
      transform: { position: [cell.position[0], PLATFORM_HEIGHT + 0.75, cell.position[2]] },
      geometry: { radius: 0.25, radialSegments: 20 },
      material: { color: "#fffdf4", roughness: 0.3, metalness: 0.38, emissive: "#e26718", emissiveIntensity: 0.14 },
      physics: { mode: "trigger" },
      behaviors: [{ type: "spin", axis: "y", speedDegrees: 100 }],
      interactions: [{ id: `${id}-collect`, label: "Collect checkpoint", type: "toggle-visibility", targetIds: [id] }],
      tags: ["archive-level3", "checkpoint", "collectible"],
    });
  }

  for (const cell of [...finishCells, ...halfCells]) {
    const finish = cell.symbol === "F" || cell.symbol === "f";
    entities.push({
      id: `archive-level3-post-${cell.symbol}`,
      type: "cylinder",
      label: `${finish ? "Finish" : "Halfway"} ${cell.symbol} post`,
      transform: { position: [cell.position[0], 1, cell.position[2]] },
      geometry: { radius: 0.2, height: 2, radialSegments: 14 },
      material: { color: finish ? "#e90000" : "#001dff", roughness: 0.5, metalness: 0.12 },
      physics: { mode: "static", material: "wall" },
      tags: ["archive-level3", "post", finish ? "finish" : "halfway", `symbol:${cell.symbol}`],
    });
  }

  entities.push(
    lineGate("archive-level3-half-gate", "Archived H–h LINE", halfCells, "#276dff"),
    lineGate("archive-level3-finish-gate", "Archived f–F LINE", finishCells, "#ff2b2b"),
  );

  const preset = loadBallzBallPreset();
  const ballRadius = 0.3;
  entities.push(
    {
      id: "archive-level3-ball",
      type: "sphere",
      label: "Level 3 Player Ball",
      transform: { position: ARCHIVE_LEVEL3_SPAWN },
      geometry: { radius: ballRadius, radialSegments: 12 },
      material: { color: "#dff4ff", opacity: 0.03, roughness: 0.4, metalness: 0 },
      castShadow: false,
      physics: { mode: "dynamic", material: "ball", mass: 1.7, friction: 0.55, restitution: 0.5 },
      steering: {
        headingDegrees: 0,
        force: 30 / 2.6,
        speedCap: 2.7,
        turnRateDegrees: 240,
        kickImpulse: 3.6,
        jumpImpulse: 5,
        arrowId: "archive-level3-aim-arrow",
      },
      tags: ["archive-level3", "ball", "player", "ballz-ball-preset", `ball-preset:${preset.id}`],
    },
    {
      id: "archive-level3-ball-shell",
      type: "model",
      label: `${preset.label} Ball Shell`,
      parentId: "archive-level3-ball",
      transform: { position: [0, 0, 0] },
      asset: { id: preset.shellAssetId, fitSize: ballRadius * 2 },
      tags: ["archive-level3", "ball", `ball-preset:${preset.id}`],
    },
    {
      id: "archive-level3-aim-arrow",
      type: "model",
      label: `${preset.label} Controller Ball`,
      transform: { position: ARCHIVE_LEVEL3_SPAWN },
      asset: { id: preset.aimAssetId, fitSize: ballRadius * 2 * (6.601 / 8.5) },
      castShadow: false,
      tags: ["archive-level3", "aim", `ball-preset:${preset.id}`],
    },
    {
      id: "archive-level3-point-1",
      type: "point-light",
      label: "Recovered Point Light 1",
      transform: { position: [-1.5, 20, -1] },
      intensity: 2.08,
      distance: 40,
      marker: false,
      material: { color: "#fff2c8" },
      castShadow: true,
      tags: ["archive-level3", "lighting", "source-position", "adapted-exposure"],
    },
    {
      id: "archive-level3-point-2",
      type: "point-light",
      label: "Recovered Point Light 2",
      transform: { position: [22.5, 20, 22] },
      intensity: 2.08,
      distance: 40,
      marker: false,
      material: { color: "#fff2c8" },
      tags: ["archive-level3", "lighting", "source-position", "adapted-exposure"],
    },
    {
      id: "archive-level3-ambient",
      type: "ambient-light",
      label: "Classic Exposure Fill",
      intensity: 1.12,
      material: { color: "#7884cb" },
      tags: ["archive-level3", "lighting", "adapted-exposure"],
    },
  );

  return entities;
}

export const ARCHIVE_LEVEL3_PROVENANCE = {
  ascii: "StockRoom/Level3_base.ASCII (sha256 02ce8ecbab1c7afff24a449ce03fe758592c2bd8a480778b72481447f4d7cd34)",
  levelList: "StockRoom/levelList.xml: bAddFloor=true, SkyDay=NightSky, nbrTour=3, ScoreBest=158507.313",
  screenshot: "StockRoom/screenShotLevel3.png (sha256 0a9c776f9b8d11e1cc45a81c0d779989a7080d508512482974e98da11ca0caeb)",
  census: { columns: COLUMNS, rows: ROWS, platforms: solidCells.length, checkpoints: ringCells.length, posts: 4, gates: 2 },
  bestTimeMs: 158507.313,
  faithful: "ASCII placement, raised platform/floor relationship, textures, normal map, sky, LINE endpoints, spawn, ball radius and laps",
  adapted: "PBR exposure, Rapier materials and shared BallZ steering",
} as const;

export function composeArchiveLevel3(api: GraphysXAgentWorldApi) {
  return api.create({
    schema: GRAPHYSX_AGENT_WORLD_SCHEMA,
    id: "archive-level3-v2",
    label: "Archive Level 3 — Alien Catwalks",
    rules: {
      schema: GRAPHYSX_AGENT_RULES_SCHEMA,
      subjectId: "archive-level3-ball",
      spawn: { entityId: "archive-level3-ball", position: ARCHIVE_LEVEL3_SPAWN },
      checkpoints: [{ triggerId: "archive-level3-half-gate", label: "Halfway" }],
      collectibles: { tag: "collectible", requiredToFinish: true },
      finish: { triggerId: "archive-level3-finish-gate" },
      laps: 3,
    },
    environment: {
      background: "#02040a",
      sky: "nightsky",
      lighting: { source: "sky", intensity: 0.72, yawDegrees: -18, backgroundIntensity: 0.86, backgroundBlur: 0.04 },
      post: { bloom: { strength: 0.24, threshold: 0.8, radius: 0.18 } },
      envelope: { fogNear: 28, fogFar: 72, cameraFar: 100 },
      ground: { visible: false, size: 24, color: "#050713", grid: false, gridColor: "#241456" },
      physics: { gravity: [0, -9.81, 0] },
    },
    entities: buildEntities(),
  });
}

export function frameArchiveLevel3(host: PlatformHost): void {
  host.camera.position.set(-14.5, 16.5, 18.5);
  host.focusOn(new Vector3(0, 0.6, 0), 16, 0.94);
}
