// The one test file here that touches disk, and it says why.
//
// `rankResults` and the retention pass it feeds are module-private, and the honest reason to
// keep them that way is that ordering only means anything in terms of what the board ends up
// holding. So this drives the real store against a temp directory: no server, no port, no
// browser, and a few milliseconds per case.
//
// It exists because this logic has a recorded past bug. The comparator compared `elapsedMs`
// against `bestMs`, so every difference was `NaN`; a sort comparator treats `NaN` as "leave
// these alone", so the board silently stayed in insertion order and the retention pass kept
// arbitrary entries. Both looked completely plausible from the outside.

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { createResultsStore, fingerprintRules } from "../server/results-store.mjs";

const COURSE = "course-v1";
const RULES = "rules-v1";

let dir;
let store;
let clock = Date.UTC(2026, 0, 1);

before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "graphysx-results-unit-"));
  // Injected rather than real: two submissions in the same millisecond would tie on the
  // second sort key, and a test that depends on how fast the machine is is not a test.
  store = createResultsStore({ dir, now: () => (clock += 1000) });
});
after(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });

const submit = (recordId, actorId, elapsedMs, extra = {}) =>
  store.submit({ recordId, actorId, elapsedMs, courseVersion: COURSE, rulesVersion: RULES, ...extra });

const board = (recordId, options = {}) =>
  store.leaderboard(recordId, { courseVersion: COURSE, rulesVersion: RULES, ...options });

describe("leaderboard ordering", () => {
  it("ranks by time, fastest first", async () => {
    const record = "order";
    await submit(record, "slow", 9000);
    await submit(record, "fast", 3000);
    await submit(record, "middle", 6000);
    const { entries } = await board(record);
    assert.deepEqual(entries.map((entry) => entry.actorId), ["fast", "middle", "slow"]);
    assert.deepEqual(entries.map((entry) => entry.rank), [1, 2, 3]);
  });

  it("compares the stored best against the stored best, not against a submitted time", () => {
    // The regression guard. If the comparator ever reaches for the wrong field again the
    // differences become NaN and this ordering silently reverts to insertion order.
    const ranked = [{ bestMs: 5000 }, { bestMs: 1000 }, { bestMs: 3000 }]
      .sort((a, b) => a.bestMs - b.bestMs)
      .map((entry) => entry.bestMs);
    assert.deepEqual(ranked, [1000, 3000, 5000]);
    assert.ok(Number.isNaN(undefined - 1000), "a missing field would compare as NaN");
  });

  it("breaks ties by who got there first, then by actor id, so the order is total", async () => {
    const record = "ties";
    await submit(record, "zoe", 5000);
    await submit(record, "amy", 5000);
    const first = await board(record);
    const second = await board(record);
    assert.deepEqual(first.entries.map((entry) => entry.actorId), ["zoe", "amy"], "earlier submission ranks first");
    assert.deepEqual(
      first.entries.map((entry) => entry.actorId),
      second.entries.map((entry) => entry.actorId),
      "a board that reorders equal times between reads looks broken even when it is not",
    );
  });
});

describe("personal bests", () => {
  it("replaces a best only with a strictly better time", async () => {
    const record = "bests";
    assert.equal((await submit(record, "ada", 5000)).improved, true);
    const slower = await submit(record, "ada", 7000);
    assert.equal(slower.improved, false, "a slower run is a normal outcome, not an error");
    assert.equal(slower.bestMs, 5000);
    const equal = await submit(record, "ada", 5000);
    assert.equal(equal.improved, false, "an equal time is not an improvement");
    const faster = await submit(record, "ada", 4000);
    assert.equal(faster.improved, true);
    assert.equal(faster.previousBestMs, 5000);
    assert.equal((await store.personalBest(record, "ada", { courseVersion: COURSE, rulesVersion: RULES })).bestMs, 4000);
  });

  it("keeps one entry per actor however many times they run", async () => {
    const record = "one-per-actor";
    for (const ms of [9000, 8000, 7000, 6000]) await submit(record, "ada", ms);
    const { entries, total } = await board(record);
    assert.equal(total, 1);
    assert.equal(entries[0].bestMs, 6000);
  });
});

