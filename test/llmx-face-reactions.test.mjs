import { test } from "node:test";
import assert from "node:assert/strict";
import { REACTION, createFaceReactions, creationEnvelope } from "../src/llmx-face-reactions.ts";

test("the creation envelope rises quickly, holds, and fades without a step", () => {
  assert.equal(creationEnvelope(-1), 0);
  assert.equal(creationEnvelope(0), 0);
  assert.equal(creationEnvelope(REACTION.creationAttack + 0.1), 1);
  const end = REACTION.creationAttack + REACTION.creationHold + REACTION.creationRelease;
  assert.equal(creationEnvelope(end + 0.01), 0);
  let previous = 0;
  for (let age = 0; age <= end + 0.1; age += 1 / 60) {
    const value = creationEnvelope(age);
    // The attack is quick on purpose (0.18 s); the rig eases the drivers on top. What this
    // guards against is a step: at 60 fps the envelope never moves more than ~0.14 per frame.
    assert.ok(Math.abs(value - previous) < 0.15, `no jump at ${age.toFixed(2)} s (${previous} -> ${value})`);
    previous = value;
  }
});

test("a creation earns a glance, a raised brow and a smile, then everything returns", () => {
  const reactions = createFaceReactions();
  assert.deepEqual(reactions.overlay(10), { warmth: 0, attention: 0, focus: null });
  reactions.creation([4.6, 0.18, 3.4], 10);
  const peak = reactions.overlay(10.5);
  assert.deepEqual(peak.focus, [4.6, 0.18, 3.4], "the eyes go to the creation");
  assert.ok(peak.warmth >= 0.7 && peak.attention >= 0.6, `brow and smile up (${peak.warmth}, ${peak.attention})`);
  const later = reactions.overlay(10 + REACTION.creationGlance + 0.05);
  assert.equal(later.focus, null, "the glance is over before the smile fades");
  assert.ok(later.warmth > 0, "the smile is still fading");
  const done = reactions.overlay(14);
  assert.deepEqual(done, { warmth: 0, attention: 0, focus: null });
});

test("a nod marks the start of a reply, not the gap between two words", () => {
  const reactions = createFaceReactions();
  assert.equal(reactions.speech(false, 0), false);
  assert.equal(reactions.speech(true, 0.1), true, "first syllable");
  assert.equal(reactions.speech(true, 0.2), false, "still the same reply");
  assert.equal(reactions.speech(false, 1.0), false);
  assert.equal(reactions.speech(true, 1.3), false, "a 0.3 s gap is a pause, not a new reply");
  assert.equal(reactions.speech(false, 2.0), false);
  assert.equal(reactions.speech(true, 2.0 + REACTION.speechSilence + 0.01), true, "after real silence, a new reply");
});
