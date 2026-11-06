import { isBallsySnapshot, parseGiantCommand, type BallsySnapshot } from "../server/ballsy-protocol.mjs";
import type { VolcanoCommand } from "./ballsy-volcano";

type HostCredentials = { roomId: string; hostToken: string; code: string };
type GuestCredentials = { roomId: string; guestToken: string };
type QueuedCommand = { sequence: number; roundId: string; command: VolcanoCommand };
export type BallsyLinkState = { available: boolean; code: string | null; connected: boolean; message: string };

// Keep host and Quest traffic inside this build's mount (root by default).
const relayBase = `${import.meta.env.BASE_URL}api/ballsy/`;

async function json<T>(url: string, method = "GET", value?: unknown, token?: string, keepalive = false): Promise<T> {
  const response = await fetch(url, { method, headers: { ...(value === undefined ? {} : { "content-type": "application/json" }), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(value === undefined ? {} : { body: JSON.stringify(value) }), cache: "no-store", signal: AbortSignal.timeout(1400), keepalive });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Relais indisponible.");
  return data as T;
}
export async function ballsyRelayAvailable(): Promise<boolean> {
  try { return (await fetch(window.location.href, { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(1400) })).headers.get("X-Ballsy-Relay") === "1"; }
  catch { return false; }
}

export function createBallsyHostLink(options: { snapshot: () => BallsySnapshot; command: (c: VolcanoCommand) => void; presence: (connected: boolean) => void }) {
  let credentials: HostCredentials | null = null, timer = 0, ack = 0, active = true, generation = 0;
  let connected = false, lastReply = 0, heldAt = 0, holding = false, message = "";
  const presence = (next: boolean): void => { if (next !== connected) { connected = next; options.presence(next); } };
  const maintain = (): void => {
    if (holding && performance.now() - heldAt > 450) { holding = false; options.command({ type: "release" }); }
    if (connected && performance.now() - lastReply > 1500) { presence(false); holding = false; options.command({ type: "release" }); }
  };
  async function pump(current: number): Promise<void> {
    if (!active || current !== generation || !credentials) return;
    const c = credentials;
    try {
      const reply = await json<{ commands: QueuedCommand[]; guestConnected: boolean }>(`${relayBase}${c.roomId}/host`, "POST", { snapshot: options.snapshot(), ack }, c.hostToken);
      if (!active || current !== generation) return;
      lastReply = performance.now(); message = "";
      presence(reply.guestConnected);
      const commands = reply.commands.filter((entry, index, all) => !(entry.command.type === "shovel" && entry.command.held && all[index + 1]?.command.type === "shovel" && (all[index + 1].command as { held?: boolean }).held));
      for (const command of commands) {
        if (command.sequence <= ack) continue;
        ack = command.sequence;
        if (command.roundId !== options.snapshot().roundId || !parseGiantCommand(command.command)) continue;
        if (command.command.type === "dig" || command.command.type === "shovel" && command.command.held) { heldAt = performance.now(); holding = true; }
        if (command.command.type === "release" || command.command.type === "shovel" && !command.command.held) holding = false;
        options.command(command.command);
      }
    } catch (error) { message = error instanceof Error ? error.message : "Relais indisponible."; maintain(); }
    if (active && current === generation) timer = window.setTimeout(() => { void pump(current); }, 90);
  }
  return {
    async open(): Promise<void> {
      if (credentials) return;
      const current = ++generation;
      credentials = await json<HostCredentials>(`${relayBase}create`, "POST", {});
      if (!active || current !== generation) return;
      ack = 0; lastReply = performance.now();
      await pump(current);
    },
    maintain,
    state: (): BallsyLinkState => ({ available: true, code: credentials?.code ?? null, connected, message }),
    dispose(): void {
      active = false; generation++; window.clearTimeout(timer); presence(false); holding = false;
      const c = credentials; credentials = null;
      if (c) void json(`${relayBase}${c.roomId}/close`, "POST", {}, c.hostToken, true).catch(() => undefined);
    },
  };
}

export function createBallsyGuestLink(onUpdate: () => void) {
  let credentials: GuestCredentials | null = null, timer = 0, generation = 0;
  let snapshot: BallsySnapshot | null = null, live = false, lastReply = 0, message = "Saisis le code affiché sur la télé.";
  let chain: Promise<unknown> = Promise.resolve();
  async function pump(current: number): Promise<void> {
    if (current !== generation || !credentials) return;
    const c = credentials;
    try {
      const reply = await json<{ snapshot: unknown; hostLive: boolean }>(`${relayBase}${c.roomId}/view`, "GET", undefined, c.guestToken);
      if (current !== generation) return;
      if (!isBallsySnapshot(reply.snapshot)) throw new Error("L'écran n'a pas encore partagé sa course.");
      snapshot = reply.snapshot; live = reply.hostLive; lastReply = performance.now();
      message = live ? snapshot.phase === "racing" ? "La pelle est à toi." : "En attente de la course sur la télé." : "L'écran ne répond plus. La maquette est figée.";
    } catch (error) { live = false; message = error instanceof Error ? error.message : "Connexion interrompue."; }
    onUpdate();
    if (current === generation && credentials) timer = window.setTimeout(() => { void pump(current); }, 90);
  }
  const maintain = (): void => { if (live && performance.now() - lastReply > 1500) { live = false; message = "L'écran ne répond plus. La maquette est figée."; onUpdate(); } };
  const leave = (): void => {
    generation++; window.clearTimeout(timer);
    const c = credentials; credentials = null; live = false; snapshot = null;
    message = "Pelle rendue à l'écran.";
    if (c) void json(`${relayBase}${c.roomId}/leave`, "POST", {}, c.guestToken, true).catch(() => undefined);
    onUpdate();
  };
  return {
    async join(code: string): Promise<void> {
      if (credentials) leave();
      const current = ++generation;
      message = "Connexion à la piste…"; onUpdate();
      const next = await json<GuestCredentials>(`${relayBase}join`, "POST", { code });
      if (current !== generation) return;
      credentials = next;
      await pump(current);
    },
    send(command: VolcanoCommand): void {
      if (!credentials || !live || !snapshot || snapshot.phase !== "racing" || !parseGiantCommand(command)) return;
      const c = credentials, roundId = snapshot.roundId, current = generation;
      chain = chain.then(async () => {
        if (current !== generation) return;
        const reply = await json<{ accepted: boolean; reason?: string }>(`${relayBase}${c.roomId}/command`, "POST", { id: crypto.randomUUID(), roundId, command }, c.guestToken);
        if (!reply.accepted && reply.reason) message = reply.reason;
      }).catch((error) => { live = false; message = error instanceof Error ? error.message : "Connexion interrompue."; onUpdate(); });
    },
    maintain, leave,
    state: () => ({ joined: !!credentials, live, message, snapshot: snapshot ? structuredClone(snapshot) : null }),
  };
}
