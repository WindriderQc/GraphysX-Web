import { assertInlineMesh, assertInlinePixels, assertMeshSceneBudget } from './inline-mesh.mjs';
import { buildInlineMesh } from './mesh-construction.mjs';
export const EDIT_LIMITS=Object.freeze({ ranges:64, rectangles:64 });
export const EDIT_FIELDS=Object.freeze(['positions','indices','normals','uvs']);
export const RANGE_FIELDS=Object.freeze(['start','values','delta']);
export const PIXEL_EDIT_FIELDS=Object.freeze(['x','y','width','height','rgba','materialIndex']);
function object(value,fields,label) {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!fields.includes(key))) throw new Error(`Invalid ${label} object or field`);
}
export function editInlineMesh(mesh,edits) {
  assertInlineMesh(mesh);object(edits,EDIT_FIELDS,'meshEdits');
  if(!Object.keys(edits).length) throw new Error('meshEdits must change an attribute');
  const next=structuredClone(mesh);let count=0;
  for(const [attribute,ranges] of Object.entries(edits)) {
    if(attribute==='normals'&&ranges==='recompute') {delete next.normals;continue;}
    if(!Array.isArray(ranges)||!ranges.length||!Array.isArray(next[attribute])) throw new Error(`meshEdits.${attribute} requires existing buffers and nonempty ranges`);
    const stride=attribute==='uvs'?2:3,occupied=new Set();
    for(const range of ranges) {
      object(range,RANGE_FIELDS,'mesh range');
      if((range.values!==undefined)===(range.delta!==undefined)||range.delta!==undefined&&attribute!=='positions') throw new Error('Choose tuple values, or a positions-only delta');
      const values=range.values??range.delta;
      if(++count>EDIT_LIMITS.ranges||!Number.isInteger(range.start)||range.start<0||!Array.isArray(values)||!values.length||values.length%stride||values.some(n=>!Number.isFinite(n))) throw new Error('Invalid mesh range start, tuple values or range budget');
      const start=range.start*stride;
      if(start+values.length>next[attribute].length) throw new Error('Mesh range exceeds the existing buffer');
      for(let i=0;i<values.length;i++) {if(occupied.has(start+i)) throw new Error('Mesh ranges must not overlap');occupied.add(start+i);if(!range.delta)next[attribute][start+i]=values[i];else if(values[i]!==0)next[attribute][start+i]+=values[i];}
    }
  }
  if((edits.positions||edits.indices)&&edits.normals===undefined) delete next.normals;
  assertInlineMesh(next);return next;
}
function editPixels(texture,rectangles) {
  if(texture?.id!=='inline') throw new Error('pixelEdits requires an existing inline texture');
  assertInlinePixels(texture.pixels);
  if(!Array.isArray(rectangles)||!rectangles.length||rectangles.length>EDIT_LIMITS.rectangles) throw new Error('pixelEdits requires 1 to 64 rectangles');
  const next=structuredClone(texture),occupied=new Set();
  for(const rect of rectangles) {
    object(rect,PIXEL_EDIT_FIELDS,'pixel rectangle');
    const {x,y,width,height,rgba}=rect;
    if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x+width>next.pixels.width||y+height>next.pixels.height) throw new Error('Pixel rectangle is outside the existing texture');
    assertInlinePixels({width,height,rgba});
    for(let row=0;row<height;row++) for(let col=0;col<width;col++) {
      const target=(y+row)*next.pixels.width+x+col;
      if(occupied.has(target)) throw new Error('Pixel rectangles must not overlap');occupied.add(target);
      next.pixels.rgba.splice(target*4,4,...rgba.slice((row*width+col)*4,(row*width+col+1)*4));
    }
  }
  return next;
}
// The persisted result contains buffers/pixels only. Commands retain their declarative intent.
export function materializeMeshCommand(command,entities) {
  if(command?.op==='spawn'&&command.meshBuild!==undefined) {
    if(command.entity?.type!=='mesh'||command.entity.mesh!==undefined) throw new Error('meshBuild requires a mesh spawn without competing buffers');
    const {meshBuild,...rest}=command;return {...rest,entity:{...command.entity,mesh:buildInlineMesh(meshBuild)}};
  }
  const patch=command?.op==='update'?command.patch:null;
  if(!patch||(!('meshBuild' in patch)&&!('meshEdits' in patch)&&!('pixelEdits' in patch))) return command;
  const entity=entities.find(e=>e.id===command.id);
  if(entity?.type!=='mesh'||!entity.mesh) throw new Error('Mesh authoring requires an existing mesh entity');
  if([patch.mesh,patch.meshBuild,patch.meshEdits].filter(value=>value!==undefined).length>1) throw new Error('Choose one of mesh, meshBuild or meshEdits');
  const {meshBuild,meshEdits,pixelEdits,...next}=patch;
  if(meshBuild!==undefined) next.mesh=buildInlineMesh(meshBuild);
  if(meshEdits!==undefined) next.mesh=editInlineMesh(entity.mesh,meshEdits);
  if(pixelEdits!==undefined) {
    if(patch.material?.texture!==undefined) throw new Error('pixelEdits and replacement texture are mutually exclusive');
    if(!Array.isArray(pixelEdits)||!pixelEdits.length||pixelEdits.length>EDIT_LIMITS.rectangles) throw new Error('pixelEdits requires 1 to 64 rectangles');
    const targets=new Map();
    for(const rect of pixelEdits) {
      object(rect,PIXEL_EDIT_FIELDS,'pixel rectangle');
      const slot=rect.materialIndex===undefined?'base':rect.materialIndex;
      if(rect.materialIndex!==undefined&&(!Number.isInteger(slot)||slot<0||!entity.mesh.materials?.[slot])) throw new Error('pixelEdits materialIndex must name an existing material slot');
      if(!targets.has(slot)) targets.set(slot,[]);targets.get(slot).push(rect);
    }
    for(const [slot,rectangles] of targets) {
      if(slot==='base') next.material={...patch.material,texture:editPixels(entity.material?.texture,rectangles)};
      else {
        if(patch.mesh!==undefined||meshBuild!==undefined) throw new Error('Material-slot pixel edits require an unchanged material layout');
        next.mesh??=structuredClone(entity.mesh);
        next.mesh.materials[slot].texture=editPixels(entity.mesh.materials[slot].texture,rectangles);
      }
    }
  }
  return {...command,patch:next};
}
export function materializeMeshCommands(commands,entities) {
  if(!commands.some(c=>c?.meshBuild!==undefined||c?.patch?.meshBuild!==undefined||c?.patch?.meshEdits!==undefined||c?.patch?.pixelEdits!==undefined)) return commands;
  const draft=entities.map(e=>({...e}));
  return commands.map(command=>{
    const next=materializeMeshCommand(command,draft);
    if(next?.op==='spawn') draft.push(next.entity);
    if(next?.op==='remove') {const index=draft.findIndex(e=>e.id===next.id);if(index>=0) draft.splice(index,1);}
    if(next?.op==='update') {
      const index=draft.findIndex(e=>e.id===next.id);
      if(index>=0) draft[index]={...draft[index],...next.patch,...(next.patch.material?{material:{...draft[index].material,...next.patch.material}}:{})};
    }
    assertMeshSceneBudget(draft);
    return next;
  });
}
