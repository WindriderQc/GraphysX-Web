import { SMOKE_TIMEOUT, applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { mkdirSync } from "node:fs";
import path from "node:path";

const EXE = process.env.SMOKE_CHROMIUM || undefined;
const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:4188/";
const ART = process.env.SMOKE_ARTIFACTS || path.resolve("output/smoke");
mkdirSync(ART, { recursive: true });

const consoleErrors = [];
const pageErrors = [];

const browser = await launchSmokeBrowser();
const page = await browser.newPage();
applySmokeTimeout(page);
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => pageErrors.push(String(e)));

const out = {};
try {
  // Default route = the clean host booting the welcome showroom.
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: SMOKE_TIMEOUT });
  await page.waitForFunction(() => !!window.__GRAPHYSX_HOST__, { timeout: SMOKE_TIMEOUT });
  await page.waitForSelector(".gx-welcome", { timeout: SMOKE_TIMEOUT });
  await page.waitForTimeout(700);

  out.welcomePresent = (await page.$(".gx-welcome")) !== null;
  out.editorHiddenInitially = await page.evaluate(() => {
    const t = document.querySelector(".gx-ed-toolbar");
    return !t || getComputedStyle(t).display === "none";
  });
  out.entityCount = await page.evaluate(() => window.__GRAPHYSX__.state().entities.length);
  out.nestorInitial = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const agent = api.query({ ids: ["showroom-nestor"] })[0] ?? null;
    const consoles = api.state().entities.filter((entity) =>
      entity.type === "group" && entity.id.startsWith("showroom-nestor-console-"));
    const rendered = JSON.parse(window.render_game_to_text());
    return agent ? {
      type: agent.type,
      role: agent.agent?.role ?? null,
      status: agent.agent?.status ?? null,
      capabilities: agent.agent?.capabilities ?? [],
      consoleCount: consoles.length,
      renderedAgentId: rendered.nestor?.agentId ?? null,
      renderedStatus: rendered.nestor?.status ?? null,
    } : null;
  });

  const probeCam = () => page.evaluate(() => {
    const h = window.__GRAPHYSX_HOST__;
    const p = h.camera.position;
    return { x: p.x, z: p.z, frame: h.frameCount };
  });
  // The front door plays an entry move on load. It has to be waited out before the idle orbit
  // is measured: the check below infers auto-orbit from ANY camera drift, so probing during
  // the intro would pass while proving nothing about the orbit. Assert the intro separately
  // rather than disabling it — both are real front-door behaviour.
  const introStart = await probeCam();
  await page.waitForFunction(() => window.__GRAPHYSX_HOST__.introPlaying === false, null, { timeout: 20000 });
  const introEnd = await probeCam();
  out.introMoved = Math.hypot(introEnd.x - introStart.x, introEnd.z - introStart.z);
  // The move must land on the authored framing, not merely stop somewhere, and the exposure
  // must return to full — an intro that leaves the scene dimmed is a bug, not a flourish.
  // `introMoved` is recorded but NOT asserted: page setup outlasts the 2.6s move, so the
  // start of it is not observable from here and the number is the tail only. Completion is
  // asserted through `introCompleted` instead, which cannot be confused with "no intro ran".
  out.introLanded = await page.evaluate(() => {
    const h = window.__GRAPHYSX_HOST__;
    const p = h.camera.position;
    return {
      completed: h.introCompleted === true,
      exposure: h.renderer.toneMappingExposure,
      framed: Math.hypot(p.x - 9, p.y - 12, p.z - 22) < 1.5,
    };
  });

  const a = await probeCam();
  await page.waitForTimeout(1500);
  const b = await probeCam();
  out.framesAdvanced = b.frame - a.frame;
  out.camMoved = Math.hypot(b.x - a.x, b.z - a.z);
  // Any camera drift with no user input proves auto-orbit is active (headless fps is low,
  // so this is intentionally movement-based, not distance-thresholded).
  out.autoOrbiting = out.framesAdvanced > 0 && out.camMoved > 0.004;

  await page.screenshot({ path: path.join(ART, "showroom.png"), fullPage: false });

  // Interactive physics: clicking a kinetic body fires its apply-impulse interaction, and
  // clicking the ground drops a dynamic sphere. Both go through the ordinary agent API.
  const entityPos = (id) => page.evaluate((entityId) => {
    const e = window.__GRAPHYSX__.state().entities.find((x) => x.id === entityId);
    return e ? e.position ?? e.transform?.position ?? null : null;
  }, id);
  const screenOf = (id) => page.evaluate((entityId) => {
    const host = window.__GRAPHYSX_HOST__;
    const obj = host.world.getEntityObject(entityId);
    if (!obj) return null;
    const v = obj.getWorldPosition(new (obj.position.constructor)());
    v.project(host.camera);
    const rect = host.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((-v.y + 1) / 2) * rect.height };
  }, id);

  const blockBefore = await entityPos("showroom-block-5");
  const blockAt = await screenOf("showroom-block-5");
  if (blockAt) await page.mouse.click(blockAt.x, blockAt.y);
  // Wait for the body to actually move rather than guessing a duration. Headless software
  // GL runs the frame loop at a few fps, so a fixed timeout races the physics step — this
  // is a wait on the condition being asserted, not a weaker assertion.
  await page
    .waitForFunction(
      (a) => {
        const e = window.__GRAPHYSX__.state().entities.find((x) => x.id === a.id);
        const p = e && (e.position ?? e.transform?.position);
        return !!p && Math.hypot(p[0] - a.b[0], p[1] - a.b[1], p[2] - a.b[2]) > 0.15;
      },
      { id: "showroom-block-5", b: blockBefore },
      { timeout: SMOKE_TIMEOUT },
    )
    .catch(() => {});
  const blockAfter = await entityPos("showroom-block-5");
  out.impulseMoved = blockBefore && blockAfter
    ? Number(Math.hypot(blockAfter[0] - blockBefore[0], blockAfter[1] - blockBefore[1], blockAfter[2] - blockBefore[2]).toFixed(3))
    : 0;

  // The chime ring: knocking the stack must actually sound it, from scene data alone.
  // Stepped deterministically rather than waited on — the headless rAF loop advances only
  // ~0.3s of sim per 2.5s of wall clock on this 92-entity scene under software WebGL, so
  // real-time waiting measures the renderer, not the simulation, and reports a false zero.
  out.chimeRing = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const ring = api.state().entities.find((e) => e.id === "showroom-chime-ring");
    if (!ring) return { present: false };
    const before = api.events().sequence;
    for (let i = 0; i < 6; i += 1) api.interact(`showroom-block-${i}`);
    for (let t = 0; t < 150; t += 1) api.step(1 / 60);
    const events = api.events({ since: before }).events;
    return {
      present: true,
      mode: ring.physics?.mode ?? null,
      sound: ring.interactions?.[0]?.sound ?? null,
      type: ring.interactions?.[0]?.type ?? null,
      // A curated sound, not an imported one: production has no asset store, so an import
      // here would 404 exactly the way the thrice-repeated asset-registration trap did.
      soundIsCurated: api.sounds().some((s) => s.id === ring.interactions?.[0]?.sound && s.source === "BallZ 2015 archive"),
      triggerEnters: events.filter((e) => e.type === "trigger.enter").length,
      soundsFired: events.filter((e) => e.type === "interaction.sound").length,
    };
  });

  // Where to click for bare ground. This used to be the hardcoded pixel (300, 630), which
  // silently stopped being ground the moment the showroom was recomposed — a foreground tree
  // moved under it, and the click focused the camera instead of dropping a ball. Project a
  // known-clear *world* point on the terrain's level stage instead, so the test follows the
  // scene rather than a screenshot of it.
  const groundAt = await page.evaluate(() => {
    const host = window.__GRAPHYSX_HOST__;
    // Well inside the terrain's 12-unit level stage, clear of the plinth and the braziers,
    // so the dropped ball lands on flat ground rather than near the rim of the blend.
    const v = new host.camera.position.constructor(8, 0, 5);
    v.project(host.camera);
    const rect = host.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((-v.y + 1) / 2) * rect.height };
  });
  out.groundAt = { x: Math.round(groundAt.x), y: Math.round(groundAt.y) };
  const countBefore = await page.evaluate(() => window.__GRAPHYSX__.state().entities.length);
  await page.mouse.click(groundAt.x, groundAt.y);
  await page
    .waitForFunction(
      () => window.__GRAPHYSX__.state().entities.some((e) => e.id.startsWith("showroom-drop-")),
      null,
      { timeout: SMOKE_TIMEOUT },
    )
    .catch(() => {});
  out.ballDropped = await page.evaluate(() =>
    window.__GRAPHYSX__.state().entities.some((e) => e.id.startsWith("showroom-drop-")));
  out.spawnedOne = (await page.evaluate(() => window.__GRAPHYSX__.state().entities.length)) === countBefore + 1;

  // The ground is a `terrain` entity in the scene, not host decoration, and it carries a
  // static heightfield collider.
  out.terrain = await page.evaluate(() => {
    const t = window.__GRAPHYSX__.state().entities.find((e) => e.type === "terrain");
    if (!t) return null;
    return {
      id: t.id,
      hasCollider: !!t.physics && t.physics.mode === "static",
      heightmap: t.terrain.heightmap,
      minimumHeight: t.terrain.minimumHeight,
      maximumHeight: t.terrain.maximumHeight,
      colliderVertices: t.terrain.colliderVertices,
    };
  });

  // Water is a scene entity too, and its reflection is an entity flag rather than a host
  // setting — so the cost is something a scene author can see and turn off.
  out.water = await page.evaluate(() => {
    const w = window.__GRAPHYSX__.state().entities.find((e) => e.type === "water");
    return w ? { id: w.id, reflection: w.water.reflection, resolution: w.water.reflectionResolution } : null;
  });

  // THE regression guard. Terrain used to be sine-displaced host decoration with NO
  // collider: the flat ground plane was hidden and nothing replaced its physics, so a ball
  // dropped in the showroom fell to y=-12 and kept going, forever. The old assertion only
  // checked that the entity existed, which is exactly why that shipped. Assert instead that
  // the ball STOPS — settles at a height on the terrain and stays there.
  out.ballRest = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const id = api.state().entities.map((e) => e.id).filter((i) => i.startsWith("showroom-drop-")).pop();
    if (!id) return null;
    const read = () => api.state().entities.find((e) => e.id === id) ?? null;
    const spawnY = read().position[1];
    // Settle deterministically through the public `step()` rather than waiting on frames:
    // headless software GL runs the loop at a few fps, so wall-clock waiting would measure
    // frame rate instead of physics. This is the same integrator the render loop drives.
    for (let i = 0; i < 40; i += 1) api.step(0.5);
    const settledY = read().position[1];
    for (let i = 0; i < 8; i += 1) api.step(0.5);
    const entity = read();
    return {
      spawnY: Number(spawnY.toFixed(3)),
      settledY: Number(settledY.toFixed(3)),
      finalY: Number(entity.position[1].toFixed(3)),
      driftAfterSettle: Number(Math.abs(entity.position[1] - settledY).toFixed(3)),
      velocityY: entity.physics ? entity.physics.linearVelocity[1] : null,
    };
  });

  // Flocking is the graduated Nature-of-Code system (PRODUCT_SPEC §3 pillar 3). Assert it is
  // a real *simulation*, not a prop: the entity exists, it has members, and those members
  // MOVE. Movement is measured through `api.step()` rather than by waiting on frames —
  // headless software GL runs the loop at a few fps, so wall-clock waiting would measure the
  // frame rate instead of the simulation.
  out.flocks = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const before = api.state().entities.filter((e) => e.type === "flock");
    const leads = new Map(before.map((e) => [e.id, e.flock.leadPosition]));
    for (let i = 0; i < 20; i += 1) api.step(0.05);
    return api.state().entities
      .filter((e) => e.type === "flock")
      .map((e) => {
        const was = leads.get(e.id);
        const now = e.flock.leadPosition;
        return {
          id: e.id,
          bounds: e.flock.bounds,
          preset: e.flock.preset,
          memberCount: e.flock.memberCount,
          averageSpeed: e.flock.averageSpeed,
          leadMoved: Number(Math.hypot(now[0] - was[0], now[1] - was[1], now[2] - was[2]).toFixed(4)),
        };
      });
  });

  // PRODUCT_SPEC §5: "Clicking focuses the camera (the recovered CubX behavior)." Clicking a
  // piece of non-interactive scenery must ease the orbit pivot onto it. A CubX corner cube is
  // the subject because it is unambiguously scenery — no interaction, not terrain — and
  // reliably on screen. The id moved when the placeholder cubes became the recovered
  // `cubx-assembly` prefab; `:cube-8` is the +++ corner the old `-cube-7` was.
  const targetBefore = await page.evaluate(() => window.__GRAPHYSX_HOST__.orbitTarget.toArray());
  const cubeAt = await screenOf("showroom-cubx-frame:cube-8");
  if (cubeAt) await page.mouse.click(cubeAt.x, cubeAt.y);
  await page
    .waitForFunction(
      (before) => {
        const host = window.__GRAPHYSX_HOST__;
        const t = host.orbitTarget.toArray();
        return !host.focusing && Math.hypot(t[0] - before[0], t[1] - before[1], t[2] - before[2]) > 0.75;
      },
      targetBefore,
      { timeout: SMOKE_TIMEOUT },
    )
    .catch(() => {});
  const targetAfter = await page.evaluate(() => window.__GRAPHYSX_HOST__.orbitTarget.toArray());
  out.focus = {
    before: targetBefore.map((n) => Number(n.toFixed(3))),
    after: targetAfter.map((n) => Number(n.toFixed(3))),
    targetMoved: Number(
      Math.hypot(
        targetAfter[0] - targetBefore[0],
        targetAfter[1] - targetBefore[1],
        targetAfter[2] - targetBefore[2],
      ).toFixed(3),
    ),
    // The idle orbit must resume around the NEW subject once the move lands, or focusing
    // would quietly kill the screensaver.
    orbitRearmed: await page.evaluate(() => window.__GRAPHYSX_HOST__.autoRotating),
  };

  // The focus assertion deliberately moved the camera onto CubX. Return to the authored
  // composition before testing a different physical subject; otherwise a valid console may
  // be behind that close-up and the smoke measures sequencing rather than interaction.
  await page.evaluate(() => window.__GRAPHYSX_HOST__.resetFraming(0.2));
  await page.waitForFunction(() => !window.__GRAPHYSX_HOST__.focusing, null, { timeout: SMOKE_TIMEOUT });

  // Exercise the actual 3D route as well as the accessible topic controls. The right-hand
  // Play console sits outside the welcome card and funnels through the same presenter.
  const playConsoleAt = await screenOf("showroom-nestor-console-play:core");
  if (playConsoleAt) await page.mouse.click(playConsoleAt.x, playConsoleAt.y);
  await page.waitForFunction(
    () => window.__GRAPHYSX_NESTOR__.state().status === "presenting:play",
    null,
    { timeout: SMOKE_TIMEOUT },
  );
  await page.waitForFunction(() => !window.__GRAPHYSX_HOST__.focusing, null, { timeout: SMOKE_TIMEOUT }).catch(() => {});
  out.nestor3dConsole = await page.evaluate((at) => ({
    screen: at ? { x: Math.round(at.x), y: Math.round(at.y) } : null,
    topic: window.__GRAPHYSX_NESTOR__.state().topic,
    status: window.__GRAPHYSX_NESTOR__.state().status,
    selected: window.__GRAPHYSX__.state().selectedIds.includes("showroom-plinth"),
    playCommit: window.__GRAPHYSX__.history().some((entry) =>
      entry.actor.id === "nestor" && entry.intent.includes("kinetic playground")),
  }), playConsoleAt);

  // Nestor is not decorative chrome: the Build topic must produce one attributed agent
  // commit, construct ordinary prefab entities, focus the result, and narrate what happened.
  const nestorTargetBefore = await page.evaluate(() => window.__GRAPHYSX_HOST__.orbitTarget.toArray());
  await page.click('[data-nestor-topic="build"]');
  await page.waitForFunction(() => {
    const api = window.__GRAPHYSX__;
    return api.query({ ids: ["showroom-nestor-build"] }).length === 1 &&
      api.history().some((commit) => commit.actor.id === "nestor" && commit.actor.kind === "agent");
  }, null, { timeout: SMOKE_TIMEOUT });
  await page.waitForFunction(() => !window.__GRAPHYSX_HOST__.focusing, null, { timeout: SMOKE_TIMEOUT }).catch(() => {});
  out.nestorBuild = await page.evaluate((before) => {
    const api = window.__GRAPHYSX__;
    const presenter = window.__GRAPHYSX_NESTOR__.state();
    const commit = api.history().filter((entry) => entry.actor.id === "nestor").pop() ?? null;
    const root = api.query({ ids: ["showroom-nestor-build"] })[0] ?? null;
    const target = window.__GRAPHYSX_HOST__.orbitTarget.toArray();
    return {
      topic: presenter.topic,
      status: presenter.status,
      label: root?.label ?? null,
      entityCount: api.state().entities.filter((entity) => entity.id === "showroom-nestor-build" || entity.id.startsWith("showroom-nestor-build:")).length,
      commitActor: commit?.actor ?? null,
      commitIntent: commit?.intent ?? null,
      selected: api.state().selectedIds.includes("showroom-nestor-build"),
      panelPressed: document.querySelector('[data-nestor-topic="build"]')?.getAttribute("aria-pressed"),
      panelMentionsCommit: document.querySelector("[data-nestor-commit]")?.textContent?.includes(commit?.id ?? "missing") ?? false,
      focusMoved: Number(Math.hypot(target[0] - before[0], target[1] - before[1], target[2] - before[2]).toFixed(3)),
    };
  }, nestorTargetBefore);
  await page.screenshot({ path: path.join(ART, "showroom-nestor-build.png"), fullPage: false });

  // A rejected transaction must remain rejected on the next state read. Remove one command
  // target, retry Build, then restore that edit and ensure scene reconciliation resumes.
  out.nestorRejected = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const removed = api.remove("showroom-nestor-aura");
    const rejected = window.__GRAPHYSX_NESTOR__.present("build");
    const retained = window.__GRAPHYSX_NESTOR__.state();
    const restored = api.undo();
    const reconciled = window.__GRAPHYSX_NESTOR__.state();
    return {
      removed: removed.ok,
      rejectedError: rejected.error,
      rejectedCommit: rejected.commit,
      retainedStatus: retained.status,
      retainedError: retained.presentation.error,
      retainedCommit: retained.lastCommit,
      restored: restored.ok,
      reconciledTopic: reconciled.topic,
      reconciledStatus: reconciled.status,
      auraPresent: api.query({ ids: ["showroom-nestor-aura"] }).length === 1,
    };
  });

  // Availability is visible, not a silent no-op: removing one required center entity swaps the
  // active Nestor card for a neutral resume door, and restoring it brings the real topics back.
  await page.evaluate(() => window.__GRAPHYSX__.remove("showroom-nestor-aura"));
  await page.waitForSelector(".gx-welcome--scene-resume", { timeout: SMOKE_TIMEOUT });
  const guardedDoor = await page.evaluate(() => ({
    neutral: !!document.querySelector(".gx-welcome--scene-resume"),
    topics: document.querySelectorAll("[data-nestor-topic]").length,
  }));
  await page.evaluate(() => window.__GRAPHYSX__.undo());
  await page.waitForFunction(() =>
    !document.querySelector(".gx-welcome--scene-resume") &&
    document.querySelectorAll("[data-nestor-topic]").length === 3,
  null, { timeout: SMOKE_TIMEOUT });
  out.nestorDoorGuard = await page.evaluate((guarded) => ({
    ...guarded,
    restoredTopics: document.querySelectorAll("[data-nestor-topic]").length,
    restoredAura: window.__GRAPHYSX__.query({ ids: ["showroom-nestor-aura"] }).length,
  }), guardedDoor);

  // A flock has to survive being written out and read back, or it is a runtime toy rather
  // than scene vocabulary. Round-trip the *document* (the persistable form, ephemeral spawns
  // dropped) and assert the flock comes back with its population intact and still flying.
  out.flockRoundTrip = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const document = api.exportDocument();
    const exported = document.entities.filter((e) => e.type === "flock");
    const exportedNestor = document.entities.find((e) => e.id === "showroom-nestor") ?? null;
    const exportedBuild = document.entities.find((e) => e.id === "showroom-nestor-build") ?? null;
    const loaded = api.load(document);
    if (!loaded.ok) return { ok: false, error: loaded.error };
    const after = api.state().entities.filter((e) => e.type === "flock");
    const leads = new Map(after.map((e) => [e.id, e.flock.leadPosition]));
    for (let i = 0; i < 20; i += 1) api.step(0.05);
    const moved = api.state().entities
      .filter((e) => e.type === "flock")
      .map((e) => {
        const was = leads.get(e.id);
        const now = e.flock.leadPosition;
        return Math.hypot(now[0] - was[0], now[1] - was[1], now[2] - was[2]);
      });
    return {
      nestorProfile: exportedNestor?.agent ?? null,
      buildExported: !!exportedBuild,
      nestorReloaded: api.query({ ids: ["showroom-nestor"] })[0]?.agent ?? null,
      buildReloaded: api.query({ ids: ["showroom-nestor-build"] }).length === 1,
      ok: true,
      exportedCount: exported.length,
      // The `flock` field must be in the serialised document, not just in live state.
      exportedCarriesConfig: exported.every((e) => !!e.flock && typeof e.flock.count === "number"),
      reloadedCount: after.length,
      reloadedMembers: after.map((e) => e.flock.memberCount),
      stillMoving: moved.every((d) => d > 0.05),
    };
  });
  out.nestorAfterLoad = await page.evaluate(() => ({
    topic: window.__GRAPHYSX_NESTOR__.state().topic,
    status: window.__GRAPHYSX_NESTOR__.state().status,
    buildPresent: window.__GRAPHYSX__.query({ ids: ["showroom-nestor-build"] }).length === 1,
  }));

  await page.click(".gx-go-editor");
  // The editor module is loaded on demand, so wait for it to mount rather than guessing.
  await page.waitForSelector(".gx-ed-toolbar", { timeout: SMOKE_TIMEOUT });
  await page.waitForTimeout(200);
  out.editorVisibleAfterEnter = await page.evaluate(() => {
    const t = document.querySelector(".gx-ed-toolbar");
    return !!t && getComputedStyle(t).display !== "none";
  });
  out.welcomeGone = (await page.$(".gx-welcome")) === null;
  out.nestorInEditor = (await page.$('[title="showroom-nestor — agent"]')) !== null &&
    (await page.$('[title="showroom-nestor-build — group"]')) !== null;
  await page.screenshot({ path: path.join(ART, "showroom-editor.png"), fullPage: false });

  // The load above is one undo frame and Build is the next. Rewind until the authoritative
  // agent leaves presenting mode, then ensure the presenter and remounted card follow it.
  out.nestorUndo = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const before = window.__GRAPHYSX_NESTOR__.state();
    let attempts = 0;
    const results = [];
    while (api.query({ ids: ["showroom-nestor"] })[0]?.agent?.status?.startsWith("presenting:") && attempts < 4) {
      const result = api.undo();
      results.push(result.ok);
      attempts += 1;
      if (!result.ok) break;
    }
    const after = window.__GRAPHYSX_NESTOR__.state();
    return {
      beforeTopic: before.topic,
      attempts,
      results,
      topic: after.topic,
      status: after.status,
      buildPresent: api.query({ ids: ["showroom-nestor-build"] }).length === 1,
      lastCommit: after.lastCommit,
    };
  });
  await page.click(".gx-ed-exit");
  await page.waitForSelector(".gx-welcome", { timeout: SMOKE_TIMEOUT });
  out.nestorAfterEditorExit = await page.evaluate(() => ({
    topic: window.__GRAPHYSX_NESTOR__.state().topic,
    status: window.__GRAPHYSX_NESTOR__.state().status,
    buildPressed: document.querySelector('[data-nestor-topic="build"]')?.getAttribute("aria-pressed"),
    commitLabel: document.querySelector("[data-nestor-commit]")?.textContent ?? null,
  }));

  // Browse replaces the document before entering the editor. Its Showroom exit must rebuild
  // the AgentX Center, not strand Nestor's hard-coded topic UI over the starter world.
  await page.click(".gx-go-browse");
  await page.waitForSelector(".gx-browse", { timeout: SMOKE_TIMEOUT });
  await page.click('[data-starter-id="signal-outpost"]');
  await page.waitForFunction(() => {
    const toolbar = document.querySelector(".gx-ed-toolbar");
    return window.__GRAPHYSX_HOST__.mode === "editor" && !!toolbar && getComputedStyle(toolbar).display !== "none";
  }, null, { timeout: SMOKE_TIMEOUT });
  out.browseEditor = await page.evaluate(() => ({
    mode: window.__GRAPHYSX_HOST__.mode,
    worldId: window.__GRAPHYSX__.state().world.id,
    nestorCount: window.__GRAPHYSX__.query({ ids: ["showroom-nestor"] }).length,
  }));
  await page.click(".gx-ed-exit");
  await page.waitForFunction(() =>
    window.__GRAPHYSX__.query({ ids: ["showroom-nestor"] }).length === 1 &&
    document.querySelector(".gx-welcome"), null, { timeout: SMOKE_TIMEOUT });
  out.browseExit = await page.evaluate(() => ({
    mode: window.__GRAPHYSX_HOST__.mode,
    worldId: window.__GRAPHYSX__.state().world.id,
    nestorStatus: window.__GRAPHYSX_NESTOR__.state().status,
    consoleCount: window.__GRAPHYSX__.query({ tag: "nestor-console" }).filter((entity) => entity.type === "group").length,
    welcomePresent: !!document.querySelector(".gx-welcome"),
  }));

  // The entry flag is intentionally false here. Replacing the world from inside the editor must
  // preserve that in-memory work while the authoritative readiness check prevents Nestor's
  // controls from being mounted over a world where their scene targets do not exist.
  await page.click(".gx-go-editor");
  await page.waitForFunction(() => window.__GRAPHYSX_HOST__.mode === "editor", null, { timeout: SMOKE_TIMEOUT });
  out.editorWorldSwap = await page.evaluate(() => {
    const loaded = window.__GRAPHYSX__.loadStarter("signal-outpost");
    return {
      ok: loaded.ok,
      worldId: window.__GRAPHYSX__.state().world.id,
      nestorCount: window.__GRAPHYSX__.query({ ids: ["showroom-nestor"] }).length,
    };
  });
  await page.click(".gx-ed-exit");
  await page.waitForFunction(() =>
    window.__GRAPHYSX__.state().world.id === "graphysx-signal-outpost" &&
    document.querySelector(".gx-welcome"), null, { timeout: SMOKE_TIMEOUT });
  out.authoritativeEditorExit = await page.evaluate(() => ({
    worldId: window.__GRAPHYSX__.state().world.id,
    nestorCount: window.__GRAPHYSX__.query({ ids: ["showroom-nestor"] }).length,
    neutralDoor: !!document.querySelector(".gx-welcome--scene-resume"),
    nestorTopics: document.querySelectorAll("[data-nestor-topic]").length,
    welcomePresent: !!document.querySelector(".gx-welcome"),
  }));
} catch (e) {
  out.fatal = String(e);
}

