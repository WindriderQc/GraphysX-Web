import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import path from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
import { applySmokeTimeout, launchSmokeBrowser, useLightRender } from './smoke-harness.mjs';
import { startStaticServer } from './static-server.mjs';
// Synthetic transport faults only; no model, installed service or production world.
let instance='00000000-0000-4000-8000-000000000001',generation='journal-one',tick=60,sequence=0,frozen=false;
let journal=[];
const clients=new Set(),errors=[];
const identity=()=>({instanceId:instance,recordingId:instance});
const hello=()=>({format:'graphysx-world-stream/v1',...identity(),tick,tickHz:60,ids:{1:'eko',2:'block_1'},journal:{generation,oldest:1,latest:sequence,limit:200,truncated:false},document:{id:'living-island',label:'Living island',entities:[
 {id:'eko',label:'Eko',type:'agent',transform:{position:[0,2,0]}},
 {id:'block_1',label:'Block_1',type:'box',geometry:{width:2,height:2,depth:2},transform:{position:[4,1,0]},tags:['pickup']}
]},inspection:{worldId:'living-island',entities:[],agents:[{id:'eko',name:'Eko',attributes:{Presence:'idle'}}]}});
const event=(name,data)=>`event: ${name}\n${data.id?`id: ${data.id}\n`:''}data: ${JSON.stringify(data)}\n\n`;
const emit=(name,data)=>{for(const client of clients)if(!client.writableEnded)client.write(event(name,data));};
const action=(repeat=false)=>{const a=repeat?journal.at(-1):{...identity(),id:`${instance}:${generation}:${++sequence}`,sequence,tick,agent:'Eko',input:{type:'Jump'},result:''};if(!repeat)journal.push(a);emit('action',a);};
const service=createServer((req,res)=>{
 const url=new URL(req.url,'http://fixture');const expected=url.searchParams.get('instance');
 const json=(status,data)=>{res.writeHead(status,{'content-type':'application/json','access-control-allow-origin':'*'});res.end(JSON.stringify(data));};
 if(expected&&expected!==instance)return json(409,{error:'World instance changed',...identity()});
 if(url.pathname==='/healthz')return json(200,{ok:true,tick,world:'living-island',...identity()});
 if(url.pathname==='/spectate'){res.writeHead(200,{'content-type':'text/event-stream','access-control-allow-origin':'*','cache-control':'no-cache'});res.write(event('hello',hello()));for(const a of journal)res.write(event('action',a));clients.add(res);req.on('close',()=>clients.delete(res));return;}
 return json(404,{});
});
await new Promise(r=>service.listen(0,'127.0.0.1',r));
const source=`http://127.0.0.1:${service.address().port}`;
const interval=setInterval(()=>{if(!frozen)tick+=6;emit('frame',{tick,t:tick/60,poses:[]});},100);
let browser,server;
const state=p=>p.evaluate(()=>JSON.parse(window.render_game_to_text()).application);
try{
 server=await startStaticServer({root:path.resolve('dist'),port:0});browser=await launchSmokeBrowser();
 const page=applySmokeTimeout(await browser.newPage({viewport:{width:1280,height:900}}));await useLightRender(page);page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(`${server.url}/?app=island&source=${encodeURIComponent(source)}`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>typeof window.render_game_to_text==='function'&&JSON.parse(window.render_game_to_text()).application?.world?.frames>2);
 await page.locator('[data-ix-category="objects"]').click();await page.locator('[data-ix-select="block_1"]').click();
 action();action(true);await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).application.world.actions===1);
 // Server tail catches an action missed during a disconnected transport, without duplicates.
 for(const client of clients)client.end();clients.clear();action();
 await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).application.world.actions===2);
 assert.equal((await state(page)).explorer.selected,'block_1');
 generation='journal-restored';sequence=0;journal=[];tick=30;emit('hello',hello());
 await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).application.world.actions===0);
 action();await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).application.world.actions===1);
 // Two experiments using the same world type must never share actions or a selection.
 instance='00000000-0000-4000-8000-000000000002';generation='journal-two';sequence=0;journal=[];emit('hello',hello());
 await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).application.explorer.selected===null&&JSON.parse(window.render_game_to_text()).application.world.actions===0);
 frozen=true;await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).application.frozen===true,{},{timeout:12000});
 assert.equal((await state(page)).connected,false);assert.match(await page.locator('[data-status]').textContent(),/figé/);
 frozen=false;await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).application.frozen===false);
 await page.locator('[data-ix-category="agents"]').click();await page.locator('[data-ix-select="eko"]').click();
 assert.match(await page.locator('[data-ix-content]').textContent(),/Inactive \(avatar conservé\)/);
 // Pagination keeps old actions reachable beyond the first screen of the journal.
 for(let i=0;i<350;i++)action();
 await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).application.world.actions===350);
 await page.locator('.ix-views [data-ix-view="timeline"]').click();
 for(let i=0;i<3;i++)await page.locator('[data-timeline-page="older"]').click();
 assert.match(await page.locator('[data-ix-content]').textContent(),/301–350 \/ 350/);
 const mismatch=new URL(source);mismatch.searchParams.set('instance','00000000-0000-4000-8000-000000000001');
 await page.goto(`${server.url}/?app=island&source=${encodeURIComponent(mismatch.href)}`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('[data-status]')?.textContent==='Instance indisponible');
 assert.match(await page.locator('[data-notice]').textContent(),/n’est plus active/);
 await page.close();assert.deepEqual(errors,[]);
 const out=process.env.SMOKE_ARTIFACTS||'output/verify';mkdirSync(out,{recursive:true});writeFileSync(path.join(out,'island-stream-result.json'),JSON.stringify({passed:true,errors,coverage:['live action dedup','reconnect retained catchup','journal generation rollback','same type new instance reset','open but frozen stream','idle presence','timeline pagination beyond 100 events','expected instance fails closed']},null,2));
 console.log('ok: island stream recovery, generation reset, stale detection and instance binding');
}finally{clearInterval(interval);await browser?.close();for(const client of clients)client.end();await new Promise(r=>service.close(r));await server?.close();}
