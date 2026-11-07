import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { startBallsyServer } from './serve-ballsy.mjs';
const root=fileURLToPath(new URL('../output/volcano-loop/dist',import.meta.url));
if(!existsSync(`${root}/ballsy.html`))throw new Error('Compilez la boucle avec npm run build:ballsy-loop avant de lancer.');
const app=await startBallsyServer({root,host:'127.0.0.1',port:4201});
console.log(`La Boucle du Volcan : ${app.url}ballsy.html`);
console.log('Aucun géant requis. Gardez cette fenêtre ouverte. Ctrl+C arrête cette prévisualisation uniquement.');
if(process.argv.includes('--open')){
 const opener=spawn('cmd.exe',['/d','/c','start','',`${app.url}ballsy.html`],{windowsHide:true,stdio:'ignore'});opener.on('error',()=>{});
}
const stop=async()=>{await app.close();process.exit(0);};
process.once('SIGINT',stop);process.once('SIGTERM',stop);