// The ball must come to REST on the terrain, not merely exist:
//  - it fell (it was dropped from above and ended lower),
//  - it is no longer moving vertically,
//  - it stopped moving and stayed stopped over a further 4 simulated seconds, and
//  - it is resting within the terrain's own height range rather than somewhere below it.
// Without a collider all four of these fail hard: the old behaviour was y ≈ -1000, vy ≈ -90.
const rest = out.ballRest;
const terrain = out.terrain;
const ballCameToRest =
  !!rest &&
  !!terrain &&
  rest.finalY < rest.spawnY &&
  Math.abs(rest.velocityY) < 1 &&
  rest.driftAfterSettle < 1 &&
  rest.finalY > terrain.minimumHeight - 1 &&
  rest.finalY < terrain.maximumHeight + 3;

out.ballCameToRest = ballCameToRest;

// Flocking must be present, populated, MOVING, and persistable. Any one of those failing
// turns the graduated system back into decoration, which is the exact claim PRODUCT_SPEC
// §8.1 records as unearned.
const flocks = out.flocks ?? [];
const roundTrip = out.flockRoundTrip;
const flockingIsLive =
  flocks.length >= 2 &&
  flocks.every((f) => f.memberCount > 20 && f.leadMoved > 0.05 && f.averageSpeed > 0.05) &&
  // Both bounds modes are exercised: the recovered sphere constraint and the box volume.
  new Set(flocks.map((f) => f.bounds)).size === 2 &&
  !!roundTrip &&
  roundTrip.ok === true &&
  roundTrip.exportedCount === flocks.length &&
  roundTrip.exportedCarriesConfig === true &&
  roundTrip.reloadedCount === flocks.length &&
  roundTrip.reloadedMembers.every((n) => n > 20) &&
  roundTrip.stillMoving === true;
