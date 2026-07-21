import { SMOKE_TIMEOUT, applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { mkdirSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { startSceneStore } from "../server/scene-store.mjs";

// The media library end to end: a datalake folder is browsable, a texture import lands in
// `api.textures()` and applies to an entity, a foreign-format model converts IN THE BROWSER
// to graphysx-mesh-json and spawns, and the editor's Media tab + import dialog drive the
// same path a human would. The smoke builds its own tiny datalake — the real one
// (E:\Media\Datalake) is machine-local and CI must not know about it.

const EXE = process.env.SMOKE_CHROMIUM || undefined;
const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:4188/";
const ART = process.env.SMOKE_ARTIFACTS || path.resolve("output/smoke");
mkdirSync(ART, { recursive: true });

/** 1×1 opaque teal PNG. Small is the point — the pixel value is never asserted. */
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNsaGj4DwAFhAKAr8ZBIgAAAABJRU5ErkJggg==",
  "base64",
);

/** A 16-sample 8kHz mono PCM WAV — the smallest thing AudioLoader will decode. */
function tinyWav() {
  const sampleCount = 16;
  const buffer = Buffer.alloc(44 + sampleCount * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + sampleCount * 2, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);   // PCM
  buffer.writeUInt16LE(1, 22);   // mono
  buffer.writeUInt32LE(8000, 24);
  buffer.writeUInt32LE(16000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(sampleCount * 2, 40);
  for (let i = 0; i < sampleCount; i += 1) buffer.writeInt16LE(Math.round(Math.sin(i / 2) * 8000), 44 + i * 2);
  return buffer;
}

/** A 4×4 solid-red DXT1 DDS — one block, hand-packed, to prove the in-browser decode. */
function tinyDds() {
  const buffer = Buffer.alloc(128 + 8);
  buffer.write("DDS ", 0);
  buffer.writeUInt32LE(124, 4);                      // header size
  buffer.writeUInt32LE(0x1007, 8);                   // caps|height|width|pixelformat
  buffer.writeUInt32LE(4, 12);                       // height
  buffer.writeUInt32LE(4, 16);                       // width
  buffer.writeUInt32LE(32, 76);                      // pixel format size
  buffer.writeUInt32LE(0x4, 80);                     // FOURCC flag
  buffer.write("DXT1", 84);
  buffer.writeUInt16LE(0xf800, 128);                 // c0 = pure red (c0 > c1 → opaque)
  buffer.writeUInt16LE(0x0000, 130);                 // c1 = black
  buffer.writeUInt32LE(0, 132);                      // all texels use c0
  return buffer;
}

/** A unit tetrahedron: the smallest OBJ that converts to real, closed geometry. */
const OBJ_TEXT = `# smoke tetrahedron
v 0 0 0
v 1 0 0
v 0 1 0
v 0 0 1
f 1 3 2
f 1 2 4
f 1 4 3
f 2 3 4
`;

const consoleErrors = [];
const pageErrors = [];
const out = {};

let store = null;
let storeDir = null;
let datalakeDir = null;
let browser = null;

try {
  storeDir = await mkdtemp(path.join(tmpdir(), "graphysx-media-store-"));
  datalakeDir = await mkdtemp(path.join(tmpdir(), "graphysx-media-lake-"));
  await mkdir(path.join(datalakeDir, "Textures"), { recursive: true });
  await writeFile(path.join(datalakeDir, "smoke-tetra.obj"), OBJ_TEXT, "utf8");
  await writeFile(path.join(datalakeDir, "Textures", "smoke-teal.png"), PNG_BYTES);
  await writeFile(path.join(datalakeDir, "smoke-blip.wav"), tinyWav());
  await writeFile(path.join(datalakeDir, "Textures", "smoke-red.dds"), tinyDds());

  // Two sky sets, because the datalake genuinely holds two naming conventions and they
  // do NOT map the same way: a directional folder (the TV3D archive sets, where `left`
  // is +X) and loose axial files (the `Clouds_*.dds` set, already named by WebGL axis).
  // Mixed case is deliberate — the real datalake ships `Back.jpg` next to `back.bmp`.
  await mkdir(path.join(datalakeDir, "Sky", "SmokeDome"), { recursive: true });
  for (const face of ["Left", "Right", "Up", "Down", "Front", "Back"]) {
    await writeFile(path.join(datalakeDir, "Sky", "SmokeDome", `${face}.png`), PNG_BYTES);
  }
  // A Thumbs.db alongside them: every real sky folder has one and it must not be mistaken
  // for a face or block the match.
  await writeFile(path.join(datalakeDir, "Sky", "SmokeDome", "Thumbs.db"), Buffer.from([0, 1, 2, 3]));
  await mkdir(path.join(datalakeDir, "Sky", "Axial"), { recursive: true });
  for (const face of ["PosX", "NegX", "PosY", "NegY", "PosZ", "NegZ"]) {
    await writeFile(path.join(datalakeDir, "Sky", "Axial", `Puffs_${face}.dds`), tinyDds());
  }

  store = await startSceneStore({
    port: 0,
    dir: path.join(storeDir, "scenes"),
    assetDir: path.join(storeDir, "assets"),
    datalakeDir,
  });
  out.storeUrl = store.url;

  // --- server side, no browser ---------------------------------------------------
  const health = await fetch(`${store.url}/health`).then((r) => r.json());
  out.healthAssets = health.assetCount;
  out.healthDatalake = typeof health.datalake === "string";

  const rootListing = await fetch(`${store.url}/datalake`).then((r) => r.json());
  out.rootFolders = rootListing.folders.map((f) => f.name);
  out.rootFiles = rootListing.files.map((f) => `${f.name}:${f.kind}`);

  // Path traversal must be refused, not resolved.
  out.traversalRejected = await fetch(`${store.url}/datalake?path=..%2F..%2Fsecrets`).then((r) => r.status === 400);

  const imported = await fetch(`${store.url}/assets/import`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "Textures/smoke-teal.png" }),
  }).then((r) => r.json());
  out.importedId = imported.id;
  out.importedKind = imported.kind;
  out.importedSource = imported.source;
  const served = await fetch(`${store.url}${imported.url}`);
  out.importedServed = served.status === 200 && Number(served.headers.get("content-length")) === PNG_BYTES.length;

  // --- browser: the same library through the API and the editor GUI ---------------
  browser = await launchSmokeBrowser();
  const page = await browser.newPage();
  applySmokeTimeout(page);
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  const url = `${BASE}${BASE.includes("?") ? "&" : "?"}host=editor&store=${encodeURIComponent(store.url)}`;
  out.navigationAttempts = 0;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    out.navigationAttempts = attempt;
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: SMOKE_TIMEOUT });
      break;
    } catch (error) {
      if (!/net::ERR_/.test(String(error)) || attempt === 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 750 * attempt));
    }
  }
  await page.waitForFunction(() => !!window.__GRAPHYSX__, { timeout: SMOKE_TIMEOUT });

  // The manifest pull registers the server-side import into the texture registry.
  out.refresh = await page.evaluate(async () => {
    const result = await window.__GRAPHYSX__.media.refresh();
    return { ok: result.ok, count: result.value ?? null, status: window.__GRAPHYSX__.media.status() };
  });
  out.textureRegistered = await page.evaluate(() =>
    window.__GRAPHYSX__.textures().some((t) => t.id === "smoke-teal" && t.category === "imported"));

  // An imported texture is usable exactly like a curated one.
  out.applied = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const spawn = api.spawn({ id: "media-box", type: "box", transform: { position: [0, 2, 0] } });
    const update = api.update("media-box", { material: { texture: { id: "smoke-teal" } } });
    return {
      spawnOk: spawn.ok,
      updateOk: update.ok,
      textureId: update.value?.material?.texture?.id ?? null,
    };
  });

  // An imported image doubles as a landform: decode → inline `terrain.heights` → spawn.
  out.terrain = await page.evaluate(async () => {
    const api = window.__GRAPHYSX__;
    const decoded = await api.media.terrainHeights("smoke-teal", 33);
    if (!decoded.ok || !decoded.value) return { ok: false, error: decoded.error ?? null };
    const spawn = api.spawn({
      id: "media-terrain",
      type: "terrain",
      terrain: { heights: decoded.value.heights, size: 40, segments: 32, heightScale: 5 },
    });
    const entity = api.state().entities.find((e) => e.id === "media-terrain");
    return {
      ok: true,
      samples: decoded.value.samples,
      length: decoded.value.heights.length,
      spawnOk: spawn.ok,
      hasTerrain: !!entity?.terrain,
    };
  });

  // DDS converts to PNG on the way in: decode the DXT block in-browser, store the PNG,
  // register it as an ordinary texture, and prove the pixels survived (solid red).
  out.dds = await page.evaluate(async () => {
    const api = window.__GRAPHYSX__;
    const imported = await api.media.import("Textures/smoke-red.dds");
    if (!imported.ok || !imported.value) return { ok: false, error: imported.error ?? null };
    const image = await new Promise((resolveImage, rejectImage) => {
      const element = new Image();
      element.crossOrigin = "anonymous";
      element.onload = () => resolveImage(element);
      element.onerror = () => rejectImage(new Error("stored PNG failed to load"));
      element.src = imported.value.url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const draw = canvas.getContext("2d");
    draw.drawImage(image, 0, 0);
    const pixel = draw.getImageData(1, 1, 1, 1).data;
    return {
      ok: true,
      file: imported.value.file,
      dims: [image.width, image.height],
      pixel: [...pixel],
      registered: api.textures().some((t) => t.id === imported.value.id),
    };
  });

  // Sound: import a WAV, see it in api.sounds(), place it as a `sound` entity, and prove
  // config + document round-trips plus the host audio layer tracking it. Playback itself
  // is gesture-gated by the browser, so "tracked" is the honest headless assertion.
  out.sound = await page.evaluate(async () => {
    const api = window.__GRAPHYSX__;
    const host = window.__GRAPHYSX_HOST__;
    const imported = await api.media.import("smoke-blip.wav");
    if (!imported.ok || !imported.value) return { ok: false, error: imported.error ?? null };
    const listed = api.sounds().some((s) => s.id === "smoke-blip");
    const spawn = api.spawn({ id: "smoke-sound", type: "sound", sound: { source: "smoke-blip", volume: 0.4 }, transform: { position: [1, 1, 1] } });
    host.audio.sync();
    const patch = api.update("smoke-sound", { sound: { volume: 0.7, loop: false } });
    const state = api.state().entities.find((e) => e.id === "smoke-sound")?.sound ?? null;
    const doc = api.exportDocument().entities.find((e) => e.id === "smoke-sound")?.sound ?? null;
    const physicsRejected = !api.spawn({ id: "bad-sound", type: "sound", sound: { source: "smoke-blip" }, physics: { mode: "dynamic" } }).ok;
    return {
      ok: true,
      listed,
      spawnOk: spawn.ok,
      patchOk: patch.ok,
      state,
      docCarriesSound: !!doc && doc.volume === 0.7 && doc.loop === false,
      tracked: host.audio.trackedCount,
      physicsRejected,
    };
  });

  // play-sound interactions: a sound fired from scene data, by a click and by a trigger
  // crossing. Uses the IMPORTED sound, so this also proves an interaction resolves a
  // media-library id rather than only the curated four.
  out.playSound = await page.evaluate(async () => {
    const api = window.__GRAPHYSX__;
    const host = window.__GRAPHYSX_HOST__;

    const loaded = api.load({
      schema: "graphysx.agent-world/v2",
      id: "smoke-play-sound",
      label: "Play sound smoke",
      entities: [
        // No targetIds: the common case is a pickup sounding at itself.
        { id: "chime", type: "box", transform: { position: [0, 1, 0] },
          interactions: [{ id: "ring", type: "play-sound", sound: "smoke-blip", volume: 0.6 }] },
        { id: "bell", type: "box", transform: { position: [4, 1, 0] } },
        { id: "aimed", type: "box", transform: { position: [-4, 1, 0] },
          interactions: [{ id: "at-bell", type: "play-sound", sound: "smoke-blip", targetIds: ["bell"] }] },
      ],
      environment: {},
    });
    if (!loaded.ok) return { ok: false, error: loaded.error };

    const projected = api.state().entities.find((e) => e.id === "chime").interactions[0];
    const receipt = api.interact("chime");
    const aimed = api.interact("aimed");

    const doc = api.export().entities.find((e) => e.id === "chime").interactions[0];
    const reloaded = api.load(api.export());

    // The guards must hold, and the OTHER types must not have been loosened by making
    // targetIds optional for this one.
    const rejectsMissingSource = !api.spawn({ id: "b1", type: "box", interactions: [{ type: "play-sound" }] }).ok;
    const rejectsBadVolume = !api.spawn({ id: "b2", type: "box", interactions: [{ type: "play-sound", sound: "smoke-blip", volume: 5 }] }).ok;
    const toggleStillNeedsTarget = !api.spawn({ id: "b3", type: "box", interactions: [{ type: "toggle-visibility", targetIds: [] }] }).ok;
    const impulseStillNeedsTarget = !api.spawn({ id: "b4", type: "box", interactions: [{ type: "apply-impulse", targetIds: [], impulse: [0, 1, 0] }] }).ok;

    // A trigger volume firing a sound — the BallZ ring, from scene data, no play layer.
    const triggerLoad = api.load({
      schema: "graphysx.agent-world/v2",
      id: "smoke-play-sound-trigger",
      label: "Trigger sound smoke",
      entities: [
        { id: "ring", type: "box", transform: { position: [0, 1, 0], scale: [2, 2, 2] }, physics: { mode: "trigger" },
          interactions: [{ id: "ding", type: "play-sound", sound: "smoke-blip" }] },
        { id: "ball", type: "sphere", transform: { position: [0, 6, 0] }, physics: { mode: "dynamic", mass: 1 } },
      ],
      environment: {},
    });
    const beforeTrigger = api.events().sequence;
    for (let i = 0; i < 180; i += 1) api.step(1 / 60);
    const soundEvents = api.events({ since: beforeTrigger }).events.filter((e) => e.type === "interaction.sound");

    return {
      ok: true,
      // The state projection is explicit, so a missing field here is a real regression.
      projectedSound: projected.sound,
      projectedVolume: projected.volume,
      projectedRefDistance: projected.refDistance,
      selfTargeted: projected.targetIds.length === 0,
      interactOk: receipt.ok,
      receiptType: receipt.value?.type,
      receiptSound: receipt.value?.sound,
      // Empty targetIds resolves to the entity carrying the interaction.
      receiptTargets: receipt.value?.targets.map((t) => t.id) ?? [],
      aimedTargets: aimed.value?.targets.map((t) => t.id) ?? [],
      // A sound changes nothing in the world; a receipt reports it without mutating.
      visibilityUntouched: api.state().entities.every((e) => e.visible === true),
      docCarries: doc.type === "play-sound" && doc.sound === "smoke-blip" && doc.volume === 0.6,
      reloadOk: reloaded.ok,
      rejectsMissingSource,
      rejectsBadVolume,
      toggleStillNeedsTarget,
      impulseStillNeedsTarget,
      triggerLoadOk: triggerLoad.ok,
      firedByTrigger: soundEvents.length,
      // Playback itself stays gesture-gated, so "the host layer has a one-shot path and
      // the context is locked" is the honest headless assertion — the same reasoning the
      // sound-entity block uses for `tracked` rather than `playing`.
      oneShotCountIsNumber: typeof host.audio.oneShotCount === "number",
    };
  });

  // Foreign-format model: fetched from the datalake, converted in-browser, uploaded,
  // registered, spawnable, and its payload actually loads (asset.status → ready).
  out.modelImport = await page.evaluate(async () => {
    const api = window.__GRAPHYSX__;
    const result = await api.media.import("smoke-tetra.obj");
    if (!result.ok || !result.value) return { ok: false, error: result.error ?? null };
    const spawn = api.spawn({ id: "media-model", type: "model", asset: { id: result.value.id }, transform: { position: [3, 1, 0] } });
    return { ok: true, id: result.value.id, format: result.value.format ?? null, spawnOk: spawn.ok };
  });
  await page
    .waitForFunction(() => window.__GRAPHYSX__.state().entities.find((e) => e.id === "media-model")?.asset?.status === "ready", null, { timeout: SMOKE_TIMEOUT })
    .catch(() => {});
  out.modelReady = await page.evaluate(() =>
    window.__GRAPHYSX__.state().entities.find((e) => e.id === "media-model")?.asset?.status ?? "missing");
  out.modelListed = await page.evaluate(() =>
    window.__GRAPHYSX__.assets().some((a) => a.id === "smoke-tetra" && a.category === "imported"));

  // --- the human path: Media tab and the import dialog ----------------------------
  out.mediaTabCards = await page.evaluate(() => {
    const tab = [...document.querySelectorAll(".gx-ed-tab")].find((t) => t.textContent === "Media");
    if (!tab) return null;
    tab.click();
    return [...document.querySelectorAll(".gx-ed-grid--drawer .gx-ed-thumb .gx-ed-thumb-label")].map((l) => l.textContent);
  });

  await page.evaluate(() => {
    [...document.querySelectorAll(".gx-ed-chip")].find((c) => c.textContent.includes("Import from Datalake"))?.click();
  });
  await page.waitForFunction(() => document.querySelectorAll(".gx-md-files .gx-ed-thumb").length > 0, null, { timeout: SMOKE_TIMEOUT }).catch(() => {});
  out.dialogOpen = await page.evaluate(() => document.querySelector(".gx-md-dialog")?.classList.contains("gx-ed-workbench--open") ?? false);
  out.dialogFiles = await page.evaluate(() =>
    [...document.querySelectorAll(".gx-md-files .gx-ed-thumb .gx-ed-thumb-label")].map((l) => l.textContent));

  // Import through the GUI: select the OBJ card, press the import button, await the status.
  out.guiImport = await page.evaluate(() => {
    const card = [...document.querySelectorAll(".gx-md-files .gx-ed-thumb")].find((c) =>
      c.querySelector(".gx-ed-thumb-label")?.textContent === "smoke-tetra.obj");
    if (!card) return { selected: false };
    card.click();
    const button = document.querySelector(".gx-md-foot .gx-lv-play");
    const label = button?.textContent ?? null;
    button?.click();
    return { selected: true, label };
  });
  await page
    .waitForFunction(() => (document.querySelector(".gx-md-dialog .gx-lv-status")?.textContent ?? "").startsWith("Imported"), null, { timeout: SMOKE_TIMEOUT })
    .catch(() => {});
  out.guiImportStatus = await page.evaluate(() => document.querySelector(".gx-md-dialog .gx-lv-status")?.textContent ?? null);
  // The GUI import ran after the API one, so the store holds a second copy under a new id.
  out.guiImportedListed = await page.evaluate(() =>
    window.__GRAPHYSX__.media.list("model").filter((m) => m.id.startsWith("smoke-tetra")).length >= 2);

  // --- imported cubemap sky sets --------------------------------------------------
  out.sky = await page.evaluate(async () => {
    const api = window.__GRAPHYSX__;
    const curatedCount = api.skies().length;

    const directional = await api.media.importSky("Sky/SmokeDome");
    const axial = await api.media.importSky("Sky/Axial");
    if (!directional.ok || !axial.ok) {
      return { importOk: false, error: directional.error ?? axial.error };
    }

    // The set is selectable as ordinary scene vocabulary, exactly like a curated id.
    const def = api.export();
    const loaded = api.load({ ...def, environment: { ...def.environment, sky: directional.value.id } });
    const applied = api.state().environment.sky;

    // ...and survives export -> load, the path a stored scene actually takes.
    const exported = api.export();
    const reloaded = api.load(exported);

    // An id that was never imported must still be refused: widening the registry must
    // not have turned the sky field into "anything goes".
    let rejected = false;
    try {
      const bad = api.load({ ...def, environment: { ...def.environment, sky: "not-a-real-sky" } });
      rejected = !bad.ok;
    } catch { rejected = true; }

    return {
      importOk: true,
      curatedCount,
      id: directional.value.id,
      label: directional.value.label,
      axialId: axial.value.id,
      // The TV3D swap: slot 0 (+X) must come from the file named `left`, and slot 1 (-X)
      // from `right`. Getting this backwards yields a sky that only looks wrong once you
      // turn around, which is exactly the kind of defect a screenshot misses.
      slot0FromLeft: /left/i.test(directional.value.faceUrls[0]),
      slot1FromRight: /right/i.test(directional.value.faceUrls[1]),
      // The axial set maps straight through with NO swap — a different mapping, same API.
      axialSlot0FromPosX: /posx/i.test(axial.value.faceUrls[0]),
      axialSlot1FromNegX: /negx/i.test(axial.value.faceUrls[1]),
      faceCount: directional.value.faceUrls.length,
      // DDS faces convert on the way in, so an axial set is PNG by the time it is a sky.
      axialConverted: axial.value.faceUrls.every((u) => u.endsWith(".png")),
      // Imports carry no `basePath` — the field the release manifest scrapes. This is the
      // structural reason a store-only sky cannot leak into `dist/`.
      hasNoBasePath: directional.value.basePath === undefined,
      horizonSampled: /^#[0-9a-f]{6}$/i.test(directional.value.horizonColor),
      registered: api.skies().some((s) => s.id === directional.value.id),
      curatedIntact: api.skies().filter((s) => s.source === "GraphysX archive").length === curatedCount,
      loadOk: loaded.ok,
      applied,
      reloadOk: reloaded.ok,
      reloadedSky: api.state().environment.sky,
      rejected,
    };
  });

  // The human half: an imported set must appear in the editor's Sky dropdown, which is
  // built once at construction and would otherwise never show it.
  //
  // WAITED FOR, not read once: the dropdown repopulates inside the editor's `refresh()`
  // tick, so it lands on the next frame rather than synchronously with the import. Reading
  // it immediately is a race that won twice and then failed a gate — the assertion is still
  // hard (it must appear, within the timeout), it just no longer depends on which side of a
  // frame boundary the evaluate lands.
  const skyDropdownFound = await page
    .waitForFunction(() => {
      const select = [...document.querySelectorAll("select")]
        .find((s) => [...s.options].some((o) => o.textContent === "No sky (flat colour)"));
      return Boolean(select && [...select.options].some((o) => o.value === "smokedome"));
    }, null, { timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  out.skyDropdownFound = skyDropdownFound;
  out.skyInDropdown = await page.evaluate(() => {
    const select = [...document.querySelectorAll("select")]
      .find((s) => [...s.options].some((o) => o.textContent === "No sky (flat colour)"));
    return select ? [...select.options].map((o) => o.value) : null;
  });

  await page.screenshot({ path: path.join(ART, "media-library.png"), fullPage: false });
} catch (e) {
  out.fatal = String(e);
} finally {
  if (browser) await browser.close();
  if (store) await store.close();
  if (storeDir) await rm(storeDir, { recursive: true, force: true });
  if (datalakeDir) await rm(datalakeDir, { recursive: true, force: true });
}

out.consoleErrors = consoleErrors;
out.pageErrors = pageErrors;
console.log(JSON.stringify(out, null, 2));

const ok =
  out.healthAssets === 0 &&
  out.healthDatalake &&
  out.rootFolders?.includes("Textures") &&
  out.rootFiles?.includes("smoke-tetra.obj:model") &&
  out.traversalRejected &&
  out.importedId === "smoke-teal" &&
  out.importedKind === "texture" &&
  out.importedSource === "Datalake/Textures/smoke-teal.png" &&
  out.importedServed &&
  out.refresh?.ok &&
  out.refresh?.count === 1 &&
  out.refresh?.status?.online &&
  out.textureRegistered &&
  out.applied?.spawnOk &&
  out.applied?.updateOk &&
  out.applied?.textureId === "smoke-teal" &&
  out.terrain?.ok &&
  out.terrain?.samples === 33 &&
  out.terrain?.length === 33 * 33 &&
  out.terrain?.spawnOk &&
  out.terrain?.hasTerrain &&
  out.dds?.ok &&
  out.dds?.file === "smoke-red.png" &&
  out.dds?.dims?.[0] === 4 &&
  out.dds?.pixel?.[0] === 255 &&
  out.dds?.pixel?.[1] === 0 &&
  out.dds?.pixel?.[3] === 255 &&
  out.dds?.registered &&
  out.sound?.ok &&
  out.sound?.listed &&
  out.sound?.spawnOk &&
  out.sound?.patchOk &&
  out.sound?.state?.volume === 0.7 &&
  out.sound?.state?.loop === false &&
  out.sound?.docCarriesSound &&
  out.sound?.tracked === 1 &&
  out.sound?.physicsRejected &&
  out.modelImport?.ok &&
  out.modelImport?.format === "graphysx-mesh-json" &&
  out.modelImport?.spawnOk &&
  out.modelReady === "ready" &&
  out.modelListed &&
  Array.isArray(out.mediaTabCards) &&
  out.mediaTabCards.includes("Smoke teal") &&
  out.dialogOpen &&
  out.dialogFiles?.includes("smoke-tetra.obj") &&
  out.guiImport?.selected &&
  typeof out.guiImportStatus === "string" && out.guiImportStatus.startsWith("Imported") &&
  out.guiImportedListed &&
  out.sky?.importOk &&
  out.sky?.id === "smokedome" &&
  out.sky?.axialId === "puffs" &&
  out.sky?.faceCount === 6 &&
  out.sky?.slot0FromLeft &&
  out.sky?.slot1FromRight &&
  out.sky?.axialSlot0FromPosX &&
  out.sky?.axialSlot1FromNegX &&
  out.sky?.axialConverted &&
  out.sky?.hasNoBasePath &&
  out.sky?.horizonSampled &&
  out.sky?.registered &&
  out.sky?.curatedIntact &&
  out.sky?.loadOk &&
  out.sky?.applied === "smokedome" &&
  out.sky?.reloadOk &&
  out.sky?.reloadedSky === "smokedome" &&
  out.sky?.rejected &&
  out.skyDropdownFound &&
  out.skyInDropdown?.includes("smokedome") &&
  out.playSound?.ok &&
  out.playSound?.projectedSound === "smoke-blip" &&
  out.playSound?.projectedVolume === 0.6 &&
  out.playSound?.projectedRefDistance === 8 &&
  out.playSound?.selfTargeted &&
  out.playSound?.interactOk &&
  out.playSound?.receiptType === "play-sound" &&
  out.playSound?.receiptSound === "smoke-blip" &&
  out.playSound?.receiptTargets?.length === 1 &&
  out.playSound?.receiptTargets?.[0] === "chime" &&
  out.playSound?.aimedTargets?.[0] === "bell" &&
  out.playSound?.visibilityUntouched &&
  out.playSound?.docCarries &&
  out.playSound?.reloadOk &&
  out.playSound?.rejectsMissingSource &&
  out.playSound?.rejectsBadVolume &&
  out.playSound?.toggleStillNeedsTarget &&
  out.playSound?.impulseStillNeedsTarget &&
  out.playSound?.triggerLoadOk &&
  out.playSound?.firedByTrigger >= 1 &&
  out.playSound?.oneShotCountIsNumber;
process.exit(out.fatal || pageErrors.length || !ok ? 1 : 0);
