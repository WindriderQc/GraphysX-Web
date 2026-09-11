export type KidxTeamState = { code: string; model: string; step: number; prepared: boolean; names: string[]; revision: number };
export type KidxTeamDraft = Omit<KidxTeamState, "code" | "revision">;
const valid = (s: KidxTeamState) => s && /^[a-zA-Z0-9_-]{8}$/.test(s.code) && ["track3r", "spike3r"].includes(s.model) && Number.isInteger(s.step)
  && s.step >= 0 && s.step < (s.model === "track3r" ? 28 : 56) && typeof s.prepared === "boolean" && Number.isInteger(s.revision) && s.revision > 0
  && Array.isArray(s.names) && s.names.length === 2 && s.names.every(n => typeof n === "string" && n.length <= 24);

export function createKidxTeam(model: string, receive: (state: KidxTeamState) => void, report: (message: string) => void) {
  let room: KidxTeamState | null = null, busy = false, nextPollAt = 0, disposed = false;
  let generation = 0;
  let queued: KidxTeamDraft | null = null;
  const abort = new AbortController();
  const request = async (url: string, data?: unknown) => {
    const token = generation;
    const response = await fetch(url, { method: data ? "POST" : "GET", ...(data ? { headers: { "content-type": "application/json" }, body: JSON.stringify(data) } : {}), signal: abort.signal });
    if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("Le duo entre écrans demande le serveur local KidX. Le duo sur cet écran reste disponible.");
    const value = await response.json();
    if (!response.ok && !(response.status === 409 && valid(value.state))) throw new Error(value.error ?? "Connexion au duo indisponible.");
    const state = response.status === 409 ? value.state : value;
    if (!valid(state) || state.model !== model) throw new Error("Ce code appartient à un autre modèle. Ouvre le même modèle sur les deux écrans.");
    if (disposed || token !== generation) return;
    if (!room || room.revision !== state.revision || room.code !== state.code) { room = state; receive(state); }
    report(response.status === 409 ? value.error : `Duo ${state.code} · écrans synchronisés. Partage ce code avec l’autre constructeur.`);
  };
  const safe = async (operation: () => Promise<void>) => {
    if (disposed || busy) return;
    busy = true;
    try { await operation(); } catch (error) { if (!disposed) report(error instanceof Error ? error.message : "Connexion interrompue. Réessaie."); }
    finally { busy = false; }
  };
  return {
    create: (draft: KidxTeamDraft) => safe(async () => { generation++; await request("/kidx-team", draft); }),
    join: (code: string) => safe(async () => { if (!/^[a-zA-Z0-9_-]{8}$/.test(code.trim())) throw new Error("Entre le code de huit caractères affiché sur l’autre écran."); generation++; await request(`/kidx-team/${code.trim()}`); }),
    publish: (draft: KidxTeamDraft) => { if (room) { queued = structuredClone(draft); nextPollAt = 0; } },
    advance() {
      if (!room || busy || disposed) return;
      if (Date.now() < nextPollAt) return; nextPollAt = Date.now() + 2000;
      const current = room;
      const next = queued; queued = null;
      void safe(async () => {
        try { await request(`/kidx-team/${current.code}`, next ? { ...next, revision: current.revision } : undefined); }
        catch (error) {
          // Keep an unacknowledged handoff for reconnect, unless a newer local edit replaced it.
          if (next && !queued && room?.code === current.code) queued = next;
          throw error;
        }
      });
    },
    leave: () => { generation++; room = null; queued = null; report("Duo sur cet écran uniquement."); },
    state: () => room ? { code: room.code, revision: room.revision, busy } : null,
    dispose: () => { disposed = true; abort.abort(); },
  };
}