out.flockingIsLive = flockingIsLive;

// Click-to-focus: the orbit pivot measurably moved onto the clicked subject, and the idle
// orbit came back afterwards so the showroom keeps showing itself off.
const focusWorks = !!out.focus && out.focus.targetMoved > 0.75 && out.focus.orbitRearmed === true;
out.focusWorks = focusWorks;

const nestorInitial = out.nestorInitial;
const nestorBuild = out.nestorBuild;
const nestorIsLive =
  !!nestorInitial &&
  nestorInitial.type === "agent" &&
  nestorInitial.role === "AgentX Center guide" &&
  nestorInitial.status === "ready" &&
  ["present", "build", "play", "explore"].every((capability) => nestorInitial.capabilities.includes(capability)) &&
  nestorInitial.consoleCount === 3 &&
  nestorInitial.renderedAgentId === "showroom-nestor" &&
  nestorInitial.renderedStatus === "ready" &&
  out.nestor3dConsole?.topic === "play" &&
  out.nestor3dConsole?.status === "presenting:play" &&
  out.nestor3dConsole?.selected === true &&
  out.nestor3dConsole?.playCommit === true &&
  !!nestorBuild &&
  nestorBuild.topic === "build" &&
  nestorBuild.status === "presenting:build" &&
  nestorBuild.entityCount === 8 &&
  nestorBuild.commitActor?.id === "nestor" &&
  nestorBuild.commitActor?.kind === "agent" &&
  nestorBuild.selected === true &&
  nestorBuild.panelPressed === "true" &&
  nestorBuild.panelMentionsCommit === true &&
  nestorBuild.focusMoved > 0.75 &&
  out.nestorAfterLoad?.topic === "build" &&
  out.nestorAfterLoad?.status === "presenting:build" &&
  out.nestorAfterLoad?.buildPresent === true &&
  out.nestorUndo?.beforeTopic === "build" &&
  out.nestorUndo?.attempts >= 1 &&
  out.nestorUndo?.results?.every(Boolean) === true &&
  out.nestorUndo?.topic === null &&
  out.nestorUndo?.status === "ready" &&
  out.nestorUndo?.buildPresent === false &&
  out.nestorUndo?.lastCommit === null &&
  out.nestorAfterEditorExit?.topic === null &&
  out.nestorAfterEditorExit?.status === "ready" &&
  out.nestorAfterEditorExit?.buildPressed === "false" &&
  out.nestorRejected?.removed === true &&
  typeof out.nestorRejected?.rejectedError === "string" &&
  out.nestorRejected?.rejectedCommit === null &&
  out.nestorRejected?.retainedStatus === "attention" &&
  out.nestorRejected?.retainedError === out.nestorRejected?.rejectedError &&
  out.nestorRejected?.retainedCommit === null &&
  out.nestorRejected?.restored === true &&
  out.nestorRejected?.reconciledTopic === "build" &&
  out.nestorRejected?.reconciledStatus === "presenting:build" &&
  out.nestorRejected?.auraPresent === true &&
  out.nestorDoorGuard?.neutral === true &&
  out.nestorDoorGuard?.topics === 0 &&
  out.nestorDoorGuard?.restoredTopics === 3 &&
  out.nestorDoorGuard?.restoredAura === 1;
