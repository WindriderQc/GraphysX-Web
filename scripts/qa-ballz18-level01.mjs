import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { chromium } from "playwright";

const url = process.env.GRAPHYSX_URL ?? "http://127.0.0.1:4193/";
const outputDir = path.resolve("output/playwright/ballz18-level01");
fs.mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"]
});
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const errors = [];
const assertions = [];
const states = {};
page.on("console", (message) => {
  if (message.type() === "error") errors.push({ type: "console", text: message.text() });
});
page.on("pageerror", (error) => errors.push({ type: "page", text: String(error) }));

const assert = (condition, message) => {
  assertions.push({ pass: Boolean(condition), message });
  if (!condition) throw new Error(message);
};
const debug = (name, ...args) => page.evaluate(({ name, args }) => window.__GRAPHYSX_DEBUG__[name](...args), { name, args });
const distance2d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").toUpperCase();

try {
  assert(
    sha256(path.resolve("public/assets/audio/ballz18/beepShort.mp3")) ===
      "24004A82DD5274B852DE766EF2B2AC035CA2D6B2AEFC72086800968B4A98E77D",
    "GetReady uses the exact archived BallZ18 beepShort.mp3"
  );
  assert(
    sha256(path.resolve("public/assets/audio/ballz18/beep01.mp3")) ===
      "A4B2B465B45B670914E799FFC44F0A237E59B0A8957B20C7C95F77BC81212B6B",
    "GO uses the exact archived BallZ18 beep01.mp3"
  );
  assert(
    sha256(path.resolve("public/assets/audio/ballz2015/coin.wav")) ===
      "C39530645CFA13D03AF84F443BAF72828C2C3C4F408DF34ED42B2F73A155F70B",
    "Ring pickup uses the exact archived BallZ2015 coin.wav"
  );
  assert(
    sha256(path.resolve("public/assets/audio/ballz2015/Jump.wav")) ===
      "CBEFE3A551A54ED1870350AC6555172B901606590ABC9F5000B9169BB1EBF1AC",
    "Ball jump uses the exact archived BallZ2015 Jump.wav"
  );
  const nightSkyHashes = {
    "back.bmp": "A160D4F58254AD869C4A3D04E0DAC5835E5F07BE448997E3C55D0F26D03A8978",
    "down.bmp": "4767FFEC710944546DCE4D048B9DDF2F717065C87F6162FE019F8C6EA71CD585",
    "front.bmp": "30405D849683EC244CBAEF8408939452BF1C973DC9EC13752C92B670F6D8FCE6",
    "left.bmp": "76E71E1C74327D1558B2C074B610152818EE8DA0F52927C3E01DD3C5342ACF87",
    "right.bmp": "057A9C718EAE0BF2627AC15317E90B0881FE309660D51A8D60DB2C1E43FC7341",
    "up.bmp": "9CAD06C585A6D3B9CBC29AF03E8F41BE85918698120C1A8101BFB11A97F98E61"
  };
  assert(
    Object.entries(nightSkyHashes).every(([file, hash]) => sha256(path.resolve("public/assets/sky/nightsky", file)) === hash),
    "Math Game uses all six exact archived 1024px NightSky BMP faces"
  );
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__GRAPHYSX_DEBUG__ && window.render_game_to_text && window.advanceTime);
  assert((await debug("raceIds")).includes("ballz18-level01"), "BallZ18 Level01 is a player-facing BallZ Tour challenge");
  assert(await debug("selectRace", "ballz18-level01"), "BallZ18 Level01 is selectable");
  await page.waitForFunction(() => window.__GRAPHYSX_DEBUG__.snapshot().loadState.ready);
  const preview = await debug("snapshot");
  assert(preview.playerRadius === 0.5, "Level01 keeps the Unity sphere collider radius 0.5");
  assert(preview.ringsTotal === 0, "Level01 does not invent checkpoint collectibles");
  assert(preview.lapsTotal === 3, "Canonical revival exposes its disclosed three-lap finish");
  assert(preview.rival?.waypointsTotal === 7, "BallAI uses all seven authored Raceline children");
  await page.screenshot({ path: path.join(outputDir, "00-tour-preview.png"), fullPage: true });

  assert(await debug("startRace"), "BallZ18 Level01 starts");
  const countdownStart = await debug("snapshot");
  assert(countdownStart.countdownRemaining > 3, "Unity-style countdown begins before control is enabled");
  assert(countdownStart.countdownAudio.cue === "waiting", "Countdown preserves the source's initial half-second wait");
  await debug("setVirtualInput", { code: "ArrowUp", down: true });
  await page.evaluate(() => window.advanceTime(600));
  const countdownProbe = await debug("snapshot");
  assert(
    countdownProbe.countdownAudio.cue === "3" && countdownProbe.countdownAudio.readyPlays === 1,
    "The exact GetReady sample begins with 3 after the source's half-second wait"
  );
  assert(distance2d(countdownProbe.playerPosition, countdownStart.playerPosition) < 0.01, "Player remains locked during countdown");
  assert(distance2d(countdownProbe.rival.position, countdownStart.rival.position) < 0.01, "BallAI remains locked during countdown");

  await page.evaluate(() => window.advanceTime(3200));
  const ready = await debug("snapshot");
  assert(ready.countdownRemaining === 0, "Countdown releases the race deterministically");
  assert(
    ready.countdownAudio.cue === "go" && ready.countdownAudio.readyPlays === 3 && ready.countdownAudio.goPlays === 1,
    "Countdown plays GetReady at 3/2/1 and the archived GoAudio at GO"
  );
  await debug("setVirtualInput", { code: "ArrowUp", down: true });
  await page.evaluate(() => window.advanceTime(1200));
  await debug("setVirtualInput", { code: "ArrowUp", down: false });
  const moved = await debug("snapshot");
  assert(distance2d(moved.playerPosition, ready.playerPosition) > 0.1, "Player can roll after GO");
  assert(
    distance2d(moved.rival.position, ready.rival.position) > 0.02,
    "The source BallAI rival advances along the authored Raceline after GO"
  );
  states.live = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert(states.live.rival.waypointsTotal === 7, "render_game_to_text exposes rival route progress");
  await page.screenshot({ path: path.join(outputDir, "01-live-ai-circuit.png"), fullPage: true });

  const finished = await debug("completeObjective");
  assert(finished.lapsCompleted === 3, "Halfway-before-finish chain completes all three canonical laps");
  assert((await debug("state")) === "after-race", "Level01 reaches the common results flow");
  await page.screenshot({ path: path.join(outputDir, "02-three-lap-finish.png"), fullPage: true });

  assert(await debug("openMathGame"), "BallZ18 MathGames evidence merges into the existing Math Game");
  await page.locator('[data-math-preset="ballz18-unity"]').click();
  states.math = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert(
    states.math.math.a === 0.01 && states.math.math.b === 0 && states.math.math.c === 100 && states.math.math.m === 5,
    "Math Game exposes the exact BallZ18 Unity formula defaults"
  );
  assert(states.math.player === undefined && states.math.race === undefined, "Math Game remains isolated from BallZ race actors and HUD state");
  await page.screenshot({ path: path.join(outputDir, "03-ballz18-math-preset.png"), fullPage: true });
  assert(errors.length === 0, "BallZ18 flow produces no console or page errors");
} finally {
  fs.writeFileSync(path.join(outputDir, "results.json"), JSON.stringify({ url, assertions, states, errors }, null, 2));
  await browser.close();
}

console.log(`BallZ18 Level01 QA passed ${assertions.length}/${assertions.length} assertions with ${errors.length} errors.`);
