// Persistent best times, leaderboards and shared ghosts.
//
// The assertions that matter most here are the refusals. A leaderboard is only worth having
// if the things that should not be on it are not on it: desynced runs, incomplete runs,
// impossible times, times set on a different version of the course, and ghost recordings
// that do not describe the run they claim.
//
// The trust label is asserted on every read surface. This layer is client-attested and says
// so; a future change that starts implying otherwise should fail here.

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startSceneStore } from "../server/scene-store.mjs";
import { GHOST_MAX_SAMPLES } from "../server/ghost-trace.mjs";
import { check, report } from "./live-session-harness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOKEN = "results-smoke-token";
const COURSE = "archive-ballz-level1";
const V1 = "level:archive-ballz-level1@3";
const V2 = "level:archive-ballz-level1@4";
const RULES = "rules-fingerprint-a";
const RULES_B = "rules-fingerprint-b";

const results = [];
let store = null;
let dir = null;

/** A valid trace: strictly ascending times, finite triples, ending at the run's duration. */
const trace = (elapsedMs, samples = 8) => ({
  elapsedMs,
  samples: Array.from({ length: samples }, (_, index) => ({
    tMs: Math.round((index * elapsedMs) / (samples - 1)),
    position: [index * 0.5, 1.2, -index * 0.25],
  })),
});

