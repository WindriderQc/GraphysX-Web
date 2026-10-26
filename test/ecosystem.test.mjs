import { test } from "node:test";
import assert from "node:assert/strict";
import { importBrowserModule } from "./support/import-browser-module.mjs";

// The real browser modules, transpiled in place: the house's data, scene and tour halves have
// no DOM and no three.js.
const data = await importBrowserModule(new URL("../src/ecosystem-data.ts", import.meta.url));
const scene = await importBrowserModule(new URL("../src/ecosystem-scene.ts", import.meta.url));
const tour = await importBrowserModule(new URL("../src/ecosystem-tour.ts", import.meta.url));
const { ecosystemObservation } = await importBrowserModule(new URL("../src/ecosystem-presentation.ts", import.meta.url));

test("presentation observes the current tour, deduplicates focus and selects only a displayed node step", () => {
  const ids = data.ecoNodeIds().slice(0, 2);
  const node = data.ecoNode(ids[0]);
  const state = { application: "ecosystem", tour: { index: 0, count: 1, kind: "memory", script: "memory", adhoc: null },
    focus: [...ids, ids[0]], narration: "Visible narration", narrationComplete: true };
  const observed = ecosystemObservation(state);
  assert.equal(observed.selection, null, "a multi-node workflow never invents a selected component");
  assert.equal(observed.focus.length, 2);
  const selected = ecosystemObservation({ ...state, tour: { ...state.tour, kind: "node", adhoc: `node-${node.id}` } });
  assert.equal(selected.selection.id, node.id);
  assert.equal(selected.selection.description, data.describeNode(node));
  const scripted = ecosystemObservation({ ...state, tour: { ...state.tour, kind: "node", script: `node-${node.id}` } });
  assert.equal(scripted.selection.id, node.id);
});

