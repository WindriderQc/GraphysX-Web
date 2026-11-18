import type { AgentWorldDefinition, AgentWorldEntityDefinition } from "./agent-world-runtime";
import { NACRE } from "./nacre-mission";
import build from "../public/assets/quest3/build.json";
import { buildInlineMesh } from "../server/mesh-construction.mjs";

export const QUEST3_ASSETS = [
  "/assets/quest3/station.glb", "/assets/quest3/station-light.ktx2", "/assets/quest3/equipment.glb",
  "/assets/quest3/equipment-low.glb", "/assets/quest3/panels.ktx2", "/assets/quest3/rib.glb",
  "/assets/quest3/inlay.glb", "/assets/quest3/star.glb", "/assets/quest3/planet.glb", "/assets/quest3/planet.ktx2",
  // Retain the original planet pair above for browser-local stations saved before the mission.
  "/assets/quest3/planet-mission-v1.glb", "/assets/quest3/planet-surface-v1.ktx2",
  "/assets/quest3/clouds.glb", "/assets/quest3/clouds.ktx2", "/assets/quest3/power-cell.glb", "/assets/quest3/blast-door.glb",
  "/assets/quest3/audio/pickup.wav", "/assets/quest3/audio/latch.wav", "/assets/quest3/audio/success.wav",
  "/assets/quest3/audio/charge-loop.wav", "/assets/quest3/audio/reactor-loop.wav", "/assets/quest3/audio/door-loop.wav",
  "/assets/quest3/audio/build.json",
  "/assets/quest3/deck.ktx2", "/assets/quest3/build.json", "/assets/quest3/LICENSE.txt",
];
const native = (id: string, url: string, fitSize: number, position: [number,number,number], extra = {}): AgentWorldEntityDefinition => ({
  id, type: "model", asset: { url, format: "gltf", fitSize, ...extra }, transform: { position }, castShadow: false, receiveShadow: false, tags: ["nacre", "native-gltf"],
});
const block = (id: string, size: [number,number,number], position: [number,number,number], color: string, parentId?: string): AgentWorldEntityDefinition => ({
  id, type: "box", parentId, geometry: {width:size[0],height:size[1],depth:size[2]}, transform:{position}, material:{color,metalness:.55,roughness:.42},castShadow:false,tags:["nacre"],
});
const sound = (id: string, source: string, position: [number,number,number], volume: number, refDistance: number): AgentWorldEntityDefinition => ({
  id,type:"sound",transform:{position,scale:[.01,.01,.01]},sound:{source,volume,positional:true,refDistance,loop:true,autoplay:false},tags:["nacre","spatial-audio"],
});

/** Two swept strands share one authored mesh/material/draw; no runtime mesh mutation. */
function plasmaHelix() {
  const profile=Array.from({length:8},(_,i)=>[Math.cos(i*Math.PI/4)*.065,Math.sin(i*Math.PI/4)*.065]);
  const strands=[0,Math.PI].map(phase=>buildInlineMesh({kind:"sweep",profile,path:Array.from({length:64},(_,i)=>{
    const progress=i/63,angle=phase+progress*Math.PI*5;
    return [Math.cos(angle)*.32,(progress-.5)*3.8,Math.sin(angle)*.32];
  })}));
  const offset=strands[0].positions.length/3;
  return {positions:[...strands[0].positions,...strands[1].positions],indices:[...strands[0].indices,...strands[1].indices.map(i=>i+offset)],uvs:[...strands[0].uvs!,...strands[1].uvs!]};
}

