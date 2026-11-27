import { Euler, Quaternion, Vector3 } from "three";
import type { AgentWorldCommand, AgentWorldEntityPatch, AgentWorldRuntime, GraphysXAgentWorldApi } from "./agent-world-runtime";

export const NACRE = {
  cell: "nacre-cell", state: "nacre-mission", socket: "nacre-socket",
  home: [.65, 1.12, .15] as [number, number, number],
  dock: [1, 1.18, -8.15] as [number, number, number],
  destination: [0, 1.6, -22.5] as [number, number, number],
  chargeSeconds: 4.8, doorSeconds: 3.2, snapDistance: .44,
  planetModel: "/assets/quest3/planet-mission-v1.glb",
};
export const NACRE_PHASES = ["standby", "cell", "carrying", "docked", "charging", "opening", "ready", "complete"] as const;
export type NacrePhase = typeof NACRE_PHASES[number];
type WorldPort = Pick<AgentWorldRuntime, "getElapsedSeconds" | "getEntityObject" | "getEntityTags" | "applyHostPoses" | "subscribeEvents">;
type World = WorldPort & { api: GraphysXAgentWorldApi };
const NO_TAGS: readonly string[] = [];
const update = (id: string, patch: AgentWorldEntityPatch): AgentWorldCommand => ({ op: "update", id, patch });
const online = (phase: NacrePhase | null) => phase === "opening" || phase === "ready" || phase === "complete";

/** Mission facts are ordinary entity tags and authored properties. Only input ownership
 * and presentation caches live here; tracking poses do not create an undo snapshot per frame. */
export class NacreMission {
  private readonly world: World;
  private readonly off: () => void;
  private owner: string | null = null;
  private pendingRestore = false;
  private rejectedStep: { apply: () => boolean; waitingForPlayer: boolean } | null = null;
  private lastStage = -1;
  private audioKey = "";
  private audible = true;
  private readonly point = new Vector3();
  private readonly quaternion = new Quaternion();
  private readonly euler = new Euler();
  notice = "";

  constructor(world: WorldPort, api: GraphysXAgentWorldApi) {
    this.world = { api, getElapsedSeconds: () => world.getElapsedSeconds(), getEntityObject: id => world.getEntityObject(id),
      getEntityTags: id => world.getEntityTags(id),
      applyHostPoses: poses => world.applyHostPoses(poses), subscribeEvents: listener => world.subscribeEvents(listener) };
    this.off = world.subscribeEvents(event => {
      if (event.type === "world.loaded") {
        this.owner = null; this.pendingRestore = true; this.rejectedStep = null; this.audioKey = ""; this.lastStage = -1;
      }
    });
  }

  private tags(): readonly string[] { return this.world.getEntityTags(NACRE.state) ?? NO_TAGS; }
  get phase(): NacrePhase | null {
    const value = this.tags().find(tag => tag.startsWith("phase:"))?.slice(6);
    return NACRE_PHASES.includes(value as NacrePhase) ? value as NacrePhase : null;
  }
  get muted(): boolean { return this.tags().includes("audio:muted"); }
  get holding(): boolean { return this.phase === "carrying" && this.owner !== null; }
  get needsRetry(): boolean { return this.rejectedStep?.waitingForPlayer ?? false; }
  get progress(): number {
    const phase = this.phase;
    if (phase !== "charging" && phase !== "opening") return online(phase) ? 1 : 0;
    const duration = phase === "charging" ? NACRE.chargeSeconds : NACRE.doorSeconds;
    const start = Number(this.tags().find(tag => tag.startsWith("started:"))?.slice(8) ?? 0);
    const progress = (this.world.getElapsedSeconds() - start) / duration;
    return Number.isFinite(progress) ? progress >= 1 - 1e-9 ? 1 : Math.max(0, progress) : 0;
  }

