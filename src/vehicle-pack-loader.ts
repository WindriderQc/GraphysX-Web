import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshPhongMaterial,
  SRGBColorSpace,
  Texture,
  TextureLoader
} from "three";
import { TGALoader } from "three/addons/loaders/TGALoader.js";

type ArchiveMaterial = {
  name: string;
  texture: string | null;
  diffuse: [number, number, number] | null;
  transparency: number;
};

type ArchiveObject = {
  name: string;
  positions: number[];
  indices: number[];
  uvs: number[];
  faceMaterials: Array<string | null>;
};

export type ArchivedVehicle3dsSpec = {
  label: string;
  modelUrl: string;
  textureUrls: ReadonlyMap<string, string>;
  revealBlackTexturedMaterials?: boolean;
};

export type ArchivedVehicle3dsResult = {
  group: Group;
  objectCount: number;
  vertexCount: number;
  triangleCount: number;
  materialNames: string[];
  textureReferences: string[];
  compatibilityOverrides: string[];
  fidelityBoundary: string;
};

const latin1 = new TextDecoder("latin1");

function readCString(bytes: Uint8Array, offset: number, limit: number): { value: string; next: number } {
  let end = offset;
  while (end < limit && bytes[end] !== 0) end += 1;
  return { value: latin1.decode(bytes.subarray(offset, end)), next: Math.min(end + 1, limit) };
}

function parseColor(view: DataView, start: number, end: number): [number, number, number] | null {
  let cursor = start;
  while (cursor + 6 <= end) {
    const id = view.getUint16(cursor, true);
    const length = view.getUint32(cursor + 2, true);
    if (length < 6 || cursor + length > end) break;
    const body = cursor + 6;
    if ((id === 0x0010 || id === 0x0013) && body + 12 <= cursor + length) {
      return [
        view.getFloat32(body, true),
        view.getFloat32(body + 4, true),
        view.getFloat32(body + 8, true)
      ];
    }
    if ((id === 0x0011 || id === 0x0012) && body + 3 <= cursor + length) {
      return [view.getUint8(body) / 255, view.getUint8(body + 1) / 255, view.getUint8(body + 2) / 255];
    }
    cursor += length;
  }
  return null;
}

function parsePercentage(view: DataView, start: number, end: number): number {
  let cursor = start;
  while (cursor + 6 <= end) {
    const id = view.getUint16(cursor, true);
    const length = view.getUint32(cursor + 2, true);
    if (length < 6 || cursor + length > end) break;
    const body = cursor + 6;
    if ((id === 0x0030 || id === 0x0031) && body + 2 <= cursor + length) {
      return view.getUint16(body, true) / 100;
    }
    cursor += length;
  }
  return 0;
}

function parse3ds(buffer: ArrayBuffer): { materials: ArchiveMaterial[]; objects: ArchiveObject[] } {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const materials: ArchiveMaterial[] = [];
  const objects: ArchiveObject[] = [];

  function walk(start: number, end: number, material?: ArchiveMaterial, object?: ArchiveObject): void {
    let cursor = start;
    while (cursor + 6 <= end) {
      const id = view.getUint16(cursor, true);
      const length = view.getUint32(cursor + 2, true);
      if (length < 6 || cursor + length > end) break;
      const body = cursor + 6;
      const chunkEnd = cursor + length;

      if (id === 0x4d4d || id === 0x3d3d || id === 0x4100 || id === 0xa200) {
        walk(body, chunkEnd, material, object);
      } else if (id === 0xafff) {
        const nextMaterial: ArchiveMaterial = {
          name: "",
          texture: null,
          diffuse: null,
          transparency: 0
        };
        materials.push(nextMaterial);
        walk(body, chunkEnd, nextMaterial, object);
      } else if (id === 0xa000 && material) {
        material.name = readCString(bytes, body, chunkEnd).value;
      } else if (id === 0xa020 && material) {
        material.diffuse = parseColor(view, body, chunkEnd);
      } else if (id === 0xa050 && material) {
        material.transparency = parsePercentage(view, body, chunkEnd);
      } else if (id === 0xa300 && material) {
        material.texture = readCString(bytes, body, chunkEnd).value;
      } else if (id === 0x4000) {
        const objectName = readCString(bytes, body, chunkEnd);
        const nextObject: ArchiveObject = {
          name: objectName.value,
          positions: [],
          indices: [],
          uvs: [],
          faceMaterials: []
        };
        objects.push(nextObject);
        walk(objectName.next, chunkEnd, material, nextObject);
      } else if (id === 0x4110 && object) {
        const count = view.getUint16(body, true);
        for (let vertex = 0; vertex < count; vertex += 1) {
          const offset = body + 2 + vertex * 12;
          const x = view.getFloat32(offset, true);
          const y = view.getFloat32(offset + 4, true);
          const z = view.getFloat32(offset + 8, true);
          object.positions.push(x, z, -y);
        }
      } else if (id === 0x4120 && object) {
        const count = view.getUint16(body, true);
        object.faceMaterials = new Array(count).fill(null);
        for (let face = 0; face < count; face += 1) {
          const offset = body + 2 + face * 8;
          object.indices.push(
            view.getUint16(offset, true),
            view.getUint16(offset + 4, true),
            view.getUint16(offset + 2, true)
          );
        }
        walk(body + 2 + count * 8, chunkEnd, material, object);
      } else if (id === 0x4130 && object) {
        const materialName = readCString(bytes, body, chunkEnd);
        const count = view.getUint16(materialName.next, true);
        for (let face = 0; face < count; face += 1) {
          const faceIndex = view.getUint16(materialName.next + 2 + face * 2, true);
          if (faceIndex < object.faceMaterials.length) object.faceMaterials[faceIndex] = materialName.value;
        }
      } else if (id === 0x4140 && object) {
        const count = view.getUint16(body, true);
        for (let uv = 0; uv < count; uv += 1) {
          const offset = body + 2 + uv * 8;
          object.uvs.push(view.getFloat32(offset, true), view.getFloat32(offset + 4, true));
        }
      }

      cursor += length;
    }
  }

  walk(0, buffer.byteLength);
  return { materials, objects };
}

