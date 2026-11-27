// Offline, bounded DirectX X decoding. Microsoft token-record/binary-data contracts:
// https://learn.microsoft.com/en-us/windows/win32/direct3d9/token-records
// https://learn.microsoft.com/en-us/windows/win32/direct3d9/dx9-graphics-reference-x-file-binaryencoding-data
import assert from 'node:assert/strict';
const IDENTITY=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const multiply=(a,b)=>Array.from({length:16},(_,i)=>{const r=i>>2,c=i%4;return a[r*4]*b[c]+a[r*4+1]*b[4+c]+a[r*4+2]*b[8+c]+a[r*4+3]*b[12+c];});
const point=(m,x,y,z)=>[x*m[0]+y*m[4]+z*m[8]+m[12],x*m[1]+y*m[5]+z*m[9]+m[13],x*m[2]+y*m[6]+z*m[10]+m[14]].map(n=>Math.round(n*1e6)/1e6);

export function binaryXTokens(bytes) {
 assert.ok(Buffer.isBuffer(bytes)&&bytes.length>=16&&bytes.length<=16*1024*1024,'Invalid X file size');
 assert.match(bytes.toString('ascii',0,16),/^xof 030[23]bin 00(?:32|64)$/,'Unsupported binary X header');
 const floatBytes=bytes.toString('ascii',12,16)==='0064'?8:4,tokens=[];let offset=16;
 const span=n=>{assert.ok(Number.isSafeInteger(n)&&n>=0&&offset+n<=bytes.length,'Truncated X record');};
 const u32=()=>{span(4);const v=bytes.readUInt32LE(offset);offset+=4;return v;};
 const word=(value)=>tokens.push({kind:'word',value});
 const punctuation=new Map([[10,'open'],[11,'close']]);
 const primitives=new Map([[31,'template'],[40,'WORD'],[41,'DWORD'],[42,'FLOAT'],[43,'DOUBLE'],[44,'CHAR'],[45,'UCHAR'],[46,'SWORD'],[47,'SDWORD'],[48,'VOID'],[49,'LPSTR'],[50,'UNICODE'],[51,'CSTRING'],[52,'array']]);
 while(offset<bytes.length){
  span(2);const code=bytes.readUInt16LE(offset);offset+=2;
  if(code===1||code===2){const count=u32();assert.ok(count<=1024*1024,'X name/string is too long');span(count);const value=bytes.toString('latin1',offset,offset+count).replace(/\0$/,'');offset+=count;tokens.push({kind:code===1?'word':'string',value});
   if(code===2){span(2);const end=bytes.readUInt16LE(offset);assert.ok(end===19||end===20,'X string has no delimiter');offset+=2;
    // Some exporters use the documented DWORD terminator; others emit the usual WORD.
    if(offset+2<=bytes.length&&bytes.readUInt16LE(offset)===0)offset+=2;
   }
  }else if(code===3)tokens.push({kind:'number',value:u32()});
  else if(code===5){span(16);offset+=16;}
  else if(code===6||code===7){const count=u32(),width=code===6?4:floatBytes;assert.ok(count<=1e6,'X number list is too large');span(count*width);
   for(let i=0;i<count;i++){const value=code===6?bytes.readUInt32LE(offset):width===4?bytes.readFloatLE(offset):bytes.readDoubleLE(offset);assert.ok(Number.isFinite(value),'Non-finite X number');tokens.push({kind:'number',value});offset+=width;}
  }else if(punctuation.has(code))tokens.push({kind:punctuation.get(code)});
  else if(primitives.has(code))word(primitives.get(code));
  else assert.ok(code>=12&&code<=20,`Unsupported X token ${code} at ${offset-2}`);
  assert.ok(tokens.length<=2e6,'Too many X tokens');
 }
 return tokens;
}

export function binaryXObjects(bytes) {
 const tokens=binaryXTokens(bytes);let index=0;
 const parse=(depth=0)=>{
  assert.ok(depth<128,'X hierarchy is too deep');
  if(tokens[index]?.kind==='open'){
   index++;const name=tokens[index++];assert.equal(name?.kind,'word','Invalid X material reference');assert.equal(tokens[index++]?.kind,'close','Unclosed X reference');return {type:'reference',name:name.value,values:[],children:[]};
  }
  const type=tokens[index++];assert.equal(type?.kind,'word','X object type missing');
  const name=tokens[index]?.kind==='word'?tokens[index++].value:null;
  assert.equal(tokens[index++]?.kind,'open',`X ${type.value} has no opening brace`);
  const node={type:type.value,name,values:[],children:[]};
  if(type.value==='template'){
   let balance=1;while(balance&&index<tokens.length){const token=tokens[index++];if(token.kind==='open')balance++;if(token.kind==='close')balance--;}
   assert.equal(balance,0,'Unclosed X template');return node;
  }
  while(index<tokens.length&&tokens[index].kind!=='close'){
   const token=tokens[index];
   if(token.kind==='open'||token.kind==='word'&&(tokens[index+1]?.kind==='open'||tokens[index+1]?.kind==='word'&&tokens[index+2]?.kind==='open'))node.children.push(parse(depth+1));
   else {assert.ok(token.kind==='number'||token.kind==='string',`Unsupported data in X ${type.value}`);node.values.push(token.value);index++;}
  }
  assert.equal(tokens[index++]?.kind,'close',`Unclosed X ${type.value}`);return node;
 };
 const objects=[];while(index<tokens.length)objects.push(parse());return objects;
}

