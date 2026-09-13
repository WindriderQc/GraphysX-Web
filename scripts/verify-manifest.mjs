import { parseArgs } from "node:util";
import { parseVerifyShard, planVerifyShards } from "./verify-shards.mjs";

// Release inventory shared by the runner and project counts; importing it starts no work.
export const VERIFY_STATIC_CHECKS = {
  unit: { command: "node", args: ["--test", "test/*.test.mjs"] },
  typecheck: { command: "npx", args: ["tsc", "--noEmit"] },
  lint: { command: "npx", args: ["eslint", ".", "--max-warnings", "0"] },
  build: { command: "npx", args: ["vite", "build"] },
  "rapier-heightfield": { command: "node", args: ["scripts/probe-rapier-heightfield.mjs"] },
  "rapier-materials": { command: "node", args: ["scripts/probe-rapier-material-parity.mjs"] },
};

export const VERIFY_SMOKES = [
  { name: "llmx-creation", tier: "apps", script: "scripts/smoke-llmx-creation.mjs", covers: "Native scene proposals and exact receipts, stale edits, math quantities/undo, named saves and isolated Family worlds" },
  { name: "llmx-conversation", tier: "apps", script: "scripts/smoke-llmx-conversation.mjs", covers: "Private-session text/opening, explicit audio choice, stale callbacks, interruption, recovery and exact-voice replay with intercepted transport" },
  { name: "llmx", tier: "apps", script: "scripts/smoke-llmx.mjs", covers: "Forge appearance lifecycle, save/reload, reduced motion, immediate camera, environment selection and Center return" },
  { name: "startup", tier: "core", script: "scripts/smoke-startup.mjs", covers: "renderer and lazy-import failures: accessible recovery page and working retry" },
  { name: "showroom", tier: "core", script: "scripts/smoke-showroom.mjs", covers: "default route: welcome showroom, gated editor, auto-orbit" },
  { name: "editor", tier: "core", script: "scripts/smoke-editor.mjs", covers: "editor: library palette, model + texture + behaviour, bloom authoring, exit path" },
  { name: "top20", tier: "deep", script: "scripts/smoke-top20.mjs", covers: "top-20 release: redo, draft recovery, import/copy/slots/palette, shelf personalization, accessible display, touch/gamepad/pause/fullscreen" },
  { name: "standalone", tier: "core", script: "scripts/smoke-standalone.mjs", covers: "?host=standalone: agent API, tool bridge, human editor" },
  { name: "levels", tier: "core", script: "scripts/smoke-levels.mjs", covers: "levels workbench: paint, fill, ASCII round trip, undo, create" },
  { name: "scene-store", tier: "deep", script: "scripts/smoke-scene-store.mjs", covers: "?scene=: stored scene loads, outside agent edits land in the tab" },
  { name: "scene-command-validation", tier: "core", script: "scripts/smoke-scene-command-validation.mjs", covers: "untrusted scene commands: strict ids/types/configs/references, runtime-parity merges, atomic rejection, cumulative budgets" },
  { name: "triggers", tier: "core", script: "scripts/smoke-triggers.mjs", covers: "trigger volumes: enter/exit events, interactions fire, no collision response" },
  { name: "roundtrip", tier: "core", script: "scripts/smoke-roundtrip.mjs", covers: "write-only-state sweep: every settable v2 property set then read back through state/export/reload/object" },
  { name: "rules", tier: "core", script: "scripts/smoke-rules.mjs", covers: "rules layer: ordered checkpoints, laps, sim-time clock, document round-trip, dropped -> resync" },
  { name: "ballz", tier: "apps", script: "scripts/smoke-ballz.mjs", covers: "levels.play(): grid materialises, ball rests, walls stop it, gate + ring fire" },
  { name: "games", tier: "apps", script: "scripts/smoke-games.mjs", covers: "front door: showroom -> Games shelf -> playing a level -> back" },
  { name: "archive-cup", tier: "apps", script: "scripts/smoke-archive-cup.mjs", covers: "nine-round campaign: persistent unlocks, medal totals, personal ghost, return to standings" },
  { name: "overlay", tier: "apps", script: "scripts/smoke-overlay.mjs", covers: "2D overlay layer: off by default, one shared loop, draws over 3D, round-trips" },
  { name: "surfaces", tier: "apps", script: "scripts/smoke-surfaces.mjs", covers: "generative surfaces: off by default, one shared loop (surfaceRedraws tracks frames), scene data round-trip, retune + remove" },
  { name: "archive-levels", tier: "apps", script: "scripts/smoke-archive-levels.mjs", covers: "recovered BallZ arenas: census fidelity, containment, reachable, completable" },
  { name: "spiral", tier: "apps", script: "scripts/smoke-spiral.mjs", covers: "Skybox Spiral port: composes, ball rests, movers move, markerless light, completable, round-trips" },
  { name: "world1", tier: "apps", script: "scripts/smoke-world1.mjs", covers: "World 1 mesh port: six meshes ready, physics-only descent through both holes, elevator moves, completable" },
  { name: "vehicles", tier: "apps", script: "scripts/smoke-vehicles.mjs", covers: "Archive Garage: recovered meshes register, ship in dist, and resolve" },
  { name: "playgrounds", tier: "apps", script: "scripts/smoke-playgrounds.mjs", covers: "Nature Lab playgrounds: preset fidelity, fields do work, mass-independent attraction" },
  { name: "milkyway", tier: "apps", script: "scripts/smoke-milkyway.mjs", covers: "Voie Lactee: recovered radii and rates, retrograde Moon, textures fetch 200" },
  { name: "buildings", tier: "apps", script: "scripts/smoke-buildings.mjs", covers: "Maison massing model: archive transforms exact, recovered lamps, storey toggle" },
  { name: "media", tier: "apps", script: "scripts/smoke-media.mjs", covers: "media library: datalake browse/import, in-browser OBJ conversion, editor Media tab + dialog" },
  { name: "physics", tier: "apps", script: "scripts/smoke-physics.mjs", covers: "physics migration baseline: contacts, fixed-step schedules, sleep/wake, teardown/reload" },
  { name: "joints", tier: "apps", script: "scripts/smoke-joints.mjs", covers: "scene-authored fixed/revolute/rope joints: motion, bridge parity, patch, undo, export/reload" },
  { name: "ev3-lab-scene", tier: "apps", script: "scripts/smoke-ev3-lab-scene.mjs", covers: "EV3 scene composition, seven construction families and mission zones, public steering/rules, gripper/launch interactions, materials and round-trip" },
  { name: "ev3-lab-drive", tier: "apps", script: "scripts/smoke-ev3-lab-drive.mjs", covers: "First Drive CAD, wheels and workbench; arrival UI, real red/blue crossings, held-Go success, native touch capture/release and scoped context menus" },
  { name: "ev3-lab-program", tier: "apps", script: "scripts/smoke-ev3-lab-program.mjs", covers: "Simple block authoring, measured Stop explanation, limits/undo, real-time and deterministic success, repeated physical/visual turns and 320/390 portrait completion" },
  { name: "ev3-programs", tier: "apps", script: "scripts/smoke-ev3-programs.mjs", covers: "KidX named programs: save/reload/replay, update/copy/delete, unsaved edits and storage failure" },
  { name: "ev3-program-layout", tier: "apps", script: "scripts/smoke-ev3-program-layout.mjs", covers: "KidX saved programs at 1280x720: touch targets, overflow, keyboard focus trap, Escape and focus restoration" },
  { name: "ev3-program-layout-compact", tier: "apps", script: "scripts/smoke-ev3-program-layout-compact.mjs", covers: "KidX saved programs at 800x480, 320x844 and 390x844: desktop-to-compact resize, touch targets, overflow, keyboard focus trap, Escape and focus restoration" },
  // Preserve all KidX assertions in independent journeys; the combined scripts exceeded
  // the existing ten-minute bound on the Linux software-WebGL runner (run 34604715964).
  { name: "kidx-missions-start", tier: "apps", script: "scripts/smoke-kidx-missions-start.mjs", covers: "First French mission: arrival guidance, real block controls and physical completion" },
  { name: "kidx-missions-turns", tier: "apps", script: "scripts/smoke-kidx-missions-turns.mjs", covers: "French left/right missions: ordered block controls and real physical turns" },
  { name: "kidx-missions-checkpoints", tier: "apps", script: "scripts/smoke-kidx-missions-checkpoints.mjs", covers: "Delivery and return missions: real routes and mandatory checkpoints" },
  { name: "kidx-workshop-reader", tier: "apps", script: "scripts/smoke-kidx-workshop-reader.mjs", covers: "LEGO catalog, PDF input/rendering, paging/zoom, reading progress and rejected malformed normals" },
  { name: "kidx-workshop-track3r", tier: "apps", script: "scripts/smoke-kidx-workshop-track3r.mjs", covers: "TRACK3R: native CAD normals, steps/highlights, explode/reassemble, rotate/zoom, resume and responsive controls" },
  { name: "kidx-workshop-spike3r", tier: "apps", script: "scripts/smoke-kidx-workshop-spike3r.mjs", covers: "SPIK3R: native CAD normals, steps/highlights, explode/reassemble, rotate/zoom, resume and responsive controls" },
  { name: "kidx-challenges-mechanical", tier: "apps", script: "scripts/smoke-kidx-challenges-mechanical.mjs", covers: "Reverse parking and cargo: real motor movement, cargo physics, stop, reset and achievements" },
  { name: "kidx-challenges-distance-ramp", tier: "apps", script: "scripts/smoke-kidx-challenges-distance-ramp.mjs", covers: "Distance-triggered return and physical ramp climb, checkpoints, stop and reset" },
  { name: "kidx-challenges-color-touch", tier: "apps", script: "scripts/smoke-kidx-challenges-color-touch.mjs", covers: "Color/contact sensors cause real reverse journeys; checkpoints, stop, reset and achievements" },
  { name: "kidx-interactive-program", tier: "apps", script: "scripts/smoke-kidx-interactive-program.mjs", covers: "Nested programs, save/reload, actual physical step/pause/resume and mission completion" },
  { name: "kidx-interactive-drive", tier: "apps", script: "scripts/smoke-kidx-interactive-drive.mjs", covers: "Sound, low-power keyboard reverse, LCD meters, keyboard release, emergency stop and compact controls" },
  { name: "kidx-interactive-construction", tier: "apps", script: "scripts/smoke-kidx-interactive-construction.mjs", covers: "CAD insertion, French Nestor controls, two-browser build handoff, 3:1 gears and compact layouts" },
  { name: "kidx-guidance-arrival", tier: "apps", script: "scripts/smoke-kidx-guidance-arrival.mjs", covers: "Arrival reading time, non-attempt physics frame, 320/390/800 layouts, focus and laboratory hints" },
  { name: "kidx-guidance-attempt", tier: "apps", script: "scripts/smoke-kidx-guidance-attempt.mjs", covers: "Child-authored blocks, exploration, real attempt/review, completion, retry and held-drive guidance" },
  { name: "kidx-guidance-laboratory", tier: "apps", script: "scripts/smoke-kidx-guidance-laboratory.mjs", covers: "Sensor mission laboratory handoff, empty saved slot, example/run, compact reachability and stop" },
  { name: "kidx-debrief-review", tier: "apps", script: "scripts/smoke-kidx-debrief-review.mjs", covers: "Measured short journey, four viewports, reachable dialog controls, progressive hints, frozen physics/time, focus and immutable last attempt" },
  { name: "kidx-debrief-turns", tier: "apps", script: "scripts/smoke-kidx-debrief-turns.mjs", covers: "New attempt clears the old report, immediate stop, unplayed blocks, actual red crossings and turns, block selection and measured direction" },
  { name: "kidx-debrief-outcomes", tier: "apps", script: "scripts/smoke-kidx-debrief-outcomes.mjs", covers: "Physical success and footprint overlap, unused instructions, reset, six stationary blocks, bounded map labels, Drive/exit disposal and advanced-mission scope" },
  { name: "ballz18-sky", tier: "apps", script: "scripts/smoke-ballz18-sky.mjs", covers: "exact authored 2048px BallZ18 sky: release manifest, six SHA-256 hashes, decode, orientation, scene application" },
  { name: "scenenet-xml", tier: "apps", script: "scripts/smoke-scenenet-xml.mjs", covers: "SceneNET v1.0/v1.1/v1.2/split-enum import-export-import, deterministic XML, structured loss warnings, ambiguity rejection, editor download" },
  { name: "mesh-colliders", tier: "apps", script: "scripts/smoke-mesh-colliders.mjs", covers: "scene-native model colliders: Great Slide trimesh, dynamic convex hull, rejection, bridge + round-trip" },
  { name: "great-slide", tier: "apps", script: "scripts/smoke-great-slide.mjs", covers: "Great Slide gravity run: Games launch, exact collider gate, subject controls, checkpoints, results, replay + return" },
  { name: "map1", tier: "apps", script: "scripts/smoke-map1.mjs", covers: "Map 1 gravity descent: Games launch, exact recovered collider, halfway gate, results, replay + return" },
  { name: "level1-2011", tier: "apps", script: "scripts/smoke-level1-2011.mjs", covers: "Level1 2011 at 1:1: largest mesh under scene envelope, exact trimesh, two gates in order, results, replay + return" },
  { name: "suzanne-machinery", tier: "apps", script: "scripts/smoke-suzanne-machinery.mjs", covers: "Suzanne machinery: eight vendored meshes, moving convex colliders, exact 12-point route, completable" },
  { name: "suzanne1", tier: "apps", script: "scripts/smoke-suzanne1.mjs", covers: "Suzanne 1 ASCII arena: archive census, dynamic walls, piston moves, completable over 3 laps, round-trips" },
  { name: "suzanne2", tier: "apps", script: "scripts/smoke-suzanne2.mjs", covers: "Suzanne 2 ASCII/XML arena: archive census, vendored meshes, moving piston, any 2 of 15 rings, round-trip" },
  { name: "day-night", tier: "apps", script: "scripts/smoke-day-night.mjs", covers: "scene-native archive atmosphere: source curves, authored sky/HDRI endpoints, deterministic pause/step, round-trip" },
  { name: "meshlight", tier: "apps", script: "scripts/smoke-meshlight.mjs", covers: "meshlight.shade: vendored HLSL, compiled parallax/Lyon translation, exact Room 2 maps, live patch + round-trip" },
  { name: "ppl", tier: "apps", script: "scripts/smoke-ppl.mjs", covers: "ppl.shade: exact HLSL + ball normal, compiled parallax/Lambert translation, active ring binding, live patch + round-trip" },
  { name: "level3", tier: "apps", script: "scripts/smoke-level3.mjs", covers: "Archive Level 3 v2: exact ASCII catwalk census, Alien02 catch floor, NightSky, LINE gates, three laps, round-trip" },
  { name: "product-assets", tier: "core", script: "scripts/audit-product-assets.mjs", covers: "release completeness: every /assets URL a product-reachable module names ships in the production manifest, with a reasoned allowlist" },
  { name: "results-browser", tier: "deep", script: "scripts/smoke-results-browser.mjs", covers: "results through the product: no request at all without a store, token-gated submission, leaderboard read + rendered panel with legible text and trust label, rival ghost download and playback" },
  { name: "asset-guard", tier: "core", script: "scripts/smoke-asset-guard.mjs", covers: "asset-guard fixtures: a missing asset fails, a registered asset passes, base paths/globs/templates/externals are classified, type-only vs runtime edges" },
  { name: "previews", tier: "core", script: "scripts/audit-previews.mjs", covers: "preview registry: every workshop harness is registered, and every mountable one uses the shared renderer and the shared frame loop" },
  { name: "store-auth", tier: "deep", script: "scripts/smoke-store-auth.mjs", covers: "store auth: token gate on writes + datalake, CORS allowlist, tokenless compat mode" },
  { name: "live-sessions", tier: "deep", script: "scripts/smoke-live-sessions.mjs", covers: "live sessions: owner + remote editor + agent on one scene, incremental attributed ops, roles, duplicates, conflicts, reconnect/resume/resync, teardown" },
  { name: "live-sessions-browser", tier: "deep", script: "scripts/smoke-live-sessions-browser.mjs", localOnly: true, longDeadline: true, covers: "live sessions through the product: observer boundary, scene-native AgentX presence, Nestor accepted-operation reaction, reconnect and cleanup" },
  { name: "live-sessions-security", tier: "deep", script: "scripts/smoke-live-sessions-security.mjs", covers: "live session security: fail-closed without a store token, cross-session + forged credentials, expired/revoked invites, origin rejection, one-shot stream tickets, payload/rate caps, concurrent burst consistency, token-leak audit" },
  { name: "live-undo", tier: "deep", script: "scripts/smoke-live-undo.mjs", covers: "collaborative undo: inverse operations appended not rewound, refusal when a later actor touched the same entities, own-operation-only, parent/child restore, non-invertible refusal, viewer denial" },
  { name: "results", tier: "deep", script: "scripts/smoke-results.mjs", covers: "results: persistent bests, compatibility-separated leaderboards with client-attested trust labels, deterministic ordering and bounds, shared ghost round-trip, and refusal of desynced/incomplete/implausible/oversized/unsorted submissions" },
  { name: "dna", tier: "apps", script: "scripts/smoke-dna.mjs", covers: "DNA forest: deterministic genome drift, preset fidelity, node-level (no browser)" },
];

