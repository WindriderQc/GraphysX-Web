import { Color } from "three";
import { growAgentWorldDnaForest, resolveAgentWorldDna, agentWorldDnaLeafHue, mutateAgentWorldDnaGenome, type AgentWorldDna } from "./agent-world-dna";
import { type ExplorerItem, type ExplorerModel } from "./island-explorer-data";
import { compareTreeProperties, lineageNodes, mapBounds, mapItems, mapLabel, snapshotProvenance, timelineEntries, treeSnapshot,
  type ObservedChange, type TreeSnapshot } from "./island-workspace-data";

export const esc = (v: unknown): string => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export type WorkspaceView = "explore" | "map" | "timeline" | "lineage" | "compare";
type Options = { select: (id: string | null) => void; focus: (item: ExplorerItem) => void; seek: (tick: number) => void };
const COLORS: Record<string, string> = { agents: "#ffb485", trees: "#8fdfad", objects: "#e9cc78", birds: "#acd8ff", forces: "#ceafff", terrain: "#6dbaac" };

export function islandWorkspace(options: Options) {
  let pending: { key: string; subject: string; tick: number } | null = null;
  let pinned: TreeSnapshot | null = null, second: TreeSnapshot | null = null;
  let zoom = 1, panX = 0, panZ = 0, changeOnly = false;
  let timelinePage = 0, timelineAnchor = "";
  let eventKind = "all", treeFilter = "", mapIndividual = false;
  const layers = new Set(["agents", "trees", "objects", "birds", "forces", "terrain", "trails"]);
  const trails = new Map<string, number[][]>();
  let trailTick = -1, instance = "";
  let projection = { x: 0, z: 0, span: 1 };
  const button = (item: ExplorerItem) => `<button type="button" data-ix-select="${esc(item.id)}"${item.id ? "" : " disabled"}>${esc(item.name)}</button>`;

  function map(model: ExplorerModel, selected: string | null) {
    let items = mapItems(model);
    if (mapIndividual) items = [...items.filter(i => i.kind !== "flock"), ...model.items.filter(i => i.kind === "bird")];
    const bounds = mapBounds(items), span = bounds.span / zoom, x = bounds.x + panX - span / 2, z = bounds.z + panZ - span / 2;
    projection = { x, z, span };
    const toX = (n: number) => (n - x) / span * 400;
    const toZ = (n: number) => (n - z) / span * 400;
    const visible = items.filter(i => layers.has(i.category));
    return `<p class="ix-hint">Vue du dessus · nord = −z. Les marqueurs désignent des objets entiers. Les forces sont celles transmises par le monde.</p>
      <div class="ix-map-layers">${Object.entries({ agents: "Agents", trees: "Arbres", objects: "Objets", birds: "Oiseaux", forces: "Forces", terrain: "Terrain", trails: "Déplacements" }).map(([id, name]) => `<label><input type="checkbox" data-map-layer="${id}"${layers.has(id) ? " checked" : ""}>${name}</label>`).join("")}
      <label><input type="checkbox" data-map-individual${mapIndividual ? " checked" : ""}>Individus</label></div>
      <div class="ix-controls"><button type="button" data-map-zoom="2" aria-label="Agrandir la carte">＋</button><button type="button" data-map-zoom="0.5" aria-label="Réduire la carte">−</button><button type="button" data-map-reset>Cadrer l’île</button>
      ${[["-1,0", "←"], ["0,-1", "↑"], ["0,1", "↓"], ["1,0", "→"]].map(([dir, title]) => `<button type="button" data-map-pan="${dir}" aria-label="Déplacer la carte ${title}">${title}</button>`).join("")}</div>
      <svg class="ix-map" viewBox="0 0 400 400" role="group" aria-label="Carte interactive de l’île">
      <rect width="400" height="400" rx="12" fill="#102e40"/><path d="M0 200H400M200 0V400" stroke="#35505a" stroke-dasharray="3 8"/>
      ${layers.has("trails") ? visible.filter(i => i.category === "agents").map(i => `<polyline data-map-trail="${esc(i.id)}" points="${(trails.get(i.id) || []).map(p => `${toX(p[0])},${toZ(p[2])}`).join(" ")}" fill="none" stroke="${COLORS.agents}" stroke-width="1.5"/>`).join("") : ""}
      ${visible.map(i => {
        const px = toX(i.position![0]), py = toZ(i.position![2]);
        const raw = i.raw as { definition?: { forceField?: { radius?: number; size?: number[]; direction?: number[] } } };
        const force = raw.definition?.forceField;
        return `${i.category === "forces" && force?.radius ? `<circle cx="${px}" cy="${py}" r="${Math.min(1000, force.radius / span * 400)}" fill="#ceafff0c" stroke="#ceafff50"/>` : ""}${i.category === "forces" && force?.size ? `<rect x="${px - force.size[0] / span * 200}" y="${py - force.size[2] / span * 200}" width="${force.size[0] / span * 400}" height="${force.size[2] / span * 400}" fill="#ceafff0c" stroke="#ceafff50"/>` : ""}${i.category === "forces" && force?.direction ? `<path d="M${px} ${py}l${force.direction[0] * 12} ${force.direction[2] * 12}" stroke="#ceafff" stroke-width="3"/>` : ""}<g role="button" tabindex="0" data-ix-select="${esc(i.id)}" aria-label="${esc(mapLabel(i))}" aria-pressed="${selected === i.id}"><title>${esc(mapLabel(i))}</title><circle cx="${px}" cy="${py}" r="${selected === i.id ? 9 : i.kind === "bird" ? 3 : 6}" fill="${COLORS[i.category]}" stroke="${selected === i.id ? "#fff" : "#071d2b"}" stroke-width="2"/><circle cx="${px}" cy="${py}" r="12" fill="transparent"/></g>`;
      }).join("")}<text x="12" y="22" fill="#cce5eb">N ↑</text></svg>
      <p class="ix-hint">Déplacements : positions reçues dans cette vue, ${model.mode === "Relecture" ? "effacées à chaque déplacement dans le temps" : "historique récent"}. Altitude et dimensions ne sont pas représentées.</p>
      <details><summary>Éléments de la carte (${visible.length})</summary><div class="ix-relations">${visible.map(button).join("")}</div></details>`;
  }

  function timeline(model: ExplorerModel, changes: ObservedChange[]) {
    const all = timelineEntries(model, changes).filter(e => eventKind === "all" || e.kind === eventKind);
    if (timelineAnchor !== model.key) {
      timelineAnchor = model.key;
      const at = all.findIndex(e => e.tick <= model.tick);
      timelinePage = model.mode === "Relecture" && at >= 0 ? Math.floor(at / 100) : 0;
    }
    timelinePage = Math.max(0, Math.min(Math.ceil(all.length / 100) - 1, timelinePage));
    const entries = all.slice(timelinePage * 100, timelinePage * 100 + 100);
    return `<p class="ix-hint">Actions, messages et changements reçus du monde. Aucun raisonnement privé n’est déduit. Le clavardage n’est consultable que si le flux le transmet. ${model.mode === "Relecture" ? "Un clic retrouve l’instant dans la lecture partagée." : "Le direct permet de sélectionner le sujet ; ouvrir une relecture pour retrouver l’instant."}</p>
      <label>Afficher <select data-timeline-kind>${["all", "Action", "Message", "Changement observé"].map(k => `<option value="${k}"${k === eventKind ? " selected" : ""}>${k === "all" ? "Tout" : k}</option>`).join("")}</select></label>
      <p class="ix-hint">${model.journalTruncated ? "Le début du journal n’est plus retenu. " : ""}${model.actions.length} actions disponibles · changements observés pendant cette connexion.</p>${pending ? `<p class="ix-hint">Sujet ${esc(pending.subject)} : absent de l’observation à cet instant. La sélection se rétablit si ses données arrivent.</p>` : ""}
      <div class="ix-controls"><button type="button" data-timeline-page="newer"${timelinePage ? "" : " disabled"}>Plus récents</button><button type="button" data-timeline-page="older"${(timelinePage + 1) * 100 < all.length ? "" : " disabled"}>Plus anciens</button><button type="button" data-timeline-page="now">Autour de cet instant</button></div>
      <p class="ix-hint">${all.length ? timelinePage * 100 + 1 : 0}–${Math.min(all.length, (timelinePage + 1) * 100)} / ${all.length} événements disponibles</p>
      <ol class="ix-log ix-timeline">${entries.map(e => `<li${e.tick > model.tick ? ' class="ix-future"' : ""}><button type="button" data-event-tick="${e.tick}" data-event-target="${esc(e.target || "")}" data-event-subject="${esc(e.subject || "")}"><time>${Math.floor(e.tick / model.tickHz)} s</time> · ${esc(e.kind)}<span>${esc(e.text)}</span></button></li>`).join("") || '<li>Aucun événement disponible.</li>'}</ol>`;
  }

  function lineage(model: ExplorerModel, selected: string | null) {
    const nodes = lineageNodes(model);
    const coords = new Map<string, { x: number; y: number }>();
    const children = new Map(nodes.map(n => [n.item.id, nodes.filter(c => c.parent === n.item.id)]));
    const visited = new Set<string>(); let row = 0;
    const place = (node: typeof nodes[number], level: number): number => {
      if (visited.has(node.item.id)) return row * 105 + 45;
      visited.add(node.item.id);
      const ys = (children.get(node.item.id) || []).filter(c => !visited.has(c.item.id)).map(c => place(c, level + 1));
      const y = ys.length ? ys.reduce((a,b) => a + b, 0) / ys.length : row++ * 105 + 45;
      coords.set(node.item.id, { x: 100 + level * 210, y }); return y;
    };
    for (const root of nodes.filter(n => !n.parent).sort((a,b) => a.item.name.localeCompare(b.item.name))) { place(root, 0); row += 0.25; }
    for (const node of nodes) if (!visited.has(node.item.id)) place(node, 0);
    const width = Math.max(400, ...[...coords.values()].map(p => p.x + 105)), height = Math.max(180, ...[...coords.values()].map(p => p.y + 65));
    return `<p class="ix-hint">De gauche à droite : profondeur de lignée connue, indépendante de la génération de mutation. Les parents absents et les anciennes captures restent signalés.</p>
      <div class="ix-lineage-scroll"><svg class="ix-lineage" width="${width}" height="${height}" role="group" aria-label="Généalogie des arbres">
      ${nodes.map(n => { const p = n.parent && coords.get(n.parent), c = coords.get(n.item.id)!; return p ? `<path d="M${p.x + 85} ${p.y}C${p.x + 130} ${p.y},${c.x - 130} ${c.y},${c.x - 85} ${c.y}" fill="none" stroke="#93cbb2" stroke-width="2"/>` : ""; }).join("")}
      ${nodes.map(n => { const c = coords.get(n.item.id)!; return `<g role="button" tabindex="0" data-ix-select="${esc(n.item.id)}" aria-label="${esc(n.item.name)}" aria-pressed="${selected === n.item.id}"><rect x="${c.x - 85}" y="${c.y - 25}" width="170" height="75" rx="10" fill="${selected === n.item.id ? "#355e59" : "#173e42"}" stroke="#94ccae"/><text x="${c.x}" y="${c.y}" text-anchor="middle" fill="#fff">${esc(n.item.name)}</text><text x="${c.x}" y="${c.y + 23}" text-anchor="middle" fill="#b4d9ce">${n.incomplete ? "Lignée incomplète" : n.parent ? `Descendant · ${n.level}` : "Fondateur observé"}</text></g>`; }).join("")}</svg></div>
      <div class="ix-relations">${nodes.filter(n => !treeFilter || n.item.id === selected || n.parent === selected).map(n => `<div>${button(n.item)}<small> · semeur : ${n.item.relations.find(r => r.label === "Semé par") ? `<button type="button" data-ix-select="${esc(n.item.relations.find(r => r.label === "Semé par")!.id)}">${esc(n.item.attributes.SownBy)}</button>` : esc(n.item.attributes.SownBy || "non renseigné")}</small></div>`).join("")}</div>
      <label><input type="checkbox" data-lineage-filter${treeFilter ? " checked" : ""}>Limiter la liste à la sélection et ses enfants</label>
      <h4>Événements liés aux arbres</h4><ol class="ix-log">${timelineEntries(model).filter(e => /seed|sow|mutat|plant|harvest|graine|arbre/i.test(e.text)).slice(0, 30).map(e => `<li><button type="button" data-event-tick="${e.tick}" data-event-target="${esc(e.target || "")}" data-event-subject="${esc(e.subject || "")}">${Math.floor(e.tick / model.tickHz)} s · ${esc(e.text)}</button></li>`).join("") || '<li>Aucun événement lié reçu.</li>'}</ol>`;
  }

  const silhouettes = new WeakMap<TreeSnapshot, string>();
  function silhouette(s: TreeSnapshot): string {
    const cached = silhouettes.get(s); if (cached) return cached;
    const raw = s.item.raw as { definition?: { dna?: AgentWorldDna } };
    const dna = raw.definition?.dna;
    if (!dna || dna.seed === undefined || dna.generation === undefined) return '<p class="ix-hint">Silhouette et couleur indisponibles : ADN source incomplet.</p>';
    try {
      const config = resolveAgentWorldDna(dna), form = growAgentWorldDnaForest(config);
      const pts = form.segments.flatMap(b => [b.start, b.end]);
      const minX = Math.min(...pts.map(p => p.x)), maxX = Math.max(...pts.map(p => p.x));
      const maxY = Math.max(1, ...pts.map(p => p.y));
      const scale = Math.min(190 / Math.max(1, maxX - minX), 190 / maxY);
      const project = (p: { x: number; y: number }) => [110 + (p.x - (maxX + minX) / 2) * scale, 210 - p.y * scale];
      const hue = agentWorldDnaLeafHue(mutateAgentWorldDnaGenome(config.genome, config.seed, config.generation, config.mutationRate), config.mutationRate, config.generation, 0);
      const color = new Color().setHSL(hue, 0.72, 0.44).getStyle();
      const html = `<svg class="ix-silhouette" viewBox="0 0 220 230" role="img" aria-label="Silhouette de ${esc(s.item.name)}"><path d="${form.segments.map(b => { const a = project(b.start), z = project(b.end); return `M${a.join(" ")}L${z.join(" ")}`; }).join("")}" fill="none" stroke="${esc(config.barkColor)}" stroke-width="1.5"/>${form.leaves.map(l => { const [x,y] = project(l.base); return `<circle cx="${x}" cy="${y}" r="2" fill="${color}"/>`; }).join("")}</svg><p class="ix-hint">Projection de l’ADN source · croissance complète, saison initiale · cadrage individuel${form.truncated ? " · géométrie limitée par le budget du moteur" : ""}.</p>`;
      silhouettes.set(s, html); return html;
    } catch { return '<p class="ix-hint">Silhouette indisponible : définition ADN non reconnue.</p>'; }
  }
  function compare(model: ExplorerModel, selected: string | null) {
    const item = model.items.find(i => i.id === selected && i.category === "trees");
    const trees = model.items.filter(i => i.category === "trees");
    return `<p class="ix-hint">Choisir A puis B conserve deux états observés, même après une mutation ou un déplacement dans la relecture. Captures conservées dans cette page uniquement.</p>
      <label>Arbre <select data-compare-tree><option value="">Choisir…</option>${trees.map(t => `<option value="${esc(t.id)}"${t.id === selected ? " selected" : ""}>${esc(t.name)}</option>`).join("")}</select></label>
      <div class="ix-controls"><button type="button" data-compare-pin="a"${item ? "" : " disabled"}>Conserver comme A</button><button type="button" data-compare-pin="b"${item ? "" : " disabled"}>Conserver comme B</button><button type="button" data-compare-clear>Effacer</button></div>
      <div class="ix-comparison">${[pinned, second].map((s, i) => `<section><h4>${i ? "B" : "A"} · ${esc(s?.item.name || "À choisir")}</h4>${s ? `${silhouette(s)}<p class="ix-hint">${esc(snapshotProvenance(s))}</p>` : ""}</section>`).join("")}</div>
      ${pinned && second ? `<label><input type="checkbox" data-compare-diff${changeOnly ? " checked" : ""}>Différences seulement</label><table class="ix-compare-table"><thead><tr><th>Propriété</th><th>A</th><th>B</th></tr></thead><tbody>${compareTreeProperties(pinned, second).filter(r => !changeOnly || r.changed).map(r => `<tr${r.changed ? ' class="ix-changed"' : ""}><th>${esc(r.label)}</th><td>${esc(r.a)}</td><td>${esc(r.b)}</td></tr>`).join("")}</tbody></table>` : '<p class="ix-empty">Deux états sont nécessaires pour afficher les différences.</p>'}`;
  }
  return {
    refreshMap(root: HTMLElement, model: ExplorerModel): void {
      if (instance !== model.key || model.tick < trailTick) { trails.clear(); instance = model.key; }
      if (model.tick !== trailTick) for (const item of model.items.filter(i => i.category === "agents" && i.position)) {
        const samples = trails.get(item.id) || []; samples.push([...item.position!]); trails.set(item.id, samples.slice(-120));
      }
      trailTick = model.tick;
      for (const marker of root.querySelectorAll<SVGGElement>(".ix-map [data-ix-select]")) {
        const item = model.items.find(i => i.id === marker.dataset.ixSelect);
        if (!item?.position) continue;
        for (const circle of marker.querySelectorAll("circle")) {
          circle.setAttribute("cx", String((item.position[0] - projection.x) / projection.span * 400));
          circle.setAttribute("cy", String((item.position[2] - projection.z) / projection.span * 400));
        }
      }
      for (const line of root.querySelectorAll<SVGPolylineElement>("[data-map-trail]")) line.setAttribute("points", (trails.get(line.dataset.mapTrail!) || []).map(p => `${(p[0] - projection.x) / projection.span * 400},${(p[2] - projection.z) / projection.span * 400}`).join(" "));
    },
    render(view: WorkspaceView, model: ExplorerModel, selected: string | null, changes: ObservedChange[] = []): string {
      if (instance !== model.key || model.tick < trailTick) { trails.clear(); instance = model.key; }
      if (model.tick !== trailTick) for (const item of model.items.filter(i => i.category === "agents" && i.position)) {
        const samples = trails.get(item.id) || []; samples.push([...item.position!]); trails.set(item.id, samples.slice(-120));
      }
      trailTick = model.tick;
      return view === "map" ? map(model, selected) : view === "timeline" ? timeline(model, changes) : view === "lineage" ? lineage(model, selected) : compare(model, selected);
    },
    handle(target: HTMLElement, model: ExplorerModel, selected: string | null): boolean {
      const d = target.dataset;
      if (d.mapLayer) { if (layers.has(d.mapLayer)) layers.delete(d.mapLayer); else layers.add(d.mapLayer); }
      else if (target.hasAttribute("data-map-individual")) mapIndividual = !mapIndividual;
      else if (d.mapZoom) zoom = Math.max(0.5, Math.min(8, zoom * Number(d.mapZoom)));
      else if (d.mapPan) { const [x, z] = d.mapPan.split(",").map(Number); panX += x * 25 / zoom; panZ += z * 25 / zoom; }
      else if (target.hasAttribute("data-map-reset")) { zoom = 1; panX = panZ = 0; }
      else if (target.hasAttribute("data-timeline-kind")) { eventKind = (target as HTMLSelectElement).value; timelineAnchor = ""; }
      else if (d.timelinePage) {
        if (d.timelinePage === "older") timelinePage++;
        else if (d.timelinePage === "newer") timelinePage = Math.max(0, timelinePage - 1);
        else { timelineAnchor = ""; }
      }
      else if (target.hasAttribute("data-lineage-filter")) treeFilter = treeFilter ? "" : "selected";
      else if (target.hasAttribute("data-event-tick")) {
        pending = null;
        if (d.eventTarget) options.select(d.eventTarget);
        else {
          options.select(null);
          if (d.eventSubject) pending = { key: `${model.key}:${model.journalGeneration || ""}`, subject: d.eventSubject, tick: Number(d.eventTick) };
        }
        if (model.mode === "Relecture") options.seek(Number(d.eventTick));
      }
      else if (target.hasAttribute("data-compare-tree")) { if ((target as HTMLSelectElement).value) options.select((target as HTMLSelectElement).value); }
      else if (d.comparePin) { const item = model.items.find(i => i.id === selected && i.category === "trees"); if (item) { if (d.comparePin === "a") pinned = treeSnapshot(model, item); else second = treeSnapshot(model, item); } }
      else if (target.hasAttribute("data-compare-clear")) { pinned = second = null; }
      else if (target.hasAttribute("data-compare-diff")) changeOnly = !changeOnly;
      else return false;
      return true;
    },
    refreshTimeline(root: HTMLElement, model: ExplorerModel): void {
      for (const button of root.querySelectorAll<HTMLElement>(".ix-timeline [data-event-tick]")) button.closest("li")?.classList.toggle("ix-future", Number(button.dataset.eventTick) > model.tick);
    },
    selectionAfterSeek(model: ExplorerModel): string | null {
      if (pending && pending.key !== `${model.key}:${model.journalGeneration || ""}`) pending = null;
      if (!pending || Math.abs(model.tick - pending.tick) > model.tickHz) return null;
      const matches = model.items.filter(i => i.name === pending!.subject || i.id === pending!.subject);
      if (matches.length !== 1) return null;
      pending = null; return matches[0].id;
    },
    snapshots: () => [pinned, second],
  };
}
