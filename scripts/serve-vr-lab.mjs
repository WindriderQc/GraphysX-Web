// Read-only, loopback-only preview of the already built workshop. No API/agent relays.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './static-server.mjs';
const root=fileURLToPath(new URL('../dist/',import.meta.url));
const port=Number(process.env.VR_LAB_PORT ?? 4317);
const hours=Number(process.env.VR_LAB_HOURS ?? 12);
if(!Number.isInteger(port) || port<0 || port>65535)throw Error('VR_LAB_PORT must be an integer from 0 to 65535.');
if(!Number.isFinite(hours) || hours<=0 || hours>24)throw Error('VR_LAB_HOURS must be greater than zero and no more than 24.');
if(!existsSync(path.join(root,'index.html')))throw Error('Build missing. Build this worktree before starting the VR preview.');
let preview;
try{preview=await startStaticServer({root,port,host:'127.0.0.1'});}
catch(error){
  if(error.code==='EADDRINUSE')console.error(`Port ${port} already in use. No existing service was changed. Choose VR_LAB_PORT or close the other preview yourself.`);
  else console.error(error);
  process.exit(1);
}
const expiresAt=new Date(Date.now()+hours*3600000).toISOString();
console.log(`Atelier VR : ${preview.url}?app=vr-lab`);
console.log(`Local a UGBrutal uniquement. Arret automatique : ${expiresAt}. Ctrl+C pour arreter.`);
let closing=false;
const close=async()=>{
  if(closing)return;closing=true;clearTimeout(timer);await preview.close();
  console.log('Apercu VR arrete.');
};
const timer=setTimeout(()=>{void close();},hours*3600000);
process.once('SIGINT',()=>{void close();});
process.once('SIGTERM',()=>{void close();});
