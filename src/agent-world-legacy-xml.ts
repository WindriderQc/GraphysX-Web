import {
  GRAPHYSX_AGENT_WORLD_SCHEMA,
  type AgentWorldDefinition,
  type AgentWorldEntityDefinition,
  type AgentWorldPhysics,
  type AgentWorldPhysicsMaterial,
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

export type AgentWorldLegacyXmlExportWarning = {
  code:
    | "environment-unsupported"
    | "rules-unsupported"
    | "joints-unsupported"
    | "entity-type-unsupported"
    | "entity-field-unsupported"
    | "geometry-baked-into-scale"
    | "material-unsupported"
    | "texture-unsupported"
    | "physics-field-unsupported";
  severity: "warning";
  entityId: string | null;
  field: string;
  message: string;
};

export type AgentWorldLegacyXmlExportConversion = {
  xml: string;
  format: "Scene3D-v1.2-subset";
  sourceEntityCount: number;
  exportedEntityCount: number;
  omittedEntityIds: string[];
  warnings: AgentWorldLegacyXmlExportWarning[];
};

const LEGACY_TYPE_NAMES: Record<number, string> = {
  0: "CUBE", 1: "SPHERE", 2: "CYLINDER", 3: "CONE", 4: "BILLBOARD", 5: "FLOOR", 6: "CUSTOM",
  7: "PHYSICCUBE", 8: "PHYSICSPHERE", 9: "PHYSICSCYLINDER", 10: "PHYSICCONE", 11: "PHYSICCUSTOM",
  12: "XMESH", 13: "PHYSICXMESH", 14: "DUPLICATE", 15: "V1_0"
};

const EXPORT_ACTIONS_HEADER = [
  "  0=CUBE  1=SPHERE  2=CYLINDER  3=CONE  4=BILLBOARD  5=FLOOR  6=CUSTOM  7=PHYSICCUBE  8=PHYSICSPHERE  9=PHYSICSCYLINDER  10=PHYSICCONE  11=PHYSICCUSTOM  12=XMESH  13=PHYSICXMESH  14=PHYSICXSTATIC  15=DUPLICATEMESH  16=TEXT  17=VERTEXSTRIP  18=V1_2",
  "",
  "  0=DEFAULT_MAT  1=WALL  2=FINISH  3=GROUND  4=BALL  5=HUMAN"
].join("\n");

/** Converts archived v1.0 nested records and v1.1/v1.2 attribute records into v2 JSON. */
export function convertLegacyGraphysXXml(xml: string, options: AgentWorldLegacyXmlOptions = {}): AgentWorldLegacyXmlConversion {
  if (typeof xml !== "string" || !xml.trim()) throw new Error("Legacy XML source is empty");
  if (xml.length > 5_000_000) throw new Error("Legacy XML source must be 5 MB or smaller");
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const parserError = document.querySelector("parsererror");
  if (parserError) throw new Error(`Legacy XML parse failed: ${parserError.textContent?.trim().slice(0, 180) || "invalid XML"}`);

  // The three surviving serializer families call the record Object3D, Obj3D or EntityNET.
  // Walking once preserves document order when a hand-edited fixture mixes layouts.
  const sourceObjects = Array.from(document.getElementsByTagName("*")).filter((element) =>
    ["object3d", "obj3d", "entitynet"].includes(element.localName.toLowerCase()));
  if (sourceObjects.length === 0) throw new Error("Legacy XML contains no Object3D, Obj3D, or EntityNET records");
  if (sourceObjects.length > 512) throw new Error("Legacy XML can contain at most 512 entity records");

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

/**
 * Emit the explicit flat Scene3D v1.2 compatibility subset.
 *
 * Duplicate IDs and hierarchy are rejected because SceneNET has no stable ID or parent field;
 * choosing an arbitrary rename/flatten order would corrupt references. Unsupported entities are
 * omitted with structured warnings, while primitive geometry dimensions are baked into Scale so
 * their visible size survives an import even though the old record has no size fields.
 */
export function convertAgentWorldToLegacyXml(definition: AgentWorldDefinition): AgentWorldLegacyXmlExportConversion {
  if (!definition || definition.schema !== GRAPHYSX_AGENT_WORLD_SCHEMA || !Array.isArray(definition.entities)) {
    throw new Error(`Legacy XML export requires a ${GRAPHYSX_AGENT_WORLD_SCHEMA} definition`);
  }
  if (definition.entities.length > 512) throw new Error("Legacy XML export supports at most 512 entities");

  const ids = new Set<string>();
  for (const [index, entity] of definition.entities.entries()) {
    const id = entity.id?.trim();
    if (!id) throw new Error(`Legacy XML export requires a stable id for entity ${index + 1}`);
    if (ids.has(id)) throw new Error(`Legacy XML export rejected duplicate entity id: ${id}`);
    ids.add(id);
  }
  const parented = definition.entities.filter((entity) => entity.parentId).map((entity) => entity.id);
  if (parented.length) {
    throw new Error(`Legacy XML export cannot represent hierarchy; remove parentId from: ${parented.join(", ")}`);
  }

  const warnings: AgentWorldLegacyXmlExportWarning[] = [];
  const omittedEntityIds: string[] = [];
  if (definition.environment) addExportWarning(warnings, "environment-unsupported", null, "environment", "Scene3D v1.2 has no scene environment fields; background, sky, lighting, ground, post-processing, and gravity are omitted.");
  if (definition.rules) addExportWarning(warnings, "rules-unsupported", null, "rules", "Scene3D v1.2 has no race-rules block; rules are omitted.");
  if (definition.joints?.length) addExportWarning(warnings, "joints-unsupported", null, "joints", `${definition.joints.length} scene joint(s) are omitted because SceneNET has no constraint records.`);

  const records: string[] = [];
  for (const entity of definition.entities) {
    const id = entity.id!;
    const record = exportEntity(entity, warnings);
    if (record) records.push(record);
    else omittedEntityIds.push(id);
  }

  const lines = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<Scene3D xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">',
    `  <ActionsHeader>${escapeXmlText(EXPORT_ACTIONS_HEADER)}</ActionsHeader>`,
    '  <filepathASCII />',
    '  <mapSize>0</mapSize>',
    '  <ObjList>',
    ...records,
    '  </ObjList>',
    '  <ringPosList />',
    '</Scene3D>',
    ''
  ];
  return {
    xml: lines.join("\n"),
    format: "Scene3D-v1.2-subset",
    sourceEntityCount: definition.entities.length,
    exportedEntityCount: records.length,
    omittedEntityIds,
    warnings
  };
}

function convertObject(object: Element, index: number, usedIds: Set<string>, warnings: string[]): AgentWorldEntityDefinition | null {
  const typeCode = readLegacyTypeCode(object);
  const sourceName = readValue(object, ["Name"]) || `Legacy Object ${index + 1}`;
  const baseId = stableId(sourceName, `legacy-object-${index + 1}`);
  let id = baseId;
  for (let suffix = 2; usedIds.has(id); suffix += 1) id = `${baseId}-${suffix}`.slice(0, 80);
  if (id !== baseId) warnings.push(`${sourceName}: duplicate legacy Name assigned stable id ${id}`);
  usedIds.add(id);
  const position = readVector(object, "Pos", [0, 0, 0]);
  const rotation = readVector(object, "Rot", [0, 0, 0]);
  const scale = readVector(object, "Scale", [1, 1, 1]).map((value) => Math.max(0.001, Math.abs(value))) as AgentWorldVector3;
  const mass = Math.max(0, finiteNumber(readValue(object, ["masse", "Mass", "Masse"]), 0));
  const meshControlled = booleanValue(readValue(object, ["MeshControlled"]), false);
  const enabled = booleanValue(readValue(object, ["Enabled", "bEnable"]), true);
  const newtonMaterial = legacyPhysicsMaterialCode(readValue(object, ["NewtonMat", "iNewtonMat"]));
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
    transform: { position, scale, rotationDegrees: rotation },
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

function exportEntity(entity: AgentWorldEntityDefinition, warnings: AgentWorldLegacyXmlExportWarning[]): string | null {
  const id = entity.id!;
  const physical = !!entity.physics;
  const typeCode = legacyExportTypeCode(entity.type, physical);
  if (typeCode === null || entity.physics?.mode === "trigger") {
    const detail = entity.physics?.mode === "trigger" ? "trigger physics" : `entity type ${entity.type}`;
    addExportWarning(warnings, "entity-type-unsupported", id, entity.physics?.mode === "trigger" ? "physics.mode" : "type", `${id}: ${detail} has no Scene3D v1.2 record and is omitted.`);
    return null;
  }

  if (entity.label && entity.label !== id) {
    addExportWarning(warnings, "entity-field-unsupported", id, "label", `${id}: the friendly label is omitted; the stable id is written as legacy Name to preserve identity.`);
  }
  const unsupportedFields = [
    ["asset", entity.asset], ["path", entity.path], ["emitter", entity.emitter], ["sound", entity.sound],
    ["terrain", entity.terrain], ["water", entity.water], ["flock", entity.flock], ["crowd", entity.crowd],
    ["formula", entity.formula], ["dna", entity.dna], ["forceField", entity.forceField], ["surface", entity.surface],
    ["steering", entity.steering], ["agent", entity.agent], ["modelMaterialOverrides", entity.modelMaterialOverrides],
    ["behaviors", entity.behaviors?.length ? entity.behaviors : null], ["interactions", entity.interactions?.length ? entity.interactions : null],
    ["tags", entity.tags?.length ? entity.tags : null]
  ].filter(([, value]) => value !== undefined && value !== null);
  if (unsupportedFields.length) {
    const names = unsupportedFields.map(([name]) => name).join(", ");
    addExportWarning(warnings, "entity-field-unsupported", id, names, `${id}: unsupported field(s) omitted: ${names}.`);
  }

  const transform = entity.transform ?? {};
  const position = vectorOr(transform.position, [0, 0, 0]);
  const rotation = vectorOr(transform.rotationDegrees, [0, 0, 0]);
  const authoredScale = vectorOr(transform.scale, [1, 1, 1]);
  const scale = bakeGeometryScale(entity, authoredScale);
  if (scale.some((value, axis) => value !== authoredScale[axis])) {
    addExportWarning(warnings, "geometry-baked-into-scale", id, "geometry", `${id}: primitive dimensions are baked into legacy Scale; visible size survives, but geometry-vs-transform separation does not.`);
  }

  const textureName = legacyTextureName(entity.material?.texture?.id ?? null);
  if (entity.material?.texture && !textureName) {
    addExportWarning(warnings, "texture-unsupported", id, "material.texture", `${id}: texture ${entity.material.texture.id} has no historical SceneNET name and is omitted.`);
  }
  if (entity.material) {
    addExportWarning(warnings, "material-unsupported", id, "material", `${id}: Scene3D v1.2 stores only TextureName; color, PBR, opacity, normal-map, shader, and wireframe fields are omitted.`);
  }
  if (entity.physics && hasUnsupportedPhysicsFields(entity.physics)) {
    addExportWarning(warnings, "physics-field-unsupported", id, "physics", `${id}: friction, restitution, velocities, and collider policy are omitted; mode, mass, material, and kinematic control survive.`);
  }

  const mass = entity.physics?.mode === "dynamic" ? Math.max(0, entity.physics.mass ?? 1) : Math.max(0, entity.physics?.mass ?? 0);
  const meshControlled = entity.physics?.mode === "kinematic";
  const newtonMaterial = legacyPhysicsMaterialNumber(entity.physics?.material ?? (entity.type === "plane" ? "ground" : "default"));
  const vectorLine = (name: string, vector: AgentWorldVector3) => `      <${name} x="${formatNumber(vector[0])}" y="${formatNumber(vector[1])}" z="${formatNumber(vector[2])}" />`;
  return [
    `    <Obj3D Type="${typeCode}" Name="${escapeXmlAttribute(id)}" Enabled="${entity.visible === false ? "false" : "true"}" Masse="${formatNumber(mass)}" MeshControlled="${meshControlled ? "true" : "false"}" NewtonMat="${newtonMaterial}">`,
    vectorLine("Pos", position),
    vectorLine("Rot", rotation),
    vectorLine("Scale", scale),
    "      <PathToMesh />",
    textureName ? `      <TextureName>${escapeXmlText(textureName)}</TextureName>` : "      <TextureName />",
    "    </Obj3D>"
  ].join("\n");
}

function readLegacyTypeCode(object: Element): number {
  const rawType = readValue(object, ["Type"]).trim();
  const rawGeometry = readValue(object, ["Geom", "Geometry"]).trim();
  const numeric = Number(rawType);
  if (rawType && Number.isInteger(numeric)) {
    // Numeric fixtures through v1.2 use the old direct primitive codes. A numeric record
    // carrying Geom is from the later EntityNET split enum and needs recombining.
    return rawGeometry ? splitTypeCode(numeric, readGeometryCode(rawGeometry)) : numeric;
  }
  const type = rawType.toUpperCase();
  const geometry = readGeometryCode(rawGeometry);
  if (type === "PRIMITIVE") return primitiveTypeCode(geometry, false);
  if (type === "PHYSPRIMITIVE") return primitiveTypeCode(geometry, true);
  if (type === "BILLBOARD") return 4;
  if (type === "FLOOR") return 5;
  if (type === "CUSTOM") return 6;
  if (type === "PHYSICCUSTOM") return 11;
  if (type === "XMESH") return 12;
  if (["PHYSICXMESH", "PHYSICXSTATIC"].includes(type)) return 13;
  if (["DUPLICATE", "DUPLICATEMESH"].includes(type)) return 14;
  if (type === "ACTOR") return 15;
  return 0;
}

function splitTypeCode(type: number, geometry: number): number {
  if (type === 0) return primitiveTypeCode(geometry, false);
  if (type === 4) return primitiveTypeCode(geometry, true);
  if (type === 1) return 4;
  if (type === 2) return 5;
  if (type === 3) return 6;
  if (type === 5) return 11;
  if (type === 6) return 12;
  if (type === 7 || type === 8) return 13;
  if (type === 9) return 14;
  if (type === 12) return 15;
  return 6;
}

function readGeometryCode(value: string): number {
  const numeric = Number(value);
  if (value && Number.isInteger(numeric)) return numeric;
  return ({ CUBE: 0, SPHERE: 1, CYLINDER: 2, CONE: 3, TEAPOT: 4, PLANE: 5 } as Record<string, number>)[value.toUpperCase()] ?? 0;
}

function primitiveTypeCode(geometry: number, physical: boolean): number {
  const primitive = geometry === 1 ? 1 : geometry === 2 ? 2 : geometry === 3 ? 3 : geometry === 5 ? 5 : 0;
  if (!physical || primitive === 5) return primitive;
  return primitive + 7;
}

function legacyExportTypeCode(type: AgentWorldEntityDefinition["type"], physical: boolean): number | null {
  const primitive = type === "box" ? 0 : type === "sphere" ? 1 : type === "cylinder" ? 2 : type === "cone" ? 3 : type === "plane" ? 5 : null;
  if (primitive === null || !physical || primitive === 5) return primitive;
  return primitive + 7;
}

function bakeGeometryScale(entity: AgentWorldEntityDefinition, scale: AgentWorldVector3): AgentWorldVector3 {
  const geometry = entity.geometry ?? {};
  if (entity.type === "box") return [scale[0] * (geometry.width ?? 1), scale[1] * (geometry.height ?? 1), scale[2] * (geometry.depth ?? 1)];
  if (entity.type === "sphere") {
    const ratio = (geometry.radius ?? 0.5) / 0.5;
    return [scale[0] * ratio, scale[1] * ratio, scale[2] * ratio];
  }
  if (entity.type === "cylinder" || entity.type === "cone") {
    const radial = (geometry.radius ?? 0.5) / 0.5;
    return [scale[0] * radial, scale[1] * (geometry.height ?? 1), scale[2] * radial];
  }
  if (entity.type === "plane") return [scale[0] * (geometry.width ?? 10) / 10, scale[1], scale[2] * (geometry.depth ?? geometry.height ?? 10) / 10];
  return [...scale];
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
    material: legacyPhysicsMaterialName(newtonMaterial, typeCode)
  };
}

function legacyPhysicsMaterialCode(value: string): number {
  const numeric = Number(value);
  if (value && Number.isFinite(numeric)) return numeric;
  return ({ DEF_PHYSMAT: 0, DEFAULT_MAT: 0, WALL: 1, WOOD: 1, FINISH: 2, GROUND: 3, LEVEL: 3, BALL: 4, HUMAN: 5, ELEVATOR: 5 } as Record<string, number>)[value.toUpperCase()] ?? -1;
}

function legacyPhysicsMaterialName(code: number, typeCode: number): AgentWorldPhysicsMaterial {
  if (code === 1) return "wall";
  if (code === 2) return "finish";
  if (code === 3 || typeCode === 5) return "ground";
  if (code === 4) return "ball";
  if (code === 5) return "human";
  return "default";
}

function legacyPhysicsMaterialNumber(material: AgentWorldPhysicsMaterial): number {
  return ({ default: 0, wall: 1, finish: 2, ground: 3, ball: 4, human: 5 } as const)[material];
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

function legacyTextureName(id: AgentWorldTextureId | null): string | null {
  if (id === "two-way") return "TwoWay";
  if (id === "checker") return "Checkerboard";
  if (id === "green-grid") return "Grid";
  if (id === "worn-wood") return "Wood";
  if (id === "rusted-metal") return "Metal";
  if (id === "marble") return "Marble";
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

function vectorOr(value: AgentWorldVector3 | undefined, fallback: AgentWorldVector3): AgentWorldVector3 {
  return value && value.length === 3 && value.every(Number.isFinite) ? [...value] : [...fallback];
}

function hasUnsupportedPhysicsFields(physics: AgentWorldPhysics): boolean {
  return physics.friction !== undefined || physics.restitution !== undefined || physics.linearVelocity !== undefined
    || physics.angularVelocity !== undefined || (physics.collider !== undefined && physics.collider !== "auto");
}

function addExportWarning(
  warnings: AgentWorldLegacyXmlExportWarning[],
  code: AgentWorldLegacyXmlExportWarning["code"],
  entityId: string | null,
  field: string,
  message: string
): void {
  warnings.push({ code, severity: "warning", entityId, field, message });
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) throw new Error("Legacy XML export encountered a non-finite transform or mass");
  const rounded = Number(value.toFixed(6));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function escapeXmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeXmlAttribute(value: string): string {
  return escapeXmlText(value).replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
