import {
  Color,
  Material,
  Mesh,
  MeshPhongMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  Texture,
} from "three";

export type AgentWorldModelMaterialOverride = {
  color?: string;
  roughness?: number;
  metalness?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  opacity?: number;
  emissive?: string;
  emissiveIntensity?: number;
};

export type AgentWorldModelMaterialOverrides = Record<string, AgentWorldModelMaterialOverride>;
export type AgentWorldModelMaterialOverridePatch = Record<string, AgentWorldModelMaterialOverride | null>;
export type AgentWorldModelMaterialRole = "body" | "glass" | "tire" | "wheel" | "undercarriage" | "surface" | "material";
export type AgentWorldModelMaterialType = "phong" | "standard" | "physical" | "other";

export type AgentWorldModelMaterialSlot = {
  id: string;
  label: string;
  role: AgentWorldModelMaterialRole;
  meshName: string;
  meshIndex: number;
  materialName: string;
  materialIndex: number;
  materialType: AgentWorldModelMaterialType;
  hasSourceMap: boolean;
  sourceMapName: string | null;
  /** Same source name/map repeated in other assignments; edits remain local to this slot. */
  relatedSlotIds: string[];
  /** True only when another assignment actually references the same Three Material object. */
  sharesSourceMaterial: boolean;
  overridden: boolean;
  color: string;
  opacity: number;
  transparent: boolean;
  emissive?: string;
  emissiveIntensity?: number;
  roughness?: number;
  metalness?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  override?: AgentWorldModelMaterialOverride;
};

export type AgentWorldModelMaterialPreset = {
  id: string;
  label: string;
  description: string;
  assetIds: string[];
  roles: AgentWorldModelMaterialRole[];
  values: AgentWorldModelMaterialOverride;
};

export type AgentWorldModelMaterialRegistration = {
  id: string;
  label: string;
  role: AgentWorldModelMaterialRole;
  mesh: Mesh;
  meshName: string;
  meshIndex: number;
  materialName: string;
  materialIndex: number;
  sourceMaterial: Material;
  sourceMapName: string | null;
};

type RuntimeSlot = AgentWorldModelMaterialRegistration & {
  currentMaterial: Material;
  overrideKey: string | null;
  relatedSlotIds: string[];
  sharesSourceMaterial: boolean;
};

const SLOT_REGISTRY_KEY = "graphysxModelMaterialSlots";

export const GRAPHYSX_MODEL_MATERIAL_PRESETS: readonly AgentWorldModelMaterialPreset[] = [
  {
    id: "cobra-heritage-blue",
    label: "Heritage blue",
    description: "Deep clear-coated blue while retaining the recovered Cobra paint map.",
    assetIds: ["archive-cobra"],
    roles: ["body"],
    values: { color: "#d8e8ff", roughness: 0.2, metalness: 0.14, clearcoat: 1, clearcoatRoughness: 0.1 },
  },
  {
    id: "cobra-road-rubber",
    label: "Road rubber",
    description: "Near-black, high-roughness tire finish with no invented texture.",
    assetIds: ["archive-cobra"],
    roles: ["tire"],
    values: { color: "#17191d", roughness: 0.94, metalness: 0 },
  },
  {
    id: "impreza-rally-blue",
    label: "Rally blue",
    description: "Crisp coated chassis paint that preserves the recovered ChassisSTi map.",
    assetIds: ["archive-impreza"],
    roles: ["body"],
    values: { color: "#d6e6ff", roughness: 0.24, metalness: 0.1, clearcoat: 0.9, clearcoatRoughness: 0.14 },
  },
  {
    id: "impreza-smoked-glass",
    label: "Smoked glass",
    description: "Restrained dark glass tint with a smooth clear-coated response.",
    assetIds: ["archive-impreza"],
    roles: ["glass"],
    values: { color: "#9fb4c7", roughness: 0.12, metalness: 0.02, clearcoat: 0.82, clearcoatRoughness: 0.08, opacity: 0.72 },
  },
  {
    id: "impreza-satin-alloy",
    label: "Satin alloy",
    description: "Satin wheel finish applied per wheel assignment.",
    assetIds: ["archive-impreza"],
    roles: ["wheel"],
    values: { color: "#c6cbd1", roughness: 0.42, metalness: 0.72 },
  },
  {
    id: "impreza-protected-underbody",
    label: "Protected underbody",
    description: "Dark, low-glare undercarriage coating.",
    assetIds: ["archive-impreza"],
    roles: ["undercarriage"],
    values: { color: "#737b84", roughness: 0.84, metalness: 0.04 },
  },
  {
    id: "piste-track-asphalt",
    label: "Track asphalt",
    description: "Inferred neutral asphalt for the unresolved Piste Ovale surface; no recovered material map exists.",
    assetIds: ["archive-piste-ovale"],
    roles: ["surface"],
    values: { color: "#30363d", roughness: 0.88, metalness: 0.01 },
  },
] as const;

