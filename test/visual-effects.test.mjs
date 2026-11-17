import test from 'node:test';
import assert from 'node:assert/strict';
import { AdditiveBlending, MeshStandardMaterial, NormalBlending } from 'three';
import { applyEnergyShader, updateEnergyShader } from '../src/energy-material.ts';
import { validateEnergyShader, validateModulateBehavior } from '../server/visual-effects.mjs';
import { applyCommands, validateStoredSceneDefinition } from '../server/scene-commands.mjs';
import { buildWorldVocabulary } from '../server/world-vocabulary.mjs';

const shader={id:'energy',rimColor:'#53dfff',rimOpacity:true,flowStrength:.8};
const behavior={id:'breath',type:'modulate',property:'emissiveIntensity',minimumFactor:.7,maximumFactor:1.3,frequencyHz:1.5};
const world=()=>({schema:'graphysx.agent-world/v2',id:'visuals',label:'Visuals',entities:[{id:'core',type:'sphere',material:{emissiveIntensity:2,shader},behaviors:[behavior]}]});

test('energy and modulation survive canonical authoring, JSON storage and removal',()=>{
  let definition=world();validateStoredSceneDefinition(definition);
  ({definition}=applyCommands(definition,[{op:'update',id:'core',patch:{material:{shader:{id:'energy',flowSpeed:-.4}}}}]));
  const saved=JSON.parse(JSON.stringify(definition));validateStoredSceneDefinition(saved);
  assert.deepEqual(saved.entities[0].material.shader,{id:'energy',flowSpeed:-.4});
  assert.deepEqual(saved.entities[0].behaviors,[behavior]);
  ({definition}=applyCommands(saved,[{op:'detach-behavior',id:'core',behaviorId:'breath'},{op:'update',id:'core',patch:{material:{shader:null}}}]));
  assert.equal(definition.entities[0].material.shader,null);
  assert.deepEqual(definition.entities[0].behaviors,[]);
  assert.equal(definition.entities[0].material.emissiveIntensity,2);
});

test('visual modulation is valid on dynamic bodies without granting transform motion',()=>{
  const definition=world();definition.entities[0].physics={mode:'dynamic'};
  assert.doesNotThrow(()=>validateStoredSceneDefinition(definition));
  definition.entities[0].behaviors.push({id:'spin',type:'spin'});
  assert.throws(()=>validateStoredSceneDefinition(definition),/kinematic/);
});

test('runtime and storage share bounded energy validation',()=>{
  for(const bad of [{flowSpeed:Infinity},{flowScale:0},{flowScale:65},{rimPower:0},{rimIntensity:9},{flowStrength:5},{rimOpacity:1},{rimColor:'invalid'},{blend:'screen'},{unknown:true}]){
    const value={...shader,...bad};
    assert.throws(()=>validateEnergyShader(value));
    const definition=world();definition.entities[0].material.shader=value;
    assert.throws(()=>validateStoredSceneDefinition(definition));
  }
  for(const value of [{id:'energy'},{id:'energy',flowStrength:0,flowSpeed:-8,rimPower:.25}])assert.doesNotThrow(()=>validateEnergyShader(value));
});

test('runtime and storage reject inverted, non-finite and unbounded modulation',()=>{
  for(const bad of [{property:'opacity'},{minimumFactor:2,maximumFactor:1},{minimumFactor:-1},{maximumFactor:5},{frequencyHz:9},{phaseDegrees:NaN},{startSeconds:-1},{unexpected:1}]){
    const value={...behavior,...bad};assert.throws(()=>validateModulateBehavior(value));
    const definition=world();definition.entities[0].behaviors=[value];assert.throws(()=>validateStoredSceneDefinition(definition));
  }
});

test('energy uniforms follow simulation time and preserve authored PBR properties',()=>{
  const material=new MeshStandardMaterial({metalness:.4,roughness:.3,emissiveIntensity:2});
  applyEnergyShader(material,shader);updateEnergyShader(material,12.25);
  const flowKey=material.customProgramCacheKey();
  assert.equal(material.userData.graphysxEnergyUniforms.gxEnergyTime.value,12.25);
  assert.equal(material.userData.graphysxEnergyUniforms.gxEnergyGain.value,2);
  assert.equal(material.transparent,true);assert.equal(material.depthWrite,false);
  applyEnergyShader(material,{...shader,blend:'additive'});assert.equal(material.blending,AdditiveBlending);
  material.emissiveIntensity=.5;updateEnergyShader(material,12.25);
  assert.equal(material.userData.graphysxEnergyUniforms.gxEnergyGain.value,.5);
  assert.equal(material.metalness,.4);assert.equal(material.roughness,.3);
  applyEnergyShader(material,{id:'energy',flowStrength:0});
  assert.notEqual(material.customProgramCacheKey(),flowKey,'static rims and moving energy need distinct compiled programs');
  assert.equal(material.userData.graphysxEnergyUniforms.gxEnergyTime.value,12.25);
  assert.equal(material.transparent,false);assert.equal(material.depthWrite,true);
  assert.equal(material.blending,NormalBlending);
  applyEnergyShader(material,null);assert.equal(material.userData.graphysxEnergyUniforms,undefined);
  assert.equal(material.customProgramCacheKey(),'');material.dispose();
});

test('published vocabulary teaches the accepted visual fields and their bounds',()=>{
  const vocabulary=buildWorldVocabulary();
  assert.ok(vocabulary.fields.energyShader.some(f=>f.name==='flowSpeed'&&f.range?.[0]===-8));
  assert.ok(vocabulary.behaviors.modulate.fields.includes('startSeconds'));
  assert.equal(vocabulary.limits.modulate.frequencyHz[1],8);
});

test('a cached compiled shader keeps live uniform bindings across material reconfiguration',()=>{
  const material=new MeshStandardMaterial({emissiveIntensity:.08});
  applyEnergyShader(material,{id:'energy'});
  const compiled={uniforms:{},vertexShader:'void main() {\n#include <project_vertex>\n}',fragmentShader:'void main() {\n#include <emissivemap_fragment>\n}'};
  material.onBeforeCompile(compiled,{});
  const binding=compiled.uniforms.gxEnergyGain,colour=compiled.uniforms.gxEnergyRimColor;
  material.emissiveIntensity=1.2;
  applyEnergyShader(material,{id:'energy',rimColor:'#ff8844',rimPower:5,flowSpeed:1.7});
  updateEnergyShader(material,8);
  assert.equal(compiled.uniforms.gxEnergyGain,binding);
  assert.equal(binding.value,1.2);
  assert.equal(compiled.uniforms.gxEnergyRimColor,colour);
  assert.equal(colour.value.getHexString(),'ff8844');
  assert.equal(compiled.uniforms.gxEnergyRimPower.value,5);
  assert.equal(compiled.uniforms.gxEnergyFlowSpeed.value,1.7);
  material.dispose();
});
