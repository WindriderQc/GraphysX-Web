import timings from "./verify-timings.json" with { type: "json" };

// Historical seconds are scheduling hints, never deadlines or coverage filters. New
// checks receive a conservative estimate until a clean CI run measures them.
export function planVerifyShards(smokes, count, seconds = timings.seconds) {
  if (!Number.isSafeInteger(count) || count < 1 || count > smokes.length) {
    throw new Error(`Shard count must be between 1 and ${smokes.length}.`);
  }
  const weighted = smokes.map((smoke) => {
    const measured = Object.hasOwn(seconds, smoke.name) ? seconds[smoke.name] : undefined;
    const estimate = Number.isFinite(measured) && measured >= 0
      ? Math.max(1, measured)
      : smoke.longDeadline ? 1800 : 300;
    return { smoke, estimate };
  });
  const shards = Array.from({ length: count }, () => ({ smokes: [], estimatedSeconds: 0 }));
  // Longest first keeps the 26-minute collaboration journey from landing behind a
  // large batch of shorter journeys. Ties retain manifest/shard order deterministically.
  for (const { smoke, estimate } of weighted.sort((a, b) => b.estimate - a.estimate)) {
    const shard = shards.reduce((best, next) => next.estimatedSeconds < best.estimatedSeconds ? next : best);
    shard.smokes.push(smoke);
    shard.estimatedSeconds += estimate;
  }
  // Preserve existing execution order inside each isolated runner.
  return shards.map((shard) => {
    const selected = new Set(shard.smokes);
    return { ...shard, smokes: smokes.filter((smoke) => selected.has(smoke)) };
  });
}

export function parseVerifyShard(value, smokeCount) {
  if (!/^[1-9]\d*\/[1-9]\d*$/.test(value)) {
    throw new Error("--shard must be a one-based index/count, for example --shard=1/4.");
  }
  const [index, count] = value.split("/").map(Number);
  if (!Number.isSafeInteger(index) || !Number.isSafeInteger(count) || index > count || count > smokeCount) {
    throw new Error(`--shard requires 1 <= index <= count <= ${smokeCount}.`);
  }
  return { index, count };
}
