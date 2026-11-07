import { ACESFilmicToneMapping, Box3, BoxGeometry, CanvasTexture, Color, Group, Matrix4, Mesh, MeshStandardMaterial, PerspectiveCamera, Plane, Quaternion, Raycaster, Scene, SphereGeometry, CylinderGeometry, TorusGeometry, Vector2, Sprite, SpriteMaterial, SRGBColorSpace, Vector3, WebGLRenderer } from "three";
import { AgentWorldRuntime } from "./agent-world-runtime";
import { createAgentWorldApi } from "./agent-world-api";
import { composeBallsyCourse } from "./ballsy-scene";
import { projectVolcano } from "./ballsy-volcano-scene";
import { createBallsyGuestLink, ballsyRelayAvailable } from "./ballsy-link";
import { createVolcano, volcanoWave } from "./ballsy-volcano";
import { bridgeOcclusionDistance } from "./ballsy-picking";
import { EARTH_BOUNDS, surfaceHeightAt } from "./ballsy-earth";
import { BallsyThrowGesture, canGrabBallsyBalloon, ballsyThrowInSpace, type BallsyThrow, type ThrowPoint } from "./ballsy-throw";
import { BALLOON_GRIP_OFFSET, makeGiantBalloon, disposeGiantProp } from "./ballsy-giant-balloon";
import { VrInputRig, type VrInputAction } from "./xr/vr-input";
import { VrSessionController } from "./xr/vr-session";
import { GIANT_XR_FRESH_MS, readGiantXrPose, giantXrWorldPoint, freshGiantXrRelease, type GiantXrRelease } from "./ballsy-giant-xr";
import { ballsySlimeEntities, projectBallsySlime } from "./ballsy-slime-scene";
import { BALLSY_SLIME_LIMITS, parseGiantCommand } from "../server/ballsy-protocol.mjs";
import { showStartupError } from "./startup-error";
import "./ballsy-giant.css";

