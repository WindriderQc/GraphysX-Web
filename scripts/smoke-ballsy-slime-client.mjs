import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { registerHooks } from "node:module";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { startBallsyServer } from "./serve-ballsy.mjs";

// Executes the installed skill client unchanged. Its only adaptation is resolving the
// repository's already installed Playwright package from outside the repository tree.
const client = process.env.WEB_GAME_CLIENT || path.join(homedir(), ".codex", "skills", "develop-web-game", "scripts", "web_game_playwright_client.js");
assert.ok(existsSync(client), `Installed develop-web-game client not found: ${client}`);
if (process.argv[2] === "--child") {
  const playwright = import.meta.resolve("playwright");
  registerHooks({ resolve(specifier, context, next) { return specifier === "playwright" ? { url: playwright, shortCircuit: true } : next(specifier, context); } });
  process.argv = [process.execPath, client, ...process.argv.slice(3)];
  await import(pathToFileURL(client).href);
} else {
  const directory = path.resolve(process.env.SMOKE_ARTIFACTS || "output/ballsy-slime/client");
  mkdirSync(directory, { recursive: true });
  const actions = { steps: [{ buttons: [], frames: 200 }, { buttons: ["left"], frames: 90 }, { buttons: [], frames: 6 }] };
  const actionPath = path.join(directory, "actions.json"); writeFileSync(actionPath, JSON.stringify(actions));
  const app = await startBallsyServer({ port: 0, ...(process.env.SMOKE_DIST_ROOT ? { root: path.resolve(process.env.SMOKE_DIST_ROOT) } : {}) });
  const report = { client, startedAt: new Date().toISOString(), label: "Installed unmodified action client; real keyboard burst; not a human playtest" };
  try {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "--child", "--url", `${app.url}ballsy.html?course=volcano`, "--click-selector", '[data-action="start"]', "--actions-file", actionPath, "--iterations", "1", "--pause-ms", "200", "--screenshot-dir", directory], { stdio: "inherit" });
    const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
    assert.equal(code, 0);
    assert.ok(existsSync(path.join(directory, "shot-0.png")));
    const state = JSON.parse(readFileSync(path.join(directory, "state-0.json"), "utf8"));
    assert.equal(state.phase, "racing"); assert.equal(state.players.length, 2); assert.equal(state.laps, 2);
    assert.ok(Math.hypot(state.players[0].velocity[0], state.players[0].velocity[2]) > .1, "Real keyboard thrust moves racer one");
    assert.ok(!existsSync(path.join(directory, "errors-0.json")), "Client captured no console/page error");
    report.state = state; report.ok = true;
    console.log(JSON.stringify({ok:true,artifactDirectory:directory}));
  } catch (error) { report.ok = false; report.failure = String(error); throw error; }
  finally { report.finishedAt = new Date().toISOString(); writeFileSync(path.join(directory, "client-report.json"), JSON.stringify(report,null,2)); await app.close(); }
}
