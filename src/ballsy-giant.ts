import { ACESFilmicToneMapping, Box3, BoxGeometry, BufferGeometry, CanvasTexture, Color, Group, Line, LineBasicMaterial, Matrix4, Mesh, MeshStandardMaterial, PerspectiveCamera, Quaternion, Raycaster, Scene, SphereGeometry, CylinderGeometry, TorusGeometry, Vector2, Sprite, SpriteMaterial, SRGBColorSpace, Vector3, WebGLRenderer } from "three";
import { AgentWorldRuntime } from "./agent-world-runtime";
import { createAgentWorldApi } from "./agent-world-api";
import { composeBallsyCourse } from "./ballsy-scene";
import { projectVolcano } from "./ballsy-volcano-scene";
import { createBallsyGuestLink, ballsyRelayAvailable } from "./ballsy-link";
import { createVolcano, volcanoWave } from "./ballsy-volcano";
import { bridgeOcclusionDistance } from "./ballsy-picking";
import { EARTH_BOUNDS, surfaceHeightAt } from "./ballsy-earth";
import { showStartupError } from "./startup-error";
import "./ballsy-giant.css";

const root = document.querySelector<HTMLElement>("#giant")!;
try {
root.innerHTML = `<section class="giant-overlay"><header><a href="./ballsy.html">Ballsy · Le géant</a><span>La course reste sur la télé</span></header>
  <div class="giant-connect"><form><label for="room-code">Code affiché sur la télé</label><div><input id="room-code" maxlength="12" autocomplete="off" spellcheck="false" placeholder="ABCD-EFGH" required><button type="submit">Rejoindre</button></div></form>
  <p data-status role="status">Saisis le code de la partie.</p><div class="giant-actions"><button data-vr disabled>Vérification du Quest…</button><button data-recenter hidden>Ramener la table</button><button data-leave hidden>Rendre la pelle</button></div><small data-vr-help></small></div>
  <aside class="giant-desktop" data-controls hidden><h2>Une vraie pelle</h2><p data-task></p><small>En VR : la pelle suit ta main droite. Garde la gâchette pressée, enfonce la lame dans la terre puis tire et soulève. Une main immobile ne creuse pas.<br>À l’écran : clique et glisse directement sur la terre.</small></aside></section>`;
const element = <T extends HTMLElement>(selector: string): T => root.querySelector<T>(selector)!;
const vrButton = element<HTMLButtonElement>("[data-vr]");
const roomInput = element<HTMLInputElement>("#room-code");
const scene = new Scene();
const tableRig = new Group(); scene.add(tableRig);
scene.background = new Color("#dce3d4");
const renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.outputColorSpace = SRGBColorSpace; renderer.toneMapping = ACESFilmicToneMapping;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); renderer.shadowMap.enabled = true;
renderer.xr.enabled = true; renderer.xr.setReferenceSpaceType("local-floor");
root.prepend(renderer.domElement);
const camera = new PerspectiveCamera(65, 1, 0.02, 30);
camera.position.set(0, 1.6, 0.1); camera.lookAt(0.15, 0.87, -1.05);
const definition = composeBallsyCourse({ volcano: true });
definition.rules = undefined;
// This view never simulates the race: only the PC's snapshots place the two balls.
for (const entity of definition.entities) { delete entity.physics; delete entity.steering; }
const world = new AgentWorldRuntime(definition);
const api = createAgentWorldApi(world);
api.pause(true);
world.group.scale.setScalar(0.045); world.group.position.set(0, 0.82, -1.05);
tableRig.add(world.group);
for (const id of ["ballsy-p1", "ballsy-p2"]) api.update(id, { visible: false });
projectVolcano(api, createVolcano(), (id) => world.getEntityObject(id));

