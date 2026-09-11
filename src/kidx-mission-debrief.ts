import { EV3_FIRST_PROGRAM_BLOCKS } from "./ev3-first-program";
import { kidxFrench } from "./kidx-french";
import { KIDX_CM_PER_UNIT } from "./kidx-sensors";
import { kidxTraceCoaching, type KidxMissionTrace, type KidxTracePose } from "./kidx-mission-trace";
import type { KidxMission } from "./kidx-missions";

export type KidxTraceZone = { x: number; z: number; width: number; depth: number; kind: "finish" | "red" | "checkpoint" };

/** A read-only view of the last attempt. Scrubbing never steers or rewinds the live scene. */
export function mountKidxMissionDebrief(root: HTMLElement, toolbar: HTMLElement, mission: KidxMission, zones: KidxTraceZone[], footprint: { width: number; depth: number }) {
  const button = document.createElement("button"); button.type = "button"; button.className = "kx-lab-toggle kx-debrief-toggle";
  button.dataset.kidxDebrief = ""; button.textContent = "Comprendre mon trajet"; button.hidden = true;
  button.setAttribute("aria-haspopup", "dialog"); button.setAttribute("aria-controls", "kidx-mission-debrief"); toolbar.append(button);
  const dialog = document.createElement("dialog"); dialog.id = "kidx-mission-debrief"; dialog.className = "kx-debrief";
  dialog.setAttribute("aria-labelledby", "kidx-debrief-title");
  dialog.innerHTML = `<header><div><small>AVEC NESTOR · DERNIER ESSAI</small><h2 id="kidx-debrief-title">Comprendre mon trajet</h2></div><button data-debrief-close aria-label="Revenir au robot">×</button></header>
    <p data-debrief-summary class="kx-debrief-summary"></p>
    <div class="kx-debrief-layout"><figure><svg data-debrief-map viewBox="0 0 360 320" role="img" aria-label="Trajet du dernier essai vu de dessus"></svg><figcaption>Vue de dessus · bleu : arrivée · rouge : à éviter<br>Le contour montre la place du robot. La flèche montre son avant.</figcaption></figure>
    <div><h3>Choisis un bloc pour l’observer</h3><div data-debrief-blocks class="kx-debrief-blocks"></div>
    <p data-debrief-detail aria-live="polite"></p><label class="kx-debrief-scrub">Du début à la fin de ce bloc<input data-debrief-scrub type="range" min="0" step="1" aria-label="Observer le déplacement de ce bloc"></label>
    <div class="kx-debrief-coach"><strong>Un coup de pouce ?</strong><p data-debrief-hint aria-live="polite">Cherche d’abord ton idée. Nestor peut te donner un indice à la fois.</p><button data-debrief-hint-next>Un premier indice</button></div></div></div>
    <footer><p>Ce dessin garde ton dernier essai, même si tu modifies tes blocs.</p><button data-debrief-return>Revenir au robot</button></footer>`;
  root.append(dialog);
  const svg = dialog.querySelector<SVGSVGElement>("svg")!;
  const list = dialog.querySelector<HTMLElement>("[data-debrief-blocks]")!;
  const scrub = dialog.querySelector<HTMLInputElement>("[data-debrief-scrub]")!;
  const hint = dialog.querySelector<HTMLButtonElement>("[data-debrief-hint-next]")!;
  let trace: KidxMissionTrace | null = null, selected = 0, hintLevel = 0, cursor = 0, mapScale = 1;
  let coach: ReturnType<typeof kidxTraceCoaching> | null = null;
  let mapPose: (pose: KidxTracePose) => [number, number] = () => [0, 0];
  const node = (tag: string, attributes: Record<string, string | number>, text?: string) => {
    const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
    if (text) element.textContent = text;
    return element;
  };
  const drawCursor = () => {
    if (!trace) return;
    svg.querySelector("[data-trace-rover]")?.remove();
    svg.querySelector("[data-trace-footprint]")?.remove();
    const pose = trace.segments[selected]?.points[cursor] ?? trace.start;
    const [x, y] = mapPose(pose);
    // Mission triggers use the root body's world-aligned footprint, separately from steering heading.
    const body = node("rect", { "data-trace-footprint": "", x: x - footprint.width * mapScale / 2, y: y - footprint.depth * mapScale / 2,
      width: footprint.width * mapScale, height: footprint.depth * mapScale, rx: 5, fill: "#ffffff", "fill-opacity": .45, stroke: "#496b6a", "stroke-width": 1.5, "stroke-dasharray": "4 3" });
    svg.insertBefore(body, svg.querySelector("[data-trace-segment]"));
    const marker = node("g", { "data-trace-rover": "", transform: `translate(${x} ${y}) rotate(${pose.heading})` });
    marker.append(node("circle", { r: 10, fill: "#fafbf5", stroke: "#173d47", "stroke-width": 2 }),
      node("path", { d: "M 0 -15 L 7 -3 L 0 -6 L -7 -3 Z", fill: "#173d47" }));
    svg.append(marker);
    scrub.setAttribute("aria-valuetext", cursor === 0 ? "Début du bloc" : cursor === Number(scrub.max) ? "Fin observée du bloc" : "Pendant le bloc");
  };
  const drawMap = () => {
    if (!trace) return;
    const points = [trace.start, ...trace.segments.flatMap(segment => segment.points)];
    const xs = points.flatMap(point => [point.x - footprint.width / 2, point.x + footprint.width / 2]);
    const zs = points.flatMap(point => [point.z - footprint.depth / 2, point.z + footprint.depth / 2]);
    for (const zone of zones) { xs.push(zone.x - zone.width / 2, zone.x + zone.width / 2); zs.push(zone.z - zone.depth / 2, zone.z + zone.depth / 2); }
    const minX = Math.min(...xs) - 1.5, maxX = Math.max(...xs) + 1.5;
    const minZ = Math.min(...zs) - 1.5, maxZ = Math.max(...zs) + 1.5;
    const scale = Math.min(336 / (maxX - minX), 284 / (maxZ - minZ));
    mapScale = scale;
    mapPose = pose => [180 + (pose.x - (minX + maxX) / 2) * scale, 160 + (pose.z - (minZ + maxZ) / 2) * scale];
    svg.replaceChildren(node("rect", { x: 0, y: 0, width: 360, height: 320, rx: 14, fill: "#edf0e3" }));
    for (const zone of zones) {
      const [x, y] = mapPose({ ...zone, heading: 0 });
      const color = zone.kind === "finish" ? "#287ac0" : zone.kind === "red" ? "#c6413b" : "#d2a222";
      svg.append(node("rect", { "data-trace-zone": zone.kind, x: x - zone.width * scale / 2, y: y - zone.depth * scale / 2, width: zone.width * scale, height: zone.depth * scale, rx: 3, fill: color, "fill-opacity": .22, stroke: color, "stroke-width": 1.5 }));
      if (zone.kind !== "red") svg.append(node("text", { x, y: y - 4, "text-anchor": "middle", fill: "#173d47", "font-size": 11, "font-weight": 700 }, zone.kind === "finish" ? "Arrivée" : "Repère"));
    }
    const labels: [number, number][] = [];
    trace.segments.forEach((segment, index) => {
      const active = index === selected;
      svg.append(node("polyline", { points: segment.points.map(point => mapPose(point).join(",")).join(" "), fill: "none", stroke: active ? "#7543a0" : "#496b6a", "stroke-width": active ? 6 : 3, "stroke-linecap": "round", "stroke-linejoin": "round", "stroke-opacity": active ? 1 : .4, "data-trace-segment": index }));
      const [x, y] = mapPose(segment.points.at(-1)!);
      const offsets = [[18, -12], [-18, -12], [18, 12], [-18, 12], [36, 0], [-36, 0], [18, -36], [-18, 36]];
      const [labelX, labelY] = offsets.map(([dx, dy]) => [x + dx, y + dy]).find(([nextX, nextY]) => nextX >= 12 && nextX <= 348 && nextY >= 12 && nextY <= 308
        && labels.every(([otherX, otherY]) => Math.hypot(otherX - nextX, otherY - nextY) >= 20)) ?? [Math.max(12, Math.min(348, x + 18)), Math.max(12, Math.min(308, y - 12))];
      labels.push([labelX, labelY]);
      svg.append(node("line", { x1: x, y1: y, x2: labelX, y2: labelY, stroke: "#496b6a", "stroke-width": 1 }),
        node("circle", { cx: labelX, cy: labelY, r: 9, fill: active ? "#7543a0" : "#496b6a", stroke: "#fff", "stroke-width": 1.5 }),
        node("text", { "data-trace-label": index, x: labelX, y: labelY + 4, "text-anchor": "middle", fill: "white", "font-size": 10, "font-weight": 800 }, String(index + 1)));
    });
    const [startX, startY] = mapPose(trace.start);
    svg.append(node("text", { x: startX, y: startY + 24, "text-anchor": "middle", fill: "#173d47", "font-size": 11, "font-weight": 700 }, "Départ"));
    drawCursor();
  };
  const select = (index: number) => {
    if (!trace?.segments[index]) return;
    selected = index;
    const segment = trace.segments[index];
    cursor = segment.points.length - 1; scrub.max = String(cursor); scrub.value = String(cursor); scrub.disabled = false;
    for (const item of list.querySelectorAll<HTMLButtonElement>("button")) item.setAttribute("aria-pressed", String(Number(item.dataset.debriefBlock) === selected));
    const cm = Math.round(segment.distance * KIDX_CM_PER_UNIT), degrees = Math.round(Math.abs(segment.turn));
    dialog.querySelector("[data-debrief-detail]")!.textContent = `Bloc ${index + 1} : ${cm > 0 ? `environ ${cm} cm parcourus` : "presque aucun déplacement"}${degrees >= 3 ? ` et ${degrees}° de rotation` : ""}.${segment.red ? " Le robot est entré dans le rouge pendant ce bloc." : ""}${!segment.completed ? trace.outcome === "complete" ? " Le robot s’est arrêté dès l’arrivée." : " Ce bloc a été interrompu." : ""}`;
    drawMap();
  };
  button.addEventListener("click", () => { if (trace && !button.hidden) dialog.showModal(); });
  for (const item of dialog.querySelectorAll("[data-debrief-close], [data-debrief-return]")) item.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => { if (!button.hidden && button.isConnected) button.focus(); });
  scrub.addEventListener("input", () => { cursor = Number(scrub.value); drawCursor(); });
  hint.addEventListener("click", () => {
    if (!coach) return;
    if (hintLevel >= coach.hints.length) { dialog.close(); return; }
    dialog.querySelector("[data-debrief-hint]")!.textContent = coach.hints[hintLevel++];
    if (hintLevel === 2 && coach.focus >= 0) select(coach.focus);
    hint.textContent = hintLevel < coach.hints.length ? "Un autre indice" : "Revenir au robot";
  });
  return {
    show(next: KidxMissionTrace) {
      trace = next; selected = Math.max(0, next.segments.length - 1); hintLevel = 0; coach = kidxTraceCoaching(next, mission);
      button.hidden = false;
      dialog.querySelector("[data-debrief-summary]")!.textContent = coach.summary;
      dialog.querySelector("[data-debrief-hint]")!.textContent = "Cherche d’abord ton idée. Nestor peut te donner un indice à la fois.";
      hint.textContent = "Un premier indice"; hint.disabled = false;
      list.replaceChildren();
      next.blocks.forEach((id, index) => {
        const item = document.createElement("button"); item.type = "button"; item.dataset.debriefBlock = String(index);
        item.disabled = !next.segments[index];
        item.textContent = `${index + 1}. ${kidxFrench(EV3_FIRST_PROGRAM_BLOCKS[id].label)}${item.disabled ? " · Pas encore joué" : ""}`;
        item.addEventListener("click", () => select(index)); list.append(item);
      });
      if (next.segments.length) select(selected);
      else { scrub.max = scrub.value = "0"; scrub.disabled = true; dialog.querySelector("[data-debrief-detail]")!.textContent = "Le robot a été arrêté avant son premier déplacement."; drawMap(); }
    },
    available(value: boolean) { button.hidden = !trace || !value; },
    clear() { trace = null; coach = null; button.hidden = true; dialog.close(); },
    state: () => trace ? ({ available: !button.hidden, open: dialog.open, outcome: trace.outcome, blocks: [...trace.blocks], selectedBlock: selected,
      hintLevel, cursor, summary: coach?.summary, start: { ...trace.start }, end: { ...trace.end },
      segments: trace.segments.map(segment => ({ block: segment.block, distance: segment.distance, turn: segment.turn, seconds: segment.seconds, red: segment.red, completed: segment.completed, start: { ...segment.points[0] }, end: { ...segment.points.at(-1)! } })) }) : null,
    dispose() { dialog.close(); dialog.remove(); button.remove(); },
  };
}
