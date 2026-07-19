import { chromium } from "playwright";
import { SMOKE_TIMEOUT, applySmokeTimeout } from "./smoke-timeout.mjs";
import { mkdirSync } from "node:fs";
import path from "node:path";

// Trigger volumes: a region that notices instead of resisting.
//
// Driven deterministically through pause/step rather than real time, so the assertions are
// about the simulation's behaviour and not about how fast the machine ran.

const EXE = process.env.SMOKE_CHROMIUM || undefined;
const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:4188/";
const ART = process.env.SMOKE_ARTIFACTS || path.resolve("output/smoke");
mkdirSync(ART, { recursive: true });

const consoleErrors = [];
const pageErrors = [];
const out = {};

const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
applySmokeTimeout(page);
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => pageErrors.push(String(e)));

try {
  await page.goto(`${BASE}?host=standalone`, { waitUntil: "domcontentloaded", timeout: SMOKE_TIMEOUT });
  await page.waitForFunction(() => !!window.__GRAPHYSX__, { timeout: SMOKE_TIMEOUT });

  out.result = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const events = () => api.state().recentEvents.map((event) => `${event.type} ${event.message}`);

    const created = api.create({
      schema: "graphysx.agent-world/v2",
      id: "trigger-lab",
      label: "Trigger Lab",
      environment: { background: "#0b1015", ground: { visible: false }, physics: { gravity: [0, -9.82, 0] } },
      entities: [
        { id: "sun", type: "directional-light", intensity: 1.2, transform: { position: [4, 8, 4] } },
        // The thing the gate switches on. Starts hidden; crossing the gate reveals it.
        { id: "lamp", type: "sphere", visible: false, transform: { position: [3, 1, 0] }, material: { color: "#ffd166" } },
        {
          id: "gate",
          type: "box",
          label: "Checkpoint",
          transform: { position: [0, 3, 0] },
          geometry: { width: 3, height: 0.6, depth: 3 },
          material: { color: "#37b6d3", opacity: 0.4 },
          physics: { mode: "trigger" },
          interactions: [{ id: "light-up", type: "toggle-visibility", targetIds: ["lamp"] }],
        },
        {
          id: "ball",
          type: "sphere",
          transform: { position: [0, 8, 0] },
          geometry: { radius: 0.4 },
          physics: { mode: "dynamic", mass: 1, material: "ball" },
        },
      ],
    });
    if (!created.ok) return { fatal: created.error };

    api.pause(true);
    const lampHiddenBefore = api.query({ ids: ["lamp"] })[0]?.visible === false;

    // Fall until the ball is inside the gate.
    let occupiedAt = null;
    const seen = [];
    for (let tick = 0; tick < 120 && occupiedAt === null; tick += 1) {
      api.step(1 / 60);
      for (const event of events()) if (!seen.includes(event)) seen.push(event);
      const gate = api.query({ ids: ["gate"] })[0];
      if (gate?.occupants?.length) occupiedAt = { tick, occupants: [...gate.occupants] };
    }

    const afterEnter = {
      events: events(),
      lampVisible: api.query({ ids: ["lamp"] })[0]?.visible === true,
      ballY: api.query({ ids: ["ball"] })[0]?.position[1] ?? null,
    };

    // Keep falling: the ball must pass through rather than rest on the gate.
    //
    // Events are drained every tick rather than read at the end. `state().recentEvents` is a
    // 12-entry ring and `step()` records one `time.stepped` entry per call, so a loop of
    // steps evicts exactly the events the loop exists to observe. Worth knowing before the
    // rules layer tries to consume trigger events from this same ring.
    const drained = [...seen];
    for (let tick = 0; tick < 180; tick += 1) {
      api.step(1 / 60);
      for (const event of events()) if (!drained.includes(event)) drained.push(event);
    }
    const gateAfter = api.query({ ids: ["gate"] })[0];
    const ballAfter = api.query({ ids: ["ball"] })[0];

    return {
      lampHiddenBefore,
      occupiedAt,
      afterEnter,
      finalBallY: ballAfter?.position[1] ?? null,
      finalOccupants: gateAfter?.occupants ?? null,
      allEvents: drained.filter((event) => !event.startsWith("time.stepped")),
      // A trigger must accept a motion behaviour; a moving checkpoint is the normal case.
      movingGateAccepted: api.attachBehavior("gate", { type: "bob", amplitude: 0.5 }).ok,
      // ...and must still refuse one on a body that would fight the solver.
      staticStillRefuses: api.spawn({
        id: "rock",
        type: "box",
        physics: { mode: "static" },
        behaviors: [{ type: "spin" }],
      }).ok === false,
    };
  });

  // The event stream is the substrate the rules layer and the relay both read from, so it
  // is asserted on the same flow rather than in isolation: same gate, same ball.
  out.stream = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const all = api.events(0);
    const crossings = all.events.filter((event) => event.type.startsWith("trigger."));
    const enter = crossings.find((event) => event.type === "trigger.enter");

    // Reading from a sequence returns only what came after it.
    const tail = enter ? api.events(enter.sequence) : { events: [] };

    return {
      sequence: all.sequence,
      dropped: all.dropped,
      monotonic: all.events.every((event, index) => index === 0 || event.sequence > all.events[index - 1].sequence),
      enterPayload: enter ? { type: enter.type, entityIds: enter.entityIds, data: enter.data, hasTime: typeof enter.atSeconds === "number" } : null,
      tailExcludesEnter: !tail.events.some((event) => event.sequence === enter?.sequence),
      sawSpawns: all.events.some((event) => event.type === "entity.spawned"),
      sawWorldLoaded: all.events.some((event) => event.type === "world.loaded"),
      // Asking for a sequence older than the buffer must report the gap rather than
      // quietly returning a partial list — a rules layer that silently loses a lap is worse
      // than one that knows it has to resynchronise.
      reportsGap: (() => {
        for (let index = 0; index < 700; index += 1) api.spawn({ id: `filler-${index}`, type: "box", visible: false });
        return api.events(1).dropped === true;
      })(),
    };
  });

  const r = out.result ?? {};
  out.enteredGate = Boolean(r.occupiedAt) && r.occupiedAt.occupants.includes("ball");
  out.firedEnterEvent = (r.allEvents ?? []).some((event) => event.startsWith("trigger.enter") && event.includes("ball"));
  out.firedExitEvent = (r.allEvents ?? []).some((event) => event.startsWith("trigger.exit") && event.includes("ball"));
  out.interactionRan = r.lampHiddenBefore === true && r.afterEnter?.lampVisible === true;
  // The whole point: detected, not resolved. A solid gate at y=3 would have stopped it.
  out.passedThrough = typeof r.finalBallY === "number" && r.finalBallY < 0;
  out.occupancyCleared = Array.isArray(r.finalOccupants) && r.finalOccupants.length === 0;
  out.movingGateAccepted = r.movingGateAccepted === true;
  out.staticStillRefuses = r.staticStillRefuses === true;
  out.fatal = r.fatal;

  await page.screenshot({ path: path.join(ART, "triggers.png"), fullPage: false });
} catch (e) {
  out.fatal = String(e);
}

out.consoleErrors = consoleErrors;
out.pageErrors = pageErrors;
console.log(JSON.stringify(out, null, 2));
await browser.close();

const ok =
  out.enteredGate &&
  out.firedEnterEvent &&
  out.firedExitEvent &&
  out.interactionRan &&
  out.passedThrough &&
  out.occupancyCleared &&
  out.movingGateAccepted &&
  out.staticStillRefuses &&
  out.stream?.monotonic &&
  out.stream?.dropped === false &&
  out.stream?.enterPayload?.entityIds?.includes("ball") &&
  out.stream?.enterPayload?.data?.triggerId === "gate" &&
  out.stream?.enterPayload?.hasTime &&
  out.stream?.tailExcludesEnter &&
  out.stream?.sawSpawns &&
  out.stream?.sawWorldLoaded &&
  out.stream?.reportsGap;
process.exit(out.fatal || pageErrors.length || !ok ? 1 : 0);