export function modelMaterialSlotId(
  meshName: string,
  meshIndex: number,
  materialName: string,
  materialIndex: number,
): string {
  return `mesh:${meshIndex}:${stablePart(meshName)}:material:${materialIndex}:${stablePart(materialName)}`;
}

export function inferModelMaterialRole(
  assetId: string | null,
  meshName: string,
  materialName: string,
): AgentWorldModelMaterialRole {
  const value = `${meshName} ${materialName}`.toLowerCase();
  if (/ventanas|window|glass/.test(value)) return "glass";
  if (/tire|tyre|neum/.test(value)) return "tire";
  if (/rueda|wheel|rim/.test(value)) return "wheel";
  if (/undercarriage|chasis_a|underbody/.test(value)) return "undercarriage";
  if (/piste|track|asphalt|road|surface/.test(value) || assetId === "archive-piste-ovale") return "surface";
  if (/cobra-body|chassis|chasis|body|paint/.test(value) || assetId === "archive-cobra") return "body";
  return "material";
}

export function modelMaterialSlotLabel(
  role: AgentWorldModelMaterialRole,
  meshName: string,
  materialName: string,
): string {
  const roleLabel: Record<AgentWorldModelMaterialRole, string> = {
    body: "Body paint",
    glass: "Glass",
    tire: "Tire",
    wheel: "Wheel",
    undercarriage: "Undercarriage",
    surface: "Surface",
    material: humanize(materialName),
  };
  if (role === "wheel" || role === "tire") return `${roleLabel[role]} · ${humanize(meshName)}`;
  return roleLabel[role];
}

export function registerAgentWorldModelMaterialSlots(
  target: Object3D,
  registrations: AgentWorldModelMaterialRegistration[],
): void {
  const groups = new Map<string, string[]>();
  for (const slot of registrations) {
    const key = `${slot.materialName}\u0000${slot.sourceMapName ?? ""}`;
    const ids = groups.get(key) ?? [];
    ids.push(slot.id);
    groups.set(key, ids);
  }
  const slots: RuntimeSlot[] = registrations.map((slot) => {
    const key = `${slot.materialName}\u0000${slot.sourceMapName ?? ""}`;
    return {
      ...slot,
      currentMaterial: slot.sourceMaterial,
      overrideKey: null,
      relatedSlotIds: (groups.get(key) ?? []).filter((id) => id !== slot.id),
      sharesSourceMaterial: registrations.some((candidate) =>
        candidate.id !== slot.id && candidate.sourceMaterial === slot.sourceMaterial),
    };
  });
  target.userData[SLOT_REGISTRY_KEY] = slots;
}

export function resolveAgentWorldModelMaterialOverrides(
  source?: AgentWorldModelMaterialOverrides,
): AgentWorldModelMaterialOverrides {
  const resolved: AgentWorldModelMaterialOverrides = {};
  if (!source) return resolved;
  const entries = Object.entries(source);
  if (entries.length > 128) throw new Error("A model supports at most 128 material slot overrides");
  for (const [slotId, values] of entries) {
    validateSlotId(slotId);
    resolved[slotId] = resolveOverride(values, `modelMaterialOverrides.${slotId}`);
  }
  return resolved;
}

export function patchAgentWorldModelMaterialOverrides(
  current: AgentWorldModelMaterialOverrides,
  patch: AgentWorldModelMaterialOverridePatch | null,
): AgentWorldModelMaterialOverrides {
  if (patch === null) return {};
  const next = { ...current };
  for (const [slotId, values] of Object.entries(patch)) {
    validateSlotId(slotId);
    if (values === null) delete next[slotId];
    else next[slotId] = resolveOverride(
      { ...(current[slotId] ?? {}), ...values },
      `modelMaterialOverrides.${slotId}`,
    );
  }
  if (Object.keys(next).length > 128) throw new Error("A model supports at most 128 material slot overrides");
  return next;
}