const ownedTextures: CanvasTexture[] = [], ownedMaterials: SpriteMaterial[] = [];
function label(width: number, height: number): { sprite: Sprite; draw: (text: string, sub?: string) => void } {
  const canvas = document.createElement("canvas"); canvas.width = 768; canvas.height = 192;
  const ctx = canvas.getContext("2d")!;
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace;
  const material = new SpriteMaterial({ map: texture, depthTest: false });
  const sprite = new Sprite(material); sprite.scale.set(width, height, 1); sprite.renderOrder = 10;
  ownedTextures.push(texture); ownedMaterials.push(material);
  let previous = "";
  return { sprite, draw(text, sub = "") {
    const next = `${text}|${sub}`; if (previous === next) return; previous = next;
    ctx.clearRect(0, 0, 768, 192); ctx.fillStyle = "#fff8e9"; ctx.fillRect(0, 0, 768, 192);
    ctx.fillStyle = "#31564d"; ctx.textAlign = "center"; ctx.font = "bold 48px sans-serif"; ctx.fillText(text, 384, sub ? 76 : 114, 730);
    if (sub) { ctx.font = "30px sans-serif"; ctx.fillText(sub, 384, 138, 730); }
    texture.needsUpdate = true;
  } };
}
const statusLabel = label(1.05, 0.26); statusLabel.sprite.position.set(0, 1.5, -1.32); tableRig.add(statusLabel.sprite);
const buttons: Mesh<BoxGeometry, MeshStandardMaterial>[] = [];
const buttonLabels: ReturnType<typeof label>[] = [];
for (let i = 0; i < 2; i++) {
  const button = new Mesh(new BoxGeometry(0.24, 0.10, 0.06), new MeshStandardMaterial({ color: "#d9ae70", roughness: 0.7 }));
  button.position.set(i ? -0.69 : 0.69, 1.48, -1.32);
  const text = label(0.23, 0.08);
  text.sprite.position.copy(button.position).add(new Vector3(0, 0.02, 0.04));
  text.draw(i ? "Ramener la table" : "Sortir VR");
  buttons.push(button); buttonLabels.push(text); tableRig.add(button, text.sprite);
}
let supported = false, disposed = false, frameCount = 0, projectedKey = "", activeOwner: object | string | null = null;
let lastHold = 0, lastMessage = "", startingVR = false;
let selectStarts = 0, selectEnds = 0;
let placementPending = false, placements = 0;
const headRotation = new Quaternion(), headForward = new Vector3();
const recenterHeld = new WeakMap<XRInputSource, boolean>();
const hoverTargets: (number | null)[] = [null, null];
const poses = [0, 1].map(() => ({ from: new Vector3(), to: new Vector3(), active: false }));
let poseStarted = 0, projectedRound = "";
const link = createBallsyGuestLink(() => paint());
const raycaster = new Raycaster(), rotation = new Matrix4(), point = new Vector3();
const controllers: Group[] = [];
const beams: Line[] = [];
const cursors: Mesh[] = [];

