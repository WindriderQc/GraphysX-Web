// Live Sessions, through the product.
//
// The protocol smoke proves the server. This proves the thing the product actually claims:
// two people, in two browsers, looking at the same scene, each seeing the other's work and
// the other's presence appear without a reload — plus an agent, outside both browsers,
// mutating the same scene through the same session and showing up in both.
//
// It runs against the built bundle (`dist/`), through the real `?session=` route, the real
// live-session client and the real panel. Nothing here reaches into module internals: every
// assertion is either something rendered on the page or something read back through the
// public `__GRAPHYSX__` API.

import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startSceneStore } from "../server/scene-store.mjs";
import { startStaticServer } from "./static-server.mjs";
import { applySmokeTimeout, launchSmokeBrowser, SMOKE_TIMEOUT } from "./smoke-harness.mjs";
import { check, report, seedDefinition, sleep } from "./live-session-harness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACTS = process.env.SMOKE_ARTIFACTS || path.join(ROOT, "output", "smoke");
const TOKEN = "live-browser-smoke-token";
const SCENE = "live-browser-fixture";

const results = [];
const browserProblems = [];
let store = null;
let statics = null;
let browser = null;
let dir = null;

/** Fails loudly on any console error or page error — a green assertion over a broken page
 *  is the failure mode this project has the most scar tissue about. */
function watch(page, label) {
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    // The store probe logs a benign refusal when no store is configured; everything else
    // is a real product error.
    if (/favicon/i.test(text)) return;
    browserProblems.push(`${label} console: ${text}`);
  });
  page.on("pageerror", (error) => browserProblems.push(`${label} pageerror: ${error.message}`));
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText ?? "";
    if (/ERR_ABORTED/.test(failure)) return; // navigation away from an open SSE stream
    browserProblems.push(`${label} requestfailed: ${request.url()} ${failure}`);
  });
}