export function applyAgentWorldModelMaterialOverrides(
  target: Object3D,
  overrides: AgentWorldModelMaterialOverrides,
): void {
  const slots = runtimeSlots(target);
  if (slots.length > 0) {
    const known = new Set(slots.map((slot) => slot.id));
    const unknown = Object.keys(overrides).find((slotId) => !known.has(slotId));
    if (unknown) throw new Error(`Unknown material slot for loaded model: ${unknown}`);
  }
  for (const slot of slots) {
    const values = overrides[slot.id];
    const overrideKey = values ? JSON.stringify(values) : null;
    if (slot.overrideKey === overrideKey) continue;
    const previous = slot.currentMaterial;
    const next = values ? materialWithOverride(slot.sourceMaterial, values) : slot.sourceMaterial;
    assignSlotMaterial(slot.mesh, slot.materialIndex, next);
    slot.currentMaterial = next;
    slot.overrideKey = overrideKey;
    if (previous !== slot.sourceMaterial && previous !== next) previous.dispose();
  }
}

export function inspectAgentWorldModelMaterialSlots(
  target: Object3D,
  overrides: AgentWorldModelMaterialOverrides,
): AgentWorldModelMaterialSlot[] {
  return runtimeSlots(target).map((slot) => {
    const material = slot.currentMaterial;
    const sourceMap = "map" in slot.sourceMaterial && slot.sourceMaterial.map instanceof Texture
      ? slot.sourceMaterial.map
      : null;
    return {
      id: slot.id,
      label: slot.label,
      role: slot.role,
      meshName: slot.meshName,
      meshIndex: slot.meshIndex,
      materialName: slot.materialName,
      materialIndex: slot.materialIndex,
      materialType: materialType(material),
      hasSourceMap: sourceMap !== null,
      sourceMapName: slot.sourceMapName ?? sourceMap?.name ?? null,
      relatedSlotIds: [...slot.relatedSlotIds],
      sharesSourceMaterial: slot.sharesSourceMaterial,
      overridden: Boolean(overrides[slot.id]),
      color: colorOf(material, "color", "#ffffff"),
      opacity: material.opacity,
      transparent: material.transparent,
      ...("emissive" in material && material.emissive instanceof Color ? {
        emissive: `#${material.emissive.getHexString()}`,
        emissiveIntensity: "emissiveIntensity" in material && typeof material.emissiveIntensity === "number"
          ? material.emissiveIntensity
          : 1,
      } : {}),
      ...(material instanceof MeshStandardMaterial ? {
        roughness: material.roughness,
        metalness: material.metalness,
      } : {}),
      ...(material instanceof MeshPhysicalMaterial ? {
        clearcoat: material.clearcoat,
        clearcoatRoughness: material.clearcoatRoughness,
      } : {}),
      ...(overrides[slot.id] ? { override: { ...overrides[slot.id] } } : {}),
    };
  });
}

export function modelMaterialPresetsFor(
  assetId: string | null,
  role?: AgentWorldModelMaterialRole,
): readonly AgentWorldModelMaterialPreset[] {
  if (!assetId) return [];
  return GRAPHYSX_MODEL_MATERIAL_PRESETS.filter((preset) =>
    preset.assetIds.includes(assetId) && (!role || preset.roles.includes(role)));
}

/** Source materials can be absent from mesh.material while an override clone is active. */
export function sourceAgentWorldModelMaterials(target: Object3D): Material[] {
  return runtimeSlots(target).map((slot) => slot.sourceMaterial);
}

function runtimeSlots(target: Object3D): RuntimeSlot[] {
  return Array.isArray(target.userData[SLOT_REGISTRY_KEY])
    ? target.userData[SLOT_REGISTRY_KEY] as RuntimeSlot[]
    : [];
}

