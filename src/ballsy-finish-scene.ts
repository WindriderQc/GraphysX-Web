import { Mesh, MeshStandardMaterial, type Object3D } from "three";
import type { AgentWorldEntityDefinition } from "./agent-world-runtime";
import { BALLSY_SPARKLE_SECONDS, type BallsyFinish } from "./ballsy-finish";

/** A tiny native effect pool, using the ordinary world vocabulary and no colliders. */
export function ballsyFinishEntities(): AgentWorldEntityDefinition[] {
  return [0, 1].flatMap(slot => Array.from({ length: 9 }, (_, index): AgentWorldEntityDefinition => ({
    id: `ballsy-finish-effect-${slot}-${index}`,
    type: index === 0 ? "torus" : "icosahedron",
    geometry: index === 0 ? { radius: 1.05, tube: .035, radialSegments: 24 } : { radius: .13 },
    material: { color: index % 3 ? "#ffe7a3" : "#fff8df", emissive: "#ffe2a0", emissiveIntensity: .8, roughness: .3, opacity: .9 },
    visible: false, castShadow: false, receiveShadow: false, tags: ["ballsy", "finish", "transient"],
  })));
}

/** Project the presentation clock onto live objects in the existing frame subscription. */
export function projectBallsyFinishes(
  finishes: readonly BallsyFinish[],
  players: readonly { id: string; position: readonly number[] }[],
  objectFor: (id: string) => Object3D | null | undefined,
): void {
  players.forEach((player, slot) => {
    const finish = finishes.find(entry => entry.subjectId === player.id);
    const progress = Math.min(1, (finish?.sparkleSeconds ?? 0) / BALLSY_SPARKLE_SECONDS);
    const visible = !!finish && progress < 1;
    for (let index = 0; index < 9; index++) {
      const object = objectFor(`ballsy-finish-effect-${slot}-${index}`);
      if (!object) continue;
      object.visible = visible;
      if (!visible) continue;
      const [x, y, z] = player.position;
      if (index === 0) {
        object.position.set(x, y - .42, z);
        object.rotation.set(Math.PI / 2, 0, 0);
        object.scale.setScalar(1 + .22 * Math.sin(progress * Math.PI));
      } else {
        const angle = index * Math.PI / 4 + progress * 1.1;
        const radius = .8 + .5 * Math.sin(progress * Math.PI);
        object.position.set(x + Math.cos(angle) * radius, y + .15 + .65 * Math.sin(progress * Math.PI + index % 2 * .4), z + Math.sin(angle) * radius);
        object.rotation.set(progress * 2 + index, angle, progress * 3);
        object.scale.set(.65, 1.6, .65);
      }
      object.updateMatrix();
      if (object instanceof Mesh) for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!(material instanceof MeshStandardMaterial)) continue;
        material.opacity = .9 * Math.min(1, (1 - progress) * 3);
        material.depthWrite = false;
      }
    }
  });
}
