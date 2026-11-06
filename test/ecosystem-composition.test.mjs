import { test } from "node:test";
import assert from "node:assert/strict";
import { importBrowserModule } from "./support/import-browser-module.mjs";
const { parseComposition, createEcosystemCatalog, DEFAULT_ECOSYSTEM_CATALOG } = await importBrowserModule(new URL("../src/ecosystem-catalog.ts", import.meta.url));
const { composeEcosystemWorld, ecoNodeIdOf, ECO_NODE_TAG } = await importBrowserModule(new URL("../src/ecosystem-scene.ts", import.meta.url));
const { parseTour, tourPicture } = await importBrowserModule(new URL("../src/ecosystem-tour.ts", import.meta.url));
const { ecosystemObservation } = await importBrowserModule(new URL("../src/ecosystem-presentation.ts", import.meta.url));
function fixture(name = "Host A") {
  return { contentRevision: "a".repeat(64), read: { contract: "agentx.presentation-read/v1", source: "core.ecosystem.composition", id: "view_" + "b".repeat(64), revision: "b".repeat(64), observedAt: "2030-01-02T12:00:00.000Z", expiresAt: "2030-01-02T12:05:00.000Z" },
    data: { version: 1, reviewedAt: "2030-01-02", source: "Synthetic reviewed composition", nodes: [
      { id: "host-a", name, subtitle: "Shared compute", kind: "host", status: "installed", evidence: "Synthetic receipt" },
      { id: "service-a", name: "Service A", subtitle: "Shared service", kind: "service", status: "installed", host: "host-a" }
    ], links: [{ from: "host-a", to: "service-a", kind: "compute" }], workflows: [], placements: {
      "host-a": { x: 0, z: 0, width: 2, height: 4, depth: 2 }, "service-a": { x: 4, z: 0, width: 2, height: 1, depth: 2 }
    } } };
}
test("composition belongs to each instance; custom IDs, descriptions and dates never leak across views", () => {
  const input = fixture(), first = createEcosystemCatalog(parseComposition(input)), second = createEcosystemCatalog(parseComposition(fixture("Other host")));
  input.data.nodes[0].name = "Changed after parse";
  assert.equal(first.ecoNode("host-a").name, "Host A"); assert.equal(second.ecoNode("host-a").name, "Other host");
  assert.equal(DEFAULT_ECOSYSTEM_CATALOG.ecoNode("host-a"), null);
  assert.equal(first.date, "2030-01-02"); assert.match(first.describeNode(first.ecoNode("host-a")), /Synthetic receipt/);
  assert.equal(parseTour("node-host-a", first)[0].id, "host-a"); assert.throws(() => parseTour("node-host-a"));
  const state = { snapshot: first.date, tour: { script: "overview", index: 0, adhoc: "node-host-a" }, focus: ["host-a"], narration: "Rendered", narrationComplete: true, composition: { contentRevision: fixture().contentRevision, read: fixture().read } };
  const observation = ecosystemObservation(state, first); assert.equal(observation.snapshot, first.date);
  assert.equal(observation.selection.label, "Host A"); assert.equal(observation.composition.contentRevision, fixture().contentRevision);
});
test("the shared world renders only supplied nodes with their supplied placement and composition tags", () => {
  const catalog = createEcosystemCatalog(parseComposition(fixture()));
  const world = composeEcosystemWorld({ composition: catalog, motes: false, plants: false });
  const nodes = world.entities.filter(entity => entity.tags?.includes(ECO_NODE_TAG));
  assert.deepEqual(nodes.map(node => ecoNodeIdOf(node.tags)), ["host-a", "service-a"]);
  assert.match(world.label, /2030-01-02/); assert.equal(nodes[1].transform.position[0], 4);
  const summary = tourPicture({ kind: "summary" }, catalog); assert.match(summary.narration, /2 composants/);
  assert.doesNotMatch(summary.narration, /25 octobre|2026-10-25/);
  const detail = tourPicture({ kind: "node", id: "host-a" }, catalog); assert.match(detail.narration, /Synthetic receipt/);
  assert.ok(detail.focus.includes("service-a"));
});
test("invalid supplied composition fails explicitly instead of substituting the historical inventory", () => {
  for (const change of [v => v.data.nodes.push(v.data.nodes[0]), v => v.data.links[0].to = "missing", v => v.data.placements["host-a"].y = NaN,
    v => v.data.reviewedAt = "2030-02-30", v => v.read.source = "browser", v => v.data.nodes[0].name = "x".repeat(101), v => delete v.data.placements["host-a"]]) {
    const input = fixture(); change(input); assert.throws(() => parseComposition(input));
  }
});
test("a supplied manifest must hash to its actual Core composition revision", async () => {
  const { verifyComposition } = await importBrowserModule(new URL("../src/ecosystem-catalog.ts", import.meta.url));
  const { createHash } = await import("node:crypto"); const input = fixture();
  input.contentRevision = createHash("sha256").update(JSON.stringify(input.data)).digest("hex");
  await verifyComposition(parseComposition(input)); input.data.nodes[0].subtitle = "Tampered role";
  await assert.rejects(verifyComposition(parseComposition(input)), /révision Core/);
});
test("live updates validate custom IDs against the mounted catalogue and composition references separately", async () => {
  const { parseEcosystemLivePayload } = await importBrowserModule(new URL("../src/ecosystem-live-state.ts", import.meta.url));
  const catalog = createEcosystemCatalog(parseComposition(fixture()));
  const read = fixture().read, timestamp = read.observedAt;
  const live = { contract: "agentx.ecosystem-live/v1", generatedAt: timestamp, expiresAt: read.expiresAt,
    nodes: [{ id: "host-a", state: "online", source: "inference_endpoints", observedAt: timestamp, expiresAt: read.expiresAt, freshness: "current" }],
    read: { ...read, source: "core.ecosystem.live" }, composition: { contentRevision: fixture().contentRevision, read } };
  assert.ok(parseEcosystemLivePayload(live, catalog)); assert.equal(parseEcosystemLivePayload(live), null);
  live.composition.read.source = "browser"; assert.equal(parseEcosystemLivePayload(live, catalog), null);
});
