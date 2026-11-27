import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {launchSmokeBrowser,applySmokeTimeout} from './smoke-harness.mjs';
import {namedSave,readStoredScene,sceneDocument,canonicalScene,drawStudio} from './studio-smoke-helpers.mjs';
const base=process.env.SMOKE_BASE??'http://127.0.0.1:4210/';
const appState=page=>page.evaluate(()=>JSON.parse(window.render_game_to_text()).application);
const ready=page=>page.waitForFunction(()=>{const app=JSON.parse(window.render_game_to_text?.()??'{}').application;return app?.ready&&app.framed;});
const range=async(page,name,value)=>{
 const input=page.locator('[data-playground-param='+JSON.stringify(name)+']');
 await input.evaluate((element,value)=>{element.value=String(value);element.dispatchEvent(new Event('input',{bubbles:true}));},value);
};
const layout=async page=>{
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No horizontal page overflow');
 for(const selector of ['[data-revival-home]','[data-revival-studio]','[data-revival-frame]']){
  const button=page.locator(selector);await button.scrollIntoViewIfNeeded();
  const value=await button.evaluate(element=>{const r=element.getBoundingClientRect();return {height:r.height,width:r.width,hit:element.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};});
  assert.ok(value.height>=44&&value.width>=44&&value.hit,selector+' must be reachable');
 }
};
const projected=async(page,id)=>{
 const value=await page.evaluate(id=>{
  const host=window.__GRAPHYSX_HOST__,object=host.world.getEntityObject(id),points=[];
  object.updateWorldMatrix(true,true);object.traverseVisible(mesh=>{if(!mesh.isMesh)return;const p=mesh.geometry.attributes.position;for(let i=0;i<p.count;i++){const v=host.camera.position.clone().fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld).project(host.camera);points.push(v);}});
  const min=[0,1,2].map(a=>Math.min(...points.map(p=>p.getComponent(a)))),max=[0,1,2].map(a=>Math.max(...points.map(p=>p.getComponent(a))));
  const x=(min[0]+max[0]+2)/4*innerWidth,y=(2-min[1]-max[1])/4*innerHeight;
  return {min,max,x,y,hit:document.elementFromPoint(x,y)?.tagName};
 },id);
 assert.ok(value.min.every(n=>n>-1)&&value.max.every(n=>n<1),'The complete subject must be framed');assert.equal(value.hit,'CANVAS','The subject must be outside opaque controls');return value;
};

