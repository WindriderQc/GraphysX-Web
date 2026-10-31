// A GraphysX world recording (graphysx-recording.ndjson, written by `--record`) as a seekable
// timeline. Pure: no I/O, so the replay server and the Node tests share it.
//
// Lines: {kind: "hello", format, tickHz, tick, document, ids, resumedFromTick}, {kind: "frame",
// tick, t, poses}, {kind: "entities", tick, added?, removed?}, {kind: "action", tick, agent,
// input, result}. A resumed world appends a new hello to the same file; its timeline replaces
// whatever the old one recorded after the resumed tick, so the merged timeline stays monotonic.

const STREAM_FORMAT = "graphysx-world-stream/v1";

const finite = (value) => typeof value === "number" && Number.isFinite(value);

/** Last index in a tick-sorted array whose tick is <= `tick`, or -1. */
export function lastAtOrBefore(list, tick) {
  let lo = 0;
  let hi = list.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].tick <= tick) { found = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return found;
}

/**
 * @param {string} text the NDJSON file
 * @returns {{tickHz: number, firstTick: number, lastTick: number, hellos: object[], frames: object[], changes: object[], actions: object[], skipped: number}}
 */
export function parseRecording(text) {
  const hellos = [];
  let frames = [];
  let changes = [];
  let actions = [];
  let skipped = 0;
  const trim = (list, tick) => list.filter((entry) => entry.tick <= tick);
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { skipped += 1; continue; } // a torn last line, typically
    if (!entry || typeof entry !== "object" || !finite(entry.tick)) { skipped += 1; continue; }
    const { kind, ...rest } = entry;
    if (kind === "hello") {
      if (rest.format !== STREAM_FORMAT || !rest.document || !Array.isArray(rest.document.entities)) { skipped += 1; continue; }
      while (hellos.length && hellos[hellos.length - 1].tick >= rest.tick) hellos.pop();
      hellos.push(rest);
      // At the resume tick, the new hello replaces the old branch's pose too.
      frames = frames.filter((frame) => frame.tick < rest.tick);
      changes = trim(changes, rest.tick);
      actions = trim(actions, rest.tick);
    } else if (kind === "frame" && Array.isArray(rest.poses)) frames.push(rest);
    else if (kind === "entities") changes.push(rest);
    else if (kind === "action" && typeof rest.agent === "string") actions.push(rest);
    else skipped += 1;
  }
  if (!hellos.length) throw new Error("This recording has no hello line: it is not a GraphysX world recording");
  const firstTick = hellos[0].tick;
  const lastTick = Math.max(firstTick, frames.at(-1)?.tick ?? firstTick, changes.at(-1)?.tick ?? firstTick, actions.at(-1)?.tick ?? firstTick);
  return { tickHz: finite(hellos[0].tickHz) ? hellos[0].tickHz : 60, firstTick, lastTick, hellos, frames, changes, actions, skipped };
}

/**
 * The viewer's `hello` at `tick`: the last recorded document at or before it, with every entity
 * change since applied. The frame at or before `tick` (frameAt) then places the moving things.
 */
export function helloAt(recording, tick) {
  const index = Math.max(0, lastAtOrBefore(recording.hellos, tick));
  const base = recording.hellos[index];
  const entities = base.document.entities.map((entity) => ({ ...entity }));
  const ids = new Map(Object.entries(base.ids ?? {}).map(([numeric, id]) => [Number(numeric), id]));
  for (const change of recording.changes) {
    if (change.tick <= base.tick) continue;
    if (change.tick > tick) break;
    const gone = new Set();
    for (const numeric of change.removed ?? []) {
      const id = ids.get(numeric);
      if (id) gone.add(id);
      ids.delete(numeric);
    }
    let grew = true;
    while (grew) {
      grew = false;
      for (const entity of entities) if (!gone.has(entity.id) && gone.has(entity.parentId)) { gone.add(entity.id); grew = true; }
    }
    for (let i = entities.length - 1; i >= 0; i -= 1) if (gone.has(entities[i].id)) entities.splice(i, 1);
    for (const { entity, numericId } of change.added ?? []) {
      const at = entities.findIndex((existing) => existing.id === entity.id);
      if (at >= 0) entities.splice(at, 1);
      entities.push({ ...entity });
      ids.set(numericId, entity.id);
    }
  }
  let inspection = base.inspection;
  for (let i = lastAtOrBefore(recording.frames, tick); i >= 0 && recording.frames[i].tick >= base.tick; i -= 1) {
    if (recording.frames[i].inspection) { inspection = recording.frames[i].inspection; break; }
  }
  return {
    format: STREAM_FORMAT,
    tickHz: recording.tickHz,
    tick: Math.max(base.tick, tick),
    document: { ...base.document, entities },
    ids: Object.fromEntries(ids),
    replay: true,
    ...(base.instanceId ? { instanceId: base.instanceId, recordingId: base.recordingId, ...(base.identitySource ? { identitySource: base.identitySource } : {}) } : {}),
    ...(inspection ? { inspection } : {}),
  };
}

export function frameAt(recording, tick) {
  const index = lastAtOrBefore(recording.frames, tick);
  const base = recording.hellos[Math.max(0, lastAtOrBefore(recording.hellos, tick))];
  return index >= 0 && recording.frames[index].tick >= base.tick ? recording.frames[index] : null;
}

/** First action strictly after `tick`, or null (skip-idle jumps towards it). */
export function nextActionAfter(recording, tick) {
  const index = lastAtOrBefore(recording.actions, tick) + 1;
  return recording.actions[index] ?? null;
}
