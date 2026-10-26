// The free-text request journey, end to end, against a provider this script runs itself.
//
// What is proved here is the seam, not a model: a loopback "Core" answers one request with a
// lake, a flock and a sunset, another with an explicit refusal, and a third with a forged
// namespace. The page must show the first as a card and apply it only on Apply, show the
// second as the provider's own sentence with the scene byte-identical, and never show the
// third. Separately, with no provider at all, the field must be disabled, say why, and the page
// must make no request to any `/propose` — the front door never requires a model.

import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { SMOKE_TIMEOUT, applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";

const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:4188/";
const ART = process.env.SMOKE_ARTIFACTS || path.resolve("output/smoke");
mkdirSync(ART, { recursive: true });

const LAKE_REPLY = {
  intent: "Add a lake with a flock of birds over it, lit by a sunset.",
  commands: [
    { op: "spawn", entity: { id: "request-lake", type: "water", label: "Lake", transform: { position: [0, -0.4, 14] }, water: { size: 18, color: "#0b2a3a", sunColor: "#ffb067", rippleScale: 8, flowSpeed: 0.6, opacity: 0.92 } } },
    { op: "spawn", entity: { id: "request-birds", type: "flock", label: "Birds over the lake", transform: { position: [0, 6, 14] }, flock: { preset: "starlings", count: 60, bounds: "box", size: [9, 3, 9], color: "#2b1d1a", speed: 5.5 } } },
    { op: "set-environment", environment: { background: "#4a2630", sky: "lostvalley", lighting: { source: "sky", intensity: 1.1, yawDegrees: 35, backgroundIntensity: 0.9, backgroundBlur: 0 } } },
    { op: "select", ids: ["request-lake", "request-birds"] },
  ],
};

// The provider the page talks to. Which reply it gives depends on the request text, so the
// browser side of the test chooses the scenario by what it types.
const seen = [];
const provider = createServer((req, res) => {
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST, OPTIONS" };
  if (req.method === "OPTIONS") { res.writeHead(204, cors); res.end(); return; }
  if (req.method !== "POST" || req.url !== "/propose") { res.writeHead(404, cors); res.end(); return; }
  let body = "";
  req.on("data", (chunk) => { body += chunk; });
  req.on("end", () => {
    const request = JSON.parse(body);
    seen.push(request);
    const reply = (status, value) => { res.writeHead(status, { ...cors, "content-type": "application/json" }); res.end(JSON.stringify(value)); };
    if (/dragon/i.test(request.request)) return reply(200, { ok: false, reason: "That asks for a dragon; the world has no such entity type." });
    if (/forge/i.test(request.request)) return reply(200, { intent: "Forge a teammate", commands: [{ op: "spawn", entity: { id: "live-agent:mallory", type: "agent" } }] });
    return reply(200, LAKE_REPLY);
  });
});
await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
const providerUrl = `http://127.0.0.1:${provider.address().port}/propose`;

const consoleErrors = [];
const pageErrors = [];
const browser = await launchSmokeBrowser();
const page = await browser.newPage();
applySmokeTimeout(page);
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => pageErrors.push(String(e)));
const proposeRequests = [];
page.on("request", (request) => { if (/\/propose(\?|$)/.test(request.url())) proposeRequests.push(request.url()); });

const out = {};
const snapshot = () => page.evaluate(() => {
  const api = window.__GRAPHYSX__;
  return { revision: api.state().revision, document: JSON.stringify(api.exportDocument()), commits: api.history().length };
});
const unchanged = (before, after) => before.revision === after.revision && before.document === after.document && before.commits === after.commits;
const ready = async () => {
  await page.waitForFunction(() => !!window.__GRAPHYSX_HOST__ && !!window.__GRAPHYSX_NESTOR__, { timeout: SMOKE_TIMEOUT });
  await page.waitForSelector(".gx-welcome [data-nestor-ask]", { timeout: SMOKE_TIMEOUT });
  await page.waitForFunction(() => window.__GRAPHYSX_HOST__.introPlaying === false, null, { timeout: 20000 });
};

