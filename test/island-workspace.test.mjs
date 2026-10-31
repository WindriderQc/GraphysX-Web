import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importBrowserModule } from './support/import-browser-module.mjs';
const data = await importBrowserModule(new URL('../src/island-explorer-data.ts', import.meta.url));
const ws = await importBrowserModule(new URL('../src/island-workspace-data.ts', import.meta.url));
const feed = await importBrowserModule(new URL('../src/island-world-feed.ts', import.meta.url));
const hello = instanceId => feed.parseWorldEvent('hello', JSON.stringify({ format: feed.WORLD_STREAM_FORMAT, instanceId, recordingId: instanceId, tickHz: 60, tick: 120, ids: {}, document: { id:'living-island', entities: [
  {id:'trunk',type:'cylinder',geometry:{radius:.35,height:8},transform:{scale:[1,1,1]}},
  {id:'tree1',type:'dna-tree',label:'Tree_1',dna:{seed:11,generation:3}},
  {id:'tree2',type:'dna-tree',label:'Tree_2',dna:{seed:22,generation:1}},
  {id:'eko',type:'agent',label:'Eko'}
]}, inspection:{worldId:'living-island',entities:[{id:'trunk',size:[1,1,1]},{id:'tree1',attributes:{Generation:3}},{id:'tree2',attributes:{Parent:'Tree_1',Generation:1,SownBy:'Eko'}}],agents:[]}, journal:{truncated:true,oldest:5,latest:204} })).hello;
const make = id => data.buildIslandExplorer({world:feed.worldSceneFromHello(hello(id)),claw:null,mode:'replay',connected:true,actions:[]});
test('instance identity distinguishes two runs of the same island and preserves legacy geometry',()=>{
  assert.notEqual(make('one').key,make('two').key);
  const model=make('one');
  const trunk=model.items.find(i=>i.id==='trunk');
  assert.equal(trunk.properties.find(p=>p.label==='Dimensions (unités du monde)').value,'0,7 · 8 · 0,7');
  assert.equal(trunk.properties.find(p=>p.label.startsWith('Échelle')).value,'1 · 1 · 1');
  assert.equal(model.journalTruncated,true);
});
test('journal catchup deduplicates identities, keeps different same-tick actions and excludes another instance',()=>{
  const action=(id,instanceId='one')=>({id,instanceId,tick:60,agent:'Eko',input:{type:'Jump'},result:''});
  const merged=ws.mergeWorldActions([action('one:1')],[action('one:1'),action('one:2'),action('two:1','two')],'one');
  assert.deepEqual(merged.map(a=>a.id),['one:1','one:2']);
  const old={tick:10,agent:'Eko',input:{type:'Jump'},result:''};
  assert.equal(ws.mergeWorldActions([old],[old]).length,1);
});
test('lineage depth is independent from mutation generation and cycles stay incomplete',()=>{
  const model=make('one'),nodes=ws.lineageNodes(model);
  assert.equal(nodes.find(n=>n.item.id==='tree2').level,1);
  assert.equal(nodes.find(n=>n.item.id==='tree1').level,0);
  model.items.find(i=>i.id==='tree1').attributes.Parent='absent';
  assert.equal(ws.lineageNodes(model).find(n=>n.item.id==='tree2').incomplete,true);
});
test('comparison freezes evidence, reports missing properties and retains provenance',()=>{
  const model=make('one'),tree=model.items.find(i=>i.id==='tree1');
  const a=ws.treeSnapshot(model,tree); tree.properties.push({label:'Nouvelle donnée',value:'2',group:'Génétique'}); model.tick=180;
  const b=ws.treeSnapshot(model,tree),diff=ws.compareTreeProperties(a,b).find(r=>r.label==='Nouvelle donnée');
  assert.equal(diff.a,'Non renseigné');assert.equal(diff.b,'2');assert.equal(diff.changed,true);
  assert.equal(a.tick,120); assert.match(ws.snapshotProvenance(a),/instance one/);
});
test('timeline maps real targets, leaves unknown subjects unknown and includes recorded messages',()=>{
  const model=make('one'); model.actions=[{tick:90,agent:'Eko',input:{type:'GatherSeed',data:{target:'Tree_1'}},result:'GatherSeedSuccess'}];
  model.messages=[{id:'message',tick:91,role:'agent',text:'Bonjour'}];
  const entries=ws.timelineEntries(model,[{id:'change',tick:92,target:'tree2',text:'Mise à jour'}]);
  assert.equal(entries[0].target,'tree2');assert.equal(entries[1].kind,'Message');assert.equal(entries[2].target,'tree1');
  model.actions[0].agent='unknown';model.actions[0].input.data={target:'unknown'};
  assert.equal(ws.timelineEntries(model).find(e=>e.kind==='Action').target,null);
});
test('map groups a mesa cap with its logical terrain rather than duplicating render geometry',()=>{
  const model=make('one');
  const terrain={...model.items[0],id:'mesa',entityId:'mesa',category:'terrain',position:[0,1,0],visible:true};
  model.items.push(terrain,{...terrain,id:'mesa-grass',entityId:'mesa-grass'});
  const markers=ws.mapItems(model);
  assert.ok(markers.some(i=>i.id==='mesa'));assert.equal(markers.some(i=>i.id==='mesa-grass'),false);
});
test('a replay event resolves its subject after seek data arrives, and never into another instance',async()=>{
  const {islandWorkspace}=await importBrowserModule(new URL('../src/island-workspace.ts',import.meta.url));
  const selected=[],seeks=[];
  const workspace=islandWorkspace({select:id=>selected.push(id),seek:tick=>seeks.push(tick),focus(){}});
  const target={dataset:{eventTick:'30',eventTarget:'',eventSubject:'Eko'},hasAttribute:name=>name==='data-event-tick'};
  workspace.handle(target,make('one'),'tree1');
  assert.deepEqual(selected,[null]);assert.deepEqual(seeks,[30]);
  const arrived=make('one');arrived.tick=30;
  assert.equal(workspace.selectionAfterSeek(arrived),'eko');
  assert.equal(workspace.selectionAfterSeek(arrived),null);
  workspace.handle(target,arrived,null);
  const other=make('two');other.tick=30;
  assert.equal(workspace.selectionAfterSeek(other),null);
});
test('opaque action IDs and journal generations survive parsing, while absent optional fields keep legacy shapes',()=>{
  const h=hello('one');h.journal={generation:'restored-generation',reset:true,oldest:1,latest:2};
  const parsed=feed.parseWorldEvent('hello',JSON.stringify(h));
  assert.equal(parsed.hello.journal.generation,'restored-generation');assert.equal(parsed.hello.journal.reset,true);
  const action=feed.parseWorldEvent('action',JSON.stringify({id:'opaque:id:with:generation',instanceId:'one',sequence:1,tick:2,agent:'Eko',input:{type:'Jump'},result:''}));
  assert.equal(action.action.id,'opaque:id:with:generation');
  const frame=feed.parseWorldEvent('frame',JSON.stringify({tick:2,poses:[]}));
  assert.deepEqual(frame.frame,{tick:2,t:0,poses:[]});
});
test('timeline navigation reaches older retained events instead of silently hiding them behind a latest-only slice',async()=>{
  const {islandWorkspace}=await importBrowserModule(new URL('../src/island-workspace.ts',import.meta.url));
  const workspace=islandWorkspace({select(){},seek(){},focus(){}}),model=make('one');model.mode='Direct';
  model.actions=Array.from({length:350},(_,i)=>({id:`event-${i}`,tick:i,agent:'Eko',input:{type:`Action_${i}`},result:''}));
  const first=workspace.render('timeline',model,null);assert.match(first,/Action_349/);assert.doesNotMatch(first,/Action_0</);
  for(let i=0;i<3;i++)workspace.handle({dataset:{timelinePage:'older'},hasAttribute(){return false;}},model,null);
  const oldest=workspace.render('timeline',model,null);assert.match(oldest,/Action_0</);assert.match(oldest,/301–350 \/ 350/);
});
