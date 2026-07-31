// Voie Lactée — the recovered planetary row, for inspection.
//
// Converted to the shared preview bootstrap (`preview-bootstrap.ts`). It no longer creates a
// renderer, no longer runs its own `requestAnimationFrame`, and no longer queries a canvas
// id that nothing in this repo provides. The host owns all three; this owns the scene content
// and how it steps. The archive data is untouched — only the plumbing changed.
//
// This is the worked example the conversion recipe in docs/PREVIEWS.md points at.

import { AmbientLight, Color, DirectionalLight } from "three";
import { MilkyWayEnvironment, type MilkyWayProfile } from "./milky-way-environment";
import type { PreviewContext, PreviewHandle } from "./preview-bootstrap";

export function mount({ scene, camera, controls }: PreviewContext): PreviewHandle {
  scene.background = new Color(0x000000);
  const ambient = new AmbientLight(0x8aa4cc, 0.55);
  const keyLight = new DirectionalLight(0xffffff, 2.5);
  keyLight.position.set(24, 45, 42);
  scene.add(ambient, keyLight);

  camera.fov = 48;
  camera.near = 0.1;
  camera.far = 1000;
  camera.position.set(25, 43, 92);
  camera.lookAt(-36, 15, 8);
  camera.updateProjectionMatrix();

  // Preserved from the original harness: `?profile=ballz2015` selects the earlier recovered
  // profile. Two archive profiles exist and comparing them is the point of this preview.
  const requested = new URLSearchParams(window.location.search).get("profile");
  const profile: MilkyWayProfile = requested === "ballz2015" ? "ballz2015" : "graphysx2017";
  const environment = new MilkyWayEnvironment({ profile });
  scene.add(environment.group);

  // The reset the old module bound to the `r` key. A button instead: a keyboard shortcut
  // with no visible affordance is undiscoverable, and it collided across harnesses.
  const reset = document.createElement("button");
  reset.type = "button";
  reset.textContent = "Reset orbits";
  reset.addEventListener("click", () => environment.reset());
  controls.append(reset);

  return {
    ready: environment.ready,
    step: (deltaSeconds) => environment.update(deltaSeconds),
    describe: () => ({
      mode: "voie-lactee-archive-preview",
      profile,
      coordinateSystem: "+X right, +Y up, +Z toward the recovered planet row",
      camera: {
        evidence: "inspection-only; no Voie Lactée-specific archive camera was recovered",
        position: camera.position.toArray(),
        lookAt: [-36, 15, 8],
      },
      environment: environment.getState(),
    }),
    dispose: () => {
      scene.remove(environment.group, ambient, keyLight);
      environment.dispose();
    },
  };
}
