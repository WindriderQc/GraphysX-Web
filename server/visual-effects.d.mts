export const ENERGY_FIELDS: readonly string[];
export const MODULATE_FIELDS: readonly string[];
export const VISUAL_LIMITS: Readonly<Record<string, readonly number[]>>;
export function validateEnergyShader(value: object): void;
export function validateModulateBehavior(value: object): void;
type Behavior = { type: string; property?: string };
type Entity = { type: string; id?: string; behaviors?: readonly Behavior[] };
export function modulateTargetError(behavior: Behavior, entity: Entity): string | null;
export function findModulateTargetError(entity: Entity, previousEntity?: Entity): string | null;
