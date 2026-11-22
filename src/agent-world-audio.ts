// The audio half of `sound` entities: the runtime keeps a placed, selectable source with
// its config in the document; THIS layer makes it audible. Host-side for two reasons the
// runtime cannot help with — spatial audio needs the camera's AudioListener, and browsers
// refuse to start an AudioContext without a user gesture. Same entity-for-identity /
// host-pass-for-effect split as force fields and the 2D overlay.
//
// Reconciliation is event-driven (spawn/update/remove/world.loaded mark it dirty), so the
// per-frame cost when nothing changed is a boolean check. PositionalAudio attaches to the
// entity's own Object3D, so a sound on a spinning parent moves with it for free.

import { Audio as ThreeAudio, AudioListener, AudioLoader, PositionalAudio, type Camera, type Object3D } from "three";
import type { AgentWorldRuntime } from "./agent-world-runtime";
import { agentWorldSoundUrl, type ResolvedAgentWorldSound } from "./agent-world-sounds";

type SceneAudioNode = ThreeAudio | PositionalAudio;
type TrackedSound = {
  node: SceneAudioNode;
  owner: Object3D;
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
  private readonly activeOneShots = new Set<SceneAudioNode>();
  private readonly unsubscribe: () => void;
  private readonly resumeContext: () => void;
  private dirty = true;
  private disposed = false;
  private sceneGeneration = 0;
  /** One-shot nodes actually started, cumulative. Smokes read this. */
  private oneShots = 0;

  constructor(camera: Camera, private readonly world: AgentWorldRuntime) {
    camera.add(this.listener);
    this.unsubscribe = world.subscribeEvents((event) => {
      if (event.type === "world.loaded") this.clearSceneAudio();
      if (
        event.type === "entity.spawned"
        || event.type === "entity.updated"
        || event.type === "entity.removed"
        || event.type === "world.loaded"
      ) {
        this.dirty = true;
      }
      // A `play-sound` interaction fired. The runtime only ever says "this happened" —
      // turning that into audible air is this layer's job, same as for sound entities.
      if (event.type === "interaction.sound") this.playOneShot(event.data);
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

  /** Keep spatial audio at the active viewing camera, including the tracked XR head. */
  setCamera(camera: Camera): void {
    camera.add(this.listener);
  }

  /** How many sound entities currently have an audio node. Smokes read this. */
  get trackedCount(): number {
    return this.tracked.size;
  }

  /**
   * How many `play-sound` one-shots have been started since boot. Cumulative on purpose:
   * a one-shot is over in a fraction of a second, so an instantaneous count would race
   * any assertion that tried to read it.
   */
  get oneShotCount(): number {
    return this.oneShots;
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
    // Entities gone from the world take their audio with them.
    for (const [id, entry] of this.tracked) {
      if (seen.has(id)) continue;
      this.release(entry.node);
      this.tracked.delete(id);
    }
  }

  /**
   * Play a fire-and-forget sound for a `play-sound` interaction.
   *
   * Deliberately NOT tracked in `this.tracked`: that map is the reconciliation of sound
   * *entities*, one node per entity id, and a one-shot has no entity to belong to. Ten
   * rings collected in a second must produce ten overlapping chimes, which a keyed map
   * cannot express — the eleventh would evict the tenth mid-decay.
   *
   * Silent-not-crashed on every failure path, matching the entity layer: an unresolvable
   * source, a locked AudioContext (the visitor has not clicked yet), or a failed decode
   * all mean no sound, never a broken frame.
   */
  private playOneShot(data: Record<string, unknown>): void {
    if (this.disposed) return;
    const source = typeof data.sound === "string" ? data.sound : "";
    const url = agentWorldSoundUrl(source);
    if (!url) return;
    if (this.listener.context.state !== "running") return;

    const positional = data.positional !== false;
    const volume = typeof data.volume === "number" ? data.volume : 0.8;
    const refDistance = typeof data.refDistance === "number" ? data.refDistance : 8;
    const targetIds = Array.isArray(data.targetIds) ? data.targetIds.filter((t): t is string => typeof t === "string") : [];
    const generation = this.sceneGeneration;
    const targets = (targetIds.length ? targetIds : [null]).map(id => ({
      id,
      object: positional && id ? this.world.getEntityObject(id) : null,
    }));

    void this.bufferFor(url).then((buffer) => {
      if (this.disposed || generation !== this.sceneGeneration || this.listener.context.state !== "running") return;
      // One node per target, so a sound aimed at three gates is heard at three places.
      for (const { id, object } of targets) {
        // The decoded buffer belongs to the original Object3D, even if its ID was reused.
        if (positional && (!id || !object || this.world.getEntityObject(id) !== object)) continue;
        const node = positional ? new PositionalAudio(this.listener) : new ThreeAudio(this.listener);
        this.activeOneShots.add(node);
        try {
          node.setBuffer(buffer);
          node.setLoop(false);
          node.setVolume(volume);
          if (node instanceof PositionalAudio) {
            node.setRefDistance(refDistance);
            object?.add(node);
          }
          node.onEnded = () => {
            node.isPlaying = false;
            this.releaseOneShot(node);
          };
          node.play();
          this.oneShots += 1;
        } catch {
          this.releaseOneShot(node);
        }
      }
    }).catch(() => {
      // Same contract as a sound entity with a bad source: silence, not a crashed layer.
    });
  }

  private reconcile(id: string, config: ResolvedAgentWorldSound, visible: boolean): void {
    const url = agentWorldSoundUrl(config.source);
    const owner = this.world.getEntityObject(id);
    const existing = this.tracked.get(id);

    // Source or spatial mode changed → rebuild the node; everything else adjusts in place.
    if (existing && (existing.owner !== owner || existing.url !== url || (existing.node instanceof PositionalAudio) !== config.positional)) {
      this.release(existing.node);
      this.tracked.delete(id);
    }

    if (!url || !owner) return; // an unresolvable source stays silent, exactly like a missing texture

    const entry = this.tracked.get(id) ?? this.track(id, owner, config, url);
    entry.config = config;
    entry.muted = !visible;
    if (entry.ready) this.applyConfig(entry);
  }

  private track(id: string, owner: Object3D, config: ResolvedAgentWorldSound, url: string): TrackedSound {
    const node = config.positional ? new PositionalAudio(this.listener) : new ThreeAudio(this.listener);
    const entry: TrackedSound = { node, owner, config, url, ready: false, muted: false };
    this.tracked.set(id, entry);
    // The node rides the entity's own object so transforms (and parents) carry it.
    if (config.positional) owner.add(node);
    void this.bufferFor(url).then((buffer) => {
      if (this.disposed || this.tracked.get(id) !== entry || this.world.getEntityObject(id) !== owner) return;
      entry.node.setBuffer(buffer);
      entry.ready = true;
      this.applyConfig(entry);
    }).catch(() => {
      if (this.tracked.get(id) !== entry) return;
      this.tracked.delete(id);
      this.release(node);
      // The next scene edit can retry the source without a retry loop in sync().
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

  private release(node: SceneAudioNode): void {
    if (node.isPlaying) node.stop();
    node.removeFromParent();
    node.disconnect();
    node.gain.disconnect();
  }

  private releaseOneShot(node: SceneAudioNode): void {
    if (this.activeOneShots.delete(node)) this.release(node);
  }

  private clearSceneAudio(): void {
    this.sceneGeneration += 1;
    for (const entry of this.tracked.values()) this.release(entry.node);
    this.tracked.clear();
    for (const node of this.activeOneShots) this.releaseOneShot(node);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe();
    window.removeEventListener("pointerdown", this.resumeContext, { capture: true });
    window.removeEventListener("keydown", this.resumeContext, { capture: true });
    this.clearSceneAudio();
    this.buffers.clear();
    this.listener.removeFromParent();
    void this.listener.context.close().catch(() => undefined);
  }
}
