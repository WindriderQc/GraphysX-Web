// Declarative construction expands into the same portable buffers as hand-authored triangles.
import { assertInlineMesh, MESH_LIMITS } from './inline-mesh.mjs';

export const CONSTRUCTION_LIMITS = Object.freeze({ profilePoints: 64, pathPoints: 64, segments: 64 });
export const CONSTRUCTION_FIELDS = Object.freeze({ extrude: ['kind', 'profile', 'depth'], revolve: ['kind', 'profile', 'segments', 'angleDegrees'], sweep: ['kind', 'profile', 'path'] });
const cross2 = (a, b, c) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const dot = (a,b) => a.reduce((sum,v,i)=>sum+v*b[i],0);
const sub = (a,b) => a.map((v,i)=>v-b[i]);
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const length = v => Math.sqrt(dot(v,v));
const unit = v => { const size=length(v); if(size<1e-8) throw new Error('Construction has a collapsed direction'); return v.map(n=>n/size); };
// Host libm sin/cos can differ by an ULP across Node/Chromium. Fixed arithmetic followed by
// canonical Float32 output keeps a live recipe and its persisted buffers identical.
function sine(theta) {
  let x=theta%(2*Math.PI);
  if(x>Math.PI)x-=2*Math.PI;if(x<-Math.PI)x+=2*Math.PI;
  if(x>Math.PI/2)x=Math.PI-x;if(x<-Math.PI/2)x=-Math.PI-x;
  const q=x*x;
  return x*(1+q*(-1/6+q*(1/120+q*(-1/5040+q*(1/362880+q*(-1/39916800+q*(1/6227020800-q/1307674368000)))))));
}
function points(value, dimension, min, max, label) {
  if(!Array.isArray(value)||value.length<min||value.length>max) throw new Error(`${label} requires ${min} to ${max} points`);
  for(const point of value) if(!Array.isArray(point)||point.length!==dimension||point.some(n=>!Number.isFinite(n)||Math.abs(n)>MESH_LIMITS.coordinate)) throw new Error(`${label} requires finite bounded ${dimension}D points`);
  return value.map(point=>[...point]);
}
function positive(value, label, max=MESH_LIMITS.coordinate) {
  if(!Number.isFinite(value)||value<=0||value>max) throw new Error(`${label} must be positive and at most ${max}`);
  return value;
}
function budget(vertices, triangles) {
  if(vertices>MESH_LIMITS.vertices||triangles>MESH_LIMITS.triangles) throw new Error('Construction exceeds the inline mesh geometry budget');
}
// Simple polygons only. Reject crossings/touches, rather than producing ambiguous caps.
function polygon(raw) {
  const p=points(raw,2,3,CONSTRUCTION_LIMITS.profilePoints,'profile'),n=p.length;
  const on=(a,b,c)=>cross2(a,b,c)===0&&c[0]>=Math.min(a[0],b[0])&&c[0]<=Math.max(a[0],b[0])&&c[1]>=Math.min(a[1],b[1])&&c[1]<=Math.max(a[1],b[1]);
  for(let i=0;i<n;i++) {
    const a=p[i],b=p[(i+1)%n];
    if(Math.hypot(...sub(a,b))<1e-8||cross2(p[(i+n-1)%n],a,b)===0) throw new Error('profile has a repeated or collinear corner');
    for(let j=i+1;j<n;j++) {
      if(j===i+1||(i===0&&j===n-1)) continue;
      const c=p[j],d=p[(j+1)%n],abC=cross2(a,b,c),abD=cross2(a,b,d),cdA=cross2(c,d,a),cdB=cross2(c,d,b);
      if((abC*abD<0&&cdA*cdB<0)||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b)) throw new Error('profile must be a simple non-touching polygon');
    }
  }
  const area=p.reduce((s,a,i)=>s+a[0]*p[(i+1)%n][1]-p[(i+1)%n][0]*a[1],0);
  if(area===0) throw new Error('profile has zero area');
  if(area<0) p.reverse();
  return p;
}
function caps(p) {
  const left=p.map((_,i)=>i),triangles=[];
  while(left.length>3) {
    let clipped=false;
    for(let i=0;i<left.length;i++) {
      const a=left[(i+left.length-1)%left.length],b=left[i],c=left[(i+1)%left.length];
      if(cross2(p[a],p[b],p[c])<=0) continue;
      if(left.some(k=>k!==a&&k!==b&&k!==c&&cross2(p[a],p[b],p[k])>=0&&cross2(p[b],p[c],p[k])>=0&&cross2(p[c],p[a],p[k])>=0)) continue;
      triangles.push([a,b,c]);left.splice(i,1);clipped=true;break;
    }
    if(!clipped) throw new Error('profile could not be triangulated');
  }
  triangles.push(left);return triangles;
}
function capUV(profile) {
  const min=[0,1].map(i=>Math.min(...profile.map(p=>p[i]))),span=[0,1].map(i=>Math.max(...profile.map(p=>p[i]))-min[i]);
  return profile.map(p=>p.map((v,i)=>(v-min[i])/span[i]));
}
function extrude(recipe) {
  const p=polygon(recipe.profile),n=p.length,depth=positive(recipe.depth,'depth');budget(6*n,4*n-4);
  const mesh={positions:[],indices:[],uvs:[]},uv=capUV(p);
  for(const y of [0,depth]) for(let i=0;i<n;i++) {mesh.positions.push(p[i][0],y,p[i][1]);mesh.uvs.push(...uv[i]);}
  for(const [a,b,c] of caps(p)) mesh.indices.push(a,b,c,n+a,n+c,n+b);
  for(let i=0;i<n;i++) {
    const a=p[i],b=p[(i+1)%n],k=mesh.positions.length/3;
    mesh.positions.push(a[0],0,a[1],a[0],depth,a[1],b[0],depth,b[1],b[0],0,b[1]);
    mesh.uvs.push(0,0,0,1,1,1,1,0);mesh.indices.push(k,k+1,k+2,k,k+2,k+3);
  }
  return mesh;
}
function revolve(recipe) {
  const p=points(recipe.profile,2,2,CONSTRUCTION_LIMITS.profilePoints,'profile'),segments=recipe.segments??24,angle=positive(recipe.angleDegrees??360,'angleDegrees',360)*Math.PI/180;
  if(!Number.isInteger(segments)||segments<3||segments>CONSTRUCTION_LIMITS.segments) throw new Error('segments must be an integer from 3 to 64');
  if(p.some(([r])=>r<0)||!p.some(([r])=>r>0)) throw new Error('Revolution radii must be nonnegative, with a nonzero radius');
  for(let i=1;i<p.length;i++) if(Math.hypot(...sub(p[i],p[i-1]))<1e-8||p[i][0]===0&&p[i-1][0]===0) throw new Error('Revolution has a collapsed profile segment');
  budget(p.length*(segments+1),2*segments*(p.length-1));
  const mesh={positions:[],indices:[],uvs:[]},stride=segments+1;
  for(let row=0;row<p.length;row++) for(let j=0;j<=segments;j++) {
    const theta=j/segments*angle,[r,y]=p[row];mesh.positions.push(r*sine(theta+Math.PI/2),y,r*sine(theta));mesh.uvs.push(j/segments,row/(p.length-1));
  }
  for(let row=0;row<p.length-1;row++) for(let j=0;j<segments;j++) {
    const a=row*stride+j,b=a+1,c=b+stride,d=a+stride;
    if(p[row][0]>0) mesh.indices.push(a,c,b);
    if(p[row+1][0]>0) mesh.indices.push(a,d,c);
  }
  return mesh;
}
function sweep(recipe) {
  const p=polygon(recipe.profile),path=points(recipe.path,3,2,CONSTRUCTION_LIMITS.pathPoints,'path'),n=p.length,stride=n+1;
  budget(path.length*stride+2*n,2*n*(path.length-1)+2*(n-2));
  const mesh={positions:[],indices:[],uvs:[]},frames=[],distance=[0];
  for(let i=1;i<path.length;i++) {const d=length(sub(path[i],path[i-1]));if(d<1e-8) throw new Error('Sweep path has repeated adjacent points');distance.push(distance[i-1]+d);}
  let normal=null;
  for(let i=0;i<path.length;i++) {
    const tangent=unit(sub(path[Math.min(i+1,path.length-1)],path[Math.max(0,i-1)]));
    if(normal) {const projected=normal.map((v,k)=>v-dot(normal,tangent)*tangent[k]);normal=length(projected)>1e-8?unit(projected):null;}
    if(!normal) {const axis=[0,1,2].sort((a,b)=>Math.abs(tangent[a])-Math.abs(tangent[b]))[0];normal=unit(cross(tangent,[0,1,2].map(k=>k===axis?1:0)));}
    const binormal=cross(tangent,normal);frames.push({normal,binormal});
    for(let j=0;j<=n;j++) {const [x,y]=p[j%n];mesh.positions.push(...path[i].map((v,k)=>v+normal[k]*x+binormal[k]*y));mesh.uvs.push(j/n,distance[i]/distance.at(-1));}
  }
  for(let i=0;i<path.length-1;i++) for(let j=0;j<n;j++) {const a=i*stride+j,b=a+1,c=b+stride,d=a+stride;mesh.indices.push(a,b,c,a,c,d);}
  const uv=capUV(p),triangles=caps(p);
  for(const end of [0,path.length-1]) {
    const k=mesh.positions.length/3,{normal,binormal}=frames[end];
    for(let j=0;j<n;j++) {const [x,y]=p[j];mesh.positions.push(...path[end].map((v,axis)=>v+normal[axis]*x+binormal[axis]*y));mesh.uvs.push(...uv[j]);}
    for(const [a,b,c] of triangles) mesh.indices.push(k+a,k+(end?b:c),k+(end?c:b));
  }
  return mesh;
}
export function buildInlineMesh(recipe) {
  const fields=recipe&&typeof recipe==='object'&&!Array.isArray(recipe)&&Object.hasOwn(CONSTRUCTION_FIELDS,recipe.kind)?CONSTRUCTION_FIELDS[recipe.kind]:null;
  if(!fields||Object.keys(recipe).some(key=>!fields.includes(key))) throw new Error('Unknown mesh construction or field');
  const mesh=({extrude,revolve,sweep})[recipe.kind](recipe);
  for(const name of ['positions','uvs']) mesh[name]=mesh[name].map(value=>{const rounded=Math.fround(value);return rounded===0?0:rounded;});
  assertInlineMesh(mesh);return mesh;
}
