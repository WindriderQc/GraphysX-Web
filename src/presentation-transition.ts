/** Presentation clock only. Completion is never a domain-operation receipt. */
export type PresentationPoint = readonly [number, number, number];
export function presentationPoint(from: PresentationPoint, to: PresentationPoint, progress: number): [number, number, number] {
  if (![...from, ...to, progress].every(Number.isFinite)) throw new Error('Invalid presentation coordinate');
  const t = Math.min(1, Math.max(0, progress));
  if (t === 0) return [...from];
  if (t === 1) return [...to];
  const eased = t * t * (3 - 2 * t);
  return from.map((value, axis) => value + (to[axis] - value) * eased) as [number, number, number];
}

export function createPresentationClock(seconds = 3) {
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('Invalid duration');
  let progress = 0, playing = false;
  return {
    state: () => ({ progress, playing, scope: 'presentation-only' as const }),
    play: () => { if (progress === 1) progress = 0; playing = true; },
    pause: () => { playing = false; },
    seek: (value: number) => { if (!Number.isFinite(value)) throw new Error('Invalid progress'); progress = Math.max(0, Math.min(1, value)); playing = false; },
    tick: (delta: number) => { if (playing && Number.isFinite(delta)) { progress = Math.min(1, progress + Math.max(0, delta) / seconds); if (progress === 1) playing = false; } return progress; },
  };
}
