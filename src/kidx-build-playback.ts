import type { AgentWorldVector3, GraphysXAgentWorldApi } from "./agent-world-runtime";
import { kidxPartLabel, type KidxBuild } from "./kidx-builds";

import { smoothKidx } from "./kidx-build-actions";

/** A short demonstration uses the actual CAD pieces and ordinary scene entities. */
export function createKidxBuildPlayback(api: GraphysXAgentWorldApi, build: KidxBuild, report: (text: string) => void) {
  let step = 0, index = 0, elapsed = 0, speed = 1;
  let playing = false, active = false, ghostReady = false;
  const ids: string[] = [];
  const removePieces = () => { for (const id of ids.splice(0)) api.remove(id); };
  const restore = () => api.update(`kidx-assembly-${step}`, { visible: true });
  const stop = () => { if (active) restore(); active = playing = false; removePieces(); };
  const pieceId = (n: number) => `kidx-demo-piece-${n}`;
  const ghostId = "kidx-demo-destination";
  const arrowIds = ["kidx-demo-arrow-shaft", "kidx-demo-arrow-tip"];
  const prepare = () => {
    elapsed = 0; ghostReady = false;
    const piece = build.steps[step].pieces[index];
    if (api.query({ ids: [ghostId] }).length) api.remove(ghostId);
    const receipt = api.spawn({ id: ghostId, label: "Emplacement de la pièce", type: "model",
      asset: { id: `kidx-${build.id}-ghost-${step}-${index}`, url: piece.url, format: "graphysx-mesh-json" },
      transform: { position: piece.center as AgentWorldVector3 }, visible: false, tags: ["kidx-demo", "destination"] });
    if (!receipt.ok) { stop(); report("Impossible de préparer la démonstration. Réessaie cette étape."); return; }
    if (!ids.includes(ghostId)) ids.push(ghostId);
    // The marker follows the demonstration direction, offset so it never covers the part.
    for (const [n, id] of arrowIds.entries()) {
      if (api.query({ ids: [id] }).length) api.remove(id);
      const offset = n === 0 ? .65 : .37;
      api.spawn({ id, label: "Sens d’insertion de la pièce", type: n === 0 ? "cylinder" : "cone",
        transform: { position: [piece.center[0] + .6 * offset + .45, piece.center[1] + 1.25 * offset, piece.center[2] + .45 * offset], rotationDegrees: [0, -36.87, 149.04] },
        geometry: { radius: n === 0 ? .025 : .1, height: n === 0 ? .5 : .24, radialSegments: 12 },
        material: { color: "#f4b544", emissive: "#ffbe55", emissiveIntensity: .3 }, visible: false, tags: ["kidx-demo", "insertion-arrow"] });
      if (!ids.includes(id)) ids.push(id);
    }
    api.update(pieceId(index), { visible: true, transform: { position: [piece.center[0] + .6, piece.center[1] + 1.25, piece.center[2] + .45] } });
    report(`Pièce ${index + 1}/${build.steps[step].pieces.length} · ${kidxPartLabel(piece.label)}. Observe son orientation et son emplacement.`);
  };
  const start = (nextStep: number, selected = 0) => {
    stop(); step = nextStep;
    const pieces = build.steps[step].pieces;
    index = Math.max(0, Math.min(pieces.length - 1, selected));
    active = playing = true;
    api.update(`kidx-assembly-${step}`, { visible: false });
    for (const [n, piece] of pieces.entries()) {
      const id = pieceId(n);
      const receipt = api.spawn({ id, label: `${kidxPartLabel(piece.label)} ${n + 1}`, type: "model",
        asset: { id: `kidx-${build.id}-piece-${step}-${n}`, url: piece.url, format: "graphysx-mesh-json" },
        transform: { position: piece.center as AgentWorldVector3 }, visible: n < index,
        castShadow: true, receiveShadow: true, tags: ["kidx-demo", `piece:${n + 1}`] });
      if (!receipt.ok) { stop(); report("Une pièce n’a pas pu être préparée."); return; }
      ids.push(id);
    }
    prepare();
  };
  return {
    start, stop,
    pause: () => { playing = false; },
    resume: () => { if (active) playing = true; },
    speed: (value: number) => { if (Number.isFinite(value)) speed = Math.max(.25, Math.min(2, value)); },
    advance(delta: number) {
      if (!active) return;
      const states = api.query({ ids: [pieceId(index), ghostId] });
      if (states.some(s => s.asset?.status === "error")) { stop(); report("Une pièce n’a pas pu être chargée. Réessaie la démonstration."); return; }
      if (states.length !== 2 || states.some(s => s.asset?.status !== "ready")) return;
      if (!ghostReady) {
        const ghost = states.find(s => s.id === ghostId)!;
        api.update(ghostId, { visible: true, modelMaterialOverrides: Object.fromEntries((ghost.materialSlots ?? []).map(slot => [slot.id,
          { opacity: .2, emissive: "#ffc857", emissiveIntensity: .45 }])) });
        ghostReady = true;
        for (const id of arrowIds) api.update(id, { visible: true });
      }
      if (!playing || !Number.isFinite(delta) || delta <= 0) return;
      elapsed += Math.min(delta, .1) * speed;
      const piece = build.steps[step].pieces[index];
      const remaining = 1 - smoothKidx(elapsed / 1.4);
      api.update(pieceId(index), { transform: { position: [piece.center[0] + .6 * remaining, piece.center[1] + 1.25 * remaining, piece.center[2] + .45 * remaining] } });
      if (elapsed >= 1.8) {
        index++;
        if (index >= build.steps[step].pieces.length) { index--; stop(); report("Démonstration terminée. À toi d’assembler ! Tu peux la rejouer ou revoir une pièce."); }
        else prepare();
      }
    },
    state: () => ({ active, playing, step: step + 1, piece: index + 1, pieces: build.steps[step].pieces.length, elapsed, speed }),
  };
}
