// Shared by native scene validation and the browser; these are presentation batches,
// not independent physics bodies. All transforms are local to their model entity.
export const MODEL_PRESENTATION_LIMITS = Object.freeze({ instances: 2048, lods: 3 });

export function resolveModelPresentation(asset) {
  const result = {};
  const url = value => {
    if (typeof value !== 'string' || value.length > 2048 || !/^(?:\/(?!\/)|https:\/\/)/i.test(value)) throw Error('Model presentation URLs must be root-relative or HTTPS');
    return value;
  };
  const number = (v, lo, hi, label) => {
    if (!Number.isFinite(v) || v < lo || v > hi) throw Error(`Invalid ${label}`);
    return v;
  };
  const keys = (value, allowed) => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !allowed.includes(k))) throw Error('Unsupported model presentation fields');
  };
  const vector = (value, fallback, lo, hi) => {
    if (value === undefined) return fallback;
    if (!Array.isArray(value) || value.length !== 3) throw Error('Model instance transform requires three finite components');
    return value.map(v => number(v, lo, hi, 'model instance transform'));
  };
  for (const key of ['instances', 'lods', 'lightmap']) {
    if (asset[key] !== undefined && asset.format !== 'gltf') throw Error(`${key} requires asset.format gltf`);
  }
  if (asset.instances !== undefined) {
    if (!Array.isArray(asset.instances) || !asset.instances.length || asset.instances.length > MODEL_PRESENTATION_LIMITS.instances) throw Error('Model instances must contain 1..2048 transforms');
    result.instances = asset.instances.map(value => {
      keys(value, ['position', 'rotationDegrees', 'scale']);
      return { position: vector(value.position, [0,0,0], -100000, 100000), rotationDegrees: vector(value.rotationDegrees, [0,0,0], -360000, 360000), scale: vector(value.scale, [1,1,1], .0001, 10000) };
    });
  }
  if (asset.lods !== undefined) {
    if (!Array.isArray(asset.lods) || asset.lods.length > MODEL_PRESENTATION_LIMITS.lods) throw Error('Model lods accepts at most three lower-detail levels');
    let previous = 0;
    result.lods = asset.lods.map(value => {
      keys(value, ['url', 'distance']);
      const distance = number(value.distance, .01, 100000, 'LOD distance');
      if (distance <= previous) throw Error('LOD distances must be strictly increasing');
      previous = distance;
      return { url: url(value.url), distance };
    });
  }
  if (asset.lightmap !== undefined) {
    keys(asset.lightmap, ['url', 'intensity']);
    result.lightmap = { url: url(asset.lightmap.url), intensity: number(asset.lightmap.intensity ?? 1, 0, 10, 'lightmap intensity') };
  }
  return result;
}
