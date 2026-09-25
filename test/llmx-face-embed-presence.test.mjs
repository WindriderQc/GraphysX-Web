import assert from "node:assert/strict";
import test from "node:test";
import { importBrowserModule } from "./support/import-browser-module.mjs";

const { embedFaceDrivers, IDLE_PRESENCE, newToolPulses, readEmbedPresence } =
  await importBrowserModule(new URL("../src/llmx-face-embed-presence.ts", import.meta.url));

test("host presence is read defensively and merges partial updates", () => {
  assert.deepEqual(readEmbedPresence(null), IDLE_PRESENCE);
  const listening = readEmbedPresence({ phase: "listening", level: 0.04, extra: "ignored" });
  assert.deepEqual(listening, { phase: "listening", level: 0.04, brightness: 0, tokenRate: 0, toolPulses: 0 });
  const merged = readEmbedPresence({ tokenRate: 9999, level: -1 }, listening);
  assert.equal(merged.phase, "listening", "an update without a phase keeps the previous one");
  assert.equal(merged.tokenRate, 500, "values are clamped");
  assert.equal(merged.level, 0);
  assert.equal(readEmbedPresence({ phase: "dancing" }, listening).phase, "listening", "unknown phases are refused");
});

test("speech drives the mouth with the Forge's gain, and only while audible", () => {
  const speaking = embedFaceDrivers(readEmbedPresence({ phase: "speaking", level: 0.05, brightness: 0.1 }), 1);
  assert.equal(speaking.speak, 0.4);
  assert.ok(Math.abs(speaking.speakTone - 0.4) < 1e-9);
  assert.equal(speaking.think, 0, "a speaking face is not thinking");
  const silent = embedFaceDrivers(readEmbedPresence({ phase: "speaking", level: 0 }), 1);
  assert.equal(silent.speak, 0);
  assert.equal("gazeX" in speaking, false, "the embed owns the gaze");
});

test("thinking scales with the token stream and listening leans in", () => {
  const slow = embedFaceDrivers(readEmbedPresence({ phase: "waiting" }), 1);
  const fast = embedFaceDrivers(readEmbedPresence({ phase: "generating", tokenRate: 60 }), 1);
  assert.equal(slow.think, 0.55);
  assert.equal(fast.think, 1);
  const listening = embedFaceDrivers(readEmbedPresence({ phase: "listening", level: 0.1 }), 1);
  assert.equal(listening.attention, 1);
  assert.ok(listening.warmth >= 0.35);
  assert.ok(embedFaceDrivers(readEmbedPresence({ phase: "error" }), 1).warmth < 0);
});

test("sleep closes the eyes and the build follows the intro", () => {
  const asleep = embedFaceDrivers(readEmbedPresence({ phase: "sleeping", level: 0.2 }), 0.5);
  assert.deepEqual(asleep, { build: 0.5, speak: 0, think: 0, attention: 0, warmth: 0, blink: 1 });
});

test("each new tool pulse is one spark, capped per frame", () => {
  const first = readEmbedPresence({ toolPulses: 2 });
  assert.equal(newToolPulses(IDLE_PRESENCE, first), 2);
  assert.equal(newToolPulses(first, first), 0);
  assert.equal(newToolPulses(first, readEmbedPresence({ toolPulses: 40 })), 3);
});
