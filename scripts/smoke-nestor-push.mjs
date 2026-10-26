// The Center on a host page, end to end, against a Core this script plays itself.
//
// What is proved here is phase 2 of docs/NESTOR_PROPOSALS.md as a journey, not a model: a host
// page (the shape of Core's `/graphysx`) frames the built Center and loads the built
// `<graphysx-center>` from the same origin. The Center must take the host as its provider with
// no `?propose=` and no relay — a typed request goes up to the host, the host asks "Core" on its
// own origin, the reply comes down as a card. Then Core pushes: a proposal arrives on the host's
// event stream, lands in the Center as an inert card attributed to its actor, is applied only on
// Apply as one commit by that actor, and every push ends in a receipt — shown, shown-but-stale
// when composed against an older revision, refused while a card is already waiting, refused when
// forged. The Center itself never talks to `/propose`.

import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { SMOKE_TIMEOUT, applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { startStaticServer } from "./static-server.mjs";

const ART = process.env.SMOKE_ARTIFACTS || path.resolve("output/smoke");
mkdirSync(ART, { recursive: true });

const LAKE = {
  intent: "Add a lake with a flock of birds over it, lit by a sunset.",
  commands: [
    { op: "spawn", entity: { id: "pushed-lake", type: "water", label: "Lake", transform: { position: [0, -0.4, 14] }, water: { size: 18, color: "#0b2a3a", sunColor: "#ffb067", rippleScale: 8, flowSpeed: 0.6, opacity: 0.92 } } },
    { op: "spawn", entity: { id: "pushed-birds", type: "flock", label: "Birds over the lake", transform: { position: [0, 6, 14] }, flock: { preset: "starlings", count: 60, bounds: "box", size: [9, 3, 9], color: "#2b1d1a", speed: 5.5 } } },
    { op: "set-environment", environment: { background: "#4a2630", sky: "lostvalley", lighting: { source: "sky", intensity: 1.1, yawDegrees: 35, backgroundIntensity: 0.9, backgroundBlur: 0 } } },
  ],
};
const ACTOR = { id: "nestor", label: "Nestor · Core", kind: "agent" };

// ---- The Core this smoke plays: one page, the propose route, the page stream, state and receipts.
const seen = [];        // POST /api/graphysx/propose bodies
const states = [];      // POST /api/graphysx/center/state bodies
const receipts = [];    // POST /api/graphysx/center/receipts bodies
const streams = [];     // open event streams
let pageCounter = 0;

const readBody = (req) => new Promise((resolve) => {
  let body = "";
  req.on("data", (chunk) => { body += chunk; });
  req.on("end", () => resolve(body));
});
const json = (res, status, value) => {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(value));
};
const hostPage = (origin) => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Core · GraphysX</title>
<style>html,body{margin:0;height:100%;background:#03060c}graphysx-center{position:fixed;inset:0}</style>
<script>window.events=[];for(const t of ["graphysx-center-ready","graphysx-center-state","graphysx-center-events","graphysx-center-request","graphysx-center-pushed","graphysx-center-receipt","graphysx-center-error"])document.addEventListener(t,e=>window.events.push({type:t,detail:e.detail}));</script>
<script type="module" src="/embed/center-host.js"></script></head>
<body><graphysx-center center="${origin}/" api-base="/api/graphysx"></graphysx-center></body></html>`;

let origin = "";
const routeRequest = (req, res) => {
  const url = new URL(req.url, "http://smoke.invalid");
  if (url.pathname === "/core/graphysx") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    res.end(hostPage(origin));
    return true;
  }
  if (!url.pathname.startsWith("/api/graphysx/")) return false;
  const route = url.pathname.slice("/api/graphysx".length);
  if (route === "/propose" && req.method === "POST") {
    void readBody(req).then((body) => {
      const request = JSON.parse(body);
      seen.push(request);
      if (/dragon/i.test(request.request)) return json(res, 200, { ok: false, reason: "That asks for a dragon; the world has no such entity type." });
      return json(res, 200, LAKE);
    });
    return true;
  }
  if (route === "/center/events" && req.method === "GET") {
    pageCounter += 1;
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
    res.write(`event: hello\ndata: ${JSON.stringify({ pageId: `page-${pageCounter}` })}\n\n`);
    streams.push(res);
    req.on("close", () => { const index = streams.indexOf(res); if (index >= 0) streams.splice(index, 1); });
    return true;
  }
  if (route === "/center/state" && req.method === "POST") {
    void readBody(req).then((body) => { states.push(JSON.parse(body)); res.writeHead(204); res.end(); });
    return true;
  }
  if (route === "/center/receipts" && req.method === "POST") {
    void readBody(req).then((body) => { receipts.push(JSON.parse(body)); res.writeHead(204); res.end(); });
    return true;
  }
  json(res, 404, { ok: false, reason: "not a Core route this smoke plays" });
  return true;
};
/** Core pushes a proposal to the page's stream. */
const push = (proposal) => {
  const stream = streams.at(-1);
  assert.ok(stream, "a page stream is open");
  stream.write(`event: proposal\ndata: ${JSON.stringify(proposal)}\n\n`);
};
const until = async (predicate, label) => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > SMOKE_TIMEOUT) throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
};

const server = await startStaticServer({ root: path.resolve("dist"), port: 0, routeRequest });
origin = new URL(server.url).origin;

const consoleErrors = [];
const pageErrors = [];
const proposeRequests = [];
const browser = await launchSmokeBrowser();
const out = {};
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  applySmokeTimeout(page);
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("request", (request) => {
    if (/\/propose(\?|$)/.test(request.url())) proposeRequests.push({ url: request.url(), fromHost: request.frame() === page.mainFrame() });
  });

  await page.goto(`${origin}/core/graphysx`, { waitUntil: "domcontentloaded", timeout: SMOKE_TIMEOUT });
  const handle = await page.waitForSelector("graphysx-center iframe", { timeout: SMOKE_TIMEOUT });
  const frame = await handle.contentFrame();
  assert.ok(frame, "the host page frames the Center");
  await frame.waitForFunction(() => !!window.__GRAPHYSX_HOST__ && !!window.__GRAPHYSX_NESTOR__, null, { timeout: SMOKE_TIMEOUT });
  await frame.waitForSelector(".gx-welcome [data-nestor-ask]", { timeout: SMOKE_TIMEOUT });
  await frame.waitForFunction(() => window.__GRAPHYSX_HOST__.introPlaying === false, null, { timeout: 20000 });
  await page.waitForFunction(() => window.events.some((e) => e.type === "graphysx-center-ready"), null, { timeout: SMOKE_TIMEOUT });
  await until(() => states.length > 0, "the host to report the Center's state to Core");

  const snapshot = () => frame.evaluate(() => {
    const api = window.__GRAPHYSX__;
    return { revision: api.state().revision, document: JSON.stringify(api.exportDocument()), commits: api.history().length };
  });
  const unchanged = (before, after) => before.revision === after.revision && before.document === after.document && before.commits === after.commits;

  // 1. The handshake: the host is the provider, the field is enabled, Core knows the scene as a summary.
  await frame.waitForFunction(() => document.querySelector("[data-nestor-request]")?.disabled === false, null, { timeout: SMOKE_TIMEOUT });
  out.handshake = await frame.evaluate(() => ({
    fieldEnabled: !document.querySelector("[data-nestor-request]").disabled,
    source: JSON.parse(window.render_game_to_text()).proposalSource,
  }));
  out.handshake.hostState = await page.evaluate(() => document.querySelector("graphysx-center").state());
  out.handshake.reported = { revision: states[0].revision, pageId: states[0].pageId, entities: states[0].scene.entities.length,
    summaryOnly: states[0].scene.entities.every((entity) => Object.keys(entity).sort().join(",") === "id,label,type") };
  assert.equal(out.handshake.fieldEnabled, true, "the field is enabled once the host says hello");
  assert.match(out.handshake.source, /AgentX Core/);
  assert.equal(out.handshake.hostState.ready, true);
  assert.equal(out.handshake.reported.pageId, "page-1");
  assert.equal(out.handshake.reported.summaryOnly, true);
  await page.screenshot({ path: path.join(ART, "nestor-push-host-ready.png") });

  // 2. Pull through the host: typed in the Center, asked by the host page, answered as a card.
  const beforeAsk = await snapshot();
  await frame.fill("[data-nestor-request]", "add a lake with a flock of birds at sunset");
  await frame.click("[data-nestor-request-send]");
  await frame.waitForSelector(".gx-welcome--proposing", { timeout: SMOKE_TIMEOUT });
  out.pulled = {
    sentVerbatim: seen[0]?.request === "add a lake with a flock of birds at sunset",
    askedByHost: proposeRequests.length > 0 && proposeRequests.every((r) => r.fromHost),
    intent: await frame.evaluate(() => window.__GRAPHYSX_NESTOR__.state().proposal?.intent ?? null),
    unchanged: unchanged(beforeAsk, await snapshot()),
  };
  assert.equal(out.pulled.sentVerbatim, true);
  assert.equal(out.pulled.askedByHost, true, "only the host page talks to /propose; the Center never does");
  assert.equal(out.pulled.intent, LAKE.intent);
  assert.equal(out.pulled.unchanged, true);
  await frame.click("[data-proposal-discard]");
  await frame.waitForFunction(() => window.__GRAPHYSX_NESTOR__.state().proposal === null, null, { timeout: SMOKE_TIMEOUT });

  // 3. Push: Core composed because Nestor said so in a conversation. A card, attributed, inert.
  const beforePush = await snapshot();
  push({ id: "push-1", actor: ACTOR, intent: LAKE.intent, commands: LAKE.commands, expectedRevision: states.at(-1).revision });
  await frame.waitForSelector(".gx-welcome--proposing", { timeout: SMOKE_TIMEOUT });
  await until(() => receipts.some((r) => r.id === "push-1"), "the receipt for push-1");
  out.pushed = await frame.evaluate(() => {
    const proposal = window.__GRAPHYSX_NESTOR__.state().proposal;
    return {
      actor: proposal?.actor ?? null, intent: proposal?.intent ?? null, commandCount: proposal?.commandCount ?? 0,
      cardActor: document.querySelector("[data-proposal-actor]")?.textContent ?? null,
      cardIntent: document.querySelector("[data-proposal-intent]")?.textContent ?? null,
      stale: document.querySelector(".gx-welcome--proposal-stale") !== null,
      applyEnabled: !document.querySelector("[data-proposal-accept]")?.disabled,
    };
  });
  out.pushed.unchanged = unchanged(beforePush, await snapshot());
  out.pushed.receipt = receipts.find((r) => r.id === "push-1");
  assert.deepEqual(out.pushed.actor, ACTOR);
  assert.equal(out.pushed.cardActor, "Nestor · Core proposes");
  assert.equal(out.pushed.cardIntent, LAKE.intent);
  assert.equal(out.pushed.commandCount, 3);
  assert.equal(out.pushed.stale, false);
  assert.equal(out.pushed.applyEnabled, true);
  assert.equal(out.pushed.unchanged, true, "a pushed proposal does not move the scene");
  assert.equal(out.pushed.receipt.status, "shown");
  assert.equal(out.pushed.receipt.stale, false);
  assert.equal(out.pushed.receipt.pageId, "page-1");
  await page.screenshot({ path: path.join(ART, "nestor-push-card.png") });

  // 4. A second push while this card waits is refused with a receipt; the card is untouched.
  push({ id: "push-2", actor: ACTOR, intent: "Replace the lake with a volcano.", commands: LAKE.commands, expectedRevision: states.at(-1).revision });
  await until(() => receipts.some((r) => r.id === "push-2"), "the receipt for push-2");
  out.whileWaiting = {
    receipt: receipts.find((r) => r.id === "push-2"),
    cardIntent: await frame.evaluate(() => document.querySelector("[data-proposal-intent]")?.textContent ?? null),
  };
  assert.equal(out.whileWaiting.receipt.status, "refused");
  assert.match(out.whileWaiting.receipt.reason, /already waiting/);
  assert.equal(out.whileWaiting.cardIntent, LAKE.intent);

  // 5. Apply: one commit by the actor the card named; the host reports the new revision to Core.
  await frame.click("[data-proposal-accept]");
  await frame.waitForFunction((before) => window.__GRAPHYSX__.state().revision > before, beforePush.revision, { timeout: SMOKE_TIMEOUT });
  await frame.waitForFunction(() => !window.__GRAPHYSX_HOST__.focusing, null, { timeout: SMOKE_TIMEOUT }).catch(() => {});
  out.applied = await frame.evaluate((before) => {
    const api = window.__GRAPHYSX__;
    const last = api.history().at(-1);
    return {
      commits: api.history().length - before.commits,
      actor: last?.actor ?? null,
      intent: last?.intent ?? null,
      lake: api.query({ ids: ["pushed-lake"] })[0]?.type ?? null,
      birds: api.query({ ids: ["pushed-birds"] })[0]?.type ?? null,
      sky: api.state().environment?.sky ?? null,
      revision: api.state().revision,
    };
  }, beforePush);
  await until(() => states.at(-1)?.revision === out.applied.revision, "the host to report the applied revision");
  assert.equal(out.applied.commits, 1);
  assert.equal(out.applied.actor.label, "Nestor · Core");
  assert.equal(out.applied.intent, LAKE.intent);
  assert.equal(out.applied.lake, "water");
  assert.equal(out.applied.birds, "flock");
  assert.equal(out.applied.sky, "lostvalley");
  await page.screenshot({ path: path.join(ART, "nestor-push-applied.png") });

  // 6. Stale: composed against the revision before Apply. Shown as stale, Apply disabled, receipt says so.
  const beforeStale = await snapshot();
  push({ id: "push-3", actor: ACTOR, intent: "Dim the lights.", commands: [{ op: "update", id: "pushed-lake", patch: { label: "Dusk lake" } }], expectedRevision: beforePush.revision });
  await until(() => receipts.some((r) => r.id === "push-3"), "the receipt for push-3");
  out.stale = await frame.evaluate(() => ({
    stale: document.querySelector(".gx-welcome--proposal-stale") !== null,
    applyDisabled: document.querySelector("[data-proposal-accept]")?.disabled === true,
    outcome: document.querySelector("[data-proposal-outcome]")?.dataset.outcome ?? null,
  }));
  out.stale.receipt = receipts.find((r) => r.id === "push-3");
  out.stale.unchanged = unchanged(beforeStale, await snapshot());
  assert.equal(out.stale.stale, true);
  assert.equal(out.stale.applyDisabled, true);
  assert.equal(out.stale.outcome, "stale");
  assert.equal(out.stale.receipt.status, "shown");
  assert.equal(out.stale.receipt.stale, true);
  assert.equal(out.stale.unchanged, true);
  await page.screenshot({ path: path.join(ART, "nestor-push-stale.png") });
  await frame.click("[data-proposal-discard]");
  await frame.waitForFunction(() => window.__GRAPHYSX_NESTOR__.state().proposal === null, null, { timeout: SMOKE_TIMEOUT });

  // 7. Forged: a reserved namespace never becomes a card; the receipt names the refusal.
  const beforeForged = await snapshot();
  push({ id: "push-4", actor: ACTOR, intent: "Forge a teammate.", commands: [{ op: "spawn", entity: { id: "live-agent:mallory", type: "agent" } }], expectedRevision: states.at(-1).revision });
  await until(() => receipts.some((r) => r.id === "push-4"), "the receipt for push-4");
  out.forged = {
    receipt: receipts.find((r) => r.id === "push-4"),
    proposal: await frame.evaluate(() => window.__GRAPHYSX_NESTOR__.state().proposal),
    unchanged: unchanged(beforeForged, await snapshot()),
  };
  assert.equal(out.forged.receipt.status, "refused");
  assert.match(out.forged.receipt.reason, /reserved id namespace/);
  assert.equal(out.forged.proposal, null);
  assert.equal(out.forged.unchanged, true);

  // 8. A refusal through the host reaches the card as Core's sentence.
  await frame.fill("[data-nestor-request]", "summon a dragon");
  await frame.click("[data-nestor-request-send]");
  await frame.waitForFunction(() => document.querySelector("[data-proposal-outcome]")?.dataset.outcome === "declined", null, { timeout: SMOKE_TIMEOUT });
  out.refused = await frame.evaluate(() => document.querySelector("[data-proposal-outcome]")?.textContent ?? null);
  assert.match(out.refused, /dragon/);

  out.hostEvents = await page.evaluate(() => window.events.map((e) => e.type).filter((type, index, all) => all.indexOf(type) === index));
  assert.ok(!out.hostEvents.includes("graphysx-center-error"), `no host error: ${JSON.stringify(await page.evaluate(() => window.events.filter((e) => e.type === "graphysx-center-error")))}`);
  assert.deepEqual(pageErrors, []);
  const relevantConsoleErrors = consoleErrors.filter((text) => !/favicon/.test(text));
  assert.deepEqual(relevantConsoleErrors, []);
  console.log(`nestor-push: PASS ${JSON.stringify({ ...out, pushes: receipts.length })}`);
} finally {
  await browser.close();
  await server.close();
}
