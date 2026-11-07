import { test } from "node:test";
import assert from "node:assert/strict";
import { Mesh, MeshStandardMaterial, SphereGeometry } from "three";
import { importBrowserModule } from "./support/import-browser-module.mjs";
const { ballsyFinishEntities, projectBallsyFinishes } = await importBrowserModule(new URL("../src/ballsy-finish-scene.ts", import.meta.url));
test("arrival is a fixed native pool without bodies, lights or a second animation loop", () => {
  const definitions=ballsyFinishEntities();
  assert.equal(definitions.length,18);
  assert.equal(new Set(definitions.map(e=>e.id)).size,18);
  assert.ok(definitions.every(e=>e.visible===false && !e.physics && !e.behaviors));
  assert.equal(definitions.filter(e=>e.type==='torus').length,2);
});
test("native sparkles follow the actual finished ball, stay bounded and clear on replay",()=>{
  const objects=new Map(ballsyFinishEntities().map(e=>[e.id,new Mesh(new SphereGeometry(.1),new MeshStandardMaterial({transparent:true}))]));
  const players=[{id:'p1',position:[13,4,-8]},{id:'p2',position:[-15,2,10]}];
  const get=id=>objects.get(id);
  for(const seconds of [0,.5,1.5,2.9]) {
    projectBallsyFinishes([{subjectId:'p1',elapsedSeconds:60,sparkleSeconds:seconds}],players,get);
    for(const [id,object] of objects) {
      assert.equal(object.visible,id.startsWith('ballsy-finish-effect-0-'));
      if(!object.visible)continue;
      assert.ok(Math.hypot(object.position.x-13,object.position.z+8)<=1.31);
      assert.ok(object.position.y>=3.5&&object.position.y<=4.9);
      assert.ok(object.material.opacity>0);
    }
  }
  projectBallsyFinishes([{subjectId:'p1',elapsedSeconds:60,sparkleSeconds:3}],players,get);
  assert.ok([...objects.values()].every(o=>!o.visible));
  projectBallsyFinishes([],players,get);
  assert.ok([...objects.values()].every(o=>!o.visible));
  for(const object of objects.values()){object.geometry.dispose();object.material.dispose();}
});
