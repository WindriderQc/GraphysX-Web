// Original, procedural EV3-inspired teaching model. No LEGO CAD or third-party mesh data.
// Coordinates match the scene's drive body: +Y up, -Z forward, wheel contact at Y=-0.78.
// Merge by material so Technic holes and tyre tread do not become hundreds of draw calls.
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { BoxGeometry, CatmullRomCurve3, Color, CylinderGeometry, ExtrudeGeometry, Path, PlaneGeometry, Shape, SphereGeometry, TorusGeometry, TubeGeometry, Vector3 } from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const directory = new URL("../public/assets/kidx/", import.meta.url);
await mkdir(directory, { recursive: true });
const materials = {
  shell: "#dce3e6", graphite: "#24262a", motor: "#92999e", rubber: "#151719",
  red: "#c92525", blue: "#1766b0", green: "#70b82c", axle: "#c4c9cb",
};
const batches = new Map();
function add(geometry, material, position, rotation = [0, 0, 0]) {
  geometry.rotateX(rotation[0]); geometry.rotateY(rotation[1]); geometry.rotateZ(rotation[2]);
  geometry.translate(...position);
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  flat.deleteAttribute("normal"); flat.deleteAttribute("uv");
  if (!batches.has(material)) batches.set(material, []);
  batches.get(material).push(flat);
}
const box = (size, position, material, radius = 0.04, rotation) =>
  add(radius ? new RoundedBoxGeometry(...size, 1, radius) : new BoxGeometry(...size), material, position, rotation);
const cylinder = (radius, length, position, material, rotation = [0, 0, Math.PI / 2]) =>
  add(new CylinderGeometry(radius, radius, length, 24), material, position, rotation);

