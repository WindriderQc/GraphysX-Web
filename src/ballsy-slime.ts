import { COURSE_MAIN, COURSE_SHORTCUT, courseEdge } from "./ballsy-course";
import { BALLSY_SLIME_LIMITS as LIMITS, parseGiantCommand } from "../server/ballsy-protocol.mjs";
export { BALLSY_SLIME_LIMITS } from "../server/ballsy-protocol.mjs";
export const BALLSY_SLIME_STEP = 1 / 60;
type Vec = [number, number, number];
export type BallsySlimeCommand = { type: "slime"; throwId: string; origin: Vec; velocity: Vec };
export type BallsySlimeProjectile = { id: string; position: Vec; velocity: Vec; bornAt: number };
export type BallsySlimeSplat = { id: string; position: Vec; normal: Vec; bornAt: number; radius: number; player: 0 | 1 | null };
export type BallsySlimeSnapshot = {
  time: number; cooldownUntil: number; projectiles: BallsySlimeProjectile[]; splats: BallsySlimeSplat[];
  slowUntil: [number, number]; throws: number; hits: number;
};
export type BallsySlimeState = BallsySlimeSnapshot & { immuneUntil: [number, number]; seenThrowIds: Set<string> };
export type BallsySlimeRunner = { position: readonly number[]; previous?: readonly number[]; finished?: boolean };
export const createBallsySlime = (): BallsySlimeState => ({ time: 0, cooldownUntil: 0, projectiles: [], splats: [],
  slowUntil: [0, 0], immuneUntil: [0, 0], throws: 0, hits: 0, seenThrowIds: new Set() });
