// The existing tour's displayed state, bounded for a companion conversation. No scene owner.
import { describeNode, ecoNode, ECOSYSTEM_SNAPSHOT_DATE } from "./ecosystem-data";

export type EcosystemViewState = {
  application: string;
  snapshot: string;
  tour: { index: number; count: number; playing: boolean; kind: string; label: string; script: string; adhoc: string | null; title: string };
  narration: string;
  narrationComplete: boolean;
  focus: string[];
  nodes: { id: string; name: string }[];
};

export function ecosystemObservation(state: EcosystemViewState) {
  const step = state.tour.adhoc || state.tour.script.split(",")[state.tour.index] || "";
  const id = step.startsWith("node-") ? step.slice(5) : null;
  const selected = id ? ecoNode(id) : null;
  return {
    application: "ecosystem" as const,
    snapshot: ECOSYSTEM_SNAPSHOT_DATE,
    tour: { ...state.tour },
    focus: [...new Set(state.focus)].slice(0, 32).map(id => ({ id, label: ecoNode(id)?.name || id })),
    selection: selected ? { id: selected.id, label: selected.name, description: describeNode(selected) } : null,
    narration: state.narration.slice(0, 4000),
    narrationComplete: state.narrationComplete === true,
  };
}
