import {
  BoxGeometry, BufferGeometry, EdgesGeometry, Group, Line, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial,
  OctahedronGeometry, QuadraticBezierCurve3, Vector3,
} from "three";
import { createPresentationClock } from "./presentation-transition";

/**
 * Relation overlay for Nestor's 3D explanations: outline some places by role, draw arcs from
 * "source" places to a "target" place, and move markers along the arcs on the shared bounded
 * clock (play, pause, rewind, seek). At 0 the picture is "now"; at 1 it is "what the proposal
 * would change": sources dim, their markers have arrived.
 *
 * Presentation only. It lives in its own group beside the world, never edits the scene
 * document, and reaching 1 says nothing about whether anything happened. Data Janitor uses it
 * for duplicate copies (target = kept copy, source = extra copies); other contexts bring their
 * own places and roles.
 */
export type RelationRole = "target" | "source" | "neutral";
export type RelationPlace = { id: string; center: readonly [number, number, number]; size: readonly [number, number, number]; role: RelationRole };
export type RelationLink = { from: string; to: string };

const COLOURS: Record<RelationRole, string> = { target: "#4ff2ff", source: "#ffb13b", neutral: "#c9d6e2" };
const MAX_PLACES = 64;

export function relationArc(from: Vector3, to: Vector3): QuadraticBezierCurve3 {
  const lift = Math.max(2, from.distanceTo(to) * 0.35);
  const control = from.clone().add(to).multiplyScalar(0.5);
  control.y = Math.max(from.y, to.y) + lift;
  return new QuadraticBezierCurve3(from.clone(), control, to.clone());
}

export function createRelationOverlay(seconds = 3) {
  const group = new Group();
  group.name = "presentation-relations";
  group.visible = false;
  const clock = createPresentationClock(seconds);
  const unitBox = new BoxGeometry(1, 1, 1);
  const unitEdges = new EdgesGeometry(unitBox);
  const markerGeometry = new OctahedronGeometry(0.85);
  let disposables: { dispose(): void }[] = [];
  let sources: { outline: LineBasicMaterial; fill: MeshBasicMaterial }[] = [];
  let markers: { mesh: Mesh; curve: QuadraticBezierCurve3 }[] = [];
  let placeCount = 0;

  const clear = (): void => {
    group.clear();
    for (const item of disposables) item.dispose();
    disposables = [];
    sources = [];
    markers = [];
    placeCount = 0;
  };
  const own = <T extends { dispose(): void }>(item: T): T => { disposables.push(item); return item; };
  const update = (): void => {
    const t = clock.state().progress;
    const eased = t * t * (3 - 2 * t);
    for (const source of sources) {
      source.outline.opacity = 1 - 0.65 * eased;
      source.fill.opacity = 0.32 * (1 - eased);
    }
    for (const marker of markers) {
      marker.mesh.visible = t > 0 && t < 1;
      marker.mesh.position.copy(marker.curve.getPoint(eased));
    }
  };

  return {
    group,
    clock,
    /** Replace the picture. Places beyond the budget are refused, not silently dropped. */
    set(places: readonly RelationPlace[], links: readonly RelationLink[]): void {
      if (places.length > MAX_PLACES) throw new Error(`Too many places for one picture (${places.length} > ${MAX_PLACES})`);
      clear();
      const byId = new Map<string, RelationPlace>();
      for (const place of places) {
        if (![...place.center, ...place.size].every(Number.isFinite)) throw new Error(`Invalid place ${place.id}`);
        byId.set(place.id, place);
        const colour = COLOURS[place.role];
        const outlineMaterial = own(new LineBasicMaterial({ color: colour, transparent: true, depthTest: false }));
        const outline = new LineSegments(unitEdges, outlineMaterial);
        outline.position.set(...place.center);
        outline.scale.set(place.size[0] + 0.3, place.size[1] + 0.3, place.size[2] + 0.3);
        outline.renderOrder = 1000;
        group.add(outline);
        if (place.role === "source") {
          const fill = own(new MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.32, depthWrite: false }));
          const box = new Mesh(unitBox, fill);
          box.position.copy(outline.position);
          box.scale.copy(outline.scale);
          box.renderOrder = 999;
          group.add(box);
          sources.push({ outline: outlineMaterial, fill });
        }
      }
      for (const link of links) {
        const from = byId.get(link.from), to = byId.get(link.to);
        if (!from || !to) throw new Error(`Link names an unknown place: ${link.from} -> ${link.to}`);
        const top = (place: RelationPlace) => new Vector3(place.center[0], place.center[1] + place.size[1] / 2 + 0.2, place.center[2]);
        const curve = relationArc(top(from), top(to));
        const lineGeometry = own(new BufferGeometry().setFromPoints(curve.getPoints(40)));
        const lineMaterial = own(new LineBasicMaterial({ color: COLOURS.source, transparent: true, opacity: 0.9, depthTest: false }));
        const line = new Line(lineGeometry, lineMaterial);
        line.renderOrder = 1001;
        group.add(line);
        const markerMaterial = own(new MeshBasicMaterial({ color: COLOURS.source, depthTest: false }));
        const mesh = new Mesh(markerGeometry, markerMaterial);
        mesh.renderOrder = 1002;
        group.add(mesh);
        markers.push({ mesh, curve });
      }
      placeCount = places.length;
      clock.seek(0);
      group.visible = true;
      update();
    },
    tick(delta: number): void { clock.tick(delta); update(); },
    seek(progress: number): void { clock.seek(progress); update(); },
    hide(): void { group.visible = false; clock.pause(); },
    state: () => ({ ...clock.state(), visible: group.visible, places: group.visible ? placeCount : 0, links: group.visible ? markers.length : 0 }),
    dispose(): void { clear(); group.removeFromParent(); unitBox.dispose(); unitEdges.dispose(); markerGeometry.dispose(); },
  };
}