export function snapshotBallsySlime(s: BallsySlimeState): BallsySlimeSnapshot {
  return structuredClone({ time: s.time, cooldownUntil: s.cooldownUntil, projectiles: s.projectiles,
    splats: s.splats, slowUntil: s.slowUntil, throws: s.throws, hits: s.hits });
}
/** Host-only admission. Accepted IDs remain remembered for the entire bounded round. */
export function launchBallsySlime(s: BallsySlimeState, raw: unknown): { ok: boolean; reason?: string } {
  const c = parseGiantCommand(raw);
  if (!c || c.type !== "slime") return { ok: false, reason: "Lancer invalide." };
  if (s.seenThrowIds.has(c.throwId)) return { ok: false, reason: "Ce ballon a déjà été lancé." };
  if (s.time + 1e-8 < s.cooldownUntil || s.projectiles.length >= LIMITS.maxProjectiles) return { ok: false, reason: "Le prochain ballon arrive." };
  if (s.throws >= LIMITS.maxThrows) return { ok: false, reason: "Recommencez la course pour remplir les ballons." };
  s.seenThrowIds.add(c.throwId); s.throws++; s.cooldownUntil = s.time + LIMITS.cooldown;
  s.projectiles.push({ id: c.throwId, position: [...c.origin], velocity: [...c.velocity], bornAt: s.time });
  return { ok: true };
}
/** Pause/disconnect cancel airborne throws, never erase an earned coating or grant speed. */
export function cancelBallsySlimeFlight(s: BallsySlimeState): void { s.projectiles = []; }
export function ballsySlimeSpeedFactor(s: BallsySlimeSnapshot, slot: number): number {
  const remaining = Math.max(0, (s.slowUntil[slot] ?? 0) - s.time);
  return remaining > 1e-8 ? LIMITS.minimumSpeedFactor : 1;
}
const sub = (a: readonly number[], b: readonly number[]): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: readonly number[], b: readonly number[]): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: readonly number[], b: readonly number[]): Vec => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const mix = (a: readonly number[], b: readonly number[], t: number): Vec => [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const unit = (v: Vec): Vec => { const n = Math.hypot(...v); return n > 1e-10 ? v.map(x => x/n) as Vec : [0, 1, 0]; };
type Triangle = { a: Vec; ab: Vec; ac: Vec; normal: Vec; minX: number; maxX: number; minZ: number; maxZ: number };
type Hit = { t: number; position: Vec; normal: Vec };
// Exactly the top faces of the two authored road ribbons, not nearest-course snapping.
const triangles: Triangle[] = [];
const cells = new Map<string, number[]>();
for (const route of [COURSE_MAIN, COURSE_SHORTCUT]) for (let i=1; i<route.length; i++) {
  const a=route[i-1], b=route[i];
  const a0=courseEdge(a,-a.width/2), a1=courseEdge(a,a.width/2), b0=courseEdge(b,-b.width/2), b1=courseEdge(b,b.width/2);
  for (const [p,q,r] of [[a1,b1,b0],[a1,b0,a0]]) {
    const ab=sub(q,p),ac=sub(r,p), normal=unit(cross(ab,ac));
    if(normal[1]<0) for(let k=0;k<3;k++) normal[k]*=-1;
    const tr={a:p,ab,ac,normal,minX:Math.min(p[0],q[0],r[0]),maxX:Math.max(p[0],q[0],r[0]),minZ:Math.min(p[2],q[2],r[2]),maxZ:Math.max(p[2],q[2],r[2])};
    const id=triangles.push(tr)-1;
    for(let x=Math.floor((tr.minX-LIMITS.radius)/6);x<=Math.floor((tr.maxX+LIMITS.radius)/6);x++) for(let z=Math.floor((tr.minZ-LIMITS.radius)/6);z<=Math.floor((tr.maxZ+LIMITS.radius)/6);z++) {
      const key=`${x},${z}`, list=cells.get(key)??[]; list.push(id); cells.set(key,list);
    }
  }
}
function firstRoot(a: number, b: number, c: number): number | null {
  if(c<=0)return 0;
  const disc=b*b-4*a*c;if(a<1e-12||disc<0)return null;
  const t=(-b-Math.sqrt(disc))/(2*a);return t>=0&&t<=1?t:null;
}
/** Capsule edge contact closes the cracks a face-only sphere sweep leaves between triangles. */
function sweepEdge(from: readonly number[], to: readonly number[], a: Vec, b: Vec, radius: number): Hit | null {
  const d=sub(to,from),e=sub(b,a),w=sub(from,a),ee=dot(e,e),de=dot(d,e),we=dot(w,e);
  let best: Hit | null=null;
  const take=(t:number|null,point:Vec):void=>{if(t!==null&&(!best||t<best.t))best={t,position:point,normal:unit(sub(mix(from,to,t),point))};};
  if(ee>1e-12){
    const t=firstRoot(dot(d,d)-de*de/ee,2*(dot(w,d)-we*de/ee),dot(w,w)-we*we/ee-radius*radius);
    if(t!==null){const u=(we+de*t)/ee;if(u>=0&&u<=1)take(t,mix(a,b,u));}
  }
  for(const point of [a,b]){const offset=sub(from,point);take(firstRoot(dot(d,d),2*dot(offset,d),dot(offset,offset)-radius*radius),point);}
  return best;
}
/** Swept sphere road intersection; broadphase is a prebuilt XZ grid. */
export function sweepBallsySlimeRoad(from: readonly number[], to: readonly number[], radius=LIMITS.radius): Hit | null {
  let best: Hit | null = null;
  const checked=new Set<number>();
  for(let x=Math.floor((Math.min(from[0],to[0])-radius)/6);x<=Math.floor((Math.max(from[0],to[0])+radius)/6);x++) for(let z=Math.floor((Math.min(from[2],to[2])-radius)/6);z<=Math.floor((Math.max(from[2],to[2])+radius)/6);z++) {
    for(const id of cells.get(`${x},${z}`)??[]) {
      if(checked.has(id))continue; checked.add(id);
      const tr=triangles[id], start=dot(sub(from,tr.a),tr.normal)-radius, end=dot(sub(to,tr.a),tr.normal)-radius;
      if(start+radius< -0.00001)continue;
      const b:Vec=[tr.a[0]+tr.ab[0],tr.a[1]+tr.ab[1],tr.a[2]+tr.ab[2]],c:Vec=[tr.a[0]+tr.ac[0],tr.a[1]+tr.ac[1],tr.a[2]+tr.ac[2]];
      for(const [a,z] of [[tr.a,b],[b,c],[c,tr.a]]){
        const edge=sweepEdge(from,to,a,z,radius);if(edge&&(!best||edge.t<best.t))best=edge;
      }
      if(start>0&&(end>0||start-end<1e-10))continue;
      const t=start<=0?0:start/(start-end); if(best&&t>=best.t)continue;
      const centre=mix(from,to,t), separation=dot(sub(centre,tr.a),tr.normal);
      const position=sub(centre,tr.normal.map(n=>n*separation));
      const ap=sub(position,tr.a), aa=dot(tr.ab,tr.ab), ac=dot(tr.ab,tr.ac), cc=dot(tr.ac,tr.ac), pa=dot(ap,tr.ab), pc=dot(ap,tr.ac), d=aa*cc-ac*ac;
      const u=(cc*pa-ac*pc)/d, v=(aa*pc-ac*pa)/d;
      if(u>=-1e-7&&v>=-1e-7&&u+v<=1+1e-7)best={t,position,normal:[...tr.normal]};
    }
  }
  return best;
}
/** Moving-ball CCD in relative coordinates; frame-sized motion cannot tunnel through it. */
function sphereHit(from: readonly number[], to: readonly number[], runner: BallsySlimeRunner): number | null {
  const previous=runner.previous??runner.position;
  const a=sub(from,previous), b=sub(to,runner.position), d=sub(b,a), radius=LIMITS.radius+0.65;
  const c=dot(a,a)-radius*radius; if(c<=0)return 0;
  const aa=dot(d,d),bb=2*dot(a,d),discriminant=bb*bb-4*aa*c;
  if(aa<1e-12||discriminant<0)return null;
  const t=(-bb-Math.sqrt(discriminant))/(2*aa); return t>=0&&t<=1?t:null;
}
function coat(s: BallsySlimeState, slot: 0|1): void {
  if(s.time+1e-8<s.immuneUntil[slot])return;
  s.slowUntil[slot]=s.time+LIMITS.slowSeconds;
  s.immuneUntil[slot]=s.time+LIMITS.slowSeconds+LIMITS.immunitySeconds; s.hits++;
}
/** Called only inside the host's existing 60 Hz physics loop, never in wall-clock timers. */
export function advanceBallsySlime(s: BallsySlimeState, seconds: number, runners: readonly BallsySlimeRunner[]): void {
  if(seconds===0)return;
  if(!Number.isFinite(seconds)||Math.abs(seconds-BALLSY_SLIME_STEP)>1e-8)throw new RangeError("Slime expects one fixed 1/60 second step");
  s.time+=seconds;
  s.splats=s.splats.filter(p=>s.time-p.bornAt<LIMITS.splatSeconds);
  const remaining: BallsySlimeProjectile[]=[];
  for(const p of s.projectiles) {
    if(s.time-p.bornAt>LIMITS.projectileSeconds)continue;
    const next:Vec=[p.position[0]+p.velocity[0]*seconds,p.position[1]+p.velocity[1]*seconds-LIMITS.gravity*seconds*seconds/2,p.position[2]+p.velocity[2]*seconds];
    let hit=sweepBallsySlimeRoad(p.position,next), player:0|1|null=null;
    runners.slice(0,2).forEach((r,i)=>{if(r.finished)return; const t=sphereHit(p.position,next,r);if(t!==null&&(!hit||t<hit.t)){
      const position=mix(p.position,next,t);hit={t,position,normal:unit(sub(position,mix(r.previous??r.position,r.position,t)))};player=i as 0|1;
    }});
    if(hit){
      if(player!==null)coat(s,player);
      s.splats.push({id:p.id,position:hit.position,normal:hit.normal,bornAt:s.time,radius:LIMITS.splatRadius,player});
      if(s.splats.length>LIMITS.maxSplats)s.splats.shift();
    } else if(next[1]>-8&&Math.abs(next[0])<80&&Math.abs(next[2])<70) {
      p.position=next;p.velocity[1]-=LIMITS.gravity*seconds;remaining.push(p);
    }
  }
  s.projectiles=remaining;
  // A road splat coats a physical crossing, not an arbitrarily selected racer. Height
  // excludes cars passing below an elevated road; direct impacts are cosmetic here.
  for(const splat of s.splats) {
    if(splat.player!==null)continue;
    runners.slice(0,2).forEach((r,i)=>{
      if(r.finished)return;
      const a=r.previous??r.position,b=r.position,delta=sub(b,a),denominator=dot(delta,delta);
      const t=denominator?Math.max(0,Math.min(1,dot(sub(splat.position,a),delta)/denominator)):1;
      const relative=sub(mix(a,b,t),splat.position),height=dot(relative,splat.normal);
      const radial2=Math.max(0,dot(relative,relative)-height*height);
      if(height>=-0.15&&height<=1.35&&radial2<=(splat.radius+0.45)**2)coat(s,i as 0|1);
    });
  }
}
