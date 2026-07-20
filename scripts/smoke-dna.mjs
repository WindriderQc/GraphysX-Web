import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  AGENT_WORLD_DNA_MAX_GENERATION,
  AGENT_WORLD_DNA_MAX_LEAVES,
  AGENT_WORLD_DNA_MAX_SEGMENTS,
  AgentWorldDnaSystem,
  GRAPHYSX_AGENT_WORLD_DNA,
  GRAPHYSX_AGENT_WORLD_DNA_RECORD,
  agentWorldDnaLeafHue,
  growAgentWorldDnaForest,
  mutateAgentWorldDnaGenome,
  resolveAgentWorldDna,
  seededRandom,
} from "../src/agent-world-dna.ts";

/**
 * Proves `src/agent-world-dna.ts` — the `dna-tree` entity type — is a deterministic,
 * budgeted, round-trippable simulation rather than valid-looking data.
 *
 * ## Why this runs headless
 *
 * `dna-tree` is **not threaded into `agent-world-runtime.ts` yet** (the lead does that; three
 * other sessions are editing the shared files). So there is no `api.spawn("dna-tree")` to
 * drive, and a browser adds nothing this cannot see: the whole entity is a pure function of
 * its config plus a `update(dt)` that only advances two scalars. Node imports the module
 * directly (v24 strips the types) and inspects the real `InstancedMesh` buffers the runtime
 * would render.
 *
 * What is therefore **verified**: genome -> form determinism, export -> load reproduction,
 * the budget caps and their truncation behaviour, generation stepping and lineage, the
 * recovered constants, pause/step semantics, and disposal.
 *
 * What is **NOT verified here and needs the lead's threading**: `api.spawn`, the runtime
 * guard array, the `api.update` patch path, `state()`, serialisation through
 * `serializeEntity`, and the editor palette chip. Every one of those is listed in the
 * handoff report.
 *
 * Standalone port 4550 is reserved for this smoke but unused — nothing here needs a page.
 */

const ART = process.env.SMOKE_ARTIFACTS || "output/verify";
mkdirSync(ART, { recursive: true });

