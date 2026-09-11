import { test } from "node:test";
import assert from "node:assert/strict";
import { createKidxMissionTrace, kidxTraceCoaching } from "../src/kidx-mission-trace.ts";

const pose = (x, z, heading = 0) => ({ x, z, heading });
const mission = { id: "first-drive", finish: [0, 10.5], hint: "Observe le bleu." };

test("trace attributes measured travel and wrapped rotation to the actual active block", () => {
  const trace = createKidxMissionTrace();
  trace.start(["left", "forward", "stop"], pose(0, 17, 1));
  trace.sample(0, pose(0, 17, 359), .1);
  trace.sample(0, pose(0, 17, 270), .4);
  trace.sample(1, pose(-1, 17, 270), .2);
  trace.red(1);
  trace.sample(1, pose(-3, 17, 270), .6);
  const result = trace.finish("stopped");
  assert.equal(result.segments[0].turn, -91);
  assert.equal(result.segments[0].distance, 0);
  assert.equal(result.segments[0].completed, true);
  assert.equal(result.segments[1].distance, 3);
  assert.equal(result.segments[1].red, true);
  assert.deepEqual(result.segments[1].points[0], result.segments[0].points.at(-1));
  assert.equal(result.segments[1].completed, false);
  assert.equal(result.segments.length, 2, "an unexecuted instruction has no invented path");
  assert.equal(kidxTraceCoaching(result, mission).summary, "Tu as arrêté le robot avant la fin du programme.");
});

test("finished reports are immutable snapshots and reset cannot mix two attempts", () => {
  const trace = createKidxMissionTrace(), blocks = ["forward"];
  trace.start(blocks, pose(0, 17)); blocks.push("backward");
  trace.sample(0, pose(0, 15), .9);
  const result = trace.finish("finished");
  assert.equal(result.segments[0].completed, true);
  result.end.z = 999; result.blocks[0] = "stop";
  trace.sample(0, pose(0, -20), 1);
  assert.equal(trace.state().end.z, 15);
  assert.deepEqual(trace.state().blocks, ["forward"]);
  assert.equal(trace.finish("complete"), null, "a later event cannot overwrite a finished recording");
  trace.clear(); assert.equal(trace.state(), null);
  trace.start(["backward"], pose(0, 17));
  trace.sample(0, pose(0, 19), .9);
  const next = trace.finish("finished");
  assert.equal(next.segments[0].distance, 2);
  assert.match(kidxTraceCoaching(next, mission).summary, /plus loin du bleu/);
});

test("drawing samples stay bounded without losing travel measurements or the endpoint", () => {
  const trace = createKidxMissionTrace(); trace.start(["forward"], pose(0, 17));
  for (let i = 1; i <= 2000; i++) trace.sample(0, pose(0, 17 - i / 1000), .01);
  const result = trace.finish("finished");
  assert.ok(result.segments[0].points.length <= 122);
  assert.equal(result.segments[0].distance, 2);
  assert.equal(result.segments[0].points.at(-1).z, 15);
});

test("only scene verdicts produce success; hints distinguish short, turned and red attempts", () => {
  const make = (blocks, endpoint, outcome = "finished") => {
    const trace = createKidxMissionTrace(); trace.start(blocks, pose(0, 17)); trace.sample(0, endpoint, .9); return trace.finish(outcome);
  };
  const short = kidxTraceCoaching(make(["forward"], pose(0, 15)), mission);
  assert.match(short.summary, /avant l’arrivée/); assert.match(short.hints[2], /ajouter un bloc Avancer/);
  assert.doesNotMatch(kidxTraceCoaching(make(["forward"], pose(0, 10.5)), mission).summary, /Réussi/);
  assert.match(kidxTraceCoaching(make(["forward"], pose(0, 12), "complete"), mission).summary, /Réussi/);
  assert.equal(kidxTraceCoaching(make(["right"], pose(0, 17, 88)), mission).focus, 0);
  const red = make(["right"], pose(4, 17, 88)); red.segments[0].red = true;
  assert.match(kidxTraceCoaching(red, mission).summary, /rouge pendant le bloc 1/);
  const stationary = kidxTraceCoaching(make(["stop"], pose(0, 17)), mission);
  assert.match(stationary.summary, /resté au départ/);
  assert.match(stationary.hints[2], /remplacer un bloc Arrêt par Avancer/);
  const parking = kidxTraceCoaching(make(["stop"], pose(0, 17)), { ...mission, id: "reverse-parking" });
  assert.match(parking.hints[2], /Reculer/);
});

test("invalid frames and idle physics cannot invent a recording", () => {
  const trace = createKidxMissionTrace();
  trace.sample(0, pose(0, 0), 1); assert.equal(trace.finish("complete"), null);
  trace.start(["forward"], pose(NaN, 17)); assert.equal(trace.finish("finished"), null);
  trace.start(["forward"], pose(0, 17));
  trace.sample(0, pose(0, 0), 0); trace.sample(1, pose(0, 0), 1); trace.sample(0, pose(Infinity, 0), 1);
  const result = trace.finish("stopped");
  assert.deepEqual(result.end, pose(0, 17)); assert.deepEqual(result.segments, []);
});