  private phaseCommand(phase: NacrePhase): AgentWorldCommand {
    const tags = this.tags().filter(tag => !tag.startsWith("phase:") && !tag.startsWith("started:"));
    return update(NACRE.state, { tags: [...tags, "phase:" + phase, "started:" + this.world.getElapsedSeconds()] });
  }
  private change(commands: AgentWorldCommand[]): boolean {
    const result = this.world.api.transaction(commands);
    if (!result.ok) this.notice = "La station n’a pas pu appliquer cette action.";
    return result.ok;
  }
  private applyStep(apply: () => boolean): boolean {
    const committed = apply();
    // Keep the exact failed step, with one automatic retry before asking the player.
    this.rejectedStep = committed ? null : { apply, waitingForPlayer: false };
    return committed;
  }
  private cue(id: string, interactionId: string): void {
    if (this.audible && !this.muted) this.world.api.interact(id, interactionId);
  }
  private removeMotion(id: string, behaviorId: string): AgentWorldCommand[] {
    return this.world.api.query({ ids: [id] })[0]?.behaviors.some(b => b.id === behaviorId)
      ? [{ op: "detach-behavior", id, behaviorId }] : [];
  }
  private pulse(id: string, enabled: boolean): AgentWorldCommand[] {
    return [...this.removeMotion(id, "nacre-breath"), ...(enabled ? [{
      op: "attach-behavior" as const, id,
      behavior: { id: "nacre-breath", type: "pulse" as const, minimumScale: .985, maximumScale: 1.035, frequencyHz: 1.5 },
    }] : [])];
  }
  private setCell(position: [number, number, number]): AgentWorldCommand {
    return update(NACRE.cell, { transform: { position, rotationDegrees: [0, 0, 0] } });
  }

  begin(): boolean {
    if (this.phase !== "standby") return false;
    this.notice = "Prenez la cellule d’énergie sur son support.";
    return this.change([this.phaseCommand("cell")]);
  }
  take(owner: string): boolean {
    if (this.phase !== "cell" || this.owner || !owner.trim() || owner.length > 80) return false;
    if (!this.change([this.phaseCommand("carrying")])) return false;
    this.owner = owner; this.notice = "Cellule en main. Rejoignez le réacteur.";
    this.cue(NACRE.cell, "pickup"); return true;
  }
  move(owner: string, position: Vector3, rotation: Quaternion): boolean {
    if (this.owner !== owner || this.phase !== "carrying") return false;
    if (![...position.toArray(), ...rotation.toArray()].every(Number.isFinite)) return false;
    this.point.copy(position); this.point.x = Math.max(-6, Math.min(6, this.point.x));
    this.point.y = Math.max(.35, Math.min(3.2, this.point.y)); this.point.z = Math.max(-23, Math.min(3, this.point.z));
    this.quaternion.copy(rotation).normalize();
    this.world.applyHostPoses([{ id: NACRE.cell, position: this.point.toArray(), quaternion: this.quaternion.toArray() }]);
    return true;
  }
  release(owner: string, cancelled = false): boolean {
    if (this.owner !== owner || this.phase !== "carrying") return false;
    const object = this.world.getEntityObject(NACRE.cell);
    object?.getWorldPosition(this.point);
    const docked = !cancelled && !!object && this.point.distanceTo(new Vector3(...NACRE.dock)) <= NACRE.snapDistance;
    const phase = docked ? "docked" : "cell";
    if (!this.change([this.phaseCommand(phase), this.setCell(docked ? [...NACRE.dock] : [...NACRE.home])])) return false;
    this.owner = null;
    this.notice = docked ? "Cellule verrouillée. Lancez le réacteur." : cancelled ? "Suivi interrompu : cellule replacée sur son support." : "Retour magnétique au support. Visez le socle pour l’enclencher.";
    if (docked) this.cue("nacre-socket", "latch");
    return true;
  }
  activate(): boolean {
    if (this.rejectedStep) return this.needsRetry && this.applyStep(this.rejectedStep.apply);
    if (this.phase !== "docked") { this.notice = "Insérez d’abord la cellule d’énergie."; return false; }
    if (!this.changePhase("charging", this.pulse("nacre-reactor-core", true))) return false;
    this.lastStage = -1;
    this.notice = "Champ magnétique en formation…";
    return true;
  }

