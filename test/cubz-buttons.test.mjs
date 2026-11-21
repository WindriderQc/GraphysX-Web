import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { importBrowserModule } from "./support/import-browser-module.mjs";
const { CUBZ_MENUS, cubzButtonNumber, cubzDestination } = await importBrowserModule(new URL("../src/cubz-menu-buttons.ts", import.meta.url));
const { buildCubzMenu, cubzSequenceCommands, cubzResetCommands, cubzStudioPose } = await importBrowserModule(new URL("../src/cubz-menu-scene.ts", import.meta.url));
const data = JSON.parse(readFileSync(new URL("../public/assets/ports/archive-cubz-menu.json", import.meta.url)));

test("reconstructed keys preserve native numbering and eight disjoint four-button menus", () => {
  const scene = buildCubzMenu(data), buttons = scene.entities.filter(entity => entity.tags?.includes("reconstructed-button-model") && entity.type === "mesh");
  assert.equal(CUBZ_MENUS.length, 8); assert.equal(buttons.length, 32);
  assert.equal(new Set(buttons.map(button => button.id)).size, 32);
  for (let menu = 0; menu < 8; menu++) {
    assert.equal(CUBZ_MENUS[menu].buttons.length, 4);
    for (let slot = 0; slot < 4; slot++) {
      const number = cubzButtonNumber(menu, slot), button = buttons.find(button => button.tags.includes(`cubz-button-${number}`));
      assert.equal(button.parentId, `cubz-menu-${menu}`); assert.match(button.label, new RegExp(`^Btn${number} ·`));
      assert.ok(button.mesh.positions.every(Number.isFinite));
      assert.ok(button.mesh.indices.every(index => index >= 0 && index < button.mesh.positions.length / 3));
      assert.equal(scene.entities.find(entity => entity.id === button.parentId).visible, false);
    }
  }
  assert.equal(scene.entities.filter(entity => entity.tags?.includes("cubz-shared-exit")).length, 1);
});

test("shared exit appears only at the terminal opening key and disappears on return/reset", () => {
  const scene = buildCubzMenu(data);
  for (let choice = 0; choice < 8; choice++) {
    const opened = cubzSequenceCommands(data, scene, "open", choice, 10);
    const behavior = opened.find(command => command.id === "cubz-exit" && command.op === "attach-behavior").behavior;
    assert.deepEqual(behavior.visibility, [[0, false], [(choice ? 28/30 : 0) + 50/30, true]]);
    assert.deepEqual(cubzSequenceCommands(data, scene, "return", choice, 10).find(command => command.id === "cubz-exit" && command.op === "attach-behavior").behavior.visibility, [[0, false]]);
    const animated = structuredClone(scene);
    for (const command of opened.filter(command => command.op === "attach-behavior")) {
      const entity = animated.entities.find(entity => entity.id === command.id); (entity.behaviors ??= []).push(command.behavior);
    }
    const pose = cubzStudioPose(animated, 20);
    assert.equal(pose.entities.find(entity => entity.id === "cubz-exit").visible, true);
    assert.equal(pose.entities.find(entity => entity.id === "cubz-exit").behaviors.length, 0);
    assert.ok(cubzResetCommands(animated).some(command => command.id === "cubz-exit" && command.patch?.visible === false));
  }
});

test("current destinations are explicit routes without inherited credentials or startup parameters", () => {
  for (const action of new Set(CUBZ_MENUS.flatMap(menu => menu.buttons.map(button => button.action)))) {
    const url = cubzDestination(action, "https://example.test/graphysx/?session=private&app=cubx#invite=secret", "/store");
    if (!url) continue;
    assert.equal(url.origin, "https://example.test"); assert.equal(url.pathname, "/graphysx/");
    assert.equal(url.hash, ""); assert.equal(url.searchParams.has("session"), false); assert.equal(url.searchParams.get("store"), "/store");
    if (action === "atmel") assert.equal(url.searchParams.get("view"), "atmel");
    else if (action === "ev3-lab") { assert.equal(url.searchParams.get("app"), "ev3-lab"); assert.equal(url.searchParams.get("view"), "atelier"); }
    else if (action === "library") assert.equal(url.searchParams.get("library"), "local");
    else assert.equal(url.searchParams.get("app"), action);
  }
});
