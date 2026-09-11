import type { AgentWorldVector3, GraphysXAgentWorldApi } from "./agent-world-runtime";
import { kidxBuildScene } from "./kidx-missions";

/** An observable, magnified 8:24 gear demonstration using real LDraw gear geometry. */
export function mountKidxMechanismDemo(root: HTMLElement, api: GraphysXAgentWorldApi, frameView: (position: AgentWorldVector3, target: AgentWorldVector3, seconds?: number) => void, onExit: () => void) {
  api.load(kidxBuildScene([
    { id: "kidx-gear-driver", label: "Pignon moteur · 8 dents", type: "model", asset: { id: "ev3-driving-gear-8" }, transform: { position: [-1.56, 0, 0], rotationDegrees: [90, 0, 0], scale: [6, 6, 6] }, castShadow: true, tags: ["kidx-mechanism"] },
    { id: "kidx-gear-driven", label: "Roue entraînée · 24 dents", type: "model", asset: { id: "ev3-driving-gear-24" }, transform: { position: [1.56, 0, 0], rotationDegrees: [90, 0, 7.5], scale: [6, 6, 6] }, castShadow: true, tags: ["kidx-mechanism"] },
    ...[-1.56, 1.56].map((x, index) => ({ id: `kidx-gear-axle-${index}`, label: "Axe de rotation", type: "cylinder" as const, transform: { position: [x, .12, 0] as AgentWorldVector3 }, geometry: { radius: .075, height: 1.9, radialSegments: 8 }, material: { color: index === 0 ? "#df5542" : "#429abe", roughness: .5 } })),
  ]));
  const reframe = () => { const distance = Math.max(1, .9 / (root.clientWidth / Math.max(1, root.clientHeight))); frameView([0, 10 * distance, 7.5 * distance], [.5, 0, 0], .4); };
  api.pause(true); reframe();
  const ui = document.createElement("section"); ui.className = "kx-mechanism";
  ui.innerHTML = `<header><button data-demo-back>← Atelier</button><h1>Pourquoi cette roue tourne moins vite ?</h1></header>
    <aside><small>COMPRENDRE EN 3D · 8 DENTS → 24 DENTS</small><h2 data-demo-caption></h2><p>Compte les dents : la grande roue en a trois fois plus. Elle tourne donc trois fois moins vite.</p><output data-demo-turns></output></aside>
    <footer><button data-demo-play>Pause</button><button data-demo-restart>↺ Revoir depuis le début</button><label>Vitesse <select data-demo-speed><option value=".25">Très lente</option><option value=".5">Lente</option><option value="1" selected>Normale</option></select></label><button data-demo-reverse>Changer le sens du moteur</button></footer>`;
  root.append(ui);
  let playing = true, elapsed = 0, rotation = 0, speed = 1, direction = 1;
  const render = () => {
    ui.querySelector("[data-demo-caption]")!.textContent = elapsed < 4 ? "Le petit pignon entraîne la grande roue." : elapsed < 8 ? "Les deux roues tournent dans des sens opposés." : "Trois tours du petit pignon donnent un tour de la grande roue.";
    ui.querySelector("[data-demo-turns]")!.textContent = `8 dents : ${(rotation / 360).toFixed(2)} tours · 24 dents : ${(-rotation / 1080).toFixed(2)} tours`;
    ui.querySelector("[data-demo-play]")!.textContent = playing ? "Pause" : "Continuer";
    api.transaction([{ op: "update", id: "kidx-gear-driver", patch: { transform: { rotationDegrees: [90, 0, rotation] } } }, { op: "update", id: "kidx-gear-driven", patch: { transform: { rotationDegrees: [90, 0, 7.5 - rotation / 3] } } }]);
  };
  ui.querySelector("[data-demo-back]")!.addEventListener("click", onExit);
  ui.querySelector("[data-demo-play]")!.addEventListener("click", () => { playing = !playing; render(); });
  ui.querySelector("[data-demo-restart]")!.addEventListener("click", () => { elapsed = rotation = 0; playing = true; render(); });
  ui.querySelector("[data-demo-speed]")!.addEventListener("change", event => { speed = Number((event.target as HTMLSelectElement).value); });
  ui.querySelector("[data-demo-reverse]")!.addEventListener("click", () => { direction *= -1; });
  render();
  return {
    reframe,
    advance(delta: number) { if (playing && api.query({ tag: "kidx-mechanism" }).every(e => e.asset?.status === "ready")) { const dt = Math.min(.1, delta) * speed; elapsed += dt; rotation += dt * 90 * direction; if (elapsed >= 12) playing = false; render(); } },
    state: () => ({ playing, elapsed, speed, direction, driverDegrees: rotation, drivenDegrees: -rotation / 3, ratio: "8:24" }),
    dispose: () => ui.remove(),
  };
}