// Validate the requested coverage before the runner takes the lock, clears artifacts or
// starts a child. A misspelled tier used to select no smokes and still report success.
export function resolveVerifyOptions(args, env = process.env) {
  const { values } = parseArgs({
    args,
    options: {
      tier: { type: "string" },
      shard: { type: "string" },
      checks: { type: "string" },
      base: { type: "string" },
      "no-build": { type: "boolean", default: false },
      wait: { type: "boolean", default: false },
      "force-lock": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  const availableTiers = new Set(VERIFY_SMOKES.map((smoke) => smoke.tier));
  const tiers = values.tier === undefined ? null : new Set(values.tier.split(",").map((tier) => tier.trim()));
  if (tiers && [...tiers].some((tier) => !availableTiers.has(tier))) {
    throw new Error(`--tier must name one or more of: ${[...availableTiers].join(", ")}; received ${JSON.stringify(values.tier)}.`);
  }

  const externalBase = values.base ?? (env.SMOKE_BASE || null);
  if (externalBase !== null) {
    let url;
    try { url = new URL(externalBase); } catch { /* Report the option, without echoing credentials. */ }
    if (!url || !["http:", "https:"].includes(url.protocol)) {
      throw new Error("--base / SMOKE_BASE must be an absolute HTTP(S) URL.");
    }
  }
  const shard = values.shard === undefined ? null : parseVerifyShard(values.shard, VERIFY_SMOKES.length);
  if (values.checks !== undefined && (tiers || shard || externalBase)) {
    throw new Error("--checks cannot be combined with --tier, --shard or an external base.");
  }
  const checks = values.checks === undefined ? null : new Set(values.checks === "none" ? [] : values.checks.split(","));
  if (checks && [...checks].some((name) => !VERIFY_SMOKES.some((smoke) => smoke.name === name))) {
    throw new Error("--checks must contain registered smoke names, or the explicit value none for static checks only.");
  }
  if (shard && (tiers || externalBase)) {
    throw new Error("--shard cannot be combined with --tier or an external base; shards partition the complete local inventory.");
  }
  const smokes = shard
    ? planVerifyShards(VERIFY_SMOKES, shard.count)[shard.index - 1].smokes
    : VERIFY_SMOKES.filter((smoke) => checks ? checks.has(smoke.name) : !tiers || tiers.has(smoke.tier));
  return {
    smokes,
    shard,
    checks,
    tiers,
    externalBase,
    noBuild: values["no-build"],
    wait: values.wait,
    forceLock: values["force-lock"],
    help: values.help,
    fullRelease: !shard && !externalBase && !values["no-build"] && smokes.length === VERIFY_SMOKES.length,
  };
}
