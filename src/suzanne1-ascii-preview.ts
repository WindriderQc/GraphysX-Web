// Suzanne 1 — the recovered ASCII arena, rebuilt as geometry for eyeballing the transcription.
//
// Converted to the shared preview bootstrap. Renderer, frame loop and canvas belong to the
// host now; the archive data and the recovered camera framing are unchanged.

import { Color } from "three";
import { SuzanneAsciiEnvironment } from "./suzanne1-ascii-environment";
import type { PreviewContext, PreviewHandle } from "./preview-bootstrap";

export function mount({ scene, camera, renderer, controls }: PreviewContext): PreviewHandle {
  scene.background = new Color(0x000000);

  camera.fov = 60;
  camera.near = 0.01;
  camera.far = 1000;
  camera.position.set(3, 7.5, 43);
  camera.lookAt(18, 1, 18);
  camera.updateProjectionMatrix();

  // The one renderer setting this harness needs beyond the shared defaults. Restored on
  // dispose so the next preview mounted into the same renderer does not inherit it.
  const shadowsWere = renderer.shadowMap.enabled;
  renderer.shadowMap.enabled = true;

  const requested = new URLSearchParams(window.location.search).get("profile");
  const profile = requested === "source2017" ? "source2017" : "reference2016";
  const environment = new SuzanneAsciiEnvironment({ profile });
  scene.add(environment.group);

  const reset = document.createElement("button");
  reset.type = "button";
  reset.textContent = "Reset rings";
  reset.addEventListener("click", () => {
    environment.resetRings();
    environment.pistonAssemblies.forEach((_assembly, index) => environment.setPistonActivation(index, 0));
  });
  controls.append(reset);

  return {
    ready: environment.ready,
    step: (deltaSeconds) => environment.update(deltaSeconds),
    describe: () => ({
      mode: "suzanne-ascii-archive-preview",
      profile,
      coordinateSystem: "+X ASCII columns, +Y up, +Z ASCII rows; 40x40 world-unit arena",
      camera: {
        position: camera.position.toArray().map((value) => Number(value.toFixed(3))),
        lookAt: [18, 1, 18],
      },
      environment: environment.getState(),
    }),
    dispose: () => {
      scene.remove(environment.group);
      renderer.shadowMap.enabled = shadowsWere;
      reset.remove();
    },
  };
}
