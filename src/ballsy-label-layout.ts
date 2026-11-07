export type BallsyLabelBox = { left: number; top: number; right: number; bottom: number };
export type BallsyLabelAnchor = { x: number; bottom: number; width: number; height: number };
export type BallsyLabelPosition = { x: number; bottom: number; box: BallsyLabelBox };
export const BALLSY_LABEL_MAX_SHIFT = 128;
const gap = 6, margin = 8;
const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(high, value));
const intersects = (a: BallsyLabelBox, b: BallsyLabelBox): boolean =>
  a.left < b.right + gap && a.right > b.left - gap && a.top < b.bottom + gap && a.bottom > b.top - gap;

/** Small screen-space layout only. Prefer a short vertical nudge, leave the camera and
 * bodies untouched, and keep every badge off the HUD and inside the viewport. */
export function layoutBallsyArrivalLabels(
  labels: readonly BallsyLabelAnchor[], viewport: { width: number; height: number }, blockers: readonly BallsyLabelBox[],
): BallsyLabelPosition[] {
  const candidates = labels.map(label => {
    const baseX = clamp(label.x, margin + label.width / 2, viewport.width - margin - label.width / 2);
    const baseY = clamp(label.bottom, margin + label.height, viewport.height - margin);
    const position = (x: number, bottom: number): BallsyLabelPosition => ({ x, bottom,
      box: { left: x - label.width / 2, right: x + label.width / 2, top: bottom - label.height, bottom } });
    const xs = [baseX, baseX - label.width - gap, baseX + label.width + gap,
      ...blockers.flatMap(box => [box.left - gap - label.width / 2, box.right + gap + label.width / 2])];
    const ys = [baseY, ...[-1, 1, -2, 2, -3, 3].map(n => baseY + n * (label.height + gap)),
      ...blockers.flatMap(box => [box.top - gap, box.bottom + gap + label.height])];
    const result = xs.flatMap(x => ys.map(y => position(x, y))).filter(candidate =>
      candidate.box.left >= margin && candidate.box.right <= viewport.width - margin &&
      candidate.box.top >= margin && candidate.bottom <= viewport.height - margin &&
      Math.hypot(candidate.x - baseX, candidate.bottom - baseY) <= BALLSY_LABEL_MAX_SHIFT &&
      blockers.every(box => !intersects(candidate.box, box)),
    ).map(candidate => ({ ...candidate, cost: (candidate.bottom - baseY) ** 2 + (candidate.x - baseX) ** 2 * 1.5 }));
    // A viewport wholly covered by UI cannot satisfy placement. Keep a bounded,
    // on-screen fallback rather than losing a badge; ordinary layouts have free space.
    return result.length ? result.sort((a, b) => a.cost - b.cost) : [{ ...position(baseX, baseY), cost: 1e8 }];
  });
  let best: BallsyLabelPosition[] = [], bestCost = Infinity;
  const visit = (index: number, selected: BallsyLabelPosition[], cost: number): void => {
    if (cost >= bestCost) return;
    if (index === candidates.length) { best = selected; bestCost = cost; return; }
    for (const candidate of candidates[index]) {
      if (selected.some(previous => intersects(previous.box, candidate.box))) continue;
      visit(index + 1, [...selected, candidate], cost + candidate.cost);
    }
  };
  visit(0, [], 0);
  return best.length === labels.length ? best : candidates.map(options => options[0]);
}