try {
  // 1. No provider: the field says so and the page makes no request.
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: SMOKE_TIMEOUT });
  await ready();
  out.noProvider = await page.evaluate(() => {
    const input = document.querySelector("[data-nestor-request]");
    const send = document.querySelector("[data-nestor-request-send]");
    return { disabled: input?.disabled === true && send?.disabled === true, placeholder: input?.placeholder ?? null };
  });
  // Submitting the disabled form must do nothing at all.
  await page.evaluate(() => document.querySelector("[data-nestor-ask]")?.requestSubmit?.());
  await page.waitForTimeout(500);
  out.noProvider.requests = proposeRequests.length;
  out.noProvider.proposal = await page.evaluate(() => window.__GRAPHYSX_NESTOR__.state().proposal === null);

  // 2. A loopback provider: the card is bottom-anchored; the field must not have covered the
  //    kinetic blocks and consoles a visitor can click.
  await page.goto(`${BASE}?propose=${encodeURIComponent(providerUrl)}`, { waitUntil: "domcontentloaded", timeout: SMOKE_TIMEOUT });
  await ready();
  out.layout = await page.evaluate(() => {
    const host = window.__GRAPHYSX_HOST__;
    const card = document.querySelector(".gx-welcome-card").getBoundingClientRect();
    const canvas = host.renderer.domElement.getBoundingClientRect();
    const project = (id) => {
      const obj = host.world.getEntityObject(id);
      if (!obj) return null;
      const v = obj.getWorldPosition(new (obj.position.constructor)());
      v.project(host.camera);
      return { x: canvas.left + ((v.x + 1) / 2) * canvas.width, y: canvas.top + ((-v.y + 1) / 2) * canvas.height };
    };
    const ids = ["showroom-block-3", "showroom-block-5", "showroom-orb-0", "showroom-orb-1", "showroom-nestor-console-build:core", "showroom-nestor-console-play:core", "showroom-nestor-console-explore:core"];
    const points = Object.fromEntries(ids.map((id) => [id, project(id)]));
    // The card body lets clicks through (pointer-events: none); only its interactive rows catch
    // them. So "covered" means a click at the body's screen position would land on chrome
    // instead of the canvas — exactly the hazard the roadmap records for this card.
    const describe = (element) => (element ? `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${element.className && typeof element.className === "string" ? `.${element.className.split(" ").join(".")}` : ""}` : "null");
    const blocked = () => ids.filter((id) => {
      const p = points[id];
      const hit = p ? document.elementFromPoint(p.x, p.y) : null;
      return hit !== null && hit !== host.renderer.domElement;
    }).map((id) => `${id} -> ${describe(document.elementFromPoint(points[id].x, points[id].y))} at ${Math.round(points[id].x)},${Math.round(points[id].y)}`);
    const covered = blocked();
    // The same measurement with the new row removed, so the report shows what the row costs.
    const ask = document.querySelector("[data-nestor-ask]");
    const display = ask.style.display;
    ask.style.display = "none";
    const cardWithoutRow = document.querySelector(".gx-welcome-card").getBoundingClientRect();
    const coveredWithoutRow = blocked();
    window.__SMOKE_RESTORE_ASK__ = () => { ask.style.display = display; };
    return {
      cardTop: Math.round(card.top), cardHeight: Math.round(card.height), cardHeightWithoutRow: Math.round(cardWithoutRow.height),
      viewport: { w: innerWidth, h: innerHeight }, covered, coveredWithoutRow,
      fieldEnabled: !document.querySelector("[data-nestor-request]")?.disabled,
    };
  });
  // "Before": the card as it was without the row; "after": with it. Same framing, same instant.
  await page.screenshot({ path: path.join(ART, "nestor-request-card-without-row.png") });
  await page.evaluate(() => window.__SMOKE_RESTORE_ASK__());
  await page.screenshot({ path: path.join(ART, "nestor-request-ready.png") });

  // 3. The request: typed, sent verbatim, answered with a card. The scene must not move.
  const beforeAsk = await snapshot();
  await page.fill("[data-nestor-request]", "add a lake with a flock of birds at sunset");
  await page.click("[data-nestor-request-send]");
  await page.waitForSelector(".gx-welcome--proposing", { timeout: SMOKE_TIMEOUT });
  out.asked = await page.evaluate((before) => {
    const api = window.__GRAPHYSX__;
    const proposal = window.__GRAPHYSX_NESTOR__.state().proposal;
    return {
      intent: proposal?.intent ?? null,
      commandCount: proposal?.commandCount ?? 0,
      ops: proposal?.commands?.map((command) => command.op) ?? [],
      types: proposal?.commands?.filter((command) => command.op === "spawn").map((command) => command.entity.type) ?? [],
      revisionUnchanged: api.state().revision === before.revision,
      documentUnchanged: JSON.stringify(api.exportDocument()) === before.document,
      cardIntent: document.querySelector("[data-proposal-intent]")?.textContent ?? null,
      fieldCleared: document.querySelector("[data-nestor-request]")?.value === "",
      sendLabel: document.querySelector("[data-nestor-request-send]")?.textContent ?? null,
    };
  }, beforeAsk);
  out.asked.sentVerbatim = seen[0]?.request === "add a lake with a flock of birds at sunset";
  out.asked.sentSummaryOnly = Array.isArray(seen[0]?.scene?.entities) && seen[0].scene.entities.length <= 60
    && seen[0].scene.entities.every((entity) => Object.keys(entity).sort().join(",") === "id,label,type");
  await page.screenshot({ path: path.join(ART, "nestor-request-card.png") });

  // 4. Apply: one attributed commit, the entities exist, the environment changed, the camera went to the lake.
  await page.click("[data-proposal-accept]");
  await page.waitForFunction((before) => window.__GRAPHYSX__.state().revision > before, beforeAsk.revision, { timeout: SMOKE_TIMEOUT });
  await page.waitForFunction(() => !window.__GRAPHYSX_HOST__.focusing, null, { timeout: SMOKE_TIMEOUT }).catch(() => {});
  out.applied = await page.evaluate((before) => {
    const api = window.__GRAPHYSX__;
    const nestor = window.__GRAPHYSX_NESTOR__.state();
    const last = api.history().at(-1);
    const lake = api.query({ ids: ["request-lake"] })[0];
    const birds = api.query({ ids: ["request-birds"] })[0];
    return {
      commits: api.history().length - before.commits,
      actor: last?.actor.id ?? null,
      intent: last?.intent ?? null,
      lake: lake ? { type: lake.type, label: lake.label } : null,
      birds: birds ? { type: birds.type, preset: birds.flock?.preset ?? null } : null,
      sky: api.state().environment?.sky ?? null,
      status: nestor.status,
      topic: nestor.topic,
      presentationTitle: nestor.presentation.title,
      outcome: document.querySelector("[data-proposal-outcome]")?.dataset.outcome ?? null,
      exported: JSON.stringify(api.exportDocument()).includes("request-lake"),
    };
  }, beforeAsk);
  await page.screenshot({ path: path.join(ART, "nestor-request-applied.png") });

  // 5. Undo reverses the whole request and the narration stops claiming it.
  await page.evaluate(() => window.__GRAPHYSX__.undo());
  out.undone = await page.evaluate(() => ({
    lakeGone: window.__GRAPHYSX__.query({ ids: ["request-lake"] }).length === 0,
    status: window.__GRAPHYSX_NESTOR__.state().status,
  }));

  // 6. A refusal: the provider's sentence reaches the card, the scene does not move.
  const beforeRefusal = await snapshot();
  await page.fill("[data-nestor-request]", "summon a dragon");
  await page.click("[data-nestor-request-send]");
  await page.waitForFunction(() => document.querySelector("[data-proposal-outcome]")?.dataset.outcome === "declined", null, { timeout: SMOKE_TIMEOUT });
  out.refused = await page.evaluate(() => ({
    text: document.querySelector("[data-proposal-outcome]")?.textContent ?? null,
    proposal: window.__GRAPHYSX_NESTOR__.state().proposal === null,
    proposing: !!document.querySelector(".gx-welcome--proposing"),
    fieldKept: document.querySelector("[data-nestor-request]")?.value ?? null,
  }));
  out.refused.unchanged = unchanged(beforeRefusal, await snapshot());
  await page.screenshot({ path: path.join(ART, "nestor-request-refused.png") });

  // 7. A forged namespace is refused on arrival, before any card exists.
  const beforeForge = await snapshot();
  await page.fill("[data-nestor-request]", "forge a teammate");
  await page.click("[data-nestor-request-send]");
  await page.waitForFunction(() => (document.querySelector("[data-proposal-outcome]")?.textContent ?? "").includes("live-agent:"), null, { timeout: SMOKE_TIMEOUT });
  out.forged = await page.evaluate(() => ({
    text: document.querySelector("[data-proposal-outcome]")?.textContent ?? null,
    proposal: window.__GRAPHYSX_NESTOR__.state().proposal === null,
  }));
  out.forged.unchanged = unchanged(beforeForge, await snapshot());

  // 8. The topic buttons still work with a provider configured, through the same provider.
  const beforeTopic = await snapshot();
  await page.click('[data-nestor-topic="build"]');
  await page.waitForSelector(".gx-welcome--proposing", { timeout: SMOKE_TIMEOUT });
  out.topicWithProvider = await page.evaluate((before) => ({
    intent: window.__GRAPHYSX_NESTOR__.state().proposal?.intent ?? null,
    revisionUnchanged: window.__GRAPHYSX__.state().revision === before.revision,
  }), beforeTopic);
  out.topicWithProvider.providerSawTopic = seen.some((request) => /Build something/.test(request.request));
  await page.click("[data-proposal-discard]");
  out.requestsTotal = proposeRequests.length;
} catch (error) {
  out.fatal = String(error?.stack || error);
} finally {
  await browser.close().catch(() => {});
  provider.close();
}