async function loadTexture(reference: string, urls: ReadonlyMap<string, string>): Promise<Texture> {
  const url = urls.get(reference.toLocaleLowerCase());
  if (!url) throw new Error(`No exact URL mapping for archived texture ${reference}`);
  const loader = reference.toLocaleLowerCase().endsWith(".tga") ? new TGALoader() : new TextureLoader();
  const texture = await loader.loadAsync(url);
  texture.colorSpace = SRGBColorSpace;
  texture.name = reference;
  return texture;
}

function reorderFaceIndices(object: ArchiveObject, materialNames: string[]): { indices: number[]; groups: Array<[number, number, number]> } {
  const indices: number[] = [];
  const groups: Array<[number, number, number]> = [];
  for (let materialIndex = 0; materialIndex < materialNames.length; materialIndex += 1) {
    const name = materialNames[materialIndex];
    const start = indices.length;
    for (let face = 0; face < object.faceMaterials.length; face += 1) {
      if ((object.faceMaterials[face] ?? "<unassigned>") !== name) continue;
      indices.push(
        object.indices[face * 3],
        object.indices[face * 3 + 1],
        object.indices[face * 3 + 2]
      );
    }
    groups.push([start, indices.length - start, materialIndex]);
  }
  return { indices, groups };
}

export async function loadArchivedVehicle3ds(spec: ArchivedVehicle3dsSpec): Promise<ArchivedVehicle3dsResult> {
  const response = await fetch(spec.modelUrl);
  if (!response.ok) throw new Error(`Could not fetch ${spec.label} 3DS (${response.status})`);
  const parsed = parse3ds(await response.arrayBuffer());
  const textures = new Map<string, Texture>();
  const references = [...new Set(parsed.materials.map((material) => material.texture).filter((value): value is string => Boolean(value)))];
  await Promise.all(references.map(async (reference) => {
    textures.set(reference.toLocaleLowerCase(), await loadTexture(reference, spec.textureUrls));
  }));

  const compatibilityOverrides: string[] = [];
  const materialByName = new Map<string, MeshPhongMaterial>();
  for (const archived of parsed.materials) {
    const diffuse = archived.diffuse ?? [1, 1, 1];
    const hasBlackTexturedMaterial = Boolean(archived.texture) && Math.max(...diffuse) < 0.01;
    const exposedDiffuse = hasBlackTexturedMaterial && spec.revealBlackTexturedMaterials ? [1, 1, 1] : diffuse;
    if (hasBlackTexturedMaterial && spec.revealBlackTexturedMaterials) {
      compatibilityOverrides.push(`${archived.name}: diffuse 0,0,0 previewed white so ${archived.texture} remains inspectable`);
    }
    const material = new MeshPhongMaterial({
      color: new Color(exposedDiffuse[0], exposedDiffuse[1], exposedDiffuse[2]),
      map: archived.texture ? textures.get(archived.texture.toLocaleLowerCase()) ?? null : null,
      opacity: 1 - archived.transparency,
      transparent: archived.transparency > 0,
      shininess: 55
    });
    material.name = archived.name;
    materialByName.set(archived.name, material);
  }

  const fallback = new MeshPhongMaterial({ color: 0xb8c5cf, shininess: 35 });
  fallback.name = "<unassigned>";
  const group = new Group();
  group.name = `${spec.label} — deterministic exact 3DS inspection group`;

  for (const object of parsed.objects) {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(object.positions, 3));
    if (object.uvs.length === (object.positions.length / 3) * 2) {
      geometry.setAttribute("uv", new Float32BufferAttribute(object.uvs, 2));
    }
    const names = [...new Set(object.faceMaterials.map((name) => name ?? "<unassigned>"))];
    const reordered = reorderFaceIndices(object, names);
    geometry.setIndex(reordered.indices);
    for (const [start, count, materialIndex] of reordered.groups) geometry.addGroup(start, count, materialIndex);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const objectMaterials = names.map((name) => materialByName.get(name) ?? fallback);
    const mesh = new Mesh(geometry, objectMaterials);
    mesh.name = object.name;
    group.add(mesh);
  }

  return {
    group,
    objectCount: parsed.objects.length,
    vertexCount: parsed.objects.reduce((sum, object) => sum + object.positions.length / 3, 0),
    triangleCount: parsed.objects.reduce((sum, object) => sum + object.indices.length / 3, 0),
    materialNames: parsed.materials.map((material) => material.name),
    textureReferences: references,
    compatibilityOverrides,
    fidelityBoundary: "Exact 3DS point arrays, triangle faces, UVs, object names, material-face lists and referenced textures; deterministic Z-up→Y-up conversion. Runtime normals are recomputed because the preview does not reproduce 3DS smoothing-group splits."
  };
}