const grips: Group[] = [], shovels: Group[] = [];
const sources: (XRInputSource | null)[] = [null, null];
const triggerHeld = [false, false];
const bladeTip = new Vector3(0, -0.055, -0.55);
const modelTip = new Vector3();
let shovelSamples = 0, lastTip: number[] | null = null, desktopDown = false;
function release(owner?: object | string): void {
  if (owner !== undefined && activeOwner !== owner) return;
  if (activeOwner !== null) link.send({ type: "release" });
  activeOwner = null; desktopDown = false;
  triggerHeld.fill(false);
}
function canDig(): boolean {
  const s = link.state();
  return !!s.live && s.snapshot?.phase === "racing";
}
function sampleTip(tip: Vector3, owner: object | string): void {
  if (!canDig() || (activeOwner !== null && activeOwner !== owner)) return;
  activeOwner = owner;
  lastTip = tip.toArray(); shovelSamples++;
  link.send({ type: "shovel", tip: tip.toArray() as [number, number, number], held: true });
  lastHold = performance.now();
}
function activate(index: number): void {
  release();
  if (index === 0) void endVR();
  else placementPending = true;
}
function dominantIndex(): number {
  const right = sources.findIndex((source) => source?.handedness === "right");
  return right >= 0 ? right : sources.findIndex((source) => !!source?.gripSpace);
}
function makeShovel(): Group {
  const tool = new Group();
  const wood = new MeshStandardMaterial({ color: "#d5a260", roughness: 0.85 });
  const steel = new MeshStandardMaterial({ color: "#68a6ac", metalness: 0.65, roughness: 0.28 });
  const shaft = new Mesh(new CylinderGeometry(0.013, 0.016, 0.43, 12), wood);
  shaft.rotation.x = Math.PI / 2; shaft.position.z = -0.19;
  const blade = new Mesh(new BoxGeometry(0.105, 0.018, 0.15), steel);
  blade.position.set(0, -0.025, -0.475); blade.rotation.x = -0.35;
  const handle = new Mesh(new TorusGeometry(0.043, 0.009, 8, 16, Math.PI), steel);
  handle.position.z = 0.04; handle.rotation.x = Math.PI / 2;
  tool.add(shaft, blade, handle); tool.visible = false;
  tool.traverse((object) => { if (object instanceof Mesh) object.castShadow = true; });
  return tool;
}
function target(controller: Group): number | null {
  controller.updateWorldMatrix(true, false);
  rotation.extractRotation(controller.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).transformDirection(rotation);
  const hit = raycaster.intersectObjects(buttons, false)[0];
  const index = controllers.indexOf(controller);
  beams[index].visible = !!hit;
  beams[index].scale.z = hit ? hit.distance / 3 : 1;
  cursors[index].visible = !!hit && renderer.xr.isPresenting;
  if (hit) cursors[index].position.copy(hit.point);
  return hit ? buttons.indexOf(hit.object as typeof buttons[number]) : null;
}
for (let i = 0; i < 2; i++) {
  const controller = renderer.xr.getController(i);
  const beam = new Line(new BufferGeometry().setFromPoints([new Vector3(), new Vector3(0, 0, -3)]), new LineBasicMaterial({ color: "#f5c26b" }));
  controller.add(beam); scene.add(controller); controllers.push(controller); beams.push(beam);
  const cursor = new Mesh(new SphereGeometry(0.008, 8, 6), new MeshStandardMaterial({ color: "#f5c26b", emissive: "#805a25", emissiveIntensity: 0.5 }));
  cursor.visible = false; scene.add(cursor); cursors.push(cursor);
  const grip = renderer.xr.getControllerGrip(i), shovel = makeShovel();
  grip.add(shovel); scene.add(grip); grips.push(grip); shovels.push(shovel);
  controller.addEventListener("connected", (event) => { sources[i] = event.data as XRInputSource; });
  controller.addEventListener("selectstart", () => {
    selectStarts++;
    const hit = target(controller);
    if (hit !== null) { activate(hit); return; }
    if (i === dominantIndex() && canDig()) { triggerHeld[i] = true; activeOwner = controller; }
  });
  controller.addEventListener("selectend", () => { selectEnds++; release(controller); });
  controller.addEventListener("disconnected", () => { release(controller); sources[i] = null; shovels[i].visible = false; });
}

