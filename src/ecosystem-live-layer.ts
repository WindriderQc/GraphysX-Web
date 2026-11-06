/** Render-only status overlay. Core remains the source; no polling or model calls here. */
import { EdgesGeometry, BoxGeometry, Group, LineBasicMaterial, LineSegments, type Vector3 } from "three";
import { DEFAULT_ECOSYSTEM_CATALOG, type EcosystemCatalog } from "./ecosystem-catalog";
import { createEcosystemLiveState, ecosystemLiveScope, type EcosystemLiveView } from "./ecosystem-live-state";
import type { PlatformHost } from "./platform-host";

type LiveBlock = { id: string; center: Vector3; size: Vector3 };

/** Browser-local display only; the canonical observations keep their UTC timestamps. */
export function formatEcosystemLiveTime(value: string | null): string {
  if (!value) return "inconnu";
  return new Intl.DateTimeFormat("fr-CA", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23", timeZoneName: "short",
  }).format(new Date(value));
}

export function mountEcosystemLiveLayer(surface: HTMLElement, host: PlatformHost, blocks: () => readonly LiveBlock[], select: (id: string) => void, catalog: EcosystemCatalog = DEFAULT_ECOSYSTEM_CATALOG) {
  const { date: ECOSYSTEM_SNAPSHOT_DATE, ecoNode } = catalog;
  const controller = createEcosystemLiveState(catalog);
  const group = new Group();
  group.name = "ecosystem-live-observations";
  host.scene.add(group);
  const geometry = new EdgesGeometry(new BoxGeometry(1, 1, 1));
  const outlines = new Map<string, LineSegments<EdgesGeometry, LineBasicMaterial>>();
  const panel = document.createElement("section");
  panel.className = "gx-eco-live";
  panel.setAttribute("aria-label", "États observés des composants");
  panel.hidden = true;
  const title = document.createElement("h2");
  title.textContent = "États observés";
  const summary = document.createElement("p");
  summary.setAttribute("role", "status");
  const list = document.createElement("ul");
  const scope = document.createElement("p");
  scope.className = "gx-eco-live-scope";
  scope.textContent = "Chaque état indique sa source : processus, interface, collecteur, stockage ou présence réseau. Un collecteur inaccessible ne prouve pas une machine arrêtée. Sans sonde : non observé. Aucune validation de tâche utilisateur.";
  panel.append(title, summary, list, scope);
  surface.append(panel);
  let rendered: EcosystemLiveView | null = null;
  let fingerprint = "";
  let lastBlocks: readonly LiveBlock[] | null = null;
  let dirty = false;
  const rows = new Map<string, { item: HTMLLIElement; button: HTMLButtonElement; detail: HTMLElement }>();

  function clearOutline(id: string): void {
    const outline = outlines.get(id);
    if (outline) { outline.material.dispose(); outline.removeFromParent(); outlines.delete(id); }
  }
  function display(view: EcosystemLiveView): void {
    panel.hidden = false;
    panel.dataset.status = view.status;
    const state = view.status === "available" ? "Source disponible" : view.status === "stale" ? "Source périmée" : "Source indisponible";
    summary.textContent = `${state} · ${view.nodes.length} composants · ${view.nodes.filter(node => node.source !== "unobserved").length} raccordés · ${view.nodes.filter(node => node.source === "unobserved").length} sans sonde${view.generatedAt ? ` · relevé ${formatEcosystemLiveTime(view.generatedAt)}` : ""}. Composition du ${ECOSYSTEM_SNAPSHOT_DATE}.`;
    summary.title = view.generatedAt ? `Relevé UTC : ${view.generatedAt}` : "";
    const subtitle = surface.querySelector<HTMLElement>(".gx-eco-sub");
    if (subtitle) subtitle.textContent = `Composition du ${ECOSYSTEM_SNAPSHOT_DATE} · États observés de Core · portée indiquée par composant`;
    const ids = new Set(view.nodes.map(node => node.id));
    for (const [id, row] of rows) if (!ids.has(id)) { row.item.remove(); rows.delete(id); }
    for (const id of outlines.keys()) if (!ids.has(id)) clearOutline(id);
    for (const node of view.nodes) {
      let row = rows.get(node.id);
      if (!row) {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.addEventListener("click", () => select(node.id));
        const detail = document.createElement("small");
        item.append(button, detail); list.append(item);
        row = { item, button, detail }; rows.set(node.id, row);
      }
      row.item.style.setProperty("--live-colour", node.colour);
      row.item.dataset.nodeId = node.id;
      row.item.dataset.state = node.displayState;
      row.item.dataset.freshness = node.freshness;
      const name = ecoNode(node.id)?.name || node.id;
      row.button.textContent = `${name} · ${ecosystemLiveScope(node.source)} : ${node.label}`;
      row.button.setAttribute("aria-label", `Voir ${name}. ${ecosystemLiveScope(node.source)} : ${node.label}`);
      row.detail.textContent = `Relevé : ${formatEcosystemLiveTime(node.observedAt)} · Validité : ${node.expiresAt ? formatEcosystemLiveTime(node.expiresAt) : "inconnue"}`;
      row.detail.title = `Relevé UTC : ${node.observedAt ?? "inconnu"} · Validité UTC : ${node.expiresAt ?? "inconnue"}`;
      const block = blocks().find(block => block.id === node.id);
      if (!block) continue;
      let outline = outlines.get(node.id);
      if (!outline) {
        outline = new LineSegments(geometry, new LineBasicMaterial({ color: node.colour, transparent: true, opacity: 0.95, depthTest: false }));
        outline.name = `eco-live:${node.id}`;
        outline.renderOrder = 1001;
        group.add(outline); outlines.set(node.id, outline);
      }
      outline.material.color.set(node.colour);
      outline.material.opacity = node.freshness === "current" ? 0.95 : 0.65;
      outline.position.copy(block.center);
      outline.scale.set(block.size.x + 0.5, block.size.y + 0.5, block.size.z + 0.5);
    }
  }

  return {
    set(value: unknown): boolean {
      const accepted = controller.set(value);
      if (accepted) dirty = true;
      return accepted;
    },
    frame(now = Date.now()): void {
      const view = controller.view(now);
      if (!view) return;
      const next = JSON.stringify(view);
      if (dirty || next !== fingerprint || lastBlocks !== blocks()) {
        display(view); rendered = view; fingerprint = next; lastBlocks = blocks(); dirty = false;
      }
      group.visible = host.mode !== "editor";
      panel.hidden = host.mode === "editor";
    },
    state: (): EcosystemLiveView | null => rendered,
    dispose(): void {
      for (const id of outlines.keys()) clearOutline(id);
      geometry.dispose(); group.removeFromParent(); panel.remove();
    },
  };
}
