import { DoubleSide, Mesh, MeshStandardMaterial, Vector3, type Object3D } from "three";
import type { AgentWorldEntityDefinition } from "./agent-world-runtime";
import { BALLSY_SLIME_LIMITS as L, type BallsySlimeSnapshot } from "./ballsy-slime";
import { ballsyBalloonMesh, ballsySlimeSplatMesh } from "./ballsy-art";

/** Fixed visual pool, no colliders, particles, texture uploads or editor snapshots per tick. */
export function ballsySlimeEntities(): AgentWorldEntityDefinition[] {
  const material={color:"#a8e92f",emissive:"#426508",emissiveIntensity:0.13,roughness:0.18,metalness:.04};
  return [
    ...Array.from({length:L.maxProjectiles},(_,i):AgentWorldEntityDefinition=>({id:`ballsy-slime-ball-${i}`,type:"mesh",mesh:ballsyBalloonMesh(L.radius),material,
      visible:false,castShadow:false,tags:["ballsy","slime","transient"]})),
    ...Array.from({length:L.maxSplats},(_,i):AgentWorldEntityDefinition=>({id:`ballsy-slime-splat-${i}`,type:"mesh",mesh:ballsySlimeSplatMesh(),
      material:{...material,opacity:0.94,roughness:0.24,side:"double"},visible:false,castShadow:false,tags:["ballsy","slime","transient"]})),
    // A faint coat follows the actual ball from every camera. Parenting avoids a
    // second pose/interpolation path and leaves the original racer colour visible.
    ...Array.from({length:2},(_,i):AgentWorldEntityDefinition=>({id:`ballsy-slime-coat-${i}`,parentId:`ballsy-p${i+1}`,type:"sphere",geometry:{radius:0.76,radialSegments:24},
      material:{color:"#b7f534",emissive:"#6a9e14",emissiveIntensity:0.38,roughness:0.35,opacity:0.42},
      visible:false,castShadow:false,receiveShadow:false,tags:["ballsy","slime","transient"]})),
  ];
}
const up=new Vector3(0,1,0),normal=new Vector3(),flightDirection=new Vector3();
/** Visual projection only. The transmitted host model remains the entire authority. */
export function projectBallsySlime(state: BallsySlimeSnapshot, visualObject: (id:string)=>Object3D|null|undefined, presentationSeconds = 0): void {
  const elapsed = Number.isFinite(presentationSeconds) ? Math.max(0, Math.min(0.12, presentationSeconds)) : 0;
  for(let i=0;i<L.maxProjectiles;i++) {
    const object=visualObject(`ballsy-slime-ball-${i}`); if(!object)continue;
    const p=state.projectiles[i];object.visible=!!p;
    if(p){
      object.position.set(p.position[0]+p.velocity[0]*elapsed,p.position[1]+p.velocity[1]*elapsed-L.gravity*elapsed*elapsed/2,p.position[2]+p.velocity[2]*elapsed);
      flightDirection.set(...p.velocity);const speed=flightDirection.length(),stretch=1+Math.min(.28,speed/350),width=1/Math.sqrt(stretch);
      object.scale.set(width,stretch,width);object.quaternion.setFromUnitVectors(up,speed>.001?flightDirection.divideScalar(speed):up);object.updateMatrix();
    }
  }
  for(let i=0;i<L.maxSplats;i++) {
    const object=visualObject(`ballsy-slime-splat-${i}`);if(!object)continue;
    const p=state.splats[i];object.visible=!!p;
    if(!p)continue;
    const age=Math.max(0,state.time-p.bornAt),pop=0.65+0.35*Math.min(1,age/0.09);
    // A direct-hit splat is only a burst. The separate parented coat carries the
    // full slowdown; leaving a large contact-normal disc here resembles a flag.
    // Road puddles keep their original radius and entire authoritative lifetime.
    const direct=p.player!==null,lifetime=direct ? .45 : L.splatSeconds,radius=p.radius*(direct ? .55 : 1);
    object.visible=age<lifetime;if(!object.visible)continue;
    normal.set(...p.normal);object.position.set(...p.position).addScaledVector(normal,0.065);
    object.quaternion.setFromUnitVectors(up,normal);
    // A squash-and-settle is presentation only, driven entirely by host impact age.
    const lift=1+1.4*Math.sin(Math.min(1,age/.28)*Math.PI)*Math.max(0,1-age/.28);
    object.scale.set(radius*pop,radius*lift,radius*pop);object.updateMatrix();
    if(object instanceof Mesh)for(const material of Array.isArray(object.material)?object.material:[object.material]){
      if(!(material instanceof MeshStandardMaterial))continue;
      material.opacity=0.94*Math.max(0,Math.min(1,(lifetime-age)/Math.min(.5,lifetime)));
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
