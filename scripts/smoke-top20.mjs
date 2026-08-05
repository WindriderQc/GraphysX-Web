import { mkdirSync } from "node:fs";
import path from "node:path";
import { SMOKE_TIMEOUT, applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";

const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:4188/";
const ART = process.env.SMOKE_ARTIFACTS || path.resolve("output/smoke");
mkdirSync(ART, { recursive: true });

const consoleErrors = [];
const pageErrors = [];
const browser = await launchSmokeBrowser();
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  permissions: ["clipboard-read", "clipboard-write"],
});
const watch = (page, prefix = "") => {
  applySmokeTimeout(page);
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(`${prefix}${message.text()}`); });
  page.on("pageerror", (error) => pageErrors.push(`${prefix}${String(error)}`));
};

const definition = {
  schema: "graphysx.agent-world/v2",
  id: "top20-editor",
  label: "Top 20 Editor Lab",
  environment: {
    background: "#07141d",
    ground: { visible: true, size: 20, color: "#102b2c", grid: true, gridColor: "#4aa998" },
    physics: { gravity: [0, -9.81, 0] },
  },
  entities: [
    { id: "top20-light", type: "ambient-light", intensity: 1 },
    { id: "top20-box", type: "box", transform: { position: [0, 0.5, 0] }, material: { color: "#78f0d0" } },
  ],
};

