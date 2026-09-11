import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

/** Small, ephemeral household build rooms. No accounts or external service. */
export function createKidxTeamRoute({ now = Date.now } = {}) {
  const rooms = new Map();
  const models = Object.fromEntries(["track3r", "spike3r"].map(id => [id, JSON.parse(readFileSync(new URL(`../src/kidx-${id}-build.json`, import.meta.url), "utf8")).steps.length]));
  const valid = data => data && Object.hasOwn(models, data.model) && Number.isInteger(data.step) && data.step >= 0 && data.step < models[data.model]
    && typeof data.prepared === "boolean" && Array.isArray(data.names) && data.names.length === 2 && data.names.every(n => typeof n === "string" && n.trim().length > 0 && n.length <= 24);
  return (req, res) => {
    const pathname = (req.url ?? "").split("?")[0];
    if (pathname !== "/kidx-team" && !pathname.startsWith("/kidx-team/")) return false;
    const send = (status, data) => { const body = JSON.stringify(data); res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", "content-length": Buffer.byteLength(body) }); res.end(body); };
    for (const [code, room] of rooms) if (now() - room.touched > 12 * 60 * 60 * 1000) rooms.delete(code);
    const code = /^\/kidx-team\/([a-zA-Z0-9_-]{8})$/.exec(pathname)?.[1];
    if (req.method === "GET" && code) { const room = rooms.get(code); if (room) room.touched = now(); send(room ? 200 : 404, room ? room.state : { error: "Ce duo est introuvable ou a expiré." }); return true; }
    if (req.method !== "POST") { send(405, { error: "Méthode non disponible." }); return true; }
    if (req.headers.origin && (() => { try { return new URL(req.headers.origin).host !== req.headers.host; } catch { return true; } })()) { send(403, { error: "Ouvre le duo depuis KidX." }); return true; }
    let body = "", large = false;
    req.on("data", chunk => { if (large) return; body += chunk; if (Buffer.byteLength(body) > 8192) { large = true; send(413, { error: "Demande trop longue." }); } });
    req.on("end", () => {
      if (large) return;
      let data; try { data = JSON.parse(body); } catch { send(400, { error: "Demande invalide." }); return; }
      if (!valid(data)) { send(400, { error: "Vérifie le modèle, l’étape et les deux prénoms." }); return; }
      let key = code, revision = 1;
      if (pathname === "/kidx-team") {
        if (rooms.size >= 32) { send(429, { error: "Tous les duos sont occupés. Réessaie plus tard." }); return; }
        do { key = randomBytes(6).toString("base64url"); } while (rooms.has(key));
      } else {
        const room = key && rooms.get(key);
        if (!room) { send(404, { error: "Ce duo est introuvable ou a expiré." }); return; }
        if (data.model !== room.state.model || data.revision !== room.state.revision) { send(409, { error: "L’autre écran a avancé. La dernière étape a été reprise.", state: room.state }); return; }
        revision = room.state.revision + 1;
      }
      const state = { code: key, model: data.model, step: data.step, prepared: data.prepared, names: data.names.map(n => n.trim()), revision };
      rooms.set(key, { state, touched: now() }); send(200, state);
    });
    return true;
  };
}
