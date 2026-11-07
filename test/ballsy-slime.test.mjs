import { test } from "node:test";
import assert from "node:assert/strict";
import { importBrowserModule } from "./support/import-browser-module.mjs";
import { parseGiantCommand, isBallsySlimeSnapshot } from "../server/ballsy-protocol.mjs";
const { createBallsySlime, snapshotBallsySlime, launchBallsySlime, advanceBallsySlime, cancelBallsySlimeFlight,
  ballsySlimeSpeedFactor, sweepBallsySlimeRoad, BALLSY_SLIME_STEP: dt, BALLSY_SLIME_LIMITS: L } = await importBrowserModule(new URL("../src/ballsy-slime.ts", import.meta.url));
const { coursePoint, COURSE_FORK, courseEdge } = await importBrowserModule(new URL("../src/ballsy-course.ts", import.meta.url));
const { ballsySlimeEntities, projectBallsySlime } = await importBrowserModule(new URL("../src/ballsy-slime-scene.ts", import.meta.url));
const { DoubleSide, Group, Mesh, SphereGeometry, MeshStandardMaterial, Vector3 } = await import("three");
const command=(id="throw-11111111",origin=[55,90,50],velocity=[10,20,-5])=>({type:"slime",throwId:id,origin,velocity});
const tick=(s,n=1,runners=[])=>{for(let i=0;i<n;i++)advanceBallsySlime(s,dt,runners);};
const close=(a,b,e=1e-7)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);

test("throw admits only finite bounded origin/velocity, never targets, durations or scene edits",()=>{
  assert.deepEqual(parseGiantCommand(command()),command());
  for(const invalid of [null, {...command(),target:0},{...command(),slowSeconds:100},{...command(),throwId:"x"},
    command("throw-11111111",[61,2,0]),command("throw-11111111",[0,101,0]),command("throw-11111111",[0,2,-56]),
    command("throw-11111111",[NaN,2,0]),command("throw-11111111",[0,2,0],[100,100,100]),command("throw-11111111",[0,2,0],[0,Infinity,0])]) {
    assert.equal(parseGiantCommand(invalid),null);assert.equal(launchBallsySlime(createBallsySlime(),invalid).ok,false);
  }
  const s=createBallsySlime(), c=command();assert.equal(launchBallsySlime(s,c).ok,true);
  c.origin[0]=0;c.velocity[0]=0;assert.equal(s.projectiles[0].position[0],55);assert.equal(s.projectiles[0].velocity[0],10);
});

test("cooldown and entire-round replay ledger cannot be bypassed by cancelling or different transport IDs",()=>{
  const s=createBallsySlime();assert.equal(launchBallsySlime(s,command()).ok,true);
  assert.equal(launchBallsySlime(s,command("throw-22222222")).ok,false);
  cancelBallsySlimeFlight(s);assert.equal(launchBallsySlime(s,command("throw-22222222")).ok,false);
  tick(s,60);assert.equal(launchBallsySlime(s,command()).ok,false);
  assert.equal(launchBallsySlime(s,command("throw-22222222")).ok,true);
  tick(s,60);s.throws=L.maxThrows;assert.equal(launchBallsySlime(s,command("throw-33333333")).ok,false);
  const fresh=createBallsySlime();assert.equal(launchBallsySlime(fresh,command()).ok,true);
});

test("fixed-step trajectory uses measured velocity without auto-aim, boost or altered race gravity",()=>{
  const s=createBallsySlime();launchBallsySlime(s,command());tick(s,6);
  const p=s.projectiles[0];close(p.position[0],56);close(p.position[1],90+20*.1-L.gravity*.1*.1/2);close(p.position[2],49.5);
  close(p.velocity[1],20-L.gravity*.1);close(L.gravity*.045,9.81);
  assert.throws(()=>advanceBallsySlime(s,.1,[]),RangeError);assert.throws(()=>advanceBallsySlime(s,-dt,[]),RangeError);
  const before=snapshotBallsySlime(s);advanceBallsySlime(s,0,[]);assert.deepEqual(snapshotBallsySlime(s),before);
});

test("swept collisions follow actual banked main/shortcut road, not a nearest route or ground plane",()=>{
  for(const [t,branch,lateral] of [[.13,"main",2],[.51,"main",3],[(COURSE_FORK.start+COURSE_FORK.end)/2,"shortcut",.8]]) {
    const p=coursePoint(t,branch), e=courseEdge(p,lateral), hit=sweepBallsySlimeRoad([e[0],e[1]+12,e[2]],[e[0],e[1]-8,e[2]]);
    assert.ok(hit,`${branch} at ${t}`);close(hit.position[0],e[0],.3);close(hit.position[1],e[1],.15);close(hit.position[2],e[2],.3);
    close(Math.hypot(...hit.normal),1);assert.ok(hit.normal[1]>.85);
  }
  assert.equal(sweepBallsySlimeRoad([55,20,50],[55,-7,50]),null);
  assert.equal(sweepBallsySlimeRoad([0,-5,19],[0,-7,19]),null,"No hit from beneath road");
});

