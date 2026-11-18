// Original, deterministic mono effects. The World AudioLayer supplies HRTF panning.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const output=fileURLToPath(new URL('../public/assets/quest3/audio/',import.meta.url));
await mkdir(output,{recursive:true});
const rate=22050,tau=Math.PI*2,manifest=[];
async function wave(name,seconds,sample,loop=false){
  const count=Math.round(rate*seconds),values=new Float64Array(count);let peak=0,sum=0;
  for(let i=0;i<count;i++){values[i]=sample(i/rate);peak=Math.max(peak,Math.abs(values[i]));}
  const gain=.78/Math.max(peak,.001),bytes=Buffer.alloc(44+count*2);
  bytes.write('RIFF',0);bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);
  bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(rate,24);bytes.writeUInt32LE(rate*2,28);
  bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(count*2,40);
  for(let i=0;i<count;i++){const value=values[i]*gain;sum+=value*value;bytes.writeInt16LE(Math.round(value*32767),44+i*2);}
  await writeFile(path.join(output,name),bytes);
  manifest.push({name,seconds,sampleRate:rate,channels:1,loop,peak:.78,rms:Math.sqrt(sum/count),bytes:bytes.length});
}
const envelope=(t,d)=>Math.sin(Math.PI*Math.min(1,t/d))**2;
await wave('pickup.wav',.24,t=>envelope(t,.24)*(Math.sin(tau*(650*t+620*t*t))+.18*Math.sin(tau*1950*t)));
await wave('latch.wav',.42,t=>envelope(t,.42)*(Math.sin(tau*110*t)*Math.exp(-t*10)+.35*Math.sin(tau*880*t)+.16*Math.sin(tau*1320*t)));
await wave('success.wav',1.2,t=>[440,554.365,659.255].reduce((sum,f,i)=>{const a=t-i*.14;return a<0?sum:sum+Math.sin(tau*f*a)*Math.sin(Math.PI*Math.min(1,a/.025)/2)*Math.exp(-a*5);},0));
await wave('charge-loop.wav',2,t=>{
  const pulse=.28+.72*((1+Math.sin(tau*3*t))/2)**3;
  return pulse*(.55*Math.sin(tau*60*t+1.2*Math.sin(tau*.5*t))+.25*Math.sin(tau*180*t)+.12*Math.sin(tau*360*t));
},true);
await wave('reactor-loop.wav',8,t=>{
  const pulse=.22+.78*((1+Math.sin(tau*1.5*t))/2)**3;
  return pulse*(.6*Math.sin(tau*44*t+.55*Math.sin(tau*.5*t))+.22*Math.sin(tau*132*t)+.1*Math.sin(tau*264*t)+.06*Math.sin(tau*528*t));
},true);
await wave('door-loop.wav',1.6,t=>{
  const gears=.7+.3*Math.sin(tau*7.5*t);
  return gears*(.5*Math.sin(tau*75*t)+.22*Math.sin(tau*125*t)+.1*Math.sin(tau*330*t));
},true);
await writeFile(path.join(output,'build.json'),JSON.stringify({generator:'scripts/build-nacre-audio.mjs',provenance:'Original synthesized audio created for GraphysX; repository owner retains ownership',files:manifest},null,2)+'\n');
console.log(JSON.stringify(manifest));
