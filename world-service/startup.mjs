// Explicit startup intent: a failed resume is never a request for a fresh world.
import { readFileSync, statSync } from "node:fs";
import { verifyCheckpoint } from "./archive.mjs";

export function loadStartupSnapshot({ startMode = "fresh", snapshotPath, resumePath } = {}) {
  if (!["fresh", "resume"].includes(startMode)) throw new Error("WORLD_START_MODE needs fresh or resume");
  if (startMode === "resume" && !snapshotPath && !resumePath) throw new Error("Resume mode requires WORLD_SNAPSHOT_PATH or --resume");
  const path = resumePath || (startMode === "resume" ? snapshotPath : null);
  if (!path) return { snapshot: undefined, path: null };
  let content;
  try {
    if (statSync(path).size > 64 * 1024 * 1024) throw new Error("Resume checkpoint exceeds 64 MiB");
    content = readFileSync(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") throw new Error("Resume checkpoint does not exist; initialize explicitly with fresh mode or provide a saved snapshot");
    throw error;
  }
  const snapshot = JSON.parse(content);
  verifyCheckpoint(snapshot);
  return { snapshot, path };
}
