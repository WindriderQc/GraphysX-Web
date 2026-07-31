// Browser client for the results store (server/results-store.mjs): best times, leaderboards
// and shared ghosts.
//
// ## The rule that shapes this whole file
//
// **A finish must never be delayed, blocked or made noisy by this.** The local
// `LevelRecordStore` is the authority a player experiences; the server is an enhancement on
// top. `scripts/smoke-archive-cup.mjs` asserts zero console errors and runs with no store at
// all, and it is right to: a visitor on the static production deploy has no store either, and
// a red console on the front door is a bug regardless of who notices.
//
// So the guard is *configuration*, not error handling. Until `configureResultsClient` is
// called with a store URL this module makes no network call whatsoever — not one that fails
// quietly, not one at all. Chromium logs a failed request itself, before any application code
// can catch it, so "try/catch around fetch" would not have been enough.
//
// ## Trust
//
// Times are client-attested. The server validates shape, consistency and plausibility; it does
// not replay the run. Every response carries `trust: "client-attested"`, and `TRUST_LABEL`
// below is what the UI renders. Do not soften it.

import { resolveSceneStoreToken } from "./scene-store-auth";

export const RESULTS_SCHEMA = "graphysx.results/v1";

/** Rendered wherever a leaderboard is shown. The server says the same thing on every read. */
export const TRUST_LABEL = "Times are reported by each player's browser — validated, not verified.";

export type LeaderboardEntry = {
  rank: number;
  actorId: string;
  label: string;
  bestMs: number;
  medal: "gold" | "silver" | "bronze" | null;
  completedAt: string;
  hasGhost: boolean;
};

export type Leaderboard = {
  schema: string;
  recordId: string;
  courseVersion: string;
  rulesVersion: string;
  trust: string;
  trustNote: string;
  total: number;
  entries: LeaderboardEntry[];
};

export type GhostSample = { tMs: number; position: [number, number, number] };
export type GhostTrace = { elapsedMs: number; samples: GhostSample[] };

export type ResultSubmission = {
  recordId: string;
  actorId: string;
  label?: string;
  courseVersion: string;
  rulesVersion?: string;
  elapsedMs: number;
  medal?: "gold" | "silver" | "bronze" | null;
  outcome?: "complete";
  desynced?: boolean;
  resyncs?: number;
  ghost?: GhostTrace | null;
};

export type ResultReceipt = {
  ok: true;
  recordId: string;
  actorId: string;
  trust: string;
  elapsedMs: number;
  improved: boolean;
  isNewBest: boolean;
  bestMs: number | null;
  previousBestMs: number | null;
  rank: number | null;
  ghostStored: boolean;
};

const state: { baseUrl: string | null; token: string | null; actorId: string } = {
  baseUrl: null,
  token: null,
  actorId: "local",
};

/**
 * Points this client at a store. Until called, every function here is a no-op that makes no
 * request. `main.ts` calls it in the same place it configures the media library — only after
 * a store has actually answered.
 */
export function configureResultsClient(storeUrl: string, token?: string | null, actorId?: string): void {
  state.baseUrl = storeUrl.replace(/\/+$/, "");
  state.token = token !== undefined ? token?.trim() || null : resolveSceneStoreToken(state.baseUrl);
  if (actorId) state.actorId = actorId;
}

export const resultsConfigured = (): boolean => state.baseUrl !== null;

/**
 * Whether this browser may *record* a time. Reads are open; writes need the store token.
 *
 * Checked before submitting rather than after failing, because a 401 is not silent: Chromium
 * writes "Failed to load resource: the server responded with a status of 401" to the console
 * itself, before any application code can catch it. A player without a token would therefore
 * paint a console error on every single finish — and the front door asserts zero of those.
 * So a tokenless browser reads leaderboards, races ghosts, and simply does not post.
 */
export const resultsCanSubmit = (): boolean => state.baseUrl !== null && state.token !== null;

export const resultsActorId = (): string => state.actorId;

/**
 * A course's compatibility token.
 *
 * Grid levels carry a real revision. Code-composed archive courses carry none — their only
 * honest version signal is their id — so they get a `code:` token and the honesty about that
 * lives in docs/RESULTS.md rather than in a number invented here.
 */
export function courseVersionFor(recordId: string, revision?: number | null): string {
  return Number.isInteger(revision) ? `level:${recordId}@${revision}` : `code:${recordId}`;
}

/**
 * Every network call in this module goes through here.
 *
 * Returns null on absolutely everything: unconfigured, offline, 404, 500, malformed JSON. A
 * caller cannot distinguish "no store" from "store said no", and does not need to — in both
 * cases the answer is "carry on with the local record". Nothing is logged, deliberately.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T | null> {
  if (!state.baseUrl) return null;
  const headers = new Headers(init?.headers);
  if (state.token && !headers.has("x-graphysx-token")) headers.set("x-graphysx-token", state.token);
  if (init?.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  try {
    const response = await fetch(`${state.baseUrl}${path}`, { cache: "no-store", ...init, headers });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    // Silent by design — see the header. A finish is never worth a console error.
    return null;
  }
}

/**
 * Records a finished run. Fire-and-forget: callers should not await this on the finish path.
 *
 * A desynced run is not submitted at all rather than submitted and rejected — the server
 * refuses it either way, and not sending it keeps the intent visible here too.
 */
export async function submitResult(submission: ResultSubmission): Promise<ResultReceipt | null> {
  // Capability first: see resultsCanSubmit. Attempting and failing would be loud.
  if (!resultsCanSubmit()) return null;
  if (submission.desynced) return null;
  return request<ResultReceipt>("/results", {
    method: "POST",
    body: JSON.stringify({ outcome: "complete", ...submission }),
  });
}

export async function fetchLeaderboard(
  recordId: string,
  courseVersion: string,
  rulesVersion: string,
  limit = 10,
): Promise<Leaderboard | null> {
  const query = new URLSearchParams({ courseVersion, rulesVersion, limit: String(limit) });
  return request<Leaderboard>(`/results/${encodeURIComponent(recordId)}/leaderboard?${query}`);
}

export async function fetchGhost(
  recordId: string,
  actorId: string,
  courseVersion: string,
  rulesVersion: string,
): Promise<GhostTrace | null> {
  const query = new URLSearchParams({ courseVersion, rulesVersion });
  const payload = await request<{ ghost: GhostTrace }>(
    `/results/${encodeURIComponent(recordId)}/ghost/${encodeURIComponent(actorId)}?${query}`,
  );
  return payload?.ghost ?? null;
}

/** `1:23.456`, the format the win panel already uses for times. */
export function formatMs(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const minutes = Math.floor(total / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const millis = total % 1000;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}
