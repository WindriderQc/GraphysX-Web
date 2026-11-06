import { startBallsyServer } from './serve-ballsy.mjs';
import { spawn } from 'node:child_process';
const app = await startBallsyServer({host:'127.0.0.1',port:4199});
console.log(`Ballsy local: ${app.url}ballsy.html`);
console.log('Keep this window open. Ctrl+C stops only this preview.');
const opener=spawn('cmd.exe',['/d','/c','start','',`${app.url}ballsy.html`],{windowsHide:true,stdio:'ignore'});
opener.on('error',()=>{});
