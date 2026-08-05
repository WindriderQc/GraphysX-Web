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
const OTHER_SCENE = "live-browser-other";

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

const readObserverBoundary = (page) => page.evaluate(() => {
  const welcome = document.querySelector(".gx-welcome");
  const scenes = document.querySelector(".gx-sb");
  return {
    observer: welcome?.classList.contains("gx-welcome--live-observer") ?? false,
    eyebrow: welcome?.querySelector("[data-nestor-eyebrow]")?.textContent ?? "",
    actionButtons: welcome?.querySelectorAll(
      ".gx-go-editor, .gx-go-games, .gx-go-browse, [data-nestor-topic]",
    ).length ?? -1,
    welcomeButtons: welcome?.querySelectorAll("button").length ?? -1,
    scenes: {
      present: Boolean(scenes),
      hidden: scenes?.hidden ?? false,
      inert: scenes?.inert ?? false,
      ariaHidden: scenes?.getAttribute("aria-hidden") ?? null,
      attached: Boolean(window.__GRAPHYSX_SCENE_BROWSER__?.session()),
    },
    mode: window.__GRAPHYSX_HOST__?.mode ?? null,
  };
});

const waitForObserverBoundary = async (page, label) => {
  const deadline = Date.now() + SMOKE_TIMEOUT;
  let last = null;
  for (;;) {
    last = await readObserverBoundary(page);
    if (last.observer && last.actionButtons === 0 && last.scenes.hidden && last.scenes.inert) return last;
    if (Date.now() > deadline) {
      return { ...last, waitTimedOut: label };
    }
    await sleep(200);
  }
};

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
  const otherDefinition = {
    ...seedDefinition(OTHER_SCENE),
    entities: [{ id: "other-anchor", type: "box", label: "Other anchor", transform: { position: [8, 0.5, 0] } }],
  };
  const otherSeed = await fetch(`${store.url}/scenes/${OTHER_SCENE}`, {
    method: "PUT",
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ definition: otherDefinition, actor: "smoke" }),
  });
  check(results, "a distinct scene is available for the disabled-browser probe", otherSeed.ok, `status ${otherSeed.status}`);

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

  const observerBoundaries = await Promise.all([
    waitForObserverBoundary(first.page, "alice"),
    waitForObserverBoundary(second.page, "bob"),
  ]);
  check(results, "live attach presents the observer welcome in both browsers",
    observerBoundaries.every((state) => state.observer && /live session attached/i.test(state.eyebrow)),
    JSON.stringify(observerBoundaries));
  check(results, "the observer welcome exposes no Editor, Games, Browse or Nestor actions",
    observerBoundaries.every((state) => state.actionButtons === 0 && state.welcomeButtons === 0),
    JSON.stringify(observerBoundaries.map((state) => ({ actions: state.actionButtons, buttons: state.welcomeButtons }))));
  check(results, "live attach leaves SceneBrowser hidden, inert and detached",
    observerBoundaries.every((state) => state.scenes.present && state.scenes.hidden && state.scenes.inert
      && state.scenes.ariaHidden === "true" && state.scenes.attached === false),
    JSON.stringify(observerBoundaries.map((state) => state.scenes)));

  // The returned SceneBrowser API is public, so hiding its buttons is not enough. Attempt to
  // open a deliberately different stored scene and prove the live snapshot stays authoritative.
  const directOpen = await first.page.evaluate(async (otherScene) => {
    const snapshot = () => JSON.stringify(window.__GRAPHYSX__.exportDocument());
    const before = snapshot();
    const revisionBefore = window.__GRAPHYSX_LIVE_SESSION__.status.revision;
    await window.__GRAPHYSX_SCENE_BROWSER__.open(otherScene);
    await new Promise((resolve) => setTimeout(resolve, 300));
    return {
      before,
      after: snapshot(),
      revisionBefore,
      revisionAfter: window.__GRAPHYSX_LIVE_SESSION__.status.revision,
      worldId: window.__GRAPHYSX__.exportDocument()?.id ?? null,
      otherAnchor: window.__GRAPHYSX__.query({ ids: ["other-anchor"] }).length,
      browserAttached: Boolean(window.__GRAPHYSX_SCENE_BROWSER__.session()),
    };
  }, OTHER_SCENE);
  const peerAfterDirectOpen = await second.page.evaluate(() => JSON.stringify(window.__GRAPHYSX__.exportDocument()));
  check(results, "a programmatic SceneBrowser.open cannot replace the shared live document",
    directOpen.before === directOpen.after && directOpen.after === peerAfterDirectOpen
      && directOpen.worldId === SCENE && directOpen.otherAnchor === 0 && directOpen.browserAttached === false
      && directOpen.revisionBefore === directOpen.revisionAfter,
    JSON.stringify({ ...directOpen, before: directOpen.before.slice(0, 80), after: directOpen.after.slice(0, 80) }));

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

  // Rendered-layout regression: live observers retain the session panel but not a second,
  // overlapping navigation surface.
  const layout = await first.page.evaluate(() => {
    const box = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left };
    };
    const scenes = document.querySelector(".gx-sb");
    return {
      live: box(".gx-ls"),
      scenes: { hidden: scenes?.hidden ?? false, inert: scenes?.inert ?? false },
      viewport: { width: innerWidth, height: innerHeight },
    };
  });
  check(results, "the observer layout keeps SceneBrowser hidden and inert",
    layout.scenes.hidden && layout.scenes.inert, JSON.stringify(layout.scenes));
  check(results, "the live panel stays inside the viewport",
    layout.live && layout.live.bottom <= layout.viewport.height + 1 && layout.live.right <= layout.viewport.width + 1,
    JSON.stringify(layout.live));
  check(results, "the live panel leaves the middle of the viewport clear",
    layout.live && layout.live.left > layout.viewport.width * 0.55, JSON.stringify(layout.live));

  // --- attach race: an offline editor must yield to the authoritative live scene ------------

  const authoritativeBeforeAttach = await api(
    store.url, "GET", `/sessions/${sessionId}/snapshot`, undefined, ownerCredential,
  );
  check(results, "the attach race starts from an authoritative server snapshot",
    authoritativeBeforeAttach.status === 200, `status ${authoritativeBeforeAttach.status}`);
  const authoritativeDefinitionBeforeAttach = JSON.stringify(authoritativeBeforeAttach.body.definition);
  const authoritativeRevisionBeforeAttach = authoritativeBeforeAttach.body.revision;
  const authoritativeEntitiesBeforeAttach = JSON.stringify(
    [...authoritativeBeforeAttach.body.definition.entities]
      .map((entity) => [entity.id, entity.type, entity.label ?? null])
      .sort((left, right) => String(left[0]).localeCompare(String(right[0]))),
  );

  await first.page.evaluate(async () => window.__GRAPHYSX_LIVE_SESSION__.leave());
  await first.page.waitForFunction(() => window.__GRAPHYSX_LIVE_SESSION__.status.connection === "offline");
  await first.page.waitForSelector(".gx-welcome--scene-resume .gx-go-editor");
  await first.page.click(".gx-welcome--scene-resume .gx-go-editor");
  await first.page.waitForFunction(() => {
    const column = document.querySelector(".gx-ed-panel--right");
    return window.__GRAPHYSX_HOST__?.mode === "editor" && Boolean(column) && column.style.display !== "none";
  });

  const localEditorDraft = await first.page.evaluate(() => {
    window.__GRAPHYSX__.spawn({
      id: "offline-editor-crate",
      type: "box",
      label: "Offline editor draft",
      transform: { position: [5, 0.5, 0] },
    });
    return {
      mode: window.__GRAPHYSX_HOST__.mode,
      present: Boolean(window.__GRAPHYSX__.query({ ids: ["offline-editor-crate"] }).length),
    };
  });
  check(results, "after leaving live, the client can enter the editor and create local work",
    localEditorDraft.mode === "editor" && localEditorDraft.present, JSON.stringify(localEditorDraft));

  const sharedDuringLocalEdit = await second.page.evaluate(() => ({
    entities: JSON.stringify(
      [...window.__GRAPHYSX__.exportDocument().entities]
        .map((entity) => [entity.id, entity.type, entity.label ?? null])
        .sort((left, right) => String(left[0]).localeCompare(String(right[0]))),
    ),
    revision: window.__GRAPHYSX_LIVE_SESSION__.status.revision,
    localDraft: Boolean(window.__GRAPHYSX__.query({ ids: ["offline-editor-crate"] }).length),
  }));
  check(results, "offline editor work does not alter the shared live snapshot",
    sharedDuringLocalEdit.entities === authoritativeEntitiesBeforeAttach
      && sharedDuringLocalEdit.revision === authoritativeRevisionBeforeAttach
      && sharedDuringLocalEdit.localDraft === false,
    JSON.stringify({ revision: sharedDuringLocalEdit.revision, localDraft: sharedDuringLocalEdit.localDraft }));

  // Hold the first rejoin's snapshot after its invitation exchange. Authority must be visible
  // synchronously — before a server document can arrive and before callers can await join().
  const snapshotRoute = `**/sessions/${sessionId}/snapshot`;
  let heldSnapshotCount = 0;
  let markSnapshotHeld;
  const snapshotHeld = new Promise((resolve) => { markSnapshotHeld = resolve; });
  let releaseHeldSnapshot;
  const snapshotReleased = new Promise((resolve) => { releaseHeldSnapshot = resolve; });
  const holdNextSnapshot = async (route) => {
    // Capture a real authenticated 200 response, then withhold only its delivery. That makes
    // the later revocation proof independent of server timing or credential cleanup.
    const upstream = await route.fetch();
    heldSnapshotCount += 1;
    markSnapshotHeld();
    await snapshotReleased;
    await route.fulfill({ response: upstream });
  };
  await first.page.route(snapshotRoute, holdNextSnapshot, { times: 1 });

  const pendingEditorInvite = await inviteFor("editor");
  await first.page.evaluate((args) => {
    window.__GRAPHYSX_PENDING_JOIN__ = window.__GRAPHYSX_LIVE_SESSION__.join(
      args.sessionId,
      args.code,
      { id: "alice", label: "alice", kind: "human" },
    ).then(
      (member) => ({ ok: true, member }),
      (error) => ({
        ok: false,
        status: error?.status ?? null,
        message: String(error?.message ?? error),
        code: error?.code ?? null,
      }),
    );
  }, { sessionId, code: pendingEditorInvite.code });

  const snapshotReachedBarrier = await Promise.race([
    snapshotHeld.then(() => true),
    sleep(SMOKE_TIMEOUT).then(() => false),
  ]);
  if (!snapshotReachedBarrier) throw new Error("Alice's rejoin never reached the held snapshot request");

  // A direct read, not a wait: the snapshot is still held and join() is still pending.
  const pendingAuthority = await first.page.evaluate((expectedSessionId) => {
    const status = window.__GRAPHYSX_LIVE_SESSION__.status;
    const welcome = document.querySelector(".gx-welcome");
    const scenes = document.querySelector(".gx-sb");
    return {
      claimedSession: status.sessionId,
      connection: status.connection,
      role: status.role,
      actorId: status.actorId,
      mode: window.__GRAPHYSX_HOST__.mode,
      observer: welcome?.classList.contains("gx-welcome--live-observer") ?? false,
      actionButtons: welcome?.querySelectorAll(
        ".gx-go-editor, .gx-go-games, .gx-go-browse, [data-nestor-topic]",
      ).length ?? -1,
      welcomeButtons: welcome?.querySelectorAll("button").length ?? -1,
      scenes: {
        hidden: scenes?.hidden ?? false,
        inert: scenes?.inert ?? false,
        ariaHidden: scenes?.getAttribute("aria-hidden") ?? null,
        attached: Boolean(window.__GRAPHYSX_SCENE_BROWSER__.session()),
      },
      expectedSessionId,
      preSnapshotDraft: Boolean(window.__GRAPHYSX__.query({ ids: ["offline-editor-crate"] }).length),
    };
  }, sessionId);
  check(results, "pending join claims observer authority before its snapshot resolves",
    heldSnapshotCount === 1
      && pendingAuthority.claimedSession === sessionId
      && pendingAuthority.connection === "connecting"
      && pendingAuthority.role === "editor"
      && pendingAuthority.actorId === "alice"
      && pendingAuthority.mode === "scene"
      && pendingAuthority.observer
      && pendingAuthority.actionButtons === 0
      && pendingAuthority.welcomeButtons === 0
      && pendingAuthority.scenes.hidden
      && pendingAuthority.scenes.inert
      && pendingAuthority.scenes.ariaHidden === "true"
      && pendingAuthority.scenes.attached === false
      && pendingAuthority.preSnapshotDraft,
    JSON.stringify(pendingAuthority));

  // Leave revokes this generation while its snapshot response is still held. Work authored
  // after Leave belongs to the local editor and the stale join must never overwrite it.
  await first.page.evaluate(async () => window.__GRAPHYSX_LIVE_SESSION__.leave());
  await first.page.waitForSelector(".gx-welcome--scene-resume .gx-go-editor");
  await first.page.click(".gx-welcome--scene-resume .gx-go-editor");
  await first.page.waitForFunction(() => window.__GRAPHYSX_HOST__.mode === "editor");
  const postLeaveDraft = await first.page.evaluate(() => {
    window.__GRAPHYSX__.spawn({
      id: "post-leave-local-draft",
      type: "sphere",
      label: "Post-leave local draft",
      transform: { position: [6, 0.75, 0] },
    });
    const status = window.__GRAPHYSX_LIVE_SESSION__.status;
    return {
      sessionId: status.sessionId,
      actorId: status.actorId,
      connection: status.connection,
      mode: window.__GRAPHYSX_HOST__.mode,
      present: Boolean(window.__GRAPHYSX__.query({ ids: ["post-leave-local-draft"] }).length),
    };
  });
  check(results, "Leave revokes the pending authority before local work resumes",
    postLeaveDraft.sessionId === null && postLeaveDraft.actorId === null
      && postLeaveDraft.connection === "offline" && postLeaveDraft.mode === "editor"
      && postLeaveDraft.present,
    JSON.stringify(postLeaveDraft));

  releaseHeldSnapshot();
  const staleJoin = await first.page.evaluate(async () => {
    const pending = window.__GRAPHYSX_PENDING_JOIN__;
    delete window.__GRAPHYSX_PENDING_JOIN__;
    return await pending;
  });
  const afterStaleJoin = await first.page.evaluate(() => {
    const status = window.__GRAPHYSX_LIVE_SESSION__.status;
    return {
      sessionId: status.sessionId,
      actorId: status.actorId,
      connection: status.connection,
      error: status.error,
      mode: window.__GRAPHYSX_HOST__.mode,
      postLeaveDraft: Boolean(window.__GRAPHYSX__.query({ ids: ["post-leave-local-draft"] }).length),
    };
  });
  check(results, "the revoked join cannot overwrite post-Leave work or reclaim the session",
    staleJoin.ok === false && staleJoin.status === 409 && staleJoin.code === "session-authority-revoked"
      && afterStaleJoin.sessionId === null && afterStaleJoin.actorId === null
      && afterStaleJoin.connection === "offline" && afterStaleJoin.error === null
      && afterStaleJoin.mode === "editor" && afterStaleJoin.postLeaveDraft,
    JSON.stringify({ staleJoin, afterStaleJoin }));

  // A second generation, with a second one-use invitation and no held response, is the real
  // successful reattach. It must replace both local drafts with the authoritative document.
  const successfulEditorInvite = await inviteFor("editor");
  await first.page.evaluate(async (args) => {
    await window.__GRAPHYSX_LIVE_SESSION__.join(
      args.sessionId,
      args.code,
      { id: "alice", label: "alice", kind: "human" },
    );
  }, { sessionId, code: successfulEditorInvite.code });
  await first.page.waitForFunction(() =>
    window.__GRAPHYSX_LIVE_SESSION__.status.connection === "live");

  const boundaryAfterReattach = await waitForObserverBoundary(first.page, "alice reattach");
  await first.page.waitForFunction(() =>
    window.__GRAPHYSX_HOST__?.mode === "scene"
      && !window.__GRAPHYSX__.query({ ids: ["offline-editor-crate", "post-leave-local-draft"] }).length);

  const afterReattach = await Promise.all([
    first.page.evaluate(() => ({
      entities: JSON.stringify(
        [...window.__GRAPHYSX__.exportDocument().entities]
          .map((entity) => [entity.id, entity.type, entity.label ?? null])
          .sort((left, right) => String(left[0]).localeCompare(String(right[0]))),
      ),
      revision: window.__GRAPHYSX_LIVE_SESSION__.status.revision,
      mode: window.__GRAPHYSX_HOST__.mode,
      localDrafts: window.__GRAPHYSX__.query({
        ids: ["offline-editor-crate", "post-leave-local-draft"],
      }).map((entity) => entity.id),
    })),
    second.page.evaluate(() => ({
      entities: JSON.stringify(
        [...window.__GRAPHYSX__.exportDocument().entities]
          .map((entity) => [entity.id, entity.type, entity.label ?? null])
          .sort((left, right) => String(left[0]).localeCompare(String(right[0]))),
      ),
      revision: window.__GRAPHYSX_LIVE_SESSION__.status.revision,
      localDrafts: window.__GRAPHYSX__.query({
        ids: ["offline-editor-crate", "post-leave-local-draft"],
      }).map((entity) => entity.id),
    })),
  ]);
  const authoritativeAfterAttach = await api(
    store.url, "GET", `/sessions/${sessionId}/snapshot`, undefined, ownerCredential,
  );
  check(results, "fresh live attach wins the editor race and restores the observer boundary",
    afterReattach[0].mode === "scene" && boundaryAfterReattach.observer
      && boundaryAfterReattach.actionButtons === 0 && boundaryAfterReattach.welcomeButtons === 0
      && boundaryAfterReattach.scenes.hidden && boundaryAfterReattach.scenes.inert
      && boundaryAfterReattach.scenes.attached === false,
    JSON.stringify({ boundary: boundaryAfterReattach, client: afterReattach[0] }));
  check(results, "reattach restores the authoritative snapshot without publishing the local draft",
    authoritativeAfterAttach.status === 200
      && authoritativeAfterAttach.body.revision === authoritativeRevisionBeforeAttach
      && JSON.stringify(authoritativeAfterAttach.body.definition) === authoritativeDefinitionBeforeAttach
      && afterReattach[0].entities === authoritativeEntitiesBeforeAttach
      && afterReattach[1].entities === authoritativeEntitiesBeforeAttach
      && afterReattach[0].revision === authoritativeRevisionBeforeAttach
      && afterReattach[1].revision === authoritativeRevisionBeforeAttach
      && afterReattach.every((state) => state.localDrafts.length === 0),
    JSON.stringify({
      serverStatus: authoritativeAfterAttach.status,
      serverRevision: authoritativeAfterAttach.body?.revision,
      clients: afterReattach.map((state) => ({ revision: state.revision, localDrafts: state.localDrafts })),
    }));

  await first.page.screenshot({ path: path.join(ARTIFACTS, "live-session-observer-reattach.png") });

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
    mobilePanel.right <= 421 && mobilePanel.bottom <= 861
      // CSS max-height constrains the content box; allow its border/padding around the 50% cap.
      && mobilePanel.height <= 860 * 0.51,
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
