import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Quaternion, Vector3 } from 'three';
import { NACRE, NacreMission } from '../src/nacre-mission.ts';

// A command port, not a second game implementation. Browser reception exercises the
// same controller against the real World API, native geometry and XR input spaces.
function fixture(){
  const entities=new Map(),objects=new Map(),listeners=new Set(),interactions=[];
  const ids=[NACRE.state,NACRE.cell,NACRE.socket,'nacre-reactor-core','nacre-reactor-light','nacre-control','nacre-reactor-particles',
    'nacre-door-left','nacre-door-right','nacre-charge-sound','nacre-reactor-sound','nacre-door-sound','nacre-window-chime','nacre-station',
    ...Array.from({length:4},(_,i)=>'nacre-reactor-ring-'+i),...Array.from({length:3},(_,i)=>'nacre-gyro-'+i),
    ...['port','starboard'].flatMap(side=>[2,8,14,21].map(z=>'nacre-luminaire-'+side+'-'+z))];
  for(const id of ids){entities.set(id,{id,tags:[],behaviors:[],material:{},sound:{}});objects.set(id,new Group());}
  entities.get(NACRE.state).tags=['nacre','mission','phase:standby','started:0'];
  objects.get(NACRE.cell).position.fromArray(NACRE.home);
  let seconds=0;
  const api={
    query({ids}){return ids.map(id=>entities.get(id)).filter(Boolean);},
    transaction(commands){
      if(commands.some(c=>!entities.has(c.id)))return{ok:false,error:'Unknown entity'};
      for(const c of commands){
        const entity=entities.get(c.id),object=objects.get(c.id);
        if(c.op==='update'){
          const p=c.patch;
          for(const key of ['material','sound','emitter'])if(p[key])entity[key]={...entity[key],...p[key]};
          for(const key of ['tags','visible','intensity'])if(p[key]!==undefined)entity[key]=structuredClone(p[key]);
          if(p.transform?.position)object.position.fromArray(p.transform.position);
          if(p.transform?.rotationDegrees)object.rotation.set(...p.transform.rotationDegrees.map(v=>v*Math.PI/180));
        }else if(c.op==='attach-behavior')entity.behaviors.push(structuredClone(c.behavior));
        else if(c.op==='detach-behavior')entity.behaviors=entity.behaviors.filter(b=>b.id!==c.behaviorId);
      }
      return{ok:true,value:[]};
    },
    interact(id,interactionId){interactions.push({id,interactionId});return{ok:true};},
  };
  const world={
    getElapsedSeconds:()=>seconds,getEntityObject:id=>objects.get(id),
    applyHostPoses(poses){for(const pose of poses){objects.get(pose.id).position.fromArray(pose.position);objects.get(pose.id).quaternion.fromArray(pose.quaternion);}return poses.length;},
    subscribeEvents(callback){listeners.add(callback);return()=>listeners.delete(callback);},
  };
  const mission=new NacreMission(world,api);
  return{mission,entities,objects,interactions,advance(value){seconds+=value;mission.tick();},
    load(){seconds=0;listeners.forEach(f=>f({type:'world.loaded'}));mission.tick();},
    dock(){mission.begin();mission.take('right');mission.move('right',new Vector3(...NACRE.dock),new Quaternion());mission.release('right');},
  };
}

