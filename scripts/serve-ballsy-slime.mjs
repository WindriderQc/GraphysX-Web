import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { startBallsyServer } from './serve-ballsy.mjs';

const root = fileURLToPath(new URL('../output/ballsy-slime/dist', import.meta.url));
if (!existsSync(`${root}/ballsy.html`)) throw new Error('Compilez cette version avec npm run build:ballsy-slime avant de lancer.');
const app = await startBallsyServer({ root, host: '127.0.0.1', port: 4202 });
console.log(`Ballsy, ballons de slime : ${app.url}ballsy.html`);
console.log('Invitez le geant depuis la course. Aucun casque requis pour le mode souris.');
console.log('Gardez cette fenetre ouverte. Ctrl+C arrete cette previsualisation uniquement.');
if (process.argv.includes('--open')) {
  const opener = spawn('cmd.exe', ['/d', '/c', 'start', '', `${app.url}ballsy.html`], { windowsHide: true, stdio: 'ignore' });
  opener.on('error', () => {});
}
const stop = async () => { await app.close(); process.exit(0); };
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
