import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
const script=fileURLToPath(new URL('../scripts/serve-vr-lab.mjs',import.meta.url));
function launch(env){
 const child=spawn(process.execPath,[script],{env:{...process.env,...env},stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',data=>{output+=data;});child.stderr.on('data',data=>{output+=data;});
 const exited=once(child,'exit');return {child,exited,get output(){return output;}};
}
test('VR preview binds loopback, serves assets, refuses an occupied port, and expires',async t=>{
 const run=launch({VR_LAB_PORT:'0',VR_LAB_HOURS:'0.001'});t.after(()=>run.child.kill());
 const deadline=Date.now()+5000;
 while(!run.output.includes('?app=vr-lab') && Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));
 const url=run.output.match(/http:\/\/127\.0\.0\.1:(\d+)\/\?app=vr-lab/)?.[0];assert.ok(url,run.output);
 assert.equal((await fetch(url)).status,200);
 assert.equal((await fetch(new URL('/assets/xr/profiles/generic-trigger/controller.gltf',url))).status,200);
 const other=launch({VR_LAB_PORT:new URL(url).port,VR_LAB_HOURS:'0.001'});t.after(()=>other.child.kill());
 assert.equal((await other.exited)[0],1);assert.match(other.output,/already in use/);
 assert.equal((await fetch(url)).status,200);
 assert.equal((await run.exited)[0],0);assert.match(run.output,/Apercu VR arrete/);
 await assert.rejects(fetch(url));
});