function materialWithOverride(source: Material, values: AgentWorldModelMaterialOverride): Material {
  validateOverrideSupport(source, values);
  const material = source.clone();
  material.userData = { ...source.userData, graphysxModelMaterialOverride: true };
  if (values.color !== undefined && "color" in material && material.color instanceof Color) material.color.set(values.color);
  if (values.emissive !== undefined && "emissive" in material && material.emissive instanceof Color) material.emissive.set(values.emissive);
  if (values.emissiveIntensity !== undefined && "emissiveIntensity" in material) material.emissiveIntensity = values.emissiveIntensity;
  if (values.opacity !== undefined) {
    material.opacity = values.opacity;
    material.transparent = values.opacity < 1 || source.transparent;
    material.depthWrite = values.opacity >= 1 && source.depthWrite;
  }
  if (material instanceof MeshStandardMaterial) {
    if (values.roughness !== undefined) material.roughness = values.roughness;
    if (values.metalness !== undefined) material.metalness = values.metalness;
  }
  if (material instanceof MeshPhysicalMaterial) {
    if (values.clearcoat !== undefined) material.clearcoat = values.clearcoat;
    if (values.clearcoatRoughness !== undefined) material.clearcoatRoughness = values.clearcoatRoughness;
  }
  material.needsUpdate = true;
  return material;
}

function validateOverrideSupport(material: Material, values: AgentWorldModelMaterialOverride): void {
  if (values.color !== undefined && !("color" in material && material.color instanceof Color)) {
    throw new Error(`${material.type} does not support a base color override`);
  }
  if (
    (values.emissive !== undefined || values.emissiveIntensity !== undefined)
    && !("emissive" in material && material.emissive instanceof Color)
  ) {
    throw new Error(`${material.type} does not support emissive overrides`);
  }
  if (
    (values.roughness !== undefined || values.metalness !== undefined)
    && !(material instanceof MeshStandardMaterial)
  ) {
    throw new Error(`${material.type} does not support roughness or metalness; upgrade is not implicit`);
  }
  if (
    (values.clearcoat !== undefined || values.clearcoatRoughness !== undefined)
    && !(material instanceof MeshPhysicalMaterial)
  ) {
    throw new Error(`${material.type} does not support clearcoat; upgrade is not implicit`);
  }
}

function assignSlotMaterial(mesh: Mesh, materialIndex: number, material: Material): void {
  if (Array.isArray(mesh.material)) {
    const materials = [...mesh.material];
    materials[materialIndex] = material;
    mesh.material = materials;
  } else {
    mesh.material = material;
  }
}

function resolveOverride(values: AgentWorldModelMaterialOverride, path: string): AgentWorldModelMaterialOverride {
  if (!values || typeof values !== "object" || Array.isArray(values)) throw new Error(`${path} must be an object`);
  const allowed = new Set(["color", "roughness", "metalness", "clearcoat", "clearcoatRoughness", "opacity", "emissive", "emissiveIntensity"]);
  for (const key of Object.keys(values)) if (!allowed.has(key)) throw new Error(`Unsupported ${path}.${key}`);
  const resolved: AgentWorldModelMaterialOverride = {};
  if (values.color !== undefined) resolved.color = resolveHex(values.color, `${path}.color`);
  if (values.emissive !== undefined) resolved.emissive = resolveHex(values.emissive, `${path}.emissive`);
  for (const key of ["roughness", "metalness", "clearcoat", "clearcoatRoughness", "opacity"] as const) {
    if (values[key] !== undefined) resolved[key] = finiteRange(values[key], 0, 1, `${path}.${key}`);
  }
  if (values.emissiveIntensity !== undefined) {
    resolved.emissiveIntensity = finiteRange(values.emissiveIntensity, 0, 100, `${path}.emissiveIntensity`);
  }
  if (Object.keys(resolved).length === 0) throw new Error(`${path} must change at least one supported property`);
  return resolved;
}

function validateSlotId(value: string): void {
  if (!/^mesh:\d+:[a-z0-9-]+:material:\d+:[a-z0-9-]+$/.test(value)) {
    throw new Error(`Invalid material slot id: ${value}`);
  }
}

function resolveHex(value: string, path: string): string {
  if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value)) throw new Error(`${path} must be #rrggbb`);
  return value.toLowerCase();
}

function finiteRange(value: number, minimum: number, maximum: number, path: string): number {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${path} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

function materialType(material: Material): AgentWorldModelMaterialType {
  if (material instanceof MeshPhysicalMaterial) return "physical";
  if (material instanceof MeshStandardMaterial) return "standard";
  if (material instanceof MeshPhongMaterial) return "phong";
  return "other";
}

function colorOf(material: Material, property: string, fallback: string): string {
  const value = (material as unknown as Record<string, unknown>)[property];
  return value instanceof Color ? `#${value.getHexString()}` : fallback;
}

function stablePart(value: string): string {
  const normalized = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  return normalized.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "unnamed";
}

function humanize(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim() || "Material";
}