console.log(JSON.stringify(out, null, 2));
if (consoleErrors.length) console.log("console errors:", consoleErrors);
if (pageErrors.length) console.log("page errors:", pageErrors);

const ok = !out.fatal
  && out.noProvider?.disabled === true
  && /no model provider is configured/i.test(out.noProvider?.placeholder ?? "")
  && out.noProvider?.requests === 0
  && out.noProvider?.proposal === true
  && out.layout?.fieldEnabled === true
  // The row may not block any scene body the card did not already block at this framing, and the
  // card may not be taller than it was before the row existed (526px at 1280x720, measured on
  // 2026-10-25 before the change; 527px after it, the one pixel being line-height rounding of the
  // shortened briefing): a taller bottom-anchored card is the hazard the roadmap records.
  && Array.isArray(out.layout?.covered) && out.layout.covered.every((entry) => out.layout.coveredWithoutRow.some((other) => other.split(" -> ")[0] === entry.split(" -> ")[0]))
  && out.layout?.cardHeight <= 528
  && out.asked?.intent === LAKE_REPLY.intent
  && out.asked?.cardIntent === LAKE_REPLY.intent
  && out.asked?.commandCount === LAKE_REPLY.commands.length
  && out.asked?.types?.includes("water") && out.asked?.types?.includes("flock") && out.asked?.ops?.includes("set-environment")
  && out.asked?.revisionUnchanged && out.asked?.documentUnchanged
  && out.asked?.sentVerbatim && out.asked?.sentSummaryOnly
  && out.asked?.fieldCleared && out.asked?.sendLabel === "Ask"
  && out.applied?.commits === 1
  && out.applied?.actor === "nestor"
  && out.applied?.intent === LAKE_REPLY.intent
  && out.applied?.lake?.type === "water"
  && out.applied?.birds?.type === "flock" && out.applied?.birds?.preset === "starlings"
  && out.applied?.sky === "lostvalley"
  && out.applied?.status === "presenting:request"
  && out.applied?.topic === "request"
  && out.applied?.outcome === "accepted"
  && out.applied?.exported === true
  && out.undone?.lakeGone === true && out.undone?.status !== "presenting:request"
  && /dragon/.test(out.refused?.text ?? "") && out.refused?.proposal && !out.refused?.proposing && out.refused?.unchanged
  && out.refused?.fieldKept === "summon a dragon"
  && out.forged?.proposal && out.forged?.unchanged
  && out.topicWithProvider?.revisionUnchanged && out.topicWithProvider?.providerSawTopic
  && out.requestsTotal === 4;

process.exit(out.fatal || consoleErrors.length || pageErrors.length || !ok ? 1 : 0);
