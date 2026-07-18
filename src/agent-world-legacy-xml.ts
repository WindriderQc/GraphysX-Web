import {
  GRAPHYSX_AGENT_WORLD_SCHEMA,
  type AgentWorldDefinition,
  type AgentWorldEntityDefinition,
  type AgentWorldPhysics,
  type AgentWorldVector3
} from "./agent-world-runtime";
import type { AgentWorldTextureId } from "./agent-world-textures";

export type AgentWorldLegacyXmlOptions = {
  id?: string;
  label?: string;
};

export type AgentWorldLegacyXmlConversion = {
  definition: AgentWorldDefinition;
  sourceEntityCount: number;
  convertedEntityCount: number;
  warnings: string[];
};

const LEGACY_TYPE_NAMES: Record<number, string> = {
  0: "CUBE", 1: "SPHERE", 2: "CYLINDER", 3: "CONE", 4: "BILLBOARD", 5: "FLOOR", 6: "CUSTOM",
  7: "PHYSICCUBE", 8: "PHYSICSPHERE", 9: "PHYSICSCYLINDER", 10: "PHYSICCONE", 11: "PHYSICCUSTOM",
  12: "XMESH", 13: "PHYSICXMESH", 14: "DUPLICATE", 15: "V1_0"
};

/** Converts both archived GraphysX XML layouts (attributes or nested fields) into v2 JSON. */
export function convertLegacyGraphysXXml(xml: string, options: AgentWorldLegacyXmlOptions = {}): AgentWorldLegacyXmlConversion {
  if (typeof xml !== "string" || !xml.trim()) throw new Error("Legacy XML source is empty");
  if (xml.length > 5_000_000) throw new Error("Legacy XML source must be 5 MB or smaller");
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const parserError = document.querySelector("parsererror");
  if (parserError) throw new Error(`Legacy XML parse failed: ${parserError.textContent?.trim().slice(0, 180) || "invalid XML"}`);
  const sourceObjects = Array.from(document.getElementsByTagName("Object3D"));
  if (sourceObjects.length === 0) throw new Error("Legacy XML contains no Object3D records");
  if (sourceObjects.length > 512) throw new Error("Legacy XML can contain at most 512 Object3D records");

  const warnings: string[] = [];
  const usedIds = new Set<string>();
  const entities = sourceObjects.flatMap((object, index) => {
    const converted = convertObject(object, index, usedIds, warnings);
    return converted ? [converted] : [];
  });
  const id = stableId(options.id || document.documentElement.getAttribute("Name") || "legacy-graphysx-world", "legacy-graphysx-world");
  return {
    definition: {
      schema: GRAPHYSX_AGENT_WORLD_SCHEMA,
      id,
      label: options.label?.trim() || `${readValue(document.documentElement, ["Name"]) || "Legacy GraphysX"} Import`,
      environment: {
        background: "#07131d",
        ground: { visible: true, size: 48, color: "#15282d", grid: true, gridColor: "#4a8f98" }
      },
      entities
    },
    sourceEntityCount: sourceObjects.length,
    convertedEntityCount: entities.length,
    warnings
  };
}

function convertObject(object: Element, index: number, usedIds: Set<string>, warnings: string[]): AgentWorldEntityDefinition | null {
  const typeCode = finiteNumber(readValue(object, ["Type"]), 0);
  const sourceName = readValue(object, ["Name"]) || `Legacy Object ${index + 1}`;
  const baseId = stableId(sourceName, `legacy-object-${index + 1}`);
  let id = baseId;
  for (let suffix = 2; usedIds.has(id); suffix += 1) id = `${baseId}-${suffix}`.slice(0, 80);
  usedIds.add(id);
  const position = readVector(object, "Pos", [0, 0, 0]);
  const scale = readVector(object, "Scale", [1, 1, 1]).map((value) => Math.max(0.001, Math.abs(value))) as AgentWorldVector3;
  const mass = Math.max(0, finiteNumber(readValue(object, ["masse", "Mass"]), 0));
  const meshControlled = booleanValue(readValue(object, ["MeshControlled"]), false);
  const enabled = booleanValue(readValue(object, ["Enabled", "bEnable"]), true);
  const newtonMaterial = finiteNumber(readValue(object, ["NewtonMat", "iNewtonMat"]), -1);
  const meshPath = readValue(object, ["PathToMesh"]);
  const textureName = readValue(object, ["TextureName"]);
  const textureId = legacyTextureId(textureName);
  const type = legacyEntityType(typeCode);
  const customProxy = [6, 11, 12, 13, 14, 15].includes(typeCode);
  if (customProxy) warnings.push(`${sourceName}: ${LEGACY_TYPE_NAMES[typeCode] ?? `type ${typeCode}`} mesh kept as a visible proxy (${meshPath || "no mesh path"})`);
  if (typeCode === 4) warnings.push(`${sourceName}: billboard imported as a plane proxy`);

  const physics = legacyPhysics(typeCode, mass, meshControlled, newtonMaterial);
  const tags = [
    "legacy-xml",
    `legacy:type-${typeCode}`,
    `legacy:${(LEGACY_TYPE_NAMES[typeCode] ?? "unknown").toLowerCase()}`,
    ...(customProxy ? ["legacy:unresolved-model"] : []),
    ...(meshPath ? [`legacy-mesh:${meshPath.replace(/\\/g, "/").slice(-48)}`] : []),
    ...(textureName ? [`legacy-texture:${textureName.slice(0, 40)}`] : [])
  ];
  return {
    id,
    label: sourceName,
    type,
    transform: { position, scale, rotationDegrees: [0, 0, 0] },
    material: {
      color: textureId ? "#ffffff" : customProxy ? "#b7a581" : "#78d7c8",
      roughness: customProxy ? 0.68 : 0.52,
      metalness: customProxy ? 0.18 : 0.06,
      ...(textureId ? { texture: { id: textureId } } : {})
    },
    geometry: legacyGeometry(typeCode),
    ...(physics ? { physics } : {}),
    visible: enabled,
    tags
  };
}

