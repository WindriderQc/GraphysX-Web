import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { startBallsyServer } from "./serve-ballsy.mjs";

// One outer with-verify-lock owns this sequential group. Every suite receives an
// explicit ephemeral URL serving this build; none can fall back to an older port.
const root=path.resolve(process.env.SMOKE_DIST_ROOT||"output/ballsy-slime/dist");
const directory=path.resolve(process.env.SMOKE_ARTIFACTS||"output/ballsy-slime/regressions");mkdirSync(directory,{recursive:true});
const app=await startBallsyServer({port:0,root});
const report={root,base:app.url,startedAt:new Date().toISOString(),checks:[]};
const only=process.argv.find(arg=>arg.startsWith("--only="))?.slice(7).split(",");
try{
  for(const [name,script,desktopOnly] of [["loop","scripts/smoke-ballsy-loop.mjs",false],["shovel","scripts/smoke-ballsy-shovel.mjs",true],["setup","scripts/smoke-ballsy-setup.mjs",false],["practice","scripts/smoke-ballsy.mjs",false]]){
    if(only&&!only.includes(name))continue;
    const startedAt=new Date().toISOString(),artifactDirectory=path.join(directory,name);mkdirSync(artifactDirectory,{recursive:true});
    console.log(`Starting ${name} against ${app.url} from ${root}`);
    const child=spawn(process.execPath,[script],{env:{...process.env,SMOKE_BASE:app.url,SMOKE_DIST_ROOT:root,SMOKE_ARTIFACTS:artifactDirectory,SMOKE_DESKTOP_ONLY:desktopOnly?"1":"0"},stdio:["ignore","pipe","pipe"]});
    let log="";for(const stream of[child.stdout,child.stderr])stream.on("data",chunk=>{log+=chunk;process.stdout.write(chunk);});
    const code=await new Promise((resolve,reject)=>{child.once("error",reject);child.once("close",resolve);});
    writeFileSync(path.join(directory,`${name}.log`),log);
    report.checks.push({name,script,startedAt,finishedAt:new Date().toISOString(),code,artifactDirectory});
    assert.equal(code,0,`${name} regression failed; see retained log and captures`);
  }
  report.ok=true;
}catch(error){report.ok=false;report.failure=String(error);throw error;}
finally{report.finishedAt=new Date().toISOString();writeFileSync(path.join(directory,"regressions-report.json"),JSON.stringify(report,null,2));await app.close();}
