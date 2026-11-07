import { isBallsySnapshot, parseGiantCommand, type BallsySnapshot, type GiantCommand } from "../server/ballsy-protocol.mjs";

type HostCredentials = { roomId: string; hostToken: string; code: string };
type GuestCredentials = { roomId: string; guestToken: string };
type QueuedCommand = { sequence: number; roundId: string; command: GiantCommand };
export type BallsyLinkState = { available: boolean; code: string | null; connected: boolean; message: string;
  status: "idle" | "opening" | "open" | "interrupted" | "expired" };

// Static production uses nginx's already-published store path. A standalone local preview
// advertises its own route, but still has to pass the real JSON capability probe.
const mount = import.meta.env?.BASE_URL ?? "/";
let relayBase = `${mount}store/api/ballsy/`;
let relayVerified = false;
let relayProbe: Promise<boolean> | null = null;
const MAX_FAILED_POLLS = 5;
class BallsyHttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
const terminalRoomError = (error: unknown): boolean => error instanceof BallsyHttpError && [401, 403, 404, 410].includes(error.status);

async function json<T>(url: string, method = "GET", value?: unknown, token?: string, keepalive = false): Promise<T> {
  const response = await fetch(url, { method, headers: { ...(value === undefined ? {} : { "content-type": "application/json" }), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(value === undefined ? {} : { body: JSON.stringify(value) }), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(1400), keepalive });
  // A proxy can return HTML for a missing endpoint. Preserve the HTTP status even then.
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new BallsyHttpError(response.status,
    data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : "Relais indisponible.");
  if (data === null) throw new Error("Réponse du relais invalide.");
  return data as T;
}
export function ballsyRelayAvailable(): Promise<boolean> {
  if (relayVerified) return Promise.resolve(true);
  if (relayProbe) return relayProbe;
  relayProbe = (async () => {
    try {
      const page = await fetch(window.location.href, { method: "HEAD", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(1400) });
      const route = `${mount}${page.headers.get("X-Ballsy-Relay") === "1" ? "" : "store/"}api/ballsy/`;
      const url = new URL(route, window.location.href);
      if (url.origin !== window.location.origin) return false;
      const response = await fetch(new URL("status", url), { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(1400) });
      if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) return false;
      const status: unknown = await response.json();
      if (!status || typeof status !== "object" || !("schema" in status) || status.schema !== "ballsy-room/v1") return false;
      relayBase = route;
      relayVerified = true;
      return true;
    } catch { return false; }
    finally { relayProbe = null; }
  })();
  return relayProbe;
}
async function requireRelay(): Promise<void> {
  if (!await ballsyRelayAvailable()) throw new Error("Le relais du géant est indisponible. Réessaie dans un instant.");
}

export function createBallsyHostLink(options: { snapshot: () => BallsySnapshot; command: (c: GiantCommand) => void; presence: (connected: boolean) => void }) {
  let credentials: HostCredentials | null = null, timer = 0, ack = 0, active = true, generation = 0;
  let connected = false, lastReply = 0, heldAt = 0, holding = false, message = "";
  let status: BallsyLinkState["status"] = "idle", failedPolls = 0;
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
      lastReply = performance.now(); message = ""; failedPolls = 0; status = "open";
      presence(reply.guestConnected);
      const commands = (reply.guestConnected ? reply.commands : []).filter((entry, index, all) => !(entry.command.type === "shovel" && entry.command.held && all[index + 1]?.command.type === "shovel" && (all[index + 1].command as { held?: boolean }).held));
      for (const command of commands) {
        if (command.sequence <= ack) continue;
        ack = command.sequence;
        if (command.roundId !== options.snapshot().roundId || !parseGiantCommand(command.command)) continue;
        if (command.command.type === "dig" || command.command.type === "shovel" && command.command.held) { heldAt = performance.now(); holding = true; }
        if (command.command.type === "release" || command.command.type === "shovel" && !command.command.held) holding = false;
        options.command(command.command);
      }
    } catch (error) {
      if (!active || current !== generation) return;
      if (terminalRoomError(error)) {
        credentials = null; ack = 0; failedPolls = 0; generation++; window.clearTimeout(timer);
        relayVerified = false; status = "expired"; holding = false;
        message = "Cette invitation n'est plus valide. Clique sur Nouvelle invitation pour obtenir un nouveau code.";
        presence(false); options.command({ type: "release" });
        return;
      }
      message = error instanceof Error ? error.message : "Relais indisponible.";
      maintain();
      if (++failedPolls >= MAX_FAILED_POLLS) {
        status = "interrupted"; generation++; window.clearTimeout(timer); holding = false;
        message = "Connexion interrompue. Clique sur Réessayer la connexion. Le code est conservé tant que la salle existe.";
        presence(false); options.command({ type: "release" });
        return;
      }
    }
    if (active && current === generation) timer = window.setTimeout(() => { void pump(current); }, 90);
  }
  return {
    async open(): Promise<void> {
      if (!active || status === "opening") return;
      if (credentials) {
        if (status === "interrupted") {
          const current = ++generation; failedPolls = 0; status = "open";
          await pump(current);
        }
        return;
      }
      const current = ++generation;
      status = "opening"; message = "";
      try {
        await requireRelay();
        if (!active || current !== generation) return;
        const next = await json<HostCredentials>(`${relayBase}create`, "POST", {});
        if (!active || current !== generation) {
          void json(`${relayBase}${next.roomId}/close`, "POST", {}, next.hostToken, true).catch(() => undefined);
          return;
        }
        credentials = next;
        ack = 0; failedPolls = 0; lastReply = performance.now(); status = "open";
        await pump(current);
      } catch (error) {
        if (active && current === generation) {
          status = "interrupted";
          message = error instanceof Error ? error.message : "Connexion indisponible. Réessaie dans un instant.";
        }
        throw error;
      }
    },
    maintain,
    state: (): BallsyLinkState => ({ available: relayVerified, code: credentials?.code ?? null, connected, message, status }),
    dispose(): void {
      active = false; generation++; window.clearTimeout(timer); presence(false); holding = false; status = "idle";
      const c = credentials; credentials = null;
      if (c) void json(`${relayBase}${c.roomId}/close`, "POST", {}, c.hostToken, true).catch(() => undefined);
    },
  };
}