/** Retain native left-handed coordinates, just like the existing text-X payloads. */
export function decodeBinaryX(bytes,{textureUrl=name=>{throw new Error('Unbound X texture '+name);}}={}) {
 const objects=binaryXObjects(bytes),materials=new Map(),meshes=[],evidence=[];
 const material=node=>{
  assert.ok(node?.type==='Material'&&node.values.length===11,'Invalid X Material values');
  const tex=node.children.find(n=>n.type==='TextureFilename');
  const textureName=tex?.values[0]?.split(/[\\/]/).at(-1)??null;
  return {name:node.name??'material',color:node.values.slice(0,4),specularPower:node.values[4],specular:node.values.slice(5,8),emissive:node.values.slice(8,11),textureName,textureUrl:textureName?textureUrl(textureName):null};
 };
 const collect=node=>{if(node.type==='Material'&&node.name)materials.set(node.name,material(node));node.children.forEach(collect);};objects.forEach(collect);
 const mesh=(node,world)=>{
  let cursor=0;const take=n=>{assert.ok(Number.isInteger(n)&&n>=0&&cursor+n<=node.values.length,'Truncated X mesh data');const result=node.values.slice(cursor,cursor+n);cursor+=n;assert.ok(result.every(Number.isFinite),'Invalid X mesh number');return result;};
  const vertexCount=take(1)[0];assert.ok(vertexCount>0&&vertexCount<=1e6,'Invalid X vertex count');
  const raw=take(vertexCount*3),faceCount=take(1)[0];assert.ok(faceCount>0&&faceCount<=1e6,'Invalid X face count');const faces=[];
  for(let f=0;f<faceCount;f++){const n=take(1)[0];assert.ok(n>=3&&n<=1024,'Invalid X polygon');const indices=take(n);assert.ok(indices.every(i=>Number.isInteger(i)&&i>=0&&i<vertexCount),'Invalid X face index');faces.push(indices);}
  assert.equal(cursor,node.values.length,'Unexpected trailing X mesh numbers');
  const uvNode=node.children.find(n=>n.type==='MeshTextureCoords');let uvs=null;
  if(uvNode){assert.equal(uvNode.values[0],vertexCount);assert.equal(uvNode.values.length,1+vertexCount*2);uvs=uvNode.values.slice(1).map((value,i)=>Math.round((i%2?1-value:value)*1e6)/1e6);}
  const materialList=node.children.find(n=>n.type==='MeshMaterialList');let faceMaterials=faces.map(()=>0),list=[{name:'default',color:[.7,.7,.7,1],specularPower:0,specular:[0,0,0],emissive:[0,0,0],textureName:null,textureUrl:null}];
  if(materialList){const [count,entries,...indexes]=materialList.values;assert.equal(entries,faceCount);assert.equal(indexes.length,faceCount);assert.ok(count>0&&count<=256);faceMaterials=indexes;
   list=materialList.children.map(n=>n.type==='reference'?materials.get(n.name):material(n));assert.equal(list.length,count);assert.ok(list.every(Boolean),'Unresolved X material reference');assert.ok(indexes.every(i=>Number.isInteger(i)&&i>=0&&i<count),'Invalid X material index');
  }
  const indices=[],groups=[];
  for(let m=0;m<list.length;m++){const start=indices.length;for(let f=0;f<faceCount;f++)if(faceMaterials[f]===m){const face=faces[f];for(let k=1;k<face.length-1;k++)indices.push(face[0],face[k+1],face[k]);}if(indices.length>start)groups.push({start,count:indices.length-start,materialIndex:m});}
  const positions=[];for(let i=0;i<raw.length;i+=3)positions.push(...point(world,raw[i],raw[i+1],raw[i+2]));
  meshes.push({name:node.name??'mesh',vertexCount,faceCount,triangleCount:indices.length/3,positions,uvs,indices,groups,materials:list});
 };
 const walk=(node,parent)=>{
  let world=parent;if(node.type==='Frame'){const transform=node.children.find(n=>n.type==='FrameTransformMatrix');if(transform){assert.equal(transform.values.length,16);world=multiply(transform.values,parent);}}
  if(node.type==='Mesh')mesh(node,world);
  if(['SkinWeights','AnimationSet'].includes(node.type))evidence.push({type:node.type,name:node.name,values:node.values.length});
  node.children.forEach(child=>walk(child,world));
 };objects.forEach(node=>walk(node,IDENTITY));assert.ok(meshes.length,'Binary X contains no mesh');
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const mesh of meshes)for(let i=0;i<mesh.positions.length;i++){
  const a=i%3;min[a]=Math.min(min[a],mesh.positions[i]);max[a]=Math.max(max[a],mesh.positions[i]);
 }
 return {format:'graphysx-mesh-json',bounds:{min,max,size:max.map((v,i)=>v-min[i])},meshCount:meshes.length,vertexCount:meshes.reduce((n,m)=>n+m.vertexCount,0),faceCount:meshes.reduce((n,m)=>n+m.faceCount,0),triangleCount:meshes.reduce((n,m)=>n+m.triangleCount,0),materialGroupCount:meshes.reduce((n,m)=>n+m.groups.length,0),normals:'computed by the shared renderer after native Z reflection',meshes,evidence};
}
