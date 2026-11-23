import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deriveWeights, eyeTransform, NEUTRAL_DRIVERS, poseInto } from '../src/llmx-face-pose.ts';
import { importBrowserModule } from './support/import-browser-module.mjs';

const asset = JSON.parse(readFileSync(new URL('../src/llmx-face-forge.json', import.meta.url)));
for (const level of ['high', 'balanced', 'mobile']) {
  const weights = deriveWeights(asset, level);
  const posed = drivers => {
    const position = new Float32Array(weights.count * 3), scale = new Float32Array(weights.count);
    poseInto(weights, { ...NEUTRAL_DRIVERS, ...drivers }, position, scale);
    return position;
  };
  const displacement = (position, region, side = 0) => {
    let sum = 0, count = 0;
    for (let i = 0; i < weights.count; i++) {
      if (weights.region[i] !== asset.regions.indexOf(region)) continue;
      if (side && Math.sign(weights.rest[i * 3]) !== side) continue;
      if (region === 'lip' && weights.rest[i * 3 + 1] >= weights.anchors.mouth.y) continue;
      if (region === 'lip' && Math.abs(weights.rest[i * 3]) > weights.anchors.mouth.halfWidth * .5) continue;
      sum += position[i * 3 + 1] - weights.rest[i * 3 + 1]; count++;
    }
    assert.ok(count > 0, `${level}: inspect actual ${region} cubes`);
    return sum / count;
  };
  test(`${level}: curiosity raises one brow and gathers the other without using speech`, () => {
    const position = posed({ curiosity: 1, attention: 0 });
    const right = displacement(position, 'brow', 1), left = displacement(position, 'brow', -1);
    assert.ok(right > .015 && left < -.005 && right - left > .025, `brow travel: ${left}, ${right}`);
  });
  test(`${level}: authored surprise opens the lips and eyes while a blink still closes them`, () => {
    const position = posed({ surprise: 1, attention: 1 });
    assert.ok(displacement(position, 'lip') < -.025, 'the lower lip opens for the authored pose');
    const neutral = eyeTransform(weights.anchors, {}), surprised = eyeTransform(weights.anchors, { surprise: 1, attention: 1 });
    assert.ok(surprised.lidRadians < neutral.lidRadians - .15, 'the upper lid actually opens');
    assert.equal(eyeTransform(weights.anchors, { surprise: 1, warmth: 1, blink: 1 }).lidRadians,
      eyeTransform(weights.anchors, { blink: 1 }).lidRadians, 'blink takes precedence over expressions');
    for (const coordinate of position) assert.ok(Number.isFinite(coordinate) && Math.abs(coordinate) < 2);
  });
}

test('the real voxel rig eases authored expressions and releases them, retaining its six meshes', async () => {
  const { AgentWorldVoxelFace, resolveAgentWorldFace } = await importBrowserModule(new URL('../src/agent-world-face.ts', import.meta.url));
  const face = new AgentWorldVoxelFace(resolveAgentWorldFace({ level: 'balanced', autoBlink: false }));
  try {
    face.snapDrivers({ ...NEUTRAL_DRIVERS });
    const meshes = [...face.object.children], matrix = [...meshes[0].instanceMatrix.array];
    face.setDrivers({ curiosity: 1, surprise: .7 });
    assert.equal(face.current.curiosity, 0, 'setDrivers does not snap the expression');
    for (let frame = 0; frame < 60; frame++) face.update(1 / 60);
    assert.ok(face.current.curiosity > .98 && face.current.surprise > .68);
    assert.notDeepEqual([...meshes[0].instanceMatrix.array], matrix, 'actual instanced geometry moves');
    assert.deepEqual(face.object.children, meshes); assert.equal(meshes.length, 6);
    assert.equal(face.current.speak, 0, 'an authored pose never invents audio amplitude');
    face.setDrivers({ curiosity: 0, surprise: 0 });
    for (let frame = 0; frame < 60; frame++) face.update(1 / 60);
    assert.ok(face.current.curiosity < .02 && face.current.surprise < .02);
  } finally { face.dispose(); }
});