  private energy(level: number, powered: boolean): AgentWorldCommand[] {
    const commands: AgentWorldCommand[] = [
      update("nacre-reactor-core", { material: { color: powered ? "#207d9d" : "#153747", emissiveIntensity: .08 + level * 1.15 } }),
      update("nacre-reactor-light", { intensity: level * 5.5 }),
      update("nacre-charge-sound", { sound: { source: "/assets/quest3/audio/charge-loop.wav", volume: .1 + level * .2 } }),
      update("nacre-control", { material: { color: powered ? "#74e8c8" : "#d5a653", emissiveIntensity: .12 + level * .8 } }),
      update("nacre-reactor-particles", { emitter: { preset: "energy-orb", enabled: powered, rate: 12, maxParticles: 64 } }),
    ];
    for (let i = 0; i < 4; i++) commands.push(update("nacre-reactor-ring-" + i, { material: { emissiveIntensity: .1 + Math.max(0, level * 4 - i) * .65 } }));
    for (const side of ["port", "starboard"]) for (const z of [2, 8, 14, 21]) commands.push(update("nacre-luminaire-" + side + "-" + z, {
      material: { color: powered ? "#82e6e2" : "#b38043", emissive: powered ? "#41c9e3" : "#9c4a14", emissiveIntensity: .15 + level * 1.15 },
    }));
    for (let i = 0; i < 3; i++) commands.push(update("nacre-gyro-" + i, { visible: level > .1 }));
    return commands;
  }
  private doorCommands(open: boolean): AgentWorldCommand[] {
    return [-1, 1].flatMap(side => {
      const id = side < 0 ? "nacre-door-left" : "nacre-door-right";
      return [...this.removeMotion(id, "nacre-door-open"), update(id, { transform: { position: [side * (open ? 9.5 : 3.25), 3, -21.5] } })];
    });
  }
  private openDoors(): boolean {
    const commands = this.energy(1, true);
    for (const side of [-1, 1]) {
      const id = side < 0 ? "nacre-door-left" : "nacre-door-right";
      commands.push({ op: "attach-behavior", id, behavior: {
        id: "nacre-door-open", type: "keyframes", durationSeconds: NACRE.doorSeconds, startSeconds: this.world.getElapsedSeconds(), loop: false,
        positions: Array.from({ length: 9 }, (_, i): [number, number, number, number] => {
          const t = i / 8, ease = t * t * (3 - 2 * t);
          return [t * NACRE.doorSeconds, side * (3.25 + ease * 6.25), 3, -21.5];
        }),
      } });
    }
    if (!this.changePhase("opening", commands)) return false;
    this.notice = "Réacteur stable. Ouverture du belvédère…";
    return true;
  }
  private finishOpening(restore = false): boolean {
    const commands = this.doorCommands(true);
    if (restore) commands.push(...this.energy(1, true));
    if (!this.changePhase("ready", commands)) return false;
    this.notice = "Belvédère ouvert. Approchez de la Terre.";
    return true;
  }
  complete(observer: Vector3): boolean {
    if (this.phase !== "ready" || !observer.toArray().every(Number.isFinite) || observer.distanceTo(new Vector3(...NACRE.destination)) > 2.5) return false;
    if (!this.change([this.phaseCommand("complete")])) return false;
    this.notice = "Signal rétabli. Bienvenue au belvédère."; this.cue("nacre-window-chime", "success"); return true;
  }
  reset(): boolean {
    if (!this.phase) return false;
    if (!this.changePhase("cell", [this.setCell([...NACRE.home]), ...this.doorCommands(false), ...this.energy(0, false), ...this.pulse("nacre-reactor-core", false)])) return false;
    this.owner = null; this.lastStage = -1; this.rejectedStep = null;
    this.notice = "Une cellule. Un réacteur. À vous de jouer.";
    return true;
  }
  toggleMute(): void {
    if (!this.phase) return;
    const tags = this.tags().filter(t => t !== "audio:muted");
    this.change([update(NACRE.state, { tags: this.muted ? tags : [...tags, "audio:muted"] })]);
    this.audioKey = ""; this.syncAudio();
  }
  setAudible(value: boolean): void { this.audible = value; this.syncAudio(); }
  private audioCommands(phase: NacrePhase, enabled: boolean): AgentWorldCommand[] {
    return [
      update("nacre-charge-sound", { sound: { source: "/assets/quest3/audio/charge-loop.wav", autoplay: enabled && phase === "charging" } }),
      update("nacre-reactor-sound", { sound: { source: "/assets/quest3/audio/reactor-loop.wav", autoplay: enabled && online(phase) } }),
      update("nacre-door-sound", { sound: { source: "/assets/quest3/audio/door-loop.wav", autoplay: enabled && phase === "opening" } }),
    ];
  }
  private changePhase(phase: NacrePhase, commands: AgentWorldCommand[]): boolean {
    const enabled = this.audible && !this.muted;
    if (!this.change([this.phaseCommand(phase), ...commands, ...this.audioCommands(phase, enabled)])) return false;
    this.audioKey = `${phase}:${enabled}`;
    return true;
  }
  private syncAudio(): void {
    const phase = this.phase;
    if (!phase) return;
    const enabled = this.audible && !this.muted;
    const key = `${phase}:${enabled}`;
    if (this.audioKey !== key && this.change(this.audioCommands(phase, enabled))) this.audioKey = key;
  }
  tick(): void {
    const phase = this.phase;
    if (!phase) { this.owner = null; return; }
    const rejected = this.rejectedStep;
    if (rejected) {
      if (!rejected.waitingForPlayer) {
        if (rejected.apply()) this.rejectedStep = null;
        else rejected.waitingForPlayer = true;
      }
      this.syncAudio();
      return;
    }
    if (this.pendingRestore) {
      this.pendingRestore = false;
      // The briefly published first mission used the original immutable GLB URL.
      // Upgrade only that mission composition; original single-layer saves stay intact.
      const planet = this.world.api.query({ ids: ["nacre-planet"] })[0];
      if (planet?.asset?.url === "/assets/quest3/planet.glb" && this.world.api.query({ ids: ["nacre-clouds"] }).length) {
        const saved = this.world.api.export(), model = saved?.entities.find(entity => entity.id === "nacre-planet");
        if (saved && model?.asset) {
          model.asset.url = NACRE.planetModel;
          const result = this.world.api.create(saved);
          if (!result.ok) this.notice = "La station n’a pas pu reprendre sa Terre.";
          return; // The new world.loaded generation restores its checkpoint next frame.
        }
      }
      // Durable checkpoints survive export/load; tracked hands and partial startup do not.
      if (phase === "carrying") this.applyStep(() => this.changePhase("cell", [this.setCell([...NACRE.home])]));
      if (phase === "charging") this.applyStep(() => this.changePhase("docked", [...this.energy(0, false), ...this.pulse("nacre-reactor-core", false)]));
      if (phase === "opening") this.applyStep(() => this.finishOpening(true));
    } else if (phase === "charging") {
      const progress = this.progress, stage = Math.min(4, Math.floor(progress * 4 + 1e-9));
      if (progress >= 1) this.applyStep(() => this.openDoors());
      else if (stage !== this.lastStage) this.applyStep(() => {
        if (!this.change(this.energy(Math.max(.08, progress), false))) return false;
        this.lastStage = stage;
        this.notice = "Champ magnétique en formation…";
        return true;
      });
    } else if (phase === "opening" && this.progress >= 1) {
      this.applyStep(() => this.finishOpening());
    }
    if (phase !== "carrying") this.owner = null;
    this.syncAudio();
  }
  /** Commit the last tracked pose if an author explicitly saves while carrying. */
  commitHeldPose(): void {
    const object = this.world.getEntityObject(NACRE.cell);
    if (!this.holding || !object) return;
    this.euler.setFromQuaternion(object.quaternion);
    this.change([update(NACRE.cell, { transform: { position: object.position.toArray(), rotationDegrees: [this.euler.x, this.euler.y, this.euler.z].map(v => v * 180 / Math.PI) as [number, number, number] } })]);
  }
  dispose(): void { this.owner = null; this.off(); }
}