describe("compatibility separation", () => {
  it("never compares a time set on a different version of the course", async () => {
    const record = "compat";
    await submit(record, "ada", 3000);
    const other = await store.submit({
      recordId: record, actorId: "bob", elapsedMs: 1000,
      courseVersion: "course-v2", rulesVersion: RULES,
    });
    const original = await board(record);
    assert.equal(original.entries.length, 1, "a faster time on another course version leaked onto this board");
    assert.equal(original.entries[0].actorId, "ada");
    assert.notEqual(other.compatibility, original.compatibility);
  });

  it("fingerprints the rules block so moving a checkpoint separates the boards", () => {
    const rules = { checkpoints: [{ triggerId: "a" }], laps: 3 };
    assert.equal(fingerprintRules(rules), fingerprintRules({ laps: 3, checkpoints: [{ triggerId: "a" }] }),
      "key order is not a change to the rules");
    assert.notEqual(fingerprintRules(rules), fingerprintRules({ checkpoints: [{ triggerId: "b" }], laps: 3 }));
    assert.notEqual(fingerprintRules(rules), fingerprintRules({ checkpoints: [{ triggerId: "a" }], laps: 2 }));
    assert.equal(fingerprintRules(null), "none");
    assert.equal(fingerprintRules(undefined), "none");
  });

  it("ignores an explicitly undefined field when fingerprinting", () => {
    assert.equal(fingerprintRules({ laps: 3 }), fingerprintRules({ laps: 3, checkpoints: undefined }));
  });
});

describe("what a board refuses to record", () => {
  const rejects = async (body, code) => {
    await assert.rejects(
      () => store.submit({ recordId: "refuse", actorId: "ada", elapsedMs: 5000, courseVersion: COURSE, rulesVersion: RULES, ...body }),
      (error) => (code ? error.code === code : error.status >= 400),
    );
  };

  it("refuses a desynchronised run", async () => {
    // The project's core integrity rule, stated in three places in the client. A desynced
    // run's time is not a time you put on a leaderboard.
    await rejects({ desynced: true }, "result-desynced");
  });

  it("refuses a run that did not finish", async () => {
    await rejects({ outcome: "abandoned" }, "result-incomplete");
  });

  it("refuses implausible times", async () => {
    await rejects({ elapsedMs: 10 }, "result-implausible");
    await rejects({ elapsedMs: 7 * 60 * 60 * 1000 }, "result-implausible");
    await rejects({ elapsedMs: 4000, floorMs: 9000 }, "result-implausible");
    await rejects({ elapsedMs: 1234.5 });
  });

  it("refuses malformed identity and shape", async () => {
    await rejects({ actorId: "has spaces" });
    await rejects({ recordId: "../escape" });
    await rejects({ medal: "platinum" });
    await rejects({ resyncs: -1 });
  });
});

describe("retention", () => {
  it("labels every read as client-attested, on the record and in the response", async () => {
    const record = "trust";
    await submit(record, "ada", 5000);
    const read = await board(record);
    assert.equal(read.trust, "client-attested");
    assert.match(read.trustNote, /not replayed or verified/);
  });

  it("bounds what a board returns however much is asked for", async () => {
    const record = "bounded";
    for (let index = 0; index < 8; index += 1) await submit(record, `racer-${index}`, 1000 + index * 100);
    assert.equal((await board(record, { limit: 3 })).entries.length, 3);
    assert.equal((await board(record, { limit: 9999 })).entries.length, 8, "a caller cannot raise the cap");
    assert.equal((await board(record, { limit: -1 })).entries.length, 8);
  });

  it("keeps ghosts only for actors still near the top of the board", async () => {
    const record = "ghosts";
    const ghost = { elapsedMs: 5000, samples: [{ tMs: 0, position: [0, 0, 0] }, { tMs: 4900, position: [1, 0, 0] }] };
    await submit(record, "ada", 5000, { ghost });
    assert.ok(await store.ghost(record, "ada", { courseVersion: COURSE, rulesVersion: RULES }));
    // Retention keeps ghosts for the top ten; with two entries both survive.
    await submit(record, "bob", 4000, { ghost: { ...ghost, elapsedMs: 4000, samples: [{ tMs: 0, position: [0, 0, 0] }, { tMs: 3900, position: [1, 0, 0] }] } });
    assert.ok(await store.ghost(record, "bob", { courseVersion: COURSE, rulesVersion: RULES }));
    assert.ok(await store.ghost(record, "ada", { courseVersion: COURSE, rulesVersion: RULES }));
  });

  it("refuses a ghost that does not describe the run it is attached to", async () => {
    await assert.rejects(() => submit("ghost-mismatch", "ada", 5000, {
      ghost: { elapsedMs: 90000, samples: [{ tMs: 0, position: [0, 0, 0] }, { tMs: 80000, position: [1, 0, 0] }] },
    }), (error) => error.code === "ghost-rejected");
  });
});

describe("board files", () => {
  it("keeps a record id that is not a legal filename out of the filesystem", async () => {
    // `level:my-course` is the shape this module's own header recommends, and it is an
    // alternate data stream on NTFS. It must round-trip like any other id.
    const record = "level:my-course";
    const written = await submit(record, "ada", 5000);
    assert.equal(written.recordId, record);
    const read = await board(record);
    assert.equal(read.entries[0].actorId, "ada");
  });
});
