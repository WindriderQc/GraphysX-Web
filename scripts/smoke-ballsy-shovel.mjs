import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { startBallsyServer } from "./serve-ballsy.mjs";

const art = process.env.SMOKE_ARTIFACTS || "output/ballsy-shovel";
mkdirSync(art, { recursive: true });
const desktopOnly = process.env.SMOKE_DESKTOP_ONLY === "1";
let iwer;
if (!desktopOnly) {
  iwer = process.env.SMOKE_IWER ? path.resolve(process.env.SMOKE_IWER) : fileURLToPath(new URL("../build/iwer.min.js", import.meta.resolve("iwer")));
  if (!existsSync(iwer)) throw new Error("IWER missing. Use SMOKE_DESKTOP_ONLY=1 for desktop-only coverage.");
}
const app = await startBallsyServer({ port: 0, ...(process.env.SMOKE_DIST_ROOT ? { root: path.resolve(process.env.SMOKE_DIST_ROOT) } : {}) });
const guestBase = new URL(app.url); guestBase.hostname = "localhost";
const browser = await launchSmokeBrowser();
const errors = [], report = {
  profile: desktopOnly ? "Desktop only; no XR validation"
    : "IWER Quest 2 stereo with synthetic host-input tracking; not physical hardware or Quest pose calibration",
  physicalHeadset: false,
};
const host = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const giant = await browser.newPage({ viewport: { width: 1280, height: 720 } });
for (const page of [host, giant]) {
  applySmokeTimeout(page);
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
}
const hostState = () => host.evaluate(() => window.__BALLSY__.state());
const guestState = () => giant.evaluate(() => window.__BALLSY_GIANT__.state());
try {
  // Origin checks run on the actual HTTP listener, without making a browser log an expected error.
  const refused = await fetch(`${app.url}api/ballsy/create`, { method: "POST", headers: { Origin: "https://unrelated.invalid", "content-type": "application/json" }, body: "{}" });
  assert.equal(refused.status, 403);
  await host.goto(`${app.url}ballsy.html?mode=help`, { waitUntil: "load" });
  await host.waitForFunction(() => !!window.__BALLSY__);
  await host.getByRole("button", { name: "Inviter un géant", exact: true }).click();
  await host.waitForFunction(() => !!window.__BALLSY__.state().room?.code);
  const code = (await hostState()).room.code;
  const installHeadset = () => {
    const runtime = window.IWER;
    const device = new runtime.XRDevice(runtime.metaQuest2);
    device.installRuntime({ forceInstall: true }); device.stereoEnabled = true; device.ipd = 0.064;
    device.position.set(0, 1.6, 0); device.quaternion.set(Math.sin(-0.45 / 2), 0, 0, Math.cos(-0.45 / 2));
    window.testHeadset = device;
    // IWER's ordinary controller spaces correctly report emulatedPosition=true.
    // Use its public host-input API for explicit synthetic 6DoF tracking, rather
    // than changing that flag or weakening the product's lost/emulated-pose guard.
    // Grip and ray share this fixture's pose; this is not Quest calibration evidence.
    window.testTracking = device.enableHostInput();
    window.testControllerPose = (hand, position, orientation) => {
      const state = window.testTracking.get(hand);
      state.targetRay.set([...position, ...orientation]); state.grip.set(state.targetRay);
    };
    window.testTrigger = (hand, value) => {
      const state = window.testTracking.get(hand);
      state.buttonValues[0] = value; state.buttonPressed[0] = value > .5 ? 1 : 0;
      state.buttonTouched[0] = value > 0 ? 1 : 0;
    };
    for (const hand of ["left", "right"]) {
      const state = window.testTracking.get(hand), controller = device.controllers[hand];
      state.mode = runtime.XRHostInputMode.Controller;
      state.targetRayValid = state.gripValid = true;
      window.testControllerPose(hand, [controller.position.x, controller.position.y, controller.position.z],
        [controller.quaternion.x, controller.quaternion.y, controller.quaternion.z, controller.quaternion.w]);
    }
  };
  // One init script: Playwright does not guarantee the ordering of separate init scripts.
  if (!desktopOnly) await giant.addInitScript({ content: `${readFileSync(iwer, "utf8")}\n;(${installHeadset.toString()})();` });
  await giant.goto(`${guestBase}ballsy-giant.html`, { waitUntil: "load" });
  await giant.waitForFunction(() => !!window.__BALLSY_GIANT__);
  await giant.getByLabel("Code affiché sur la télé").fill(code);
  await giant.getByRole("button", { name: "Rejoindre", exact: true }).click();
  await giant.waitForFunction(() => window.__BALLSY_GIANT__.state().live);
  await host.waitForFunction(() => window.__BALLSY__.state().room?.connected);
  await giant.locator('[data-mode="shovel"]').click();
  report.joined = { host: (await hostState()).room, guest: await guestState() };
  const terrainScale = await giant.evaluate(() => {
    const a = window.__BALLSY_GIANT__.terrainPoint(7,0).world;
    const b = window.__BALLSY_GIANT__.terrainPoint(11,0).world;
    return Math.hypot(b[0]-a[0], b[2]-a[2]);
  });
  assert.ok(Math.abs(terrainScale - 0.18) < 1e-6, "four terrain units occupy 18 cm at physical tabletop scale");
  await host.getByRole("button", { name: /C'est parti/ }).click();
  await giant.waitForFunction(() => window.__BALLSY_GIANT__.state().snapshot?.phase === "racing");
  await host.evaluate(() => window.dispatchEvent(new Event("blur")));
  assert.equal((await hostState()).phase, "racing", "a separate giant window does not pause the TV");
  if (!desktopOnly) {
  report.capability = await giant.evaluate(async () => {
    try { return { secure: isSecureContext, supported: await navigator.xr.isSessionSupported("immersive-vr"), headset: !!window.testHeadset, button: document.querySelector("[data-vr]").textContent }; }
    catch (e) { return { secure: isSecureContext, error: String(e), headset: !!window.testHeadset }; }
  });
  assert.equal(report.capability.supported, true, JSON.stringify({ capability: report.capability, errors }));
  await giant.getByRole("button", { name: "Devenir le géant en VR", exact: true }).click();
  await giant.waitForFunction(() => window.__BALLSY_GIANT__.state().view === "vr" && window.__BALLSY_GIANT__.state().eyes === 2);
  report.stereo = await guestState();
  assert.equal(report.stereo.placements, 1, "first tracked pose places the tabletop in front of the viewer");
  report.tracking = await giant.evaluate(async () => {
    const session = window.testHeadset.activeSession, reference = await session.requestReferenceSpace("local-floor");
    return new Promise(resolve => session.requestAnimationFrame((_time, frame) => resolve(Array.from(session.inputSources, source => ({
      hand: source.handedness,
      poses: [source.targetRaySpace, source.gripSpace].map(space => {
        const pose = frame.getPose(space, reference);
        return { present: !!pose, emulatedPosition: pose?.emulatedPosition };
      }),
    })))));
  });
  assert.equal(report.tracking.length, 2, "the fixture supplies both controller sources");
  assert.ok(report.tracking.every(source => source.poses.every(pose => pose.present && pose.emulatedPosition === false)),
    "IWER host-input validity reaches native poses without changing the product tracking guard");
  await giant.screenshot({ path: path.join(art, "giant-stereo.png") });

  assert.equal(report.stereo.targets.length, 3, "VR has Exit, recenter and a secondary tool switch");
  const controllerPose = await giant.evaluate(() => {
    const controller = window.testTracking.right, head = window.testHeadset.position;
    const original = {
      position: Array.from(controller.targetRay.slice(0, 3)),
      quaternion: Array.from(controller.targetRay.slice(3, 7)),
    };
    const origin = [head.x + .25, head.y - .3, head.z - .25], target = window.__BALLSY_GIANT__.state().targets[2];
    const delta = target.map((value,axis) => value-origin[axis]), length = Math.hypot(...delta);
    const direction = delta.map(value => value/length), q = [direction[1], -direction[0], 0, 1-direction[2]], qLength = Math.hypot(...q);
    window.testControllerPose("right", origin, q.map(value => value/qLength));
    return original;
  });
  await giant.waitForFunction(() => window.__BALLSY_GIANT__.state().hoverTargets.includes(2));
  for (const mode of ["balloon", "shovel"]) {
    await giant.evaluate(() => window.testTrigger("right", 1));
    await giant.waitForFunction(mode => window.__BALLSY_GIANT__.state().balloon.mode === mode, mode);
    const ends = (await guestState()).selectEnds;
    await giant.evaluate(() => window.testTrigger("right", 0));
    await giant.waitForFunction(ends => window.__BALLSY_GIANT__.state().selectEnds > ends, ends);
  }
  await giant.evaluate(pose => {
    window.testControllerPose("right", pose.position, pose.quaternion);
  }, controllerPose);
  report.xrToolSwitch = "Third 3D button switches shovel to balloon and back through trigger input";
  await giant.waitForFunction(() => window.__BALLSY_GIANT__.state().shovel.visible.some(Boolean));
  async function moveBlade(x, z, penetration) {
    await giant.evaluate(({x,z,penetration}) => {
      const api = window.__BALLSY_GIANT__, state = api.state();
      const desired = api.terrainPoint(x,z,penetration).world;
      const actual = state.shovel.tipWorld[state.shovel.dominant];
      const c = window.testTracking.right.targetRay;
      window.testControllerPose("right", desired.map((value, axis) => c[axis] + value - actual[axis]), Array.from(c.slice(3, 7)));
    }, {x,z,penetration});
    await giant.waitForTimeout(120);
  }
  await moveBlade(7, 1, -0.3);
  await giant.evaluate(() => window.testTrigger("right", 1));
  await giant.waitForFunction(() => window.__BALLSY_GIANT__.state().shovel.held);
  await moveBlade(7, 1, 0.18);
  const before = (await hostState()).volcano.earth.excavated;
  for (let i=1;i<=12;i++) await moveBlade(7+i*0.16,1,0.18);
  await host.waitForFunction((previous) => window.__BALLSY__.state().volcano.earth.excavated > previous, before);
  report.cut = (await hostState()).volcano.earth.excavated;
  await giant.waitForTimeout(200);
  const still = (await hostState()).volcano.earth.excavated;
  await giant.waitForTimeout(700);
  assert.equal((await hostState()).volcano.earth.excavated, still, "stationary trigger does not excavate");
  await giant.screenshot({ path: path.join(art,"held-shovel-cut.png") });
  await giant.evaluate(() => window.dispatchEvent(new Event("blur")));
  await host.waitForFunction(() => window.__BALLSY__.state().volcano.earth.stroke === null);
  assert.equal((await guestState()).shovel.held, false);
  await giant.evaluate(() => window.testTrigger("right",0));
  await giant.evaluate(() => window.__BALLSY_GIANT__.endVR());
  await giant.waitForFunction(() => window.__BALLSY_GIANT__.state().view === "screen");
  // Session exit releases ownership; rejoin for the explicit mouse fallback.
  await giant.getByRole("button",{name:"Rejoindre",exact:true}).click();
  await giant.waitForFunction(() => window.__BALLSY_GIANT__.state().live);
  }
  const start = await giant.evaluate(() => window.__BALLSY_GIANT__.terrainPoint(7,-2).screen);
  await giant.mouse.move(...start); await giant.mouse.down();
  const desktopBefore = (await hostState()).volcano.earth.excavated;
  for(let i=1;i<=12;i++) {
    const next = await giant.evaluate((x) => window.__BALLSY_GIANT__.terrainPoint(x,-2).screen,7+i*0.16);
    await giant.mouse.move(...next); await giant.waitForTimeout(100);
  }
  await giant.mouse.up();
  await host.waitForFunction((previous) => window.__BALLSY__.state().volcano.earth.excavated > previous,desktopBefore);
  await host.waitForFunction(() => window.__BALLSY__.state().volcano.earth.stroke === null);
  // A repeated dry-side pass makes removed earth visible independently of lava colour.
  for (let pass=0; pass<3; pass++) {
    const from = await giant.evaluate(() => window.__BALLSY_GIANT__.terrainPoint(5.5,-5).screen);
    await giant.mouse.move(...from); await giant.mouse.down();
    await giant.waitForTimeout(120);
    for (let i=1;i<=16;i++) {
      const at = await giant.evaluate((x) => window.__BALLSY_GIANT__.terrainPoint(x,-5).screen,5.5+i*0.16);
      await giant.mouse.move(...at); await giant.waitForTimeout(100);
    }
    await giant.mouse.up(); await giant.waitForTimeout(150);
  }
  await host.waitForFunction(() => window.__BALLSY__.state().volcano.earth.stroke === null);
  report.desktopCut = (await hostState()).volcano.earth.excavated;
  await giant.screenshot({path:path.join(art,"desktop-direct-cut.png")});
  assert.deepEqual(errors, []);
  writeFileSync(path.join(art,"shovel-report.json"),JSON.stringify(report,null,2));
  console.log(JSON.stringify({ok:true, profile:report.profile,cut:report.cut,desktopCut:report.desktopCut}));
} catch(error) {
  report.failure=String(error); report.errors=errors;
  try { report.guest=await guestState(); report.host=await hostState(); await giant.screenshot({path:path.join(art,"failure.png")}); } catch { /* retain initial error */ }
  writeFileSync(path.join(art,"failure.json"),JSON.stringify(report,null,2));
  throw error;
} finally { await browser.close(); await app.close(); }