export async function runRevivalSmoke(mode){
 const output=path.resolve(process.env.SMOKE_ARTIFACTS??'output/playwright/'+mode);await mkdir(output,{recursive:true});
 const browser=await launchSmokeBrowser(),errors=[],receipts=[];let active;
 const open=async(viewport={width:1440,height:960},reducedMotion='no-preference')=>{
  const context=await browser.newContext({viewport,reducedMotion,acceptDownloads:true});const page=applySmokeTimeout(await context.newPage());active=page;
  page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('response',response=>{if(response.status()>=400)errors.push(response.status()+' '+response.url());});
  page.on('requestfailed',request=>{if(request.failure()?.errorText!=='net::ERR_ABORTED')errors.push(request.failure()?.errorText+' '+request.url());});
  return {context,page};
 };
 const shot=async(page,name)=>{await drawStudio(page);await page.screenshot({path:path.join(output,name+'.png')});};
 const sameScene=async(actual,expected,message)=>{
  const a=canonicalScene(actual),b=canonicalScene(expected);
  if(!isDeepStrictEqual(a,b)){
   // Node's assertion formatter can build a multi-GB diff for mesh arrays. Preserve the
   // exact documents and fail strictly without allocating that diagnostic in memory.
   await writeFile(path.join(output,'actual-scene.json'),JSON.stringify(a));
   await writeFile(path.join(output,'expected-scene.json'),JSON.stringify(b));
   throw Error(message+'; exact documents recorded in actual-scene.json / expected-scene.json');
  }
 };
 const saveAndReopen=async(page,name,expected)=>{
  console.log(mode+': Studio handoff');
  await page.click('[data-revival-studio]');await page.locator('.gx-studio-simple:not([hidden])').waitFor();
  await sameScene(await sceneDocument(page),expected,'Studio receives the complete authored world');
  await namedSave(page,name);const raw=await readStoredScene(page,name);assert.ok(raw&&raw.length>10000);
  await sameScene(JSON.parse(raw),expected,'Stored bytes preserve the complete authored world');
  await page.reload();await page.locator('.gx-studio-simple:not([hidden])').waitFor();
  await page.waitForFunction(expected=>{
   const api=window.__GRAPHYSX__,models=api.query({type:'model'});
   return window.__GRAPHYSX_HOST__.world.getClock().worldId===expected.id&&api.query().length===expected.entities&&models.length===expected.models&&models.every(m=>m.asset?.status==='ready');
  },{id:expected.id,entities:expected.entities.length,models:expected.entities.filter(e=>e.type==='model').length});
  await sameScene(await sceneDocument(page),expected,'Cold saved-scene reopen retains geometry, hidden groups, materials and behaviors');
  return {name,bytes:raw.length};
 };
 try {
  if(mode==='revival-playground'){
   const {page,context}=await open();await page.goto(new URL('?intro=0',base).href);await page.locator('.gx-go-archive').click();await page.locator('[data-scene-id="archive-threejs-playground"]').click();await ready(page);
   assert.equal(new URL(page.url()).searchParams.get('app'),'playground');assert.equal((await appState(page)).parameterCount,16);await layout(page);await page.click('[data-revival-pause]');
   const probe=async()=>page.evaluate(()=>{
    const host=window.__GRAPHYSX_HOST__,uniforms=[];host.world.getEntityObject('playground-morph-0').traverse(o=>{if(o.isMesh)for(const material of Array.isArray(o.material)?o.material:[o.material])uniforms.push(material.userData.graphysxPlaygroundUniforms.gxPlaygroundFrame.value);});
    return {time:host.world.getClock().elapsedSeconds,uniforms,plane:window.__GRAPHYSX__.query({ids:['playground-airplane']})[0].position};
   });
   const before=await probe();assert.ok(before.uniforms.length>0);await page.waitForTimeout(250);assert.deepEqual(await probe(),before,'Pause freezes shader and motion');
   await page.click('[data-revival-step]');const stepped=await probe();assert.ok(Math.abs(stepped.uniforms[0]-before.uniforms[0]-1)<1e-6);assert.notDeepEqual(stepped.plane,before.plane);
   await shot(page,'playground-source-desktop');
   await page.locator('[data-playground-controls] summary').click();
   const parameters=[['camera.x',70],['camera.y',60],['camera.z',80],['cube.speedX',3600],['cube.speedY',1],['plane.width',100],['plane.height',100],['plane.x',2],['plane.y',1],['plane.z',-3],['earth.speedX',3600],['earth.speedY',2000],['mars.speedX',1000],['mars.speedY',2000],['moon.speedX',1000],['moon.speedY',2000]];
   for(const [name,value] of parameters)await range(page,name,value);
   console.log(mode+': all 16 controls exercised');
   const modified=await sceneDocument(page);const terrain=modified.entities.filter(e=>e.parentId==='playground-terrain'&&e.mesh&&e.visible!==false);
   assert.equal(terrain.reduce((n,e)=>n+e.mesh.indices.length/3,0),20000);assert.deepEqual(modified.entities.find(e=>e.id==='playground-terrain').transform.position,[2,1,-3]);
   assert.ok(modified.entities.find(e=>e.id==='playground-earth').behaviors.some(b=>b.id==='adapted-planet-x'));
   assert.ok(Math.abs(modified.entities.find(e=>e.id==='playground-cube').behaviors.find(b=>b.id==='source-cube-y').speedDegrees-180000/Math.PI)<1e-8);
   await page.evaluate(()=>{const api=window.__GRAPHYSX__;const r=api.spawn({id:'my-playground-object',type:'box',label:'My addition',transform:{position:[8,1,0]}});if(!r.ok)throw Error(r.error);api.update('playground-cube',{label:'Cube edited in my scene'});});
   for(const [name,value] of [['plane.width',10],['plane.height',10],['plane.x',0],['plane.y',0],['plane.z',0]])await range(page,name,value);
   await page.evaluate(()=>window.__GRAPHYSX__.undo());await page.waitForFunction(()=>document.querySelector('[data-playground-param="plane.z"]').value==='-3');await page.evaluate(()=>window.__GRAPHYSX__.redo());
   await page.locator('[data-playground-controls] summary').click();await page.click('[data-revival-frame]');await projected(page,'playground-airplane');
   const expected=await sceneDocument(page),saved=await saveAndReopen(page,'Playground retrouvé',expected);await shot(page,'playground-studio-reopened');
   assert.equal((await sceneDocument(page)).entities.find(e=>e.id==='my-playground-object').label,'My addition');
   receipts.push({sixteenControls:true,sourceShaderClock:true,terrainMaxTriangles:20000,userEditsPreserved:true,saved});await context.close();
   for(const width of [390,320]){
    const {page,context}=await open({width,height:844},'reduce');await page.goto(new URL('?app=playground&intro=0',base).href);await ready(page);assert.equal(await page.evaluate(()=>window.__GRAPHYSX__.state().paused),true);
    await layout(page);await page.click('[data-playground-focus="airplane"]');await projected(page,'playground-airplane');await shot(page,'playground-airplane-'+width);
    await page.locator('[data-playground-controls] summary').click();const control=page.locator('[data-playground-param="cube.speedX"]');await control.scrollIntoViewIfNeeded();await control.focus();await control.press('Home');await control.press('ArrowRight');
    assert.equal(await control.inputValue(),'2');await page.locator('[data-playground-controls] summary').click();await page.click('[data-revival-frame]');
    await shot(page,'playground-source-'+width);receipts.push({width,reducedMotionInitiallyPaused:true,nativeKeyboardRange:true});await context.close();
   }
  }else if(mode==='revival-dominus'){
   const {page,context}=await open();await page.goto(new URL('?app=dominus&intro=0',base).href);await ready(page);await layout(page);
   assert.equal((await appState(page)).models.length,93);assert.equal(await page.locator('[data-dominus-model] option').count(),28);
   const bounds=await page.evaluate(async()=>{
    const data=await(await fetch('/assets/ports/archive-dominus.json')).json(),host=window.__GRAPHYSX_HOST__,result=[];
    for(const p of data.portPlacements){
     const m=data.models.find(m=>m.id===p.name.toLowerCase()),object=host.world.getEntityObject('dominus-source-'+m.id+'-model'),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];object.updateWorldMatrix(true,true);
     object.traverseVisible(mesh=>{if(!mesh.isMesh)return;const positions=mesh.geometry.attributes.position;for(let i=0;i<positions.count;i++){const point=host.camera.position.clone().fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld);for(let a=0;a<3;a++){min[a]=Math.min(min[a],point.getComponent(a));max[a]=Math.max(max[a],point.getComponent(a));}}});
     const expectedMin=[],expectedMax=[];for(let a=0;a<3;a++){const values=[m.bounds.min[a],m.bounds.max[a]].map(n=>(p.position[a]+p.scale[a]*n)*(a===2?-1:1));expectedMin.push(Math.min(...values));expectedMax.push(Math.max(...values));}
     result.push({id:m.id,min,max,expectedMin,expectedMax});
    }return result;
   });
   for(const item of bounds)for(let a=0;a<3;a++){assert.ok(Math.abs(item.min[a]-item.expectedMin[a])<1e-4,item.id+' min');assert.ok(Math.abs(item.max[a]-item.expectedMax[a])<1e-4,item.id+' max');}
   await shot(page,'dominus-source-desktop');await page.locator('[data-dominus-model]').selectOption('port_crateshed');await page.click('[data-dominus-focus]');await projected(page,'dominus-source-port_crateshed-model');await shot(page,'dominus-binary-crateshed');
   await page.evaluate(()=>{const api=window.__GRAPHYSX__,id='dominus-source-port_crateshed-model',slot=api.query({ids:[id]})[0].materialSlots[0].id;let r=api.update(id,{label:'My recovered shed',modelMaterialOverrides:{[slot]:{color:'#ccb088'}}});if(!r.ok)throw Error(r.error);r=api.spawn({id:'my-dominus-object',type:'box',transform:{position:[0,1,0]}});if(!r.ok)throw Error(r.error);});
   await page.click('[data-dominus-view="models"]');assert.equal(await page.locator('[data-dominus-model] option').count(),65);await page.evaluate(()=>window.__GRAPHYSX__.undo());await page.waitForFunction(()=>document.querySelector('[data-dominus-view="source"]').getAttribute('aria-pressed')==='true');await page.evaluate(()=>window.__GRAPHYSX__.redo());await page.waitForFunction(()=>document.querySelector('[data-dominus-view="models"]').getAttribute('aria-pressed')==='true');
   await page.click('[data-revival-frame]');await shot(page,'dominus-all-models-desktop');
   await page.locator('[data-dominus-model]').selectOption('renzokscale');await page.click('[data-dominus-focus]');await projected(page,'dominus-gallery-renzokscale-model');await shot(page,'dominus-binary-renzok');
   const expected=await sceneDocument(page),saved=await saveAndReopen(page,'Dominus retrouvé',expected);await shot(page,'dominus-studio-reopened');
   assert.equal((await sceneDocument(page)).entities.find(e=>e.id==='dominus-source-port_crateshed-model').label,'My recovered shed');receipts.push({nativePlacementBounds:bounds.length,modelCount:65,binaryModels:2,viewUndoRedo:true,saved});await context.close();
   for(const viewport of [{width:320,height:740},{width:844,height:390}]){
    const {page,context}=await open(viewport,'reduce');await page.goto(new URL('?app=dominus&view=models&intro=0',base).href);await ready(page);await layout(page);
    await page.locator('[data-dominus-model]').selectOption('renzokscale');await page.locator('[data-dominus-focus]').scrollIntoViewIfNeeded();await page.click('[data-dominus-focus]');await projected(page,'dominus-gallery-renzokscale-model');await shot(page,'dominus-model-'+viewport.width);receipts.push({viewport,unobscuredBinaryModel:true});await context.close();
   }
  }else if(mode==='revival-lifecycle'){
   for(const scenario of ['foreign-same-id','studio-before-source']){
    const {page,context}=await open();await page.addInitScript(()=>{
     const fetchSource=window.fetch.bind(window);window.fetch=async(...args)=>{const response=await fetchSource(...args);if(String(args[0]).includes('/assets/ports/archive-playground.json')){window.__revivalSourceHeld=true;await new Promise(resolve=>{window.__releaseRevivalSource=resolve;});}return response;};
    });
    await page.goto(new URL('?app=playground&intro=0',base).href);await page.locator('[data-revival-studio]').waitFor();await page.waitForFunction(()=>window.__revivalSourceHeld);
    if(scenario==='foreign-same-id'){
     await page.evaluate(()=>{const r=window.__GRAPHYSX__.create({schema:'graphysx.agent-world/v2',id:'archive-threejs-playground',label:'Keep foreign document',entities:[{id:'foreign-marker',type:'box',label:'Keep me'}]});if(!r.ok)throw Error(r.error);});
     const expected=await sceneDocument(page);await page.evaluate(()=>window.__releaseRevivalSource());await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).application.phase==='foreign');
     await page.waitForTimeout(300);assert.deepEqual(await sceneDocument(page),expected);await page.click('[data-revival-studio]');await page.locator('.gx-studio-simple:not([hidden])').waitFor();assert.deepEqual(await sceneDocument(page),expected);
    }else{
     const expected=await sceneDocument(page);await page.click('[data-revival-studio]');await page.locator('.gx-studio-simple:not([hidden])').waitFor();await page.evaluate(()=>window.__releaseRevivalSource());await page.waitForTimeout(300);assert.deepEqual(canonicalScene(await sceneDocument(page)),canonicalScene(expected));assert.equal(await page.locator('.gx-revival').count(),0);
    }
    receipts.push({scenario,preserved:true});await shot(page,'lifecycle-'+scenario);await context.close();
   }
  }else throw Error('Unknown revival smoke '+mode);
  assert.deepEqual(errors,[],'No browser, shader or asset errors');await writeFile(path.join(output,mode+'.json'),JSON.stringify({receipts,errors,passed:true},null,2));console.log('PASS '+mode+' '+receipts.length+' receipts');
 }catch(error){if(active&&!active.isClosed())await active.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});await writeFile(path.join(output,mode+'-failure.json'),JSON.stringify({error:error.message,receipts,errors},null,2));throw error;}
 finally{await browser.close();}
}