out.nestorIsLive = nestorIsLive;

const browseExitWorks =
  out.browseEditor?.mode === "editor" &&
  out.browseEditor?.worldId === "graphysx-signal-outpost" &&
  out.browseEditor?.nestorCount === 0 &&
  out.browseExit?.mode === "scene" &&
  out.browseExit?.nestorStatus === "ready" &&
  out.browseExit?.consoleCount === 3 &&
  out.browseExit?.welcomePresent === true &&
  out.editorWorldSwap?.ok === true &&
  out.editorWorldSwap?.worldId === "graphysx-signal-outpost" &&
  out.editorWorldSwap?.nestorCount === 0 &&
  out.authoritativeEditorExit?.worldId === "graphysx-signal-outpost" &&
  out.authoritativeEditorExit?.nestorCount === 0 &&
  out.authoritativeEditorExit?.neutralDoor === true &&
  out.authoritativeEditorExit?.nestorTopics === 0 &&
  out.authoritativeEditorExit?.welcomePresent === true;
out.browseExitWorks = browseExitWorks;

out.consoleErrors = consoleErrors;
out.pageErrors = pageErrors;
console.log(JSON.stringify(out, null, 2));
await browser.close();

const ok =
  out.welcomePresent &&
  out.editorHiddenInitially &&
  out.entityCount > 100 &&
  out.autoOrbiting &&
  // The entry move ran, landed on the authored framing, and restored full exposure.
  out.introLanded?.completed === true &&
  out.introLanded?.framed === true &&
  out.introLanded?.exposure > 1.0 &&
  out.impulseMoved > 0.15 &&
  out.chimeRing?.present &&
  out.chimeRing?.mode === "trigger" &&
  out.chimeRing?.type === "play-sound" &&
  out.chimeRing?.sound === "coin" &&
  out.chimeRing?.soundIsCurated &&
  out.chimeRing?.triggerEnters >= 1 &&
  out.chimeRing?.soundsFired >= 1 &&
  out.ballDropped &&
  out.spawnedOne &&
  ballCameToRest &&
  !!terrain &&
  terrain.hasCollider &&
  terrain.colliderVertices > 1000 &&
  !!out.water &&
  flockingIsLive &&
  focusWorks &&
  nestorIsLive &&
  roundTrip?.nestorProfile?.role === "AgentX Center guide" &&
  roundTrip?.nestorProfile?.status === "presenting:build" &&
  roundTrip?.nestorProfile?.capabilities?.includes("build") &&
  roundTrip?.buildExported === true &&
  roundTrip?.nestorReloaded?.role === "AgentX Center guide" &&
  roundTrip?.nestorReloaded?.status === "presenting:build" &&
  roundTrip?.buildReloaded === true &&
  out.nestorInEditor === true &&
  out.editorVisibleAfterEnter && out.welcomeGone &&
  browseExitWorks;

process.exit(out.fatal || pageErrors.length || !ok ? 1 : 0);


