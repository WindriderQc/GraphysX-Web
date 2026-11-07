import { DoubleSide, Mesh, MeshStandardMaterial, Vector3, type Object3D } from "three";
import type { AgentWorldEntityDefinition } from "./agent-world-runtime";
import { BALLSY_SLIME_LIMITS as L, type BallsySlimeSnapshot } from "./ballsy-slime";

/** Fixed visual pool, no colliders, particles, texture uploads or editor snapshots per tick. */
export function ballsySlimeEntities(): AgentWorldEntityDefinition[] {
  const material={color:"#b0ed39",emissive:"#538b12",emissiveIntensity:0.18,roughness:0.35};
  const positions=[0,0,0],indices:number[]=[];
  for(let i=0;i<24;i++){
    const a=i/24*Math.PI*2,r=i%3===0?1:0.75;
    positions.push(Math.cos(a)*r,0,Math.sin(a)*r);
    indices.push(0,(i+1)%24+1,i+1);
  }
  return [
    ...Array.from({length:L.maxProjectiles},(_,i):AgentWorldEntityDefinition=>({id:`ballsy-slime-ball-${i}`,type:"sphere",geometry:{radius:L.radius},material,
      visible:false,castShadow:false,tags:["ballsy","slime","transient"]})),
    ...Array.from({length:L.maxSplats},(_,i):AgentWorldEntityDefinition=>({id:`ballsy-slime-splat-${i}`,type:"mesh",mesh:{positions:[...positions],indices:[...indices]},
      material:{...material,opacity:0.94,roughness:0.65,side:"double"},visible:false,castShadow:false,tags:["ballsy","slime","transient"]})),
    // A faint coat follows the actual ball from every camera. Parenting avoids a
    // second pose/interpolation path and leaves the original racer colour visible.
    ...Array.from({length:2},(_,i):AgentWorldEntityDefinition=>({id:`ballsy-slime-coat-${i}`,parentId:`ballsy-p${i+1}`,type:"sphere",geometry:{radius:0.94},
      material:{color:"#b7f534",emissive:"#6a9e14",emissiveIntensity:0.38,roughness:0.35,opacity:0.42},
      visible:false,castShadow:false,receiveShadow:false,tags:["ballsy","slime","transient"]})),
  ];
}
const up=new Vector3(0,1,0),normal=new Vector3();
/** Visual projection only. The transmitted host model remains the entire authority. */
export function projectBallsySlime(state: BallsySlimeSnapshot, visualObject: (id:string)=>Object3D|null|undefined, presentationSeconds = 0): void {
  const elapsed = Number.isFinite(presentationSeconds) ? Math.max(0, Math.min(0.12, presentationSeconds)) : 0;
  for(let i=0;i<L.maxProjectiles;i++) {
    const object=visualObject(`ballsy-slime-ball-${i}`); if(!object)continue;
    const p=state.projectiles[i];object.visible=!!p;
    if(p){object.position.set(p.position[0]+p.velocity[0]*elapsed,p.position[1]+p.velocity[1]*elapsed-L.gravity*elapsed*elapsed/2,p.position[2]+p.velocity[2]*elapsed);object.scale.set(1,1.12,1);object.updateMatrix();}
  }
  for(let i=0;i<L.maxSplats;i++) {
    const object=visualObject(`ballsy-slime-splat-${i}`);if(!object)continue;
    const p=state.splats[i];object.visible=!!p;
    if(!p)continue;
    const age=Math.max(0,state.time-p.bornAt),pop=0.65+0.35*Math.min(1,age/0.09);
    normal.set(...p.normal);object.position.set(...p.position).addScaledVector(normal,0.065);
    object.quaternion.setFromUnitVectors(up,normal);object.scale.setScalar(p.radius*pop);object.updateMatrix();
    if(object instanceof Mesh)for(const material of Array.isArray(object.material)?object.material:[object.material]){
      if(!(material instanceof MeshStandardMaterial))continue;
      material.opacity=0.94*Math.max(0,Math.min(1,(L.splatSeconds-age)/0.5));
      material.depthWrite=false;
      if(material.side!==DoubleSide){material.side=DoubleSide;material.needsUpdate=true;}
      if(!material.transparent){material.transparent=true;material.needsUpdate=true;}
    }
  }
  for(let i=0;i<2;i++) {
    const object=visualObject(`ballsy-slime-coat-${i}`);if(!object)continue;
    const remaining=Math.max(0,(state.slowUntil[i]??0)-state.time);
    object.visible=remaining>1e-8;
    if(!object.visible)continue;
    // Full size on the first impact frame, with a very small breathing movement.
    object.scale.setScalar(1+0.025*Math.sin(state.time*11));object.updateMatrix();
    if(object instanceof Mesh)for(const material of Array.isArray(object.material)?object.material:[object.material]){
      if(!(material instanceof MeshStandardMaterial))continue;
      material.opacity=0.42*Math.min(1,remaining/0.2);material.depthWrite=false;
      if(!material.transparent){material.transparent=true;material.needsUpdate=true;}
    }
  }
}
