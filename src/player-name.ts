// A default name for a visitor who did not bring one.
//
// The dogfood run surfaced this: browser players defaulted to `guest-1exkcl`, which is fine
// as an identifier and useless as a name. On a leaderboard and in a session roster it reads
// as noise, and two of them are indistinguishable at a glance — which is exactly when you
// need to tell people apart.
//
// Still random, still collision-tolerant, still not an identity claim: `actorId` remains
// self-reported and the docs say so. This only makes the fallback legible.

const ADJECTIVES = [
  "Swift", "Quiet", "Bright", "Curious", "Steady", "Bold", "Clever", "Calm",
  "Keen", "Nimble", "Patient", "Sharp", "Warm", "Wry", "Deft", "Sunny",
] as const;

const CREATURES = [
  "Otter", "Falcon", "Heron", "Marten", "Ibex", "Lynx", "Raven", "Badger",
  "Kestrel", "Pika", "Tern", "Vole", "Wren", "Hare", "Shrike", "Fox",
] as const;

/**
 * `swift-otter-417` — pronounceable, memorable, and still an id: lower-case with hyphens so
 * it satisfies the same `[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}` pattern the store enforces on
 * every actor id, with no escaping needed anywhere it is rendered.
 *
 * ~65k combinations before the numeric suffix. Two visitors colliding is harmless — they are
 * separate rows on a board either way — so this trades uniqueness for legibility on purpose.
 */
export function randomPlayerName(random: () => number = Math.random): string {
  const pick = (list: readonly string[]): string => list[Math.floor(random() * list.length)];
  const suffix = String(Math.floor(random() * 900) + 100);
  return `${pick(ADJECTIVES)}-${pick(CREATURES)}-${suffix}`.toLowerCase();
}