const out = {};
try {
  // Editor/API productivity: exercise the human surface and the exact API/bridge beneath it.
  const editor = await context.newPage();
  watch(editor, "editor: ");
  await editor.goto(`${BASE}?host=editor`, { waitUntil: "domcontentloaded", timeout: SMOKE_TIMEOUT });
  await editor.waitForFunction(() => !!window.__GRAPHYSX__ && !!document.querySelector(".gx-ed-toolbar"), null, { timeout: SMOKE_TIMEOUT });
  await editor.evaluate((doc) => window.__GRAPHYSX__.load(doc), definition);
  await editor.evaluate(() => window.__GRAPHYSX__.spawn({ id: "draft-probe", type: "sphere" }));
  await editor.waitForFunction(() => !!window.localStorage.getItem("graphysx.editor.draft.v1"), null, { timeout: SMOKE_TIMEOUT });
  out.draft = await editor.evaluate(() => ({
    dirtyText: document.querySelector(".gx-ed-status")?.textContent ?? "",
    draftWorld: JSON.parse(window.localStorage.getItem("graphysx.editor.draft.v1") ?? "null")?.definition?.id ?? null,
  }));

  await editor.reload({ waitUntil: "domcontentloaded", timeout: SMOKE_TIMEOUT });
  await editor.waitForSelector(".gx-ed-recover:not([hidden])", { timeout: SMOKE_TIMEOUT });
  await editor.click(".gx-ed-recover");
  await editor.waitForFunction(() => window.__GRAPHYSX__?.state()?.world?.id === "top20-editor", null, { timeout: SMOKE_TIMEOUT });
  out.draft.recovered = await editor.evaluate(() => window.__GRAPHYSX__.query({ ids: ["draft-probe"] }).length === 1);

  out.redo = await editor.evaluate(() => {
    const api = window.__GRAPHYSX__;
    api.spawn({ id: "redo-probe", type: "box" });
    const spawned = api.query({ ids: ["redo-probe"] }).length === 1;
    const undone = api.undo().ok && api.query({ ids: ["redo-probe"] }).length === 0;
    const redone = api.redo().ok && api.query({ ids: ["redo-probe"] }).length === 1;
    api.undo();
    api.spawn({ id: "redo-invalidates", type: "sphere" });
    const invalidated = !api.redo().ok;
    const manifest = window.__GRAPHYSX_AGENT_BRIDGE__.manifest();
    const parity = window.__GRAPHYSX_AGENT_BRIDGE__.audit();
    return { spawned, undone, redone, invalidated, bridgeRedo: manifest.tools.some((tool) => tool.path === "redo"), parity };
  });

  await editor.keyboard.press("Control+K");
  await editor.waitForSelector(".gx-ed-command-shade");
  await editor.fill(".gx-ed-command-input", "redo");
  out.palette = await editor.evaluate(() => ({
    dialog: document.querySelector(".gx-ed-command-shade")?.getAttribute("role"),
    commands: [...document.querySelectorAll(".gx-ed-command")].map((button) => button.textContent),
  }));
  await editor.keyboard.press("Escape");

  editor.once("dialog", (dialog) => dialog.accept("top20-slot"));
  await editor.locator(".gx-ed-toolbar").getByRole("button", { name: "Save", exact: true }).click();
  out.slot = await editor.evaluate(() => ({
    option: !!document.querySelector('.gx-ed-toolbar option[value="top20-slot"]'),
    stored: !!window.localStorage.getItem("graphysx.agent-world.v2.top20-slot"),
    liveStatus: document.querySelector(".gx-ed-status")?.getAttribute("aria-live"),
    status: document.querySelector(".gx-ed-status")?.textContent ?? "",
  }));

  const importedJson = { ...definition, id: "top20-json-import", label: "Top 20 JSON Import" };
  await editor.click('[data-gx-import="scene"]');
  await editor.setInputFiles('input[type="file"]', {
    name: "top20.graphysx.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(importedJson)),
  });
  await editor.waitForFunction(() => window.__GRAPHYSX__.state()?.world?.id === "top20-json-import", null, { timeout: SMOKE_TIMEOUT });
  const xml = await editor.evaluate(() => window.__GRAPHYSX__.exportLegacyXml().value?.xml ?? "");
  await editor.click('[data-gx-import="scene"]');
  await editor.setInputFiles('input[type="file"]', {
    name: "top20-import.scenenet.xml",
    mimeType: "application/xml",
    buffer: Buffer.from(xml),
  });
  await editor.waitForFunction(() => window.__GRAPHYSX__.state()?.world?.id === "top20-import", null, { timeout: SMOKE_TIMEOUT });
  out.imports = { json: true, xml: true };

  await editor.locator(".gx-ed-toolbar").getByRole("button", { name: "Copy", exact: true }).click();
  out.copy = await editor.evaluate(async () => {
    const copied = JSON.parse(await navigator.clipboard.readText());
    return { schema: copied.schema, id: copied.id };
  });

  await editor.locator(".gx-display-settings summary").click();
  await editor.selectOption('select[aria-label="Contrast preference"]', "high");
  await editor.selectOption('select[aria-label="Motion preference"]', "reduce");
  out.accessibility = await editor.evaluate(() => ({
    contrast: document.documentElement.dataset.gxContrast,
    motion: document.documentElement.dataset.gxMotion,
    stored: JSON.parse(window.localStorage.getItem("graphysx.display.preferences.v1") ?? "null"),
  }));
  await editor.screenshot({ path: path.join(ART, "top20-editor.png") });

  // Discovery/personalisation and player-resilience paths on the real front door.
  const play = await context.newPage();
  watch(play, "play: ");
  await play.goto(BASE, { waitUntil: "domcontentloaded", timeout: SMOKE_TIMEOUT });
  await play.waitForSelector(".gx-welcome", { timeout: SMOKE_TIMEOUT });
  await play.click(".gx-welcome .gx-go-games");
  await play.waitForSelector(".gx-shelf-search", { timeout: SMOKE_TIMEOUT });
  const totalGames = await play.locator("[data-shelf-key]").count();
  await play.fill(".gx-shelf-search", "BallZ");
  const ballzMatches = await play.locator("[data-shelf-key]:visible").count();
  await play.fill(".gx-shelf-search", "definitely-no-such-course");
  const emptyShown = await play.locator(".gx-shelf-empty").isVisible();
  await play.fill(".gx-shelf-search", "");
  const ballzItem = play.locator('.gx-shelf-item:has(> [data-shelf-key="game:ballz"])');
  await ballzItem.locator(".gx-shelf-favorite").click();
  const favorited = await ballzItem.evaluate((item) => item.classList.contains("gx-shelf-item--favorite"));
  const firstKey = await play.locator("[data-shelf-key]").first().getAttribute("data-shelf-key");
  await play.click(".gx-shelf-reset");
  const reset = await play.evaluate(() => JSON.parse(window.localStorage.getItem("graphysx.shelf.preferences.v1") ?? "null"));
  out.shelf = { totalGames, ballzMatches, emptyShown, favorited, firstKey, reset };

  await play.click('[data-shelf-key="game:ballz"]');
  await play.waitForSelector(".gx-bzmenu-start", { timeout: SMOKE_TIMEOUT });
  out.recent = await play.evaluate(() => Number(JSON.parse(window.localStorage.getItem("graphysx.shelf.preferences.v1") ?? "null")?.recent?.["game:ballz"] ?? 0) > 0);
  await play.click(".gx-bzmenu-start");
  await play.waitForSelector(".gx-bz-hud", { timeout: SMOKE_TIMEOUT });
  await play.evaluate(() => window.__GRAPHYSX__.pause(true));
  await play.waitForTimeout(950);
  await play.evaluate(() => window.__GRAPHYSX__.pause(false));

  await play.click(".gx-bz-pause-toggle");
  await play.waitForTimeout(120);
  const pauseProbe = await play.evaluate(() => ({
    paused: window.__GRAPHYSX__.state()?.paused === true,
    hidden: document.querySelector(".gx-bz-pause")?.hasAttribute("hidden") ?? null,
    phase: window.__GRAPHYSX__.rules.status()?.phase ?? null,
    toggles: document.querySelectorAll(".gx-bz-pause-toggle").length,
    hud: document.querySelectorAll(".gx-bz-hud").length,
    touch: document.querySelectorAll(".gx-bz-touch").length,
    mode: window.__GRAPHYSX_HOST__.mode,
  }));
  const paused = pauseProbe.paused && pauseProbe.hidden === false;
  if (paused) await play.click('[data-gx-pause-action="resume"]');
  const resumed = await play.evaluate(() => window.__GRAPHYSX__.state()?.paused === false);

  await play.selectOption(".gx-bz-control-mode", "touch");
  const touchVisible = await play.locator('.gx-bz-touch-btn[data-gx-touch="ArrowUp"]').isVisible();
  const beforeTouchRevision = await play.evaluate(() => window.__GRAPHYSX__.state().revision);
  if (touchVisible) {
    await play.dispatchEvent('.gx-bz-touch-btn[data-gx-touch="ArrowUp"]', "pointerdown", { pointerId: 7, button: 0 });
    await play.dispatchEvent('.gx-bz-touch-btn[data-gx-touch="ArrowUp"]', "pointerup", { pointerId: 7, button: 0 });
  }
  const afterTouchRevision = await play.evaluate(() => window.__GRAPHYSX__.state().revision);

  const beforeGamepadRevision = await play.evaluate(() => window.__GRAPHYSX__.state().revision);
  let afterGamepadRevision = beforeGamepadRevision;
  if (pauseProbe.touch > 0) {
    await play.evaluate(() => {
      const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
      window.__top20Pad = { connected: true, axes: [0, -1], buttons };
      Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [window.__top20Pad] });
    });
    await play.waitForFunction((revision) => window.__GRAPHYSX__.state().revision > revision, beforeGamepadRevision, { timeout: SMOKE_TIMEOUT });
    afterGamepadRevision = await play.evaluate(() => {
      window.__top20Pad.axes = [0, 0];
      return window.__GRAPHYSX__.state().revision;
    });
  }

  await play.click(".gx-bz-fullscreen");
  await play.waitForTimeout(150);
  const fullscreen = await play.evaluate(() => !!document.fullscreenElement);
  if (fullscreen) await play.evaluate(() => document.exitFullscreen());
  out.play = await play.evaluate(({ paused, resumed, pauseProbe, touchVisible, beforeTouchRevision, afterTouchRevision, beforeGamepadRevision, afterGamepadRevision, fullscreen }) => ({
    paused,
    resumed,
    pauseProbe,
    touchVisible,
    touchDroveApi: afterTouchRevision > beforeTouchRevision,
    gamepadDroveApi: afterGamepadRevision > beforeGamepadRevision,
    fullscreen,
    controlStored: JSON.parse(window.localStorage.getItem("graphysx.play.preferences.v1") ?? "null")?.controlMode ?? null,
    hint: document.querySelector(".gx-bz-hint")?.textContent ?? "",
    pauseActions: document.querySelectorAll("[data-gx-pause-action]").length,
  }), { paused, resumed, pauseProbe, touchVisible, beforeTouchRevision, afterTouchRevision, beforeGamepadRevision, afterGamepadRevision, fullscreen });
  await play.screenshot({ path: path.join(ART, "top20-play.png") });

  await play.click(".gx-bz-exit");
  await play.waitForSelector(".gx-welcome", { timeout: SMOKE_TIMEOUT });
  await play.click(".gx-welcome .gx-go-browse");
  await play.waitForSelector(".gx-browse .gx-shelf-search", { timeout: SMOKE_TIMEOUT });
  const totalScenes = await play.locator(".gx-browse [data-shelf-key]").count();
  await play.fill(".gx-browse .gx-shelf-search", "physics sketchbook");
  const physicsMatches = await play.locator(".gx-browse [data-shelf-key]:visible").count();
  await play.fill(".gx-browse .gx-shelf-search", "no-scene-has-this-name");
  const browseEmpty = await play.locator(".gx-browse .gx-shelf-empty").isVisible();
  out.browse = { totalScenes, physicsMatches, browseEmpty };
  await play.screenshot({ path: path.join(ART, "top20-browse-search.png") });
  await context.close();
} catch (error) {
  out.fatal = String(error);
}