test("road impact creates a bounded visible splat and nearby physical runners receive 25% slowdown",()=>{
  const p=coursePoint(.13),s=createBallsySlime();launchBallsySlime(s,command("throw-road1111",[p.x,p.y+3,p.z],[0,-140,0]));
  tick(s,2);assert.equal(s.projectiles.length,0);assert.equal(s.splats.length,1);
  assert.equal(s.splats[0].player,null);assert.equal(s.splats[0].id,"throw-road1111");
  const on={position:[p.x,p.y+.65,p.z]},below={position:[p.x,p.y-3,p.z]};tick(s,1,[on,below]);
  assert.equal(s.hits,1);assert.equal(ballsySlimeSpeedFactor(s,0),.75);assert.equal(ballsySlimeSpeedFactor(s,1),1);
  assert.equal(isBallsySlimeSnapshot(snapshotBallsySlime(s)),true);
});

test("moving-racer continuous collision catches crossing between frames and ignores finished racers",()=>{
  const s=createBallsySlime();launchBallsySlime(s,command("throw-moving1",[-2,15,0],[150,0,0]));
  tick(s,1,[{previous:[0,15,-3],position:[0,15,1]}]);
  assert.equal(s.projectiles.length,0);assert.equal(s.splats[0].player,0);assert.equal(s.hits,1);
  const other=createBallsySlime();launchBallsySlime(other,command("throw-moving2",[-2,15,0],[150,0,0]));
  tick(other,1,[{previous:[0,15,-3],position:[0,15,1],finished:true}]);assert.equal(other.hits,0);
});

test("slow is not refreshed/stacked, ends after two seconds, and pause/cancel/recovery cannot grant speed",()=>{
  const s=createBallsySlime(),r={position:[0,15,0]};launchBallsySlime(s,command("throw-hit1111",[-2,15,0],[150,0,0]));tick(s,1,[r]);
  const until=s.slowUntil[0];assert.equal(ballsySlimeSpeedFactor(s,0),.75);
  cancelBallsySlimeFlight(s);assert.equal(s.slowUntil[0],until);
  // A paused host does not step this model. A recovery does not clear the coating either.
  const paused=snapshotBallsySlime(s);advanceBallsySlime(s,0,[{position:[55,3,50]}]);assert.deepEqual(snapshotBallsySlime(s),paused);
  tick(s,60);launchBallsySlime(s,command("throw-hit2222",[-2,15,0],[150,0,0]));tick(s,1,[r]);
  assert.equal(s.slowUntil[0],until);assert.equal(s.hits,1);
  tick(s,47);assert.equal(ballsySlimeSpeedFactor(s,0),.75);
  tick(s,12);close(ballsySlimeSpeedFactor(s,0),1);
  assert.equal(createBallsySlime().slowUntil[0],0);
});

test("misses expire, road splats expire and fixed pools stay bounded across a long run",()=>{
  const s=createBallsySlime();
  for(let n=0;n<32;n++) {
    launchBallsySlime(s,command(`throw-bounded-${n}`,[55,90,50],[0,0,0]));tick(s,60);
    assert.ok(s.projectiles.length<=L.maxProjectiles);assert.ok(s.splats.length<=L.maxSplats);assert.equal(isBallsySlimeSnapshot(snapshotBallsySlime(s)),true);
  }
  tick(s,181);assert.equal(s.projectiles.length,0);assert.equal(s.hits,0);
  const p=coursePoint(.13);launchBallsySlime(s,command("throw-expire11",[p.x,p.y+3,p.z],[0,-140,0]));tick(s,2);assert.equal(s.splats.length,1);
  tick(s,181);assert.equal(s.splats.length,0);
});

test("wire state refuses oversize, forged normals/timers/positions and excludes internal replay ledger",()=>{
  const good=snapshotBallsySlime(createBallsySlime());assert.equal(isBallsySlimeSnapshot(good),true);assert.equal("seenThrowIds" in good,false);
  const p={id:"throw-wire111",position:[0,10,0],velocity:[0,0,0],bornAt:0};
  for(const patch of [{projectiles:Array(7).fill(p)},{projectiles:[{...p,position:[NaN,0,0]}]},
    {slowUntil:[100,0]},{cooldownUntil:100},{splats:[{...p,normal:[0,2,0],radius:2,player:null}]},{projectiles:[p,p]}])assert.equal(isBallsySlimeSnapshot({...good,...patch}),false);
});