const api = async (base, method, path_, body, credential) => {
  const response = await fetch(`${base}${path_}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(credential ? { "x-graphysx-session": credential } : { authorization: `Bearer ${TOKEN}` }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
};

try {
  await mkdir(ARTIFACTS, { recursive: true });
  dir = await mkdtemp(path.join(tmpdir(), "graphysx-live-browser-"));
  store = await startSceneStore({ port: 0, dir, token: TOKEN, origins: null, datalakeDir: null });
  statics = await startStaticServer({ root: path.join(ROOT, "dist"), port: 0 });
  const pageBase = statics.url.replace(/\/+$/, "");

  await fetch(`${store.url}/scenes/${SCENE}`, {
    method: "PUT",
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ definition: seedDefinition(SCENE), actor: "smoke" }),
  });

  const session = await api(store.url, "POST", "/sessions", { sceneName: SCENE, owner: { id: "owner-ada", label: "Ada" } });
  check(results, "session created for the browser run", session.status === 201, `status ${session.status}`);
  const sessionId = session.body.session.sessionId;
  const ownerCredential = session.body.credential;

  const inviteFor = async (role, capabilities) =>
    (await api(store.url, "POST", `/sessions/${sessionId}/invites`, {
      role, ttlSeconds: 600, ...(capabilities ? { capabilities } : {}),
    }, ownerCredential)).body;

  const alice = await inviteFor("editor");
  const bob = await inviteFor("editor");
  const carolViewer = await inviteFor("viewer");
  const agentInvite = await inviteFor("agent", ["transaction", "spawn"]);

  browser = await launchSmokeBrowser({ args: ["--no-sandbox", "--use-gl=swiftshader", "--disable-dev-shm-usage"] });

  const openTab = async (label, invite, actorId, viewport) => {
    const context = await browser.newContext(viewport ? { viewport } : {});
    const page = applySmokeTimeout(await context.newPage());
    watch(page, label);
    // The invitation rides in the fragment, exactly as a shared join link would.
    const url = `${pageBase}/?store=${encodeURIComponent(store.url)}&actor=${actorId}#session=${sessionId}&invite=${encodeURIComponent(invite.code)}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    // Polled from here rather than with `waitForFunction`: its default `raf` polling stalls
    // when the software rasteriser is saturating the box, which is exactly the condition
    // this smoke runs under. Polling from Node also means a timeout reports the last state
    // it saw instead of a bare "timeout exceeded" with nothing to diagnose.
    const deadline = Date.now() + SMOKE_TIMEOUT;
    let last = null;
    for (;;) {
      last = await page.evaluate(() => (window.__GRAPHYSX_LIVE_SESSION__ ? window.__GRAPHYSX_LIVE_SESSION__.status : null));
      if (last?.connection === "live") break;
      if (Date.now() > deadline) {
        throw new Error(`${label} never reached a live session (last state: ${JSON.stringify(last)})`);
      }
      await sleep(250);
    }
    return { context, page };
  };

  const first = await openTab("alice", alice, "alice", { width: 1280, height: 800 });
  const second = await openTab("bob", bob, "bob", { width: 1280, height: 800 });

  check(results, "two browsers reach a live connection",
    (await first.page.evaluate(() => window.__GRAPHYSX_LIVE_SESSION__.status.connection)) === "live" &&
    (await second.page.evaluate(() => window.__GRAPHYSX_LIVE_SESSION__.status.connection)) === "live");

  // The invitation must not survive in anything the browser keeps.
  const firstUrl = first.page.url();
  check(results, "the invitation is scrubbed from the address bar",
    !firstUrl.includes(alice.code) && !firstUrl.includes("invite="), firstUrl.slice(0, 160));
  const historyDepth = await first.page.evaluate(() => history.length);
  check(results, "scrubbing the invitation did not push a history entry", historyDepth <= 2, `history length ${historyDepth}`);

  // --- presence ------------------------------------------------------------------------

  await first.page.waitForFunction(() => window.__GRAPHYSX_LIVE_SESSION__.status.members.length >= 2);
  const roster = await first.page.$$eval(".gx-ls-member", (nodes) => nodes.map((node) => node.dataset.actor));
  check(results, "each browser renders the other member in the panel", roster.includes("alice") && roster.includes("bob"), roster.join(","));

  await second.page.evaluate(() => window.__GRAPHYSX_LIVE_SESSION__.publishPresence({ selection: ["anchor"], tool: "translate", color: "#44ddaa" }));
  await first.page.waitForFunction(() =>
    Boolean(document.querySelector('.gx-ls-member[data-actor="bob"] [data-role="selection"]')));
  const selectionText = await first.page.$eval('.gx-ls .gx-ls-member[data-actor="bob"] [data-role="selection"]', (node) => node.textContent);
  check(results, "a remote selection is visible in the other browser", selectionText?.includes("anchor"), selectionText ?? "none");

  const memberLabel = await first.page.$eval('.gx-ls-member[data-actor="bob"]', (node) => node.getAttribute("aria-label"));
  check(results, "members carry an accessible label", /Editor/.test(memberLabel ?? "") && /connected/.test(memberLabel ?? ""), memberLabel ?? "none");
  // Scoped to `.gx-ls`: the scene browser panel also uses `data-role="live"`, and an
  // unscoped selector reads that one instead — which is how this assertion passed against
  // the wrong element.
  const liveRegion = await first.page.$eval('.gx-ls [data-role="live"]', (node) => node.getAttribute("aria-live"));
  check(results, "the panel announces through a live region", liveRegion === "polite", liveRegion ?? "none");

  const revisionBefore = await first.page.evaluate(() => window.__GRAPHYSX_LIVE_SESSION__.status.revision);

  // --- live mutation, browser to browser -------------------------------------------------

  await first.page.evaluate(() => window.__GRAPHYSX_LIVE_SESSION__.submit(
    [{ op: "spawn", entity: { id: "alice-crate", type: "box", label: "Alice crate", transform: { position: [2, 0.5, 0] } } }],
    { intent: "alice adds a crate" },
  ));

  await second.page.waitForFunction(() =>
    Boolean(window.__GRAPHYSX__.query({ ids: ["alice-crate"] }).length));
  check(results, "one browser's spawn appears in the other without a reload", true);

  const bobSeesEntity = await second.page.evaluate(() => window.__GRAPHYSX__.query({ ids: ["alice-crate"] })[0]?.label);
  check(results, "the remote entity arrived intact", bobSeesEntity === "Alice crate", String(bobSeesEntity));

  await second.page.waitForFunction(() =>
    Boolean([...document.querySelectorAll(".gx-ls-activity li")].some((node) => /alice/i.test(node.textContent ?? ""))));
  const activity = await second.page.$eval(".gx-ls-activity li", (node) => node.textContent ?? "");
  check(results, "the activity feed attributes the change to its actor", /alice/i.test(activity), activity);
  check(results, "the activity feed does not leak the credential or the invitation",
    !activity.includes(alice.code) && !activity.includes(ownerCredential), "secret in activity");

  // …and back the other way.
  await second.page.evaluate(() => window.__GRAPHYSX_LIVE_SESSION__.submit(
    [{ op: "update", id: "alice-crate", patch: { label: "Bob renamed it" } }],
    { intent: "bob renames the crate" },
  ));
  await first.page.waitForFunction(() => window.__GRAPHYSX__.query({ ids: ["alice-crate"] })[0]?.label === "Bob renamed it");
  check(results, "the reply travels back to the first browser without a reload", true);

  // --- an agent, outside both browsers ---------------------------------------------------

  const agentJoin = await api(store.url, "POST", `/sessions/${sessionId}/join`,
    { code: agentInvite.code, actor: { id: "agent-x", label: "AgentX", kind: "agent" } });
  check(results, "an external agent joins the same session", agentJoin.status === 201, `status ${agentJoin.status}`);
  const agentCredential = agentJoin.body.credential;

  const agentOp = await api(store.url, "POST", `/sessions/${sessionId}/ops`, {
    opId: "browser-agent-1",
    path: "spawn",
    commands: [{ op: "spawn", entity: { id: "agent-crate", type: "box", label: "Agent crate", transform: { position: [-2, 0.5, 0] } } }],
    intent: "agent adds a crate",
  }, agentCredential);
  check(results, "the agent's operation is accepted", agentOp.status === 201, `status ${agentOp.status}`);

  await first.page.waitForFunction(() => Boolean(window.__GRAPHYSX__.query({ ids: ["agent-crate"] }).length));
  await second.page.waitForFunction(() => Boolean(window.__GRAPHYSX__.query({ ids: ["agent-crate"] }).length));
  check(results, "the agent's mutation reaches both browsers live", true);
  const agentActivity = await first.page.$$eval(".gx-ls-activity li", (nodes) =>
    nodes.map((node) => ({ kind: node.dataset.kind, text: node.textContent ?? "" })));
  check(results, "agent activity is distinguishable from human activity",
    agentActivity.some((entry) => entry.kind === "agent" && /AgentX/.test(entry.text)),
    JSON.stringify(agentActivity.slice(0, 3)));

  // --- convergence ------------------------------------------------------------------------

  const revisions = await Promise.all([
    first.page.evaluate(() => window.__GRAPHYSX_LIVE_SESSION__.status.revision),
    second.page.evaluate(() => window.__GRAPHYSX_LIVE_SESSION__.status.revision),
  ]);
  check(results, "both browsers converge on the same revision", revisions[0] === revisions[1], revisions.join(" vs "));
  check(results, "the revision advanced by exactly the three accepted operations",
    revisions[0] - revisionBefore === 3, `${revisionBefore} -> ${revisions[0]}`);

  const documents = await Promise.all([
    first.page.evaluate(() => JSON.stringify(window.__GRAPHYSX__.exportDocument()?.entities.map((e) => e.id).sort())),
    second.page.evaluate(() => JSON.stringify(window.__GRAPHYSX__.exportDocument()?.entities.map((e) => e.id).sort())),
  ]);
  check(results, "both browsers hold the identical document", documents[0] === documents[1], documents.join(" vs "));

  // Presence is not in the document — the invariant the whole design rests on.
  check(results, "presence never entered the portable document",
    !documents[0].includes("presence") && !documents[0].includes("cursor"), documents[0].slice(0, 200));

  // --- health indicator, viewer role, reconnect --------------------------------------------

  // Rendered-layout regression: the scene browser docks to the same corner, and the first
  // version of this panel sat directly on top of it. Assertions cannot see that; geometry can.
  const layout = await first.page.evaluate(() => {
    const box = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left };
    };
    return { live: box(".gx-ls"), scenes: box(".gx-sb"), viewport: { width: innerWidth, height: innerHeight } };
  });
  const overlaps = layout.live && layout.scenes &&
    layout.live.left < layout.scenes.right && layout.scenes.left < layout.live.right &&
    layout.live.top < layout.scenes.bottom && layout.scenes.top < layout.live.bottom;
  check(results, "the live panel does not overlap the scene browser", !overlaps, JSON.stringify(layout));
  check(results, "the live panel stays inside the viewport",
    layout.live && layout.live.bottom <= layout.viewport.height + 1 && layout.live.right <= layout.viewport.width + 1,
    JSON.stringify(layout.live));
  check(results, "the panels leave the middle of the viewport clear",
    layout.live && layout.live.left > layout.viewport.width * 0.55, JSON.stringify(layout.live));

  // --- the editor outliner (features 16-18) --------------------------------------------------
  //
  // The floating placement sat exactly on top of the editor's own right column. Docking into
  // it is what makes this an outliner rather than a sheet covering the thing it annotates.

  await first.page.evaluate(() => window.__GRAPHYSX_HOST__.editorReady());
  await first.page.evaluate(() => window.__GRAPHYSX_HOST__.setMode?.("editor") ?? window.__GRAPHYSX_HOST__.enterEditor?.());
  await first.page.waitForFunction(() => {
    const column = document.querySelector(".gx-ed-panel--right");
    return Boolean(column) && column.style.display !== "none";
  });
  await sleep(400);

  const docked = await first.page.evaluate(() => {
    const panel = document.querySelector(".gx-ls");
    const column = document.querySelector(".gx-ed-panel--right");
    const canvas = document.querySelector("canvas");
    const box = (node) => {
      const rect = node.getBoundingClientRect();
      return { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left, width: rect.width };
    };
    return {
      insideColumn: Boolean(panel && column && column.contains(panel)),
      hasDockedClass: panel?.classList.contains("gx-ls--docked") ?? false,
      panel: panel ? box(panel) : null,
      column: column ? box(column) : null,
      canvas: canvas ? box(canvas) : null,
      members: document.querySelectorAll(".gx-ls .gx-ls-member").length,
      liveRegion: document.querySelector(".gx-ls [data-role='live']")?.getAttribute("aria-live") ?? null,
    };
  });

  check(results, "the panel docks inside the editor's right column when the editor opens",
    docked.insideColumn && docked.hasDockedClass, JSON.stringify({ inside: docked.insideColumn, cls: docked.hasDockedClass }));
  check(results, "docked, it no longer overlaps the column it used to cover",
    docked.panel && docked.column && docked.panel.left >= docked.column.left - 1 && docked.panel.right <= docked.column.right + 1,
    JSON.stringify({ panel: docked.panel, column: docked.column }));
  check(results, "the outliner still shows the session members while docked",
    docked.members >= 2, `${docked.members} members`);
  check(results, "the live region survives the move",
    docked.liveRegion === "polite", String(docked.liveRegion));
  check(results, "the viewport is not covered by the docked outliner",
    docked.panel && docked.canvas && docked.panel.left > docked.canvas.width * 0.5,
    JSON.stringify({ panelLeft: docked.panel?.left, canvasWidth: docked.canvas?.width }));

  await first.page.screenshot({ path: path.join(ARTIFACTS, "live-session-editor.png") });

  // Leaving the editor returns it to the floating placement under the scene browser.
  await first.page.evaluate(() => window.__GRAPHYSX_HOST__.exitEditor?.() ?? window.__GRAPHYSX_HOST__.setMode?.("scene"));
  await sleep(600);
  const undocked = await first.page.evaluate(() => {
    const panel = document.querySelector(".gx-ls");
    return {
      docked: panel?.classList.contains("gx-ls--docked") ?? null,
      inContainer: panel?.parentElement?.id === "app" || panel?.parentElement?.tagName === "DIV",
      top: panel ? Math.round(panel.getBoundingClientRect().top) : null,
    };
  });
  check(results, "leaving the editor returns the panel to its floating placement",
    undocked.docked === false && (undocked.top ?? 0) > 0, JSON.stringify(undocked));

  const health = await first.page.$eval('.gx-ls [data-role="health"]', (node) => node.textContent ?? "");
  check(results, "the health indicator reports connection, revision, sequence and latency",
    /live/.test(health) && /rev/.test(health) && /seq/.test(health) && /rtt/.test(health), health);

  const viewerContext = await browser.newContext();
  const viewerPage = applySmokeTimeout(await viewerContext.newPage());
  watch(viewerPage, "carol");
  await viewerPage.goto(
    `${pageBase}/?store=${encodeURIComponent(store.url)}&actor=carol#session=${sessionId}&invite=${encodeURIComponent(carolViewer.code)}`,
    { waitUntil: "domcontentloaded" },
  );
  await viewerPage.waitForFunction(() => window.__GRAPHYSX_LIVE_SESSION__?.status.connection === "live");
  const viewerAttempt = await viewerPage.evaluate(async () => {
    try {
      await window.__GRAPHYSX_LIVE_SESSION__.submit([{ op: "spawn", entity: { id: "carol-crate", type: "box" } }]);
      return "allowed";
    } catch (error) {
      return String(error?.message ?? error);
    }
  });
  check(results, "a viewer's mutation is refused", viewerAttempt !== "allowed", viewerAttempt);
  const viewerLeak = await first.page.evaluate(() => Boolean(window.__GRAPHYSX__.query({ ids: ["carol-crate"] }).length));
  check(results, "the refused viewer mutation never reached the other browsers", viewerLeak === false);

  // A dropped connection must recover on its own and land on the same revision.
  await second.page.evaluate(() => window.__GRAPHYSX_LIVE_SESSION__.leave());
  await second.page.waitForFunction(() => window.__GRAPHYSX_LIVE_SESSION__.status.connection === "offline");
  // Scoped again: `.gx-sb` (the scene browser) also has a `data-role="dot"` status light.
  const offlineNote = await second.page.$eval('.gx-ls [data-role="dot"]', (node) => node.dataset.state);
  check(results, "a disconnected browser shows an offline state", offlineNote === "offline", offlineNote ?? "none");

  await first.page.evaluate(() => window.__GRAPHYSX_LIVE_SESSION__.submit(
    [{ op: "spawn", entity: { id: "while-away-crate", type: "box", label: "While away" } }], { intent: "while bob is away" },
  ));
  const rejoined = await second.page.evaluate(async (args) => {
    await window.__GRAPHYSX_LIVE_SESSION__.join(args.sessionId, args.code, { id: "bob", label: "bob", kind: "human" });
    return window.__GRAPHYSX_LIVE_SESSION__.status.revision;
  }, { sessionId, code: (await inviteFor("editor")).code });
  check(results, "a rejoining browser catches up to the current revision",
    rejoined === (await first.page.evaluate(() => window.__GRAPHYSX_LIVE_SESSION__.status.revision)), String(rejoined));
  const caughtUp = await second.page.evaluate(() => Boolean(window.__GRAPHYSX__.query({ ids: ["while-away-crate"] }).length));
  check(results, "the rejoining browser has the work it missed", caughtUp === true);

  // --- rendered evidence -------------------------------------------------------------------

  await first.page.waitForFunction(() => (window.__GRAPHYSX__.state()?.elapsedSeconds ?? 0) > 0.4);
  await first.page.screenshot({ path: path.join(ARTIFACTS, "live-session-desktop.png") });
  await first.page.setViewportSize({ width: 420, height: 860 });
  await sleep(400);
  const mobilePanel = await first.page.$eval(".gx-ls", (node) => {
    const rect = node.getBoundingClientRect();
    return { width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom };
  });
  check(results, "the panel stays on screen at a phone width",
    mobilePanel.right <= 421 && mobilePanel.bottom <= 861 && mobilePanel.height <= 860 * 0.5,
    JSON.stringify(mobilePanel));
  await first.page.screenshot({ path: path.join(ARTIFACTS, "live-session-mobile.png") });

  check(results, "no console errors, page errors or failed requests in any browser",
    browserProblems.length === 0, browserProblems.slice(0, 5).join(" | "));

  await viewerContext.close();
  await first.context.close();
  await second.context.close();
} catch (error) {
  check(results, "smoke-live-sessions-browser threw", false, error instanceof Error ? error.stack : String(error));
} finally {
  if (browser) await browser.close();
  if (statics) await statics.close();
  if (store) await store.close();
  if (dir) await rm(dir, { recursive: true, force: true });
}

report(results, "smoke-live-sessions-browser");
