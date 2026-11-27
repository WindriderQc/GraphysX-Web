import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Quaternion, Vector3 } from 'three';
import { NACRE, NacreMission } from '../src/nacre-mission.ts';

// A command port, not a second game implementation. Browser reception exercises the
// same controller against the real World API, native geometry and XR input spaces.
function fixture(){
  const entities=new Map(),objects=new Map(),listeners=new Set(),interactions=[],refusals=[];
  const ids=[NACRE.state,NACRE.cell,NACRE.socket,'nacre-reactor-core','nacre-reactor-light','nacre-control','nacre-reactor-particles',
    'nacre-door-left','nacre-door-right','nacre-charge-sound','nacre-reactor-sound','nacre-door-sound','nacre-window-chime','nacre-station','nacre-planet','nacre-clouds',
    ...Array.from({length:4},(_,i)=>'nacre-reactor-ring-'+i),...Array.from({length:3},(_,i)=>'nacre-gyro-'+i),
    ...['port','starboard'].flatMap(side=>[2,8,14,21].map(z=>'nacre-luminaire-'+side+'-'+z))];
  for(const id of ids){entities.set(id,{id,tags:[],behaviors:[],material:{},sound:{}});objects.set(id,new Group());}
  entities.get(NACRE.state).tags=['nacre','mission','phase:standby','started:0'];
  objects.get(NACRE.cell).position.fromArray(NACRE.home);
  let seconds=0;
  const api={
    export(){return{entities:[...entities.values()].map(e=>structuredClone(e))};},
    create(saved){entities.clear();for(const e of saved.entities)entities.set(e.id,structuredClone(e));seconds=0;listeners.forEach(f=>f({type:'world.loaded'}));return{ok:true};},
    query({ids}){return ids.map(id=>entities.get(id)).filter(Boolean);},
    transaction(commands){
      const refusal = refusals.find(rule => rule.remaining > 0 && rule.matches(commands));
      if (refusal) {
        refusal.remaining--;
        return { ok: false, error: 'Injected NACRE transaction refusal' };
      }
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
    getEntityTags:id=>entities.get(id)?.tags,
    applyHostPoses(poses){for(const pose of poses){objects.get(pose.id).position.fromArray(pose.position);objects.get(pose.id).quaternion.fromArray(pose.quaternion);}return poses.length;},
    subscribeEvents(callback){listeners.add(callback);return()=>listeners.delete(callback);},
  };
  const mission=new NacreMission(world,api);
  return{mission,entities,objects,interactions,advance(value){seconds+=value;mission.tick();},
    refuse(matches, remaining = 1) { refusals.push({ matches, remaining }); },
    load(){seconds=0;listeners.forEach(f=>f({type:'world.loaded'}));mission.tick();},
    dock(){mission.begin();mission.take('right');mission.move('right',new Vector3(...NACRE.dock),new Quaternion());mission.release('right');},
  };
}

const changesPhase = phase => commands => commands.some(command =>
  command.id === NACRE.state && command.patch?.tags?.includes('phase:' + phase));
const loops = ({ entities }) => ['charge', 'reactor', 'door'].filter(name => entities.get(`nacre-${name}-sound`).sound.autoplay);

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

test('NACRE fractional clocks reach the exact half-charge stage and final boundary',()=>{
  const f=fixture();f.advance(1.2345678);f.dock();f.mission.activate();f.mission.tick();
  f.advance(1.21);f.advance(1.19);
  assert.ok(f.entities.get('nacre-reactor-light').intensity>2,'half charge must advance beyond the first quarter stage');
  f.advance(2.4);assert.equal(f.mission.phase,'opening');f.mission.dispose();
});

test('NACRE reapplies a refused charge stage before advancing to a later stage', () => {
  const f = fixture();
  f.dock();
  f.mission.activate();
  f.advance(.6);
  const light = f.entities.get('nacre-reactor-light');
  const previous = light.intensity;
  f.refuse(commands => commands.some(command => command.id === 'nacre-reactor-light'));
  f.advance(.66);
  assert.equal(light.intensity, previous);
  assert.deepEqual(loops(f), ['charge']);
  f.advance(.1);
  assert.ok(light.intensity > previous, 'retry the rejected stage while still in the same quarter');
  assert.equal(f.mission.phase, 'charging');
});

test('NACRE retries opening and commits the final door pose before announcing the belvedere', () => {
  const f = fixture();
  f.dock();
  f.mission.activate();
  f.advance(0);
  f.refuse(changesPhase('opening'));
  f.advance(NACRE.chargeSeconds);
  assert.equal(f.mission.phase, 'charging');
  assert.deepEqual(loops(f), ['charge']);
  assert.equal(f.entities.get('nacre-door-left').behaviors.length, 0);
  f.advance(.02);
  assert.equal(f.mission.phase, 'opening');
  assert.deepEqual(loops(f), ['reactor', 'door']);
  assert.equal(f.entities.get('nacre-door-left').behaviors[0].startSeconds, NACRE.chargeSeconds + .02);
  f.refuse(changesPhase('ready'));
  f.advance(NACRE.doorSeconds);
  assert.equal(f.mission.phase, 'opening');
  assert.doesNotMatch(f.mission.notice, /Belvédère ouvert/);
  assert.equal(f.entities.get('nacre-door-left').behaviors.length, 1);
  assert.deepEqual(loops(f), ['reactor', 'door']);
  f.advance(.02);
  assert.equal(f.mission.phase, 'ready');
  assert.deepEqual(f.objects.get('nacre-door-left').position.toArray(), [-9.5, 3, -21.5]);
  assert.deepEqual(f.objects.get('nacre-door-right').position.toArray(), [9.5, 3, -21.5]);
  assert.match(f.mission.notice, /Belvédère ouvert/);
  assert.deepEqual(loops(f), ['reactor']);
});

test('NACRE does not cache a rejected audio update', () => {
  const f = fixture();
  f.dock();
  f.mission.activate();
  f.advance(0);
  assert.deepEqual(loops(f), ['charge']);
  f.refuse(commands => commands.some(command => command.patch?.sound?.autoplay === false));
  f.mission.setAudible(false);
  assert.deepEqual(loops(f), ['charge']);
  f.advance(.02);
  assert.deepEqual(loops(f), []);
  f.mission.setAudible(true);
  assert.deepEqual(loops(f), ['charge']);
});

test('NACRE waits for a player retry after two refused door commits', () => {
  const f = fixture();
  f.dock();
  f.mission.activate();
  f.advance(NACRE.chargeSeconds);
  f.refuse(changesPhase('ready'), 2);
  f.advance(NACRE.doorSeconds);
  assert.equal(f.mission.needsRetry, false);
  f.advance(.02);
  assert.equal(f.mission.needsRetry, true);
  f.advance(1);
  assert.equal(f.mission.phase, 'opening');
  assert.doesNotMatch(f.mission.notice, /Belvédère ouvert/);
  assert.deepEqual(loops(f), ['reactor', 'door']);
  assert.equal(f.mission.activate(), true);
  assert.equal(f.mission.needsRetry, false);
  assert.equal(f.mission.phase, 'ready');
  assert.match(f.mission.notice, /Belvédère ouvert/);
  assert.deepEqual(loops(f), ['reactor']);
});

test('NACRE drops a pending charge stage when restoring a saved world', () => {
  const f = fixture();
  f.dock();
  f.mission.activate();
  f.refuse(commands => commands.some(command => command.id === 'nacre-reactor-light'));
  f.advance(.6);
  f.refuse(changesPhase('docked'));
  f.load();
  assert.equal(f.mission.phase, 'charging');
  f.advance(.02);
  assert.equal(f.mission.phase, 'docked');
  assert.equal(f.entities.get('nacre-reactor-light').intensity, 0);
  assert.deepEqual(loops(f), []);
});

test('NACRE upgrades the first mission planet URL while preserving original and custom stations',()=>{
  const f=fixture(),planet=()=>f.entities.get('nacre-planet');
  planet().asset={format:'gltf',url:'/assets/quest3/planet.glb',fitSize:36};f.mission.begin();f.load();
  assert.equal(planet().asset.url,NACRE.planetModel);assert.equal(planet().asset.fitSize,36);assert.equal(f.mission.phase,'cell');
  planet().asset.url='/assets/custom-earth.glb';f.load();assert.equal(planet().asset.url,'/assets/custom-earth.glb');
  planet().asset.url='/assets/quest3/planet.glb';f.entities.delete(NACRE.state);f.load();
  assert.equal(planet().asset.url,'/assets/quest3/planet.glb');assert.equal(f.mission.phase,null);f.mission.dispose();
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
