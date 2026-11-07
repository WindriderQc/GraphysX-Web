// GraphysX-authored generic controller. No third-party mesh or network dependency.
import { Group, Mesh, BoxGeometry, CylinderGeometry, MeshStandardMaterial } from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mkdir, writeFile } from 'node:fs/promises';
const directory = new URL('../public/assets/xr/profiles/generic-trigger/', import.meta.url);
await mkdir(directory, { recursive: true });
globalThis.FileReader = class {
  readAsDataURL(blob) { blob.arrayBuffer().then(buffer => { this.result = `data:application/octet-stream;base64,${Buffer.from(buffer).toString('base64')}`; this.onloadend?.(); }); }
};
const root = new Group();
const dark = new MeshStandardMaterial({color: '#173344', roughness: .58, metalness: .25});
const accent = new MeshStandardMaterial({color: '#6df3ce', roughness: .35, emissive: '#123f38'});
const white = new MeshStandardMaterial({color: '#dfedff', roughness: .48});
const body = new Mesh(new BoxGeometry(.055,.115,.055),dark); body.position.set(0,-.025,.015); root.add(body);
const top = new Mesh(new CylinderGeometry(.043,.035,.025,16),dark); top.position.set(0,.038,-.007); root.add(top);
const components = {};
function control(id, index, position, delta, geometry, material, type = 'button') {
  const value = new Mesh(geometry, material); value.name = `${id}-value`; value.position.set(...position);
  const min = new Group(); min.name = `${id}-min`; min.position.copy(value.position);
  const max = new Group(); max.name = `${id}-max`; max.position.set(...position.map((v,i)=>v+delta[i]));
  root.add(value,min,max);
  components[id] = { type, gamepadIndices: {button:index}, rootNodeName: value.name,
    visualResponses: { press: {componentProperty:'button', states:['default','touched','pressed'], valueNodeProperty:'transform', valueNodeName:value.name, minNodeName:min.name,maxNodeName:max.name} } };
}
control('xr-standard-trigger',0,[0,.018,-.026],[0,0,.009],new BoxGeometry(.032,.027,.012),accent,'trigger');
control('xr-standard-squeeze',1,[-.03,-.021,.008],[.008,0,0],new BoxGeometry(.012,.045,.033),accent,'squeeze');
control('xr-standard-thumbstick',3,[-.013,.057,-.013],[0,-.007,0],new CylinderGeometry(.011,.011,.012,12),white,'thumbstick');
control('a-button',4,[.019,.056,-.016],[0,-.006,0],new CylinderGeometry(.008,.008,.01,12),accent);
control('b-button',5,[.02,.056,.007],[0,-.006,0],new CylinderGeometry(.008,.008,.01,12),white);
const exported = await new GLTFExporter().parseAsync(root, {binary:false});
await writeFile(new URL('controller.gltf',directory), JSON.stringify(exported));
const layout = {selectComponentId:'xr-standard-trigger', components, assetPath:'controller.gltf'};
await writeFile(new URL('profile.json',directory),JSON.stringify({profileId:'generic-trigger', fallbackProfileIds:[], layouts:{left:layout,right:layout,none:layout}},null,2)+'\n');
await writeFile(new URL('../profilesList.json',directory), JSON.stringify({'generic-trigger':{path:'generic-trigger/profile.json'}},null,2)+'\n');
console.log('Generated local generic controller and WebXR input profile.');
