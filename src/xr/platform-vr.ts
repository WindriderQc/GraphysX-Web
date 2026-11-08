import { Group, PerspectiveCamera, Vector3 } from "three";
import type { PlatformHost } from "../platform-host";
import { VrInputRig, type VrInputAction } from "./vr-input";
import { VrSessionController } from "./vr-session";

export interface PlatformVrOptions {
  /** Meters, floor-level spawn and yaw only. Desktop framing is never assumed to be safe. */
  position?: [number, number, number];
  yaw?: number;
  onAction?: (event: VrInputAction) => void;
}

/** Reusable opt-in adapter. No app rules, locomotion, secondary loop or scene serialization. */
export class PlatformVr {
  private static readonly owners = new WeakSet<PlatformHost>();
  readonly camera = new PerspectiveCamera(55, 1, .03, 260);
  readonly rig = new Group();
  readonly input: VrInputRig;
  readonly session: VrSessionController;
  readonly floorPosition = new Vector3();
  referenceSpace: "local-floor" | "local" = "local-floor";
  private readonly unsubscribe: () => void;
  private disposed = false;
  private releaseReferenceSpace: (() => void) | null = null;

  constructor(private readonly host: PlatformHost, options: PlatformVrOptions = {}) {
    if (host.mode !== "scene" || PlatformVr.owners.has(host)) {
      throw new Error("VR requires a scene-mode host with no other XR adapter.");
    }
    PlatformVr.owners.add(host);
    this.floorPosition.set(...(options.position ?? [0,0,0]));
    this.rig.position.copy(this.floorPosition);
    this.rig.rotation.y = options.yaw ?? 0;
    this.rig.name = "GraphysX VR rig";
    this.rig.add(this.camera);
    this.input = new VrInputRig(host.renderer,event => options.onAction?.(event));
    this.rig.add(this.input.group);
    host.scene.add(this.rig);
    host.renderer.xr.enabled = true;
    this.session = new VrSessionController({
      xr: navigator.xr, secureContext: window.isSecureContext,
      bindSession: async session => {
        if (host.mode !== "scene") throw new Error("Leave the editor or play surface before entering VR.");
        // local-floor is optional; local-only runtimes get a documented 1.6 m seated origin.
        try { await session.requestReferenceSpace("local-floor"); this.referenceSpace = "local-floor"; }
        catch { this.referenceSpace = "local"; }
        if (this.session.session !== session) return;
        if (host.mode !== "scene") throw new Error("The scene surface changed while VR was starting.");
        this.rig.position.copy(this.floorPosition);
        if (this.referenceSpace === "local") this.rig.position.y += 1.6;
        host.renderer.xr.setReferenceSpaceType(this.referenceSpace);
        await host.renderer.xr.setSession(session);
        if (this.session.session !== session) return;
        const space = host.renderer.xr.getReferenceSpace();
        if (space) {
          const reset = () => this.input.setActive(false);
          space.addEventListener("reset", reset);
          this.releaseReferenceSpace = () => space.removeEventListener("reset", reset);
        }
      },
      onStarted: session => { host.setImmersiveCamera(this.camera); this.input.setActive(session.visibilityState === "visible"); },
      onEnded: () => {
        this.releaseReferenceSpace?.(); this.releaseReferenceSpace = null;
        this.input.setActive(false); host.setImmersiveCamera(null);
      },
      onInterrupted: () => this.input.setActive(false),
    });
    this.unsubscribe = host.subscribeFrame(seconds => {
      const session = this.session.session;
      if (session && host.mode !== "scene") { void this.session.exit(); return; }
      // Hidden/blurred frames cannot create fresh actions; cancellation also prevents stale grabs.
      this.input.setActive(this.session.snapshot.phase === "active" && session?.visibilityState === "visible");
      this.input.update(seconds);
    });
    void this.session.checkSupport();
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    await this.session.dispose();
    if (this.session.session) return; // Failed end: retain resources and allow a retry.
    this.disposed = true;
    this.unsubscribe(); this.input.dispose(); this.rig.removeFromParent();
    this.host.setImmersiveCamera(null);
    this.host.renderer.xr.enabled = false;
    PlatformVr.owners.delete(this.host);
  }
}
