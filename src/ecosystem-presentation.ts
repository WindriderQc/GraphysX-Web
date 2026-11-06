// The existing tour's displayed state, bounded for a companion conversation. No scene owner.
import { DEFAULT_ECOSYSTEM_CATALOG, type EcosystemCatalog, type CompositionRead } from "./ecosystem-catalog";
import type { EcosystemLiveObservation } from "./ecosystem-live-state";

export type EcosystemViewState = {
  application: string;
  snapshot: string;
  tour: { index: number; count: number; playing: boolean; kind: string; label: string; script: string; adhoc: string | null; title: string };
  narration: string;
  spokenNarration?: string;
  narrationComplete: boolean;
  focus: string[];
  nodes: { id: string; name: string }[];
  live?: EcosystemLiveObservation | null;
  composition?: { contentRevision: string; read: CompositionRead };
};

export function ecosystemObservation(state: EcosystemViewState, catalog: EcosystemCatalog = DEFAULT_ECOSYSTEM_CATALOG) {
  const { describeNode, ecoNode } = catalog;
  const step = state.tour.adhoc || state.tour.script.split(",")[state.tour.index] || "";
  const id = step.startsWith("node-") ? step.slice(5) : null;
  const selected = id ? ecoNode(id) : null;
  return {
    application: "ecosystem" as const,
    ...(state.composition ? { composition: structuredClone(state.composition) } : {}),
    snapshot: state.snapshot,
    tour: { ...state.tour },
    focus: [...new Set(state.focus)].slice(0, 32).map(id => ({ id, label: ecoNode(id)?.name || id })),
    selection: selected ? { id: selected.id, label: selected.name, description: describeNode(selected) } : null,
    narration: state.narration.slice(0, 4000),
    ...(state.spokenNarration !== undefined ? { spokenNarration: state.spokenNarration.slice(0, 4000) } : {}),
    narrationComplete: state.narrationComplete === true,
    ...(state.live ? { live: { status: state.live.status, read: state.live.read ? { ...state.live.read } : null } } : {}),
  };
}