export function createBallsyGuestLink(onUpdate: () => void) {
  let credentials: GuestCredentials | null = null, timer = 0, generation = 0;
  let snapshot: BallsySnapshot | null = null, live = false, lastReply = 0, message = "Saisis le code affiché sur la télé.";
  let chain: Promise<unknown> = Promise.resolve();
  const expire = (): void => {
    generation++; window.clearTimeout(timer); credentials = null; live = false; snapshot = null; relayVerified = false;
    message = "Cette connexion n'est plus valide. Rejoins la partie avec le code actuellement affiché sur la télé.";
    onUpdate();
  };
  async function pump(current: number): Promise<void> {
    if (current !== generation || !credentials) return;
    const c = credentials;
    try {
      const reply = await json<{ snapshot: unknown; hostLive: boolean }>(`${relayBase}${c.roomId}/view`, "GET", undefined, c.guestToken);
      if (current !== generation) return;
      if (!isBallsySnapshot(reply.snapshot)) throw new Error("L'écran n'a pas encore partagé sa course.");
      snapshot = reply.snapshot; live = reply.hostLive; lastReply = performance.now();
      message = live ? snapshot.phase === "racing" ? "Les ballons sont à toi." : "En attente de la course sur la télé." : "L'écran ne répond plus. La maquette est figée.";
    } catch (error) {
      if (current !== generation) return;
      if (terminalRoomError(error)) { expire(); return; }
      live = false; message = error instanceof Error ? error.message : "Connexion interrompue.";
    }
    onUpdate();
    if (current === generation && credentials) timer = window.setTimeout(() => { void pump(current); }, 90);
  }
  const maintain = (): void => { if (live && performance.now() - lastReply > 1500) { live = false; message = "L'écran ne répond plus. La maquette est figée."; onUpdate(); } };
  const leave = (): void => {
    generation++; window.clearTimeout(timer);
    const c = credentials; credentials = null; live = false; snapshot = null;
    message = "Géant déconnecté.";
    if (c) void json(`${relayBase}${c.roomId}/leave`, "POST", {}, c.guestToken, true).catch(() => undefined);
    onUpdate();
  };
  return {
    async join(code: string): Promise<void> {
      if (credentials) leave();
      const current = ++generation;
      message = "Connexion à la piste…"; onUpdate();
      try {
        await requireRelay();
        if (current !== generation) return;
        const next = await json<GuestCredentials>(`${relayBase}join`, "POST", { code });
        if (current !== generation) {
          void json(`${relayBase}${next.roomId}/leave`, "POST", {}, next.guestToken, true).catch(() => undefined);
          return;
        }
        credentials = next;
        await pump(current);
      } catch (error) {
        // A previous join must not reach the UI's error handler after a newer join won.
        if (current !== generation) return;
        throw error;
      }
    },
    send(command: GiantCommand): void {
      if (!credentials || !live || !snapshot || snapshot.phase !== "racing" || !parseGiantCommand(command)) return;
      const c = credentials, roundId = snapshot.roundId, current = generation, queuedAt = performance.now();
      chain = chain.then(async () => {
        if (current !== generation || !live || snapshot?.roundId !== roundId || snapshot.phase !== "racing" || performance.now() - queuedAt > 500) return;
        const reply = await json<{ accepted: boolean; reason?: string }>(`${relayBase}${c.roomId}/command`, "POST", { id: crypto.randomUUID(), roundId, command }, c.guestToken);
        if (current !== generation || !live || snapshot?.roundId !== roundId || snapshot.phase !== "racing") return;
        if (!reply.accepted && reply.reason) message = reply.reason;
      }).catch((error) => {
        if (current !== generation) return;
        if (terminalRoomError(error)) { expire(); return; }
        live = false; message = error instanceof Error ? error.message : "Connexion interrompue."; onUpdate();
      });
    },
    maintain, leave,
    state: () => ({ joined: !!credentials, live, message, snapshot: snapshot ? structuredClone(snapshot) : null }),
  };
}
