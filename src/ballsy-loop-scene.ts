import type { AgentWorldDefinition, AgentWorldEntityDefinition } from "./agent-world-runtime";
import { COURSE_MAIN, COURSE_SHORTCUT, COURSE_FORK, coursePoint, courseEdge, type CourseSample } from "./ballsy-course";
import { volcanoEntities } from "./ballsy-volcano-scene";
import { ballsyAsphaltTexture, ballsyRoadUvs } from "./ballsy-art";

type Vec=[number,number,number];
type MeshData={positions:number[];indices:number[];normals?:number[]};
type Player={id:string;name:string;colour:string;spawn:readonly [number,number,number]};
const empty=():MeshData=>({positions:[],indices:[]});
/** Weld shared ribbon edges before allocation. Four decimal metres are far below physics tolerance. */
function compact(input:MeshData):MeshData {
  const m=empty(),seen=new Map<string,number>(),remap:number[]=[];
  for(let i=0;i<input.positions.length;i+=3){
    const p=input.positions.slice(i,i+3).map(n=>Math.round(n*10000)/10000),key=p.join(",");
    let index=seen.get(key);if(index===undefined){index=m.positions.length/3;seen.set(key,index);m.positions.push(...p);}remap.push(index);
  }
  m.indices=input.indices.map(i=>remap[i]);return m;
}
function quad(m:MeshData,a:Vec,b:Vec,c:Vec,d:Vec):void {const n=m.positions.length/3;m.positions.push(...a,...b,...c,...d);m.indices.push(n,n+2,n+1,n,n+3,n+2);}
function cube(m:MeshData,p:Vec,size:Vec,angle=0):void {
  const [x,y,z]=p,[w,h,d]=size,c=Math.cos(angle),s=Math.sin(angle);
  const v=(a:number,b:number,e:number):Vec=>[x+a*w/2*c+e*d/2*s,y+b*h/2,z-a*w/2*s+e*d/2*c];
  quad(m,v(-1,1,-1),v(1,1,-1),v(1,1,1),v(-1,1,1));
  quad(m,v(-1,-1,1),v(1,-1,1),v(1,-1,-1),v(-1,-1,-1));
  quad(m,v(-1,-1,-1),v(1,-1,-1),v(1,1,-1),v(-1,1,-1));
  quad(m,v(1,-1,1),v(-1,-1,1),v(-1,1,1),v(1,1,1));
  quad(m,v(-1,-1,1),v(-1,-1,-1),v(-1,1,-1),v(-1,1,1));
  quad(m,v(1,-1,-1),v(1,-1,1),v(1,1,1),v(1,1,-1));
}
/** Authored hard edges give small rock and roof forms real light-catching facets. */
function faceted(m:MeshData):MeshData{
  const out:MeshData={positions:[],indices:[],normals:[]};
  for(let i=0;i<m.indices.length;i+=3){
    const p=m.indices.slice(i,i+3).map(k=>m.positions.slice(k*3,k*3+3)),a=p[1].map((v,k)=>v-p[0][k]),b=p[2].map((v,k)=>v-p[0][k]);
    const n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],length=Math.hypot(...n);
    const start=out.positions.length/3;out.positions.push(...p.flat());out.indices.push(start,start+1,start+2);
    for(let j=0;j<3;j++)out.normals!.push(...n.map(v=>Math.round(v/length*10000)/10000));
  }
  return out;
}
function terrace(m:MeshData,x:number,z:number,rx:number,rz:number,y:number,h:number,seed:number):void{
  const point=(i:number,scale:number,height:number):Vec=>{const a=i/9*Math.PI*2,ragged=1+.12*Math.sin(i*17+seed);return[x+Math.cos(a)*rx*scale*ragged,height,z+Math.sin(a)*rz*scale*ragged];};
  for(let i=0;i<9;i++){
    quad(m,point(i,.95,y),point(i+1,.95,y),point(i+1,.76,y+h),point(i,.76,y+h));
    const n=m.positions.length/3;m.positions.push(x,y+h,z,...point(i+1,.76,y+h),...point(i,.76,y+h));m.indices.push(n,n+1,n+2);
  }
}
function ribbon(route:CourseSample[],lateralA:(p:CourseSample)=>number,lateralB:(p:CourseSample)=>number,lift:number,bottom?:number):MeshData {
  const m=empty();
  for(let i=1;i<route.length;i++){
    const a=route[i-1],b=route[i],a0=courseEdge(a,lateralA(a),lift),a1=courseEdge(a,lateralB(a),lift),b0=courseEdge(b,lateralA(b),lift),b1=courseEdge(b,lateralB(b),lift);
    // route forward x lateral right gives upward-facing triangles.
    quad(m,a1,b1,b0,a0);
    if(bottom!==undefined){
      const aa:Vec=[a0[0],a0[1]-bottom,a0[2]],ab:Vec=[a1[0],a1[1]-bottom,a1[2]],ba:Vec=[b0[0],b0[1]-bottom,b0[2]],bb:Vec=[b1[0],b1[1]-bottom,b1[2]];
      quad(m,ab,bb,b1,a1);quad(m,ba,aa,a0,b0);quad(m,aa,ba,bb,ab);
    }
  }
  return m;
}
function islandRing(m:MeshData,rx:number,rz:number,y:number,lowerY:number,inset=0):void{
  const n=72,cx=-1,cz=-4;
  const point=(i:number,height:number,scale:number):Vec=>{
    const a=i/n*Math.PI*2,shape=1+.07*Math.sin(a*3)+.035*Math.cos(a*5)+.025*Math.sin(a*2);
    return[cx+Math.cos(a)*rx*shape*scale*(1+.12*Math.max(0,Math.cos(a))),height,cz+Math.sin(a)*rz*shape*scale*(1+.19*Math.max(0,-Math.sin(a)))];
  };
  for(let i=0;i<n;i++){
    const a=point(i,y,1),b=point(i+1,y,1),c=point(i+1,lowerY,1-inset),d=point(i,lowerY,1-inset);
    quad(m,d,c,b,a);
    const k=m.positions.length/3;m.positions.push(cx,y,cz,...b,...a);m.indices.push(k,k+1,k+2);
  }
}
/** Real elevated road, one material system and no hidden rectangular racing floor. */
export function composeVolcanoLoop(players:readonly Player[],greybox=false):AgentWorldDefinition{
  const entities:AgentWorldEntityDefinition[]=[];
  const add=(id:string,m:MeshData,color:string,solid=false,extra:Partial<AgentWorldEntityDefinition>={}):void=>{
    if(!m.indices.length)return;
    if(!m.normals)m=compact(m);
    entities.push({id,type:"mesh",mesh:m,material:{color,roughness:.88},castShadow:true,
      ...(solid?{physics:{mode:"static",collider:"trimesh",friction:.6,restitution:.12} as const}:{}),tags:["ballsy","loop"],...extra});
  };
  const road=greybox?"#d1d5d4":"#343f46",trim=greybox?"#748186":"#f1dfb9";
  const base=empty(),shore=empty(),shelf=empty();
  islandRing(shore,38,33.5,-1.25,-2.6,.06);islandRing(base,36,32,-.55,-1.7,.05);islandRing(shelf,35.2,31,.05,-.65,.015);
  add("ballsy-shore",shore,"#468f89");add("ballsy-basalt-base",base,"#29373d");add("ballsy-island-shelf",shelf,greybox?"#5c696c":"#426650");
  const sea=empty();cube(sea,[0,-2.85,0],[500,.15,500]);add("ballsy-water",sea,"#164e5b",false,{castShadow:false,material:{color:"#164e5b",roughness:.68,metalness:.02}});
  const routes=[["main",COURSE_MAIN],["bridge",COURSE_SHORTCUT]] as const;
  for(const [name,route]of routes){
    add(`ballsy-road-${name}`,ribbon(route,p=>-p.width/2,p=>p.width/2,0,.62),road,true);
    if(!greybox){
      const surface=entities[entities.length-1];
      surface.mesh=ballsyRoadUvs(surface.mesh!);
      surface.material={color:road,roughness:.91,texture:ballsyAsphaltTexture(),normalTexture:ballsyAsphaltTexture(true),normalScale:.3};
    }
    // Dark underside conveys the road's thickness instead of a floating pale plane.
    add(`ballsy-fascia-${name}`,ribbon(route,p=>-p.width/2-.035,p=>p.width/2+.035,-.48,.22),"#27434b");
    for(const side of [-1,1]){
      add(`ballsy-edge-${name}-${side}`,ribbon(route,p=>side*(p.width/2-.64),p=>side*(p.width/2-.11),.016),trim,false,{castShadow:false});
    }
    if(!greybox){
      const kerbs=empty(),reflectors=empty();
      for(let i=1;i<route.length;i++)for(const side of [-1,1]){
        // Painted rumble strips use the same bank as the physical road, not flat boxes.
        if(Math.floor(i/3)%2===0){const strip=ribbon([route[i-1],route[i]],p=>side*(p.width/2-.64),p=>side*(p.width/2-.11),.024);const n=kerbs.positions.length/3;kerbs.positions.push(...strip.positions);kerbs.indices.push(...strip.indices.map(k=>k+n));}
        if(i%12===0){const p=route[i],e=courseEdge(p,side*(p.width/2-.9),.03);cube(reflectors,e,[.14,.025,.65],Math.atan2(p.tx,p.tz));}
      }
      add(`ballsy-kerbs-${name}`,kerbs,"#e87554",false,{castShadow:false});
      add(`ballsy-reflectors-${name}`,reflectors,"#8cd6ce",false,{castShadow:false,material:{color:"#8cd6ce",emissive:"#2ba796",emissiveIntensity:.28,roughness:.45}});
    }
  }
  // Retaining escarpments grow from the island to support the elevated main road.
  const retaining=empty(),strata=empty();
  for(let i=1;i<COURSE_MAIN.length;i++){
    const a=COURSE_MAIN[i-1],b=COURSE_MAIN[i];
    for(const side of [-1,1]){
      const aa=courseEdge(a,side*(a.width/2-.15),-.64),bb=courseEdge(b,side*(b.width/2-.15),-.64);
      const ab:Vec=[aa[0],.02,aa[2]],ba:Vec=[bb[0],.02,bb[2]];if(side===1)quad(retaining,ab,ba,bb,aa);else quad(retaining,aa,bb,ba,ab);
      if(i%3===0){const ac:Vec=[aa[0],Math.max(.1,aa[1]*.48),aa[2]],bc:Vec=[bb[0],Math.max(.1,bb[1]*.48),bb[2]];quad(strata,ac,bc,[bc[0],bc[1]-.09,bc[2]],[ac[0],ac[1]-.09,ac[2]]);}
    }
  }
  add("ballsy-retaining-basalt",retaining,"#38454b");add("ballsy-retaining-strata",strata,"#6a7875");
  // Continuous collider rails, generated from exactly the same edge samples as the road.
  for(const [name,route]of routes)for(const side of [-1,1]){
    const wall=empty(),cap=empty();
    for(let i=1;i<route.length;i++){
      const a=route[i-1],b=route[i];
      const entrance=name==="main"&&side===-1&&((a.t>COURSE_FORK.start-.024&&a.t<COURSE_FORK.start+.035)||(a.t>COURSE_FORK.end-.035&&a.t<COURSE_FORK.end+.025));
      const bridgeOpening=name==="bridge"&&(i<17||i>route.length-17);
      if(entrance||bridgeOpening)continue;
      const part=[a,b],offset=(p:CourseSample):number=>side*(p.width/2+.04);
      const w=ribbon(part,p=>offset(p)-.19,p=>offset(p)+.19,name==="bridge"?.95:.92,name==="bridge"?.95:.92);
      const q=wall.positions.length/3;wall.positions.push(...w.positions);wall.indices.push(...w.indices.map(k=>k+q));
      const c=ribbon(part,p=>offset(p)-.21,p=>offset(p)+.21,name==="bridge"?.98:.95,.06);
      const r=cap.positions.length/3;cap.positions.push(...c.positions);cap.indices.push(...c.indices.map(k=>k+r));
    }
    add(`ballsy-rail-${name}-${side}`,wall,greybox?"#7b898c":"#294952",true);
    add(`ballsy-rail-cap-${name}-${side}`,cap,"#b2cdc4",false,{material:{color:"#b2cdc4",roughness:.38,metalness:.18}});
  }
  const supports=empty(),postDetails=empty(),edgeTiles=empty();
  for(let i=18;i<COURSE_SHORTCUT.length-16;i+=15){const p=COURSE_SHORTCUT[i];for(const side of [-1,1]){
    const edge=courseEdge(p,side*(p.width/2-.3));cube(supports,[edge[0],(p.y-.65)/2,edge[2]],[.65,p.y-.65,.65],Math.atan2(p.tx,p.tz));
  }}
  for(let i=0;i<COURSE_MAIN.length-1;i+=8){const p=COURSE_MAIN[i];for(const side of [-1,1]){
    if(side===-1&&p.t>COURSE_FORK.start-.03&&p.t<COURSE_FORK.end+.03)continue;
    const edge=courseEdge(p,side*(p.width/2+.05),.48);cube(postDetails,edge,[.48,.98,.48],Math.atan2(p.tx,p.tz));
    if(i%16===0){const e=courseEdge(p,side*(p.width/2-.28),.03);cube(edgeTiles,e,[.24,.025,.85],Math.atan2(p.tx,p.tz));}
  }}
  add("ballsy-bridge-piers",supports,"#354951");add("ballsy-rail-posts",postDetails,"#30535f");add("ballsy-edge-inlays",edgeTiles,"#dfb66f",false,{castShadow:false});
  const checkerLight=empty(),checkerDark=empty(),grid=empty();
  for(let x=0;x<3;x++)for(let z=0;z<16;z++)cube((x+z)%2?checkerDark:checkerLight,[x*.55-.55,1.323,13.4+z*.7],[.55,.025,.7]);
  add("ballsy-finish-ivory",checkerLight,"#fff4d7",false,{castShadow:false});add("ballsy-finish-ink",checkerDark,"#254856",false,{castShadow:false});
  for(const z of [17.6,20.4]){cube(grid,[3.7,1.33,z],[.12,.03,1.7]);cube(grid,[4.5,1.33,z-.85],[1.7,.03,.12]);cube(grid,[4.5,1.33,z+.85],[1.7,.03,.12]);}
  add("ballsy-start-boxes",grid,"#b59a69",false,{castShadow:false});
  const arch=empty(),archTop=empty();
  for(const z of [12.7,25.3]){cube(arch,[0,2.85,z],[.45,4.1,.45]);cube(archTop,[0,4.85,z],[.7,.35,.7]);}
  cube(archTop,[0,5.05,19],[.5,.7,13.2]);add("ballsy-finish-arch",arch,"#2d5961");add("ballsy-finish-banner",archTop,"#ecdfbd");
  const arrows=empty();
  for(const t of [.055,.16,.29,.37,.47,.58,.66,.75,.84,.92]){
    const p=coursePoint(t),r=(along:number,across:number):Vec=>[p.x+p.tx*along+p.tz*across,p.y+.025+p.bank*across,p.z+p.tz*along-p.tx*across];
    const n=arrows.positions.length/3;arrows.positions.push(...r(-.7,-.22),...r(.05,-.22),...r(.05,-.62),...r(.9,0),...r(.05,.62),...r(.05,.22),...r(-.7,.22));arrows.indices.push(n,n+5,n+1,n,n+6,n+5,n+2,n+4,n+3);
  }
  add("ballsy-route-arrows",arrows,greybox?"#917344":"#e7c180",false,{castShadow:false});
  if(!greybox){
    // Scene's only volcano is behind the racing sightlines. Its source feeds the existing diggable field.
    const volcano=volcanoEntities().filter(e=>["volcano-earth","volcano-earth-lava","volcano-basin"].includes(e.id??"")||e.tags?.includes("volcano-landmark"));
    for(const e of volcano){if(e.tags?.includes("volcano-landmark")){
      const p=e.transform?.position??[0,0,0],s=e.transform?.scale??[1,1,1];e.transform={...e.transform,position:[p[0]-3,p[1]*2.6-.8,p[2]-36],scale:[s[0]*1.6,s[1]*2.6,s[2]*1.6]};
    }}
    entities.push(...volcano);
    // Layered low basalt on the inner shore. No collider sneaks into the playable road.
    for(let i=0;i<34;i++){
      if(![2,3,4,11,12,19,20,22,28,29,31].includes(i))continue;
      const a=i/34*Math.PI*2,x=-1+Math.cos(a)*(35.5+Math.sin(i*3)*.6),z=-4+Math.sin(a)*31.5;
      entities.push({id:`ballsy-rock-${i}`,type:"icosahedron",geometry:{radius:1},transform:{position:[x,-.45,z],scale:[1.3+i%3*.3,.8+i%4*.17,1.1],rotationDegrees:[12,i*47,8]},material:{color:i%3?"#34494f":"#4a6063",roughness:1},tags:["ballsy","scenery"]});
    }
    const sand=empty();islandRing(sand,7.2,4.0,.12,-.08,0); // separate village apron positioned below
    add("ballsy-village-apron",sand,"#667364",false,{transform:{position:[-10,0,14]}});
    const huts=empty(),roofs=empty(),windows=empty(),timber=empty(),roofRibs=empty();
    for(const [x,z,angle]of [[-9,11,.1],[-14,10.7,-.12],[-18,8,.35]]){
      cube(huts,[x,1.1,z],[2.7,2.2,2.5],angle);
      const at=(dx:number,dy:number,dz:number):Vec=>[x+dx*Math.cos(angle)+dz*Math.sin(angle),dy,z-dx*Math.sin(angle)+dz*Math.cos(angle)];
      quad(roofs,at(-1.7,2.15,-1.65),at(1.7,2.15,-1.65),at(1.15,3.05,0),at(-1.15,3.05,0));
      quad(roofs,at(-1.15,3.05,0),at(1.15,3.05,0),at(1.7,2.15,1.65),at(-1.7,2.15,1.65));
      for(const side of [-1,1]){const n=roofs.positions.length/3;roofs.positions.push(...at(side*1.7,2.15,-1.65),...at(side*1.7,2.15,1.65),...at(side*1.15,3.05,0));roofs.indices.push(n,n+1,n+2);}
      cube(roofRibs,at(0,3.07,0),[2.5,.12,.18],angle);
      for(const side of [-1,1])cube(timber,at(side*1.4,1.1,1.31),[.14,2.2,.14],angle);
      cube(timber,at(0,.17,1.7),[3.1,.24,.9],angle);
      cube(windows,[x,.98,z+1.27],[.8,1.5,.05],angle);
      for(const side of [-1,1])cube(windows,at(side*.86,1.4,1.26),[.42,.52,.06],angle);
    }
    add("ballsy-village-stone",huts,"#e5c38c");add("ballsy-village-roofs",faceted(roofs),"#b9533d");add("ballsy-village-doors",windows,"#284c52");
    add("ballsy-village-timber",timber,"#7b573e");add("ballsy-village-roof-ridges",roofRibs,"#efae75");
    const greenery=empty(),leafLight=empty(),stems=empty();
    for(const [cx,cz]of [[-21,-6],[-17,-7],[-9,-11],[-3,-12],[-24,7],[-12,6],[1,8],[22,8],[8,-16],[-7,1]]){
      for(let k=0;k<3;k++){
        const x=cx+Math.sin(k*2.3)*1.2,z=cz+Math.cos(k*2.3)*.9,h=1.05+(k%3)*.65;
        cube(stems,[x,h/2+.05,z],[.16,h,.16]);
        for(let leaf=0;leaf<6;leaf++){
          const a=leaf/6*Math.PI*2+k,base:Vec=[x,h,z],tip:Vec=[x+Math.cos(a)*1.55,h-.34,z+Math.sin(a)*1.55],mid:Vec=[x+Math.cos(a)*.7,h+.3,z+Math.sin(a)*.7],left:Vec=[mid[0]-Math.sin(a)*.35,mid[1],mid[2]+Math.cos(a)*.35],right:Vec=[mid[0]+Math.sin(a)*.35,mid[1],mid[2]-Math.cos(a)*.35];
          quad(greenery,base,right,tip,mid);quad(leafLight,base,mid,tip,left);
        }
      }
    }
    add("ballsy-fern-stems",stems,"#877049");add("ballsy-fern-fronds",greenery,"#23634b",false,{material:{color:"#23634b",roughness:.9}});
    add("ballsy-fern-light-fronds",leafLight,"#5d9860",false,{material:{color:"#5d9860",roughness:.9}});
    const lava=empty();
    for(const [x,y,z,w,d]of [[3,.12,-16,1.1,12],[5,.15,-9,2.4,4],[15,.18,1.7,4,1.8]])cube(lava,[x,y,z],[w,.08,d]);
    add("ballsy-lava-fissures",lava,"#f48b31",false,{material:{color:"#f48b31",emissive:"#dc3e0b",emissiveIntensity:.36,roughness:.7},castShadow:false});
    // Stacked, faceted basalt with moss caps replaces smooth flattened spheres.
    const rockFeet=empty(),rockTops=empty(),moss=empty();
    for(const [i,x,z,sx,sy,sz] of [[0,-7,-2,8,1.1,6],[1,-12,-2,5,1.9,3.6],[2,0,-9,5,1.4,4],[3,-3,-35,8,1.7,7],[4,21,2,2,1,4]]){
      terrace(rockFeet,x,z,sx,sz,.12,sy*.6,i);terrace(rockTops,x,z,sx*.75,sz*.75,.12+sy*.6,sy*.4,i);
      terrace(moss,x-.15,z,sx*.52,sz*.52,.14+sy,.06,i);
    }
    add("ballsy-basalt-terrace-feet",faceted(rockFeet),"#3c5350");add("ballsy-basalt-terrace-tops",faceted(rockTops),"#65765f");add("ballsy-terrace-moss",moss,"#628342");
    const digBorder=empty();
    for(let k=0;k<10;k++){cube(digBorder,[4.4+k,.23,-7.2],[.8,.42,.55]);cube(digBorder,[4.4+k,.23,7.2],[.8,.42,.55]);}
    for(let k=0;k<14;k++)cube(digBorder,[3.7,.35,-6.5+k],[.55,.65,.8]);
    add("ballsy-dig-basalt-border",digBorder,"#617069");
    const branchPaint=empty();
    for(const [t,branch]of [[COURSE_FORK.start+.025,"shortcut"],[COURSE_FORK.start+.04,"main"]] as const){
      const p=coursePoint(t,branch);for(let j=0;j<3;j++)cube(branchPaint,courseEdge(p,(j-1)*.75,.035),[.38,.025,.8],Math.atan2(p.tx,p.tz));
    }
    add("ballsy-fork-markings",branchPaint,"#c49749",false,{castShadow:false});
    const workshop=empty();for(const [x,z]of [[4.1,-6.9],[13.9,-6.9],[4.1,6.9]])cube(workshop,[x,1.1,z],[.18,2.2,.18]);
    cube(workshop,[5.5,2.1,6.9],[2.9,.6,.15]);add("ballsy-dig-zone-marker",workshop,"#d0a65b");
  }else entities.push(...volcanoEntities().filter(e=>e.id==="volcano-earth"||e.id==="volcano-earth-lava"));
  for(const [i,player]of players.entries()){
    entities.push({id:player.id,type:"sphere",label:player.name,transform:{position:[...player.spawn]},geometry:{radius:.65,radialSegments:32},material:{color:player.colour,roughness:.23,metalness:.16},physics:{mode:"dynamic",material:"ball",mass:1.7},steering:{headingDegrees:270,force:28,speedCap:8,turnRateDegrees:240},castShadow:true,receiveShadow:true,tags:["ballsy","player"]});
    // Bands roll WITH the physical ball. Two bands identify Corail without colour.
    for(let band=0;band<=i;band++)entities.push({id:`${player.id}-band-${band}`,parentId:player.id,type:"torus",geometry:{radius:.64,tube:.045},transform:{rotationDegrees:[i?50:0,band*90,20]},material:{color:"#fff5dd",roughness:.3},castShadow:false,tags:["ballsy","player-marking"]});
  }
  entities.push({id:"ballsy-sun",type:"directional-light",transform:{position:[-30,36,18]},intensity:2.2,material:{color:"#ffe8c4"},castShadow:true},
    {id:"ballsy-fill",type:"ambient-light",intensity:.5,material:{color:"#bdd2df"}});
  return {schema:"graphysx.agent-world/v2",id:"ballsy-volcano-loop",label:"La Boucle du Volcan",environment:{background:"#164e5b",sky:null,
    lighting:{source:"studio",intensity:.3,yawDegrees:20,backgroundIntensity:1,backgroundBlur:0},
    ground:{visible:false,size:100,color:"#164e5b",grid:false,gridColor:"#164e5b"},physics:{gravity:[0,-9.81,0]},envelope:{fogNear:130,fogFar:280,cameraFar:350}},entities};
}
