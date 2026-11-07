import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

// Explicit post-build smoke: the ordinary unit suite must not require a dist folder.
const script=fileURLToPath(new URL('./serve-ballsy-shared-vr.mjs',import.meta.url));
function launch(env){
 const child=spawn(process.execPath,[script],{env:{...process.env,...env},stdio:['ignore','pipe','pipe'],windowsHide:true});
 let output='';child.stdout.on('data',data=>{output+=data;});child.stderr.on('data',data=>{output+=data;});
 const exited=once(child,'exit');return {child,exited,get output(){return output;}};
}
test('Ballsy VR preview stays on loopback, serves the relay and XR assets, refuses conflict, and expires',async t=>{
 const run=launch({BALLSY_VR_PORT:'0',BALLSY_VR_HOURS:'0.001'});t.after(()=>run.child.kill());
 const deadline=Date.now()+5000;
 while(!run.output.includes('/ballsy.html') && Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));
 const url=run.output.match(/http:\/\/127\.0\.0\.1:(\d+)\/ballsy\.html/)?.[0];assert.ok(url,run.output);
 const page=await fetch(url);assert.equal(page.status,200);assert.equal(page.headers.get('X-Ballsy-Relay'),'1');
 for(const asset of ['profilesList.json','generic-trigger/profile.json','generic-trigger/controller.gltf']){
  const response=await fetch(new URL(`/assets/xr/profiles/${asset}`,url));assert.equal(response.status,200,asset);await response.json();
 }
 const status=await fetch(new URL('/api/ballsy/status',url));assert.equal(status.status,200);assert.equal((await status.json()).schema,'ballsy-room/v1');
 const other=launch({BALLSY_VR_PORT:new URL(url).port,BALLSY_VR_HOURS:'0.001'});t.after(()=>other.child.kill());
 assert.equal((await other.exited)[0],1);assert.match(other.output,/deja occupe/);
 assert.equal((await fetch(url)).status,200);
 assert.equal((await run.exited)[0],0);assert.match(run.output,/Apercu Ballsy VR arrete/);
 await assert.rejects(fetch(url));
});
