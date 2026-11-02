// Explicit startup intent: a failed resume is never a request for a fresh world.
import { readFileSync, statSync } from "node:fs";
import { checkpointDigest, verifyCheckpoint } from "./archive.mjs";

export const SHA256 = /^[a-f0-9]{64}$/;

/** One verified checkpoint file and the digest that names it. A missing file throws ENOENT. */
export function readCheckpoint(path) {
  if (statSync(path).size > 64 * 1024 * 1024) throw new Error("Checkpoint exceeds 64 MiB");
  const value = JSON.parse(readFileSync(path, "utf8"));
  const sha256 = checkpointDigest(value);
  return { snapshot: verifyCheckpoint(value), sha256 };
}

/**
 * `fresh` (default), `resume` (WORLD_SNAPSHOT_PATH or --resume must exist), or `fork`: a new
 * game from the checkpoint at `forkPath`, pinned by `forkSha256` when given. A fork needs
 * `snapshotPath` and happens once: when that file already holds a fork of the same source,
 * startup resumes it; when it holds any other island, startup refuses rather than replace it.
 */
export function loadStartupSnapshot({ startMode = "fresh", snapshotPath, resumePath, forkPath, forkSha256 } = {}) {
  if (!["fresh", "resume", "fork"].includes(startMode)) throw new Error("WORLD_START_MODE needs fresh, resume or fork");
  if (startMode === "fork") return loadFork({ snapshotPath, forkPath, forkSha256, resumePath });
  if (startMode === "resume" && !snapshotPath && !resumePath) throw new Error("Resume mode requires WORLD_SNAPSHOT_PATH or --resume");
  const path = resumePath || (startMode === "resume" ? snapshotPath : null);
  if (!path) return { snapshot: undefined, path: null };
  try {
    return { snapshot: readCheckpoint(path).snapshot, path };
  } catch (error) {
    if (error.code === "ENOENT") throw new Error("Resume checkpoint does not exist; initialize explicitly with fresh mode or provide a saved snapshot");
    throw error;
  }
}

function loadFork({ snapshotPath, forkPath, forkSha256, resumePath }) {
  if (resumePath) throw new Error("Fork mode does not combine with --resume / WORLD_RESUME_PATH");
  if (!forkPath || !snapshotPath) throw new Error("Fork mode requires WORLD_FORK_PATH and WORLD_SNAPSHOT_PATH");
  if (forkSha256 !== undefined && !SHA256.test(forkSha256)) throw new Error("WORLD_FORK_SHA256 needs a lowercase SHA-256");
  let source;
  try { source = readCheckpoint(forkPath); } catch (error) {
    if (error.code === "ENOENT") throw new Error("Fork source checkpoint does not exist");
    throw error;
  }
  if (forkSha256 && source.sha256 !== forkSha256) throw new Error("Fork source checkpoint does not match WORLD_FORK_SHA256");
  let current;
  try { current = readCheckpoint(snapshotPath); } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (current) {
    // Restarts continue the fork; they never start yet another one.
    if (current.snapshot.forkedFrom?.sha256 === source.sha256) return { snapshot: current.snapshot, path: snapshotPath };
    throw new Error("WORLD_SNAPSHOT_PATH already holds another island; keep it aside before forking, or use resume");
  }
  return { snapshot: source.snapshot, path: forkPath, fork: { sha256: source.sha256 } };
}
