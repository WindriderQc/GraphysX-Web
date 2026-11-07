import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { startBallsyServer } from './serve-ballsy.mjs';

// A separate, bounded loopback preview. Existing Ballsy/VR services keep their own state.
const root=fileURLToPath(new URL('../output/ballsy-shared-vr/dist',import.meta.url));
const port=Number(process.env.BALLSY_VR_PORT ?? 4215);
const hours=Number(process.env.BALLSY_VR_HOURS ?? 12);
if(!Number.isInteger(port) || port<0 || port>65535)throw Error('BALLSY_VR_PORT must be an integer from 0 to 65535.');
if(!Number.isFinite(hours) || hours<=0 || hours>24)throw Error('BALLSY_VR_HOURS must be greater than zero and no more than 24.');
if(!existsSync(`${root}/ballsy.html`) || !existsSync(`${root}/assets/xr/profiles/generic-trigger/controller.gltf`)){
 throw new Error('Compilez cette version avec npm run build:ballsy-shared-vr avant de lancer.');
}
let app;
try{app=await startBallsyServer({root,host:'127.0.0.1',port});}
catch(error){
 if(error.code==='EADDRINUSE')console.error(`Port ${port} deja occupe. Aucun autre service n'a ete modifie.`);
 else console.error(error);
 process.exit(1);
}
console.log(`Ballsy VR partage : ${app.url}ballsy.html`);
console.log(`Vue geant : ${app.url}ballsy-giant.html`);
console.log(`Local a ce PC seulement. Arret automatique : ${new Date(Date.now()+hours*3600000).toISOString()}.`);
console.log('Invitez le geant depuis la course. Ctrl+C arrete uniquement cette previsualisation.');
if(process.argv.includes('--open') && process.platform==='win32'){
 const opener=spawn('cmd.exe',['/d','/c','start','',`${app.url}ballsy.html`],{windowsHide:true,stdio:'ignore'});
 opener.on('error',()=>{});
}
let closing=false;
const stop=async()=>{if(closing)return;closing=true;clearTimeout(timer);await app.close();console.log('Apercu Ballsy VR arrete.');};
const timer=setTimeout(()=>{void stop();},hours*3600000);
process.once('SIGINT',()=>{void stop();});process.once('SIGTERM',()=>{void stop();});
