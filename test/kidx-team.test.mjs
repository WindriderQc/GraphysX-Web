import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createKidxTeamRoute } from "../scripts/kidx-team-server.mjs";
import { createKidxTeam } from "../src/kidx-team.ts";

test("shared build rooms synchronize state, reject stale writes, validate inputs and expire", async () => {
  let time = 100;
  const route = createKidxTeamRoute({ now: () => time });
  const server = createServer((req, res) => { if (!route(req,res)) { res.writeHead(404); res.end(); } });
  await new Promise(resolve => server.listen(0,"127.0.0.1",resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body, extra = {}) => fetch(base+path,{method:"POST",headers:{"content-type":"application/json",...extra},body:JSON.stringify(body)});
  try {
    const draft={model:"track3r",step:0,prepared:false,names:["Alex","Sam"]};
    const response=await post("/kidx-team",draft);assert.equal(response.status,200);const first=await response.json();assert.match(first.code,/^[\w-]{8}$/);
    assert.deepEqual(await (await fetch(`${base}/kidx-team/${first.code}`)).json(),first);
    const update=await post(`/kidx-team/${first.code}`,{...draft,revision:first.revision,prepared:true});const second=await update.json();assert.equal(second.revision,2);assert.equal(second.prepared,true);
    const stale=await post(`/kidx-team/${first.code}`,{...draft,revision:1,step:1});assert.equal(stale.status,409);assert.equal((await stale.json()).state.prepared,true);
    assert.equal((await post("/kidx-team",{...draft,step:28})).status,400);
    assert.equal((await post("/kidx-team",draft,{origin:"https://example.com"})).status,403);
    time+=12*60*60*1000+1;assert.equal((await fetch(`${base}/kidx-team/${first.code}`)).status,404);
  } finally { await new Promise(resolve=>server.close(resolve)); }
});

test("leaving a shared room ignores an in-flight join response", async () => {
  const original=globalThis.fetch;let resolve;let received=0;
  globalThis.fetch=()=>new Promise(r=>{resolve=r;});
  const client=createKidxTeam("track3r",()=>{received++;},()=>{});
  try {
    const joining=client.join("abcdefgh");client.leave();
    resolve(new Response(JSON.stringify({code:"abcdefgh",model:"track3r",step:0,prepared:false,names:["A","B"],revision:1}),{headers:{"content-type":"application/json"}}));
    await joining;assert.equal(received,0);assert.equal(client.state(),null);
  } finally {client.dispose();globalThis.fetch=original;}
});

test("a handoff interrupted by the network is retried after reconnect", async () => {
  const originalFetch=globalThis.fetch, originalNow=Date.now;
  let time=1000, attempts=0;
  const received=[], reports=[];
  let room={code:"abcdefgh",model:"track3r",step:0,prepared:false,names:["A","B"],revision:1};
  Date.now=()=>time;
  globalThis.fetch=async (_url, options) => {
    if(options.method === "POST") {
      if(++attempts === 1) throw new Error("offline");
      room={...room,...JSON.parse(options.body),revision:room.revision+1};
    }
    return new Response(JSON.stringify(room),{headers:{"content-type":"application/json"}});
  };
  const client=createKidxTeam("track3r",state=>received.push(state),message=>reports.push(message));
  try {
    await client.join("abcdefgh");
    client.publish({model:"track3r",step:1,prepared:true,names:["A","B"]});
    client.advance(); await new Promise(resolve=>setImmediate(resolve));
    assert.equal(attempts,1); assert.equal(reports.at(-1),"offline");
    assert.equal(received.at(-1).step,0);
    time+=2000; client.advance(); await new Promise(resolve=>setImmediate(resolve));
    assert.equal(attempts,2); assert.equal(received.at(-1).step,1);
    assert.equal(received.at(-1).prepared,true); assert.equal(received.at(-1).revision,2);
  } finally { client.dispose(); globalThis.fetch=originalFetch; Date.now=originalNow; }
});