function legacyEntityType(typeCode: number): AgentWorldEntityDefinition["type"] {
  if (typeCode === 1 || typeCode === 8) return "sphere";
  if (typeCode === 2 || typeCode === 9) return "cylinder";
  if (typeCode === 3 || typeCode === 10) return "cone";
  if (typeCode === 4 || typeCode === 5) return "plane";
  return "box";
}

function legacyGeometry(typeCode: number): NonNullable<AgentWorldEntityDefinition["geometry"]> {
  if (typeCode === 1 || typeCode === 8) return { radius: 0.5, radialSegments: 24 };
  if (typeCode === 2 || typeCode === 9 || typeCode === 3 || typeCode === 10) return { radius: 0.5, height: 1, radialSegments: 18 };
  if (typeCode === 4 || typeCode === 5) return { width: 10, depth: 10 };
  return { width: 1, height: 1, depth: 1 };
}

function legacyPhysics(typeCode: number, mass: number, meshControlled: boolean, newtonMaterial: number): AgentWorldPhysics | null {
  const physicalType = [7, 8, 9, 10, 11, 13].includes(typeCode) || typeCode === 5;
  if (!physicalType) return null;
  return {
    mode: meshControlled ? "kinematic" : mass > 0 ? "dynamic" : "static",
    mass,
    material: newtonMaterial === 1 ? "wall" : typeCode === 5 ? "ground" : "default"
  };
}

function legacyTextureId(name: string): AgentWorldTextureId | null {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (normalized === "twoway" || normalized === "yellowtwoway") return "two-way";
  if (normalized.includes("damier") || normalized.includes("checker")) return "checker";
  if (normalized.includes("grid")) return "green-grid";
  if (normalized.includes("wood")) return "worn-wood";
  if (normalized.includes("metal") || normalized.includes("rust")) return "rusted-metal";
  if (normalized.includes("marble")) return "marble";
  return null;
}

function readVector(object: Element, name: string, fallback: AgentWorldVector3): AgentWorldVector3 {
  const vector = directChild(object, name);
  if (!vector) return [...fallback];
  return (["x", "y", "z"] as const).map((axis, index) => finiteNumber(readValue(vector, [axis]), fallback[index])) as AgentWorldVector3;
}

function readValue(element: Element, names: string[]): string {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  for (const attribute of Array.from(element.attributes)) {
    if (wanted.has(attribute.name.toLowerCase())) return attribute.value.trim();
  }
  for (const child of Array.from(element.children)) {
    if (wanted.has(child.localName.toLowerCase())) return child.textContent?.trim() ?? "";
  }
  return "";
}

function directChild(element: Element, name: string): Element | null {
  const lower = name.toLowerCase();
  return Array.from(element.children).find((child) => child.localName.toLowerCase() === lower) ?? null;
}

function finiteNumber(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanValue(value: string, fallback: boolean): boolean {
  if (!value) return fallback;
  return value.toLowerCase() === "true" || value === "1";
}

function stableId(value: string, fallback: string): string {
  const id = value.trim().toLowerCase().replace(/[^a-z0-9._:-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return /^[a-z0-9]/.test(id) ? id : fallback;
}
