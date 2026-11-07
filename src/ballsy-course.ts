/** One authored circuit, in metres. D = 1.30. Shared by road, rails, progress and recovery. */
export type CourseSample = { x:number; y:number; z:number; width:number; bank:number; t:number; tx:number; tz:number; section:number };
type Knot = [number,number,number,number,number]; // x, y, z, width, bank
const knots: Knot[] = [
  [0,1.3,19,11.7,0], [-14,1.3,19,10.8,0.02], [-26,1.5,12,10.4,0.10],
  [-29,2.0,0,9.8,0.12], [-24,3.4,-10,9.1,0.06], [-16,4.5,-14,8.6,-0.04],
  [-9,5.2,-20,9.1,0.10], [3,5.8,-23,11.0,0.20], [15,5.7,-18,11.0,0.24],
  [22,4.8,-9,10.4,0.14], [34,3.5,2,9.8,0.10], [30,2.3,12,10.4,0.12],
  [17,1.5,18,11.7,0.05], [8,1.3,19,11.7,0],
];
const clamp=(n:number,a:number,b:number):number=>Math.max(a,Math.min(b,n));
function cubic(a:number,b:number,c:number,d:number,u:number):number { return .5*((2*b)+(-a+c)*u+(2*a-5*b+4*c-d)*u*u+(-a+3*b-3*c+d)*u*u*u); }
function interpolate(points:Knot[],f:number,closed:boolean):Knot {
  const n=points.length, count=closed?n:n-1, q=clamp(f,0,1)*count, i=Math.min(count-1,Math.floor(q)), u=q-i;
  const at=(j:number):Knot=>points[closed?(j+n)%n:clamp(j,0,n-1)];
  return at(i).map((_,k)=>cubic(at(i-1)[k],at(i)[k],at(i+1)[k],at(i+2)[k],u)) as Knot;
}
function samples(points:Knot[],count:number,closed:boolean):CourseSample[] {
  const result:CourseSample[]=[];
  for(let i=0;i<=count;i++) {
    const f=i/count, p=interpolate(points,f,closed), a=interpolate(points,Math.max(0,f-.0001),closed), b=interpolate(points,Math.min(1,f+.0001),closed);
    const d=Math.hypot(b[0]-a[0],b[2]-a[2]);
    result.push({x:p[0],y:p[1],z:p[2],width:p[3],bank:p[4],t:f,tx:(b[0]-a[0])/d,tz:(b[2]-a[2])/d,section:0});
  }
  let length=0; const distance=[0];
  for(let i=1;i<result.length;i++){length+=Math.hypot(result[i].x-result[i-1].x,result[i].y-result[i-1].y,result[i].z-result[i-1].z);distance.push(length);}
  result.forEach((p,i)=>{p.t=distance[i]/length;});
  return result;
}
export const COURSE_MAIN=samples(knots,420,true);
export const COURSE_LENGTH=COURSE_MAIN.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-COURSE_MAIN[i].x,p.y-COURSE_MAIN[i].y,p.z-COURSE_MAIN[i].z),0);
const knotT=(i:number):number=>COURSE_MAIN[Math.round(i/knots.length*420)].t;
export const COURSE_FORK={start:knotT(9),end:knotT(12)};
export const COURSE_SECTIONS=[
  {name:"Village départ",t:0}, {name:"Corniche turquoise",t:knotT(1)},
  {name:"Montée des fougères",t:knotT(4)}, {name:"Virage de la caldeira",t:knotT(6)},
  {name:"Fourche des coulées",t:COURSE_FORK.start}, {name:"Descente de basalte",t:COURSE_FORK.end},
];
COURSE_MAIN.forEach(p=>{p.section=Math.max(0,COURSE_SECTIONS.reduce((last,s,i)=>p.t>=s.t?i:last,0));});
const shortcutKnots:Knot[]=[knots[9],[17.0,4.0,-4.5,7.8,0],[12.6,3.0,1.0,4.8,0],[13.6,2.3,8,4.8,0],[16,1.8,13.5,7.8,0],knots[12]];
export const COURSE_SHORTCUT=samples(shortcutKnots,120,false);
COURSE_SHORTCUT.forEach(p=>{p.t=COURSE_FORK.start+p.t*(COURSE_FORK.end-COURSE_FORK.start);p.section=4;});
export const COURSE_SHORTCUT_LENGTH=COURSE_SHORTCUT.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-COURSE_SHORTCUT[i].x,p.y-COURSE_SHORTCUT[i].y,p.z-COURSE_SHORTCUT[i].z),0);
export function coursePoint(t:number,branch:"main"|"shortcut"="main"):CourseSample {
  t=((t%1)+1)%1;
  const route=branch==="shortcut"&&t>=COURSE_FORK.start&&t<=COURSE_FORK.end?COURSE_SHORTCUT:COURSE_MAIN;
  const i=route.findIndex(p=>p.t>=t); if(i<=0)return {...route[0]};
  const a=route[i-1],b=route[i],f=(t-a.t)/(b.t-a.t);
  const out={...a,t}; for(const k of ["x","y","z","width","bank","tx","tz"] as const)out[k]=a[k]+(b[k]-a[k])*f;
  const length=Math.hypot(out.tx,out.tz);out.tx/=length;out.tz/=length;return out;
}
export function nearestCourse(position:readonly number[],branch?:"main"|"shortcut"):CourseSample&{distance:number;lateral:number;branch:"main"|"shortcut"} {
  let best={...COURSE_MAIN[0],distance:Infinity,lateral:0,branch:"main" as "main"|"shortcut"};
  for(const [name,route] of [["main",COURSE_MAIN],["shortcut",COURSE_SHORTCUT]] as const){
    if(branch&&branch!==name)continue;
    for(let i=1;i<route.length;i++){
      const a=route[i-1],b=route[i],dx=b.x-a.x,dz=b.z-a.z;
      const f=clamp(((position[0]-a.x)*dx+(position[2]-a.z)*dz)/(dx*dx+dz*dz),0,1);
      const x=a.x+dx*f,z=a.z+dz*f,d=Math.hypot(position[0]-x,position[2]-z);
      if(d>=best.distance)continue;
      const p=coursePoint(a.t+(b.t-a.t)*f,name),lateral=(position[0]-x)*p.tz-(position[2]-z)*p.tx;
      best={...p,x,z,distance:d,lateral,branch:name};
    }
  }
  return best;
}
export function courseEdge(p:CourseSample,lateral:number,lift=0):[number,number,number] {
  return [p.x+p.tz*lateral,p.y+p.bank*lateral+lift,p.z-p.tx*lateral];
}
