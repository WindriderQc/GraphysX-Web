import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Euler, Matrix3, Matrix4, Quaternion, Vector3 } from "three";
import { importBrowserModule } from "./support/import-browser-module.mjs";
const { buildCubzMenu, cubzSequenceCommands } = await importBrowserModule(new URL("../src/cubz-menu-scene.ts", import.meta.url));
const { sampleKeyframeTrack } = await importBrowserModule(new URL("../src/agent-world-motion.ts", import.meta.url));
const data = JSON.parse(readFileSync(new URL("../public/assets/ports/archive-cubz-menu.json", import.meta.url)));

function pose(document, commands, seconds) {
  const tracks = new Map(commands.filter(command => command.op === "attach-behavior").map(command => [command.id, command.behavior])), matrices = new Map();
  for (const entity of document.entities) {
    const position = new Vector3(...(entity.transform?.position ?? [0,0,0])), rotation = new Quaternion().setFromEuler(new Euler(...(entity.transform?.rotationDegrees ?? [0,0,0]).map(value => value * Math.PI / 180)));
    const options = { scale: new Vector3(...(entity.transform?.scale ?? [1,1,1])), visible: entity.visible ?? true };
    const track = tracks.get(entity.id); if (track) sampleKeyframeTrack(track, seconds, position, rotation, options);
    const local = new Matrix4().compose(position, rotation, options.scale);
    matrices.set(entity.id, entity.parentId ? matrices.get(entity.parentId).clone().multiply(local) : local);
  }
  return matrices;
}

test("all 32 keys and shared return stay flush on the inner source petals at every opening and closing frame", () => {
  const document = buildCubzMenu(data), keys = document.entities.filter(entity => entity.tags?.includes("reconstructed-button-model") && entity.type === "mesh");
  keys.push(document.entities.find(entity => entity.id === "cubz-exit-face")); assert.equal(keys.length, 33);
  let maximumGapError = 0;
  for (const mode of ["open", "return"]) {
    const commands = cubzSequenceCommands(data, document, mode, 0, 0);
    for (let frame = 0; frame <= 50; frame++) {
      const matrices = pose(document, commands, frame / 30);
      for (const key of keys) {
        const mount = document.entities.find(entity => entity.id === key.parentId), panelId = Number(mount.parentId.replace("cubz-open-n", ""));
        assert.ok([35,37,39].includes(panelId), `${key.id} must be parented to an actual source panel, not the world`);
        const panelMesh = data.actors.open.meshes.find(mesh => mesh.nodeId === panelId), minimum = [Infinity,Infinity,Infinity], maximum = [-Infinity,-Infinity,-Infinity];
        panelMesh.positions.forEach((value, index) => { const axis = index % 3, reflected = axis === 2 ? -value : value; minimum[axis] = Math.min(minimum[axis],reflected); maximum[axis] = Math.max(maximum[axis],reflected); });
        const axis = panelId === 35 ? 0 : panelId === 37 ? 1 : 2, normal = new Vector3().setComponent(axis,-1), centre = new Vector3(...minimum.map((value,i)=>(value+maximum[i])/2)); centre.setComponent(axis,minimum[axis]);
        const panelMatrix = matrices.get(mount.parentId), keyMatrix = matrices.get(key.id), worldNormal = normal.clone().applyMatrix3(new Matrix3().getNormalMatrix(panelMatrix)).normalize();
        const back = new Vector3(0,0,-.015).applyMatrix4(keyMatrix), surface = centre.clone().applyMatrix4(panelMatrix);
        maximumGapError = Math.max(maximumGapError,Math.abs(back.clone().sub(surface).dot(worldNormal)-.001));
        assert.ok(maximumGapError < 1e-6, `${key.id} must sit 1 mm above its panel throughout ${mode}, frame ${frame}`);
        const faceNormal = new Vector3(0,0,1).applyMatrix3(new Matrix3().getNormalMatrix(keyMatrix)).normalize();
        assert.ok(faceNormal.dot(worldNormal) > .999999, `${key.id} faces the inside of the petal`);
        const inverse = panelMatrix.clone().invert();
        for (const x of [-.34,.34]) for (const y of [-.18,.18]) {
          const point = new Vector3(x,y,-.015).applyMatrix4(keyMatrix).applyMatrix4(inverse);
          for (let broad = 0; broad < 3; broad++) if (broad !== axis) assert.ok(point.getComponent(broad) > minimum[broad] && point.getComponent(broad) < maximum[broad], `${key.id} cannot hang over a panel edge`);
        }
      }
    }
  }
  const commands = cubzSequenceCommands(data,document,"open",0,0), start = pose(document,commands,0), end = pose(document,commands,50/30);
  for (const key of keys) assert.ok(new Vector3().setFromMatrixPosition(start.get(key.id)).distanceTo(new Vector3().setFromMatrixPosition(end.get(key.id))) > .4, `${key.id} follows its moving petal`);
});
