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
import { isDeepStrictEqual } from "node:util";
import { createSceneStoreServer, startSceneStore } from "../server/scene-store.mjs";
import { startStaticServer } from "./static-server.mjs";
import { applySmokeTimeout, launchSmokeBrowser, SMOKE_TIMEOUT } from "./smoke-harness.mjs";
import { check, createActor, report, requestText, seedDefinition, sleep, waitForStore } from "./live-session-harness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACTS = process.env.SMOKE_ARTIFACTS || path.join(ROOT, "output", "smoke");
const TOKEN = "live-browser-smoke-token";
const SCENE = "live-browser-fixture";
const OTHER_SCENE = "live-browser-other";

const results = [];
const browserProblems = [];
const expectedHttpConsoleScopes = [];
const expectedHttpConsoleByPage = new WeakMap();
let browserStorePathPrefix = "";
let store = null;
let statics = null;
let browser = null;
let dir = null;
let agentActor = null;
const missionActors = [];

// On loaded Windows hosts, listen(0) can occasionally return a lease whose loopback TCP
// handshake never finishes (the server remains in SYN_RECEIVED). A real health response is
// the readiness boundary. Discard an unreachable lease before Chromium or any assertion
// exists; never retry a product request after the contract starts.
const startReachableLocalServer = async (label, start, connectionCount = 1) => {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    let candidate = null;
    try {
      candidate = await start();
      await waitForStore(candidate.url, { timeoutMs: 5_000 });
      // Create every request synchronously before the event loop can return a response, so
      // the Agent must establish the requested number of distinct keep-alive sockets.
      const probes = await Promise.all(Array.from({ length: connectionCount }, () =>
        requestText(candidate.url + "/health", { timeoutMs: 5_000 })));
      if (probes.some((response) => response.status !== 200)) {
        throw new Error(label + " socket reserve did not pass health readiness");
      }
      return candidate;
    } catch (error) {
      lastError = error;
      await candidate?.close().catch(() => undefined);
      if (attempt < 3) {
        console.warn(`[live-browser] ${label} lease failed readiness; requesting a fresh ephemeral port (${attempt}/3)`);
      }
    }
  }
  throw lastError ?? new Error(label + " could not acquire a reachable local port");
};

function expectHttpConsoleErrors(page, label, specifications) {
  const scope = {
    label,
    active: true,
    entries: specifications.map(({ path: expectedPath, status, count = 1 }) => ({
      path: expectedPath,
      status,
      count,
      observed: 0,
      locations: [],
    })),
  };
  expectedHttpConsoleScopes.push(scope);
  const pageScopes = expectedHttpConsoleByPage.get(page) ?? [];
  pageScopes.push(scope);
  expectedHttpConsoleByPage.set(page, pageScopes);
  return scope;
}

function consumeExpectedHttpConsoleError(page, message, text) {
  const match = /Failed to load resource: the server responded with a status of (\d+)/i.exec(text);
  if (!match) return false;
  const status = Number(match[1]);
  const locationUrl = message.location()?.url ?? "";
  let locationPath = null;
  if (locationUrl) {
    try {
      locationPath = new URL(locationUrl).pathname;
      if (browserStorePathPrefix
        && (locationPath === browserStorePathPrefix
          || locationPath.startsWith(browserStorePathPrefix + "/"))) {
        locationPath = locationPath.slice(browserStorePathPrefix.length) || "/";
      }
    } catch {
      return false;
    }
  }
  for (const scope of expectedHttpConsoleByPage.get(page) ?? []) {
    if (!scope.active) continue;
    const entry = scope.entries.find((candidate) =>
      candidate.status === status
        && candidate.observed < candidate.count
        // Chromium normally supplies the failed request URL. If it does not, the active,
        // page-scoped status/count tuple is still exact and bounded to this recovery probe.
        && (locationPath === null || candidate.path === locationPath));
    if (!entry) continue;
    entry.observed += 1;
    entry.locations.push(locationUrl || "(location unavailable)");
    return true;
  }
  return false;
}

async function sealExpectedHttpConsoleErrors(scope) {
  const deadline = Date.now() + 1_000;
  while (scope.entries.some((entry) => entry.observed < entry.count) && Date.now() < deadline) {
    await sleep(20);
  }
  scope.active = false;
}

/** Fails loudly on any console error or page error — a green assertion over a broken page
 *  is the failure mode this project has the most scar tissue about. */
function watch(page, label) {
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    // The store probe logs a benign refusal when no store is configured; everything else
    // is a real product error.
    if (/favicon/i.test(text)) return;
    if (consumeExpectedHttpConsoleError(page, message, text)) return;
    browserProblems.push(`${label} console: ${text}`);
  });
  page.on("pageerror", (error) => browserProblems.push(`${label} pageerror: ${error.message}`));
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText ?? "";
    if (/ERR_ABORTED/.test(failure)) return; // navigation away from an open SSE stream
    const opId = (() => {
      try { return JSON.parse(request.postData() ?? "null")?.opId ?? null; } catch { return null; }
    })();
    browserProblems.push(
      `${label} requestfailed: ${request.method()} ${request.url()} ${failure}${opId ? ` opId=${opId}` : ""}`,
    );
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

const waitForAgentCount = async (page, expected, label) => {
  const deadline = Date.now() + SMOKE_TIMEOUT;
  let last = null;
  for (;;) {
    last = await page.evaluate(() => window.__GRAPHYSX_LIVE_PRESENCE__?.state() ?? null);
    if (last?.agents?.length === expected) return last;
    if (Date.now() > deadline) throw new Error(`${label}: expected ${expected} live agents; last state ${JSON.stringify(last)}`);
    await sleep(120);
  }
};

const waitForQuietAgentProjection = async (page, expected, label) => {
  const deadline = Date.now() + SMOKE_TIMEOUT;
  let last = null;
  for (;;) {
    last = await page.evaluate(() => ({
      presence: window.__GRAPHYSX_LIVE_PRESENCE__?.state() ?? null,
      reactions: window.__GRAPHYSX__?.query({ tag: "nestor-live-activity" }).length ?? -1,
    }));
    if (last.presence?.agents.length === expected && !last.presence.signalVisible && last.reactions === 0) return last;
    if (Date.now() > deadline) {
      throw new Error(label + ": live-agent projection did not settle; last state " + JSON.stringify(last));
    }
    await sleep(100);
  }
};

// Node-side polling remains responsive when multiple software-WebGL tabs saturate Chromium;
// requestAnimationFrame-based waits can stall even though the session transport is healthy.
const waitForLive = async (page, label, timeout = SMOKE_TIMEOUT) => {
  const deadline = Date.now() + timeout;
  let last = null;
  for (;;) {
    last = await page.evaluate(() =>
      window.__GRAPHYSX_LIVE_SESSION__?.status ?? null);
    if (last?.connection === "live") return last;
    if (Date.now() > deadline) {
      throw new Error(`${label} never returned live (last state: ${JSON.stringify(last)})`);
    }
    await sleep(100);
  }
};

const armOperationResponses = async (page, { opId, mode, count }) => {
  const id = await page.evaluate((specification) =>
    window.__GRAPHYSX_TEST_ARM_OPERATION_RESPONSES__(specification), { opId, mode, count });
  const captured = (async () => {
    const deadline = Date.now() + SMOKE_TIMEOUT;
    for (;;) {
      const observed = await page.evaluate((controlId) =>
        window.__GRAPHYSX_TEST_OPERATION_RESPONSE_COUNT__(controlId), id);
      if (observed >= count) return observed;
      if (Date.now() > deadline) {
        throw new Error(`${opId} captured ${observed}/${count} native operation responses`);
      }
      await sleep(25);
    }
  })();
  return {
    captured,
    release: () => page.evaluate((controlId) =>
      window.__GRAPHYSX_TEST_RELEASE_OPERATION_RESPONSES__(controlId), id),
  };
};

const waitForAgentReaction = async (page, revision, label) => {
  const deadline = Date.now() + SMOKE_TIMEOUT;
  let last = null;
  for (;;) {
    last = await page.evaluate(() => window.__GRAPHYSX_LIVE_PRESENCE__?.state() ?? null);
    if (last?.activity?.kind === "operation" && last.activity.revision === revision && last.signalVisible) return last;
    if (Date.now() > deadline) throw new Error(`${label}: Nestor never showed revision ${revision}; last state ${JSON.stringify(last)}`);
    await sleep(100);
  }
};

const waitForAgentAt = async (page, actorId, expected, label, tolerance = 0.02, axes = [0, 1, 2]) => {
  const deadline = Date.now() + SMOKE_TIMEOUT;
  let last = null;
  for (;;) {
    last = await page.evaluate((id) => window.__GRAPHYSX_LIVE_PRESENCE__?.state().agents.find(
      (agent) => agent.actorId === id,
    ) ?? null, actorId);
    if (last && axes.every((index) => Math.abs(last.position[index] - expected[index]) < tolerance)) return last;
    if (Date.now() > deadline) {
      throw new Error(`${label}: avatar did not reach ${expected.join(",")} on axes ${axes.join(",")}; last ${JSON.stringify(last)}`);
    }
    await sleep(100);
  }
};

const readPresenceInvariant = (page) => page.evaluate(() => {
  const api = window.__GRAPHYSX__;
  const projection = JSON.parse(window.render_game_to_text());
  const avatarIds = api.query({ tag: "live-agent" }).map((entity) => entity.id).sort();
  return {
    liveRevision: window.__GRAPHYSX_LIVE_SESSION__.status.revision,
    runtimeRevision: api.state()?.revision ?? -1,
    history: JSON.stringify(api.history()),
    document: JSON.stringify(api.exportDocument()),
    fullExport: JSON.stringify(api.export()),
    avatarIds,
    avatarObjects: avatarIds.map((id) => ({
      id,
      uuid: window.__GRAPHYSX_HOST__.world.getEntityObject(id)?.uuid ?? null,
    })),
    reactionIds: api.query({ tag: "nestor-live-activity" }).map((entity) => entity.id).sort(),
    presence: window.__GRAPHYSX_LIVE_PRESENCE__?.state() ?? null,
    projectedPresence: projection.livePresence ?? null,
  };
});

const readMissionInvariant = (page) => page.evaluate(() => {
  const api = window.__GRAPHYSX__;
  const state = api.state();
  const projection = JSON.parse(window.render_game_to_text());
  return {
    liveRevision: window.__GRAPHYSX_LIVE_SESSION__.status.revision,
    runtimeRevision: state?.revision ?? -1,
    history: JSON.stringify(api.history()),
    document: JSON.stringify(api.exportDocument()),
    fullExport: JSON.stringify(api.export()),
    selectedIds: [...(state?.selectedIds ?? [])].sort(),
    missionIds: api.query({ tag: "live-mission" }).map((entity) => entity.id).sort(),
    boardIds: api.query({ tag: "mission-board" }).map((entity) => entity.id).sort(),
    artifactIds: api.query({ tag: "mission-artifact" }).map((entity) => entity.id).sort(),
    completionIds: api.query({ tag: "mission-completion" }).map((entity) => entity.id).sort(),
    mission: window.__GRAPHYSX_LIVE_MISSION__?.state() ?? null,
    presence: window.__GRAPHYSX_LIVE_PRESENCE__?.state() ?? null,
    projectedMission: projection.liveMission ?? null,
    resources: {
      geometries: window.__GRAPHYSX_HOST__.renderer.info.memory.geometries,
      textures: window.__GRAPHYSX_HOST__.renderer.info.memory.textures,
    },
  };
});

const readMissionMotionInvariant = (page) => page.evaluate(() => {
  const api = window.__GRAPHYSX__;
  const missionEntities = api.query({ tag: "live-mission" });
  const agentEntities = api.query({ tag: "live-agent" });
  return {
    motionPreference: document.documentElement.dataset.gxMotion ?? null,
    missionIds: missionEntities.map((entity) => entity.id).sort(),
    animatedMissionIds: missionEntities
      .filter((entity) => (entity.behaviors?.length ?? 0) > 0)
      .map((entity) => entity.id)
      .sort(),
    agentIds: agentEntities.map((entity) => entity.id).sort(),
    animatedAgentIds: agentEntities
      .filter((entity) => (entity.behaviors?.length ?? 0) > 0)
      .map((entity) => entity.id)
      .sort(),
    boardIds: api.query({ tag: "mission-board" }).map((entity) => entity.id).sort(),
    artifactIds: api.query({ tag: "mission-artifact" }).map((entity) => entity.id).sort(),
    runtime: window.__GRAPHYSX_LIVE_MISSION__?.state() ?? null,
  };
});

const primeRendererResources = (page, label, timeout = SMOKE_TIMEOUT) => page.evaluate(async ({ sampleLabel, timeoutMs }) => {
  const host = window.__GRAPHYSX_HOST__;
  const previous = [];
  host.scene.traverse((object) => {
    if (!object.visible || !(object.isMesh || object.isLine || object.isPoints)) return;
    previous.push([object, object.frustumCulled]);
    object.frustumCulled = false;
  });
  const startFrame = host.frameCount;
  try {
    await new Promise((resolve, reject) => {
      const startedAt = performance.now();
      const poll = () => {
        if (host.frameCount > startFrame) resolve();
        else if (performance.now() - startedAt >= timeoutMs) reject(new Error(`${sampleLabel}: host frame did not advance`));
        else window.setTimeout(poll, 50);
      };
      poll();
    });
    return {
      geometries: host.renderer.info.memory.geometries,
      textures: host.renderer.info.memory.textures,
    };
  } finally {
    for (const [object, frustumCulled] of previous) object.frustumCulled = frustumCulled;
  }
}, { sampleLabel: label, timeoutMs: timeout });

const readPrimedMissionInvariant = async (page, label) => {
  const resources = await primeRendererResources(page, label);
  const invariant = await readMissionInvariant(page);
  return { ...invariant, resources };
};

const waitForMission = async (page, missionId, predicate, label, timeout = SMOKE_TIMEOUT) => {
  const deadline = Date.now() + timeout;
  let last = null;
  for (;;) {
    last = await page.evaluate((id) =>
      window.__GRAPHYSX_LIVE_SESSION__?.status.missions.find((mission) => mission.missionId === id) ?? null,
    missionId);
    if (last && predicate(last)) return last;
    if (Date.now() > deadline) {
      throw new Error(label + ": mission " + missionId + " did not converge; last state " + JSON.stringify(last));
    }
    await sleep(100);
  }
};

const waitForMissionRuntime = async (page, predicate, label, timeout = SMOKE_TIMEOUT) => {
  const deadline = Date.now() + timeout;
  let last = null;
  for (;;) {
    last = await page.evaluate(() => window.__GRAPHYSX_LIVE_MISSION__?.state() ?? null);
    if (last && predicate(last)) return last;
    if (Date.now() > deadline) {
      throw new Error(label + ": mission runtime did not converge; last state " + JSON.stringify(last));
    }
    await sleep(100);
  }
};

const waitForMissionProjection = async (page, missionId, artifactCount, label, timeout = SMOKE_TIMEOUT) => {
  const deadline = Date.now() + timeout;
  let last = null;
  for (;;) {
    last = await page.evaluate(() => JSON.parse(window.render_game_to_text()).liveMission ?? null);
    if (last?.mission?.missionId === missionId && last.boardVisible && last.artifacts.length === artifactCount) return last;
    if (Date.now() > deadline) {
      throw new Error(label + ": rendered mission projection did not converge; last state " + JSON.stringify(last));
    }
    await sleep(100);
  }
};

const settleRenderProfile = async (page, viewport, expectedProfile) => {
  const startFrame = await page.evaluate(() => window.__GRAPHYSX_HOST__.frameCount);
  await page.setViewportSize(viewport);
  await page.waitForFunction(({ frame, profile }) => {
    const host = window.__GRAPHYSX_HOST__;
    return host?.qualityProfile?.name === profile
      && document.documentElement.dataset.gxRenderProfile === profile
      && host.frameCount > frame;
  }, { frame: startFrame, profile: expectedProfile });
};

const sampleRendererBudget = async (page, label, viewport, expectedProfile) => {
  await settleRenderProfile(page, viewport, expectedProfile);
  return page.evaluate(async ({ sampleLabel, profileName, timeoutMs }) => {
    const host = window.__GRAPHYSX_HOST__;
    const renderer = host.renderer;
    const previousAutoReset = renderer.info.autoReset;
    let reading = null;
    try {
      renderer.info.autoReset = false;
      renderer.info.reset();
      const startFrame = host.frameCount;
      const startedAt = performance.now();
      let timedOut = false;
      await new Promise((resolve) => {
        const poll = () => {
          if (host.frameCount - startFrame >= 24) resolve();
          else if (performance.now() - startedAt >= timeoutMs) {
            timedOut = true;
            resolve();
          } else window.setTimeout(poll, 16);
        };
        poll();
      });
      const elapsedMs = performance.now() - startedAt;
      const frames = host.frameCount - startFrame;
      const render = { ...renderer.info.render };
      const runtime = window.__GRAPHYSX_LIVE_MISSION__?.state() ?? null;
      const evidenceCount = runtime?.mission?.stages.reduce((count, stage) => count + stage.evidence.length, 0) ?? 0;
      const artifactCap = profileName === "mobile" ? 2 : 4;
      reading = {
        label: sampleLabel,
        expectedProfile: profileName,
        profile: { ...host.qualityProfile },
        rootProfile: document.documentElement.dataset.gxRenderProfile ?? null,
        viewport: { width: innerWidth, height: innerHeight },
        timedOut,
        elapsedMs: Number(elapsedMs.toFixed(1)),
        frames,
        totals: { calls: render.calls, triangles: render.triangles },
        callsPerFrame: frames ? Number((render.calls / frames).toFixed(2)) : null,
        trianglesPerFrame: frames ? Number((render.triangles / frames).toFixed(1)) : null,
        actorId: window.__GRAPHYSX_LIVE_SESSION__.status.actorId,
        agentCount: window.__GRAPHYSX_LIVE_PRESENCE__?.state().agents.length ?? -1,
        reactionRootCount: window.__GRAPHYSX__.query({ tag: "nestor-live-activity" }).length,
        missionStatus: runtime?.mission?.status ?? null,
        boardRootCount: window.__GRAPHYSX__.query({ tag: "mission-board" }).length,
        artifactRootCount: window.__GRAPHYSX__.query({ tag: "mission-artifact" }).length,
        artifactViewCount: runtime?.artifacts.length ?? 0,
        evidenceCount,
        artifactCap,
        expectedArtifactCount: Math.min(evidenceCount, artifactCap),
      };
    } finally {
      renderer.info.reset();
      renderer.info.autoReset = previousAutoReset;
    }
    return reading;
  }, { sampleLabel: label, profileName: expectedProfile, timeoutMs: SMOKE_TIMEOUT });
};

