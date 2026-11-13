import type { AgentWorldDefinition, AgentWorldEntityDefinition } from "./agent-world-runtime";
import build from "../public/assets/quest3/build.json";

export const QUEST3_ASSETS = [
  "/assets/quest3/station.glb", "/assets/quest3/station-light.ktx2", "/assets/quest3/equipment.glb",
  "/assets/quest3/equipment-low.glb", "/assets/quest3/panels.ktx2", "/assets/quest3/rib.glb",
  "/assets/quest3/inlay.glb", "/assets/quest3/star.glb", "/assets/quest3/planet.glb",
  "/assets/quest3/planet.ktx2",
  "/assets/quest3/deck.ktx2",
  "/assets/quest3/build.json", "/assets/quest3/LICENSE.txt",
];
const native = (id: string, url: string, fitSize: number, position: [number,number,number], extra = {}): AgentWorldEntityDefinition => ({
  id, type: "model", asset: { url, format: "gltf", fitSize, ...extra }, transform: { position }, castShadow: false, receiveShadow: false, tags: ["nacre", "native-gltf"],
});

/** The complete portable world; no separate showcase scene graph or model loader. */
export function createQuest3Scene(): AgentWorldDefinition {
  const entities: AgentWorldEntityDefinition[] = [
    { id: "nacre-ambient", type: "ambient-light", intensity: .1, material: { color: "#87b6d4" } },
    { id: "nacre-sun", type: "directional-light", intensity: .8, transform: { position: [12,18,10] }, material: { color: "#d9eff3" }, castShadow: false },
    native("nacre-station", "/assets/quest3/station.glb", build.station.fitSize, build.station.centre as [number,number,number], { lightmap: { url: "/assets/quest3/station-light.ktx2", intensity: 1.15 } }),
    native("nacre-planet", "/assets/quest3/planet.glb", 36, [1,9,-58]),
    native("nacre-ribs", "/assets/quest3/rib.glb", 13.5, [0,0,0], {
      instances: [-22,-18,-14,-10,-6,-2,2].map(z => ({ position: [0,2.95,z] })),
    }),
    native("nacre-inlays", "/assets/quest3/inlay.glb", 1.4, [0,0,0], {
      instances: [-1,1].flatMap(side => Array.from({length:16},(_,i)=>({ position: [side*4.95,.012,1-i*1.5] }))),
    }),
    native("nacre-equipment", "/assets/quest3/equipment.glb", .8, [0,0,-10], {
      instances: [-1,1].flatMap(side => Array.from({length:9},(_,i)=>({ position: [side*5.6,1.38,8-i*2.2], rotationDegrees: [0,side<0?90:-90,0] }))),
      lods: [{ url: "/assets/quest3/equipment-low.glb", distance: 14 }],
    }),
    { id: "nacre-reactor-core", type: "cylinder", geometry: { radius: .55, height: 3.8, radialSegments: 32 }, transform: { position: [0,2.7,-11] }, material: { color: "#5dcddd", emissive: "#28c5e1", emissiveIntensity: 1.8, metalness: .35, roughness: .28 }, castShadow: false },
    { id: "nacre-control", type: "box", geometry: { width: .55, height: .13, depth: .38 }, transform: { position: [.75,1.05,-.9], rotationDegrees: [-12,0,0] }, material: { color: "#64dacb", emissive: "#159c99", emissiveIntensity: .5, roughness: .3 }, tags: ["nacre", "interactive"] },
  ];
  for (let i=0;i<4;i++) entities.push({
    id: `nacre-reactor-ring-${i}`, type: "torus", geometry: { radius: 1.15+(i%2)*.2, tube: .035, radialSegments: 48 },
    transform: { position: [0,1.25+i*.95,-11], rotationDegrees: [90,0,i*30] },
    material: { color: i%2 ? "#e4ab57" : "#7fe6e7", emissive: i%2 ? "#ce7224" : "#41e7ed", emissiveIntensity: 1.3, metalness: .3, roughness: .4 },
    behaviors: [{ type: "spin", speedDegrees: 12*(i%2?-1:1), axis: "z" }], castShadow: false,
  });
  for (const side of [-1,1]) for (const z of [-2,-8,-14,-21]) entities.push({
    id: `nacre-luminaire-${side<0?"port":"starboard"}-${-z}`, type: "box", geometry: { width: .045,height: .055,depth: 2 },
    transform: { position: [side*4.8,3.8,z] }, material: { color: side<0?"#73dcf4":"#e6ac67", emissive: side<0?"#68c8ef":"#df943a", emissiveIntensity: 1.4 }, castShadow: false,
  });
  let seed = 42; const random = () => { seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296; };
  const stars=Array.from({length:420},()=>{const az=random()*Math.PI*2,y=random()*1.9-.95,r=160;const d=Math.sqrt(1-y*y);const s=.045+random()*.095;
    return { position: [Math.cos(az)*r*d,y*r,Math.sin(az)*r*d] as [number,number,number], scale: [s,s,s] as [number,number,number] }; });
  entities.push(native("nacre-stars", "/assets/quest3/star.glb", 1, [0,0,0], { instances: stars }));
  return {
    schema: "graphysx.agent-world/v2", id: "nacre-quest3", label: "NACRE · Observatoire orbital",
    environment: { background: "#030812", ground: { visible: false, size: 32, color: "#10212e", grid: false, gridColor: "#234455" }, envelope: { fogNear: 175, fogFar: 210, cameraFar: 230 }, lighting: { source: "studio", intensity: .4, yawDegrees: 0, backgroundIntensity: 1, backgroundBlur: 0 } },
    entities,
  };
}
