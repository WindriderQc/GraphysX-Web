import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importBrowserModule } from './support/import-browser-module.mjs';
import { isBallsySnapshot, parseGiantCommand } from '../server/ballsy-protocol.mjs';
const { createEarth, surfaceHeightAt, sampleEarthShovel, advanceEarth, earthMassError, earthMesh, cancelEarthStroke } = await importBrowserModule(new URL('../src/ballsy-earth.ts', import.meta.url));
const { createVolcano, advanceVolcano, commandVolcano, volcanoSlowAt } = await importBrowserModule(new URL('../src/ballsy-volcano.ts', import.meta.url));
function stroke(e, from, to, time=0) {
  cancelEarthStroke(e);
  const count=Math.ceil(Math.hypot(to[0]-from[0],to[1]-from[1])/.15);
  for(let i=0;i<=count;i++) {
    const x=from[0]+(to[0]-from[0])*i/count, z=from[1]+(to[1]-from[1])*i/count;
    assert.equal(sampleEarthShovel(e,[x,surfaceHeightAt(e,x,z)-.06,z],true,time+i*.05),true);
  }
  cancelEarthStroke(e);
  return time+(count+1)*.05;
}
test('arbitrary moving contact cuts permanent mesh vertices, stationary and aerial samples cannot dig',()=>{
  const e=createEarth(), before=structuredClone(e.height);
  for(let i=0;i<50;i++) sampleEarthShovel(e,[7, surfaceHeightAt(e,7,1),1],true,i*.05);
  assert.deepEqual(e.height,before);
  cancelEarthStroke(e);
  for(let i=0;i<20;i++) sampleEarthShovel(e,[7+i*.1,4,1],true,3+i*.05);
  assert.deepEqual(e.height,before);
  stroke(e,[7,1],[9,2],5);
  assert.ok(e.excavated>.01); assert.ok(e.height.some((h,i)=>h<before[i]));
  assert.deepEqual(earthMesh(e).positions.filter((_,i)=>i%3===1),e.height);
  const after=[...e.height]; advanceEarth(e,5,1); assert.deepEqual(e.height,after);
  assert.deepEqual(JSON.parse(JSON.stringify(e)).height,after);
});
test('spam, teleports, expired samples and releases never produce a long-distance cut',()=>{
  const e=createEarth(); const tip=[6,surfaceHeightAt(e,6,0),0];
  sampleEarthShovel(e,tip,true,0);
  for(let i=0;i<100;i++) assert.equal(sampleEarthShovel(e,[6.1,tip[1],0],true,0),false);
  assert.equal(sampleEarthShovel(e,[13,.2,5],true,.05),false);
  assert.equal(e.excavated,0); assert.equal(e.stroke,null);
  sampleEarthShovel(e,tip,true,1);
  assert.equal(sampleEarthShovel(e,[6.1,tip[1],0],true,2),false);
  assert.equal(e.excavated,0);
  sampleEarthShovel(e,tip,true,3); cancelEarthStroke(e);
  sampleEarthShovel(e,[6.1,tip[1],0],true,3.05); assert.equal(e.excavated,0);
});
test('lava is deterministic, conservative, and changing only excavated elevations changes its route',()=>{
  const natural=createEarth(), cut=createEarth(); let time=0;
  for(let pass=0;pass<22;pass++) time=stroke(cut,[4.5,0],[5.5,6],time);
  for(let i=0;i<1200;i++){advanceEarth(natural,.025,1);advanceEarth(cut,.025,1);}
  assert.ok(Math.abs(earthMassError(natural))<1e-8); assert.ok(Math.abs(earthMassError(cut))<1e-8);
  assert.ok(cut.basinVolume>natural.basinVolume+.5,`${cut.basinVolume} vs ${natural.basinVolume}`);
  assert.ok(cut.crossingVolume<natural.crossingVolume);
  const copy=JSON.parse(JSON.stringify(cut)); advanceEarth(cut,.1,2);advanceEarth(copy,.1,2);assert.deepEqual(copy,cut);
});
test('race effects depend on wet field, with a dry outer lane, and pause cancellation removes stroke',()=>{
  const v=createVolcano(); assert.equal(volcanoSlowAt(v,[13,.7,0]).intensity,0);
  advanceVolcano(v,40); assert.ok(volcanoSlowAt(v,[13,.7,0]).intensity>0);
  assert.equal(volcanoSlowAt(v,[15.3,.7,0]).intensity,0);
  commandVolcano(v,{type:'shovel',tip:[6,surfaceHeightAt(v.earth,6,0),0],held:true});
  commandVolcano(v,{type:'release'}); assert.equal(v.earth.stroke,null);
});
test('protocol bounds physical samples and rejects malformed or nonconservative field snapshots',()=>{
  assert.deepEqual(parseGiantCommand({type:'shovel',tip:[6,1,0],held:true}),{type:'shovel',tip:[6,1,0],held:true});
  for(const tip of [[100,0,0],[6,NaN,0],[6,0,8],[6,0]]) assert.equal(parseGiantCommand({type:'shovel',tip,held:true}),null);
  const snapshot={roundId:'round-aaaaaaaaaaaaaaaa',phase:'racing',ally:null,volcano:createVolcano(),players:[0,1].map(i=>({id:`ballsy-p${i+1}`,position:[0,1,0],lap:0,finished:false}))};
  advanceVolcano(snapshot.volcano,10); assert.equal(isBallsySnapshot(snapshot),true);
  const corrupt=structuredClone(snapshot);corrupt.volcano.earth.lava[0]+=1;assert.equal(isBallsySnapshot(corrupt),false);
  const short=structuredClone(snapshot);short.volcano.earth.height.pop();assert.equal(isBallsySnapshot(short),false);
  assert.ok(JSON.stringify(snapshot).length<48000);
});
