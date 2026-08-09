// A tour points a camera at a thing and says what it is. If the sequence and the words come
// apart — narrating a console while framing a flock, or claiming "stop 3 of 5" on the last one
// — the visitor is being told something false about the room they are looking at. The state
// machine is pure so that agreement can be proved without a renderer.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AGENTX_CENTER_TOUR,
  IDLE_TOUR_STATE,
  TOUR_DWELL_MS,
  TOUR_DWELL_REDUCED_MS,
  describeTourPosition,
  nextLiveStopIndex,
  previousLiveStopIndex,
  createNestorTourController,
  tourDwellMs,
  tourStateAt,
} from "../src/nestor-tour.ts";

const all = () => true;
const none = () => false;

describe("the AgentX Center tour", () => {
  it("has stops, each with an entity, a title and one line", () => {
    assert.ok(AGENTX_CENTER_TOUR.stops.length >= 4);
    for (const stop of AGENTX_CENTER_TOUR.stops) {
      assert.ok(stop.id && stop.entityId && stop.title && stop.line, `incomplete stop: ${stop.id}`);
      assert.ok(!stop.line.includes("\n"), `${stop.id} narration should be one line`);
    }
  });

  it("uses stable, unique stop ids", () => {
    // The DOM and the smoke both key off these; a duplicate would make "which stop" ambiguous.
    const ids = AGENTX_CENTER_TOUR.stops.map((stop) => stop.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("visits each entity at most once", () => {
    const entities = AGENTX_CENTER_TOUR.stops.map((stop) => stop.entityId);
    assert.equal(new Set(entities).size, entities.length, "a tour that revisits reads as lost");
  });

  it("opens on Nestor himself", () => {
    assert.equal(AGENTX_CENTER_TOUR.stops[0].entityId, "showroom-nestor");
  });
});

describe("position", () => {
  it("reports a 1-based position against the total", () => {
    const state = tourStateAt(AGENTX_CENTER_TOUR, 0);
    assert.equal(state.position, 1);
    assert.equal(state.index, 0);
    assert.equal(state.total, AGENTX_CENTER_TOUR.stops.length);
    assert.equal(state.atLast, false);
    assert.equal(state.status, "running");
  });

  it("knows the last stop is the last one", () => {
    const last = AGENTX_CENTER_TOUR.stops.length - 1;
    assert.equal(tourStateAt(AGENTX_CENTER_TOUR, last).atLast, true);
    assert.equal(tourStateAt(AGENTX_CENTER_TOUR, last).position, AGENTX_CENTER_TOUR.stops.length);
  });

  it("finishes rather than throwing when the index runs off the end", () => {
    const past = tourStateAt(AGENTX_CENTER_TOUR, AGENTX_CENTER_TOUR.stops.length);
    assert.equal(past.status, "finished");
    assert.equal(past.stop, null);
    assert.equal(past.index, -1);
  });

  it("keeps a cancellation's status rather than calling it finished", () => {
    // "Cancelled" and "finished" are different things to have happened, and the panel says
    // different words for them.
    assert.equal(tourStateAt(AGENTX_CENTER_TOUR, 99, "cancelled").status, "cancelled");
  });

  it("describes where you are, and says nothing when you are nowhere", () => {
    assert.equal(describeTourPosition(tourStateAt(AGENTX_CENTER_TOUR, 1)), "Stop 2 of 5 · Build console");
    assert.equal(describeTourPosition(IDLE_TOUR_STATE), "");
    assert.equal(describeTourPosition(tourStateAt(AGENTX_CENTER_TOUR, 0, "cancelled")), "");
  });
});

describe("stops whose entity is gone", () => {
  it("walks forward through a scene that still has everything", () => {
    assert.equal(nextLiveStopIndex(AGENTX_CENTER_TOUR, 0, all), 0);
    assert.equal(nextLiveStopIndex(AGENTX_CENTER_TOUR, 1, all), 1);
  });

  it("skips a missing entity rather than framing nothing and narrating it", () => {
    // The one outcome a guided tour must never produce is describing something that is not
    // there while the camera sits on empty space.
    const missing = new Set(["showroom-nestor-console-build"]);
    const exists = (id) => !missing.has(id);
    assert.equal(nextLiveStopIndex(AGENTX_CENTER_TOUR, 1, exists), 2, "should jump the build console");
  });

  it("skips a run of missing entities in one step", () => {
    const gone = new Set(["showroom-nestor-console-build", "showroom-nestor-console-play"]);
    assert.equal(nextLiveStopIndex(AGENTX_CENTER_TOUR, 1, (id) => !gone.has(id)), 3);
  });

  it("ends the tour when nothing ahead is left", () => {
    assert.equal(nextLiveStopIndex(AGENTX_CENTER_TOUR, 0, none), null);
    assert.equal(nextLiveStopIndex(AGENTX_CENTER_TOUR, AGENTX_CENTER_TOUR.stops.length, all), null);
  });

  it("clamps a negative start rather than reading off the front", () => {
    assert.equal(nextLiveStopIndex(AGENTX_CENTER_TOUR, -5, all), 0);
  });

  it("walks backward with the same skipping rule", () => {
    const gone = new Set(["showroom-nestor-console-build"]);
    const exists = (id) => !gone.has(id);
    assert.equal(previousLiveStopIndex(AGENTX_CENTER_TOUR, 2, exists), 2);
    assert.equal(previousLiveStopIndex(AGENTX_CENTER_TOUR, 1, exists), 0);
    assert.equal(previousLiveStopIndex(AGENTX_CENTER_TOUR, 0, none), null);
  });

  it("clamps a backward start past the end", () => {
    assert.equal(previousLiveStopIndex(AGENTX_CENTER_TOUR, 999, all), AGENTX_CENTER_TOUR.stops.length - 1);
  });
});

describe("reduced motion", () => {
  it("holds each stop longer, not shorter", () => {
    // Without the camera easing there is no travel time, so the same sentence arrives with
    // less room to read it. Shortening the dwell as well would compound that.
    assert.ok(tourDwellMs(true) > tourDwellMs(false));
    assert.equal(tourDwellMs(false), TOUR_DWELL_MS);
    assert.equal(tourDwellMs(true), TOUR_DWELL_REDUCED_MS);
  });

  it("keeps both dwells in a readable range", () => {
    for (const reduced of [false, true]) {
      assert.ok(tourDwellMs(reduced) >= 3000, "too fast to read a sentence");
      assert.ok(tourDwellMs(reduced) <= 8000, "long enough to feel stuck");
    }
  });
});

describe("the controller", () => {
  const harness = (overrides = {}) => {
    const events = { focused: [], highlighted: [], states: [] };
    let pending = null;
    const controller = createNestorTourController({
      entityExists: () => true,
      focusEntity: (id) => events.focused.push(id),
      highlight: (ids) => events.highlighted.push(ids),
      reducedMotion: () => false,
      onChange: (state) => events.states.push(state),
      schedule: (callback) => { pending = callback; return 1; },
      cancelScheduled: () => { pending = null; },
      ...overrides,
    });
    return { controller, events, tick: () => { const run = pending; pending = null; run?.(); }, pendingExists: () => pending !== null };
  };

  it("frames and highlights the first stop on start", () => {
    const { controller, events } = harness();
    const state = controller.start();
    assert.equal(state.status, "running");
    assert.equal(state.position, 1);
    assert.deepEqual(events.focused, ["showroom-nestor"]);
    assert.deepEqual(events.highlighted, [["showroom-nestor"]]);
  });

  it("advances on its own when the dwell elapses", () => {
    const { controller, events, tick } = harness();
    controller.start();
    tick();
    assert.equal(controller.state().position, 2);
    assert.deepEqual(events.focused, ["showroom-nestor", "showroom-nestor-console-build"]);
  });

  it("finishes after the last stop and releases the highlight", () => {
    const { controller, events, tick } = harness();
    controller.start();
    for (let i = 0; i < AGENTX_CENTER_TOUR.stops.length; i += 1) tick();
    assert.equal(controller.state().status, "finished");
    // The selection was the tour's; leaving it set would hand the editor a selection the
    // person never made.
    assert.deepEqual(events.highlighted.at(-1), []);
  });

  it("cancels where it stands, and says cancelled rather than finished", () => {
    const { controller, events, pendingExists } = harness();
    controller.start();
    const state = controller.cancel();
    assert.equal(state.status, "cancelled");
    assert.deepEqual(events.highlighted.at(-1), []);
    assert.equal(pendingExists(), false, "a cancelled tour must not still be scheduled");
  });

  it("cancelling twice is harmless", () => {
    const { controller } = harness();
    controller.start();
    controller.cancel();
    assert.equal(controller.cancel().status, "cancelled");
  });

  it("does not advance after it has been cancelled", () => {
    const { controller, tick } = harness();
    controller.start();
    controller.cancel();
    tick();
    assert.equal(controller.state().status, "cancelled");
  });

  it("skips a stop whose entity is gone, without narrating it", () => {
    const gone = new Set(["showroom-nestor-console-build"]);
    const { controller, events, tick } = harness({ entityExists: (id) => !gone.has(id) });
    controller.start();
    tick();
    assert.equal(controller.state().stop.entityId, "showroom-nestor-console-play");
    assert.ok(!events.focused.includes("showroom-nestor-console-build"));
  });

  it("finishes immediately when the scene has none of the tour", () => {
    const { controller, events } = harness({ entityExists: () => false });
    assert.equal(controller.start().status, "finished");
    assert.deepEqual(events.focused, [], "nothing exists, so nothing should be framed");
  });

  it("steps back, and holds at the front rather than ending backwards", () => {
    const { controller, tick } = harness();
    controller.start();
    tick();
    assert.equal(controller.state().position, 2);
    assert.equal(controller.previous().position, 1);
    assert.equal(controller.previous().position, 1, "at the front, previous should hold");
    assert.equal(controller.state().status, "running");
  });

  it("holds each stop longer when motion is reduced", () => {
    const delays = [];
    const { controller } = harness({
      reducedMotion: () => true,
      schedule: (_callback, ms) => { delays.push(ms); return 1; },
    });
    controller.start();
    assert.equal(delays[0], TOUR_DWELL_REDUCED_MS);
  });

  it("stops scheduling once disposed", () => {
    const { controller, pendingExists } = harness();
    controller.start();
    controller.dispose();
    assert.equal(pendingExists(), false);
    assert.equal(controller.state().status, "idle");
  });
});
