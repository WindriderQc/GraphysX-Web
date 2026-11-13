export type ModelInstance = { position?: [number,number,number]; rotationDegrees?: [number,number,number]; scale?: [number,number,number] };
export type ModelPresentation = { instances?: ModelInstance[]; lods?: {url:string;distance:number}[]; lightmap?: {url:string;intensity?:number} };
export const MODEL_PRESENTATION_LIMITS: Readonly<{instances:number;lods:number}>;
export function resolveModelPresentation(asset: ModelPresentation & {format?:string}): ModelPresentation;
