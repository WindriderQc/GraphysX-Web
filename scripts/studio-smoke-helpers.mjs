import assert from "node:assert/strict";

/** Retain the advanced regressions after explicitly checking the new human entry. */
export async function enterCompleteStudio(page) {
  await page.locator(".gx-studio-simple:not([hidden])").waitFor();
  assert.equal(await page.evaluate(() => JSON.parse(window.render_game_to_text()).studio.experience), "simple");
  await page.click("[data-studio-action=complete]");
  await page.locator(".gx-ed-toolbar").waitFor();
  assert.equal(await page.evaluate(() => JSON.parse(window.render_game_to_text()).studio.experience), "complete");
  // Each later handoff checks the first-visit default again, independently of preference.
  await page.evaluate(() => localStorage.removeItem("graphysx.studio.experience.v1"));
}

export const studioState = page => page.evaluate(() => JSON.parse(window.render_game_to_text()).studio);
export const sceneDocument = page => page.evaluate(() => window.__GRAPHYSX__.exportDocument());
export const canonicalScene = document => ({ ...document, entities: document.entities.toSorted((a, b) => a.id.localeCompare(b.id)) });
export const sceneCard = (page, name) => page.locator("[data-personal-key=" + JSON.stringify("graphysx.agent-world.v2." + name) + "]");
export async function namedSave(page, name) {
  await page.click("[data-studio-action=save]");
  const dialog = page.getByRole("dialog", { name: "Enregistrer ma scène", exact: true });
  await dialog.getByLabel("Nom de la scène", { exact: true }).fill(name);
  await dialog.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await page.waitForFunction(name => JSON.parse(window.render_game_to_text()).studio.savedName === name, name);
  assert.equal(new URL(page.url()).searchParams.get("localScene"), name);
}
export async function selectStudioObject(page, id) {
  if (await page.locator(".gx-studio-mobile").isVisible()) await page.locator(".gx-studio-mobile").getByRole("button", { name: "Objets", exact: true }).click();
  await page.locator("[data-studio-entity=" + JSON.stringify(id) + "]").click();
}
export const drawStudio = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
