import { createEarth, earthMesh } from "./ballsy-earth";
import type { AgentWorldEntityDefinition, GraphysXAgentWorldApi } from "./agent-world-runtime";
import { VOLCANO_CROSSINGS, type VolcanoState } from "./ballsy-volcano";
import type { Object3D } from "three";
import { projectLiveLava } from "./ballsy-live-mesh";

const LAVA = { color: "#f89932", emissive: "#f45810", emissiveIntensity: 0.55, roughness: 0.48 };
export function volcanoEntities(): AgentWorldEntityDefinition[] {
  const entities: AgentWorldEntityDefinition[] = [];
  const positions: number[] = [], indices: number[] = [];
  const levels = [[.4,4.6],[1.1,3.8],[2.25,2.6],[3.15,1.85],[4,1.15]];
  const point = (i:number, level:number):[number,number,number] => {
    const a=i/24*Math.PI*2,[y,r]=levels[level],ridge=1+.10*Math.sin(i*2.7)+.055*Math.cos(i*5.1);
    return [Math.cos(a)*r*ridge,y+(level===0?0:.1*Math.sin(i*1.7)),Math.sin(a)*r*ridge];
  };
  const groups:{start:number;count:number;materialIndex:number}[]=[];
  // Independent faces retain the basalt's sculpted facets instead of smoothing a cone.
  for(let level=1;level<levels.length;level++){
    const start=indices.length;
    for(let i=0;i<24;i++){
      const a=point(i,level-1),b=point((i+1)%24,level-1),c=point((i+1)%24,level),d=point(i,level),n=positions.length/3;
      positions.push(...a,...c,...b,...a,...d,...c);indices.push(n,n+1,n+2,n+3,n+4,n+5);
    }
    groups.push({start,count:indices.length-start,materialIndex:(level-1)%3});
  }
  entities.push({ id: "volcano-mountain", type: "mesh", mesh: { positions, indices,groups,materials:[{color:"#353f46",roughness:1},{color:"#4b4c4c",roughness:.95},{color:"#686254",roughness:.94}] }, material: { color: "#353f46", roughness: 0.98 }, tags: ["ballsy", "volcano","volcano-landmark"] },
    { id: "volcano-crater", type: "torus", geometry: { radius: 1.15, tube: 0.2,radialSegments:12 }, transform: { position: [0, 4.02, 0], rotationDegrees: [90, 0, 0] }, material: { color: "#432f2d", roughness: 1 }, tags: ["volcano","volcano-landmark"] },
    { id: "volcano-heart", type: "sphere", geometry: { radius: 1,radialSegments:20 }, transform: { position: [0, 3.93, 0], scale: [1.1, 0.12, 1.1] }, material: {...LAVA,emissiveIntensity:1.25}, tags: ["volcano","volcano-landmark"] });
  const veins={positions:[] as number[],indices:[] as number[]};
  for(const column of [3,9,17])for(let level=1;level<levels.length;level++){
    const a=point(column,level-1),b=point(column,level),angle=column/24*Math.PI*2,width=level===1?.18:.085;
    const n=veins.positions.length/3;
    for(const [p,side]of [[a,-1],[b,-1],[b,1],[a,1]] as const)veins.positions.push(p[0]+Math.cos(angle)*.025-Math.sin(angle)*width*side,p[1]+.025,p[2]+Math.sin(angle)*.025+Math.cos(angle)*width*side);
    veins.indices.push(n,n+1,n+2,n,n+2,n+3);
  }
  entities.push({id:"volcano-glowing-veins",type:"mesh",mesh:veins,material:{...LAVA,emissiveIntensity:.85},castShadow:false,tags:["volcano","volcano-landmark"]});
  const segment = (id: string, a: [number, number, number], b: [number, number, number]): void => {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    entities.push({ id, type: "box", geometry: { width: Math.hypot(dx, dy, dz), height: 0.09, depth: 1 },
      transform: { position: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], rotationDegrees: [0, -Math.atan2(dz, dx) * 180 / Math.PI, Math.atan2(dy, Math.hypot(dx, dz)) * 180 / Math.PI] },
      material: LAVA, castShadow: false, tags: ["volcano", "lava"] });
  };
  segment("volcano-fall", [1.15, 4.03, 0], [4.5, 1.15, 0]);
  segment("volcano-trunk", [4.2, 0.84, 0], [6.4, 0.84, 0]);
  VOLCANO_CROSSINGS.forEach((z, i) => {
    segment(`volcano-stream-${i}-in`, [6.4, 0.84, 0], [9.9, 0.84, z]);
    segment(`volcano-stream-${i}-fall`, [9.9, 0.84, z], [10.4, 0.105, z]);
    segment(`volcano-stream-${i}-cross`, [10.4, 0.105, z], [14.2, 0.105, z]);
    entities.push({ id: `volcano-lake-${i}`, type: "sphere", geometry: { radius: 1 },
      transform: { position: [12.2, 0.12, z], scale: [2, 0.08, 0.01] }, visible: false,
      material: LAVA, castShadow: false, tags: ["volcano", "lava"] });
  });
  segment("volcano-diversion-fall", [-1.15, 4.03, 0], [-4.2, 0.84, 1.35]);
  segment("volcano-diversion", [-4.2, 0.84, 1.35], [-6.2, 0.84, 2]);
  entities.push({ id: "volcano-basin", type: "torus", geometry: { radius: 1.45, tube: 0.2 }, transform: { position: [5.5, 0.15, 6], rotationDegrees: [90, 0, 0] }, material: { color: "#655c63", roughness: 1 }, tags: ["volcano"] },
    { id: "volcano-basin-lava", type: "sphere", geometry: { radius: 1.3 }, transform: { position: [-6.2, 0.7, 2], scale: [1, 0.08, 1] }, material: LAVA, visible: false, tags: ["volcano", "lava"] },
    { id: "volcano-dry-lane", type: "box", geometry: { width: 1.5, height: 0.045, depth: 12 }, transform: { position: [15.3, 0.05, 0] }, material: { color: "#d9d4ba", roughness: 1 }, castShadow: false, tags: ["volcano", "dry-lane"] });
  entities.push({ id: "volcano-shovel", type: "group", transform: { position: [8, 1.8, 1] }, tags: ["volcano", "giant-tool"] },
    { id: "volcano-shovel-handle", parentId: "volcano-shovel", type: "box", geometry: { width: 0.15, height: 1.3, depth: 0.15 }, material: { color: "#d6a96c", roughness: 0.8 }, tags: ["volcano"] },
    { id: "volcano-shovel-head", parentId: "volcano-shovel", type: "box", geometry: { width: 0.6, height: 0.15, depth: 0.7 }, transform: { position: [0, -0.65, 0.15], rotationDegrees: [20, 0, 0] }, material: { color: "#447b80", roughness: 0.4, metalness: 0.4 }, tags: ["volcano"] });
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2;
    if (Math.cos(a) * 5.3 > 3.2) continue;
    entities.push({ id: `volcano-rock-${i}`, type: "icosahedron", geometry: { radius: 0.7 },
      transform: { position: [Math.cos(a) * 5.3, 0.8, Math.sin(a) * 3.5], scale: [1, 0.7 + i % 3 * 0.3, 1] },
      material: { color: i % 2 ? "#9e7e72" : "#7f7179", roughness: 1 }, tags: ["volcano"] });
  }
  const earth = createEarth();
  entities.push({ id: "volcano-earth", type: "mesh", mesh: earthMesh(earth), physics: { mode: "static", collider: "trimesh", friction: 0.8, restitution: 0.1 }, material: { color: "#b9824f", roughness: 1 }, tags: ["volcano", "diggable"] },
    { id: "volcano-earth-lava", type: "mesh", mesh: earthMesh(earth, true), material: LAVA, castShadow: false, tags: ["volcano", "lava"] });
  return entities;
}

const projected = new WeakMap<GraphysXAgentWorldApi, number>();
export function projectVolcano(api: GraphysXAgentWorldApi, state: VolcanoState, visualObject?: (id: string) => Object3D | null | undefined): void {
  if (projected.get(api) !== state.earth.revision) api.update("volcano-earth", { mesh: earthMesh(state.earth) });
  const lava = earthMesh(state.earth, true);
  if (!visualObject || !projectLiveLava(visualObject("volcano-earth-lava"), lava)) api.update("volcano-earth-lava", { mesh: lava });
  // Historical decorative channel geometry is never the source of truth for the physical game.
  if (!projected.has(api)) for (const id of ["volcano-trunk", "volcano-shovel", "volcano-diversion", "volcano-diversion-fall", "volcano-basin-lava",
    ...[0, 1].flatMap(i => [`volcano-stream-${i}-in`, `volcano-stream-${i}-fall`, `volcano-stream-${i}-cross`, `volcano-lake-${i}`])]) if (api.query({ids:[id]}).length) api.update(id, { visible: false });
  projected.set(api, state.earth.revision);
}