try {
  dir = await mkdtemp(path.join(tmpdir(), "graphysx-results-"));
  store = await startSceneStore({ port: 0, dir, token: TOKEN, origins: null, datalakeDir: null });
  const base = store.url;

  const post = async (body, token = TOKEN) => {
    const response = await fetch(`${base}/results`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  };
  const get = async (suffix) => {
    const response = await fetch(`${base}${suffix}`);
    return { status: response.status, body: await response.json().catch(() => null) };
  };

  const run = (overrides = {}) => ({
    recordId: COURSE,
    actorId: "ada",
    label: "Ada",
    courseVersion: V1,
    rulesVersion: RULES,
    elapsedMs: 42_000,
    medal: "silver",
    outcome: "complete",
    desynced: false,
    resyncs: 0,
    ...overrides,
  });

  // --- 1. authorisation ------------------------------------------------------------------

  const anonymous = await post(run(), null);
  check(results, "recording a result without the store token -> 401", anonymous.status === 401, `status ${anonymous.status}`);

  // --- 2. personal best ------------------------------------------------------------------

  const first = await post(run({ elapsedMs: 42_000, ghost: trace(42_000) }));
  check(results, "a valid result is recorded", first.status === 201 && first.body.improved === true, `status ${first.status} ${JSON.stringify(first.body).slice(0, 200)}`);
  check(results, "the receipt reports it as a new best", first.body.isNewBest === true && first.body.bestMs === 42_000, JSON.stringify(first.body));
  check(results, "the receipt is labelled client-attested", first.body.trust === "client-attested", String(first.body.trust));
  check(results, "a valid ghost is stored with the best", first.body.ghostStored === true);

  const slower = await post(run({ elapsedMs: 55_000, ghost: trace(55_000) }));
  check(results, "a slower result is accepted but does not replace the best",
    slower.status === 201 && slower.body.improved === false && slower.body.bestMs === 42_000, JSON.stringify(slower.body));

  const faster = await post(run({ elapsedMs: 38_500, medal: "gold", ghost: trace(38_500) }));
  check(results, "a faster result replaces the best",
    faster.body.improved === true && faster.body.bestMs === 38_500 && faster.body.previousBestMs === 42_000, JSON.stringify(faster.body));

  const personal = await get(`/results/${COURSE}/personal/ada?courseVersion=${encodeURIComponent(V1)}&rulesVersion=${RULES}`);
  check(results, "the personal best persists and carries its medal",
    personal.status === 200 && personal.body.bestMs === 38_500 && personal.body.medal === "gold", JSON.stringify(personal.body));

  const slowerGhost = await get(`/results/${COURSE}/ghost/ada?courseVersion=${encodeURIComponent(V1)}&rulesVersion=${RULES}`);
  check(results, "the stored ghost is the one from the best run, not the last run",
    slowerGhost.body.ghost.elapsedMs === 38_500, String(slowerGhost.body.ghost.elapsedMs));

  // --- 3. refusals -----------------------------------------------------------------------

  const desynced = await post(run({ actorId: "mallory", elapsedMs: 1_000, desynced: true }));
  check(results, "a desynchronised run is refused", desynced.status === 422 && desynced.body.code === "result-desynced", `status ${desynced.status}`);

  const incomplete = await post(run({ actorId: "mallory", outcome: "timeout" }));
  check(results, "an unfinished run is refused", incomplete.status === 422 && incomplete.body.code === "result-incomplete", `status ${incomplete.status}`);

  const impossible = await post(run({ actorId: "mallory", elapsedMs: 12 }));
  check(results, "an impossibly fast time is refused", impossible.status === 422 && impossible.body.code === "result-implausible", `status ${impossible.status}`);

  const belowFloor = await post(run({ actorId: "mallory", elapsedMs: 5_000, floorMs: 20_000 }));
  check(results, "a time faster than the course's declared floor is refused",
    belowFloor.status === 422 && belowFloor.body.code === "result-implausible", `status ${belowFloor.status}`);

  const endless = await post(run({ actorId: "mallory", elapsedMs: 7 * 60 * 60 * 1000 }));
  check(results, "an implausibly long run is refused", endless.status === 422, `status ${endless.status}`);

  const fractional = await post(run({ actorId: "mallory", elapsedMs: 42_000.5 }));
  check(results, "a non-integer time is refused", fractional.status === 400, `status ${fractional.status}`);

  const badMedal = await post(run({ actorId: "mallory", medal: "platinum" }));
  check(results, "an unknown medal is refused", badMedal.status === 400, `status ${badMedal.status}`);

  const badActor = await post(run({ actorId: "../../etc/passwd" }));
  check(results, "a traversal-shaped actor id is refused", badActor.status === 400, `status ${badActor.status}`);

  const badCourse = await post(run({ recordId: "../escape" }));
  check(results, "a traversal-shaped recordId is refused", badCourse.status === 400, `status ${badCourse.status}`);

  const stillClean = await get(`/results/${COURSE}/leaderboard?courseVersion=${encodeURIComponent(V1)}&rulesVersion=${RULES}`);
  check(results, "no refused submission reached the board",
    stillClean.body.entries.every((entry) => entry.actorId !== "mallory"), JSON.stringify(stillClean.body.entries.map((e) => e.actorId)));

  // --- 4. ghost validation ---------------------------------------------------------------

  const shortGhost = await post(run({ actorId: "bo", elapsedMs: 40_000, ghost: { elapsedMs: 40_000, samples: [{ tMs: 0, position: [0, 0, 0] }] } }));
  check(results, "a one-sample ghost is refused", shortGhost.status === 422 && shortGhost.body.code === "ghost-rejected", `status ${shortGhost.status}`);

  const unsorted = await post(run({ actorId: "bo", elapsedMs: 40_000, ghost: {
    elapsedMs: 40_000,
    samples: [{ tMs: 0, position: [0, 0, 0] }, { tMs: 900, position: [1, 0, 0] }, { tMs: 400, position: [2, 0, 0] }],
  } }));
  check(results, "a ghost whose samples go backwards in time is refused",
    unsorted.status === 422 && /advance in time/.test(unsorted.body.error ?? ""), unsorted.body?.error ?? `status ${unsorted.status}`);

  const nonFinite = await post(run({ actorId: "bo", elapsedMs: 40_000, ghost: {
    elapsedMs: 40_000,
    samples: [{ tMs: 0, position: [0, 0, 0] }, { tMs: 900, position: [1, null, 0] }],
  } }));
  check(results, "a ghost with a non-finite coordinate is refused", nonFinite.status === 422, `status ${nonFinite.status}`);

  const mismatched = await post(run({ actorId: "bo", elapsedMs: 40_000, ghost: trace(9_000) }));
  check(results, "a ghost whose duration disagrees with the submitted time is refused",
    mismatched.status === 422 && /does not match/.test(mismatched.body.error ?? ""), mismatched.body?.error ?? `status ${mismatched.status}`);

  const oversizedSamples = await post(run({ actorId: "bo", elapsedMs: 40_000, ghost: {
    elapsedMs: 40_000,
    samples: Array.from({ length: GHOST_MAX_SAMPLES + 10 }, (_, index) => ({ tMs: index, position: [0, 0, 0] })),
  } }));
  check(results, "a ghost over the sample cap is refused", oversizedSamples.status === 422, `status ${oversizedSamples.status}`);

  const oversizedBody = await fetch(`${base}/results`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(run({ actorId: "bo", label: "x".repeat(2 * 1024 * 1024) })),
  });
  check(results, "an oversized submission body -> 413", oversizedBody.status === 413, `status ${oversizedBody.status}`);

  // A valid result whose ghost was refused must not have been half-recorded.
  const boUnrecorded = await get(`/results/${COURSE}/personal/bo?courseVersion=${encodeURIComponent(V1)}&rulesVersion=${RULES}`);
  check(results, "a submission with a bad ghost recorded nothing at all", boUnrecorded.status === 404, `status ${boUnrecorded.status}`);

  // --- 5. compatibility separation ---------------------------------------------------------

  const otherCourseVersion = await post(run({ actorId: "ada", courseVersion: V2, elapsedMs: 1_000 + 250 }));
  check(results, "a time on a different course version is accepted onto its own board", otherCourseVersion.status === 201);
  const v1Board = await get(`/results/${COURSE}/leaderboard?courseVersion=${encodeURIComponent(V1)}&rulesVersion=${RULES}`);
  check(results, "a faster time on another course version does not touch this board",
    v1Board.body.entries[0].bestMs === 38_500, String(v1Board.body.entries[0]?.bestMs));
  const v2Board = await get(`/results/${COURSE}/leaderboard?courseVersion=${encodeURIComponent(V2)}&rulesVersion=${RULES}`);
  check(results, "the other course version has its own separate board",
    v2Board.body.total === 1 && v2Board.body.entries[0].bestMs === 1_250, JSON.stringify(v2Board.body.entries));

  const otherRules = await post(run({ actorId: "ada", rulesVersion: RULES_B, elapsedMs: 900 + 250 }));
  check(results, "changed rules separate the board too", otherRules.status === 201);
  const stillV1 = await get(`/results/${COURSE}/leaderboard?courseVersion=${encodeURIComponent(V1)}&rulesVersion=${RULES}`);
  check(results, "a time under different rules does not beat this board",
    stillV1.body.entries[0].bestMs === 38_500, String(stillV1.body.entries[0]?.bestMs));

  // --- 6. leaderboard ordering, bounds and trust -------------------------------------------

  const field = [
    { actorId: "cy", elapsedMs: 31_000 },
    { actorId: "di", elapsedMs: 45_000 },
    { actorId: "eve", elapsedMs: 31_000 },
    { actorId: "fay", elapsedMs: 29_000 },
  ];
  for (const entry of field) await post(run({ ...entry, ghost: trace(entry.elapsedMs) }));
  // Recorded without a ghost, so there is an actor whose absent ghost can be asked for.
  await post(run({ actorId: "gus", elapsedMs: 50_000 }));

  const board = await get(`/results/${COURSE}/leaderboard?courseVersion=${encodeURIComponent(V1)}&rulesVersion=${RULES}`);
  check(results, "the leaderboard is ordered fastest first",
    board.body.entries.map((entry) => entry.bestMs).join(",") === "29000,31000,31000,38500,45000,50000",
    board.body.entries.map((entry) => `${entry.actorId}:${entry.bestMs}`).join(","));
  check(results, "ranks are assigned in order", board.body.entries.every((entry, index) => entry.rank === index + 1));
  check(results, "equal times keep a deterministic order",
    board.body.entries[1].actorId === "cy" && board.body.entries[2].actorId === "eve",
    board.body.entries.map((entry) => entry.actorId).join(","));

  const repeat = await get(`/results/${COURSE}/leaderboard?courseVersion=${encodeURIComponent(V1)}&rulesVersion=${RULES}`);
  check(results, "the ordering is stable across calls",
    JSON.stringify(repeat.body.entries) === JSON.stringify(board.body.entries));

  const limited = await get(`/results/${COURSE}/leaderboard?courseVersion=${encodeURIComponent(V1)}&rulesVersion=${RULES}&limit=2`);
  check(results, "a leaderboard limit is honoured", limited.body.entries.length === 2, String(limited.body.entries.length));
  const overLimit = await get(`/results/${COURSE}/leaderboard?courseVersion=${encodeURIComponent(V1)}&rulesVersion=${RULES}&limit=9999`);
  check(results, "a caller cannot ask for an unbounded leaderboard", overLimit.body.entries.length <= 50, String(overLimit.body.entries.length));

  check(results, "the leaderboard is labelled client-attested",
    board.body.trust === "client-attested" && /not replayed or verified/.test(board.body.trustNote ?? ""), String(board.body.trust));
  check(results, "no read surface claims a time is server-verified",
    !JSON.stringify(board.body).includes("server-verified") && !JSON.stringify(personal.body).includes("verified: true"));
  check(results, "the leaderboard marks which entries have a shareable ghost",
    board.body.entries.find((entry) => entry.actorId === "fay")?.hasGhost === true,
    JSON.stringify(board.body.entries.map((e) => [e.actorId, e.hasGhost])));

  // --- 7. ghost round trip ------------------------------------------------------------------

  const downloaded = await get(`/results/${COURSE}/ghost/fay?courseVersion=${encodeURIComponent(V1)}&rulesVersion=${RULES}`);
  const original = trace(29_000);
  check(results, "a shared ghost round-trips intact",
    downloaded.status === 200 &&
    JSON.stringify(downloaded.body.ghost.samples) === JSON.stringify(original.samples) &&
    downloaded.body.ghost.elapsedMs === 29_000,
    JSON.stringify(downloaded.body.ghost).slice(0, 160));
  check(results, "a downloaded ghost is in the shape the client already plays back",
    Array.isArray(downloaded.body.ghost.samples) &&
    downloaded.body.ghost.samples.every((sample) => Number.isFinite(sample.tMs) && sample.position.length === 3),
    "shape mismatch");

  const missingGhost = await get(`/results/${COURSE}/ghost/gus?courseVersion=${encodeURIComponent(V1)}&rulesVersion=${RULES}`);
  check(results, "an absent ghost is a clean 404, not an empty trace", missingGhost.status === 404, `status ${missingGhost.status}`);

  const crossVersionGhost = await get(`/results/${COURSE}/ghost/fay?courseVersion=${encodeURIComponent(V2)}&rulesVersion=${RULES}`);
  check(results, "a ghost cannot be fetched against an incompatible course version", crossVersionGhost.status === 404, `status ${crossVersionGhost.status}`);

  // --- 8. persistence and client/server cap parity --------------------------------------------

  const health = await get("/health");
  check(results, "health reports the results boards and their trust level",
    health.body.results?.trust === "client-attested" && health.body.results.boards >= 3, JSON.stringify(health.body.results));

  await store.close();
  store = await startSceneStore({ port: 0, dir, token: TOKEN, origins: null, datalakeDir: null });
  const afterRestart = await (await fetch(`${store.url}/results/${COURSE}/leaderboard?courseVersion=${encodeURIComponent(V1)}&rulesVersion=${RULES}`)).json();
  check(results, "results survive a store restart",
    afterRestart.entries[0]?.bestMs === 29_000 && afterRestart.total === 6, JSON.stringify(afterRestart.entries.map((e) => e.actorId)));

  // The client enforces its own caps in the browser; a cap that drifts between the two is a
  // cap that does not exist. Read the number out of the client source and compare.
  const clientSource = await readFile(path.join(ROOT, "src", "level-ghosts.ts"), "utf8");
  const clientMax = Number((/const MAX_SAMPLES = ([\d_]+)/.exec(clientSource)?.[1] ?? "").replaceAll("_", ""));
  check(results, "the server's ghost sample cap matches the client's",
    clientMax === GHOST_MAX_SAMPLES, `client ${clientMax} vs server ${GHOST_MAX_SAMPLES}`);
} catch (error) {
  check(results, "smoke-results threw", false, error instanceof Error ? error.stack : String(error));
} finally {
  if (store) await store.close();
  if (dir) await rm(dir, { recursive: true, force: true });
}

report(results, "smoke-results");