/** Geometry, sounds, animation and mission checkpoints share the ordinary portable v2 document. */
export function createQuest3Scene(): AgentWorldDefinition {
  const entities: AgentWorldEntityDefinition[] = [
    {id:NACRE.state,type:"group",visible:false,tags:["nacre","mission","phase:standby","started:0"]},
    {id:"nacre-ambient",type:"ambient-light",intensity:.16,material:{color:"#87b6d4"}},
    {id:"nacre-sun",type:"directional-light",intensity:.8,transform:{position:[-16,7.6,11]},material:{color:"#d9eff3"},castShadow:false},
    native("nacre-station","/assets/quest3/station.glb",build.station.fitSize,build.station.centre as [number,number,number],{lightmap:{url:"/assets/quest3/station-light.ktx2",intensity:1.15}}),
    {...native("nacre-planet",NACRE.planetModel,36,[1,9,-58]),behaviors:[{type:"spin",axis:"y",speedDegrees:.075}]},
    {...native("nacre-clouds","/assets/quest3/clouds.glb",36.55,[1,9,-58]),behaviors:[{type:"spin",axis:"y",speedDegrees:.32}]},
    {id:"nacre-atmosphere",type:"sphere",geometry:{radius:18.48,radialSegments:64},transform:{position:[1,9,-58]},
      material:{color:"#000000",emissive:"#000000",emissiveIntensity:1.35,opacity:.32,roughness:1,
        shader:{id:"energy",blend:"additive",rimColor:"#358aff",rimPower:2.8,rimIntensity:1.6,rimOpacity:true,flowStrength:0}},castShadow:false,receiveShadow:false,tags:["nacre","atmosphere"]},
    native("nacre-ribs","/assets/quest3/rib.glb",13.5,[0,0,0],{instances:[-22,-18,-14,-10,-6,-2,2].map(z=>({position:[0,2.95,z]}))}),
    native("nacre-inlays","/assets/quest3/inlay.glb",1.4,[0,0,0],{instances:[-1,1].flatMap(side=>Array.from({length:16},(_,i)=>({position:[side*4.95,.012,1-i*1.5]})))}),
    native("nacre-equipment","/assets/quest3/equipment.glb",.8,[0,0,-10],{
      instances:[-1,1].flatMap(side=>Array.from({length:9},(_,i)=>({position:[side*5.6,1.38,8-i*2.2],rotationDegrees:[0,side<0?90:-90,0]}))),
      lods:[{url:"/assets/quest3/equipment-low.glb",distance:8}],
    }),
    {id:NACRE.cell,type:"group",transform:{position:[...NACRE.home]},tags:["nacre","energy-cell","grabbable"],interactions:[{id:"pickup",type:"play-sound",sound:"/assets/quest3/audio/pickup.wav",volume:.5,positional:true,refDistance:1.5}]},
    {...native("nacre-cell-model","/assets/quest3/power-cell.glb",.6,[0,0,0]),parentId:NACRE.cell},
    {id:"nacre-cell-stand",type:"cylinder",geometry:{radius:.25,height:.14,radialSegments:32},transform:{position:[.65,.75,.15]},material:{color:"#233b49",metalness:.75,roughness:.3},castShadow:false},
    {id:"nacre-cell-beacon",type:"torus",geometry:{radius:.28,tube:.014,radialSegments:32},transform:{position:[.65,.83,.15],rotationDegrees:[90,0,0]},material:{color:"#ffd284",emissive:"#ff9b33",emissiveIntensity:1},behaviors:[{type:"pulse",minimumScale:.96,maximumScale:1.07,frequencyHz:.6}],castShadow:false},
    {id:NACRE.socket,type:"group",transform:{position:[...NACRE.dock]},tags:["nacre","cell-socket"],interactions:[{id:"latch",type:"play-sound",sound:"/assets/quest3/audio/latch.wav",volume:.65,positional:true,refDistance:3}]},
    {id:"nacre-socket-base",parentId:NACRE.socket,type:"cylinder",geometry:{radius:.3,height:.2,radialSegments:32},transform:{position:[0,-.36,0]},material:{color:"#415563",metalness:.8,roughness:.3},castShadow:false},
    {id:"nacre-socket-rim",parentId:NACRE.socket,type:"torus",geometry:{radius:.17,tube:.026,radialSegments:40},transform:{position:[0,-.21,0],rotationDegrees:[90,0,0]},material:{color:"#e8bc6d",emissive:"#ce7d28",emissiveIntensity:.7},castShadow:false},
    {id:"nacre-reactor-core",type:"mesh",mesh:plasmaHelix(),transform:{position:[0,2.7,-11]},
      material:{color:"#153747",emissive:"#13a5c8",emissiveIntensity:.08,side:"front",metalness:.1,roughness:.22,
        shader:{id:"energy",rimColor:"#9bf5ff",rimPower:2.1,rimIntensity:1.2,flowSpeed:.65,flowScale:1.8,flowStrength:.9}},
      behaviors:[{id:"nacre-core-radiance",type:"modulate",property:"emissiveIntensity",minimumFactor:.72,maximumFactor:1.28,frequencyHz:1.5},{type:"spin",axis:"y",speedDegrees:12}],castShadow:false},
    {id:"nacre-reactor-vessel",parentId:"nacre-reactor-core",type:"cylinder",geometry:{radius:.55,height:3.9,radialSegments:48},
      material:{color:"#000000",emissive:"#000000",emissiveIntensity:.3,opacity:.16,roughness:.4,shader:{id:"energy",blend:"additive",rimColor:"#77d5f5",rimPower:2.8,rimIntensity:1.2,rimOpacity:true,flowStrength:0}},castShadow:false},
    {id:"nacre-reactor-light",type:"point-light",intensity:0,distance:12,marker:false,transform:{position:[0,2.8,-10.2]},material:{color:"#37cbe8"},
      behaviors:[{id:"nacre-light-radiance",type:"modulate",property:"intensity",minimumFactor:.72,maximumFactor:1.28,frequencyHz:1.5}],castShadow:false},
    {...block("nacre-control",[.5,.13,.4],[1.55,1.04,-8.15],"#d5a653"),transform:{position:[1.55,1.04,-8.15],rotationDegrees:[-15,0,0]},material:{color:"#d5a653",emissive:"#169b98",emissiveIntensity:.12,roughness:.3},tags:["nacre","reactor-switch"]},
    block("nacre-control-stem",[.12,.88,.14],[1.55,.44,-8.15],"#203540"),
    {id:"nacre-reactor-particles",type:"emitter",transform:{position:[0,2.7,-11]},emitter:{preset:"energy-orb",enabled:false,rate:12,maxParticles:64,lifetimeSeconds:1.8,speed:1.6,spread:1,volumeScale:.6,sizeScale:.75,color:"#58ddff",gravity:[0,.12,0],seed:42},tags:["nacre"]},
    native("nacre-door-left","/assets/quest3/blast-door.glb",6.5,[-3.25,3,-21.5]),
    native("nacre-door-right","/assets/quest3/blast-door.glb",6.5,[3.25,3,-21.5]),
    block("nacre-door-frame-top",[13.6,.25,.5],[0,6.15,-21.5],"#4a626a"),
    block("nacre-door-frame-left",[.28,6.1,.5],[-6.65,3.05,-21.5],"#4a626a"),
    block("nacre-door-frame-right",[.28,6.1,.5],[6.65,3.05,-21.5],"#4a626a"),
    {id:"nacre-window-chime",type:"group",transform:{position:[0,3,-22]},interactions:[{id:"success",type:"play-sound",sound:"/assets/quest3/audio/success.wav",volume:.45,positional:true,refDistance:5}]},
    sound("nacre-charge-sound","/assets/quest3/audio/charge-loop.wav",[0,2.4,-11],.25,6),
    sound("nacre-reactor-sound","/assets/quest3/audio/reactor-loop.wav",[0,2.4,-11],.28,6),
    sound("nacre-door-sound","/assets/quest3/audio/door-loop.wav",[0,3,-21.5],.2,8),
  ];
  for(const side of [-1,1])entities.push({
    id:"nacre-reactor-cap-"+(side<0?"lower":"upper"),parentId:"nacre-reactor-core",type:"cylinder",geometry:{radius:.65,height:.16,radialSegments:40},transform:{position:[0,side*2.02,0]},
    material:{color:"#29434e",metalness:.85,roughness:.28},castShadow:false,tags:["nacre","containment"]
  });
  for(let i=0;i<4;i++)entities.push({
    id:"nacre-reactor-ring-"+i,type:"torus",geometry:{radius:1.15+(i%2)*.2,tube:.035,radialSegments:48},transform:{position:[0,1.25+i*.95,-11],rotationDegrees:[90,0,i*30]},
    material:{color:i%2?"#e4ab57":"#7fe6e7",emissive:i%2?"#ce7224":"#41e7ed",emissiveIntensity:.1,metalness:.3,roughness:.4},
    behaviors:[{type:"spin",speedDegrees:12*(i%2?-1:1),axis:"z"},{type:"modulate",property:"emissiveIntensity",minimumFactor:.8,maximumFactor:1.2,frequencyHz:1.5,phaseDegrees:i*35}],castShadow:false,
  });
  for(let i=0;i<3;i++)entities.push({
    id:"nacre-gyro-"+i,type:"torus",visible:false,geometry:{radius:1.6+i*.12,tube:.014,radialSegments:64},transform:{position:[0,2.7,-11],rotationDegrees:[30+i*35,i*50,20]},
    material:{color:i%2?"#e5b765":"#70ecf8",emissive:i%2?"#d08027":"#15b3e3",emissiveIntensity:1.6},behaviors:[{type:"spin",axis:"y",speedDegrees:i%2?-36:28}],castShadow:false,
  });
  for(const side of [-1,1])for(const z of [-2,-8,-14,-21])entities.push({
    id:"nacre-luminaire-"+(side<0?"port":"starboard")+"-"+-z,type:"box",geometry:{width:.045,height:.055,depth:2},transform:{position:[side*4.8,3.8,z]},
    material:{color:"#b38043",emissive:"#9c4a14",emissiveIntensity:.15},castShadow:false,
  });
  let seed=42;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const stars=Array.from({length:420},()=>{const az=random()*Math.PI*2,y=random()*1.9-.95,r=160,d=Math.sqrt(1-y*y),s=.045+random()*.095;
    return{position:[Math.cos(az)*r*d,y*r,Math.sin(az)*r*d] as [number,number,number],scale:[s,s,s] as [number,number,number]};});
  entities.push(native("nacre-stars","/assets/quest3/star.glb",1,[0,0,0],{instances:stars}));
  return{schema:"graphysx.agent-world/v2",id:"nacre-quest3",label:"NACRE · Rétablir le signal",
    environment:{background:"#030812",ground:{visible:false,size:32,color:"#10212e",grid:false,gridColor:"#234455"},envelope:{fogNear:175,fogFar:210,cameraFar:230},lighting:{source:"studio",intensity:.45,yawDegrees:0,backgroundIntensity:1,backgroundBlur:0}},entities};
}
