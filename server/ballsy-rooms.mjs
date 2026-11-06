import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { isBallsySnapshot, parseGiantCommand } from "./ballsy-protocol.mjs";

export class BallsyRoomError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new BallsyRoomError(status, message); };
const tokenMatches = (a, b) => typeof a === "string" && /^[a-f0-9]{48}$/.test(a) && !!b && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const token = () => randomBytes(24).toString("hex");
const code = () => [...randomBytes(8)].map((n) => "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"[n & 31]).join("");

/** Ephemeral, one authority and one giant. No persistence, arbitrary RPC or simulation here. */
export function createBallsyRooms({ now = Date.now } = {}) {
  const rooms = new Map();
  const cleanup = () => { for (const [id, r] of rooms) if (now() - r.hostSeen > 300_000) rooms.delete(id); };
  const find = (id) => { cleanup(); return rooms.get(id) ?? fail(404, "Partie introuvable."); };
  const host = (id, auth) => { const r = find(id); if (!tokenMatches(auth, r.hostToken)) fail(403, "Accès hôte refusé."); return r; };
  const guest = (id, auth) => { const r = find(id); if (!tokenMatches(auth, r.guestToken) || now() - r.guestSeen > 2500) fail(403, "Connexion du géant expirée."); r.guestSeen = now(); return r; };
  const online = (r) => !!r.snapshot && now() - r.hostSeen < 1500;
  return {
    create() {
      cleanup();
      if (rooms.size >= 8) fail(429, "Trop de parties ouvertes. Réessayez plus tard.");
      const r = { id: randomUUID(), code: code(), hostToken: token(), hostSeen: now(), guestToken: null,
        guestSeen: 0, snapshot: null, sequence: 0, commands: [], ids: new Map(), commandTimes: [] };
      rooms.set(r.id, r);
      return { roomId: r.id, hostToken: r.hostToken, code: r.code };
    },
    join(input) {
      cleanup();
      if (typeof input !== "string" || input.length > 12) fail(400, "Code invalide.");
      const wanted = input.replace(/[\s-]/g, "").toUpperCase();
      const r = [...rooms.values()].find((candidate) => candidate.code === wanted);
      if (!r || !online(r)) fail(404, "Code absent ou écran déconnecté.");
      if (r.guestToken && now() - r.guestSeen <= 2500) fail(409, "Un géant tient déjà la pelle.");
      r.guestToken = token(); r.guestSeen = now(); r.commands = []; r.ids.clear(); r.commandTimes = [];
      return { roomId: r.id, guestToken: r.guestToken };
    },
    publish(id, auth, packet) {
      const r = host(id, auth);
      if (!packet || !isBallsySnapshot(packet.snapshot) || !Number.isSafeInteger(packet.ack) || packet.ack < 0 || packet.ack > r.sequence) fail(400, "État de course invalide.");
      if (r.snapshot?.roundId !== packet.snapshot.roundId) { r.commands = []; r.ids.clear(); }
      r.snapshot = structuredClone(packet.snapshot); r.hostSeen = now();
      r.commands = r.commands.filter((c) => c.sequence > packet.ack && now() - c.at < 1000 && c.roundId === r.snapshot.roundId);
      return { commands: r.commands.map(({ at: _at, ...c }) => c), guestConnected: !!r.guestToken && now() - r.guestSeen <= 2500 };
    },
    read(id, auth) {
      const r = guest(id, auth);
      return { snapshot: structuredClone(r.snapshot), hostLive: online(r) };
    },
    command(id, auth, packet) {
      const r = guest(id, auth);
      const parsed = parseGiantCommand(packet?.command);
      if (!parsed || !/^[A-Za-z0-9-]{8,80}$/.test(packet?.id) || typeof packet?.roundId !== "string") fail(400, "Commande du géant invalide.");
      if (r.ids.has(packet.id)) return { accepted: true, sequence: r.ids.get(packet.id) };
      if (!online(r) || r.snapshot.phase !== "racing" || packet.roundId !== r.snapshot.roundId) return { accepted: false, reason: "Attendez la course en cours." };
      r.commandTimes = r.commandTimes.filter((at) => now() - at < 1000);
      if (r.commandTimes.length >= 25 || r.commands.length >= 32) return { accepted: false, reason: "Attendez le retour de la pelle." };
      r.commandTimes.push(now());
      const sequence = ++r.sequence;
      r.commands.push({ sequence, id: packet.id, roundId: packet.roundId, command: parsed, at: now() });
      r.ids.set(packet.id, sequence);
      if (r.ids.size > 128) r.ids.delete(r.ids.keys().next().value);
      return { accepted: true, sequence };
    },
    leave(id, auth) {
      const r = guest(id, auth);
      r.guestToken = null; r.guestSeen = 0; r.commands = [];
      return { ok: true };
    },
    close(id, auth) { const r = host(id, auth); rooms.delete(r.id); return { ok: true }; },
  };
}