test("visual pool has no physics and hides stale entries without spawning or editor updates",()=>{
  const definitions=ballsySlimeEntities();assert.equal(definitions.length,20);assert.ok(definitions.every(d=>!d.physics&&!d.visible));
  const objects=new Map(definitions.map(d=>[d.id,new Mesh(new SphereGeometry(1,8,6),new MeshStandardMaterial())]));
  const s=createBallsySlime();launchBallsySlime(s,command());projectBallsySlime(s,id=>objects.get(id));
  assert.equal(objects.get("ballsy-slime-ball-0").visible,true);assert.deepEqual(objects.get("ballsy-slime-ball-0").position.toArray(),[55,90,50]);
  assert.equal(objects.get("ballsy-slime-ball-1").visible,false);cancelBallsySlimeFlight(s);projectBallsySlime(s,id=>objects.get(id));
  assert.equal(objects.get("ballsy-slime-ball-0").visible,false);
  for(const mesh of objects.values()){mesh.geometry.dispose();mesh.material.dispose();}
});

test("release inside racer yields valid up normal and does not poison relay snapshots",()=>{
  const s=createBallsySlime();launchBallsySlime(s,command("throw-inside11",[0,15,0],[0,0,0]));
  tick(s,1,[{position:[0,15,0]}]);assert.equal(s.hits,1);assert.deepEqual(s.splats[0].normal,[0,1,0]);
  assert.equal(isBallsySlimeSnapshot(snapshotBallsySlime(s)),true);
});

test("projection handles inline mesh material arrays and bounds visual extrapolation",()=>{
  const material=new MeshStandardMaterial({transparent:true,opacity:.94});
  const splat=new Mesh(new SphereGeometry(1,8,6),[material]);
  const ball=new Mesh(new SphereGeometry(1,8,6),new MeshStandardMaterial());
  const s=createBallsySlime();launchBallsySlime(s,command());
  s.time=2.75;s.splats=[{id:"throw-fade111",position:[0,1,0],normal:[0,1,0],radius:2,bornAt:0,player:null}];
  const resolve=id=>id==="ballsy-slime-splat-0"?splat:id==="ballsy-slime-ball-0"?ball:null;
  projectBallsySlime(s,resolve,5);close(material.opacity,.47);assert.equal(material.depthWrite,false);assert.equal(material.side,DoubleSide);
  close(ball.position.x,55+10*.12);close(ball.position.y,90+20*.12-L.gravity*.12*.12/2);
  s.splats=[];projectBallsySlime(s,resolve);assert.equal(splat.visible,false);
  material.dispose();splat.geometry.dispose();ball.geometry.dispose();ball.material.dispose();
});

test("a release already touching the road bursts instead of passing through the surface",()=>{
  const p=coursePoint(.13),s=createBallsySlime();
  launchBallsySlime(s,command("throw-touch111",[p.x,p.y+.1,p.z],[0,0,0]));tick(s,1);
  assert.equal(s.projectiles.length,0);assert.equal(s.splats.length,1);assert.equal(s.splats[0].player,null);
});


test("slime coats follow the actual parent balls and are visible only during the slowdown",()=>{
  const definitions=ballsySlimeEntities(),parents=[new Group(),new Group()];
  parents[0].position.set(3,2,4);parents[1].position.set(-3,2,4);
  const objects=new Map(definitions.map(d=>{
    const object=new Mesh(new SphereGeometry(d.geometry?.radius??1,8,6),new MeshStandardMaterial({color:d.material.color,opacity:d.material.opacity??1}));
    if(d.parentId){
      assert.match(d.parentId,/^ballsy-p[12]$/);
      parents[Number(d.parentId.at(-1))-1].add(object);
    }
    return[d.id,object];
  }));
  const coat=objects.get("ballsy-slime-coat-0"),other=objects.get("ballsy-slime-coat-1"),s=createBallsySlime();
  assert.equal(coat.parent,parents[0]);assert.equal(other.parent,parents[1]);
  s.slowUntil=[2,0];projectBallsySlime(s,id=>objects.get(id));
  assert.equal(coat.visible,true);assert.equal(other.visible,false);assert.ok(coat.material.opacity>0&&coat.material.opacity<.5);
  assert.equal(coat.material.depthWrite,false);
  assert.deepEqual(coat.getWorldPosition(new Vector3()).toArray(),[3,2,4]);
  // The rendered pose follows parent transforms even after the last projection.
  parents[0].position.set(8,5,-2);parents[0].rotation.y=.7;
  assert.deepEqual(coat.getWorldPosition(new Vector3()).toArray(),[8,5,-2]);
  s.time=1.99;projectBallsySlime(s,id=>objects.get(id));assert.equal(coat.visible,true);
  s.time=2;projectBallsySlime(s,id=>objects.get(id));assert.equal(coat.visible,false);
  s.time=2.5;s.slowUntil=[4,4];projectBallsySlime(s,id=>objects.get(id));assert.equal(other.visible,true);
  projectBallsySlime(createBallsySlime(),id=>objects.get(id));assert.equal(coat.visible,false);assert.equal(other.visible,false);
  for(const object of objects.values()){object.geometry.dispose();object.material.dispose();}
});
