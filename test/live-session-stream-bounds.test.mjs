import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  destroyRetainedStream,
  exceedsRetainedStreamBudget,
} from "../server/live-sessions.mjs";

describe("live-session retained stream bounds", () => {
  it("uses projected bytes, so the next frame cannot overshoot the cap", () => {
    const response = { writableLength: 90 };
    assert.equal(exceedsRetainedStreamBudget(response, 10, 100), false);
    assert.equal(exceedsRetainedStreamBudget(response, 11, 100), true);
    assert.equal(exceedsRetainedStreamBudget({ writableLength: 0 }, 101, 100), true);
  });

  it("hard-destroys both the response and its socket", () => {
    let responseDestroyed = 0;
    let socketDestroyed = 0;
    const response = {
      destroy: () => { responseDestroyed += 1; },
      socket: { destroy: () => { socketDestroyed += 1; } },
    };
    destroyRetainedStream(response);
    assert.equal(responseDestroyed, 1);
    assert.equal(socketDestroyed, 1);
  });
});