// Rounded Technic liftarms with actual through-holes, at a consistent 0.4-unit pin pitch.
function beam(count, position, material, rotation = [0, 0, 0]) {
  const half = (count - 1) * 0.2;
  const shape = new Shape();
  shape.moveTo(-half, -.2); shape.lineTo(half, -.2);
  shape.absarc(half, 0, .2, -Math.PI / 2, Math.PI / 2, false);
  shape.lineTo(-half, .2); shape.absarc(-half, 0, .2, Math.PI / 2, Math.PI * 1.5, false);
  for (let index = 0; index < count; index++) {
    const hole = new Path(); hole.absarc(-half + index * .4, 0, .112, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  const geometry = new ExtrudeGeometry(shape, { depth: .27, bevelEnabled: true, bevelThickness: .015, bevelSize: .015, bevelSegments: 1, steps: 1, curveSegments: 8 });
  geometry.translate(0, 0, -.135);
  add(geometry, material, position, rotation);
}

// Open Technic chassis, with beams, cross axles and blue friction pins.
beam(11, [0, -.22, -1.35], "graphite");
beam(11, [0, -.22, 1.35], "graphite");
for (const sign of [-1, 1]) {
  beam(9, [sign * 1.32, .05, .12], "shell", [0, Math.PI / 2, 0]);
  beam(9, [sign * 1.32, .49, .12], "graphite", [0, Math.PI / 2, 0]);
  for (const z of [-1.28, .32, 1.32]) cylinder(.115, .39, [sign * 1.48, .05, z], "blue");
  // Large motor: gearbox, round output housing, red drive disc and mounting ears.
  box([.72, .74, 1.78], [sign * 1.53, .28, -.27], "motor", .1);
  cylinder(.55, .71, [sign * 1.56, .16, .32], "shell");
  cylinder(.36, .77, [sign * 1.58, .16, .32], "red");
  box([.6, .48, .66], [sign * 1.52, .59, -.84], "shell", .06);
  // Narrow, flat-section tyres with tread and six Technic rim holes.
  cylinder(.92, .48, [sign * 2.05, .14, .32], "rubber");
  for (let index = 0; index < 32; index++) {
    const angle = index * Math.PI / 16;
    box([.52, .06, .11], [sign * 2.05, .14 + .916 * Math.cos(angle), .32 + .916 * Math.sin(angle)], "rubber", 0, [angle, 0, 0]);
  }
  cylinder(.61, .50, [sign * 2.05, .14, .32], "motor");
  add(new TorusGeometry(.53, .045, 8, 32), "shell", [sign * 2.312, .14, .32], [0, Math.PI / 2, 0]);
  for (let index = 0; index < 6; index++) {
    const angle = index * Math.PI / 3;
    cylinder(.125, .015, [sign * 2.311, .14 + .37 * Math.cos(angle), .32 + .37 * Math.sin(angle)], "graphite");
  }
  cylinder(.2, .57, [sign * 2.05, .14, .32], "shell");
  box([.02, .23, .075], [sign * 2.35, .14, .32], "graphite", 0);
  box([.02, .075, .23], [sign * 2.35, .14, .32], "graphite", 0);
  // The two motor leads visibly return to the intelligent brick's rear ports.
  const curve = new CatmullRomCurve3([
    new Vector3(sign * 1.5, .65, -.8), new Vector3(sign * 1.7, 1.19, -.4),
    new Vector3(sign * 1.4, 1.36, 1.65), new Vector3(sign * .3, .97, 1.98),
  ]);
  add(new TubeGeometry(curve, 20, .045, 6, false), "graphite", [0, 0, 0]);
}
beam(11, [0, .34, -1.6], "red");
box([.66, .48, .7], [0, -.33, 1.48], "graphite", .05);
add(new SphereGeometry(.32, 16, 12), "axle", [0, -.46, 1.48]);

// Long, low EV3 brick: white shell, dark lower housing, inset LCD, five-way controls.
box([2.24, .66, 3.55], [0, .88, .16], "graphite", .12);
box([2.26, .73, 3.44], [0, 1.21, .16], "shell", .12);
box([1.69, .09, 1.59], [0, 1.597, -.4], "graphite", .08);
box([1.57, .035, 1.44], [0, 1.651, -.4], "motor", .045);
// Green center button and gray directional keys match the brick's physical control cluster.
box([.48, .05, .48], [0, 1.602, .95], "green", .035);
for (const [x, z, w, d] of [[-.46, .95, .33, .38], [.46, .95, .33, .38], [0, .53, .38, .28], [0, 1.37, .38, .28]])
  box([w, .065, d], [x, 1.63, z], "motor", .025);
box([.28, .045, .15], [-.77, 1.61, .64], "graphite", .025);
for (const z of [-1.57, 1.92]) {
  for (let index = 0; index < 4; index++) {
    box([.35, .28, .07], [-.66 + index * .44, .91, z], "graphite", .02);
    box([.21, .09, .08], [-.66 + index * .44, 1.04, z], "motor", .01);
  }
}
for (let index = 0; index < 5; index++) box([.018, .055, .44], [1.136, 1.13 + index * .07, .38], "graphite", 0);

const meshes = [...batches].map(([name, geometries]) => {
  const geometry = mergeGeometries(geometries);
  const positions = Array.from(geometry.getAttribute("position").array, value => +value.toFixed(5));
  // Source colors are linear, as required by the native mesh material format.
  const color = new Color(materials[name]);
  return { name, positions, indices: Array.from({ length: positions.length / 3 }, (_, i) => i), materials: [{ name, color: [color.r, color.g, color.b, 1], specularPower: name === "rubber" ? 8 : 45 }] };
});
// The screen is a separate textured surface, with UVs preserved.
const screen = new PlaneGeometry(1.42, 1.29).rotateX(-Math.PI / 2).translate(0, 1.676, -.4);
meshes.push({ name: "lcd", positions: Array.from(screen.attributes.position.array), uvs: Array.from(screen.attributes.uv.array), indices: Array.from(screen.index.array), materials: [{ name: "lcd", textureUrl: "/assets/kidx/ev3-lcd.svg" }] });
await writeFile(new URL("ev3-driving-base.json", directory), JSON.stringify({
  catalog: { label: "EV3-inspired Technic Driving Base", category: "vehicle" },
  provenance: { source: "Original procedural geometry; scripts/build-ev3-assets.mjs", reference: "https://education.lego.com/en-us/product-resources/mindstorms-ev3/downloads/building-instructions/", representation: "EV3-inspired; not a dimensionally qualified LEGO digital twin" },
  meshes,
}));
console.log(`EV3 model: ${meshes.length} material batches, ${meshes.reduce((n, mesh) => n + mesh.indices.length / 3, 0)} triangles → ${fileURLToPath(directory)}`);
