import { test } from "node:test";
import assert from "node:assert/strict";
import { importBrowserModule } from "./support/import-browser-module.mjs";
const { createBallsyBoost, advanceBallsyBoost } = await importBrowserModule(new URL("../src/ballsy-boost.ts", import.meta.url));
test("strip rewards forward entry once, not stationary, backwards or held parking", () => {
  const state = createBallsyBoost();
  assert.equal(advanceBallsyBoost(state, .1, [3,.7,8.8], [0,0,0], true), null);
  assert.equal(advanceBallsyBoost(state, .1, [3,.7,8.8], [4,0,0], true), null);
  advanceBallsyBoost(state, 2, [0,.7,8.8], [4,0,0], true);
  assert.deepEqual(advanceBallsyBoost(state,.1,[3,.7,8.8],[4,0,0],true),[2.4,0]);
  assert.equal(state.count,1);
  assert.equal(advanceBallsyBoost(state,.1,[3,.7,8.8],[4,0,0],true),null);
  advanceBallsyBoost(state,2,[0,.7,8.8],[-4,0,0],true);
  assert.equal(advanceBallsyBoost(state,.1,[3,.7,8.8],[-4,0,0],true),null);
});
test("lava, braking or completed race cancels boost and replay starts clean",()=>{
  const state=createBallsyBoost();
  advanceBallsyBoost(state,.1,[-4,.7,-8.8],[-4,0,0],true);
  assert.equal(state.remaining,.9);
  assert.equal(advanceBallsyBoost(state,.1,[-4,.7,-8.8],[-4,0,0],false),null);
  assert.equal(state.remaining,0);
  assert.deepEqual(createBallsyBoost(),{remaining:0,cooldown:0,count:0,strip:-1});
});