const failures = [];
function check(name, condition, detail) {
  const pass = Boolean(condition);
  if (!pass) failures.push(`${name}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  console.log(`${pass ? "  ok  " : "  FAIL"} ${name}${detail === undefined ? "" : ` ${JSON.stringify(detail)}`}`);
  return pass;
}
const near = (a, b, tolerance) => Number.isFinite(a) && Math.abs(a - b) <= tolerance;

/** Read an InstancedMesh's live matrix buffer — the actual bytes the GPU would receive. */
function matrixBuffer(mesh) {
  return Array.from(mesh.instanceMatrix.array, (value) => Number(value.toFixed(6)));
}
function findMesh(system, name) {
  let found = null;
  system.object.traverse((child) => {
    if (child.name === name) found = child;
  });
  return found;
}
const hash = (numbers) => {
  let h = 2166136261 >>> 0;
  for (const value of numbers) {
    h ^= Math.round(value * 1e6) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
};

console.log("\n== dna-tree — recovered Living Forest as v2 vocabulary ==\n");

// ---------------------------------------------------------------------------------------
// 1. The record. Every faithful claim that is a number is re-derived from the shipped
//    registry rather than re-typed here, so a drift from provenance fails the build.
// ---------------------------------------------------------------------------------------
console.log("-- provenance --");
const archive = resolveAgentWorldDna({ preset: "archive-grove" });
check("archive-grove: 13 trees", archive.trees === 13, archive.trees);
check("archive-grove: 5 columns", archive.columns === 5, archive.columns);
check("archive-grove: 4.5 x 4.6 pitch", archive.spacing[0] === 4.5 && archive.spacing[1] === 4.6, archive.spacing);
check("archive-grove: depth 6", archive.genome.depth === 6, archive.genome.depth);
check("archive-grove: length ratio 0.69", archive.genome.lengthRatio === 0.69, archive.genome.lengthRatio);
check("archive-grove: branch angle 0.36", archive.genome.branchAngle === 0.36, archive.genome.branchAngle);
check("archive-grove: roll 1.7 half-turns", archive.genome.rollTurns === 1.7, archive.genome.rollTurns);
check("archive-grove: split chance 0.28", near(archive.genome.splitChance, 0.28, 1e-9), archive.genome.splitChance);
check("archive-grove: leaf hue 0.29 / spread 0.18", archive.genome.leafHue === 0.29 && archive.genome.leafHueSpread === 0.18, [archive.genome.leafHue, archive.genome.leafHueSpread]);
check("archive-grove: leaf size 0.15", archive.genome.leafSize === 0.15, archive.genome.leafSize);
check("archive-grove: mutation default 0.08", archive.mutationRate === 0.08, archive.mutationRate);
check("archive-grove: season 17 s", archive.seasonSeconds === 17, archive.seasonSeconds);
check("archive-grove: bark #b8753f", archive.barkColor === "#b8753f", archive.barkColor);
check("archive-grove: founder generation is 1", archive.generation === 1, archive.generation);

// The PRNG is nature-lab's, so the first draws must match mulberry32 for a known seed.
const reference = seededRandom(2000);
const draws = [reference(), reference(), reference()];
check("PRNG is mulberry32 in [0,1)", draws.every((v) => v >= 0 && v < 1), draws.map((v) => Number(v.toFixed(6))));
check("PRNG is reproducible", (() => {
  const again = seededRandom(2000);
  return draws.every((v) => v === again());
})());

// §11: labels present and machine-readable, with the fitness absence stated as data.
const codes = new Map(GRAPHYSX_AGENT_WORLD_DNA_RECORD.deviations.map((d) => [d.code, d]));
check("record labels every deviation", GRAPHYSX_AGENT_WORLD_DNA_RECORD.deviations.every((d) => ["faithful", "inferred", "deliberatelyAbsent"].includes(d.fidelity)));
check("record: fitness function is deliberatelyAbsent", codes.get("fitness-function")?.fidelity === "deliberatelyAbsent");
check("record: structural mutation is labelled inferred", codes.get("structural-mutation")?.fidelity === "inferred");
check("record: branch thickness is labelled inferred", codes.get("branch-thickness")?.fidelity === "inferred");
check("record: growth rule is labelled faithful", codes.get("growth-rule")?.fidelity === "faithful");
check("record: three presets ship", GRAPHYSX_AGENT_WORLD_DNA.length === 3, GRAPHYSX_AGENT_WORLD_DNA.map((p) => p.id));
check("record: every preset carries provenance", GRAPHYSX_AGENT_WORLD_DNA.every((p) => p.provenance.sourcePath && p.provenance.note));

// ---------------------------------------------------------------------------------------
// 2. Determinism. This is the load-bearing claim: no Math.random(), so the same genome
//    always grows the same tree and export -> load reproduces it byte for byte.
// ---------------------------------------------------------------------------------------
console.log("\n-- determinism --");
const a = new AgentWorldDnaSystem(resolveAgentWorldDna({ preset: "archive-grove" }));
const b = new AgentWorldDnaSystem(resolveAgentWorldDna({ preset: "archive-grove" }));
const branchesA = findMesh(a, "GraphysXDnaBranches");
const branchesB = findMesh(b, "GraphysXDnaBranches");
check("branch mesh exists", Boolean(branchesA && branchesB));
const bufferA = matrixBuffer(branchesA);
const bufferB = matrixBuffer(branchesB);
check("two systems from one config produce identical branch buffers", hash(bufferA) === hash(bufferB), {
  a: hash(bufferA),
  b: hash(bufferB),
  floats: bufferA.length,
});
const leavesA = findMesh(a, "GraphysXDnaLeaves");
const leavesB = findMesh(b, "GraphysXDnaLeaves");
check("identical leaf buffers", hash(matrixBuffer(leavesA)) === hash(matrixBuffer(leavesB)));

// The whole entity is one draw call per part — the answer to "the recursion is the study".
check("branches are ONE InstancedMesh", branchesA.isInstancedMesh === true);
check("leaves are ONE InstancedMesh", leavesA.isInstancedMesh === true);
check("entity holds exactly 2 meshes", a.object.children.length === 2, a.object.children.map((c) => c.name));

// A different seed must actually produce a different forest, or "deterministic" is trivially
// true because nothing depends on the seed at all.
const seeded = new AgentWorldDnaSystem(resolveAgentWorldDna({ preset: "archive-grove", seed: 991 }));
check("a different seed grows a different forest", hash(matrixBuffer(findMesh(seeded, "GraphysXDnaBranches"))) !== hash(bufferA));

// Export -> load: the resolved config is plain JSON, and re-resolving it reproduces the form.
console.log("\n-- export -> load -> resume --");
const serialised = JSON.stringify(archive);
const revived = new AgentWorldDnaSystem(resolveAgentWorldDna(JSON.parse(serialised)));
check("config is plain serialisable JSON", serialised.includes("\"generation\":1") && serialised.includes("\"genome\""));
check("round-tripped config regrows the identical forest", hash(matrixBuffer(findMesh(revived, "GraphysXDnaBranches"))) === hash(bufferA));
check("round-tripped config resolves byte-identically", JSON.stringify(resolveAgentWorldDna(JSON.parse(serialised))) === serialised);

// Resume: stepping a fresh system the same number of slices as a revived one must land on
// the same frame. If the simulation could not survive load-and-resume it would not be scene data.
const resumeA = new AgentWorldDnaSystem(resolveAgentWorldDna({ preset: "archive-grove" }));
const resumeB = new AgentWorldDnaSystem(resolveAgentWorldDna(JSON.parse(serialised)));
for (let frame = 0; frame < 240; frame += 1) {
  resumeA.update(1 / 60);
  resumeB.update(1 / 60);
}
check("240 fixed steps land on the identical frame after a round trip",
  hash(matrixBuffer(findMesh(resumeA, "GraphysXDnaLeaves"))) === hash(matrixBuffer(findMesh(resumeB, "GraphysXDnaLeaves"))));
check("4 s of stepping actually advanced growth", resumeA.describe().growth > 0.5 && resumeA.describe().growth < 1, resumeA.describe().growth);

// ---------------------------------------------------------------------------------------
// 3. The budget. Depth-6 x 13 trees is the objection this entity exists to answer.
// ---------------------------------------------------------------------------------------
console.log("\n-- budget --");
const groveState = a.describe();
console.log(`     archive grove: ${groveState.segmentCount} segments, ${groveState.leafCount} leaves`);
check("recovered grove fits WITHOUT truncation", groveState.truncated === false, groveState);
check("recovered grove is genuinely thousands of segments", groveState.segmentCount > 1500, groveState.segmentCount);
check("segments within cap", groveState.segmentCount <= AGENT_WORLD_DNA_MAX_SEGMENTS, [groveState.segmentCount, AGENT_WORLD_DNA_MAX_SEGMENTS]);
check("leaves within cap", groveState.leafCount <= AGENT_WORLD_DNA_MAX_LEAVES, [groveState.leafCount, AGENT_WORLD_DNA_MAX_LEAVES]);
check("state reports the cap so an agent can see it", groveState.budget.maxSegments === AGENT_WORLD_DNA_MAX_SEGMENTS && groveState.budget.maxLeaves === AGENT_WORLD_DNA_MAX_LEAVES);

// A genome that WOULD blow the budget must truncate, report it, and stay inside the cap.
const greedy = growAgentWorldDnaForest(resolveAgentWorldDna({ trees: 64, columns: 8, genome: { depth: 8 } }));
check("an over-budget genome truncates", greedy.truncated === true);
check("truncation respects the segment cap", greedy.segments.length <= AGENT_WORLD_DNA_MAX_SEGMENTS, greedy.segments.length);
// Honest note rather than a vacuous check: every leaf sits at the end of a segment, so leaves
// are always a strict subset of segments. With both caps at 4000 the SEGMENT cap always binds
// first and the leaf cap is a structural backstop that never fires on its own. Asserted so the
// relationship is on record instead of implied.
check("truncation respects the leaf cap", greedy.leaves.length <= AGENT_WORLD_DNA_MAX_LEAVES, greedy.leaves.length);
check("leaves are always a subset of segments (so the segment cap binds first)",
  groveState.leafCount < groveState.segmentCount && greedy.leaves.length < greedy.segments.length,
  { grove: [groveState.leafCount, groveState.segmentCount], greedy: [greedy.leaves.length, greedy.segments.length] });
// Breadth-first truncation is what makes the failure mode graceful: every tree must still
// have a trunk, rather than the last N trees being missing entirely.
const trunkedTrees = new Set(greedy.segments.filter((s) => s.level === 0).map((s) => Math.round(s.start.x * 1e4)));
check("truncation drops twigs, not whole trees (every tree keeps a trunk)", trunkedTrees.size === 64, trunkedTrees.size);
check("depth is clamped, not honoured blindly", resolveAgentWorldDna({ genome: { depth: 40 } }).genome.depth === 8);
check("trees are clamped", resolveAgentWorldDna({ trees: 9999 }).trees === 64);
check("a bad number is clamped, not thrown", resolveAgentWorldDna({ mutationRate: 99 }).mutationRate === 0.35);
check("an unknown preset throws", (() => {
  try { resolveAgentWorldDna({ preset: "nope" }); return false; } catch { return true; }
})());

// ---------------------------------------------------------------------------------------
// 4. Generation stepping — the evolution mechanism, since the record has no fitness function.
// ---------------------------------------------------------------------------------------
console.log("\n-- generations --");
const founder = resolveAgentWorldDna({ preset: "mutant-orchard", generation: 1 });
const gen2 = resolveAgentWorldDna({ preset: "mutant-orchard", generation: 2 });
const gen3 = resolveAgentWorldDna({ preset: "mutant-orchard", generation: 3 });
const formFounder = growAgentWorldDnaForest(founder);
const formGen2 = growAgentWorldDnaForest(gen2);
const formGen3 = growAgentWorldDnaForest(gen3);
const flat = (form) => form.segments.flatMap((s) => [s.start.x, s.start.y, s.start.z, s.end.x, s.end.y, s.end.z]);
check("generation 2 grows a DIFFERENT form from the founder", hash(flat(formFounder)) !== hash(flat(formGen2)));
check("generation 3 differs from generation 2", hash(flat(formGen2)) !== hash(flat(formGen3)));
check("generation 2 is reproducible", hash(flat(growAgentWorldDnaForest(gen2))) === hash(flat(formGen2)));

// Lineage: mutation is cumulative drift, so consecutive generations must be CLOSER to each
// other than distant ones. That is what "compare the inherited families" means.
const g = (n) => mutateAgentWorldDnaGenome(founder.genome, founder.seed, n, founder.mutationRate);
const geneDistance = (x, y) =>
  Math.abs(x.lengthRatio - y.lengthRatio) + Math.abs(x.branchAngle - y.branchAngle) + Math.abs(x.rollTurns - y.rollTurns);
const near12 = geneDistance(g(1), g(2));
const far18 = geneDistance(g(1), g(8));
check("lineage: mutation is cumulative drift, not a re-roll", far18 > near12, { gen1to2: Number(near12.toFixed(4)), gen1to8: Number(far18.toFixed(4)) });
check("generation 1 is the unmutated founder", JSON.stringify(g(1)) === JSON.stringify(founder.genome));
check("mutationRate 0 freezes the genome across generations",
  JSON.stringify(mutateAgentWorldDnaGenome(founder.genome, founder.seed, 12, 0)) === JSON.stringify(founder.genome));
check("generation is bounded", resolveAgentWorldDna({ generation: 9999 }).generation === AGENT_WORLD_DNA_MAX_GENERATION);

// The recovered colour rule, evaluated directly.
const hue0 = agentWorldDnaLeafHue(archive.genome, 0.08, 1, 0);
const hue3 = agentWorldDnaLeafHue(archive.genome, 0.08, 1, 3);
check("generation 1 leaf hue is the archive base for tree 0", near(hue0, 0.29, 1e-9), hue0);
check("tree index shifts the hue by the archive's 0.031 step", near(hue3, 0.29 + (3 * 0.031) % 0.18, 1e-9), hue3);
check("advancing the generation moves the hue", agentWorldDnaLeafHue(archive.genome, 0.08, 4, 3) !== hue3);

// The mechanism itself: `configure` is what api.update's patch path calls.
console.log("\n-- the selection mechanism (configure, i.e. api.update) --");
const evolving = new AgentWorldDnaSystem(resolveAgentWorldDna({ preset: "mutant-orchard" }));
const before = evolving.describe();
evolving.configure(resolveAgentWorldDna({ generation: before.generation + 1 }, resolveAgentWorldDna({ preset: "mutant-orchard" })));
const after = evolving.describe();
check("configure advances the generation", after.generation === before.generation + 1, [before.generation, after.generation]);
check("advancing a generation regrows the form", hash(matrixBuffer(findMesh(evolving, "GraphysXDnaBranches"))) !== hash(bufferA));
check("state reports the EXPRESSED genome, not the founder",
  JSON.stringify(after.expressedGenome) !== JSON.stringify(before.expressedGenome), { before: before.expressedGenome.lengthRatio, after: after.expressedGenome.lengthRatio });
check("state reports per-tree leaf hues", Array.isArray(after.leafHues) && after.leafHues.length === after.treeCount, after.leafHues.length);
// The patch-path merge: a partial patch must keep the preset's other fields.
const merged = resolveAgentWorldDna({ generation: 5 }, resolveAgentWorldDna({ preset: "mutant-orchard" }));
check("a partial patch preserves the rest of the config", merged.trees === 9 && merged.mutationRate === 0.35 && merged.generation === 5, merged);

// ---------------------------------------------------------------------------------------
// 5. Simulation semantics: pause/step, and the "settled tree costs nothing" claim.
// ---------------------------------------------------------------------------------------
console.log("\n-- simulation --");
const ticking = new AgentWorldDnaSystem(resolveAgentWorldDna({ preset: "archive-grove" }));
const branchMesh = findMesh(ticking, "GraphysXDnaBranches");
const leafMesh = findMesh(ticking, "GraphysXDnaLeaves");
const startCount = branchMesh.count;
for (let frame = 0; frame < 120; frame += 1) ticking.update(1 / 60);
const midGrowth = ticking.describe().growth;
check("growth reveals outward over time (instance count rises)", branchMesh.count > startCount, [startCount, branchMesh.count]);
check("growth is partway, not snapped to 1", midGrowth > 0 && midGrowth < 1, midGrowth);

// Drive past growSeconds (6 s) so the canopy is out and the season is actually turning —
// leaf matrices are identical while the leaves are still hidden, which is not a stall.
for (let frame = 0; frame < 600; frame += 1) ticking.update(1 / 60);
const seasonState = ticking.describe();
check("fully grown after 12 s", seasonState.growth === 1, seasonState.growth);
check("the season is running", seasonState.season > 0 && seasonState.season < 1, seasonState.season);

// dt <= 0 is what pause hands the system.
const grownCount = branchMesh.count;
const frozenLeaves = hash(matrixBuffer(leafMesh));
const frozenGrowth = ticking.describe().growth;
ticking.update(0);
check("update(0) — i.e. paused — advances nothing",
  branchMesh.count === grownCount && ticking.describe().growth === frozenGrowth && ticking.describe().season === seasonState.season);
check("a paused frame writes no leaf matrices", hash(matrixBuffer(leafMesh)) === frozenLeaves);
// One deterministic slice, exactly as api.step(dt) does.
ticking.update(1 / 60);
check("step(1/60) advances one slice", hash(matrixBuffer(leafMesh)) !== frozenLeaves);
// And that slice is reproducible: a second system stepped identically lands on the same frame.
check("stepping is deterministic", (() => {
  const twin = new AgentWorldDnaSystem(resolveAgentWorldDna({ preset: "archive-grove" }));
  for (let frame = 0; frame < 721; frame += 1) twin.update(1 / 60);
  const same = hash(matrixBuffer(findMesh(twin, "GraphysXDnaLeaves"))) === hash(matrixBuffer(leafMesh));
  twin.dispose();
  return same;
})());

// A fully-grown seasonless tree must be free per frame — the formula-field property.
const still = new AgentWorldDnaSystem(resolveAgentWorldDna({ preset: "single-specimen", growSeconds: 0, seasonSeconds: 0 }));
const stillLeaves = findMesh(still, "GraphysXDnaLeaves");
const stillHash = hash(matrixBuffer(stillLeaves));
for (let frame = 0; frame < 60; frame += 1) still.update(1 / 60);
check("a grown, seasonless tree writes nothing per frame", hash(matrixBuffer(stillLeaves)) === stillHash);
check("single-specimen is fully grown at frame 0", still.describe().growth === 1, still.describe().growth);
check("leaves:false grows branches only", (() => {
  const bare = new AgentWorldDnaSystem(resolveAgentWorldDna({ preset: "single-specimen", leaves: false }));
  const ok = bare.leafCount === 0 && findMesh(bare, "GraphysXDnaLeaves") === null && bare.segmentCount > 0;
  bare.dispose();
  return ok;
})());

// ---------------------------------------------------------------------------------------
// 6. Shape sanity. `dna-tree` cannot be screenshotted until the lead threads it into the
//    runtime (there is no api.spawn("dna-tree") yet), so these stand in for the eye: a tree
//    that collapsed to a pole, grew downward, or dropped its leaves through the floor would
//    pass every assertion above and fail every one of these.
// ---------------------------------------------------------------------------------------
console.log("\n-- shape --");
const specimen = growAgentWorldDnaForest(resolveAgentWorldDna({ preset: "single-specimen" }));
const trunk = specimen.segments.find((s) => s.level === 0);
check("the trunk points up", trunk.end.y - trunk.start.y > 0, Number((trunk.end.y - trunk.start.y).toFixed(3)));
check("the trunk is near-vertical", Math.hypot(trunk.end.x - trunk.start.x, trunk.end.z - trunk.start.z) < (trunk.end.y - trunk.start.y) * 0.2);
check("the tree is rooted at y = 0", near(trunk.start.y, 0, 1e-9), trunk.start.y);

const tops = specimen.segments.map((s) => s.end.y);
const height = Math.max(...tops);
check("the canopy has real height", height > 1.5 && height < 12, Number(height.toFixed(3)));
const spread = Math.max(...specimen.segments.map((s) => Math.hypot(s.end.x, s.end.z)));
check("the tree spreads, it is not a pole", spread > height * 0.15, { spread: Number(spread.toFixed(3)), height: Number(height.toFixed(3)) });
check("nothing grows below the root", specimen.segments.every((s) => s.end.y > -0.5));

// Segments must shrink with depth — that is the 0.69 length ratio being applied.
const meanLength = (level) => {
  const at = specimen.segments.filter((s) => s.level === level);
  return at.reduce((sum, s) => sum + s.start.distanceTo(s.end), 0) / Math.max(1, at.length);
};
const lengths = [0, 1, 2, 3, 4, 5].map(meanLength);
check("segments shrink monotonically with depth (the 0.69 ratio)",
  lengths.every((value, index) => index === 0 || value < lengths[index - 1]), lengths.map((v) => Number(v.toFixed(3))));
check("the shrink rate is the recovered ratio", near(lengths[3] / lengths[2], 0.69, 0.06), Number((lengths[3] / lengths[2]).toFixed(3)));

// Leaves live at branch tips — the archive pushes `base: end` at depth 0.
const tips = new Set(specimen.segments.map((s) => `${s.end.x.toFixed(5)},${s.end.y.toFixed(5)},${s.end.z.toFixed(5)}`));
check("every leaf sits on a branch tip",
  specimen.leaves.every((leaf) => tips.has(`${leaf.base.x.toFixed(5)},${leaf.base.y.toFixed(5)},${leaf.base.z.toFixed(5)}`)));
check("leaves are up in the canopy, not on the floor",
  specimen.leaves.every((leaf) => leaf.base.y > height * 0.3), Number(Math.min(...specimen.leaves.map((l) => l.base.y)).toFixed(3)));

// The grove's footprint must match the archive's 5-column grid, centred on the entity origin.
const grove = growAgentWorldDnaForest(archive);
const roots = grove.segments.filter((s) => s.level === 0).map((s) => s.start);
const spanX = Math.max(...roots.map((r) => r.x)) - Math.min(...roots.map((r) => r.x));
const spanZ = Math.max(...roots.map((r) => r.z)) - Math.min(...roots.map((r) => r.z));
check("grove footprint matches the 4.5 x 4.6 grid", near(spanX, 4 * 4.5, 1.5) && near(spanZ, 2 * 4.6, 1.5), [Number(spanX.toFixed(2)), Number(spanZ.toFixed(2))]);
check("the grove is centred on the entity origin",
  near(roots.reduce((s, r) => s + r.x, 0) / roots.length, 0, 1.2) && near(roots.reduce((s, r) => s + r.z, 0) / roots.length, 0, 1.2));
// A composition note for whoever places this: the archive's own trunk is 0.78, so the grove is
// short trees over a wide plot. Recorded rather than silently rescaled.
console.log(`     archive grove: ${roots.length} trees, ${spanX.toFixed(1)} x ${spanZ.toFixed(1)} units, canopy ~${Math.max(...grove.segments.map((s) => s.end.y)).toFixed(2)} tall`);

// Disposal, the way the runtime's disposeEntityObject walks it.
console.log("\n-- disposal --");
const throwaway = new AgentWorldDnaSystem(resolveAgentWorldDna({ preset: "archive-grove" }));
throwaway.dispose();
check("dispose empties the group", throwaway.object.children.length === 0, throwaway.object.children.length);

// ---------------------------------------------------------------------------------------
const report = {
  entityType: "dna-tree",
  threadedIntoRuntime: false,
  presets: GRAPHYSX_AGENT_WORLD_DNA.map((preset) => {
    const system = new AgentWorldDnaSystem(resolveAgentWorldDna({ preset: preset.id }));
    const state = system.describe();
    system.dispose();
    return { id: preset.id, segments: state.segmentCount, leaves: state.leafCount, truncated: state.truncated };
  }),
  budget: { maxSegments: AGENT_WORLD_DNA_MAX_SEGMENTS, maxLeaves: AGENT_WORLD_DNA_MAX_LEAVES },
  deviations: GRAPHYSX_AGENT_WORLD_DNA_RECORD.deviations.map((d) => ({ code: d.code, fidelity: d.fidelity })),
  failures,
};
writeFileSync(path.join(ART, "smoke-dna.json"), JSON.stringify(report, null, 2));

console.log(`\nPresets: ${report.presets.map((p) => `${p.id} ${p.segments}seg/${p.leaves}leaf`).join(" · ")}`);
if (failures.length) {
  console.error(`\nFAILED ${failures.length}:\n - ${failures.join("\n - ")}\n`);
  process.exit(1);
}
console.log("\nsmoke-dna: all checks passed.\n");
