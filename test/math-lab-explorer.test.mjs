import assert from 'node:assert/strict';
import test from 'node:test';
import { importBrowserModule } from './support/import-browser-module.mjs';
import { validateStoredSceneDefinition } from '../server/scene-commands.mjs';
const {composeMathLab}=await importBrowserModule(new URL('../src/ten-workshop-scene.ts',import.meta.url));
const {MATH_THEMES}=await importBrowserModule(new URL('../src/ten-workshop-theme.ts',import.meta.url));
const picture=(scene,extra={})=>({tokens:[],practice:false,hint:false,a:0,equation:'',answer:'',reference:false,selected:null,shape:'box',explorer:{scene,revealed:false,regrouped:false,...extra}});
const units=scene=>scene.entities.filter(e=>e.tags?.includes('math:explorer-unit'));
test('every count 1-100 is conserved in rows of ten on the same canonical table',()=>{
 for(let to=1;to<=100;to++) {
  const scene=composeMathLab(MATH_THEMES[0],picture({kind:'count',to}));
  assert.equal(units(scene).length,to);
  assert.equal(new Set(units(scene).map(e=>e.id)).size,to);
  for(const e of units(scene)){assert.ok(Math.abs(e.transform.position[0])<3);assert.ok(Math.abs(e.transform.position[2])<1.6);}
  assert.doesNotThrow(()=>validateStoredSceneDefinition(scene));
 }
});
test('every addition up to twenty preserves operands when regrouped, without exposing an answer early',()=>{
 for(let a=0;a<=20;a++) for(let b=0;b<=20-a;b++) {
  if(a+b===0)continue;
  for(const regrouped of [false,true]) {
   const scene=composeMathLab(MATH_THEMES[0],picture({kind:'add',a,b},{regrouped}));
   assert.equal(units(scene).length,a+b);
   assert.equal(units(scene).filter(e=>e.tags.includes('math:group:A')).length,a);
   assert.equal(units(scene).filter(e=>e.tags.includes('math:group:B')).length,b);
   assert.doesNotThrow(()=>validateStoredSceneDefinition(scene));
  }
 }
});
test('a refused exploration draws no substituted arithmetic picture',()=>{
 const scene=composeMathLab(MATH_THEMES[0],picture(null));
 assert.equal(units(scene).length,0);
 assert.equal(scene.entities.filter(e=>e.tags?.includes('math:unit')).length,0);
});