function task(): string {
  const s = link.state(), v = s.snapshot?.volcano;
  if (!s.live || !v) return s.message;
  if (s.snapshot?.phase !== "racing") return s.snapshot?.phase === "paused" ? "La course est en pause." : "Attends le départ sur la télé.";
  return "Gâchette + mouvement : enfonce, tire et soulève la pelle pour ouvrir ton canal.";
}
function paint(): void {
  if (disposed) return;
  const s = link.state(), v = s.snapshot?.volcano;
  element("[data-status]").textContent = lastMessage || s.message;
  element("[data-controls]").hidden = !s.joined;
  element("[data-task]").textContent = task();
  element("[data-leave]").hidden = !s.joined;
  element("[data-recenter]").hidden = !renderer.xr.isPresenting;
  vrButton.disabled = !supported || !s.joined || !s.live || startingVR;
  vrButton.textContent = renderer.xr.isPresenting ? "Sortir de VR" : supported ? "Devenir le géant en VR" : "VR indisponible ici";
  const wave = v ? volcanoWave(v) : null;
  const title = v ? `${v.mode === "help" ? `Aide ${s.snapshot?.ally === 1 ? "Corail" : "Lagon"}` : "Le géant"} · ${v.earth.excavated.toFixed(1)} m³ creusés${v.mode === "help" ? wave?.active ? " · CRUE !" : ` · crue ${Math.ceil(wave?.inSeconds ?? 0)} s` : ""}` : "Ballsy · Le géant";
  statusLabel.draw(title, task());
  for (let i = 0; i < 2; i++) {
    buttons[i].visible = buttonLabels[i].sprite.visible = renderer.xr.isPresenting;
  }
}
async function endVR(): Promise<void> { release(); await renderer.xr.getSession()?.end(); }
async function enterVR(): Promise<void> {
  if (renderer.xr.isPresenting) { await endVR(); return; }
  if (!window.isSecureContext || !navigator.xr || !supported) { lastMessage = "Le Quest a besoin d'une adresse HTTPS reconnue."; paint(); return; }
  startingVR = true; lastMessage = ""; paint();
  let session: XRSession | null = null;
  try {
    session = await navigator.xr.requestSession("immersive-vr", { optionalFeatures: ["local-floor"] });
    session.addEventListener("end", () => { release(); link.leave(); placementPending = false; startingVR = false; paint(); }, { once: true });
    session.addEventListener("visibilitychange", () => { if (session?.visibilityState === "hidden") { release(); void endVR(); } });
    session.addEventListener("inputsourceschange", () => release());
    placementPending = true;
    await renderer.xr.setSession(session);
  } catch (error) {
    if (session) await session.end().catch(() => undefined);
    lastMessage = error instanceof Error ? `Entrée VR refusée : ${error.message}` : "Entrée VR indisponible. La vue écran reste utilisable.";
  } finally { startingVR = false; paint(); }
}
vrButton.addEventListener("click", () => { void enterVR(); });
renderer.xr.addEventListener("sessionend", () => {
  tableRig.position.set(0, 0, 0); tableRig.rotation.set(0, 0, 0);
  camera.position.set(0, 1.6, 0.1); camera.lookAt(0.15, 0.87, -1.05); camera.updateMatrixWorld(true);
  paint();
});
element("[data-recenter]").addEventListener("click", () => { release(); placementPending = true; });
element("form").addEventListener("submit", (event) => {
  event.preventDefault(); lastMessage = "";
  void link.join(roomInput.value).catch((error: unknown) => { lastMessage = error instanceof Error ? error.message : "Connexion refusée."; paint(); });
});
element("[data-leave]").addEventListener("click", () => { release(); link.leave(); });
const pointer = new Vector2();
const desktopCursor = new Mesh(new SphereGeometry(0.012, 12, 8), new MeshStandardMaterial({ color: "#f5c26b", emissive: "#6a4110" }));
desktopCursor.visible = false; scene.add(desktopCursor);
function desktopTip(event: PointerEvent): Vector3 | null {
  const earth = link.state().snapshot?.volcano.earth;
  if (!earth || renderer.xr.isPresenting) return null;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
  scene.updateMatrixWorld(true); raycaster.setFromCamera(pointer, camera);
  // Transform the pointer ray only; hand/shovel poses and the VR scale are unchanged.
  const localRay = raycaster.ray.clone().applyMatrix4(new Matrix4().copy(world.group.matrixWorld).invert());
  const p = new Vector3();
  const modelScale = world.group.getWorldScale(new Vector3()).x;
  const maximumDistance = Math.min(camera.far / modelScale, bridgeOcclusionDistance(localRay));
  for (let t = 0; t < maximumDistance; t += 0.12) {
    localRay.at(t, p);
    if (p.x < EARTH_BOUNDS.minX || p.x > EARTH_BOUNDS.maxX || p.z < EARTH_BOUNDS.minZ || p.z > EARTH_BOUNDS.maxZ) continue;
    const y = surfaceHeightAt(earth, p.x, p.z);
    if (p.y <= y) { p.y = y - 0.14; return p; }
  }
  return null;
}
function movePointer(event: PointerEvent): void {
  const tip = desktopTip(event);
  desktopCursor.visible = !!tip;
  if (tip) {
    desktopCursor.position.copy(world.group.localToWorld(tip.clone().add(new Vector3(0, 0.25, 0))));
    if (desktopDown && performance.now() - lastHold >= 50) sampleTip(tip, "mouse");
  } else if (desktopDown) release("mouse");
}
renderer.domElement.style.touchAction = "none";
renderer.domElement.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || !canDig() || renderer.xr.isPresenting) return;
  const tip = desktopTip(event); if (!tip) return;
  renderer.domElement.setPointerCapture(event.pointerId); desktopDown = true; sampleTip(tip, "mouse");
});
renderer.domElement.addEventListener("pointermove", movePointer);
for (const name of ["pointerup", "pointercancel", "lostpointercapture"] as const) renderer.domElement.addEventListener(name, () => release("mouse"));
renderer.domElement.addEventListener("pointerleave", () => { desktopCursor.visible = false; });
const visibility = (): void => { if (document.hidden) release(); };
document.addEventListener("visibilitychange", visibility);
const resize = (): void => { renderer.setSize(root.clientWidth, root.clientHeight); camera.aspect = root.clientWidth / root.clientHeight; camera.updateProjectionMatrix(); };
const blur = (): void => release();
window.addEventListener("resize", resize); window.addEventListener("blur", blur);
resize();
void ballsyRelayAvailable().then((available) => { if (!available) { lastMessage = "Le relais du géant n'est pas lancé pour cette prévisualisation."; paint(); } });
void (async () => {
  try { supported = !!(window.isSecureContext && navigator.xr && await navigator.xr.isSessionSupported("immersive-vr")); } catch { supported = false; }
  element("[data-vr-help]").textContent = supported ? "La table se place devant toi. Bouton A/X du Quest : la ramener si tu changes de place."
    : !window.isSecureContext ? "Cette adresse HTTP ne permet pas la VR. Utilise l'accès privé HTTPS ou USB local préparé pour le Quest. La souris reste disponible."
    : "Ce navigateur n'annonce pas de casque VR disponible. Sur Quest, ouvre la même partie via HTTPS privé ou USB local. La souris reste disponible.";
  paint();
})();

