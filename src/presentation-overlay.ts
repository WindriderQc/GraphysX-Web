import { BoxGeometry, BufferGeometry, EdgesGeometry, Group, Line, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { createPresentationClock, presentationPoint, type PresentationPoint } from './presentation-transition';

/** Disposable presentation overlay; never changes document entities, revision or permissions. */
export function createPresentationOverlay() {
  const group = new Group(); group.name = 'presentation-preview'; group.visible = false;
  const geometry = new BoxGeometry(1, 1, 1);
  const edges = new EdgesGeometry(geometry);
  const startMaterial = new LineBasicMaterial({ color: '#4ff2ff', depthTest: false });
  const targetMaterial = new LineBasicMaterial({ color: '#ffb13b', depthTest: false });
  const start = new LineSegments(edges, startMaterial), target = new LineSegments(edges, targetMaterial);
  const ghostMaterial = new MeshBasicMaterial({ color: '#ffb13b', transparent: true, opacity: 0.45, depthWrite: false });
  const ghost = new Mesh(geometry, ghostMaterial);
  const linkGeometry = new BufferGeometry();
  const link = new Line(linkGeometry, targetMaterial);
  group.add(start, target, ghost, link);
  for (const item of group.children) item.renderOrder = 1000;
  const clock = createPresentationClock();
  let from: PresentationPoint = [0, 0, 0], to: PresentationPoint = [0, 0, 0];
  const update = () => { ghost.position.set(...presentationPoint(from, to, clock.state().progress)); };
  return {
    group, clock,
    set: (a: PresentationPoint, b: PresentationPoint, aSize: PresentationPoint, bSize: PresentationPoint) => {
      from = [...a]; to = [...b]; clock.seek(0);
      start.position.set(...a); target.position.set(...b); start.scale.set(...aSize); target.scale.set(...bSize);
      linkGeometry.setFromPoints([new Vector3(...a), new Vector3(...b)]);
      group.visible = true; update();
    },
    tick: (delta: number) => { clock.tick(delta); update(); },
    hide: () => { group.visible = false; clock.pause(); },
    dispose: () => { group.removeFromParent(); geometry.dispose(); edges.dispose(); linkGeometry.dispose(); startMaterial.dispose(); targetMaterial.dispose(); ghostMaterial.dispose(); },
  };
}