test("the ecosystem map is self-consistent", () => {
  data.validateEcosystem();
  const counts = data.ecoCounts();
  assert.deepEqual([counts.hosts, counts.vms, counts.edge, counts.spare], [3, 1, 4, 4], "three hosts, one VM, four Pi, four spare — as the infographics");
  assert.equal(counts.services, 8, "eight service groups on UGFrank");
  assert.equal(data.ecoNode("devx").host, "ugbrutal", "devX is hosted by UGBrutal, never a server of its own");
  assert.ok(data.ecoServicesOn("ugfrank").every((node) => node.status === "installed"));
  // Open issues are named and amber; planned roles are kept apart from installed ones.
  assert.deepEqual(data.ecoIssues().map((node) => node.id), ["ugbrutal", "piusb", "pit", "babypi"]);
  assert.match(data.describeNode(data.ecoNode("ugbrutal")), /espace libre critique au relevé du 25 octobre/);
  assert.doesNotMatch(data.describeNode(data.ecoNode("nas")), /\/mnt\//, "container mounts are not NAS host paths");
  assert.ok(data.ecoNode("pitft").planned && data.ecoNode("pitft").status === "installed", "piTFT exists; its dashboard is planned, not installed");
  assert.ok(data.ecoPlanned().some((node) => node.id === "ugsmall"));
  // No link claims health, and nothing links devX as a peer of the hosts.
  assert.ok(!data.ECOSYSTEM_LINKS.some((link) => link.from === "devx" || link.to === "devx"));
  assert.ok(!data.ECOSYSTEM_LINKS.some((link) => link.from === "babypi" && link.to === "pitft"), "BabyPi stores clips on the NAS, not on piTFT");
  assert.match(data.describeNode(data.ecoNode("babypi")), /Point ouvert : IR nocturne/);
  assert.match(data.describeNode(data.ecoNode("devx")), /hébergée par UGBrutal/);
});

test("the world has one tagged entity per node and no two nodes share ground", () => {
  const world = scene.composeEcosystemWorld({ motes: false });
  assert.equal(world.id, "agentx-ecosystem");
  const principals = world.entities.filter((entity) => entity.tags?.includes(scene.ECO_NODE_TAG));
  assert.equal(principals.length, data.ECOSYSTEM_NODES.length);
  const ids = new Set(world.entities.map((entity) => entity.id));
  assert.equal(ids.size, world.entities.length, "entity ids are unique");
  for (const entity of principals) {
    const id = scene.ecoNodeIdOf(entity.tags);
    const node = data.ecoNode(id);
    assert.ok(node, `${entity.id} names a known node`);
    assert.ok(entity.tags.includes(`eco-status:${node.status}`));
    assert.ok(["box", "cylinder"].includes(entity.type), "every node is a plain primitive");
  }
  // Every part names its node and hangs under it, so a click on a rail resolves to the machine.
  for (const entity of world.entities.filter((entity) => entity.parentId)) {
    assert.ok(ids.has(entity.parentId), `${entity.id} hangs under a known entity`);
    assert.ok(scene.ecoNodeIdOf(entity.tags), `${entity.id} carries its node id`);
  }
  // Footprints: devX inside UGBrutal, everything else apart.
  const inside = (a, b) => a.minX >= b.minX && a.maxX <= b.maxX && a.minZ >= b.minZ && a.maxZ <= b.maxZ;
  assert.ok(inside(scene.ecoFootprint("devx"), scene.ecoFootprint("ugbrutal")), "devX stands inside UGBrutal's glass");
  const nodes = data.ecoNodeIds().filter((id) => id !== "devx");
  for (let i = 0; i < nodes.length; i += 1) for (let j = i + 1; j < nodes.length; j += 1) {
    const a = scene.ecoFootprint(nodes[i]), b = scene.ecoFootprint(nodes[j]);
    const apart = a.maxX <= b.minX || b.maxX <= a.minX || a.maxZ <= b.minZ || b.maxZ <= a.minZ;
    assert.ok(apart, `${nodes[i]} and ${nodes[j]} overlap on the ground`);
  }
  // Status is visible without a legend: amber rails and a beacon on open issues, a wireframe on spare hardware.
  const beacons = world.entities.filter((entity) => entity.id.endsWith("-beacon"));
  assert.deepEqual(beacons.map((entity) => scene.ecoNodeIdOf(entity.tags)), ["ugbrutal", "piusb", "pit", "babypi"]);
  assert.ok(world.entities.filter((entity) => entity.id.endsWith("-cage") && entity.material.wireframe).length >= 5, "spare hardware, Google Calendar and devX are drawn as cages");
  assert.ok(world.entities.some((entity) => entity.id === "eco-ugalien-gpu-1") && !world.entities.some((entity) => entity.id === "eco-ugalien-gpu-2"), "exactly two GPU cards on UGAlien");
  assert.ok(world.environment.post.bloom.strength > 0);
});

test("the tour parses, refuses, and every stop has a picture and a narration", () => {
  const steps = tour.parseTour(tour.DEFAULT_TOUR);
  assert.equal(steps.length, 13);
  assert.equal(tour.tourText(steps), tour.DEFAULT_TOUR);
  assert.deepEqual(tour.parseTour("node-babypi, Garage"), [{ kind: "node", id: "babypi" }, { kind: "garage" }]);
  assert.throws(() => tour.parseTour("overview,dance"), /unknown play stop: dance/);
  assert.throws(() => tour.parseTour("node-nope"), /unknown play stop/);
  assert.throws(() => tour.parseTour(""), /at least one/);
  assert.throws(() => tour.parseTour(Array(40).fill("overview").join(",")), /at most/);
  const every = [...steps, ...data.ecoNodeIds().map((id) => ({ kind: "node", id }))];
  for (const step of every) {
    const picture = tour.tourPicture(step);
    assert.ok(picture.narration.length > 40, `${tour.tourText([step])} says something`);
    for (const id of [...picture.focus, ...picture.amber]) assert.ok(data.ecoNode(id), `${tour.tourText([step])} lights a known node ${id}`);
    for (const arc of picture.flow) assert.ok(data.ecoNode(arc.from) && data.ecoNode(arc.to) && arc.from !== arc.to, `${tour.tourText([step])} arcs between known nodes`);
    assert.ok(tour.tourStepSeconds(step) >= 5);
  }
  // The pictures tell the truth of the map.
  assert.deepEqual(tour.tourPicture({ kind: "watch" }).amber, ["ugbrutal", "piusb", "pit", "babypi"]);
  assert.deepEqual(tour.tourPicture({ kind: "edge" }).amber, ["piusb", "pit", "babypi"], "the Pi stop frames only edge issues");
  assert.deepEqual(tour.tourPicture({ kind: "brutal" }).amber, ["ugbrutal"]);
  assert.match(tour.tourPicture({ kind: "brutal" }).narration, /disque système est critique/);
  assert.deepEqual(tour.tourPicture({ kind: "brutal" }).focus, ["ugbrutal", "devx"]);
  assert.equal(tour.tourPicture({ kind: "services" }).flow.length, 8, "each service arcs to UGFrank");
  const voice = tour.tourPicture({ kind: "voice" });
  assert.deepEqual(voice.flow.map((arc) => arc.from), ["browser", "core", "ugfrank", "nestor", "core", "ugfrank"]);
  assert.match(voice.narration, /OpenClaw ou de Hermes Nestor/);
  assert.match(tour.tourPicture({ kind: "memory" }).narration, /Google Calendar/);
  assert.match(tour.tourPicture({ kind: "overview" }).narration, /Rien ici ne prétend que tout va bien/);
  assert.match(tour.tourPicture({ kind: "node", id: "devx" }).narration, /hébergée par UGBrutal/);
});

test("the player walks the list on the frame clock and holds on the last stop", () => {
  const player = tour.createTourPlayer(tour.parseTour("overview,frank,summary"));
  assert.equal(player.state().index, 0);
  assert.equal(player.tick(1), false, "paused: nothing moves");
  player.play();
  assert.equal(player.tick(6), false);
  assert.equal(player.tick(1.5), true, "overview holds 7 s");
  assert.equal(player.state().index, 1);
  assert.equal(player.tick(10), true);
  assert.equal(player.tick(100), false, "the last stop holds");
  assert.equal(player.state().playing, false);
  player.play();
  assert.equal(player.state().index, 0, "play at the end restarts");
  assert.equal(player.goto(99), true);
  assert.equal(player.state().index, 2);
  assert.equal(player.previous(), true);
  assert.throws(() => player.replace([]), /empty/);
});
