import test from 'node:test';
import assert from 'node:assert/strict';
import { importBrowserModule } from './support/import-browser-module.mjs';
import { assertInlineMesh, assertMeshSceneBudget } from '../server/inline-mesh.mjs';
import { assertWorldDefinition } from '../server/scene-document.mjs';
const { composeBallsyCourse }=await importBrowserModule(new URL('../src/ballsy-scene.ts',import.meta.url));
const { COURSE_MAIN,COURSE_SHORTCUT,COURSE_LENGTH,COURSE_SHORTCUT_LENGTH,COURSE_FORK }=await importBrowserModule(new URL('../src/ballsy-course.ts',import.meta.url));
for(const greybox of [true,false])test(`loop ${greybox?'greybox':'dressed'} respects real runtime mesh budgets`,()=>{
 const scene=composeBallsyCourse({volcano:true,greybox});assertWorldDefinition(scene);assertMeshSceneBudget(scene.entities);
 for(const entity of scene.entities)if(entity.mesh)assertInlineMesh(entity.mesh);
 assert.equal(scene.rules,undefined);assert.ok(scene.entities.find(e=>e.id==='volcano-earth')?.physics?.collider==='trimesh');
 for(const name of ['main','bridge'])assert.equal(scene.entities.find(e=>e.id===`ballsy-road-${name}`)?.physics?.collider,'trimesh');
 assert.ok(!scene.entities.find(e=>e.id==='ballsy-plinth'));
});
test('continuous closed loop, useful height, fair branch proportions',()=>{
 const measured=COURSE_MAIN.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-COURSE_MAIN[i].x,p.y-COURSE_MAIN[i].y,p.z-COURSE_MAIN[i].z),0);
 assert.ok(Math.abs(COURSE_LENGTH-measured)<1e-9);assert.ok(COURSE_MAIN.every(p=>p.width>=8&&Number.isFinite(p.tx)));
 assert.ok(Math.max(...COURSE_MAIN.map(p=>p.y))-Math.min(...COURSE_MAIN.map(p=>p.y))>4);
 const a=COURSE_MAIN[0],b=COURSE_MAIN.at(-1);assert.ok(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)<1e-6);
 for(const route of [COURSE_MAIN,COURSE_SHORTCUT])for(let i=1;i<route.length;i++){
  assert.ok(route[i].t>route[i-1].t);assert.ok(Math.abs(route[i].y-route[i-1].y)/Math.hypot(route[i].x-route[i-1].x,route[i].z-route[i-1].z)<.42);
 }
 assert.ok(Math.min(...COURSE_SHORTCUT.map(p=>p.width))>4.1);
 assert.ok(COURSE_SHORTCUT_LENGTH<COURSE_LENGTH*(COURSE_FORK.end-COURSE_FORK.start));
});