test('NACRE guards progression, input ownership and a real socket-distance release',()=>{
  const f=fixture(),m=f.mission;
  assert.equal(m.activate(),false);assert.equal(m.take('right'),false);
  assert.equal(m.begin(),true);assert.equal(m.take(''),false);assert.equal(m.take('right'),true);
  assert.equal(m.take('left'),false);assert.equal(m.release('left'),false);
  assert.equal(m.move('left',new Vector3(...NACRE.dock),new Quaternion()),false);
  assert.equal(m.move('right',new Vector3(NaN,1,0),new Quaternion()),false);
  assert.equal(m.move('right',new Vector3(...NACRE.dock),new Quaternion()),true);
  assert.equal(m.release('right'),true);assert.equal(m.phase,'docked');assert.equal(m.holding,false);
  assert.deepEqual(f.objects.get(NACRE.cell).position.toArray(),NACRE.dock);
  assert.deepEqual(f.interactions.map(i=>i.interactionId),['pickup','latch']);
  m.dispose();
});
test('NACRE tracking cancellation cannot accidentally latch a nearby cell; a miss returns safely',()=>{
  const f=fixture(),m=f.mission;m.begin();m.take('right');
  m.move('right',new Vector3(...NACRE.dock),new Quaternion());m.release('right',true);
  assert.equal(m.phase,'cell');assert.deepEqual(f.objects.get(NACRE.cell).position.toArray(),NACRE.home);
  assert.equal(f.interactions.some(i=>i.interactionId==='latch'),false);
  m.take('left');m.move('left',new Vector3(4,1,-4),new Quaternion());m.release('left');
  assert.equal(m.phase,'cell');assert.deepEqual(f.objects.get(NACRE.cell).position.toArray(),NACRE.home);m.dispose();
});
test('NACRE charge, native door tracks, positional loops and completion follow the simulation clock',()=>{
  const f=fixture(),m=f.mission;f.dock();assert.equal(m.activate(),true);assert.equal(m.activate(),false);
  m.tick();assert.equal(m.phase,'charging');assert.equal(m.progress,0);
  assert.equal(f.entities.get('nacre-charge-sound').sound.autoplay,true);
  assert.equal(f.entities.get('nacre-reactor-sound').sound.autoplay,false);
  f.advance(2.4);assert.equal(m.progress,.5);assert.ok(f.entities.get('nacre-reactor-core').material.emissiveIntensity>.5);
  f.advance(2.4);assert.equal(m.phase,'opening');
  assert.equal(f.entities.get('nacre-door-left').behaviors[0].type,'keyframes');
  assert.equal(f.entities.get('nacre-door-sound').sound.autoplay,true);
  f.advance(3.3);assert.equal(m.phase,'ready');assert.equal(m.progress,1);
  assert.deepEqual(f.objects.get('nacre-door-left').position.toArray(),[-9.5,3,-21.5]);
  assert.equal(f.entities.get('nacre-door-sound').sound.autoplay,false);
  assert.equal(f.entities.get('nacre-reactor-sound').sound.autoplay,true);
  assert.equal(m.complete(new Vector3(0,1,0)),false);assert.equal(m.complete(new Vector3(NaN,0,0)),false);
  assert.equal(m.complete(new Vector3(...NACRE.destination)),true);assert.equal(m.phase,'complete');
  assert.equal(m.complete(new Vector3(...NACRE.destination)),false);m.dispose();
});
test('NACRE mute and hidden-session audio gating preserve mission progress',()=>{
  const f=fixture(),m=f.mission;f.dock();m.activate();f.advance(4.8);f.advance(3.3);
  m.toggleMute();assert.equal(m.muted,true);assert.equal(f.entities.get('nacre-reactor-sound').sound.autoplay,false);
  m.toggleMute();assert.equal(f.entities.get('nacre-reactor-sound').sound.autoplay,true);
  m.setAudible(false);assert.equal(f.entities.get('nacre-reactor-sound').sound.autoplay,false);
  m.setAudible(true);assert.equal(f.entities.get('nacre-reactor-sound').sound.autoplay,true);assert.equal(m.phase,'ready');m.dispose();
});
test('NACRE reload restores stable checkpoints, not stale tracking or absolute animation time',()=>{
  const f=fixture(),m=f.mission;m.begin();m.take('right');f.load();
  assert.equal(m.phase,'cell');assert.equal(m.holding,false);
  m.take('right');m.move('right',new Vector3(...NACRE.dock),new Quaternion());m.release('right');m.activate();
  f.advance(2);f.load();assert.equal(m.phase,'docked');assert.equal(f.entities.get('nacre-charge-sound').sound.autoplay,false);
  m.activate();f.advance(4.8);assert.equal(m.phase,'opening');f.load();assert.equal(m.phase,'ready');
  assert.deepEqual(f.objects.get('nacre-door-right').position.toArray(),[9.5,3,-21.5]);
  f.entities.get('nacre-station').material.color='#123456';m.reset();assert.equal(m.phase,'cell');
  assert.equal(f.entities.get('nacre-station').material.color,'#123456');
  assert.equal(f.entities.get('nacre-reactor-sound').sound.autoplay,false);m.dispose();
});