const api = async (base, method, path_, body, credential) => {
  const retryableTransport = method === "GET"
    || (/\/ops$/.test(path_) && typeof body?.opId === "string");
  let response;
  let lastError = null;
  for (let attempt = 0; attempt < (retryableTransport ? 3 : 1); attempt += 1) {
    try {
      response = await requestText(`${base}${path_}`, {
        method,
        headers: {
          "content-type": "application/json",
          ...(credential ? { "x-graphysx-session": credential } : { authorization: `Bearer ${TOKEN}` }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      break;
    } catch (error) {
      lastError = error;
      if (!retryableTransport || attempt === 2) break;
      await sleep(100 * (attempt + 1));
    }
  }
  if (!response) throw new Error(`Browser smoke ${method} ${path_} transport failed: ${lastError?.message ?? "unknown transport error"}`, { cause: lastError });
  let payload = null;
  try {
    payload = response.text ? JSON.parse(response.text) : null;
  } catch {
    payload = null;
  }
  return { status: response.status, body: payload };
};

const acceptedOperationStatus = (status) => status === 200 || status === 201;
const acceptedMissionStatus = (status) => status === 200 || status === 201;

const normalizeSerializedDocument = (serialized) => {
  const definition = JSON.parse(serialized);
  definition.entities = [...definition.entities].sort((left, right) => left.id.localeCompare(right.id));
  return definition;
};

const putFixture = async (url, definition) => {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await requestText(url, {
        method: "PUT",
        headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify({ definition, actor: "smoke" }),
      });
    } catch (error) {
      lastError = error;
      await sleep(150 * (attempt + 1));
    }
  }
  throw lastError ?? new Error(`Could not seed ${url}`);
};

const navigate = async (page, url, label) => {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await page.goto(url, { waitUntil: "domcontentloaded" });
    } catch (error) {
      lastError = error;
      await sleep(250 * (attempt + 1));
    }
  }
  throw new Error(`${label} navigation failed after three attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
};

try {
  await mkdir(ARTIFACTS, { recursive: true });
  dir = await mkdtemp(path.join(tmpdir(), "graphysx-live-browser-"));
  const suppliedBase = process.env.SMOKE_BASE?.replace(/\/+$/, "") || null;
  let pageBase;
  if (suppliedBase) {
    // A supplied web deployment is external to this process, so retain the standalone local
    // store path used by explicit staging runs.
    store = await startReachableLocalServer("scene store", () => startSceneStore({
      port: 0,
      dir,
      token: TOKEN,
      origins: null,
      datalakeDir: null,
      keepAliveTimeoutMs: 15 * 60 * 1000,
    }), 8);
    pageBase = suppliedBase;
    await waitForStore(pageBase, { timeoutMs: 60_000 });
  } else {
    // Production proxies the real store at same-origin /store. Mount the exact store request
    // handler under that path too: no mock, no CORS preflight, and no second browser TCP
    // origin that exists only in the smoke.
    const engine = createSceneStoreServer({
      dir,
      token: TOKEN,
      origins: null,
      datalakeDir: null,
    });
    const storeRequest = engine.server.listeners("request")[0];
    if (typeof storeRequest !== "function") throw new Error("scene store has no request handler");
    const routeStore = (request, response) => {
      const rawUrl = request.url ?? "/";
      const pathname = new URL(rawUrl, "http://localhost").pathname;
      if (pathname !== "/store" && !pathname.startsWith("/store/")) return false;
      const tail = rawUrl.slice("/store".length);
      request.url = tail.startsWith("?") ? "/" + tail : tail || "/";
      storeRequest(request, response);
      return true;
    };
    // This contract spans several minutes under software WebGL. Keep browser and Node
    // keep-alive sockets valid for its lifecycle; production retains its normal 72 seconds.
    statics = await startReachableLocalServer("same-origin web/store server", () => startStaticServer({
      root: path.join(ROOT, "dist"),
      routeRequest: routeStore,
      port: 0,
      keepAliveTimeoutMs: 15 * 60 * 1000,
    }), 8);
    pageBase = statics.url.replace(/\/+$/, "");
    browserStorePathPrefix = "/store";
    store = {
      url: pageBase + browserStorePathPrefix,
      close: () => engine.sessions.closeAll(),
    };
    await waitForStore(store.url, { timeoutMs: 5_000 });
  }

  browser = await launchSmokeBrowser({ args: ["--no-sandbox", "--use-gl=swiftshader", "--disable-dev-shm-usage"] });

  // A one-box fixture can prove protocol convergence but cannot prove that Nestor visibly
  // reacts. Bootstrap the real shipping AgentX Center through the product, then make that
  // portable document the session authority. This also prevents a hand-maintained test copy
  // of the center from drifting away from what visitors actually receive.
  const bootstrapContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const bootstrapPage = applySmokeTimeout(await bootstrapContext.newPage());
  watch(bootstrapPage, "center bootstrap");
  await navigate(bootstrapPage, `${pageBase}/`, "AgentX Center bootstrap");
  const bootstrapDeadline = Date.now() + SMOKE_TIMEOUT;
  let centerReady = false;
  while (!centerReady && Date.now() <= bootstrapDeadline) {
    centerReady = await bootstrapPage.evaluate(() => Boolean(
      window.__GRAPHYSX__?.query({ ids: [
        "showroom-nestor",
        "showroom-nestor-console-build",
        "showroom-nestor-console-play",
        "showroom-nestor-console-explore",
      ] }).length === 4,
    ));
    if (!centerReady) await sleep(200);
  }
  const centerDefinition = centerReady
    ? await bootstrapPage.evaluate((id) => {
      const definition = window.__GRAPHYSX__.exportDocument();
      return definition ? { ...definition, id, label: "Live AgentX Center fixture" } : null;
    }, SCENE)
    : null;
  check(results, "the live fixture bootstraps the real AgentX Center", Boolean(
    centerDefinition?.entities?.some((entity) => entity.id === "showroom-nestor")
      && ["build", "play", "explore"].every((topic) => centerDefinition.entities.some(
        (entity) => entity.id === `showroom-nestor-console-${topic}`,
      )),
  ), centerDefinition ? `${centerDefinition.entities.length} entities` : "center did not become ready");
  await bootstrapContext.close();
  if (!centerDefinition) throw new Error("Could not export the AgentX Center fixture");

  const centerSeed = await putFixture(`${store.url}/scenes/${SCENE}`, centerDefinition);
  check(results, "the exported AgentX Center seeds the live store", centerSeed.ok, `status ${centerSeed.status}`);
  const otherDefinition = {
    ...seedDefinition(OTHER_SCENE),
    entities: [{ id: "other-anchor", type: "box", label: "Other anchor", transform: { position: [8, 0.5, 0] } }],
  };
  const otherSeed = await putFixture(`${store.url}/scenes/${OTHER_SCENE}`, otherDefinition);
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

  const openTab = async (label, invite, actorId, viewport) => {
    const context = await browser.newContext(viewport ? { viewport } : {});
    const page = applySmokeTimeout(await context.newPage());
    watch(page, label);
    // Keep the product client untouched while allowing one exact transport replay below.
    // EventSource is an EventTarget, so redispatching the captured server payload exercises
    // the real registered client listener rather than a test-only operation path.
    await page.addInitScript(() => {
      // Render-budget sampling needs a deterministic capable-desktop baseline. GitHub's
      // four-core runner otherwise selects the product's legitimate balanced profile,
      // making the later high/mobile comparison impossible rather than merely slower.
      Object.defineProperty(navigator, "hardwareConcurrency", { configurable: true, get: () => 16 });
      Object.defineProperty(navigator, "deviceMemory", { configurable: true, get: () => 8 });
      const nativeFetch = window.fetch.bind(window);
      let snapshotHoldSerial = 0;
      const snapshotHolds = new Map();
      let operationResponseSerial = 0;
      const operationResponses = new Map();
      window.fetch = async (...args) => {
        const response = await nativeFetch(...args);
        const requestUrl = String(args[0] instanceof Request ? args[0].url : args[0]);
        const hold = [...snapshotHolds.values()].find((candidate) => candidate.armed);
        if (hold?.armed && /\/sessions\/[^/]+\/snapshot(?:\?|$)/.test(requestUrl)) {
          hold.armed = false;
          hold.captured = true;
          await hold.gate;
        }
        const requestMethod = String(
          args[1]?.method ?? (args[0] instanceof Request ? args[0].method : "GET"),
        ).toUpperCase();
        let requestOpId = null;
        if (requestMethod === "POST" && /\/sessions\/[^/]+\/ops(?:\?|$)/.test(requestUrl)) {
          try {
            const body = typeof args[1]?.body === "string" ? JSON.parse(args[1].body) : null;
            requestOpId = typeof body?.opId === "string" ? body.opId : null;
          } catch {
            requestOpId = null;
          }
        }
        const operationControl = [...operationResponses.values()].find((control) =>
          control.armed && control.opId === requestOpId);
        if (operationControl) {
          operationControl.captured += 1;
          if (operationControl.captured >= operationControl.count) operationControl.armed = false;
          if (operationControl.mode === "hold") await operationControl.gate;
          if (operationControl.mode === "mask") {
            return new Response("null", {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          }
        }
        return response;
      };
      window.__GRAPHYSX_TEST_HOLD_SNAPSHOT__ = () => {
        const id = ++snapshotHoldSerial;
        let release = () => undefined;
        const gate = new Promise((resolve) => { release = resolve; });
        snapshotHolds.set(id, { id, armed: true, captured: false, gate, release });
        return id;
      };
      window.__GRAPHYSX_TEST_SNAPSHOT_CAPTURED__ = (id) =>
        snapshotHolds.get(id)?.captured ?? false;
      window.__GRAPHYSX_TEST_RELEASE_SNAPSHOT__ = (id) => {
        const hold = snapshotHolds.get(id);
        if (!hold) return false;
        snapshotHolds.delete(id);
        hold.release();
        return true;
      };
      window.__GRAPHYSX_TEST_ARM_OPERATION_RESPONSES__ = ({ opId, mode, count }) => {
        const id = ++operationResponseSerial;
        let release = () => undefined;
        const gate = new Promise((resolve) => { release = resolve; });
        operationResponses.set(id, {
          id,
          opId,
          mode,
          count,
          captured: 0,
          armed: true,
          gate,
          release,
        });
        return id;
      };
      window.__GRAPHYSX_TEST_OPERATION_RESPONSE_COUNT__ = (id) =>
        operationResponses.get(id)?.captured ?? -1;
      window.__GRAPHYSX_TEST_RELEASE_OPERATION_RESPONSES__ = (id) => {
        const control = operationResponses.get(id);
        if (!control) return false;
        control.armed = false;
        control.release();
        return true;
      };
      const NativeEventSource = window.EventSource;
      let sourceSerial = 0;
      const sourceIds = new WeakMap();
      const sourceCloseCounts = new Map();
      let activeSource = null;
      let lastOperationData = null;
      let submitOnNextHello = null;
      let dropAfterNextMission = false;
      let missionCatchupDropCount = 0;
      let resyncMarkerCount = 0;
      class TrackedEventSource extends NativeEventSource {
        constructor(url, init) {
          super(url, init);
          const sourceId = ++sourceSerial;
          sourceIds.set(this, sourceId);
          sourceCloseCounts.set(sourceId, 0);
          activeSource = this;
          super.addEventListener("op", (event) => {
            lastOperationData = event.data;
          });
          super.addEventListener("resync", () => { resyncMarkerCount += 1; });
          super.addEventListener("mission", () => {
            if (!dropAfterNextMission) return;
            dropAfterNextMission = false;
            // This listener precedes the product listener. The microtask lets the retained
            // mission event be cached first, then drops this catch-up stream before its
            // terminal presence cut can prove continuity.
            queueMicrotask(() => {
              missionCatchupDropCount += 1;
              this.dispatchEvent(new Event("error"));
            });
          });
          super.addEventListener("hello", () => {
            if (!submitOnNextHello) return;
            const request = submitOnNextHello;
            submitOnNextHello = null;
            // This listener is registered before the product's hello listener. Defer one
            // microtask so the attempt observes the state the product exposed *after*
            // processing hello; otherwise even the old premature-live bug looks blocked.
            queueMicrotask(() => {
              void window.__GRAPHYSX_LIVE_SESSION__.submit(request.commands, request.options)
                .then(() => { window.__GRAPHYSX_TEST_HELLO_SUBMIT__ = "allowed"; })
                .catch((error) => {
                  window.__GRAPHYSX_TEST_HELLO_SUBMIT__ = String(error?.code ?? error?.message ?? error);
                });
            });
          });
        }

        close() {
          const sourceId = sourceIds.get(this);
          if (sourceId !== undefined) {
            sourceCloseCounts.set(sourceId, (sourceCloseCounts.get(sourceId) ?? 0) + 1);
          }
          super.close();
        }
      }
      window.EventSource = TrackedEventSource;
      window.__GRAPHYSX_TEST_STREAM_STATE__ = () => ({
        activeSourceId: activeSource ? (sourceIds.get(activeSource) ?? null) : null,
        closeCounts: Object.fromEntries(sourceCloseCounts),
      });
      window.__GRAPHYSX_TEST_REPLAY_LAST_OP__ = () => {
        if (!activeSource || !lastOperationData) return false;
        activeSource.dispatchEvent(new MessageEvent("op", { data: lastOperationData }));
        return true;
      };
      window.__GRAPHYSX_TEST_LAST_OP__ = () => lastOperationData;
      window.__GRAPHYSX_TEST_FORCE_MUST_RESYNC__ = () => {
        const status = window.__GRAPHYSX_LIVE_SESSION__?.status;
        if (!activeSource || !status) return false;
        activeSource.dispatchEvent(new MessageEvent("hello", { data: JSON.stringify({
          revision: status.revision,
          seq: status.seq,
          role: status.role,
          mustResync: true,
        }) }));
        return true;
      };
      window.__GRAPHYSX_TEST_CLOSE_STREAM__ = () => {
        if (!activeSource) return false;
        activeSource.close();
        return true;
      };
      window.__GRAPHYSX_TEST_SUBMIT_ON_NEXT_HELLO__ = (commands, options) => {
        window.__GRAPHYSX_TEST_HELLO_SUBMIT__ = null;
        submitOnNextHello = { commands, options };
      };
      window.__GRAPHYSX_TEST_FORCE_STREAM_ERROR__ = () => {
        if (!activeSource) return false;
        activeSource.dispatchEvent(new Event("error"));
        return true;
      };
      window.__GRAPHYSX_TEST_DROP_NEXT_MISSION_CATCHUP__ = () => {
        dropAfterNextMission = true;
        return true;
      };
      window.__GRAPHYSX_TEST_MISSION_CATCHUP_DROP_COUNT__ = () => missionCatchupDropCount;
      window.__GRAPHYSX_TEST_RESYNC_MARKER_COUNT__ = () => resyncMarkerCount;
    });
    // The invitation rides in the fragment, exactly as a shared join link would.
    const url = `${pageBase}/?store=${encodeURIComponent(store.url)}&actor=${actorId}#session=${sessionId}&invite=${encodeURIComponent(invite.code)}`;
    await navigate(page, url, `${label} live-session page`);
    // Polled from here rather than with `waitForFunction`: its default `raf` polling stalls
    // when the software rasteriser is saturating the box, which is exactly the condition
    // this smoke runs under. Polling from Node also means a timeout reports the last state
    // it saw instead of a bare "timeout exceeded" with nothing to diagnose.
    // Two simultaneous real AgentX Centers are intentionally heavier than the one-box
    // fixture this smoke used to load. Give software WebGL a full cold-start window; the
    // global verify deadline still catches an actually wedged tab.
    await waitForLive(page, label, Math.max(SMOKE_TIMEOUT, 90_000));
    if (!suppliedBase) {
      // Keep one finite same-origin HTTP connection active beside the long-lived SSE stream.
      // This stabilises Chromium's Windows loopback pool during the ten-minute software-WebGL
      // smoke; failures remain visible to the strict request/console sentinel. Product requests
      // are never retried, and production/external-base runs do not install this harness probe.
      await page.evaluate(async (healthUrl) => {
        const probe = async () => {
          const response = await fetch(healthUrl, { cache: "no-store" });
          if (!response.ok) {
            throw new Error(`GraphysX smoke store keepalive returned ${response.status}`);
          }
        };
        await probe();
        let inFlight = null;
        let timer = null;
        const tick = () => {
          if (inFlight) return;
          inFlight = probe().catch((error) => {
            if (timer !== null) clearInterval(timer);
            console.error("GraphysX smoke store keepalive failed", error);
          }).finally(() => {
            inFlight = null;
          });
        };
        timer = setInterval(tick, 1_000);
        window.__GRAPHYSX_TEST_STOP_STORE_KEEPALIVE__ = async () => {
          if (timer !== null) clearInterval(timer);
          timer = null;
          if (inFlight) await inFlight;
          // End with a directly awaited probe: cleanup cannot hide a late transport failure.
          await probe();
          await new Promise((resolve) => setTimeout(resolve, 0));
        };
      }, `${store.url}/health`);
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
  const stableIdServerBefore = await api(store.url, "GET", `/sessions/${sessionId}/snapshot`, undefined, ownerCredential);

  const stableIdPreflight = await first.page.evaluate(async () => {
    const api = window.__GRAPHYSX__;
    const client = window.__GRAPHYSX_LIVE_SESSION__;
    const before = JSON.stringify(api.exportDocument());
    const beforeRevision = client.status.revision;
    const attempts = [
      [{ op: "spawn", entity: { type: "box", label: "missing live entity id" } }],
      [{ op: "spawn", entity: {
        id: "missing-live-behavior-id", type: "box",
        behaviors: [{ type: "spin", axis: "y", speedDegrees: 10 }],
      } }],
      [{ op: "update", id: "showroom-nestor", patch: {
        interactions: [{ type: "toggle-visibility", targetIds: ["showroom-nestor"] }],
      } }],
    ];
    const codes = [];
    for (let index = 0; index < attempts.length; index += 1) {
      try {
        await client.submit(attempts[index], { opId: `browser-missing-stable-id-${index}` });
        codes.push("allowed");
      } catch (error) {
        codes.push(error?.code ?? String(error?.message ?? error));
      }
    }
    return {
      codes,
      before,
      after: JSON.stringify(api.exportDocument()),
      beforeRevision,
      afterRevision: client.status.revision,
    };
  });
  const stableIdServer = await api(store.url, "GET", `/sessions/${sessionId}/snapshot`, undefined, ownerCredential);
  check(results, "live generated-id commands are refused before optimistic mutation",
    stableIdPreflight.codes.every((code) => code === "live-spawn-id-required")
      && stableIdPreflight.before === stableIdPreflight.after
      && stableIdPreflight.beforeRevision === stableIdPreflight.afterRevision
      && Number(stableIdServer.body.revision) === Number(stableIdServerBefore.body.revision)
      && JSON.stringify(stableIdServer.body.definition) === JSON.stringify(stableIdServerBefore.body.definition),
    JSON.stringify({
      codes: stableIdPreflight.codes,
      localRevision: `${stableIdPreflight.beforeRevision}->${stableIdPreflight.afterRevision}`,
      serverRevision: `${stableIdServerBefore.body.revision}->${stableIdServer.body.revision}`,
      localInert: stableIdPreflight.before === stableIdPreflight.after,
      serverInert: JSON.stringify(stableIdServer.body.definition) === JSON.stringify(stableIdServerBefore.body.definition),
    }));

  // --- live mutation, browser to browser -------------------------------------------------

  await first.page.evaluate(() => window.__GRAPHYSX_LIVE_SESSION__.submit(
    [{ op: "spawn", entity: { id: "alice-crate", type: "box", label: "Alice crate", transform: { position: [2, 0.5, 0] } } }],
    { intent: "alice adds a crate" },
  ));

  await first.page.waitForFunction(() =>
    [...document.querySelectorAll('.gx-ls-activity li[data-actor="alice"]')]
      .some((node) => /Alice crate/i.test(node.textContent ?? "")));
  const aliceOwnActivityCount = await first.page.$$eval(
    '.gx-ls-activity li[data-actor="alice"]',
    (nodes) => nodes.filter((node) => /Alice crate/i.test(node.textContent ?? "")).length,
  );
  check(results, "the submitting browser observes its accepted operation exactly once",
    aliceOwnActivityCount === 1, `Alice own activity rows ${aliceOwnActivityCount}`);

  await first.page.waitForFunction(() => Boolean(window.__GRAPHYSX_TEST_LAST_OP__?.()));
  const replayBefore = await first.page.evaluate(() => ({
    revision: window.__GRAPHYSX__.state().revision,
    document: JSON.stringify(window.__GRAPHYSX__.exportDocument()),
    resynced: window.__GRAPHYSX_LIVE_SESSION__.status.resynced,
    activityCount: [...document.querySelectorAll('.gx-ls-activity li[data-actor="alice"]')]
      .filter((node) => /Alice crate/i.test(node.textContent ?? "")).length,
    schema: JSON.parse(window.__GRAPHYSX_TEST_LAST_OP__() ?? "null")?.schema ?? null,
  }));
  const replayDispatched = await first.page.evaluate(() => window.__GRAPHYSX_TEST_REPLAY_LAST_OP__());
  await sleep(350);
  const replayAfter = await first.page.evaluate(() => ({
    revision: window.__GRAPHYSX__.state().revision,
    document: JSON.stringify(window.__GRAPHYSX__.exportDocument()),
    resynced: window.__GRAPHYSX_LIVE_SESSION__.status.resynced,
    activityCount: [...document.querySelectorAll('.gx-ls-activity li[data-actor="alice"]')]
      .filter((node) => /Alice crate/i.test(node.textContent ?? "")).length,
  }));
  check(results, "a replayed own echo is ignored without reapply, duplicate callback, or resync",
    replayDispatched
      && replayBefore.schema === "graphysx.live-op/v1"
      && replayBefore.revision === replayAfter.revision
      && replayBefore.document === replayAfter.document
      && replayBefore.activityCount === 1
      && replayAfter.activityCount === 1
      && replayBefore.resynced === false
      && replayAfter.resynced === false,
    JSON.stringify({ replayDispatched, replayBefore: { ...replayBefore, document: "omitted" }, replayAfter: { ...replayAfter, document: "omitted" } }));

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

  await second.page.waitForFunction(() =>
    [...document.querySelectorAll('.gx-ls-activity li[data-actor="bob"]')]
      .some((node) => /changed alice-crate/i.test(node.textContent ?? "")));
  const bobOwnActivityCount = await second.page.$$eval(
    '.gx-ls-activity li[data-actor="bob"]',
    (nodes) => nodes.filter((node) => /changed alice-crate/i.test(node.textContent ?? "")).length,
  );
  check(results, "receipt-first and echo-first ordering cannot duplicate an own-operation callback",
    bobOwnActivityCount === 1, `Bob own activity rows ${bobOwnActivityCount}`);

  // Hold Alice's already-accepted HTTP receipt while Bob lands a newer operation. The SSE
  // path advances Alice to Bob's revision first; releasing Alice's older receipt afterward
  // must not move the shared revision backward.
  const operationUrl = `${store.url}/sessions/${sessionId}/ops`;
  const delayedReceiptControl = await armOperationResponses(first.page, {
    opId: "browser-delayed-receipt-1",
    mode: "hold",
    count: 1,
  });
  const delayedSubmit = first.page.evaluate(() => window.__GRAPHYSX_LIVE_SESSION__.submit(
    [{ op: "spawn", entity: { id: "delayed-receipt-crate", type: "box", label: "Delayed receipt crate" } }],
    { opId: "browser-delayed-receipt-1", intent: "alice waits on an old receipt" },
  ));
  const delayedReceiptCaptured = await delayedReceiptControl.captured;
  await second.page.waitForFunction(() =>
    window.__GRAPHYSX__.query({ ids: ["delayed-receipt-crate"] }).length === 1);
  const interleavedReceipt = await second.page.evaluate(() => window.__GRAPHYSX_LIVE_SESSION__.submit(
    [{ op: "spawn", entity: { id: "interleaved-bob-crate", type: "box", label: "Interleaved Bob crate" } }],
    { opId: "browser-interleaved-bob-1", intent: "bob lands after alice" },
  ));
  await first.page.waitForFunction(() =>
    window.__GRAPHYSX__.query({ ids: ["interleaved-bob-crate"] }).length === 1);
  const newerOwnReceipt = await first.page.evaluate(() => window.__GRAPHYSX_LIVE_SESSION__.submit(
    [{ op: "spawn", entity: { id: "newer-own-crate", type: "box", label: "Newer own crate" } }],
    { opId: "browser-newer-own-1", intent: "alice lands a newer own operation" },
  ));
  await second.page.waitForFunction(() =>
    window.__GRAPHYSX__.query({ ids: ["newer-own-crate"] }).length === 1);
  const revisionBeforeOldReceipt = await first.page.evaluate(() => window.__GRAPHYSX_LIVE_SESSION__.status.revision);
  const delayedReceiptReleased = await delayedReceiptControl.release();
  const delayedReceipt = await delayedSubmit;
  const revisionAfterOldReceipt = await first.page.evaluate(() => window.__GRAPHYSX_LIVE_SESSION__.status.revision);
  check(results, "a late own receipt cannot move revision or ownership behind newer operations",
    delayedReceiptCaptured === 1 && delayedReceiptReleased
      && revisionBeforeOldReceipt === newerOwnReceipt.revision
      && delayedReceipt.revision < interleavedReceipt.revision
      && interleavedReceipt.revision < newerOwnReceipt.revision
      && revisionAfterOldReceipt === newerOwnReceipt.revision,
    JSON.stringify({ captured: delayedReceiptCaptured, released: delayedReceiptReleased,
      delayed: delayedReceipt.revision, interleaved: interleavedReceipt.revision, newerOwn: newerOwnReceipt.revision,
      before: revisionBeforeOldReceipt, after: revisionAfterOldReceipt }));
  const defaultUndoAfterLateReceipt = await first.page.evaluate(() => window.__GRAPHYSX_LIVE_SESSION__.undo());
  await Promise.all([first.page, second.page].map((page) => page.waitForFunction(() =>
    window.__GRAPHYSX__.query({ ids: ["newer-own-crate"] }).length === 0)));
  const lateReceiptUndoProof = await first.page.evaluate(() => ({
    delayed: window.__GRAPHYSX__.query({ ids: ["delayed-receipt-crate"] }).length,
    newer: window.__GRAPHYSX__.query({ ids: ["newer-own-crate"] }).length,
  }));
  check(results, "default Undo still targets the newest own operation after an older receipt arrives",
    defaultUndoAfterLateReceipt.ok
      && lateReceiptUndoProof.delayed === 1
      && lateReceiptUndoProof.newer === 0,
    JSON.stringify({ undo: defaultUndoAfterLateReceipt, entities: lateReceiptUndoProof }));

  // Let the store accept one operation, then replace both the original and idempotent retry
  // response bodies with unreadable 2xx receipts. The SSE echo is still authoritative. This
  // pins a proxy losing every HTTP receipt while the accepted event remains live: the
  // optimistic mutation must recover cleanly and the callback must still fire
  // exactly once, irrespective of whether the echo beats the failed receipt to the client.
  const maskedReceiptControl = await armOperationResponses(first.page, {
    opId: "browser-lost-response-1",
    mode: "mask",
    count: 2,
  });
  const maskedReceipt = await first.page.evaluate(async () => {
    try {
      const receipt = await window.__GRAPHYSX_LIVE_SESSION__.submit(
        [{ op: "spawn", entity: {
          id: "lost-response-crate",
          type: "box",
          label: "Lost response crate",
          transform: { position: [0, 0.5, 2] },
        } }],
        { opId: "browser-lost-response-1", intent: "alice survives an accepted response loss" },
      );
      return {
        recovered: true,
        duplicate: receipt.duplicate === true,
        revision: receipt.revision,
        status: null,
        message: null,
      };
    } catch (error) {
      return {
        recovered: false,
        duplicate: false,
        revision: null,
        status: typeof error?.status === "number" ? error.status : null,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  });
  const maskedReceiptCount = await maskedReceiptControl.captured;
  check(results, "the client recovers a lost accepted response through the same idempotent op id",
    maskedReceipt.recovered && maskedReceipt.duplicate && maskedReceiptCount === 2,
    JSON.stringify({ ...maskedReceipt, maskedReceiptCount }));
  await Promise.all([first.page, second.page].map((page) => page.waitForFunction(() =>
    window.__GRAPHYSX__.query({ ids: ["lost-response-crate"] }).length === 1)));
  await Promise.all([first.page, second.page].map((page) => page.waitForFunction(() =>
    [...document.querySelectorAll('.gx-ls-activity li[data-actor="alice"]')]
      .some((node) => /Lost response crate/i.test(node.textContent ?? "")))));
  const maskedOperationProof = await Promise.all([first.page, second.page].map((page) => page.evaluate(() => ({
    entityCount: window.__GRAPHYSX__.query({ ids: ["lost-response-crate"] }).length,
    activityCount: [...document.querySelectorAll('.gx-ls-activity li[data-actor="alice"]')]
      .filter((node) => /Lost response crate/i.test(node.textContent ?? "")).length,
    document: JSON.stringify(window.__GRAPHYSX__.exportDocument()),
  }))));
  check(results, "an accepted operation survives response loss without duplicate apply or callback",
    maskedOperationProof.every((state) => state.entityCount === 1 && state.activityCount === 1)
      && maskedOperationProof[0].document === maskedOperationProof[1].document,
    JSON.stringify(maskedOperationProof.map(({ entityCount, activityCount }) => ({ entityCount, activityCount }))));

  // --- an agent, outside both browsers ---------------------------------------------------

  const presenceBaseline = await Promise.all([
    readPresenceInvariant(first.page),
    readPresenceInvariant(second.page),
  ]);
  check(results, "live presence starts with no projected agent avatars",
    presenceBaseline.every((state) => state.avatarIds.length === 0 && state.presence?.agents.length === 0),
    JSON.stringify(presenceBaseline.map((state) => ({ avatars: state.avatarIds, presence: state.presence }))));

  const agentJoin = await api(store.url, "POST", `/sessions/${sessionId}/join`,
    { code: agentInvite.code, actor: { id: "agent-x", label: "AgentX", kind: "agent" } });
  check(results, "an external agent joins the same session", agentJoin.status === 201, `status ${agentJoin.status}`);
  const agentCredential = agentJoin.body.credential;

  agentActor = createActor(store.url, { credential: agentCredential });
  const agentHello = await agentActor.connect(sessionId);
  check(results, "the external agent opens a real online presence stream",
    agentHello.role === "agent" && agentHello.sessionId === sessionId, JSON.stringify(agentHello));

  const joinedPresence = await Promise.all([
    waitForAgentCount(first.page, 1, "alice agent join"),
    waitForAgentCount(second.page, 1, "bob agent join"),
  ]);
  check(results, "one scene-native ephemeral avatar appears per online AgentX actor",
    joinedPresence.every((state) => state.agents.length === 1
      && state.agents[0].actorId === "agent-x"
      && state.agents[0].label === "AgentX"
      && state.centerReady),
    JSON.stringify(joinedPresence));

  const joinedProof = await Promise.all([readPresenceInvariant(first.page), readPresenceInvariant(second.page)]);
  check(results, "membership projection changes no live or runtime revision, commit history, or authored JSON",
    joinedProof.every((state, index) => state.liveRevision === presenceBaseline[index].liveRevision
      && state.runtimeRevision === presenceBaseline[index].runtimeRevision
      && state.history === presenceBaseline[index].history
      && state.document === presenceBaseline[index].document
      && state.fullExport === presenceBaseline[index].fullExport),
    JSON.stringify(joinedProof.map((state, index) => ({
      live: `${presenceBaseline[index].liveRevision}->${state.liveRevision}`,
      runtime: `${presenceBaseline[index].runtimeRevision}->${state.runtimeRevision}`,
      historySame: state.history === presenceBaseline[index].history,
      documentSame: state.document === presenceBaseline[index].document,
      fullExportSame: state.fullExport === presenceBaseline[index].fullExport,
    }))));
  check(results, "the live avatar is a queryable ephemeral agent but absent from portable JSON",
    joinedProof.every((state) => state.avatarIds.length === 1
      && state.presence?.agents[0]?.avatarId === state.avatarIds[0]
      && !state.document.includes(state.avatarIds[0])
      && !state.fullExport.includes(state.avatarIds[0])
      && state.projectedPresence?.agents?.[0]?.actorId === "agent-x"),
    JSON.stringify(joinedProof.map((state) => ({ ids: state.avatarIds, projected: state.projectedPresence }))));

  const authoringBoundary = await Promise.all([first.page, second.page].map((page) => page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const avatarId = api.query({ tag: "live-agent" })[0]?.id;
    const authoredId = "showroom-nestor";
    const suffix = Math.random().toString(36).slice(2);
    const beforeRevision = api.state().revision;
    const beforeHistory = JSON.stringify(api.history());
    const beforeDocument = JSON.stringify(api.exportDocument());
    const update = api.update(avatarId, { label: "authored takeover" });
    const child = api.spawn({
      id: `illegal-live-child-${suffix}`,
      parentId: avatarId,
      type: "box",
      label: "Must never become authored",
    });
    const lookAtSpawn = api.spawn({
      id: `illegal-live-look-at-${suffix}`,
      type: "box",
      label: "Must never look at presence",
      behaviors: [{ type: "look-at", targetId: avatarId }],
    });
    const splineSpawn = api.spawn({
      id: `illegal-live-spline-${suffix}`,
      type: "box",
      label: "Must never follow presence",
      behaviors: [{ type: "follow-spline", splineId: avatarId }],
    });
    const interactionSpawn = api.spawn({
      id: `illegal-live-interaction-${suffix}`,
      type: "box",
      label: "Must never interact with presence",
      interactions: [{ id: "illegal-toggle", type: "toggle-visibility", targetIds: [avatarId] }],
    });
    const steeringSpawn = api.spawn({
      id: `illegal-live-steering-${suffix}`,
      type: "sphere",
      label: "Must never steer through presence",
      physics: { mode: "dynamic" },
      steering: { arrowId: avatarId },
    });
    const interactionUpdate = api.update(authoredId, {
      interactions: [{ id: "illegal-update-toggle", type: "toggle-visibility", targetIds: [avatarId] }],
    });
    const steeringUpdate = api.update(authoredId, { steering: { arrowId: avatarId } });
    const lookAtAttach = api.attachBehavior(authoredId, { type: "look-at", targetId: avatarId });
    const splineAttach = api.attachBehavior(authoredId, { type: "follow-spline", splineId: avatarId });
    return {
      update,
      child,
      lookAtSpawn,
      splineSpawn,
      interactionSpawn,
      steeringSpawn,
      interactionUpdate,
      steeringUpdate,
      lookAtAttach,
      splineAttach,
      revisionStable: api.state().revision === beforeRevision,
      historyStable: JSON.stringify(api.history()) === beforeHistory,
      documentStable: JSON.stringify(api.exportDocument()) === beforeDocument,
      avatarLabel: api.query({ ids: [avatarId] })[0]?.label ?? null,
      illegalReferences: api.query({ labelIncludes: "Must never" }).length,
    };
  })));
  check(results, "authored commands cannot mutate, parent beneath, or reference host-owned presence",
    authoringBoundary.every((state) => !state.update.ok
      && !state.child.ok
      && !state.lookAtSpawn.ok
      && !state.splineSpawn.ok
      && !state.interactionSpawn.ok
      && !state.steeringSpawn.ok
      && !state.interactionUpdate.ok
      && !state.steeringUpdate.ok
      && !state.lookAtAttach.ok
      && !state.splineAttach.ok
      && state.revisionStable
      && state.historyStable
      && state.documentStable
      && /live AgentX/.test(state.avatarLabel)
      && state.illegalReferences === 0),
    JSON.stringify(authoringBoundary));

  const joinChrome = await first.page.evaluate(() => {
    const observer = document.querySelector(".gx-welcome--live-observer");
    return {
      actor: observer?.dataset.liveAgentActor ?? null,
      title: observer?.querySelector("[data-nestor-title]")?.textContent ?? "",
      briefing: observer?.querySelector("[data-nestor-briefing]")?.textContent ?? "",
    };
  });
  check(results, "Nestor visibly acknowledges the connected AgentX actor",
    joinChrome.actor === "agent-x" && /AgentX/i.test(joinChrome.title) && /joined/i.test(joinChrome.briefing),
    JSON.stringify(joinChrome));

  const agentCursor = [4, 1.2, -2];
  const cursorReceipt = await agentActor.call("POST", `/sessions/${sessionId}/presence`, {
    cursor: { x: agentCursor[0], y: agentCursor[1], z: agentCursor[2] },
    tool: "agent-compose",
    color: "#d6a8ff",
  });
  check(results, "the external agent publishes a world-space presence target",
    cursorReceipt.status === 200, `status ${cursorReceipt.status}`);
  await Promise.all([
    waitForAgentAt(first.page, "agent-x", agentCursor, "alice cursor projection"),
    waitForAgentAt(second.page, "agent-x", agentCursor, "bob cursor projection"),
  ]);
  const cursorProof = await Promise.all([readPresenceInvariant(first.page), readPresenceInvariant(second.page)]);
  check(results, "agent presence moves the existing actor-keyed projection without duplication or authoring",
    cursorProof.every((state, index) => state.avatarIds.length === 1
      && state.presence.agents.length === 1
      && state.liveRevision === presenceBaseline[index].liveRevision
      && state.runtimeRevision === presenceBaseline[index].runtimeRevision
      && state.history === presenceBaseline[index].history
      && state.document === presenceBaseline[index].document
      && state.fullExport === presenceBaseline[index].fullExport
      && state.avatarIds[0] === joinedProof[index].avatarIds[0]
      && state.avatarObjects[0]?.uuid === joinedProof[index].avatarObjects[0]?.uuid),
    JSON.stringify(cursorProof.map((state) => ({ ids: state.avatarIds, agents: state.presence?.agents }))));

  const agentOp = await api(store.url, "POST", `/sessions/${sessionId}/ops`, {
    opId: "browser-agent-presence-1",
    path: "spawn",
    commands: [{ op: "spawn", entity: { id: "agent-crate", type: "box", label: "Agent crate", transform: { position: [-2, 0.5, 0] } } }],
    intent: "AgentX raises a live signal",
  }, agentCredential);
  check(results, "the agent's operation is accepted", acceptedOperationStatus(agentOp.status), `status ${agentOp.status}`);

  // Capture each tab's proof immediately when that tab sees the short-lived signal. One slow
  // software renderer must not consume the other tab's independent seven-second visual TTL.
  const observeReaction = async (page, label, screenshotPath = null) => {
    const reaction = await waitForAgentReaction(page, agentOp.body.revision, label);
    const proof = await readPresenceInvariant(page);
    if (screenshotPath) await page.screenshot({ path: screenshotPath, fullPage: false });
    return { reaction, proof };
  };
  const reactionObservations = await Promise.all([
    observeReaction(first.page, "alice Nestor reaction", path.join(ARTIFACTS, "live-agent-presence.png")),
    observeReaction(second.page, "bob Nestor reaction"),
  ]);
  const reactionStates = reactionObservations.map(({ reaction }) => reaction);
  const operationProof = reactionObservations.map(({ proof }) => proof);
  check(results, "Nestor's live reaction carries the accepted actor, intent, and server revision",
    reactionStates.every((state) => state.activity.actorId === "agent-x"
      && state.activity.actorLabel === "AgentX"
      && state.activity.intent === "AgentX raises a live signal"
      && state.activity.revision === agentOp.body.revision),
    JSON.stringify(reactionStates));

  check(results, "the agent's mutation reaches both browsers live",
    operationProof.every((state) => state.document.includes("agent-crate")),
    JSON.stringify(operationProof.map((state) => state.document.includes("agent-crate"))));
  const baselineHistoryLengths = presenceBaseline.map((state) => JSON.parse(state.history).length);
  check(results, "Nestor's acknowledgement adds no second revision or commit",
    operationProof.every((state, index) => state.liveRevision === presenceBaseline[index].liveRevision + 1
      && state.runtimeRevision === presenceBaseline[index].runtimeRevision + 1
      && JSON.parse(state.history).length === baselineHistoryLengths[index] + 1
      && state.reactionIds.length === 3),
    JSON.stringify(operationProof.map((state, index) => ({
      live: `${presenceBaseline[index].liveRevision}->${state.liveRevision}`,
      runtime: `${presenceBaseline[index].runtimeRevision}->${state.runtimeRevision}`,
      history: `${baselineHistoryLengths[index]}->${JSON.parse(state.history).length}`,
      reactionIds: state.reactionIds,
    }))));
  check(results, "avatar and Nestor reaction remain absent from the accepted authored document",
    operationProof.every((state) => !state.document.includes("live-agent:")
      && !state.document.includes("live-nestor:")
      && !state.fullExport.includes("live-agent:")
      && !state.fullExport.includes("live-nestor:")
      && state.document.includes("agent-crate")
      && state.fullExport.includes("agent-crate")
      && state.projectedPresence?.activity?.intent === "AgentX raises a live signal"),
    JSON.stringify(operationProof.map((state) => state.projectedPresence)));

  const operationChrome = await first.page.evaluate(() => {
    const observer = document.querySelector(".gx-welcome--live-observer");
    return {
      actor: observer?.dataset.liveAgentActor ?? null,
      revision: observer?.dataset.liveAgentRevision ?? null,
      title: observer?.querySelector("[data-nestor-title]")?.textContent ?? "",
      briefing: observer?.querySelector("[data-nestor-briefing]")?.textContent ?? "",
    };
  });
  check(results, "the live observer card paints the exact accepted intent",
    operationChrome.actor === "agent-x"
      && operationChrome.revision === String(agentOp.body.revision)
      && /acknowledged/i.test(operationChrome.title)
      && operationChrome.briefing === "AgentX raises a live signal",
    JSON.stringify(operationChrome));

  const agentActivity = await first.page.$$eval(".gx-ls-activity li", (nodes) =>
    nodes.map((node) => ({ kind: node.dataset.kind, text: node.textContent ?? "" })));
  check(results, "agent activity is distinguishable from human activity",
    agentActivity.some((entry) => entry.kind === "agent" && /AgentX/.test(entry.text)),
    JSON.stringify(agentActivity.slice(0, 3)));

  const revisionAfterAgentOp = operationProof.map((state) => state.runtimeRevision);
  const documentAfterAgentOp = operationProof.map((state) => state.document);
  const fullExportAfterAgentOp = operationProof.map((state) => state.fullExport);
  const historyAfterAgentOp = operationProof.map((state) => state.history);
  const agentResumeSeq = agentActor.lastSeq;
  await agentActor.disconnect();
  await Promise.all([
    waitForAgentCount(first.page, 0, "alice agent disconnect"),
    waitForAgentCount(second.page, 0, "bob agent disconnect"),
  ]);
  const disconnectedProof = await Promise.all([readPresenceInvariant(first.page), readPresenceInvariant(second.page)]);
  check(results, "an offline AgentX actor is removed without touching scene history",
    disconnectedProof.every((state, index) => state.avatarIds.length === 0
      && state.runtimeRevision === revisionAfterAgentOp[index]
      && state.history === historyAfterAgentOp[index]
      && state.document === documentAfterAgentOp[index]
      && state.fullExport === fullExportAfterAgentOp[index]
      && state.presence.activity === null
      && state.projectedPresence.activity === null),
    JSON.stringify(disconnectedProof.map((state) => state.presence)));

  // Aborting a Node/undici SSE body can briefly leave its pooled socket in teardown on
  // Windows. Retry only transport failures; the server still authenticates every fresh
  // one-shot ticket, so this does not weaken any protocol assertion.
  let resumedHello = null;
  let reconnectError = null;
  for (let attempt = 0; attempt < 3 && !resumedHello; attempt += 1) {
    try {
      resumedHello = await agentActor.connect(sessionId, { since: agentResumeSeq });
    } catch (error) {
      reconnectError = error;
      await agentActor.disconnect();
      await sleep(250 * (attempt + 1));
    }
  }
  if (!resumedHello) throw reconnectError ?? new Error("AgentX reconnect failed");
  await Promise.all([
    waitForAgentCount(first.page, 1, "alice agent reconnect"),
    waitForAgentCount(second.page, 1, "bob agent reconnect"),
  ]);
  const reconnectedProof = await Promise.all([readPresenceInvariant(first.page), readPresenceInvariant(second.page)]);
  check(results, "AgentX reconnect resumes and restores exactly one avatar",
    resumedHello.resumed === true && reconnectedProof.every((state, index) => state.avatarIds.length === 1
      && state.presence.agents.length === 1
      && state.avatarIds[0] === joinedProof[index].avatarIds[0]
      && state.runtimeRevision === revisionAfterAgentOp[index]
      && state.history === historyAfterAgentOp[index]
      && state.document === documentAfterAgentOp[index]
      && state.fullExport === fullExportAfterAgentOp[index]),
    JSON.stringify({ hello: resumedHello, states: reconnectedProof.map((state) => state.presence) }));

  const removeAgent = await api(
    store.url,
    "DELETE",
    `/sessions/${sessionId}/members/${agentJoin.body.member.memberId}`,
    undefined,
    ownerCredential,
  );
  check(results, "the owner removes the AgentX membership", removeAgent.status === 200, `status ${removeAgent.status}`);
  await Promise.all([
    waitForAgentCount(first.page, 0, "alice removed agent cleanup"),
    waitForAgentCount(second.page, 0, "bob removed agent cleanup"),
  ]);
  const removedProof = await Promise.all([readPresenceInvariant(first.page), readPresenceInvariant(second.page)]);
  check(results, "member removal immediately clears roster projection, avatar, and text state",
    removedProof.every((state, index) => state.avatarIds.length === 0
      && state.presence.agents.length === 0
      && !state.projectedPresence.agents.length
      && state.presence.activity === null
      && state.projectedPresence.activity === null
      && state.presence.signalVisible === false
      && state.reactionIds.length === 0
      && state.runtimeRevision === revisionAfterAgentOp[index]
      && state.history === historyAfterAgentOp[index]
      && state.document === documentAfterAgentOp[index]
      && state.fullExport === fullExportAfterAgentOp[index]),
    JSON.stringify(removedProof.map((state) => state.presence)));
  const removedRosterCounts = await Promise.all([first.page, second.page].map((page) =>
    page.$$eval('.gx-ls-member[data-actor="agent-x"]', (nodes) => nodes.length)));
  check(results, "member removal clears AgentX from both rendered rosters",
    removedRosterCounts.every((count) => count === 0), JSON.stringify(removedRosterCounts));
  const removedChrome = await first.page.evaluate(() => {
    const observer = document.querySelector(".gx-welcome--live-observer");
    return {
      actor: observer?.getAttribute("data-live-agent-actor") ?? null,
      revision: observer?.getAttribute("data-live-agent-revision") ?? null,
      title: observer?.querySelector("[data-nestor-title]")?.textContent ?? "",
      briefing: observer?.querySelector("[data-nestor-briefing]")?.textContent ?? "",
    };
  });
  check(results, "the observer card returns to neutral live-session copy after AgentX leaves",
    removedChrome.actor === null
      && removedChrome.revision === null
      && /observing/i.test(removedChrome.title)
      && /live session owns scene operations/i.test(removedChrome.briefing),
    JSON.stringify(removedChrome));

  // Exercise the private undo snapshot boundary from the public API after every transient
  // scope has been removed. A leaked scope would resurrect as an unowned avatar/signal here.
  const undoTransientProof = await first.page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const undo = api.undo();
    const fullExport = JSON.stringify(api.export());
    return {
      ok: undo.ok,
      avatarIds: api.query({ tag: "live-agent" }).map((entity) => entity.id),
      reactionIds: api.query({ tag: "nestor-live-activity" }).map((entity) => entity.id),
      fullExport,
    };
  });
  check(results, "Undo cannot resurrect a disconnected avatar or Nestor signal",
    undoTransientProof.ok
      && undoTransientProof.avatarIds.length === 0
      && undoTransientProof.reactionIds.length === 0
      && !undoTransientProof.fullExport.includes("live-agent:")
      && !undoTransientProof.fullExport.includes("live-nestor:"),
    JSON.stringify(undoTransientProof));
  await first.page.evaluate(() => window.__GRAPHYSX_LIVE_SESSION__.resync());
  await first.page.waitForFunction(() => Boolean(window.__GRAPHYSX__.query({ ids: ["agent-crate"] }).length));
  await agentActor.disconnect();

  // --- convergence ------------------------------------------------------------------------

  const revisions = await Promise.all([
    first.page.evaluate(() => window.__GRAPHYSX_LIVE_SESSION__.status.revision),
    second.page.evaluate(() => window.__GRAPHYSX_LIVE_SESSION__.status.revision),
  ]);
  check(results, "both browsers converge on the same revision", revisions[0] === revisions[1], revisions.join(" vs "));
  check(results, "the revision advanced by exactly the eight accepted operations",
    revisions[0] - revisionBefore === 8, `${revisionBefore} -> ${revisions[0]}`);

  const documents = await Promise.all([
    first.page.evaluate(() => JSON.stringify(window.__GRAPHYSX__.exportDocument()?.entities.map((e) => e.id).sort())),
    second.page.evaluate(() => JSON.stringify(window.__GRAPHYSX__.exportDocument()?.entities.map((e) => e.id).sort())),
  ]);
  check(results, "both browsers hold the identical document", documents[0] === documents[1], documents.join(" vs "));

  // Presence is not in the document — the invariant the whole design rests on.
  check(results, "presence never entered the portable document",
    !documents[0].includes("presence") && !documents[0].includes("cursor"), documents[0].slice(0, 200));

  // An authenticated store write is outside the session operation chain. Every attached
  // browser must gate immediately on its retained marker and load the same atomic document cut.
  const externalMarkerBaseline = await Promise.all([first.page, second.page].map((page) => page.evaluate(() =>
    window.__GRAPHYSX_TEST_RESYNC_MARKER_COUNT__?.() ?? -1)));
  const externalBefore = await api(store.url, "GET", `/sessions/${sessionId}/snapshot`, undefined, ownerCredential);
  const externalDefinition = structuredClone(externalBefore.body.definition);
  externalDefinition.entities.push({
    id: "browser-external-cut", type: "box", label: "External authority cut",
    transform: { position: [5, 0.5, -4] },
  });
  const externalWrite = await api(store.url, "PUT", `/scenes/${SCENE}`, {
    definition: externalDefinition, expectedRevision: externalBefore.body.revision,
    actor: "store-writer", intent: "replace the live scene outside its operation chain",
  });
  await Promise.all([first.page, second.page].map((page) => page.waitForFunction((targetRevision) =>
    window.__GRAPHYSX_LIVE_SESSION__.status.connection === "live"
      && window.__GRAPHYSX_LIVE_SESSION__.status.revision === targetRevision
      && window.__GRAPHYSX__.query({ ids: ["browser-external-cut"] }).length === 1,
  externalWrite.body.revision)));
  const externalCutProof = await Promise.all([first.page, second.page].map((page) => page.evaluate(() => ({
    markerCount: window.__GRAPHYSX_TEST_RESYNC_MARKER_COUNT__?.() ?? -1,
    connection: window.__GRAPHYSX_LIVE_SESSION__.status.connection,
    revision: window.__GRAPHYSX_LIVE_SESSION__.status.revision,
    externalCount: window.__GRAPHYSX__.query({ ids: ["browser-external-cut"] }).length,
    document: JSON.stringify(window.__GRAPHYSX__.exportDocument()),
  }))));
  check(results, "an external store cut forces exactly one atomic resync in every attached browser",
    externalWrite.status === 200 && externalCutProof.every((state, index) =>
      state.markerCount === externalMarkerBaseline[index] + 1 && state.connection === "live"
      && state.revision === externalWrite.body.revision && state.externalCount === 1)
      && isDeepStrictEqual(normalizeSerializedDocument(externalCutProof[0].document),
        normalizeSerializedDocument(externalCutProof[1].document)),
    JSON.stringify({ write: externalWrite, baseline: externalMarkerBaseline, clients: externalCutProof.map((state) => ({ ...state, document: "omitted" })) }));

  const afterExternalReceipt = await second.page.evaluate(() => window.__GRAPHYSX_LIVE_SESSION__.submit([
    { op: "spawn", entity: { id: "browser-after-external-cut", type: "sphere", label: "After external cut" } },
  ], { opId: "browser-after-external-cut-op", intent: "extend the embodied external cut" }));
  await Promise.all([first.page, second.page].map((page) => page.waitForFunction(() =>
    window.__GRAPHYSX__.query({ ids: ["browser-after-external-cut"] }).length === 1)));
  const afterExternalServer = await api(store.url, "GET", `/sessions/${sessionId}/snapshot`, undefined, ownerCredential);
  const afterExternalProof = await Promise.all([first.page, second.page].map((page) => page.evaluate(() => ({
    revision: window.__GRAPHYSX_LIVE_SESSION__.status.revision,
    externalCount: window.__GRAPHYSX__.query({ ids: ["browser-external-cut"] }).length,
    authoredCount: window.__GRAPHYSX__.query({ ids: ["browser-after-external-cut"] }).length,
    document: JSON.stringify(window.__GRAPHYSX__.exportDocument()),
  }))));
  check(results, "the next browser operation extends the embodied external document without a stale base",
    afterExternalReceipt.baseRevision === externalWrite.body.revision
      && afterExternalServer.body.revision === afterExternalReceipt.revision
      && ["browser-external-cut", "browser-after-external-cut"].every((id) =>
        afterExternalServer.body.definition.entities.filter((entity) => entity.id === id).length === 1)
      && afterExternalProof.every((state) => state.revision === afterExternalReceipt.revision
        && state.externalCount === 1 && state.authoredCount === 1)
      && isDeepStrictEqual(normalizeSerializedDocument(afterExternalProof[0].document),
        normalizeSerializedDocument(afterExternalProof[1].document)),
    JSON.stringify({ receipt: afterExternalReceipt, serverRevision: afterExternalServer.body.revision, clients: afterExternalProof.map((state) => ({ ...state, document: "omitted" })) }));

  // --- AgentX mission director ------------------------------------------------------------

  // Reuse Alice's already-warm renderer for owner controls. Hold two overlapping owner
  // attaches at their snapshot responses: completion of stale handoff A must not close the
  // stream retained for current handoff B. B alone retires it, exactly once, before opening
  // its replacement. This is the Windows EventSource-close/fetch regression.
  const waitForHeldSnapshot = async (page, id, label) => {
    const deadline = Date.now() + SMOKE_TIMEOUT;
    while (!(await page.evaluate((holdId) =>
      window.__GRAPHYSX_TEST_SNAPSHOT_CAPTURED__(holdId), id))) {
      if (Date.now() > deadline) throw new Error(label + " did not reach its snapshot barrier");
      await sleep(50);
    }
  };
  const streamBeforeOwnerHandoff = await first.page.evaluate(() =>
    window.__GRAPHYSX_TEST_STREAM_STATE__());
  const handoffAId = await first.page.evaluate(() => window.__GRAPHYSX_TEST_HOLD_SNAPSHOT__());
  await first.page.evaluate((args) => {
    window.__GRAPHYSX_TEST_HANDOFF_A__ = window.__GRAPHYSX_LIVE_SESSION__
      .attach(args.sessionId, args.credential)
      .then(() => ({ state: "fulfilled" }), (error) => ({
        state: "rejected",
        code: error?.code ?? null,
        message: String(error?.message ?? error),
      }));
  }, { sessionId, credential: ownerCredential });
  await waitForHeldSnapshot(first.page, handoffAId, "authority handoff A");

  const handoffBId = await first.page.evaluate(() => window.__GRAPHYSX_TEST_HOLD_SNAPSHOT__());
  await first.page.evaluate((args) => {
    window.__GRAPHYSX_TEST_HANDOFF_B__ = window.__GRAPHYSX_LIVE_SESSION__
      .attach(args.sessionId, args.credential)
      .then(() => ({ state: "fulfilled" }), (error) => ({
        state: "rejected",
        code: error?.code ?? null,
        message: String(error?.message ?? error),
      }));
  }, { sessionId, credential: ownerCredential });
  await waitForHeldSnapshot(first.page, handoffBId, "authority handoff B");

  await first.page.evaluate((id) => window.__GRAPHYSX_TEST_RELEASE_SNAPSHOT__(id), handoffAId);
  const handoffAOutcome = await first.page.evaluate(() => window.__GRAPHYSX_TEST_HANDOFF_A__);
  const streamDuringOwnerHandoff = await first.page.evaluate(() =>
    window.__GRAPHYSX_TEST_STREAM_STATE__());
  await first.page.evaluate((id) => window.__GRAPHYSX_TEST_RELEASE_SNAPSHOT__(id), handoffBId);
  const handoffBOutcome = await first.page.evaluate(() => window.__GRAPHYSX_TEST_HANDOFF_B__);
  await waitForLive(first.page, "owner mission director attach");
  const streamAfterOwnerHandoff = await first.page.evaluate(() =>
    window.__GRAPHYSX_TEST_STREAM_STATE__());
  const originalSourceId = streamBeforeOwnerHandoff.activeSourceId;
  check(results, "overlapping authority handoffs retire the previous stream once under the current owner",
    originalSourceId !== null
      && handoffAOutcome.state === "rejected" && handoffAOutcome.code === "session-authority-revoked"
      && handoffBOutcome.state === "fulfilled"
      && streamDuringOwnerHandoff.activeSourceId === originalSourceId
      && streamDuringOwnerHandoff.closeCounts[originalSourceId] === 0
      && streamAfterOwnerHandoff.activeSourceId !== originalSourceId
      && streamAfterOwnerHandoff.closeCounts[originalSourceId] === 1,
    JSON.stringify({
      originalSourceId,
      handoffAOutcome,
      handoffBOutcome,
      during: streamDuringOwnerHandoff,
      after: streamAfterOwnerHandoff,
    }));
  const ownerAttach = await first.page.evaluate(() => window.__GRAPHYSX_LIVE_SESSION__.status);
  check(results, "the warm owner browser exposes the curated mission controls",
    ownerAttach.sessionId === sessionId
      && (await first.page.evaluate(() => window.__GRAPHYSX_LIVE_SESSION__.status.role)) === "owner"
      && await first.page.isVisible('.gx-ms [data-action="start"]'),
    JSON.stringify(ownerAttach));

  const explorerInvite = await inviteFor("agent", [
    "transaction", "spawn", "mission:explore", "mission:build",
  ]);
  const validatorInvite = await inviteFor("agent", ["mission:validate"]);
  const explorerJoin = await api(store.url, "POST", "/sessions/" + sessionId + "/join", {
    code: explorerInvite.code,
    actor: { id: "mission-scout", label: "Scout", kind: "agent" },
  });
  const validatorJoin = await api(store.url, "POST", "/sessions/" + sessionId + "/join", {
    code: validatorInvite.code,
    actor: { id: "mission-validator", label: "Verifier", kind: "agent" },
  });
  const explorerActor = createActor(store.url, { credential: explorerJoin.body.credential });
  const validatorActor = createActor(store.url, { credential: validatorJoin.body.credential });
  missionActors.push(explorerActor, validatorActor);
  const [explorerHello, validatorHello] = await Promise.all([
    explorerActor.connect(sessionId),
    validatorActor.connect(sessionId),
  ]);
  await Promise.all([
    waitForAgentCount(first.page, 2, "owner mission agents"),
    waitForAgentCount(second.page, 2, "peer mission agents"),
  ]);
  check(results, "two real capability-scoped AgentX actors join the mission session",
    explorerJoin.status === 201 && validatorJoin.status === 201
      && explorerHello.role === "agent" && validatorHello.role === "agent",
    JSON.stringify({ explorer: explorerHello, validator: validatorHello }));

  await Promise.all([first.page, second.page].map((page, index) =>
    waitForQuietAgentProjection(page, 2, `two-agent render baseline tab ${index + 1}`)));
  const missionRenderBaseline = {
    high: await sampleRendererBudget(first.page, "two-agent-baseline-high", { width: 1280, height: 800 }, "high"),
    mobile: await sampleRendererBudget(first.page, "two-agent-baseline-mobile", { width: 390, height: 844 }, "mobile"),
  };
  await settleRenderProfile(first.page, { width: 1280, height: 800 }, "high");

  const missionBaseline = await Promise.all([first.page, second.page].map((page, index) =>
    readPrimedMissionInvariant(page, `pre-mission resources tab ${index + 1}`)));
  const startSelection = await first.page.evaluate((assignments) => {
    for (const assignment of assignments) {
      const select = document.querySelector('[data-start-stage="' + assignment.stageId + '"]');
      if (!(select instanceof HTMLSelectElement)) return { ok: false, missing: assignment.stageId };
      if (![...select.options].some((option) => option.value === assignment.memberId)) {
        return { ok: false, ineligible: assignment.stageId, memberId: assignment.memberId };
      }
      select.value = assignment.memberId;
    }
    const start = document.querySelector('.gx-ms [data-action="start"]');
    if (!(start instanceof HTMLButtonElement)) return { ok: false, missing: "start" };
    start.click();
    return { ok: true };
  }, [
    { stageId: "analyze", memberId: explorerJoin.body.member.memberId },
    { stageId: "build", memberId: explorerJoin.body.member.memberId },
    { stageId: "validate", memberId: validatorJoin.body.member.memberId },
  ]);
  const missionStartDeadline = Date.now() + SMOKE_TIMEOUT;
  let missionId = null;
  while (!missionId && Date.now() <= missionStartDeadline) {
    missionId = await first.page.evaluate(() =>
      window.__GRAPHYSX_LIVE_SESSION__.status.missions.find((mission) => mission.status === "briefing")?.missionId ?? null);
    if (!missionId) await sleep(100);
  }
  if (!missionId) throw new Error("owner mission start did not create a briefing mission");
  const briefingMissions = await Promise.all([
    waitForMission(first.page, missionId, (mission) => mission.status === "briefing", "owner briefing"),
    waitForMission(second.page, missionId, (mission) => mission.status === "briefing", "peer briefing"),
  ]);
  await Promise.all([
    waitForMissionRuntime(first.page, (state) => state.mission?.missionId === missionId && state.boardVisible, "owner mission board"),
    waitForMissionRuntime(second.page, (state) => state.mission?.missionId === missionId && state.boardVisible, "peer mission board"),
  ]);
  const briefingProof = await Promise.all([
    readMissionInvariant(first.page),
    readMissionInvariant(second.page),
  ]);
  check(results, "the owner starts one authoritative three-stage briefing from the product panel",
    startSelection.ok && briefingMissions.every((mission) => mission.stages.length === 3
      && mission.stages.map((stage) => stage.stageId).join(",") === "analyze,build,validate")
      && briefingProof.every((state) => state.boardIds.length === 1
        && state.presence.agents.length === 2
        && state.presence.agents.every((agent) => agent.station === "briefing")),
    JSON.stringify({
      selection: startSelection,
      missions: briefingMissions,
      stations: briefingProof.map((state) => state.presence.agents.map((agent) => ({ actorId: agent.actorId, station: agent.station }))),
    }));
  check(results, "briefing projects exactly one board without authoring scene state",
    briefingProof.every((state, index) => state.liveRevision === missionBaseline[index].liveRevision
      && state.runtimeRevision === missionBaseline[index].runtimeRevision
      && state.history === missionBaseline[index].history
      && state.document === missionBaseline[index].document
      && state.fullExport === missionBaseline[index].fullExport
      && JSON.stringify(state.selectedIds) === JSON.stringify(missionBaseline[index].selectedIds)
      && state.boardIds.length === 1 && state.missionIds.length >= 6
      && !state.document.includes("live-mission:") && !state.fullExport.includes("live-mission:")),
    JSON.stringify(briefingProof.map((state) => ({ board: state.boardIds, missionIds: state.missionIds.length }))));

  await first.page.click('.gx-ms [data-action="activate"]');
  const activeMissions = await Promise.all([
    waitForMission(first.page, missionId, (mission) => mission.status === "active", "owner activation"),
    waitForMission(second.page, missionId, (mission) => mission.status === "active", "peer activation"),
  ]);
  check(results, "mission activation binds three ordered stages across two distinct AgentX actors",
    activeMissions.every((mission) => mission.stages[0].assignment?.actorId === "mission-scout"
      && mission.stages[1].assignment?.actorId === "mission-scout"
      && mission.stages[2].assignment?.actorId === "mission-validator"
      && new Set(mission.stages.map((stage) => stage.assignment?.actorId)).size === 2),
    JSON.stringify(activeMissions));

  // Mission activation and avatar travel are deliberately separate: the authoritative
  // assignment arrives before each renderer completes its station choreography. Prove both
  // real runtimes reach the exact horizontal capability slots before comparing their stable
  // projection. Y is intentionally animated by the avatar's bob behavior and is bounded below.
  await Promise.all([
    waitForAgentAt(first.page, "mission-scout", [8.4, 0.36, -0.05], "owner scout station", 0.0005, [0, 2]),
    waitForAgentAt(first.page, "mission-validator", [8.2, 0.36, 3.85], "owner validator station", 0.0005, [0, 2]),
    waitForAgentAt(second.page, "mission-scout", [8.4, 0.36, -0.05], "peer scout station", 0.0005, [0, 2]),
    waitForAgentAt(second.page, "mission-validator", [8.2, 0.36, 3.85], "peer validator station", 0.0005, [0, 2]),
  ]);

  const stationProof = await Promise.all([first.page, second.page].map((page) => page.evaluate(() =>
    window.__GRAPHYSX_LIVE_PRESENCE__.state().agents
      .map((agent) => ({ actorId: agent.actorId, avatarId: agent.avatarId, station: agent.station, stageId: agent.stageId, position: agent.position }))
      .sort((left, right) => left.actorId.localeCompare(right.actorId)))));
  const stableStationSlots = stationProof.map((agents) => agents.map((agent) => ({
    actorId: agent.actorId, avatarId: agent.avatarId, station: agent.station, stageId: agent.stageId,
    x: Number(agent.position[0].toFixed(3)), z: Number(agent.position[2].toFixed(3)),
  })));
  check(results, "mission assignments place both avatars at deterministic capability stations",
    stationProof.every((agents) => agents.length === 2
      && agents.every((agent) => agent.position[1] >= 0.25 && agent.position[1] <= 0.45)
      && agents.find((agent) => agent.actorId === "mission-scout")?.station === "explore"
      && agents.find((agent) => agent.actorId === "mission-scout")?.stageId === "analyze"
      && agents.find((agent) => agent.actorId === "mission-validator")?.station === "play"
      && agents.find((agent) => agent.actorId === "mission-validator")?.stageId === "validate")
      && JSON.stringify(stableStationSlots[0]) === JSON.stringify(stableStationSlots[1]),
    JSON.stringify({ slots: stableStationSlots, animated: stationProof }));

  const desktopMissionUi = await first.page.evaluate(() => {
    const panel = document.querySelector(".gx-ls");
    const section = document.querySelector(".gx-ms");
    const header = document.querySelector(".gx-ms-head");
    const controlled = header?.getAttribute("aria-controls");
    const panelRect = panel?.getBoundingClientRect();
    const sectionRect = section?.getBoundingClientRect();
    return {
      viewport: { width: innerWidth, height: innerHeight },
      panel: panelRect ? { left: panelRect.left, right: panelRect.right, top: panelRect.top, bottom: panelRect.bottom } : null,
      section: sectionRect ? { left: sectionRect.left, right: sectionRect.right, top: sectionRect.top, bottom: sectionRect.bottom } : null,
      sectionLabel: section?.getAttribute("aria-label") ?? null,
      expanded: header?.getAttribute("aria-expanded") ?? null,
      controlsTarget: controlled ? document.getElementById(controlled)?.className ?? null : null,
      progressbars: [...document.querySelectorAll('.gx-ms [role="progressbar"]')].map((node) => ({
        now: node.getAttribute("aria-valuenow"), min: node.getAttribute("aria-valuemin"), max: node.getAttribute("aria-valuemax"),
      })),
      live: {
        role: document.querySelector(".gx-ms-sr")?.getAttribute("role") ?? null,
        aria: document.querySelector(".gx-ms-sr")?.getAttribute("aria-live") ?? null,
      },
    };
  });
  check(results, "the desktop mission DOM is bounded and exposes its complete accessible structure",
    desktopMissionUi.panel && desktopMissionUi.section
      && desktopMissionUi.panel.right <= desktopMissionUi.viewport.width + 1
      && desktopMissionUi.panel.bottom <= desktopMissionUi.viewport.height + 1
      && desktopMissionUi.section.left >= desktopMissionUi.panel.left - 1
      && desktopMissionUi.section.right <= desktopMissionUi.panel.right + 1
      && desktopMissionUi.sectionLabel === "AgentX mission director"
      && desktopMissionUi.expanded === "true"
      && /gx-ms-body/.test(desktopMissionUi.controlsTarget ?? "")
      && desktopMissionUi.progressbars.length === 3
      && desktopMissionUi.progressbars.every((bar) => bar.min === "0" && bar.max === "100" && bar.now === "0")
      && desktopMissionUi.live.role === "status" && desktopMissionUi.live.aria === "polite",
    JSON.stringify(desktopMissionUi));
  await first.page.screenshot({ path: path.join(ARTIFACTS, "live-mission-active-desktop.png"), fullPage: false });

  await first.page.setViewportSize({ width: 390, height: 844 });
  await sleep(300);
  const phoneMissionUi = await first.page.evaluate(() => {
    const panel = document.querySelector(".gx-ls");
    const section = document.querySelector(".gx-ms");
    const panelRect = panel?.getBoundingClientRect();
    const sectionRect = section?.getBoundingClientRect();
    const style = panel ? getComputedStyle(panel) : null;
    return {
      panel: panelRect ? { width: panelRect.width, height: panelRect.height, right: panelRect.right, bottom: panelRect.bottom } : null,
      section: sectionRect ? { width: sectionRect.width, right: sectionRect.right } : null,
      maxHeight: Number.parseFloat(style?.maxHeight ?? "0"),
      overflowY: style?.overflowY ?? null,
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
  await first.page.screenshot({ path: path.join(ARTIFACTS, "live-mission-active-390.png"), fullPage: false });
  await first.page.focus('.gx-ms [data-action="pause"]');
  await first.page.keyboard.press("Escape");
  const escapeProof = await first.page.evaluate(() => ({
    expanded: document.querySelector(".gx-ms-head")?.getAttribute("aria-expanded") ?? null,
    hidden: document.querySelector(".gx-ms-body")?.hidden ?? false,
    focusClass: document.activeElement?.className ?? null,
  }));
  check(results, "the 390px mission sheet stays bounded and Escape collapses it with focus restoration",
    phoneMissionUi.panel && phoneMissionUi.section
      && phoneMissionUi.panel.right <= 391 && phoneMissionUi.panel.bottom <= 845
      && phoneMissionUi.panel.width <= 390 && phoneMissionUi.panel.height <= phoneMissionUi.maxHeight + 1
      && phoneMissionUi.maxHeight <= 400 && phoneMissionUi.overflowY === "auto"
      && phoneMissionUi.section.right <= 391 && phoneMissionUi.scrollWidth <= 390
      && escapeProof.expanded === "false" && escapeProof.hidden === true
      && /gx-ms-head/.test(String(escapeProof.focusClass)),
    JSON.stringify({ phoneMissionUi, escapeProof }));
  await first.page.click(".gx-ms-head");
  await first.page.setViewportSize({ width: 1280, height: 800 });
  await sleep(200);

  const pauseBaseline = await Promise.all([
    readMissionInvariant(first.page),
    readMissionInvariant(second.page),
  ]);
  await first.page.click('.gx-ms [data-action="pause"]');
  const pausedMissions = await Promise.all([
    waitForMission(first.page, missionId, (mission) => mission.status === "paused", "owner mission pause"),
    waitForMission(second.page, missionId, (mission) => mission.status === "paused", "peer mission pause"),
  ]);
  const pausedDirectors = await Promise.all([first.page, second.page].map((page) =>
    waitForMissionRuntime(page, (state) => state.director.action === "pause"
      && state.director.missionStatus === "paused", "mission pause narration")));
  await first.page.click('.gx-ms [data-action="resume"]');
  const resumedMissions = await Promise.all([
    waitForMission(first.page, missionId, (mission) => mission.status === "active", "owner mission resume control"),
    waitForMission(second.page, missionId, (mission) => mission.status === "active", "peer mission resume control"),
  ]);
  const resumedDirectors = await Promise.all([first.page, second.page].map((page) =>
    waitForMissionRuntime(page, (state) => state.director.action === "resume"
      && state.director.missionStatus === "active", "mission resume narration")));
  const pauseResumeProof = await Promise.all([
    readMissionInvariant(first.page),
    readMissionInvariant(second.page),
  ]);
  check(results, "owner Pause and Resume controls converge without authoring or duplicating the mission board",
    isDeepStrictEqual(pausedMissions[0], pausedMissions[1])
      && pausedMissions.every((mission) => mission.stages[0].status === "assigned")
      && pausedDirectors.every((state) => state.director.stageId === "analyze"
        && state.director.stageStatus === "assigned")
      && isDeepStrictEqual(resumedMissions[0], resumedMissions[1])
      && resumedMissions.every((mission) => mission.stages[0].status === "assigned")
      && resumedDirectors.every((state) => state.director.stageId === "analyze"
        && state.director.stageStatus === "assigned")
      && pauseResumeProof.every((state, index) => state.boardIds.length === 1
        && state.liveRevision === pauseBaseline[index].liveRevision
        && state.runtimeRevision === pauseBaseline[index].runtimeRevision
        && state.history === pauseBaseline[index].history
        && state.document === pauseBaseline[index].document
        && state.fullExport === pauseBaseline[index].fullExport),
    JSON.stringify({ paused: pausedMissions, resumed: resumedMissions,
      directors: { paused: pausedDirectors.map((state) => state.director),
        resumed: resumedDirectors.map((state) => state.director) } }));

  const catchupDropArmed = await first.page.evaluate(() => window.__GRAPHYSX_TEST_DROP_NEXT_MISSION_CATCHUP__());
  const initialStreamDropped = await first.page.evaluate(() => window.__GRAPHYSX_TEST_FORCE_STREAM_ERROR__());
  await first.page.waitForFunction(() => window.__GRAPHYSX_LIVE_SESSION__.status.connection === "reconnecting");
  const workingReceipt = await explorerActor.call("POST", "/sessions/" + sessionId + "/missions/" + missionId + "/events", {
    eventId: "me-browser-analyze-working",
    action: "progress",
    stageId: "analyze",
    state: "working",
    progress: 0.25,
  });
  await first.page.waitForFunction(() => window.__GRAPHYSX_TEST_MISSION_CATCHUP_DROP_COUNT__() === 1);
  const catchupDropProof = await readMissionInvariant(first.page);
  check(results, "a second stream drop after a retained mission event projects nothing before the terminal live cut",
    catchupDropArmed && initialStreamDropped && acceptedMissionStatus(workingReceipt.status)
      && catchupDropProof.mission.connection === "reconnecting"
      && catchupDropProof.mission.director.mode === "neutral"
      && catchupDropProof.missionIds.length === 0 && catchupDropProof.boardIds.length === 0
      && catchupDropProof.artifactIds.length === 0 && catchupDropProof.completionIds.length === 0,
    JSON.stringify({ receipt: workingReceipt.body, runtime: catchupDropProof.mission,
      ids: { mission: catchupDropProof.missionIds, board: catchupDropProof.boardIds } }));
  await waitForLive(first.page, "owner mission catch-up retry");
  await Promise.all([
    waitForMission(first.page, missionId, (mission) => mission.stages[0].status === "working", "owner analyze working"),
    waitForMission(second.page, missionId, (mission) => mission.stages[0].status === "working", "peer analyze working"),
  ]);
  const catchupLiveProof = await readMissionInvariant(first.page);
  check(results, "the proven live cut reprojects the retained mission exactly once",
    catchupLiveProof.mission.connection === "live"
      && catchupLiveProof.mission.mission?.stages[0].status === "working"
      && catchupLiveProof.boardIds.length === 1
      && catchupLiveProof.missionIds.filter((id) => id.endsWith(":board")).length === 1,
    JSON.stringify({ runtime: catchupLiveProof.mission, board: catchupLiveProof.boardIds }));
  const explorerResumeSeq = explorerActor.lastSeq;
  await explorerActor.disconnect();
  const interruptedMissions = await Promise.all([
    waitForMission(first.page, missionId, (mission) => mission.status === "blocked" && mission.stages[0].status === "interrupted", "owner disconnect interruption"),
    waitForMission(second.page, missionId, (mission) => mission.status === "blocked" && mission.stages[0].status === "interrupted", "peer disconnect interruption"),
  ]);
  const disconnectDirectors = await Promise.all([first.page, second.page].map((page) =>
    waitForMissionRuntime(page, (state) => state.director.action === "interrupt" && state.director.reason === "disconnected", "disconnect narration")));
  await Promise.all([
    waitForAgentCount(first.page, 1, "owner mission disconnect"),
    waitForAgentCount(second.page, 1, "peer mission disconnect"),
  ]);
  check(results, "disconnect interrupts the exact assigned stage and Nestor reports the real actor and reason",
    acceptedMissionStatus(workingReceipt.status) && interruptedMissions.every((mission) => mission.updatedSeq > workingReceipt.body.seq)
      && disconnectDirectors.every((state) => state.director.mode === "blocked"
        && state.director.actorId === "mission-scout" && state.director.actorLabel === "Scout"
        && state.director.stageId === "analyze" && state.director.stageStatus === "interrupted"
        && state.director.reason === "disconnected"),
    JSON.stringify(disconnectDirectors.map((state) => state.director)));

  let explorerResume = null;
  let explorerResumeError = null;
  for (let attempt = 0; attempt < 3 && !explorerResume; attempt += 1) {
    try {
      explorerResume = await explorerActor.connect(sessionId, { since: explorerResumeSeq });
    } catch (error) {
      explorerResumeError = error;
      await explorerActor.disconnect();
      await sleep(250 * (attempt + 1));
    }
  }
  if (!explorerResume) throw explorerResumeError ?? new Error("mission explorer reconnect failed");
  const reconnectedMissionAgents = await Promise.all([
    waitForAgentCount(first.page, 2, "owner mission reconnect"),
    waitForAgentCount(second.page, 2, "peer mission reconnect"),
  ]);
  await first.page.click('.gx-ms [data-action="resume"]');
  await Promise.all([
    waitForMission(first.page, missionId, (mission) => mission.status === "active" && mission.stages[0].status === "assigned", "owner mission resume"),
    waitForMission(second.page, missionId, (mission) => mission.status === "active" && mission.stages[0].status === "assigned", "peer mission resume"),
  ]);
  check(results, "reconnect resumes one actor-keyed avatar and owner recovery without duplicate mission projections",
    explorerResume.resumed === true && reconnectedMissionAgents.every((state) => state.agents.length === 2
      && new Set(state.agents.map((agent) => agent.actorId)).size === 2)
      && (await Promise.all([readMissionInvariant(first.page), readMissionInvariant(second.page)]))
        .every((state) => state.boardIds.length === 1),
    JSON.stringify({ hello: explorerResume, agents: reconnectedMissionAgents.map((state) => state.agents) }));

  const analysisSummary = "Scout traced the signal to a missing calibration artifact.";
  const analysisReceipt = await explorerActor.call("POST", "/sessions/" + sessionId + "/missions/" + missionId + "/events", {
    eventId: "me-browser-analyze-complete",
    action: "progress",
    stageId: "analyze",
    state: "completed",
    evidence: { evidenceId: "evidence-browser-analyze", kind: "observation", summary: analysisSummary },
  });
  const analysisDirectors = await Promise.all([first.page, second.page].map((page) =>
    waitForMissionRuntime(page, (state) => state.director.seq === analysisReceipt.body.seq, "analysis narration")));
  const analysisProof = await Promise.all([readMissionInvariant(first.page), readMissionInvariant(second.page)]);
  check(results, "accepted analysis drives the exact Nestor actor, stage, evidence and sequence",
    acceptedMissionStatus(analysisReceipt.status) && analysisDirectors.every((state) => state.director.action === "progress"
      && state.director.actorId === "mission-scout" && state.director.actorLabel === "Scout"
      && state.director.stageId === "analyze" && state.director.stageStatus === "completed"
      && state.director.evidenceId === "evidence-browser-analyze"
      && state.director.intent === analysisSummary && state.director.seq === analysisReceipt.body.seq),
    JSON.stringify(analysisDirectors.map((state) => state.director)));
  check(results, "all mission-only activity through analysis preserves document, revision, history and selection byte-for-byte",
    analysisProof.every((state, index) => state.liveRevision === missionBaseline[index].liveRevision
      && state.runtimeRevision === missionBaseline[index].runtimeRevision
      && state.history === missionBaseline[index].history
      && state.document === missionBaseline[index].document
      && state.fullExport === missionBaseline[index].fullExport
      && JSON.stringify(state.selectedIds) === JSON.stringify(missionBaseline[index].selectedIds)),
    JSON.stringify(analysisProof.map((state, index) => ({
      live: missionBaseline[index].liveRevision + "->" + state.liveRevision,
      runtime: missionBaseline[index].runtimeRevision + "->" + state.runtimeRevision,
    }))));

  const missionAuthoringBoundary = await Promise.all([first.page, second.page].map((page) => page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const transientIds = [
      api.query({ tag: "mission-board" })[0]?.id ?? null,
      api.query({ tag: "mission-artifact" })[0]?.id ?? null,
    ].filter(Boolean);
    const beforeRevision = api.state().revision;
    const beforeHistory = JSON.stringify(api.history());
    const beforeDocument = JSON.stringify(api.exportDocument());
    const beforeExport = JSON.stringify(api.export());
    const beforeSelection = [...api.state().selectedIds];
    const attempts = transientIds.map((id, index) => ({
      id,
      update: api.update(id, { label: "authored mission takeover" }),
      child: api.spawn({ id: "illegal-mission-child-" + index, parentId: id, type: "box" }),
      reference: api.attachBehavior("showroom-nestor", { type: "look-at", targetId: id }),
      selected: api.select([id]),
    }));
    api.select(beforeSelection);
    return {
      transientIds, attempts,
      selectionRestored: JSON.stringify([...api.state().selectedIds]) === JSON.stringify(beforeSelection),
      revisionStable: api.state().revision === beforeRevision,
      historyStable: JSON.stringify(api.history()) === beforeHistory,
      documentStable: JSON.stringify(api.exportDocument()) === beforeDocument,
      exportStable: JSON.stringify(api.export()) === beforeExport,
      missionIds: api.query({ tag: "live-mission" }).map((entity) => entity.id),
    };
  })));
  check(results, "mission boards and artifacts cannot be selected, mutated, parented, referenced or exported",
    missionAuthoringBoundary.every((state) => state.transientIds.length === 2
      && state.attempts.every((attempt) => !attempt.update.ok && !attempt.child.ok
        && !attempt.reference.ok && attempt.selected.length === 0)
      && state.selectionRestored && state.revisionStable && state.historyStable
      && state.documentStable && state.exportStable && state.missionIds.length > 0),
    JSON.stringify(missionAuthoringBoundary));

  // Force the owner browser through a real snapshot/world reload while mission evidence is
  // active. The retained observation must reproject once, never duplicate through world.loaded.
  const activeMissionResync = await first.page.evaluate(async () => {
    const before = window.__GRAPHYSX_LIVE_SESSION__.status;
    const resync = window.__GRAPHYSX_LIVE_SESSION__.resync();
    const during = window.__GRAPHYSX_LIVE_SESSION__.status.connection;
    const revision = await resync;
    return { beforeRevision: before.revision, during, revision };
  });
  await waitForLive(first.page, "owner active-mission resync");
  await waitForMissionRuntime(first.page, (state) => state.mission?.missionId === missionId
    && state.mission.status === "active" && state.boardVisible && state.artifacts.length === 1,
  "owner active-mission reprojection");
  await Promise.all([
    waitForMissionProjection(first.page, missionId, 1, "owner rendered mission reprojection"),
    waitForMissionProjection(second.page, missionId, 1, "peer rendered mission projection"),
  ]);
  const activeMissionResyncProof = await Promise.all([readMissionInvariant(first.page), readMissionInvariant(second.page)]);
  check(results, "an owner resync restores exactly one active board and evidence artifact in both warm tabs",
    activeMissionResync.during === "reconnecting"
      && activeMissionResync.revision === activeMissionResync.beforeRevision
      && activeMissionResyncProof.every((state) => state.liveRevision === activeMissionResync.beforeRevision
        && state.boardIds.length === 1 && state.artifactIds.length === 1
        && state.mission?.mission?.missionId === missionId && state.mission.mission.status === "active"
        && state.mission.artifacts.length === 1
        && state.projectedMission?.mission?.missionId === missionId
        && state.projectedMission.boardVisible && state.projectedMission.artifacts.length === 1
        && !state.document.includes("live-mission:") && !state.fullExport.includes("live-mission:"))
      && isDeepStrictEqual(
        normalizeSerializedDocument(activeMissionResyncProof[0].document),
        normalizeSerializedDocument(activeMissionResyncProof[1].document),
      ),
    JSON.stringify({ transition: activeMissionResync, projection: activeMissionResyncProof.map((state) => ({
      boardIds: state.boardIds, artifactIds: state.artifactIds, runtime: state.mission,
    })) }));

  const buildIntent = "Scout fabricates the accepted browser calibration artifact";
  const buildOperation = await explorerActor.call("POST", "/sessions/" + sessionId + "/ops", {
    opId: "op-browser-mission-artifact",
    path: "spawn",
    commands: [{ op: "spawn", entity: {
      id: "browser-mission-artifact",
      type: "icosahedron",
      label: "Browser mission calibration artifact",
      transform: { position: [-1.5, 1.1, -3.5] },
    } }],
    intent: buildIntent,
  });
  await Promise.all([first.page, second.page].map((page) => page.waitForFunction(() =>
    window.__GRAPHYSX__.query({ ids: ["browser-mission-artifact"] }).length === 1)));
  const buildReceipt = await explorerActor.call("POST", "/sessions/" + sessionId + "/missions/" + missionId + "/events", {
    eventId: "me-browser-build-complete",
    action: "progress",
    stageId: "build",
    state: "completed",
    evidence: { evidenceId: "evidence-browser-build", kind: "operation", opId: "op-browser-mission-artifact" },
  });
  const buildDirectors = await Promise.all([first.page, second.page].map((page) =>
    waitForMissionRuntime(page, (state) => state.director.seq === buildReceipt.body.seq, "build narration")));
  await Promise.all([first.page, second.page].map((page) => page.waitForFunction((revision) =>
    window.__GRAPHYSX_LIVE_SESSION__.status.revision === revision, buildOperation.body.revision)));
  const buildProof = await Promise.all([readMissionInvariant(first.page), readMissionInvariant(second.page)]);
  check(results, "build completion copies the stable accepted operation receipt into bounded evidence",
    acceptedOperationStatus(buildOperation.status) && acceptedMissionStatus(buildReceipt.status)
      && buildReceipt.body.evidence.operation.opId === buildOperation.body.opId
      && buildReceipt.body.evidence.operation.seq === buildOperation.body.seq
      && buildReceipt.body.evidence.operation.revision === buildOperation.body.revision
      && buildReceipt.body.evidence.operation.intent === buildIntent
      && buildReceipt.body.evidence.operation.touched.includes("browser-mission-artifact"),
    JSON.stringify({ operation: buildOperation.body, evidence: buildReceipt.body.evidence }));
  check(results, "Nestor reports the exact build actor, intent, stage and authoritative state in both browsers",
    buildDirectors.every((state) => state.director.action === "progress"
      && state.director.actorId === "mission-scout" && state.director.actorLabel === "Scout"
      && state.director.stageId === "build" && state.director.stageStatus === "completed"
      && state.director.missionStatus === "active"
      && state.director.evidenceId === "evidence-browser-build"
      && state.director.intent === buildIntent
      && state.director.seq === buildReceipt.body.seq
      && state.director.revision === buildOperation.body.revision),
    JSON.stringify(buildDirectors.map((state) => state.director)));
  check(results, "both runtimes project inspectable operation evidence without serializing the holograms",
    buildProof.every((state) => {
      const artifact = state.mission?.artifacts.find((entry) => entry.evidenceId === "evidence-browser-build");
      return state.boardIds.length === 1 && state.artifactIds.length === 2
        && artifact?.actorId === "mission-scout" && artifact?.opId === "op-browser-mission-artifact"
        && artifact?.operationPath === "spawn" && artifact?.operationIntent === buildIntent
        && artifact?.targetIds.includes("browser-mission-artifact")
        && state.document.includes("browser-mission-artifact")
        && !state.document.includes("live-mission:") && !state.fullExport.includes("live-mission:");
    }),
    JSON.stringify(buildProof.map((state) => state.mission)));

  await waitForQuietAgentProjection(first.page, 2, "active-evidence render sample");
  const missionRenderActiveEvidence = {
    high: await sampleRendererBudget(first.page, "active-evidence-high", { width: 1280, height: 800 }, "high"),
    mobile: await sampleRendererBudget(first.page, "active-evidence-mobile", { width: 390, height: 844 }, "mobile"),
  };
  await first.page.screenshot({
    path: path.join(ARTIFACTS, "live-mission-evidence-390.png"),
    fullPage: false,
  });
  await settleRenderProfile(first.page, { width: 1280, height: 800 }, "high");
  const missionRenderMetrics = {
    schema: "graphysx.live-mission-render-budget/v1",
    sampleFrames: 24,
    tolerance: { ratio: 1.1, rounding: 0.5 },
    baseline: missionRenderBaseline,
    activeEvidence: missionRenderActiveEvidence,
  };
  console.log(JSON.stringify(missionRenderMetrics));
  const withinMissionRenderBudget = (active, baseline, key) =>
    Number.isFinite(active[key]) && Number.isFinite(baseline[key])
      && active[key] <= baseline[key] * 1.1 + 0.5;
  check(results, "active mission evidence stays within ten percent of its same-browser live-agent render baseline",
    [missionRenderBaseline.high, missionRenderBaseline.mobile,
      missionRenderActiveEvidence.high, missionRenderActiveEvidence.mobile]
      .every((sample) => !sample.timedOut && sample.frames >= 24
        && sample.profile.name === sample.expectedProfile && sample.rootProfile === sample.expectedProfile
        && sample.actorId === "owner-ada"
        && sample.agentCount === 2 && sample.reactionRootCount === 0
        && sample.callsPerFrame > 0 && sample.trianglesPerFrame > 0)
      && [missionRenderBaseline.high, missionRenderActiveEvidence.high]
        .every((sample) => sample.viewport.width === 1280 && sample.viewport.height === 800)
      && [missionRenderBaseline.mobile, missionRenderActiveEvidence.mobile]
        .every((sample) => sample.viewport.width === 390 && sample.viewport.height === 844)
      && missionRenderBaseline.high.missionStatus === null
      && missionRenderBaseline.mobile.missionStatus === null
      && missionRenderBaseline.high.boardRootCount === 0 && missionRenderBaseline.mobile.boardRootCount === 0
      && missionRenderBaseline.high.artifactRootCount === 0 && missionRenderBaseline.mobile.artifactRootCount === 0
      && missionRenderActiveEvidence.high.missionStatus === "active"
      && missionRenderActiveEvidence.mobile.missionStatus === "active"
      && missionRenderActiveEvidence.high.boardRootCount === 1
      && missionRenderActiveEvidence.mobile.boardRootCount === 1
      && missionRenderActiveEvidence.high.evidenceCount === 2
      && missionRenderActiveEvidence.mobile.evidenceCount === 2
      && missionRenderActiveEvidence.high.artifactCap === 4
      && missionRenderActiveEvidence.mobile.artifactCap === 2
      && [missionRenderActiveEvidence.high, missionRenderActiveEvidence.mobile].every((sample) =>
        sample.expectedArtifactCount === 2
          && sample.artifactRootCount === sample.expectedArtifactCount
          && sample.artifactViewCount === sample.expectedArtifactCount)
      && withinMissionRenderBudget(missionRenderActiveEvidence.high, missionRenderBaseline.high, "callsPerFrame")
      && withinMissionRenderBudget(missionRenderActiveEvidence.high, missionRenderBaseline.high, "trianglesPerFrame")
      && withinMissionRenderBudget(missionRenderActiveEvidence.mobile, missionRenderBaseline.mobile, "callsPerFrame")
      && withinMissionRenderBudget(missionRenderActiveEvidence.mobile, missionRenderBaseline.mobile, "trianglesPerFrame"),
    JSON.stringify(missionRenderMetrics));

  const missionFocusOrigin = await first.page.evaluate(() => ({
    camera: window.__GRAPHYSX_HOST__.camera.position.toArray(),
    target: window.__GRAPHYSX_HOST__.orbitTarget.toArray(),
  }));
  const captureMissionFocus = async (selector) => {
    const started = await first.page.evaluate((buttonSelector) => {
      const host = window.__GRAPHYSX_HOST__;
      const originalFocusOn = host.focusOn;
      let capturedTarget = null;
      host.focusOn = function(point, ...args) {
        capturedTarget = point.toArray();
        return originalFocusOn.call(host, point, ...args);
      };
      try {
        const button = document.querySelector(buttonSelector);
        if (!(button instanceof HTMLButtonElement)) return { clicked: false, capturedTarget, focusing: host.focusing };
        button.click();
        return { clicked: true, capturedTarget, focusing: host.focusing };
      } finally {
        host.focusOn = originalFocusOn;
      }
    }, selector);
    await first.page.waitForFunction(() => window.__GRAPHYSX_HOST__.focusing === false);
    const landed = await first.page.evaluate(() => window.__GRAPHYSX_HOST__.orbitTarget.toArray());
    const distance = started.capturedTarget
      ? Math.hypot(...landed.map((value, index) => value - started.capturedTarget[index]))
      : Number.POSITIVE_INFINITY;
    return { ...started, landed, distance };
  };
  const boardFocusProof = await captureMissionFocus('.gx-ms [data-action="focus"]');
  const evidenceFocusProof = await captureMissionFocus('.gx-ms [data-evidence="evidence-browser-build"]');
  await first.page.evaluate(({ camera, target }) => {
    window.__GRAPHYSX_HOST__.frameView(camera, target, 0.15);
  }, missionFocusOrigin);
  await first.page.waitForFunction(() => window.__GRAPHYSX_HOST__.focusing === false);
  check(results, "owner mission and evidence controls focus the exact projected board and artifact targets",
    boardFocusProof.clicked && boardFocusProof.focusing && boardFocusProof.distance < 0.05
      && evidenceFocusProof.clicked && evidenceFocusProof.focusing && evidenceFocusProof.distance < 0.05
      && Math.hypot(...boardFocusProof.landed.map((value, index) => value - evidenceFocusProof.landed[index])) > 1,
    JSON.stringify({ board: boardFocusProof, evidence: evidenceFocusProof }));

  const fullMotionProjection = await readMissionMotionInvariant(first.page);
  await first.page.emulateMedia({ reducedMotion: "reduce" });
  await first.page.evaluate(() => {
    const motion = document.querySelector('select[aria-label="Motion preference"]');
    if (!(motion instanceof HTMLSelectElement)) throw new Error("Motion preference control is unavailable");
    motion.value = "auto";
    motion.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await first.page.waitForFunction(() => {
    const api = window.__GRAPHYSX__;
    const projected = [...api.query({ tag: "live-mission" }), ...api.query({ tag: "live-agent" })];
    return document.documentElement.dataset.gxMotion === "reduce"
      && projected.length > 0
      && projected.every((entity) => (entity.behaviors?.length ?? 0) === 0)
      && window.__GRAPHYSX_LIVE_MISSION__?.state().boardVisible === true;
  });
  const reducedMotionProjection = await readMissionMotionInvariant(first.page);
  await first.page.emulateMedia({ reducedMotion: "no-preference" });
  await first.page.evaluate(() => {
    const motion = document.querySelector('select[aria-label="Motion preference"]');
    if (!(motion instanceof HTMLSelectElement)) throw new Error("Motion preference control is unavailable");
    motion.value = "auto";
    motion.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await first.page.waitForFunction(() => {
    const api = window.__GRAPHYSX__;
    const agents = api.query({ tag: "live-agent" });
    return document.documentElement.dataset.gxMotion === "full"
      && api.query({ tag: "live-mission" }).some((entity) => (entity.behaviors?.length ?? 0) > 0)
      && agents.length === 2
      && agents.every((entity) => (entity.behaviors?.length ?? 0) > 0);
  });
  const restoredMotionProjection = await readMissionMotionInvariant(first.page);
  check(results, "reduced-motion preference reprojects stable mission and agent ids without animated behaviors",
    fullMotionProjection.motionPreference === "full"
      && fullMotionProjection.animatedMissionIds.length > 0
      && fullMotionProjection.animatedAgentIds.length === 2
      && reducedMotionProjection.motionPreference === "reduce"
      && reducedMotionProjection.animatedMissionIds.length === 0
      && reducedMotionProjection.animatedAgentIds.length === 0
      && reducedMotionProjection.boardIds.length === 1
      && reducedMotionProjection.artifactIds.length === 2
      && reducedMotionProjection.runtime?.mission?.status === "active"
      && reducedMotionProjection.runtime.boardVisible
      && isDeepStrictEqual(reducedMotionProjection.missionIds, fullMotionProjection.missionIds)
      && isDeepStrictEqual(reducedMotionProjection.agentIds, fullMotionProjection.agentIds)
      && isDeepStrictEqual(restoredMotionProjection.missionIds, fullMotionProjection.missionIds)
      && isDeepStrictEqual(restoredMotionProjection.agentIds, fullMotionProjection.agentIds)
      && restoredMotionProjection.animatedMissionIds.length === fullMotionProjection.animatedMissionIds.length
      && restoredMotionProjection.animatedAgentIds.length === fullMotionProjection.animatedAgentIds.length,
    JSON.stringify({ full: fullMotionProjection, reduced: reducedMotionProjection,
      restored: restoredMotionProjection }));

  const buildMissionViews = await Promise.all([first.page, second.page].map((page) => page.evaluate((id) =>
    window.__GRAPHYSX_LIVE_SESSION__.status.missions.find((mission) => mission.missionId === id), missionId)));
  const buildServerCut = await api(store.url, "GET", "/sessions/" + sessionId + "/snapshot", undefined, ownerCredential);
  const buildServerMission = buildServerCut.body.missions.find((mission) => mission.missionId === missionId);
  const buildConvergence = {
    clientMissions: isDeepStrictEqual(buildMissionViews[0], buildMissionViews[1]),
    serverMission: isDeepStrictEqual(buildMissionViews[0], buildServerMission),
    documents: isDeepStrictEqual(
      normalizeSerializedDocument(buildProof[0].document),
      normalizeSerializedDocument(buildProof[1].document),
    ),
    revisions: buildProof.map((state) => state.liveRevision),
  };
  check(results, "both browsers and the atomic server cut converge on the same mission, document and revision",
    buildConvergence.clientMissions && buildConvergence.serverMission && buildConvergence.documents
      && buildConvergence.revisions.every((revision) => revision === buildOperation.body.revision),
    JSON.stringify({ proof: buildConvergence, clients: buildMissionViews, server: buildServerMission }));
  const postBuildBaseline = buildProof;

  const revokeValidator = await api(store.url, "DELETE",
    "/sessions/" + sessionId + "/members/" + validatorJoin.body.member.memberId,
    undefined, ownerCredential);
  const revokedMissions = await Promise.all([
    waitForMission(first.page, missionId, (mission) => mission.status === "blocked" && mission.stages[2].status === "interrupted", "owner validator revocation"),
    waitForMission(second.page, missionId, (mission) => mission.status === "blocked" && mission.stages[2].status === "interrupted", "peer validator revocation"),
  ]);
  const revokedDirectors = await Promise.all([first.page, second.page].map((page) =>
    waitForMissionRuntime(page, (state) => state.director.action === "interrupt" && state.director.reason === "revoked", "revocation narration")));
  await Promise.all([
    waitForAgentCount(first.page, 1, "owner validator revocation"),
    waitForAgentCount(second.page, 1, "peer validator revocation"),
  ]);
  check(results, "revocation immediately blocks validation and Nestor names the revoked actor without inventing success",
    revokeValidator.status === 200 && revokedMissions.every((mission) => mission.status === "blocked")
      && revokedDirectors.every((state) => state.director.mode === "blocked"
        && state.director.actorId === "mission-validator" && state.director.actorLabel === "Verifier"
        && state.director.stageId === "validate" && state.director.stageStatus === "interrupted"
        && state.director.reason === "revoked"),
    JSON.stringify(revokedDirectors.map((state) => state.director)));

  const missionViewerInvite = await inviteFor("viewer");
  const missionViewerJoin = await api(store.url, "POST", "/sessions/" + sessionId + "/join", {
    code: missionViewerInvite.code,
    actor: { id: "mission-viewer", label: "Mission viewer", kind: "human" },
  });
  const missionSeqBeforeViewer = revokedMissions[0].updatedSeq;
  const viewerMissionAttempt = await api(store.url, "POST", "/sessions/" + sessionId + "/missions/" + missionId + "/events", {
    eventId: "me-browser-viewer-progress",
    action: "progress",
    stageId: "validate",
    state: "completed",
    evidence: {
      evidenceId: "evidence-browser-viewer",
      kind: "validation",
      outcome: "passed",
      summary: "A viewer cannot certify the result.",
      inspectedRevision: buildOperation.body.revision,
    },
  }, missionViewerJoin.body.credential);
  const afterViewerRefusal = await api(store.url, "GET", "/sessions/" + sessionId + "/snapshot", undefined, ownerCredential);
  check(results, "viewer mission progress is refused without advancing authoritative state",
    missionViewerJoin.status === 201 && viewerMissionAttempt.status === 403
      && afterViewerRefusal.body.missions.find((mission) => mission.missionId === missionId).updatedSeq === missionSeqBeforeViewer,
    JSON.stringify({ join: missionViewerJoin.status, refusal: viewerMissionAttempt.body }));

  const replacementInvite = await inviteFor("agent", ["mission:validate"]);
  const replacementJoin = await api(store.url, "POST", "/sessions/" + sessionId + "/join", {
    code: replacementInvite.code,
    actor: { id: "mission-validator-2", label: "Verifier Two", kind: "agent" },
  });
  const replacementActor = createActor(store.url, { credential: replacementJoin.body.credential });
  missionActors.push(replacementActor);
  await replacementActor.connect(sessionId);
  await Promise.all([
    waitForAgentCount(first.page, 2, "owner replacement validator"),
    waitForAgentCount(second.page, 2, "peer replacement validator"),
  ]);
  await first.page.waitForFunction((memberId) => [...document.querySelectorAll('select[data-assign-stage="validate"] option')]
    .some((option) => option.value === memberId), replacementJoin.body.member.memberId);
  await first.page.selectOption('select[data-assign-stage="validate"]', replacementJoin.body.member.memberId);
  await Promise.all([
    waitForMission(first.page, missionId, (mission) => mission.stages[2].assignment?.memberId === replacementJoin.body.member.memberId, "owner validation reassignment"),
    waitForMission(second.page, missionId, (mission) => mission.stages[2].assignment?.memberId === replacementJoin.body.member.memberId, "peer validation reassignment"),
  ]);
  await first.page.click('.gx-ms [data-action="resume"]');
  const reassignedMissions = await Promise.all([
    waitForMission(first.page, missionId, (mission) => mission.status === "active" && mission.stages[2].status === "assigned", "owner validation resume"),
    waitForMission(second.page, missionId, (mission) => mission.status === "active" && mission.stages[2].status === "assigned", "peer validation resume"),
  ]);
  const replacementStations = await Promise.all([first.page, second.page].map((page) => page.evaluate(() =>
    window.__GRAPHYSX_LIVE_PRESENCE__.state().agents.find((agent) => agent.actorId === "mission-validator-2") ?? null)));
  check(results, "owner reassignment resumes validation at the deterministic play station in both browsers",
    replacementJoin.status === 201 && reassignedMissions.every((mission) => mission.stages[2].assignment.actorId === "mission-validator-2")
      && replacementStations.every((agent) => agent?.station === "play" && agent.stageId === "validate"),
    JSON.stringify({ missions: reassignedMissions, stations: replacementStations }));

  const validationSummary = "Verifier Two inspected the accepted artifact at the authoritative revision.";
  const completedDirectorWaiters = [first.page, second.page].map((page) => waitForMissionRuntime(page, (state) =>
    state.mission?.missionId === missionId
      && state.director.mode === "completed"
      && state.director.actorId === "mission-validator-2"
      && state.director.stageId === "validate",
  "completion narration"));
  const validationReceipt = await replacementActor.call("POST", "/sessions/" + sessionId + "/missions/" + missionId + "/events", {
    eventId: "me-browser-validation-complete",
    action: "progress",
    stageId: "validate",
    state: "completed",
    evidence: {
      evidenceId: "evidence-browser-validation",
      kind: "validation",
      outcome: "passed",
      summary: validationSummary,
      inspectedRevision: buildOperation.body.revision,
    },
  });
  const [completedMissions, completedDirectors] = await Promise.all([
    Promise.all([
      waitForMission(first.page, missionId, (mission) => mission.status === "completed", "owner mission completion"),
      waitForMission(second.page, missionId, (mission) => mission.status === "completed", "peer mission completion"),
    ]),
    Promise.all(completedDirectorWaiters),
  ]);
  const completedServerCut = await api(store.url, "GET", "/sessions/" + sessionId + "/snapshot", undefined, ownerCredential);
  const completedServerMission = completedServerCut.body.missions.find((mission) => mission.missionId === missionId);
  check(results, "passed current-revision validation completes all three stages and converges with the server cut",
    acceptedMissionStatus(validationReceipt.status) && completedMissions.every((mission) => mission.stages.every((stage) => stage.status === "completed")
      && mission.stages[0].latestEvidence.kind === "observation"
      && mission.stages[1].latestEvidence.operation.opId === "op-browser-mission-artifact"
      && mission.stages[2].latestEvidence.outcome === "passed"
      && mission.stages[2].latestEvidence.inspectedRevision === buildOperation.body.revision)
      && JSON.stringify(completedMissions[0]) === JSON.stringify(completedMissions[1])
      && JSON.stringify(completedMissions[0]) === JSON.stringify(completedServerMission)
      && completedDirectors.every((state) => state.director.mode === "completed"
        && state.director.action === "progress"
        && state.director.actorId === "mission-validator-2"
        && state.director.actorLabel === "Verifier Two"
        && state.director.stageId === "validate"
        && state.director.stageStatus === "completed"
        && state.director.missionStatus === "completed"
        && state.director.evidenceId === "evidence-browser-validation"
        && state.director.intent === validationSummary
        && /passed/i.test(state.director.message)
        && state.director.seq === validationReceipt.body.seq
        && state.director.revision === buildOperation.body.revision),
    JSON.stringify({ receipt: validationReceipt.body, mission: completedServerMission,
      directors: completedDirectors.map((state) => state.director) }));

  await Promise.all([first.page, second.page].map((page) =>
    waitForMissionRuntime(page, (state) => state.mission?.missionId === missionId
      && state.mission.status === "completed" && !state.boardVisible
      && !state.completionVisible && state.artifacts.length === 0, "completion cleanup", Math.max(SMOKE_TIMEOUT, 10_000))));
  await Promise.all([first.page, second.page].map((page, index) =>
    waitForQuietAgentProjection(page, 2, `completion resources tab ${index + 1}`)));
  const completedCleanup = await Promise.all([first.page, second.page].map((page, index) =>
    readPrimedMissionInvariant(page, `completion cleanup tab ${index + 1}`)));
  check(results, "completion removes every mission projection and returns resources while preserving the accepted document",
    completedCleanup.every((state, index) => state.missionIds.length === 0
      && state.boardIds.length === 0 && state.artifactIds.length === 0 && state.completionIds.length === 0
      && state.liveRevision === postBuildBaseline[index].liveRevision
      && state.runtimeRevision === postBuildBaseline[index].runtimeRevision
      && state.history === postBuildBaseline[index].history
      && state.document === postBuildBaseline[index].document
      && state.fullExport === postBuildBaseline[index].fullExport
      && state.resources.textures === missionBaseline[index].resources.textures
      && state.resources.geometries === missionBaseline[index].resources.geometries + 1),
    JSON.stringify({ baseline: missionBaseline.map((state) => state.resources),
      cleanup: completedCleanup.map((state) => ({ missionIds: state.missionIds, resources: state.resources })) }));

  const terminalReconnectStart = await first.page.evaluate(() => ({
    forced: window.__GRAPHYSX_TEST_FORCE_STREAM_ERROR__?.() ?? false,
    connection: window.__GRAPHYSX_LIVE_SESSION__.status.connection,
  }));
  await waitForLive(first.page, "owner completed-mission reconnect");
  const terminalReconnectRuntime = await waitForMissionRuntime(first.page, (state) =>
    state.mission?.missionId === missionId && state.mission.status === "completed"
      && state.director.mode === "neutral" && !state.boardVisible
      && !state.completionVisible && state.artifacts.length === 0,
  "completed mission neutral reconnect");
  const terminalReconnectProof = await readMissionInvariant(first.page);
  const terminalNestorChrome = await first.page.evaluate(() => {
    const observer = document.querySelector(".gx-welcome--live-observer");
    return {
      action: observer?.getAttribute("data-mission-action") ?? null,
      stage: observer?.getAttribute("data-mission-stage") ?? null,
      title: observer?.querySelector("[data-nestor-title]")?.textContent ?? "",
    };
  });
  check(results, "a terminal mission reconnect cannot leave Nestor completed or resurrect projections",
    terminalReconnectStart.forced && terminalReconnectStart.connection === "reconnecting"
      && terminalReconnectRuntime.director.mode === "neutral"
      && terminalReconnectProof.missionIds.length === 0
      && terminalReconnectProof.boardIds.length === 0
      && terminalReconnectProof.artifactIds.length === 0
      && terminalReconnectProof.completionIds.length === 0
      && terminalReconnectProof.projectedMission?.director.mode === "neutral"
      && terminalNestorChrome.action === null && terminalNestorChrome.stage === null
      && !/mission complete/i.test(terminalNestorChrome.title),
    JSON.stringify({ start: terminalReconnectStart, runtime: terminalReconnectRuntime, chrome: terminalNestorChrome }));

  const missionUndoProof = await first.page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const undo = api.undo();
    return {
      ok: undo.ok,
      artifactPresent: api.query({ ids: ["browser-mission-artifact"] }).length,
      missionIds: api.query({ tag: "live-mission" }).map((entity) => entity.id),
      export: JSON.stringify(api.export()),
    };
  });
  check(results, "Undo after cleanup cannot resurrect mission boards, artifacts or completion effects",
    missionUndoProof.ok && missionUndoProof.artifactPresent === 0 && missionUndoProof.missionIds.length === 0
      && !missionUndoProof.export.includes("live-mission:"),
    JSON.stringify(missionUndoProof));
  await first.page.evaluate(() => window.__GRAPHYSX_LIVE_SESSION__.resync());
  await waitForLive(first.page, "owner after mission undo resync");
  await first.page.waitForFunction(() => window.__GRAPHYSX__.query({ ids: ["browser-mission-artifact"] }).length === 1);

  await Promise.all([first.page, second.page].map((page, index) =>
    waitForQuietAgentProjection(page, 2, `cancel baseline tab ${index + 1}`)));
  const cancelBaseline = await Promise.all([first.page, second.page].map((page, index) =>
    readPrimedMissionInvariant(page, `cancel baseline resources tab ${index + 1}`)));
  const cancelMissionId = "mission-browser-cancel";
  const cancelAssignments = [
    { stageId: "analyze", memberId: explorerJoin.body.member.memberId },
    { stageId: "build", memberId: explorerJoin.body.member.memberId },
    { stageId: "validate", memberId: replacementJoin.body.member.memberId },
  ];
  await first.page.evaluate(async (request) => window.__GRAPHYSX_LIVE_SESSION__.startMission(request), {
    eventId: "me-browser-cancel-start",
    missionId: cancelMissionId,
    templateId: "agentx-center-artifact-v1",
    assignments: cancelAssignments,
  });
  await Promise.all([
    waitForMission(first.page, cancelMissionId, (mission) => mission.status === "briefing", "owner cancel briefing"),
    waitForMission(second.page, cancelMissionId, (mission) => mission.status === "briefing", "peer cancel briefing"),
  ]);
  await first.page.evaluate(async (id) => window.__GRAPHYSX_LIVE_SESSION__.controlMission(id, "activate", "me-browser-cancel-activate"), cancelMissionId);
  await Promise.all([
    waitForMission(first.page, cancelMissionId, (mission) => mission.status === "active", "owner cancel activation"),
    waitForMission(second.page, cancelMissionId, (mission) => mission.status === "active", "peer cancel activation"),
  ]);
  await Promise.all([first.page, second.page].map((page) =>
    waitForMissionRuntime(page, (state) => state.mission?.missionId === cancelMissionId
      && state.mission.status === "active" && state.boardVisible, "cancel cycle projection")));
  const secondCycleProjection = await Promise.all([readMissionInvariant(first.page), readMissionInvariant(second.page)]);
  await first.page.evaluate(async (id) => window.__GRAPHYSX_LIVE_SESSION__.controlMission(id, "cancel", "me-browser-cancel-terminal"), cancelMissionId);
  const cancelledMissions = await Promise.all([
    waitForMission(first.page, cancelMissionId, (mission) => mission.status === "cancelled", "owner cancellation"),
    waitForMission(second.page, cancelMissionId, (mission) => mission.status === "cancelled", "peer cancellation"),
  ]);
  await Promise.all([first.page, second.page].map((page) =>
    waitForMissionRuntime(page, (state) => state.mission?.missionId === cancelMissionId
      && state.mission.status === "cancelled" && !state.boardVisible
      && !state.completionVisible && state.artifacts.length === 0, "cancel cleanup")));
  await Promise.all([first.page, second.page].map((page, index) =>
    waitForQuietAgentProjection(page, 2, `cancel cleanup tab ${index + 1}`)));
  const cancelCleanup = await Promise.all([first.page, second.page].map((page, index) =>
    readPrimedMissionInvariant(page, `cancel cleanup resources tab ${index + 1}`)));
  check(results, "a second start/cancel cycle projects once and returns renderer resources exactly to baseline",
    secondCycleProjection.every((state) => state.boardIds.length === 1)
      && cancelledMissions.every((mission) => mission.stages.every((stage) => stage.status === "cancelled"))
      && cancelCleanup.every((state, index) => state.missionIds.length === 0
        && state.liveRevision === cancelBaseline[index].liveRevision
        && state.runtimeRevision === cancelBaseline[index].runtimeRevision
        && state.history === cancelBaseline[index].history
        && state.document === cancelBaseline[index].document
        && state.fullExport === cancelBaseline[index].fullExport
        && state.resources.geometries === cancelBaseline[index].resources.geometries
        && state.resources.textures === cancelBaseline[index].resources.textures),
    JSON.stringify({ missions: cancelledMissions, projection: secondCycleProjection.map((state) => state.boardIds),
      baseline: cancelBaseline.map((state) => state.resources),
      cleanup: cancelCleanup.map((state) => state.resources) }));

  const missionMemberIds = [
    explorerJoin.body.member.memberId,
    replacementJoin.body.member.memberId,
    missionViewerJoin.body.member.memberId,
  ];
  const missionRemovalStatuses = [];
  for (const memberId of missionMemberIds) {
    const removal = await api(store.url, "DELETE", "/sessions/" + sessionId + "/members/" + memberId, undefined, ownerCredential);
    missionRemovalStatuses.push(removal.status);
  }
  for (const actor of missionActors.splice(0)) await actor.disconnect().catch(() => undefined);
  await Promise.all([
    waitForAgentCount(first.page, 0, "owner mission actor cleanup"),
    waitForAgentCount(second.page, 0, "peer mission actor cleanup"),
  ]);
  const missionFinalCleanup = await Promise.all([readMissionInvariant(first.page), readMissionInvariant(second.page)]);
  check(results, "mission actor removal leaves no avatars, holograms, duplicate boards or authored mission data",
    missionRemovalStatuses.every((status) => status === 200)
      && missionFinalCleanup.every((state) => state.presence.agents.length === 0
        && state.missionIds.length === 0 && state.boardIds.length === 0 && state.artifactIds.length === 0
        && !state.document.includes("live-mission:") && !state.fullExport.includes("live-mission:")),
    JSON.stringify({ removals: missionRemovalStatuses, cleanup: missionFinalCleanup.map((state) => ({
      agents: state.presence.agents, missionIds: state.missionIds,
    })) }));

  // Nested entity configs are patches in the runtime, so the document arbiter must preserve
  // the same siblings. Exercise it through the real client/server/SSE path, not only the pure
  // command validator.
  await waitForLive(first.page, "Alice before nested-config parity");
  await first.page.evaluate(() => window.__GRAPHYSX_LIVE_SESSION__.submit(
    [{ op: "spawn", entity: {
      id: "browser-partial-sound", type: "sound", label: "Browser partial sound",
      sound: { source: "coin", volume: 0.7, loop: false, autoplay: false, positional: true, refDistance: 15 },
    } }],
    { opId: "op-browser-partial-sound-spawn", intent: "add parity sound" },
  ));
  const soundPatchReceipt = await first.page.evaluate(() => window.__GRAPHYSX_LIVE_SESSION__.submit(
    [{ op: "update", id: "browser-partial-sound", patch: { sound: { volume: 0.2 } } }],
    { opId: "op-browser-partial-sound-update", intent: "patch only sound volume" },
  ));
  await second.page.waitForFunction((expectedRevision) =>
    window.__GRAPHYSX_LIVE_SESSION__.status.revision === expectedRevision
      && window.__GRAPHYSX__.query({ ids: ["browser-partial-sound"] })[0]?.sound?.volume === 0.2,
  soundPatchReceipt.revision);
  const soundParity = await Promise.all([first.page, second.page].map((page) => page.evaluate(() =>
    window.__GRAPHYSX__.query({ ids: ["browser-partial-sound"] })[0]?.sound ?? null)));
  const soundServer = await api(store.url, "GET", `/sessions/${sessionId}/snapshot`, undefined, ownerCredential);
  const soundServerState = soundServer.body.definition.entities.find((entity) => entity.id === "browser-partial-sound")?.sound;
  check(results, "partial nested sound updates stay identical in both runtimes and the server snapshot",
    [...soundParity, soundServerState].every((sound) =>
      sound?.source === "coin" && sound.volume === 0.2 && sound.loop === false
        && sound.autoplay === false && sound.positional === true && sound.refDistance === 15),
    JSON.stringify({ clients: soundParity, server: soundServerState }));

  const environmentBefore = await first.page.evaluate(() => window.__GRAPHYSX__.exportDocument().environment);
  const environmentReceipt = await first.page.evaluate(() => window.__GRAPHYSX_LIVE_SESSION__.submit(
    [{ op: "set-environment", environment: { background: "#10243a" } }],
    { path: "set-environment", opId: "op-browser-environment-partial", intent: "patch only background" },
  ));
  await second.page.waitForFunction((expectedRevision) =>
    window.__GRAPHYSX_LIVE_SESSION__.status.revision === expectedRevision
      && window.__GRAPHYSX__.exportDocument().environment.background === "#10243a",
  environmentReceipt.revision);
  const environmentParity = await Promise.all([first.page, second.page].map((page) => page.evaluate(() =>
    window.__GRAPHYSX__.exportDocument().environment)));
  const environmentServer = await api(store.url, "GET", `/sessions/${sessionId}/snapshot`, undefined, ownerCredential);
  check(results, "partial environment patches preserve omitted top-level runtime state",
    environmentParity.every((environment) => environment.background === "#10243a"
      && JSON.stringify(environment.ground) === JSON.stringify(environmentBefore.ground))
      && environmentServer.body.definition.environment.background === "#10243a"
      && JSON.stringify(environmentServer.body.definition.environment.ground) === JSON.stringify(environmentBefore.ground),
    JSON.stringify({ clients: environmentParity, server: environmentServer.body.definition.environment }));

  // --- atomic resync cuts ---------------------------------------------------------------

  // Capture the authenticated response *after* the server has cut snapshot S but before
  // the browser receives/loads it. Operations accepted in that window must either be in S
  // or replay after S; none may be overwritten while their seq remains advanced.
  const holdSnapshot = async (page) => {
    const hookReady = await page.evaluate(() => typeof window.__GRAPHYSX_TEST_HOLD_SNAPSHOT__ === "function");
    let immediateId = null;
    let pendingKey = null;
    if (hookReady) {
      immediateId = await page.evaluate(() => window.__GRAPHYSX_TEST_HOLD_SNAPSHOT__());
    } else {
      // configurePage runs before the first navigation. The primary init script is already
      // registered, so this second one arms its hook as soon as that document is created.
      pendingKey = `__GRAPHYSX_SNAPSHOT_HOLD_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      await page.addInitScript((key) => {
        window[key] = window.__GRAPHYSX_TEST_HOLD_SNAPSHOT__();
      }, pendingKey);
    }
    const resolveId = async () => {
      if (immediateId !== null) return immediateId;
      const deadline = Date.now() + SMOKE_TIMEOUT;
      for (;;) {
        let id = null;
        try {
          id = await page.evaluate((key) => window[key] ?? null, pendingKey);
        } catch (error) {
          if (page.isClosed() || Date.now() > deadline) throw error;
          // A navigation swaps execution contexts between these two lines. Retry against the
          // new document instead of turning a correctly armed barrier into a harness failure.
        }
        if (id !== null) return id;
        if (Date.now() > deadline) throw new Error("snapshot barrier did not arm on navigation");
        await sleep(50);
      }
    };
    const captured = (async () => {
      const id = await resolveId();
      const deadline = Date.now() + SMOKE_TIMEOUT;
      for (;;) {
        try {
          if (await page.evaluate((holdId) =>
            window.__GRAPHYSX_TEST_SNAPSHOT_CAPTURED__?.(holdId) ?? false, id)) return;
        } catch (error) {
          if (page.isClosed() || Date.now() > deadline) throw error;
        }
        if (Date.now() > deadline) throw new Error("snapshot response was not captured by the in-page barrier");
        await sleep(50);
      }
    })();
    return {
      captured,
      release: async () => {
        const id = await resolveId();
        return page.evaluate((holdId) => window.__GRAPHYSX_TEST_RELEASE_SNAPSHOT__(holdId), id);
      },
    };
  };
  const waitForBarrier = async (barrier, label) => {
    const reached = await Promise.race([
      barrier.then(() => true),
      sleep(SMOKE_TIMEOUT).then(() => false),
    ]);
    if (!reached) throw new Error(`${label} did not reach the held snapshot response`);
  };
  const ownerSpawn = async (id, intent) => {
    const before = await api(store.url, "GET", `/sessions/${sessionId}/snapshot`, undefined, ownerCredential);
    return api(store.url, "POST", `/sessions/${sessionId}/ops`, {
      opId: `op-${id}`,
      baseRevision: before.body.revision,
      path: "transaction",
      commands: [{ op: "spawn", entity: { id, type: "box", label: id, transform: { position: [3, 0.5, -2] } } }],
      intent,
    }, ownerCredential);
  };

  let markOwnRequestHeld = () => undefined;
  let releaseOwnRequest = () => undefined;
  const ownRequestHeld = new Promise((resolve) => { markOwnRequestHeld = resolve; });
  const ownRequestReleased = new Promise((resolve) => { releaseOwnRequest = resolve; });
  await first.page.route(operationUrl, async (route) => {
    markOwnRequestHeld();
    await ownRequestReleased;
    await route.continue();
  }, { times: 1 });
  const ownDuringResyncPromise = first.page.evaluate(() => window.__GRAPHYSX_LIVE_SESSION__.submit(
    [{ op: "spawn", entity: {
      id: "resync-own-crate", type: "box", label: "resync-own-crate", transform: { position: [2, 0.5, -2] },
    } }],
    { opId: "op-resync-own-crate", intent: "alice writes across resync" },
  ));
  await waitForBarrier(ownRequestHeld, "own operation before manual resync");
  const manualStreamBefore = await first.page.evaluate(() =>
    window.__GRAPHYSX_TEST_STREAM_STATE__());
  const manualCut = await holdSnapshot(first.page);
  const manualResync = first.page.evaluate(() => window.__GRAPHYSX_LIVE_SESSION__.resync());
  await waitForBarrier(manualCut.captured, "manual resync");
  const manualStreamDuring = await first.page.evaluate(() =>
    window.__GRAPHYSX_TEST_STREAM_STATE__());
  releaseOwnRequest();
  const ownDuringResync = await ownDuringResyncPromise;
  const remoteDuringResync = await ownerSpawn("resync-remote-crate", "Ada writes across resync");
  check(results, "own and remote operations are accepted behind a held manual snapshot",
    Number.isInteger(ownDuringResync?.revision) && acceptedOperationStatus(remoteDuringResync.status),
    JSON.stringify({ own: ownDuringResync, remote: remoteDuringResync.body }));
  await manualCut.release();
  await manualResync;
  await Promise.all([first.page, second.page].map((page) => page.waitForFunction(() =>
    ["resync-own-crate", "resync-remote-crate"].every((id) => window.__GRAPHYSX__.query({ ids: [id] }).length === 1))));
  const manualRecovery = await Promise.all([first.page, second.page].map((page) => page.evaluate(() => ({
    revision: window.__GRAPHYSX_LIVE_SESSION__.status.revision,
    ownCount: window.__GRAPHYSX__.query({ ids: ["resync-own-crate"] }).length,
    remoteCount: window.__GRAPHYSX__.query({ ids: ["resync-remote-crate"] }).length,
  }))));
  const manualServer = await api(store.url, "GET", `/sessions/${sessionId}/snapshot`, undefined, ownerCredential);
  await waitForLive(first.page, "Alice after held manual resync");
  const manualStreamAfter = await first.page.evaluate(() =>
    window.__GRAPHYSX_TEST_STREAM_STATE__());
  const manualSourceId = manualStreamBefore.activeSourceId;
  check(results, "manual resync retires its previous stream only after the held snapshot",
    manualSourceId !== null
      && manualStreamDuring.activeSourceId === manualSourceId
      && manualStreamDuring.closeCounts[manualSourceId] === 0
      && manualStreamAfter.activeSourceId !== manualSourceId
      && manualStreamAfter.closeCounts[manualSourceId] === 1,
    JSON.stringify({ sourceId: manualSourceId, during: manualStreamDuring, after: manualStreamAfter }));
  check(results, "manual resync replays snapshot-straddling own and remote operations exactly once",
    manualRecovery.every((state) => state.revision === manualServer.body.revision
      && state.ownCount === 1 && state.remoteCount === 1)
      && manualServer.body.definition.entities.filter((entity) => entity.id === "resync-own-crate").length === 1
      && manualServer.body.definition.entities.filter((entity) => entity.id === "resync-remote-crate").length === 1,
    JSON.stringify({ clients: manualRecovery, serverRevision: manualServer.body.revision }));

  await waitForLive(first.page, "Alice before forced mustResync");
  const forcedCut = await holdSnapshot(first.page);
  const forced = await first.page.evaluate(() => window.__GRAPHYSX_TEST_FORCE_MUST_RESYNC__?.() ?? false);
  check(results, "the mustResync regression reaches the real stream hello handler", forced === true);
  await waitForBarrier(forcedCut.captured, "mustResync");
  const forcedOperation = await ownerSpawn("must-resync-crate", "Ada writes during mustResync");
  check(results, "a remote operation is accepted behind the held mustResync snapshot",
    acceptedOperationStatus(forcedOperation.status), JSON.stringify(forcedOperation.body));
  await forcedCut.release();
  await first.page.waitForFunction((expectedRevision) =>
    window.__GRAPHYSX_LIVE_SESSION__.status.revision === expectedRevision
      && window.__GRAPHYSX__.query({ ids: ["must-resync-crate"] }).length === 1,
  forcedOperation.body.revision);
  const forcedRecovery = await first.page.evaluate(() => ({
    revision: window.__GRAPHYSX_LIVE_SESSION__.status.revision,
    count: window.__GRAPHYSX__.query({ ids: ["must-resync-crate"] }).length,
    connection: window.__GRAPHYSX_LIVE_SESSION__.status.connection,
  }));
  check(results, "mustResync reconnects from the atomic cut and applies the raced op once",
    forcedRecovery.revision === forcedOperation.body.revision && forcedRecovery.count === 1,
    JSON.stringify(forcedRecovery));

  // Undo is not optimistic. Sever Alice's stream before requesting one so the HTTP receipt
  // wins deterministically; undo() must remain pending until its fallback snapshot embodies
  // the inverse instead of resolving with a revision the runtime has not applied.
  await waitForLive(first.page, "Alice before undo receipt ordering");
  await first.page.evaluate(() => window.__GRAPHYSX_LIVE_SESSION__.submit(
    [{ op: "spawn", entity: {
      id: "undo-receipt-crate", type: "box", label: "undo-receipt-crate", transform: { position: [1, 0.5, -3] },
    } }],
    { opId: "op-undo-receipt-crate", intent: "create undo receipt ordering fixture" },
  ));
  await second.page.waitForFunction(() =>
    window.__GRAPHYSX__.query({ ids: ["undo-receipt-crate"] }).length === 1);
  const revisionBeforeReceiptOnlyUndo = await first.page.evaluate(() =>
    window.__GRAPHYSX_LIVE_SESSION__.status.revision);
  const streamClosedForUndo = await first.page.evaluate(() => window.__GRAPHYSX_TEST_CLOSE_STREAM__?.() ?? false);
  await first.page.evaluate(() => {
    window.__GRAPHYSX_TEST_UNDO_RESULT__ = null;
    void window.__GRAPHYSX_LIVE_SESSION__.undo("op-undo-receipt-crate").then((result) => {
      window.__GRAPHYSX_TEST_UNDO_RESULT__ = result;
    });
  });
  await sleep(350);
  const receiptOnlyUndo = await first.page.evaluate(() => ({
    result: window.__GRAPHYSX_TEST_UNDO_RESULT__ ?? null,
    revision: window.__GRAPHYSX_LIVE_SESSION__.status.revision,
    count: window.__GRAPHYSX__.query({ ids: ["undo-receipt-crate"] }).length,
  }));
  check(results, "an undo HTTP receipt cannot outrun embodiment of its inverse",
    streamClosedForUndo
      && receiptOnlyUndo.result === null
      && receiptOnlyUndo.revision === revisionBeforeReceiptOnlyUndo
      && receiptOnlyUndo.count === 1,
    JSON.stringify(receiptOnlyUndo));
  await first.page.waitForFunction(() =>
    window.__GRAPHYSX_TEST_UNDO_RESULT__?.ok === true
      && window.__GRAPHYSX__.query({ ids: ["undo-receipt-crate"] }).length === 0);
  const undoServer = await api(store.url, "GET", `/sessions/${sessionId}/snapshot`, undefined, ownerCredential);
  const undoRecovered = await first.page.evaluate(() => ({
    result: window.__GRAPHYSX_TEST_UNDO_RESULT__,
    revision: window.__GRAPHYSX_LIVE_SESSION__.status.revision,
    count: window.__GRAPHYSX__.query({ ids: ["undo-receipt-crate"] }).length,
  }));
  check(results, "receipt-first undo falls back to an atomic snapshot before resolving",
    undoRecovered.result?.ok === true
      && undoRecovered.revision === undoServer.body.revision
      && undoRecovered.count === 0
      && undoServer.body.definition.entities.every((entity) => entity.id !== "undo-receipt-crate"),
    JSON.stringify({ client: undoRecovered, serverRevision: undoServer.body.revision }));
  await waitForLive(first.page, "Alice after undo recovery");

  // Resume hello advertises the server's latest revision before its missed op frames are
  // dispatched. Hold the new stream ticket, land one remote op, then attempt a local write
  // from the earliest hello listener: it must be refused until replay + terminal presence
  // make the runtime genuinely live.
  let markResumeTicket = () => undefined;
  let releaseResumeTicket = () => undefined;
  const resumeTicketHeld = new Promise((resolve) => { markResumeTicket = resolve; });
  const resumeTicketReleased = new Promise((resolve) => { releaseResumeTicket = resolve; });
  await first.page.route(`**/sessions/${sessionId}/stream-ticket`, async (route) => {
    markResumeTicket();
    await resumeTicketReleased;
    await route.continue();
  }, { times: 1 });
  await first.page.evaluate(() => window.__GRAPHYSX_TEST_SUBMIT_ON_NEXT_HELLO__(
    [{ op: "spawn", entity: { id: "too-early-resume-crate", type: "box" } }],
    { opId: "op-too-early-resume-crate", intent: "must wait for catch-up" },
  ));
  const resumeErrorTriggered = await first.page.evaluate(() =>
    window.__GRAPHYSX_TEST_FORCE_STREAM_ERROR__?.() ?? false);
  await waitForBarrier(resumeTicketHeld, "resume stream ticket");
  const duringResume = await ownerSpawn("resume-catchup-crate", "Ada writes before resume hello");
  releaseResumeTicket();
  await first.page.waitForFunction((expectedRevision) =>
    window.__GRAPHYSX_TEST_HELLO_SUBMIT__ !== null
      && window.__GRAPHYSX_LIVE_SESSION__.status.connection === "live"
      && window.__GRAPHYSX_LIVE_SESSION__.status.revision === expectedRevision
      && window.__GRAPHYSX__.query({ ids: ["resume-catchup-crate"] }).length === 1,
  duringResume.body.revision);
  const resumeOrdering = await first.page.evaluate(() => ({
    earlySubmit: window.__GRAPHYSX_TEST_HELLO_SUBMIT__,
    revision: window.__GRAPHYSX_LIVE_SESSION__.status.revision,
    caughtUp: window.__GRAPHYSX__.query({ ids: ["resume-catchup-crate"] }).length,
    tooEarly: window.__GRAPHYSX__.query({ ids: ["too-early-resume-crate"] }).length,
  }));
  check(results, "resume stays non-authoring until missed operations are embodied",
    resumeErrorTriggered
      && acceptedOperationStatus(duringResume.status)
      && resumeOrdering.earlySubmit === "session-not-ready"
      && resumeOrdering.revision === duringResume.body.revision
      && resumeOrdering.caughtUp === 1
      && resumeOrdering.tooEarly === 0,
    JSON.stringify(resumeOrdering));

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
  const detachedPresence = await readPresenceInvariant(first.page);
  check(results, "leaving a live session clears every host-owned presence visual",
    detachedPresence.presence?.sessionId === null
      && detachedPresence.presence.agents.length === 0
      && detachedPresence.avatarIds.length === 0
      && detachedPresence.reactionIds.length === 0,
    JSON.stringify(detachedPresence.presence));
  await first.page.waitForSelector(".gx-welcome:not(.gx-welcome--live-observer) .gx-go-editor");
  await first.page.click(".gx-welcome:not(.gx-welcome--live-observer) .gx-go-editor");
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
  const pendingJoinCut = await holdSnapshot(first.page);

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

  const pendingSnapshotCaptured = await Promise.race([
    pendingJoinCut.captured.then(() => true),
    sleep(SMOKE_TIMEOUT).then(() => false),
  ]);
  if (!pendingSnapshotCaptured) throw new Error("Alice's rejoin never reached the held snapshot response");

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
    pendingSnapshotCaptured
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
  await first.page.waitForSelector(".gx-welcome:not(.gx-welcome--live-observer) .gx-go-editor");
  await first.page.click(".gx-welcome:not(.gx-welcome--live-observer) .gx-go-editor");
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

  await pendingJoinCut.release();
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
  await waitForLive(first.page, "Alice reattach");

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

  // Reuse Bob's already-warm renderer for Carol's initial-join race. A third full AgentX
  // Center under software WebGL adds no protocol coverage and can starve its own bootstrap.
  await second.page.evaluate(() => window.__GRAPHYSX_LIVE_SESSION__.leave());
  await second.page.waitForFunction(() => window.__GRAPHYSX_LIVE_SESSION__.status.connection === "offline");
  const viewerPage = second.page;
  const viewerInitialCut = await holdSnapshot(viewerPage);
  await viewerPage.evaluate((args) => {
    window.__GRAPHYSX_TEST_INITIAL_JOIN__ = window.__GRAPHYSX_LIVE_SESSION__.join(
      args.sessionId,
      args.code,
      { id: "carol", label: "carol", kind: "human" },
    ).then(() => ({ ok: true })).catch((error) => ({ ok: false, error: String(error?.message ?? error) }));
  }, { sessionId, code: carolViewer.code });
  await waitForBarrier(viewerInitialCut.captured, "initial join");
  const initialOperation = await ownerSpawn("initial-sync-crate", "Ada writes during initial sync");
  check(results, "a remote operation is accepted behind the held initial snapshot",
    acceptedOperationStatus(initialOperation.status), JSON.stringify(initialOperation.body));
  await viewerInitialCut.release();
  const initialJoinResult = await viewerPage.evaluate(() => window.__GRAPHYSX_TEST_INITIAL_JOIN__);
  if (!initialJoinResult.ok) throw new Error(`Carol initial join failed: ${initialJoinResult.error}`);
  await viewerPage.waitForFunction((expectedRevision) =>
    window.__GRAPHYSX_LIVE_SESSION__.status.revision === expectedRevision
      && window.__GRAPHYSX__.query({ ids: ["initial-sync-crate"] }).length === 1,
  initialOperation.body.revision);
  const initialRecovery = await viewerPage.evaluate(() => ({
    revision: window.__GRAPHYSX_LIVE_SESSION__.status.revision,
    count: window.__GRAPHYSX__.query({ ids: ["initial-sync-crate"] }).length,
  }));
  check(results, "initial sync opens from the atomic snapshot cut and replays the raced op once",
    initialRecovery.revision === initialOperation.body.revision && initialRecovery.count === 1,
    JSON.stringify(initialRecovery));
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

  // Lost terminal while idle: close the browser transport without notifying the client,
  // revoke Carol, then deliver the transport error that starts its normal reconnect. The
  // ticket rejection must recover the backing scene once and detach, not retry forever.
  const idleRevocationHttpErrors = expectHttpConsoleErrors(viewerPage, "idle revocation recovery", [
    { path: `/sessions/${sessionId}/stream-ticket`, status: 401, count: 1 },
  ]);
  const idleStreamDropped = await viewerPage.evaluate(() => window.__GRAPHYSX_TEST_CLOSE_STREAM__());
  const rosterBeforeIdleRevocation = await api(store.url, "GET", `/sessions/${sessionId}`, undefined, ownerCredential);
  const carolMember = rosterBeforeIdleRevocation.body.session.members.find((member) => member.actorId === "carol");
  const idleRemoval = await api(
    store.url, "DELETE", `/sessions/${sessionId}/members/${carolMember.memberId}`, undefined, ownerCredential,
  );
  const idleErrorDispatched = await viewerPage.evaluate(() => window.__GRAPHYSX_TEST_FORCE_STREAM_ERROR__());
  await viewerPage.waitForFunction(() =>
    window.__GRAPHYSX_LIVE_SESSION__.status.connection === "offline"
      && window.__GRAPHYSX_LIVE_SESSION__.status.sessionId === null);
  const idleRecovery = await viewerPage.evaluate(() => ({
    status: window.__GRAPHYSX_LIVE_SESSION__.status,
    ids: window.__GRAPHYSX__.exportDocument().entities.map((entity) => entity.id).sort(),
  }));
  const idleServerSceneResponse = await requestText(`${store.url}/scenes/${SCENE}`);
  const idleServerScene = JSON.parse(idleServerSceneResponse.text);
  await sleep(800);
  const idleStillDetached = await viewerPage.evaluate(() => window.__GRAPHYSX_LIVE_SESSION__.status);
  await sealExpectedHttpConsoleErrors(idleRevocationHttpErrors);
  check(results, "an idle client with a lost revocation frame recovers once and detaches offline",
    idleStreamDropped && idleErrorDispatched && idleRemoval.status === 200
      && idleRecovery.status.sessionId === null && idleRecovery.status.connection === "offline"
      && idleStillDetached.sessionId === null && idleStillDetached.connection === "offline"
      && JSON.stringify(idleRecovery.ids)
        === JSON.stringify(idleServerScene.definition.entities.map((entity) => entity.id).sort()),
    JSON.stringify({ removal: idleRemoval.status, recovery: idleRecovery.status, later: idleStillDetached }));

  // A dropped connection must recover on its own and land on the same revision.
  await second.page.evaluate(() => window.__GRAPHYSX_LIVE_SESSION__.leave());
  await second.page.waitForFunction(() => window.__GRAPHYSX_LIVE_SESSION__.status.connection === "offline");
  // Scoped again: `.gx-sb` (the scene browser) also has a `data-role="dot"` status light.
  const offlineNote = await second.page.$eval('.gx-ls [data-role="dot"]', (node) => node.dataset.state);
  check(results, "a disconnected browser shows an offline state", offlineNote === "offline", offlineNote ?? "none");

  await waitForLive(first.page, "Alice before Bob catch-up fixture");
  await first.page.evaluate(() => window.__GRAPHYSX_LIVE_SESSION__.submit(
    [{ op: "spawn", entity: { id: "while-away-crate", type: "box", label: "While away" } }], { intent: "while bob is away" },
  ));
  const rejoined = await second.page.evaluate(async (args) => {
    await window.__GRAPHYSX_LIVE_SESSION__.join(args.sessionId, args.code, { id: "bob", label: "bob", kind: "human" });
    return window.__GRAPHYSX_LIVE_SESSION__.status.revision;
  }, { sessionId, code: (await inviteFor("editor")).code });
  await waitForLive(second.page, "Bob rejoin catch-up");
  check(results, "a rejoining browser catches up to the current revision",
    rejoined === (await first.page.evaluate(() => window.__GRAPHYSX_LIVE_SESSION__.status.revision)), String(rejoined));
  const caughtUp = await second.page.evaluate(() => Boolean(window.__GRAPHYSX__.query({ ids: ["while-away-crate"] }).length));
  check(results, "the rejoining browser has the work it missed", caughtUp === true);
  const dedupedRosterCounts = await Promise.all([first.page, second.page].map((page) => page.evaluate(() => ({
    alice: document.querySelectorAll('.gx-ls-member[data-actor="alice"]').length,
    bob: document.querySelectorAll('.gx-ls-member[data-actor="bob"]').length,
  }))));
  check(results, "reconnect history renders one current roster row per actor",
    dedupedRosterCounts.every((counts) => counts.alice === 1 && counts.bob === 1),
    JSON.stringify(dedupedRosterCounts));

  // Revocation is terminal for the already-open stream and authoritative for optimistic
  // local state. Hold Bob's POST in the browser so removal wins before the server can admit
  // it; the terminal snapshot must erase the local crate before the rejected POST returns.
  let markRevokedSubmitHeld = () => undefined;
  let releaseRevokedSubmit = () => undefined;
  const revokedSubmitHeld = new Promise((resolve) => { markRevokedSubmitHeld = resolve; });
  const revokedSubmitRelease = new Promise((resolve) => { releaseRevokedSubmit = resolve; });
  await second.page.route(operationUrl, async (route) => {
    markRevokedSubmitHeld();
    await revokedSubmitRelease;
    await route.continue();
  }, { times: 1 });
  await second.page.evaluate(() => {
    window.__GRAPHYSX_TEST_REVOKED_SUBMIT__ = window.__GRAPHYSX_LIVE_SESSION__.submit(
      [{ op: "spawn", entity: { id: "revoked-optimistic-crate", type: "box", label: "must roll back" } }],
      { opId: "op-revoked-optimistic-crate", intent: "must lose removal race" },
    ).then(() => ({ ok: true })).catch((error) => ({
      ok: false,
      status: error?.status ?? null,
      code: error?.code ?? null,
    }));
  });
  await waitForBarrier(revokedSubmitHeld, "revoked optimistic submit");
  const rosterForRemoval = await api(store.url, "GET", `/sessions/${sessionId}`, undefined, ownerCredential);
  const onlineBob = rosterForRemoval.body.session.members.find((member) => member.actorId === "bob" && member.online);
  const browserRemoval = await api(
    store.url, "DELETE", `/sessions/${sessionId}/members/${onlineBob.memberId}`, undefined, ownerCredential,
  );
  await second.page.waitForFunction(() =>
    window.__GRAPHYSX_LIVE_SESSION__.status.connection === "offline"
      && window.__GRAPHYSX_LIVE_SESSION__.status.sessionId === null
      && window.__GRAPHYSX__.query({ ids: ["revoked-optimistic-crate"] }).length === 0);
  const revokedSubmitHttpErrors = expectHttpConsoleErrors(second.page, "revoked optimistic submit", [
    { path: `/sessions/${sessionId}/ops`, status: 401, count: 1 },
  ]);
  releaseRevokedSubmit();
  const revokedSubmitResult = await second.page.evaluate(() => window.__GRAPHYSX_TEST_REVOKED_SUBMIT__);
  await sealExpectedHttpConsoleErrors(revokedSubmitHttpErrors);
  check(results, "own revocation detaches authority and rolls back a rejected optimistic submit",
    browserRemoval.status === 200 && revokedSubmitResult.ok === false
      && [401, 403, 404, 409, 410].includes(revokedSubmitResult.status),
    JSON.stringify({ removal: browserRemoval.status, submit: revokedSubmitResult }));

  const afterBrowserRevocation = await first.page.evaluate(() => window.__GRAPHYSX_LIVE_SESSION__.submit(
    [{ op: "spawn", entity: { id: "after-browser-revocation", type: "box", label: "after revocation" } }],
    { opId: "op-after-browser-revocation", intent: "prove revoked stream is terminal" },
  ));
  await sleep(250);
  const revokedClientAfterLaterOp = await second.page.evaluate(() => ({
    status: window.__GRAPHYSX_LIVE_SESSION__.status,
    laterEntity: window.__GRAPHYSX__.query({ ids: ["after-browser-revocation"] }).length,
  }));
  check(results, "a revoked browser receives no later live operation and cannot reconnect itself",
    Number.isInteger(afterBrowserRevocation.revision)
      && revokedClientAfterLaterOp.status.connection === "offline"
      && revokedClientAfterLaterOp.status.sessionId === null
      && revokedClientAfterLaterOp.laterEntity === 0,
    JSON.stringify(revokedClientAfterLaterOp));

  // --- rendered evidence -------------------------------------------------------------------

  await first.page.waitForFunction(() => (window.__GRAPHYSX__.state()?.elapsedSeconds ?? 0) > 0.4);
  await first.page.screenshot({ path: path.join(ARTIFACTS, "live-session-desktop.png") });
  await first.page.setViewportSize({ width: 420, height: 860 });
  await sleep(400);
  const mobilePanel = await first.page.$eval(".gx-ls", (node) => {
    const memberList = node.querySelector(".gx-ls-members");
    const stressRows = Array.from({ length: 30 }, (_, index) => {
      const row = document.createElement("li");
      row.dataset.smokeLayout = "true";
      row.textContent = `Layout stress member ${index + 1}`;
      return row;
    });
    memberList?.append(...stressRows);
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    const result = {
      width: rect.width,
      height: rect.height,
      right: rect.right,
      bottom: rect.bottom,
      maxHeight: Number.parseFloat(style.maxHeight),
      overflowY: style.overflowY,
      scrollHeight: node.scrollHeight,
    };
    stressRows.forEach((row) => row.remove());
    return result;
  });
  check(results, "the panel stays on screen at a phone width",
    mobilePanel.right <= 421 && mobilePanel.bottom <= 861
      && mobilePanel.maxHeight <= 400
      && mobilePanel.height <= mobilePanel.maxHeight + 1
      && mobilePanel.scrollHeight > mobilePanel.height
      && mobilePanel.overflowY === "auto",
    JSON.stringify(mobilePanel));
  await first.page.screenshot({ path: path.join(ARTIFACTS, "live-session-mobile.png") });

  // Final close-vs-submit proof. The browser has already committed this crate optimistically,
  // but its HTTP request is still local. Deliberately drop the terminal stream, close the
  // session, then release the POST: its rejection must recover the backing scene through the
  // non-SSE fallback before the client declares itself offline.
  let markCloseSubmitHeld = () => undefined;
  let releaseCloseSubmit = () => undefined;
  const closeSubmitHeld = new Promise((resolve) => { markCloseSubmitHeld = resolve; });
  const closeSubmitRelease = new Promise((resolve) => { releaseCloseSubmit = resolve; });
  const terminalStreamDropped = await first.page.evaluate(() => window.__GRAPHYSX_TEST_CLOSE_STREAM__());
  await first.page.route(operationUrl, async (route) => {
    markCloseSubmitHeld();
    await closeSubmitRelease;
    await route.continue();
  }, { times: 1 });
  await first.page.evaluate(() => {
    window.__GRAPHYSX_TEST_CLOSE_SUBMIT__ = window.__GRAPHYSX_LIVE_SESSION__.submit(
      [{ op: "spawn", entity: { id: "close-optimistic-crate", type: "box", label: "must roll back on close" } }],
      { opId: "op-close-optimistic-crate", intent: "must lose close race" },
    ).then(() => ({ ok: true })).catch((error) => ({
      ok: false,
      status: error?.status ?? null,
      code: error?.code ?? null,
    }));
  });
  await waitForBarrier(closeSubmitHeld, "close optimistic submit");
  const closedSession = await api(store.url, "DELETE", `/sessions/${sessionId}`, undefined, ownerCredential);
  const closeRecoveryHttpErrors = expectHttpConsoleErrors(first.page, "closed-session submit recovery", [
    { path: `/sessions/${sessionId}/ops`, status: 404, count: 1 },
    { path: `/sessions/${sessionId}/snapshot`, status: 404, count: 1 },
  ]);
  releaseCloseSubmit();
  const closeSubmitResult = await first.page.evaluate(() => window.__GRAPHYSX_TEST_CLOSE_SUBMIT__);
  await first.page.waitForFunction(() =>
    window.__GRAPHYSX_LIVE_SESSION__.status.connection === "offline"
      && window.__GRAPHYSX_LIVE_SESSION__.status.sessionId === null
      && window.__GRAPHYSX__.query({ ids: ["close-optimistic-crate"] }).length === 0);
  await sealExpectedHttpConsoleErrors(closeRecoveryHttpErrors);
  const finalStoredSceneResponse = await requestText(`${store.url}/scenes/${SCENE}`);
  const finalStoredScene = JSON.parse(finalStoredSceneResponse.text);
  const closeRuntime = await first.page.evaluate(() => ({
    definition: window.__GRAPHYSX__.exportDocument(),
    status: window.__GRAPHYSX_LIVE_SESSION__.status,
  }));
  const finalRuntimeIds = closeRuntime.definition.entities.map((entity) => entity.id).sort();
  const finalStoredIds = finalStoredScene.definition.entities.map((entity) => entity.id).sort();
  check(results, "serialized session close restores final authority before going offline",
    terminalStreamDropped && closedSession.status === 200 && closeSubmitResult.ok === false
      && closeRuntime.status.connection === "offline" && closeRuntime.status.sessionId === null
      && closeRuntime.status.revision === finalStoredScene.revision
      && JSON.stringify(finalRuntimeIds) === JSON.stringify(finalStoredIds)
      && !finalRuntimeIds.includes("close-optimistic-crate"),
    JSON.stringify({ close: closedSession.status, submit: closeSubmitResult, status: closeRuntime.status }));

  const missingExpectedHttpErrors = expectedHttpConsoleScopes.flatMap((scope) =>
    scope.entries
      .filter((entry) => entry.observed !== entry.count)
      .map((entry) => ({
        probe: scope.label,
        path: entry.path,
        status: entry.status,
        expected: entry.count,
        observed: entry.observed,
        locations: entry.locations,
      })));
  check(results, "intentional terminal-recovery HTTP errors match exact endpoint/status counts",
    missingExpectedHttpErrors.length === 0, JSON.stringify(missingExpectedHttpErrors));

  if (!suppliedBase) {
    // Stop, drain, and directly re-probe before reading the strict failure sentinel. Context
    // cleanup therefore cannot abort an in-flight keepalive after the assertion has passed.
    await Promise.all([first.page, second.page].map((page) => page.evaluate(async () => {
      const stop = window.__GRAPHYSX_TEST_STOP_STORE_KEEPALIVE__;
      if (typeof stop !== "function") throw new Error("GraphysX smoke store keepalive is missing");
      await stop();
    })));
    await sleep(50);
  }

  check(results, "no console errors, page errors or failed requests in any browser",
    browserProblems.length === 0, browserProblems.slice(0, 5).join(" | "));

  await first.context.close();
  await second.context.close();
} catch (error) {
  check(results, "smoke-live-sessions-browser threw", false, error instanceof Error ? error.stack : String(error));
} finally {
  for (const actor of missionActors.splice(0)) await actor.disconnect().catch(() => undefined);
  if (agentActor) await agentActor.disconnect().catch(() => undefined);
  if (browser) await browser.close();
  if (store) await store.close();
  if (statics) await statics.close();
  if (dir) await rm(dir, { recursive: true, force: true });
}

report(results, "smoke-live-sessions-browser");
