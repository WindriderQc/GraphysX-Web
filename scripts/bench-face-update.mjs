import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { importBrowserModule } from '../test/support/import-browser-module.mjs';
if (!process.argv[2]) throw new Error('Usage: node scripts/bench-face-update.mjs <baseline-checkout>');
const baseline = await importBrowserModule(pathToFileURL(resolve(process.argv[2], 'src/agent-world-face.ts')));
const candidate = await importBrowserModule(new URL('../src/agent-world-face.ts', import.meta.url));
function sample(module, level) {
  const face = new module.AgentWorldVoxelFace(module.resolveAgentWorldFace({level}));
  face.snapDrivers({build: 1, speak: 0.7, think: 0.2});
  for (let i=0;i<180;i++) face.update(1/60);
  const start=performance.now();
  for (let i=0;i<180;i++) face.update(1/60);
  const ms=(performance.now()-start)/180;
  face.dispose();
  return ms;
}
const result={scope:'CPU-only face.update microbenchmark, not GPU, browser FPS or ArtX', levels:{}};
for(const level of ['high','balanced','mobile']) {
  const a=[],b=[];
  for(let i=0;i<5;i++) {
    if(i%2) {b.push(sample(candidate,level));a.push(sample(baseline,level));}
    else {a.push(sample(baseline,level));b.push(sample(candidate,level));}
  }
  const median=v=>[...v].sort((a,b)=>a-b)[2];
  result.levels[level]={baselineMs:median(a),candidateMs:median(b),reductionPercent:100*(1-median(b)/median(a)),baselineSamples:a,candidateSamples:b};
}
console.log(JSON.stringify(result,null,2));

