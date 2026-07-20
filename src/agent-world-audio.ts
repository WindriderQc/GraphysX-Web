// The audio half of `sound` entities: the runtime keeps a placed, selectable source with
// its config in the document; THIS layer makes it audible. Host-side for two reasons the
// runtime cannot help with — spatial audio needs the camera's AudioListener, and browsers
// refuse to start an AudioContext without a user gesture. Same entity-for-identity /
// host-pass-for-effect split as force fields and the 2D overlay.
//
// Reconciliation is event-driven (spawn/update/remove/world.loaded mark it dirty), so the
// per-frame cost when nothing changed is a boolean check. PositionalAudio attaches to the
// entity's own Object3D, so a sound on a spinning parent moves with it for free.

import { Audio as ThreeAudio, AudioListener, AudioLoader, PositionalAudio, type Camera } from "three";
import type { AgentWorldRuntime } from "./agent-world-runtime";
import { agentWorldSoundUrl, type ResolvedAgentWorldSound } from "./agent-world-sounds";

type TrackedSound = {
  node: ThreeAudio | PositionalAudio;
  config: ResolvedAgentWorldSound;
  url: string;
  /** True once setBuffer succeeded; play() before that is deferred to the load callback. */
  ready: boolean;
  muted: boolean;
};

export class AgentWorldAudioLayer {
  private readonly listener = new AudioListener();
  private readonly loader = new AudioLoader();
  private readonly buffers = new Map<string, Promise<AudioBuffer>>();
  private readonly tracked = new Map<string, TrackedSound>();
  private readonly unsubscribe: () => void;
  private readonly resumeContext: () => void;
  private dirty = true;
  private disposed = false;

  constructor(camera: Camera, private readonly world: AgentWorldRuntime) {
    camera.add(this.listener);
    this.unsubscribe = world.subscribeEvents((event) => {
      if (
        event.type === "entity.spawned"
        || event.type === "entity.updated"
        || event.type === "entity.removed"
        || event.type === "world.loaded"
      ) {
        this.dirty = true;
      }
    });
    // Autoplay policy: the context starts suspended and only a gesture may resume it.
    // One capturing listener on window covers every entry surface (showroom click,
    // editor chrome, play-mode keys) without each of them knowing audio exists.
    this.resumeContext = () => {
      if (this.listener.context.state === "suspended") {
        void this.listener.context.resume().then(() => {
          // Sounds that wanted to autoplay while the context was locked start now.
          this.dirty = true;
        });
      }
    };
    window.addEventListener("pointerdown", this.resumeContext, { capture: true });
    window.addEventListener("keydown", this.resumeContext, { capture: true });
  }

  /** How many sound entities currently have an audio node. Smokes read this. */
  get trackedCount(): number {
    return this.tracked.size;
  }

  /** How many nodes are actually playing right now. */
  get playingCount(): number {
    let count = 0;
    for (const entry of this.tracked.values()) if (entry.node.isPlaying) count += 1;
    return count;
  }

  /** Called from the host's one tick. Cheap no-op unless an event marked the world dirty. */
  sync(): void {
    if (!this.dirty || this.disposed) return;
    this.dirty = false;

    const state = this.world.getState();
    const seen = new Set<string>();
    for (const entity of state?.entities ?? []) {
      if (entity.type !== "sound" || !entity.sound) continue;
      seen.add(entity.id);
      this.reconcile(entity.id, entity.sound, entity.visible);
    }
    // Entities gone from the world take their audio with them — including a whole-world
    // replacement, where every id changes at once.
    for (const [id, entry] of this.tracked) {
      if (seen.has(id)) continue;
      this.release(entry);
      this.tracked.delete(id);
    }
  }

  private reconcile(id: string, config: ResolvedAgentWorldSound, visible: boolean): void {
    const url = agentWorldSoundUrl(config.source);
    const existing = this.tracked.get(id);

    // Source or spatial mode changed → rebuild the node; everything else adjusts in place.
    if (existing && (existing.url !== url || (existing.node instanceof PositionalAudio) !== config.positional)) {
      this.release(existing);
      this.tracked.delete(id);
    }

    if (!url) return; // an unresolvable source stays silent, exactly like a missing texture

    const entry = this.tracked.get(id) ?? this.track(id, config, url);
    entry.config = config;
    entry.muted = !visible;
    if (entry.ready) this.applyConfig(entry);
  }

  private track(id: string, config: ResolvedAgentWorldSound, url: string): TrackedSound {
    const node = config.positional ? new PositionalAudio(this.listener) : new ThreeAudio(this.listener);
    const entry: TrackedSound = { node, config, url, ready: false, muted: false };
    this.tracked.set(id, entry);
    // The node rides the entity's own object so transforms (and parents) carry it.
    const object = this.world.getEntityObject(id);
    if (object && config.positional) object.add(node);
    void this.bufferFor(url).then((buffer) => {
      if (this.disposed || this.tracked.get(id) !== entry) return;
      entry.node.setBuffer(buffer);
      entry.ready = true;
      this.applyConfig(entry);
    }).catch(() => {
      // A failed decode is a silent entity, not a crashed layer. The URL stays recorded
      // so a later patch to a working source rebuilds the node.
    });
    return entry;
  }

  private applyConfig(entry: TrackedSound): void {
    const { node, config } = entry;
    node.setLoop(config.loop);
    node.setVolume(entry.muted ? 0 : config.volume);
    if (node instanceof PositionalAudio) node.setRefDistance(config.refDistance);
    const contextRunning = this.listener.context.state === "running";
    const shouldPlay = config.autoplay && contextRunning;
    if (shouldPlay && !node.isPlaying) node.play();
    if (!config.autoplay && node.isPlaying) node.stop();
  }

  private bufferFor(url: string): Promise<AudioBuffer> {
    let pending = this.buffers.get(url);
    if (!pending) {
      pending = this.loader.loadAsync(url);
      this.buffers.set(url, pending);
      // A failed load must not poison the cache for a retry after the store comes up.
      pending.catch(() => this.buffers.delete(url));
    }
    return pending;
  }

  private release(entry: TrackedSound): void {
    if (entry.node.isPlaying) entry.node.stop();
    entry.node.removeFromParent();
    entry.node.disconnect();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe();
    window.removeEventListener("pointerdown", this.resumeContext, { capture: true });
    window.removeEventListener("keydown", this.resumeContext, { capture: true });
    for (const entry of this.tracked.values()) this.release(entry);
    this.tracked.clear();
    this.listener.removeFromParent();
    void this.listener.context.close().catch(() => undefined);
  }
}