out.consoleErrors = consoleErrors;
out.pageErrors = pageErrors;
console.log(JSON.stringify(out, null, 2));
await browser.close();

const ok =
  /unsaved/.test(out.draft?.dirtyText ?? "") &&
  out.draft?.draftWorld === "top20-editor" && out.draft?.recovered === true &&
  out.redo?.spawned === true && out.redo?.undone === true && out.redo?.redone === true && out.redo?.invalidated === true &&
  out.redo?.bridgeRedo === true && out.redo?.parity?.missing?.length === 0 && out.redo?.parity?.extra?.length === 0 &&
  out.palette?.dialog === "dialog" && out.palette?.commands?.some((command) => /Redo/.test(command)) &&
  out.slot?.option === true && out.slot?.stored === true && out.slot?.liveStatus === "polite" && /saved/.test(out.slot?.status ?? "") &&
  out.imports?.json === true && out.imports?.xml === true && out.copy?.schema === "graphysx.agent-world/v2" && out.copy?.id === "top20-import" &&
  out.accessibility?.contrast === "high" && out.accessibility?.motion === "reduce" && out.accessibility?.stored?.contrast === "high" &&
  out.shelf?.totalGames > 5 && out.shelf?.ballzMatches >= 1 && out.shelf?.ballzMatches < out.shelf?.totalGames && out.shelf?.emptyShown === true &&
  out.shelf?.favorited === true && out.shelf?.firstKey === "game:ballz" && out.shelf?.reset?.favorites?.length === 0 && out.recent === true &&
  out.browse?.totalScenes > 5 && out.browse?.physicsMatches === 1 && out.browse?.browseEmpty === true &&
  out.play?.paused === true && out.play?.resumed === true && out.play?.touchVisible === true && out.play?.touchDroveApi === true &&
  out.play?.gamepadDroveApi === true && out.play?.fullscreen === true && out.play?.controlStored === "touch" && /touch arrows/.test(out.play?.hint ?? "") && out.play?.pauseActions >= 3;

process.exit(out.fatal || consoleErrors.length || pageErrors.length || !ok ? 1 : 0);
