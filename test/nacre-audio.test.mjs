import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const root=new URL('../public/assets/quest3/audio/',import.meta.url);
test('NACRE ships audible, unclipped mono PCM sources with seamless loop boundaries',async()=>{
  const manifest=JSON.parse(await readFile(new URL('build.json',root),'utf8'));
  assert.equal(manifest.files.length,6);
  for(const file of manifest.files){
    const bytes=await readFile(new URL(file.name,root));
    assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WAVE');
    assert.equal(bytes.readUInt16LE(20),1);assert.equal(bytes.readUInt16LE(22),1);assert.equal(bytes.readUInt16LE(34),16);
    assert.equal(bytes.readUInt32LE(24),22050);assert.equal(bytes.readUInt32LE(40),bytes.length-44);
    assert.equal(bytes.length,44+Math.round(file.seconds*22050)*2);
    let sum=0,peak=0;for(let p=44;p<bytes.length;p+=2){const sample=bytes.readInt16LE(p)/32768;sum+=sample*sample;peak=Math.max(peak,Math.abs(sample));}
    assert.ok(Math.sqrt(sum/((bytes.length-44)/2))>.05,file.name+' is not silent');
    assert.ok(peak<.8,file.name+' has headroom');
    if(file.loop)assert.ok(Math.abs(bytes.readInt16LE(44)-bytes.readInt16LE(bytes.length-2))/32768<.08,file.name+' loop edge');
  }
});
test('the reactor has a measured 1.5 Hz womp envelope rather than a constant drone',async()=>{
  const bytes=await readFile(new URL('reactor-loop.wav',root)),power=[];
  const window=441;
  for(let frame=0;frame<400;frame++){
    let sum=0;for(let i=0;i<window;i++){const s=bytes.readInt16LE(44+2*(frame*window+i))/32768;sum+=s*s;}
    power.push(Math.sqrt(sum/window));
  }
  const magnitude=f=>{
    let real=0,imaginary=0;power.forEach((v,i)=>{const angle=2*Math.PI*f*(i+.5)*.02;real+=v*Math.cos(angle);imaginary+=v*Math.sin(angle);});
    return Math.hypot(real,imaginary);
  };
  assert.ok(magnitude(1.5)>3*Math.max(magnitude(1),magnitude(2)));
});
