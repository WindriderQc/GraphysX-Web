#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { createEv3FirstProgramRunner, isEv3FirstProgram } from "../src/ev3-first-program.ts";

/** Collect the existing runner's timed inputs; no second block table or interpreter. */
export function compileEv3InputSequence(blocks) {
  if (!isEv3FirstProgram(blocks)) throw new Error("Expected one to six First Drive block ids.");
  const steps = [];
  let activeInput;
  let activeDuration;
  const runner = createEv3FirstProgramRunner(
    (input) => { activeInput = { ...input }; },
    (_index, block) => {
      activeDuration = block.durationSeconds;
      const durationMs = Math.round(activeDuration * 1000);
      if (!Number.isInteger(durationMs) || durationMs < 1 || durationMs > 1000
        || Math.abs(activeDuration * 1000 - durationMs) > 1e-6) {
        throw new Error("USB transport requires bounded, whole-millisecond durations.");
      }
      steps.push({ durationMs, input: { ...activeInput } });
    },
    () => {},
  );
  runner.start(blocks);
  while (runner.state().running) runner.advance(activeDuration);
  return { schema: "kidx.ev3-input-sequence/v1", steps };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { values, positionals } = parseArgs({
      allowPositionals: true, options: { out: { type: "string" } },
    });
    const json = `${JSON.stringify(compileEv3InputSequence(positionals), null, 2)}\n`;
    if (values.out) writeFileSync(values.out, json, "utf8");
    else process.stdout.write(json);
  } catch (error) {
    process.stderr.write(`${error.message}\nUsage: node tools/ev3-compile.mjs forward left stop [--out sequence.json]\n`);
    process.exitCode = 1;
  }
}