const root = document.querySelector<HTMLElement>("#giant")!;
try {
root.innerHTML = `<section class="giant-overlay"><header><a href="./ballsy.html">Ballsy · Le géant</a><span>La course reste sur la télé</span></header>
  <div class="giant-connect"><form><label for="room-code">Code affiché sur la télé</label><div><input id="room-code" maxlength="12" autocomplete="off" spellcheck="false" placeholder="ABCD-EFGH" required><button type="submit">Rejoindre</button></div></form>
  <p data-status role="status">Saisis le code de la partie.</p><div class="giant-actions"><button data-vr disabled>Vérification du Quest.</button><button data-recenter hidden>Ramener la table</button><button data-leave hidden>Quitter le rôle</button></div><small data-vr-help></small></div>
  <aside class="giant-desktop" data-controls hidden><h2>À toi les ballons !</h2><div class="giant-modes"><button data-mode="balloon" aria-pressed="true">Ballons slime</button><button data-mode="shovel" aria-pressed="false">Pelle</button></div><p data-task role="status"></p><small data-gesture-help></small></aside></section>`;
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
const xrCamera = new PerspectiveCamera(65, 1, 0.02, 30);
const xrRig = new Group(); xrRig.name = "Ballsy XR origin"; xrRig.add(xrCamera); scene.add(xrRig);
function frameDesktop(): void {
  if (renderer.xr.isPresenting) return;
  const target = new Vector3(0.15, 0.9, -1.05);
  const fit = Math.max(1, (16 / 9) / camera.aspect);
  camera.position.copy(target).add(new Vector3(0, 1.25, 2).multiplyScalar(fit));
  camera.lookAt(target); camera.updateMatrixWorld(true);
}
frameDesktop();
const definition = composeBallsyCourse({ volcano: true });
definition.rules = undefined;
definition.entities.push(...ballsySlimeEntities());
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
for (let i = 0; i < 3; i++) {
  const button = new Mesh(new BoxGeometry(0.24, 0.10, 0.06), new MeshStandardMaterial({ color: "#d9ae70", roughness: 0.7 }));
  button.position.set(i === 0 ? 0.69 : i === 1 ? -0.69 : 0, i === 2 ? 1.29 : 1.48, -1.32);
  const text = label(0.23, 0.08);
  text.sprite.position.copy(button.position).add(new Vector3(0, 0.02, 0.04));
  text.draw(i === 0 ? "Sortir VR" : i === 1 ? "Ramener la table" : "Pelle / ballons");
  buttons.push(button); buttonLabels.push(text); tableRig.add(button, text.sprite);
}
let disposed = false, frameCount = 0, projectedKey = "", activeOwner: object | string | null = null;
let lastHold = 0, lastMessage = "";
let selectStarts = 0, selectEnds = 0;
let placementPending = false, placements = 0;
const headRotation = new Quaternion(), headForward = new Vector3();
const recenterHeld = new WeakMap<XRInputSource, boolean>();
const hoverTargets: (number | null)[] = [null, null];
const poses = [0, 1].map(() => ({ from: new Vector3(), to: new Vector3(), active: false }));
let poseStarted = 0, projectedRound = "";
let slimeProjectedTime = -1, slimeReceivedAt = 0;
const link = createBallsyGuestLink(() => paint());
const raycaster = new Raycaster(), rotation = new Matrix4(), point = new Vector3();
const xrInput = new VrInputRig(renderer, handleXrAction);
xrRig.add(xrInput.group);
const controllers = xrInput.slots.map((slot) => slot.ray);
const beams = xrInput.slots.map((slot) => slot.beam);
const cursors: Mesh[] = [];

const grips = xrInput.slots.map((slot) => slot.grip), shovels: Group[] = [];
const triggerHeld = [false, false];
const bladeTip = new Vector3(0, -0.055, -0.55);
const modelTip = new Vector3();
type GiantMode = "balloon" | "shovel";
let mode: GiantMode = "balloon";
const throwGesture = new BallsyThrowGesture();
const heldBalloons: Group[] = [];
const stock = [-0.26, 0.26].map((x) => {
  const balloon = makeGiantBalloon(); balloon.position.set(x, 1.08, -0.48); tableRig.add(balloon); return balloon;
});
const desktopBalloon = makeGiantBalloon(); desktopBalloon.visible = false; scene.add(desktopBalloon);
// Only the immediate departure is drawn locally, until the same ID reaches a host snapshot.
// This visual has no collision, splat, slowdown, or second copy of the game state.
const departureBalloon = makeGiantBalloon(); departureBalloon.visible = false; scene.add(departureBalloon);
let departure: { id: string; at: number; thrown: BallsyThrow } | null = null, lastHandoffMs: number | null = null;
const desktopPlane = new Plane(new Vector3(0, 1, 0), -1.08);
const desktopGrabOffset = new Vector3();
const handPoints: (Vector3 | null)[] = [null, null];
const handPoseAt = [0, 0];
const handSources: (XRInputSource | null)[] = [null, null];
const rayTracked = [false, false];
const inputHeld = [{ select: false, grab: false }, { select: false, grab: false }];
let pendingRelease: GiantXrRelease | null = null, desktopPointer: number | null = null;
let referenceSpaceType: "local-floor" | "local" = "local-floor";
let detachXrSession: (() => void) | null = null;
const xrSession = new VrSessionController({
  xr: navigator.xr, secureContext: window.isSecureContext,
  bindSession: async (session) => {
    try { await session.requestReferenceSpace("local-floor"); referenceSpaceType = "local-floor"; }
    catch { referenceSpaceType = "local"; }
    if (xrSession.session !== session) return;
    xrRig.position.set(0, referenceSpaceType === "local" ? 1.6 : 0, 0); xrRig.updateMatrixWorld(true);
    renderer.xr.setReferenceSpaceType(referenceSpaceType);
    await renderer.xr.setSession(session);
    if (xrSession.session !== session) return;
    const space = renderer.xr.getReferenceSpace();
    const changed = () => cancelXr("source-change");
    const reset = () => { cancelXr("reference-reset"); placementPending = true; };
    session.addEventListener("inputsourceschange", changed);
    space?.addEventListener("reset", reset);
    detachXrSession = () => { session.removeEventListener("inputsourceschange", changed); space?.removeEventListener("reset", reset); };
  },
  onStarted: (session) => { placementPending = true; xrInput.setActive(session.visibilityState === "visible"); },
  onInterrupted: () => { cancelXr("session-interrupted"); xrInput.setActive(false); },
  onEnded: () => {
    detachXrSession?.(); detachXrSession = null;
    cancelXr("session-end"); xrInput.setActive(false); placementPending = false;
    link.leave(); resetScreenView();
  },
});
const inVR = (): boolean => !!xrSession.session && ["active", "stopping", "error"].includes(xrSession.snapshot.phase);
let launches = 0, localCooldownUntil = 0, lastLaunch: { origin: ThrowPoint; velocity: ThrowPoint; source: string } | null = null;
let balloonMessage = "", balloonMessageUntil = 0, observedHits = 0;
let shovelSamples = 0, lastTip: number[] | null = null, desktopDown = false;
function release(owner?: object | string, reason = "cancelled"): void {
  if (owner !== undefined && activeOwner !== owner && !throwGesture.isHeldBy(owner) && throwGesture.state().held) return;
  if (throwGesture.state().held) throwGesture.cancel(reason);
  if (owner === undefined) { departure = null; departureBalloon.visible = false; }
  pendingRelease = null; desktopPointer = null;
  desktopBalloon.visible = false; heldBalloons.forEach((balloon) => { balloon.visible = false; });
  inputHeld.forEach((input) => { input.select = false; input.grab = false; });
  if (activeOwner !== null) link.send({ type: "release" });
  activeOwner = null; desktopDown = false;
  triggerHeld.fill(false);
}
function cancelXr(reason: string): void {
  release(undefined, reason);
  handPoints.fill(null); handPoseAt.fill(0); handSources.fill(null); rayTracked.fill(false);
  xrInput.cancel();
}
function resetScreenView(): void {
  xrRig.position.set(0, 0, 0);
  tableRig.position.set(0, 0, 0); tableRig.rotation.set(0, 0, 0);
  frameDesktop(); paint();
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
  cancelXr("table-action");
  if (index === 0) void endVR();
  else if (index === 1) placementPending = true;
  else setMode(mode === "balloon" ? "shovel" : "balloon");
}
function dominantIndex(): number {
  const right = xrInput.slots.findIndex((slot) => slot.source?.handedness === "right");
  return right >= 0 ? right : xrInput.slots.findIndex((slot) => !!slot.source);
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
function target(controller: typeof controllers[number]): number | null {
  controller.updateWorldMatrix(true, false);
  rotation.extractRotation(controller.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).transformDirection(rotation);
  const hit = raycaster.intersectObjects(buttons, false)[0];
  const index = controllers.indexOf(controller);
  beams[index].visible = !!hit;
  beams[index].scale.z = hit ? hit.distance : 1;
  cursors[index].visible = !!hit && inVR();
  if (hit) cursors[index].position.copy(hit.point);
  return hit ? buttons.indexOf(hit.object as typeof buttons[number]) : null;
}
function cooldownSeconds(): number {
  const slime = link.state().snapshot?.slime;
  return Math.max(0, (localCooldownUntil - performance.now()) / 1000, slime ? slime.cooldownUntil - slime.time : 0);
}
function canGrab(): boolean { return mode === "balloon" && canDig() && cooldownSeconds() <= 0 && !throwGesture.state().held; }
function feedback(message: string, duration = 1300): void { balloonMessage = message; balloonMessageUntil = performance.now() + duration; paint(); }
function setMode(next: GiantMode): void {
  cancelXr("tool-change"); mode = next; balloonMessage = "";
  for (const button of root.querySelectorAll<HTMLButtonElement>("[data-mode]")) button.setAttribute("aria-pressed", String(button.dataset.mode === next));
  paint();
}
for (const button of root.querySelectorAll<HTMLButtonElement>("[data-mode]")) button.addEventListener("click", () => setMode(button.dataset.mode as GiantMode));
function launch(thrown: BallsyThrow | null, source: string): void {
  pendingRelease = null; desktopPointer = null; desktopBalloon.visible = false;
  heldBalloons.forEach((balloon) => { balloon.visible = false; });
  if (!thrown || !canDig() || mode !== "balloon") return;
  scene.updateMatrixWorld(true);
  // Transform two physical points: inverse tabletop rotation AND its 0.045 scale.
  // transformDirection would normalize and silently lose the speed / scale.
  const transformed = ballsyThrowInSpace(thrown, (point) => world.group.worldToLocal(new Vector3(...point)).toArray() as ThrowPoint);
  const velocity = new Vector3(...transformed.velocity);
  // Stay inside the wire limit even after floating-point rotation and inverse scaling.
  if (velocity.length() >= BALLSY_SLIME_LIMITS.maximumSpeed) velocity.setLength(BALLSY_SLIME_LIMITS.maximumSpeed - 1e-8);
  const command = { type: "slime" as const, throwId: crypto.randomUUID(), origin: transformed.position, velocity: velocity.toArray() as ThrowPoint };
  if (!parseGiantCommand(command)) { feedback("Rapproche-toi de la table pour lancer."); return; }
  link.send(command); launches++; lastLaunch = { origin: command.origin, velocity: command.velocity, source };
  departure = { id: command.throwId, at: performance.now(), thrown }; lastHandoffMs = null;
  departureBalloon.position.set(...thrown.position); departureBalloon.visible = true;
  departureBalloon.scale.setScalar(inVR() ? 1 : 1.4);
  localCooldownUntil = performance.now() + 1000;
  feedback("Lancé !", 350);
}
function handleXrAction(event: VrInputAction): void {
  const index = xrInput.slots.findIndex((slot) => slot.source === event.source && slot.ray === event.ray);
  if (index < 0) return;
  if (event.cancelled) { release(controllers[index], "input-cancelled"); return; }
  if (event.phase === "start") beginHand(index, event);
  else endHand(index, event);
}
function beginHand(index: number, event: VrInputAction): void {
  const controller = controllers[index], now = performance.now(), input = event.action;
  const hand = handPoints[index];
  if (!inVR() || placementPending || !hand || handSources[index] !== event.source
    || now < handPoseAt[index] || now - handPoseAt[index] > GIANT_XR_FRESH_MS || inputHeld[index][input]) return;
  inputHeld[index][input] = true;
  if (input === "select" || event.source.hand) {
    selectStarts++;
    const hit = rayTracked[index] ? target(controller) : null;
    if (hit !== null) { activate(hit); return; }
  }
  if (mode === "shovel") {
    if (index === dominantIndex() && canDig()) { triggerHeld[index] = true; activeOwner = controller; }
    return;
  }
  if (!canGrab()) return;
  const nearby = stock.some((balloon) => balloon.visible && canGrabBallsyBalloon(hand.toArray() as ThrowPoint, balloon.getWorldPosition(new Vector3()).toArray() as ThrowPoint));
  if (nearby && throwGesture.start(controller, hand.toArray() as ThrowPoint, now)) {
    heldBalloons[index].visible = true; feedback("Bouge le bras, puis relâche.");
  }
}
function endHand(index: number, event: VrInputAction): void {
  if (event.action === "select" || event.source.hand) selectEnds++;
  inputHeld[index][event.action] = false;
  if (inputHeld[index].select || inputHeld[index].grab) return;
  if (mode === "shovel") release(controllers[index]);
  // Even a non-cancelled native event still needs a fresh, non-emulated next frame.
  else if (throwGesture.isHeldBy(controllers[index])) pendingRelease = { index, source: event.source, at: performance.now(), frame: frameCount };
}
for (const slot of xrInput.slots) {
  const cursor = new Mesh(new SphereGeometry(0.008, 8, 6), new MeshStandardMaterial({ color: "#f5c26b", emissive: "#805a25", emissiveIntensity: 0.5 }));
  cursor.visible = false; scene.add(cursor); cursors.push(cursor);
  const shovel = makeShovel(), balloon = makeGiantBalloon();
  balloon.position.set(...BALLOON_GRIP_OFFSET); balloon.visible = false;
  slot.anchor.add(shovel, balloon); shovels.push(shovel); heldBalloons.push(balloon);
}
function task(): string {
  const s = link.state(), v = s.snapshot?.volcano;
  if (!s.live || !v) return s.message;
  if (s.snapshot?.phase !== "racing") return s.snapshot?.phase === "paused" ? "La course est en pause." : "Attends le départ sur la télé.";
  if (mode === "shovel") return "Maintiens la gâchette, le grip ou la pince : enfonce, tire et soulève la pelle.";
  if (balloonMessage && performance.now() < balloonMessageUntil) return balloonMessage;
  if (throwGesture.state().held) return "Bouge le bras, puis relâche.";
  const cooldown = cooldownSeconds();
  if (cooldown > 0) return `Nouveau ballon dans ${cooldown.toFixed(1)} s`;
  return inVR() ? "Prends un ballon devant toi, lance-le et relâche." : "Saisis un ballon, glisse vers la piste, puis relâche.";
}
function paint(): void {
  if (disposed) return;
  const s = link.state(), v = s.snapshot?.volcano;
  root.classList.toggle("is-joined", s.joined);
  element("form").hidden = s.joined;
  element("[data-status]").textContent = lastMessage || s.message;
  element("[data-controls]").hidden = !s.joined;
  element("[data-task]").textContent = task();
  element(".giant-desktop h2").textContent = mode === "balloon" ? "À toi les ballons !" : "La pelle";
  element("[data-gesture-help]").textContent = mode === "balloon"
    ? inVR() ? "Approche la main d'un ballon. Serre le grip ou la gâchette, ou pince pouce et index. Lance puis relâche."
      : "Le slime ralentit un peu les billes. En VR : grip, gâchette ou pince pouce-index pour saisir."
    : "VR : la pelle suit ta main droite. Maintiens le grip, la gâchette ou la pince pouce-index, enfonce puis tire. Écran : clique et glisse sur la terre.";
  element("[data-leave]").hidden = !s.joined;
  element("[data-recenter]").hidden = !inVR();
  const phase = xrSession.snapshot.phase;
  vrButton.disabled = ["checking", "unsupported", "starting", "stopping", "disposed"].includes(phase)
    || (!xrSession.session && (!s.joined || !s.live));
  vrButton.textContent = xrSession.session ? "Sortir de VR" : phase === "unsupported" ? "VR indisponible ici"
    : phase === "starting" ? "Entrée VR…" : "Devenir le géant en VR";
  const wave = v ? volcanoWave(v) : null;
  const title = mode === "balloon" ? "Ballons de slime" : v ? `${v.mode === "help" ? `Aide ${s.snapshot?.ally === 1 ? "Corail" : "Lagon"}` : "La pelle"} · ${v.earth.excavated.toFixed(1)} m³ creusés${v.mode === "help" ? wave?.active ? " · CRUE !" : ` · crue ${Math.ceil(wave?.inSeconds ?? 0)} s` : ""}` : "Ballsy · Le géant";
  statusLabel.draw(title, task());
  statusLabel.sprite.visible = inVR();
  for (let i = 0; i < buttons.length; i++) {
    buttons[i].visible = buttonLabels[i].sprite.visible = inVR();
  }
}
async function endVR(): Promise<void> { cancelXr("session-end"); await xrSession.exit(); }
async function enterVR(): Promise<void> {
  if (xrSession.session || xrSession.snapshot.phase === "starting") { await endVR(); return; }
  if (!link.state().joined || !link.state().live) return;
  lastMessage = "";
  await xrSession.enter();
}
vrButton.addEventListener("click", () => { void enterVR(); });
renderer.xr.addEventListener("sessionend", resetScreenView);
element("[data-recenter]").addEventListener("click", () => { cancelXr("recenter"); placementPending = true; });
element("form").addEventListener("submit", (event) => {
  event.preventDefault(); lastMessage = "";
  void link.join(roomInput.value).catch((error: unknown) => { lastMessage = error instanceof Error ? error.message : "Connexion refusée."; paint(); });
});
element("[data-leave]").addEventListener("click", () => { cancelXr("leave-role"); link.leave(); if (xrSession.session) void xrSession.exit(); });
const pointer = new Vector2();
const desktopCursor = new Mesh(new SphereGeometry(0.012, 12, 8), new MeshStandardMaterial({ color: "#f5c26b", emissive: "#6a4110" }));
desktopCursor.visible = false; scene.add(desktopCursor);
function desktopTip(event: PointerEvent): Vector3 | null {
  const earth = link.state().snapshot?.volcano.earth;
  if (!earth || inVR()) return null;
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
function pointerRay(event: PointerEvent): void {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
  scene.updateMatrixWorld(true); raycaster.setFromCamera(pointer, camera);
}
function desktopHand(event: PointerEvent): Vector3 | null {
  pointerRay(event);
  return raycaster.ray.intersectPlane(desktopPlane, new Vector3())?.add(desktopGrabOffset) ?? null;
}
function movePointer(event: PointerEvent): void {
  if (mode === "balloon") {
    desktopCursor.visible = false;
    if (event.pointerId !== desktopPointer || !throwGesture.isHeldBy("mouse")) return;
    const hand = desktopHand(event);
    if (!hand || !throwGesture.sample("mouse", hand.toArray() as ThrowPoint, performance.now())) { release(); return; }
    desktopBalloon.position.copy(hand); return;
  }
  const tip = desktopTip(event);
  desktopCursor.visible = !!tip;
  if (tip) {
    desktopCursor.position.copy(world.group.localToWorld(tip.clone().add(new Vector3(0, 0.25, 0))));
    if (desktopDown && performance.now() - lastHold >= 50) sampleTip(tip, "mouse");
  } else if (desktopDown) release("mouse");
}
renderer.domElement.style.touchAction = "none";
renderer.domElement.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || !canDig() || inVR()) return;
  if (mode === "balloon") {
    if (!canGrab()) return;
    pointerRay(event);
    const hit = raycaster.intersectObjects(stock.filter((balloon) => balloon.visible), true)[0];
    const rect = renderer.domElement.getBoundingClientRect();
    // A 44 px pickup target around an existing visible stock, never around the road or a racer.
    const nearest = stock.filter((balloon) => balloon.visible).map((balloon) => {
      const screen = balloon.getWorldPosition(new Vector3()).project(camera);
      return { balloon, distance: Math.hypot((screen.x + 1) * rect.width / 2 - (event.clientX - rect.left), (1 - screen.y) * rect.height / 2 - (event.clientY - rect.top)) };
    }).sort((a, b) => a.distance - b.distance)[0];
    const supply = stock.find((balloon) => balloon === hit?.object.parent) ?? (nearest?.distance <= 22 ? nearest.balloon : null);
    if (!supply) return;
    const position = supply.getWorldPosition(new Vector3());
    desktopPlane.constant = -position.y;
    desktopGrabOffset.set(0, 0, 0);
    const hand = desktopHand(event); if (!hand) return;
    // Keep the balloon at its centre even when the pointer uses the larger pickup target.
    desktopGrabOffset.copy(position).sub(hand);
    if (!throwGesture.start("mouse", position.toArray() as ThrowPoint, performance.now())) return;
    desktopPointer = event.pointerId; desktopBalloon.position.copy(position); desktopBalloon.visible = true; desktopBalloon.scale.setScalar(1.4);
    renderer.domElement.setPointerCapture(event.pointerId); feedback("Glisse, puis relâche."); return;
  }
  const tip = desktopTip(event); if (!tip) return;
  renderer.domElement.setPointerCapture(event.pointerId); desktopDown = true; sampleTip(tip, "mouse");
});
renderer.domElement.addEventListener("pointermove", movePointer);
renderer.domElement.addEventListener("pointerup", (event) => {
  if (mode === "balloon" && event.pointerId === desktopPointer) {
    const hand = desktopHand(event);
    launch(hand && canDig() ? throwGesture.release("mouse", hand.toArray() as ThrowPoint, performance.now()) : null, "desktop-drag");
    if (throwGesture.state().held) release("mouse", "release-without-pose");
  } else release("mouse");
});
for (const name of ["pointercancel", "lostpointercapture"] as const) renderer.domElement.addEventListener(name, () => release("mouse", name));
renderer.domElement.addEventListener("pointerleave", () => { desktopCursor.visible = false; });
const visibility = (): void => { if (document.hidden) { cancelXr("hidden"); xrInput.setActive(false); } };
document.addEventListener("visibilitychange", visibility);
const resize = (): void => { renderer.setSize(root.clientWidth, root.clientHeight); camera.aspect = root.clientWidth / root.clientHeight; camera.updateProjectionMatrix(); frameDesktop(); };
const blur = (): void => { cancelXr("blur"); xrInput.setActive(false); };
window.addEventListener("resize", resize); window.addEventListener("blur", blur);
resize();
void ballsyRelayAvailable().then((available) => { if (!available) { lastMessage = "Le relais du géant n'est pas lancé pour cette prévisualisation."; paint(); } });
const unsubscribeXr = xrSession.subscribe((state) => {
  element("[data-vr-help]").textContent = state.phase === "unsupported"
    ? "Ce navigateur n'annonce pas de casque VR disponible. HTTPS reconnu ou localhost est nécessaire. La souris reste disponible."
    : referenceSpaceType === "local" && inVR() ? "Origine locale sans sol : hauteur de confort de 1,6 m. Ramène la table si nécessaire."
      : "Manettes ou pince pouce-index : prends un ballon puis relâche. Bouton A/X : ramener la table.";
  if (state.phase === "error") lastMessage = xrSession.session
    ? "Sortie VR interrompue. Réessaie de sortir."
    : "Entrée VR indisponible. Tu peux réessayer ou continuer à la souris.";
  paint();
});
void xrSession.checkSupport();
renderer.setAnimationLoop((_time, frame) => {
  if (disposed) return;
  frameCount++;
  const now = performance.now(), session = xrSession.session;
  const reference = renderer.xr.getReferenceSpace();
  const suppliedFrame = frame ?? renderer.xr.getFrame();
  const xrFrame = xrSession.snapshot.phase === "active" && session?.visibilityState === "visible"
    && !document.hidden && suppliedFrame?.session === session ? suppliedFrame : null;
  xrInput.setActive(!!xrFrame); xrInput.update();
  for (const source of session?.inputSources ?? []) {
    const pad = source.gamepad;
    const quest = source.profiles.some((profile) => /^(?:oculus-touch|meta-quest-touch)/.test(profile));
    const down = !!xrFrame && quest && pad?.mapping === "xr-standard" && !!(pad.buttons[4]?.pressed || (pad.buttons[4]?.value ?? 0) > 0.5);
    if (down && !recenterHeld.get(source)) { cancelXr("recenter"); placementPending = true; }
    recenterHeld.set(source, down);
  }
  if (placementPending && xrFrame && reference) {
    let pose: XRViewerPose | null = null;
    try { pose = xrFrame.getViewerPose(reference) ?? null; } catch { /* Wait for an active native frame. */ }
    if (pose && !pose.emulatedPosition) {
      const { position, orientation } = pose.transform;
      if ([position.x, position.y, position.z, orientation.x, orientation.y, orientation.z, orientation.w].every(Number.isFinite)) {
        cancelXr("table-placement");
        const head = xrRig.localToWorld(new Vector3(position.x, position.y, position.z));
        headRotation.set(orientation.x, orientation.y, orientation.z, orientation.w).premultiply(xrRig.getWorldQuaternion(new Quaternion()));
        headForward.set(0, 0, -1).applyQuaternion(headRotation); headForward.y = 0;
        const yaw = headForward.lengthSq() > 0.01 ? Math.atan2(-headForward.x, -headForward.z) : tableRig.rotation.y;
        // Move only the tabletop. local-only reference spaces use the rig's 1.6 m offset.
        tableRig.position.set(head.x, head.y - 1.6, head.z); tableRig.rotation.set(0, yaw, 0);
        placementPending = false; placements++;
      }
    }
  }
  link.maintain();
  const s = link.state(), snapshot = s.snapshot;
  if (snapshot) {
    if (projectedRound && projectedRound !== snapshot.roundId) { cancelXr("round-change"); localCooldownUntil = 0; observedHits = 0; }
    if (snapshot.slime) {
      if (slimeProjectedTime !== snapshot.slime.time || projectedRound !== snapshot.roundId) {
        slimeProjectedTime = snapshot.slime.time; slimeReceivedAt = performance.now();
      }
      // Bounded presentation between the PC's ~10 Hz snapshots. The host alone supplies hits.
      const visualSeconds = s.live && snapshot.phase === "racing" ? Math.min(0.12, (performance.now() - slimeReceivedAt) / 1000) : 0;
      projectBallsySlime(snapshot.slime, (id) => world.getEntityObject(id), visualSeconds);
      if (projectedRound === snapshot.roundId && snapshot.slime.hits > observedHits) feedback("Splash ! Une bille ralentit un peu.");
      observedHits = snapshot.slime.hits;
    }
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
  if (!canDig()) cancelXr(snapshot?.phase === "paused" ? "paused" : "not-live");
  scene.updateMatrixWorld(true);
  const dominant = dominantIndex();
  if (departure) {
    const age = (now - departure.at) / 1000;
    const acknowledged = snapshot?.slime?.projectiles.some((p) => p.id === departure?.id)
      || snapshot?.slime?.splats.some((p) => p.id === departure?.id);
    if (acknowledged || age > 0.3) {
      if (acknowledged) lastHandoffMs = now - departure.at;
      departure = null; departureBalloon.visible = false;
    } else {
      departureBalloon.position.set(...departure.thrown.position).addScaledVector(new Vector3(...departure.thrown.velocity), age);
      departureBalloon.position.y -= BALLSY_SLIME_LIMITS.gravity * 0.045 * age * age / 2;
      departureBalloon.scale.setScalar(inVR() ? 1 : 1 + 0.4 * Math.max(0, 1 - age / 0.1));
    }
  }
  for (const [index, controller] of controllers.entries()) {
    const slot = xrInput.slots[index], source = slot.source;
    const pose = xrFrame && reference && source ? readGiantXrPose(xrFrame, reference, source) : null;
    shovels[index].visible = mode === "shovel" && inVR() && index === dominant && !!pose;
    if (!pose || !source || placementPending) {
      handPoints[index] = null; handSources[index] = null; rayTracked[index] = false;
      hoverTargets[index] = null; beams[index].visible = false; cursors[index].visible = false;
      if (activeOwner === controller || throwGesture.isHeldBy(controller)) { release(controller, "tracking-lost"); feedback("Main perdue : reprends un ballon."); }
      continue;
    }
    const hand = giantXrWorldPoint(pose, xrRig, BALLOON_GRIP_OFFSET);
    handPoints[index] = hand; handPoseAt[index] = now; handSources[index] = source; rayTracked[index] = pose.rayTracked;
    heldBalloons[index].position.fromArray(pose.kind === "hand" ? [0, 0, 0] : BALLOON_GRIP_OFFSET);
    hoverTargets[index] = !throwGesture.state().held && pose.rayTracked ? target(controller) : null;
    if (throwGesture.state().held || !pose.rayTracked) { beams[index].visible = false; cursors[index].visible = false; }
    if (throwGesture.isHeldBy(controller)) {
      if (pendingRelease?.index === index) {
        if (freshGiantXrRelease(pendingRelease, source, now, frameCount)) launch(throwGesture.release(controller, hand.toArray() as ThrowPoint, now), source.handedness);
        else release(controller, "stale-release");
      } else if (!throwGesture.sample(controller, hand.toArray() as ThrowPoint, now)) {
        release(controller); feedback("Geste interrompu : reprends un ballon.");
      }
    }
    if (mode === "shovel" && triggerHeld[index] && index === dominant && now - lastHold >= 50) {
      modelTip.copy(bladeTip); slot.anchor.localToWorld(modelTip); world.group.worldToLocal(modelTip);
      sampleTip(modelTip, controller);
    }
  }
  // A stationary desktop hand is sampled as stationary. Pointer event frequency is not tracking loss.
  if (throwGesture.isHeldBy("mouse") && desktopBalloon.visible) {
    if (!throwGesture.sample("mouse", desktopBalloon.position.toArray() as ThrowPoint, now)) release("mouse");
  }
  const available = canGrab();
  stock.forEach((balloon) => { balloon.visible = available; balloon.scale.setScalar(inVR() ? 1 : 1.4); });
  if (inVR()) desktopCursor.visible = false;
  renderer.render(scene, renderer.xr.isPresenting || inVR() ? xrCamera : camera);
});
async function dispose(): Promise<void> {
  if (disposed) return;
  cancelXr("dispose"); link.leave();
  await xrSession.dispose();
  // A failed native end remains owned and retryable. Do not destroy its renderer.
  if (xrSession.session || disposed) return;
  disposed = true; renderer.setAnimationLoop(null); unsubscribeXr();
  window.removeEventListener("resize", resize); window.removeEventListener("blur", blur);
  renderer.xr.removeEventListener("sessionend", resetScreenView);
  document.removeEventListener("visibilitychange", visibility);
  xrInput.dispose();
  world.dispose();
  for (const shovel of shovels) shovel.traverse((object) => { if (object instanceof Mesh) { object.geometry.dispose(); (object.material as MeshStandardMaterial).dispose(); } });
  for (const prop of [...stock, ...heldBalloons, desktopBalloon, departureBalloon]) disposeGiantProp(prop);
  desktopCursor.geometry.dispose(); desktopCursor.material.dispose();
  for (const mesh of [...buttons, ...cursors]) { mesh.geometry.dispose(); (mesh.material as MeshStandardMaterial).dispose(); }
  for (const texture of ownedTextures) texture.dispose(); for (const material of ownedMaterials) material.dispose();
  renderer.dispose();
}
window.addEventListener("pagehide", () => { void dispose(); }, { once: true });
Object.assign(window, { __BALLSY_GIANT__: {
  endVR, dispose,
  xr: { session: xrSession, input: xrInput, renderer, camera: xrCamera, rig: xrRig,
    get referenceSpaceType() { return referenceSpaceType; } },
  modelPoint: (x: number, y: number, z: number) => {
    const model = new Vector3(x, y, z), physical = world.group.localToWorld(model.clone()), screen = physical.clone().project(camera);
    return { model: model.toArray(), world: physical.toArray(), screen: [(screen.x + 1) * root.clientWidth / 2, (1 - screen.y) * root.clientHeight / 2] };
  },
  terrainPoint: (x: number, z: number, penetration = 0) => {
    const earth = link.state().snapshot?.volcano.earth;
    if (!earth) return null;
    const model = new Vector3(x, surfaceHeightAt(earth, x, z) - penetration, z);
    const physical = world.group.localToWorld(model.clone()), screen = physical.clone().project(camera);
    return { model: model.toArray(), world: physical.toArray(), screen: [(screen.x + 1) * root.clientWidth / 2, (1 - screen.y) * root.clientHeight / 2] };
  },
  state: () => {
    const bounds = new Box3().setFromObject(world.group);
    return { ...link.state(), view: inVR() ? "vr" : "screen", frameCount,
      eyes: renderer.xr.isPresenting ? renderer.xr.getCamera().cameras.length : 1,
      xr: { phase: xrSession.snapshot.phase, referenceSpaceType, origin: xrRig.position.toArray(),
        slots: xrInput.slots.map((slot, index) => ({ hand: slot.source?.handedness ?? null,
          kind: slot.source ? slot.source.hand ? "hand" : "controller" : null, modelReady: slot.modelReady,
          tracked: !!handPoints[index], rayTracked: rayTracked[index], anchorWorld: slot.anchor.getWorldPosition(new Vector3()).toArray() })) },
      balloon: { ...throwGesture.state(), cancelReason: throwGesture.state().reason, launches, lastLaunch, mode, cooldownSeconds: cooldownSeconds(),
        departureVisible: departureBalloon.visible, lastHandoffMs,
        stock: stock.map((balloon) => { const position = balloon.getWorldPosition(new Vector3()), screen = position.clone().project(camera);
          return { world: position.toArray(), visible: balloon.visible, screen: [(screen.x + 1) * root.clientWidth / 2, (1 - screen.y) * root.clientHeight / 2] }; }),
        handWorld: handPoints.map((hand) => hand?.toArray() ?? null), heldVisible: heldBalloons.map((balloon) => balloon.visible), desktopVisible: desktopBalloon.visible },
      shovel: { samples: shovelSamples, lastTip, held: activeOwner !== null, dominant: dominantIndex(),
        tipOffset: bladeTip.toArray(), visible: shovels.map((tool) => tool.visible),
        gripWorld: grips.map((grip) => grip.getWorldPosition(new Vector3()).toArray()),
        tipWorld: xrInput.slots.map((slot) => slot.anchor.localToWorld(bladeTip.clone()).toArray()) },
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
      controllers: Array.from(xrSession.session?.inputSources ?? []).map((source) => ({ hand: source.handedness, profiles: source.profiles, mapping: source.gamepad?.mapping,
        primaryDown: !!(source.gamepad?.buttons[4]?.pressed || (source.gamepad?.buttons[4]?.value ?? 0) > 0.5) })),
      boardSize: bounds.getSize(new Vector3()).toArray(),
      targets: buttons.map((b) => b.getWorldPosition(new Vector3()).toArray()),
      renderedPlayers: ["ballsy-p1", "ballsy-p2"].map((id) => ({ id, local: world.getEntityObject(id)?.position.toArray(), world: world.getEntityObject(id)?.getWorldPosition(point).toArray() })) };
  },
} });
paint();
} catch (error) { showStartupError(root, error); }
