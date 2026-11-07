import { Quaternion, Vector3, type Object3D } from "three";

export const GIANT_XR_FRESH_MS = 50;

/** Diagnostics count native select edges (including pinch), never squeeze or synthetic cancellations. */
export function observeGiantXrSelect(session: XRSession, record: (phase: "start" | "end") => void): () => void {
  const start = (): void => record("start"), end = (): void => record("end");
  session.addEventListener("selectstart", start);
  session.addEventListener("selectend", end);
  return () => {
    session.removeEventListener("selectstart", start);
    session.removeEventListener("selectend", end);
  };
}

export type GiantXrPose = {
  kind: "controller" | "hand";
  position: [number, number, number];
  orientation: [number, number, number, number];
  rayTracked: boolean;
};

function validPose(pose: XRPose | null | undefined): pose is XRPose {
  if (!pose || pose.emulatedPosition) return false;
  const { position: p, orientation: q } = pose.transform;
  return [p.x, p.y, p.z, q.x, q.y, q.z, q.w].every(Number.isFinite)
    && Math.hypot(q.x, q.y, q.z, q.w) > 1e-6;
}

/** Native-frame validation, independent of Three's last visible/cached spaces. */
export function readGiantXrPose(frame: XRFrame, reference: XRReferenceSpace, source: XRInputSource): GiantXrPose | null {
  try {
    const ray = source.targetRaySpace ? frame.getPose(source.targetRaySpace, reference) : null;
    const rayTracked = validPose(ray);
    if (source.hand) {
      const index = source.hand.get("index-finger-tip"), thumb = source.hand.get("thumb-tip");
      if (!index || !thumb) return null;
      const a = frame.getJointPose?.(index, reference), b = frame.getJointPose?.(thumb, reference);
      if (!validPose(a) || !validPose(b)) return null;
      const p = a.transform.position, t = b.transform.position, q = a.transform.orientation;
      return { kind: "hand", position: [(p.x + t.x) / 2, (p.y + t.y) / 2, (p.z + t.z) / 2],
        orientation: [q.x, q.y, q.z, q.w], rayTracked };
    }
    const pose = source.gripSpace ? frame.getPose(source.gripSpace, reference) : null;
    if (!validPose(pose) || !rayTracked) return null;
    const p = pose.transform.position, q = pose.transform.orientation;
    return { kind: "controller", position: [p.x, p.y, p.z], orientation: [q.x, q.y, q.z, q.w], rayTracked };
  } catch { return null; } // An inactive/stale XRFrame is a cancellation, never a release pose.
}

export function giantXrWorldPoint(pose: GiantXrPose, rig: Object3D, controllerOffset: readonly [number, number, number]): Vector3 {
  const point = new Vector3(...pose.position);
  if (pose.kind === "controller") point.add(new Vector3(...controllerOffset).applyQuaternion(new Quaternion(...pose.orientation).normalize()));
  return rig.localToWorld(point);
}

export type GiantXrRelease = { index: number; source: XRInputSource; at: number; frame: number };
/** A release event cannot authorize a stale frame, a replacement source, or a long gap. */
export function freshGiantXrRelease(release: GiantXrRelease, source: XRInputSource, now: number, frame: number): boolean {
  return release.source === source && frame > release.frame && Number.isFinite(now)
    && now >= release.at && now - release.at <= GIANT_XR_FRESH_MS;
}