renderer.setAnimationLoop((_time, frame) => {
  if (disposed) return;
  for (const source of renderer.xr.getSession()?.inputSources ?? []) {
    const pad = source.gamepad;
    const quest = source.profiles.some((profile) => /^(?:oculus-touch|meta-quest-touch)/.test(profile));
    const down = quest && pad?.mapping === "xr-standard" && !!(pad.buttons[4]?.pressed || (pad.buttons[4]?.value ?? 0) > 0.5);
    if (down && !recenterHeld.get(source)) { release(); placementPending = true; }
    recenterHeld.set(source, down);
  }
  if (placementPending && frame && renderer.xr.isPresenting) {
    const reference = renderer.xr.getReferenceSpace();
    const pose = reference ? frame.getViewerPose(reference) : null;
    if (pose) {
      const { position, orientation } = pose.transform;
      headRotation.set(orientation.x, orientation.y, orientation.z, orientation.w);
      headForward.set(0, 0, -1).applyQuaternion(headRotation); headForward.y = 0;
      const yaw = headForward.lengthSq() > 0.01 ? Math.atan2(-headForward.x, -headForward.z) : tableRig.rotation.y;
      // Move the tabletop once, never the viewer or race. Looking around does not drag it.
      tableRig.position.set(position.x, position.y - 1.6, position.z); tableRig.rotation.set(0, yaw, 0);
      placementPending = false; placements++;
    }
  }
  frameCount++; link.maintain();
  const s = link.state(), snapshot = s.snapshot;
  if (snapshot) {
    const key = `${snapshot.roundId}|${snapshot.phase}|${snapshot.volcano.time}`;
    if (key !== projectedKey) {
      projectedKey = key; projectVolcano(api, snapshot.volcano, (id) => world.getEntityObject(id));
      snapshot.players.forEach((player, i) => {
        const pose = poses[i], object = world.getEntityObject(player.id);
        pose.from.copy(object?.position ?? new Vector3(...player.position)); pose.to.set(...player.position);
        if (projectedRound !== snapshot.roundId || pose.from.distanceTo(pose.to) > 6) pose.from.copy(pose.to);
        pose.active = true;
        if (object) object.visible = true;
      });
      projectedRound = snapshot.roundId; poseStarted = performance.now();
      paint();
    }
    // Presentation interpolation only. No race physics or rules run on the headset.
    const fraction = Math.min(1, (performance.now() - poseStarted) / 90);
    snapshot.players.forEach((player, i) => {
      const object = world.getEntityObject(player.id);
      if (poses[i].active && object) object.position.lerpVectors(poses[i].from, poses[i].to, fraction);
    });
  }
  if (!canDig()) release();
  scene.updateMatrixWorld(true);
  const dominant = dominantIndex(), reference = renderer.xr.getReferenceSpace();
  for (const [index, controller] of controllers.entries()) {
    const source = sources[index];
    const tracked = !!(frame && reference && source?.gripSpace && frame.getPose(source.gripSpace, reference));
    shovels[index].visible = renderer.xr.isPresenting && index === dominant && tracked;
    if (!renderer.xr.isPresenting) { beams[index].visible = false; cursors[index].visible = false; continue; }
    hoverTargets[index] = target(controller);
    if (!tracked && activeOwner === controller) release(controller);
    if (tracked && triggerHeld[index] && index === dominant && performance.now() - lastHold >= 50) {
      modelTip.copy(bladeTip); grips[index].localToWorld(modelTip); world.group.worldToLocal(modelTip);
      sampleTip(modelTip, controller);
    }
  }
  if (renderer.xr.isPresenting) desktopCursor.visible = false;
  renderer.render(scene, camera);
});
function dispose(): void {
  if (disposed) return;
  release(); link.leave(); disposed = true; renderer.setAnimationLoop(null);
  window.removeEventListener("resize", resize); window.removeEventListener("blur", blur);
  void renderer.xr.getSession()?.end();
  document.removeEventListener("visibilitychange", visibility);
  world.dispose();
  for (const shovel of shovels) shovel.traverse((object) => { if (object instanceof Mesh) { object.geometry.dispose(); (object.material as MeshStandardMaterial).dispose(); } });
  desktopCursor.geometry.dispose(); desktopCursor.material.dispose();
  for (const mesh of [...buttons, ...cursors]) { mesh.geometry.dispose(); (mesh.material as MeshStandardMaterial).dispose(); }
  for (const line of beams) { line.geometry.dispose(); (line.material as LineBasicMaterial).dispose(); }
  for (const texture of ownedTextures) texture.dispose(); for (const material of ownedMaterials) material.dispose();
  renderer.dispose();
}
window.addEventListener("pagehide", dispose, { once: true });
Object.assign(window, { __BALLSY_GIANT__: {
  endVR, dispose,
  terrainPoint: (x: number, z: number, penetration = 0) => {
    const earth = link.state().snapshot?.volcano.earth;
    if (!earth) return null;
    const model = new Vector3(x, surfaceHeightAt(earth, x, z) - penetration, z);
    const physical = world.group.localToWorld(model.clone()), screen = physical.clone().project(camera);
    return { model: model.toArray(), world: physical.toArray(), screen: [(screen.x + 1) * root.clientWidth / 2, (1 - screen.y) * root.clientHeight / 2] };
  },
  state: () => {
    const bounds = new Box3().setFromObject(world.group);
    return { ...link.state(), view: renderer.xr.isPresenting ? "vr" : "screen", frameCount,
      eyes: renderer.xr.isPresenting ? renderer.xr.getCamera().cameras.length : 1,
      shovel: { samples: shovelSamples, lastTip, held: activeOwner !== null, dominant: dominantIndex(),
        tipOffset: bladeTip.toArray(), visible: shovels.map((tool) => tool.visible),
        gripWorld: grips.map((grip) => grip.getWorldPosition(new Vector3()).toArray()),
        tipWorld: grips.map((grip) => grip.localToWorld(bladeTip.clone()).toArray()) },
      earthTargets: [ [7, 0], [9, 0], [11, 0] ].map(([x,z]) => {
        const earth = link.state().snapshot?.volcano.earth;
        const position = new Vector3(x, earth ? surfaceHeightAt(earth,x,z) : 0.8, z);
        const worldPosition = world.group.localToWorld(position.clone());
        const screen = worldPosition.clone().project(camera);
        return { model: position.toArray(), world: worldPosition.toArray(), screen: [(screen.x+1)*root.clientWidth/2,(1-screen.y)*root.clientHeight/2] };
      }),
      selectStarts, selectEnds, hoverTargets: [...hoverTargets], placements,
      table: { position: tableRig.position.toArray(), yaw: tableRig.rotation.y, centre: world.group.getWorldPosition(new Vector3()).toArray() },
      screenCamera: { position: camera.position.toArray(), direction: camera.getWorldDirection(new Vector3()).toArray() },
      controllers: Array.from(renderer.xr.getSession()?.inputSources ?? []).map((source) => ({ hand: source.handedness, profiles: source.profiles, mapping: source.gamepad?.mapping,
        primaryDown: !!(source.gamepad?.buttons[4]?.pressed || (source.gamepad?.buttons[4]?.value ?? 0) > 0.5) })),
      boardSize: bounds.getSize(new Vector3()).toArray(),
      targets: buttons.map((b) => b.getWorldPosition(new Vector3()).toArray()),
      renderedPlayers: ["ballsy-p1", "ballsy-p2"].map((id) => ({ id, local: world.getEntityObject(id)?.position.toArray(), world: world.getEntityObject(id)?.getWorldPosition(point).toArray() })) };
  },
} });
paint();
} catch (error) { showStartupError(root, error); }
