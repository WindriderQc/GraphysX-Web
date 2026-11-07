import { createBallsySlime, snapshotBallsySlime, launchBallsySlime, advanceBallsySlime, cancelBallsySlimeFlight, ballsySlimeSpeedFactor } from "./ballsy-slime";
import { ballsySlimeEntities, projectBallsySlime } from "./ballsy-slime-scene";
import { parseGiantCommand } from "../server/ballsy-protocol.mjs";
import { Raycaster, Vector2, Vector3 } from "three";
import { createBallsyBoost } from "./ballsy-boost";
import { createVolcanoRun, advanceVolcanoRun, volcanoStandings, VOLCANO_RACE_STEP, VOLCANO_RACE_GATES } from "./ballsy-race";
import { COURSE_MAIN, COURSE_SHORTCUT, COURSE_FORK, COURSE_LENGTH, COURSE_SECTIONS, coursePoint, courseEdge, nearestCourse } from "./ballsy-course";
import { frameBallsyCamera, ballsyCameraEnvelope, type BallsyCameraFrame, type BallsyCameraPoint } from "./ballsy-camera";
import { advanceBallsyFinishes, ballsyFinishPlace, ballsyFinishTime, BALLSY_SPARKLE_SECONDS, type BallsyFinish } from "./ballsy-finish";
import { ballsyVelocityBrake } from "./ballsy-brake";
import { layoutBallsyArrivalLabels, type BallsyLabelAnchor } from "./ballsy-label-layout";
import { ballsyFinishEntities, projectBallsyFinishes } from "./ballsy-finish-scene";
import { bridgeOcclusionDistance } from "./ballsy-picking";
import { EARTH_BOUNDS, surfaceHeightAt } from "./ballsy-earth";
import { PlatformHost } from "./platform-host";
import { showStartupError } from "./startup-error";
import { assignBallsyPads, ballsyButton, readBallsyDrive, type BallsyPad, type BallsySlots } from "./ballsy-input";
import { createBallsyPadCheck, updateBallsyPadCheck, ballsyPadReady, ballsyPadInstruction } from "./ballsy-pad-check";
import { BALLSY_PLAYERS, BALLSY_PRACTICE_PLAYERS, composeBallsyCourse } from "./ballsy-scene";
import { createVolcano, commandVolcano, advanceVolcano, volcanoSlowAt, volcanoWave, type VolcanoMode } from "./ballsy-volcano";
import { projectVolcano } from "./ballsy-volcano-scene";
import { createBallsyHostLink } from "./ballsy-link";
import type { BallsySnapshot } from "../server/ballsy-protocol.mjs";
import "./ballsy.css";

type Phase = "lobby" | "countdown" | "racing" | "paused" | "results";
const root = document.querySelector<HTMLDivElement>("#ballsy")!;
const params = new URLSearchParams(window.location.search);
const legacyShovel = params.get("tool") === "shovel";
const isVolcano = params.get("course") !== "practice";
const PLAYERS = isVolcano ? BALLSY_PLAYERS : BALLSY_PRACTICE_PLAYERS;
let volcanoMode: VolcanoMode = params.get("mode") === "help" ? "help" : "challenge";
let ally = params.get("ally") === "1" ? 1 : 0;

try {
  const host = new PlatformHost(root, { world: composeBallsyCourse({ volcano: isVolcano, greybox: params.get("greybox") === "1" }), autoOrbit: false, intro: false, editorVisible: false,
    framing: { position: isVolcano ? [0, 63, 47] : [0, 31, 24], target: [0, 0, -2] } });
  const api = host.api;
  if (isVolcano) for (const entity of ballsySlimeEntities()) api.spawn(entity);
  for (const entity of ballsyFinishEntities()) api.spawn(entity);
  api.pause(true);
  const surface = document.createElement("section");
  surface.className = "ballsy-ui";
  surface.setAttribute("aria-label", "Ballsy, course à deux");
  surface.innerHTML = `
    <header class="ballsy-header"><a href="./" aria-label="Retour à GraphysX">GraphysX <span>joue en famille</span></a><div class="ballsy-tools"><button data-action="invite" hidden>Inviter un géant</button><button data-action="pause" hidden>Pause</button><button data-action="fullscreen">Plein écran</button></div></header>
    <div class="ballsy-scores" aria-label="Progression des coureurs">
      <div class="ballsy-score" data-slot="0"><b><i>1</i> Lagon</b><span data-progress="0">Prêt à rouler</span><small data-speed="0"></small></div>
      <div class="ballsy-score" data-slot="1"><b><i>2</i> Corail</b><span data-progress="1">Prêt à rouler</span><small data-speed="1"></small></div>
    </div>
    <div class="ballsy-ball-label" data-label="0">1</div><div class="ballsy-ball-label" data-label="1">2</div>
    <div class="ballsy-label-leader" data-label-leader="0" hidden aria-hidden="true"></div><div class="ballsy-label-leader" data-label-leader="1" hidden aria-hidden="true"></div>
    ${[0, 1].map(i => `<div class="ballsy-finish-sparkle" data-finish-sparkle="${i}" hidden aria-hidden="true"><span class="ballsy-finish-ring"></span>${Array.from({ length: 8 }, (_, n) => `<i style="--spark-x:${Math.cos(n * Math.PI / 4)};--spark-y:${Math.sin(n * Math.PI / 4)}">✦</i>`).join("")}</div>`).join("")}
    <p class="ballsy-finish-announcement" data-finish-announcement role="status" aria-live="polite" aria-atomic="true" hidden></p>
    <div class="ballsy-card" data-card>
      <p class="ballsy-eyebrow">BALLSY · ${isVolcano ? "LA BOUCLE DU VOLCAN" : "PREMIÈRE PISTE"}</p><h1>On fait la course ?</h1>
      <p data-description>Deux balles, deux tours. Faites le tour de l'île dans le sens des flèches !</p>
      <div class="ballsy-settings" data-settings><label>Tableau <select data-course><option value="volcano">La Boucle du Volcan</option><option value="practice">Piste découverte</option></select></label>
      <label data-mode-label>Lave (pelle) <select data-mode><option value="challenge">Défie la course</option><option value="help-0">Aide Lagon</option><option value="help-1">Aide Corail</option></select></label></div>
      <div class="ballsy-controls" data-controls>
        <div><b><i>1</i> Lagon</b><p>Flèches pour rouler<br>Espace pour freiner</p><small data-pad="0">Clavier disponible</small></div>
        <div><b><i>2</i> Corail</b><p>WASD / ZQSD pour rouler<br>Majuscule pour freiner</p><small data-pad="1">Clavier disponible</small></div>
      </div>
      <p class="ballsy-pad-help" data-pad-help>Manettes : appuyez sur un bouton pour les détecter.<br>Stick gauche pour rouler · bouton du bas pour freiner.</p>
      <p class="ballsy-notice" data-notice role="status"></p>
      <ol class="ballsy-results" data-results hidden aria-label="Classement final"></ol>
      <button class="ballsy-primary" data-action="start">C'est parti ! <span>↗</span></button>
      <button class="ballsy-secondary" data-action="reassign">Réassocier les manettes</button>
      <button class="ballsy-secondary" data-action="pad-check">Tester les manettes</button>
      <button class="ballsy-secondary" data-action="restart" hidden>Recommencer la course</button>
      <p class="ballsy-footnote" data-footnote>Sans casque · manettes avec profil standard du navigateur<br>Xbox et Nintendo : compatibilité matérielle à vérifier</p>
    </div>
    <section class="ballsy-pad-test" data-pad-test hidden role="dialog" aria-modal="true" aria-labelledby="pad-test-title">
      <p class="ballsy-eyebrow">AVANT LE DÉPART</p><h2 id="pad-test-title">Chacun sa manette</h2>
      <p>Faites un tour avec le stick, relâchez-le, puis essayez le frein.</p>
      <div class="ballsy-pad-test-grid">${[0, 1].map((i) => `<article data-pad-test-slot="${i}"><b><i>${i + 1}</i> ${i === 0 ? "Lagon" : "Corail"}</b><small data-pad-model="${i}"></small><div class="ballsy-stick" aria-hidden="true"><span data-stick="${i}"></span></div><p data-pad-instruction="${i}" aria-live="polite"></p><span class="ballsy-brake" data-brake="${i}">Frein</span></article>`).join("")}</div>
      <p class="ballsy-pad-help" data-pad-check-notice>Le clavier reste disponible. Ce test ne lance pas la course.</p>
      <button class="ballsy-primary" data-action="close-pad-check">Revenir au jeu ↗</button>
      <button class="ballsy-secondary" data-action="reset-pad-check">Recommencer le test</button>
      <button class="ballsy-secondary" data-action="save-pad-check">Enregistrer le test</button>
    </section>
    <div class="ballsy-countdown" data-countdown aria-live="polite" hidden></div>
    <p class="ballsy-volcano-signal" data-volcano-signal hidden></p>
    <aside class="ballsy-giant" data-giant hidden aria-label="Le géant du volcan">
      <div class="ballsy-giant-title"><b>${legacyShovel ? "La pelle du géant" : "Les ballons du géant"}</b><span data-charges></span></div>
      <p data-giant-status></p>
      <p class="ballsy-shovel-help">${legacyShovel ? "Clique et glisse dans la terre ambrée pour creuser." : "Dans la vue du géant, prends un ballon, balance la main et relâche."}</p>
      <small data-giant-feedback>Les coureurs peuvent passer au sec à l'extérieur.</small>
    </aside>
    <aside class="ballsy-room" data-room hidden aria-label="Connexion du géant"><b data-room-code></b><p data-room-status></p><a href="./ballsy-giant.html" target="_blank" rel="noopener">Ouvrir la vue du géant ↗</a><small>Quest : ouvre cette vue sur le même site en HTTPS reconnu, puis saisis le code.</small></aside>
    <p class="ballsy-race-tip" data-race-tip hidden>2 tours · P pour mettre en pause · F pour le plein écran</p>`;
  root.append(surface);
  const element = <T extends HTMLElement>(selector: string): T => surface.querySelector<T>(selector)!;
  const button = (action: string): HTMLButtonElement => element(`[data-action="${action}"]`);
  const card = element("[data-card]");
  const heading = element("h1");
  const description = element("[data-description]");
  const notice = element("[data-notice]");
  const countdownLabel = element("[data-countdown]");
  const keys = new Set<string>();
  let phase: Phase = "lobby";
  let resumePhase: Phase = "racing";
  let countdown = 3;
  let slots: BallsySlots = [null, null];
  let connected = [false, false];
  let startHeld = false;
  let checkingPads = false;
  let padChecks = [createBallsyPadCheck(), createBallsyPadCheck()];
  let manual = false;
  let disposed = false;
  let volcano = createVolcano(volcanoMode);
  let slime = createBallsySlime();
  let visualTime = -1;
  let finishArchFaded = false;
  let finishes: BallsyFinish[] = [];
  let cameraFrame: BallsyCameraFrame | null = null;
  let giantFeedback = "";
  const speedCaps = [8, 8];
  let boosts = [createBallsyBoost(), createBallsyBoost()];
  let roundId = crypto.randomUUID();
  let room: ReturnType<typeof createBallsyHostLink> | null = null;
  const rescues = [0, 0];
  let runs = PLAYERS.map((player) => createVolcanoRun(player.spawn));
  const standingsNow = () => isVolcano ? volcanoStandings(PLAYERS, runs) : api.rules.standings() ?? [];
  let accumulatedSeconds = 0;
  let pads: readonly (BallsyPad | null)[] = [];
  const currentPad = (slot: number): BallsyPad | null => pads.find((pad) => pad?.index === slots[slot]) ?? null;
  const neutral = (): void => { for (const player of PLAYERS) api.steer(player.id, { thrust: 0, turn: 0 }); };
  const syncPause = (): void => { api.pause(isVolcano || manual || phase !== "racing"); };
  const overview: BallsyCameraPoint[] = isVolcano
    ? COURSE_MAIN.filter((_, i) => i % 8 === 0).flatMap(p => [courseEdge(p, -p.width / 2 - 1), courseEdge(p, p.width / 2 + 1)])
    : [[-18, 0, -14], [18, 0, -14], [-18, 0, 14], [18, 0, 14]];
  const updateCamera = (seconds = 0, reset = false): void => {
    const overviewMode = phase === "lobby" || legacyShovel;
    const poses = PLAYERS.map(player => api.query({ ids: [player.id] })[0]?.position ?? player.spawn);
    const safety = poses.flatMap(position => ballsyCameraEnvelope(position));
    const points = overviewMode ? overview : poses.flatMap((position, slot) => {
      const context = ballsyCameraEnvelope(position, 5.5);
      const nearest = isVolcano ? nearestCourse(position) : null;
      if (isVolcano && runs[slot].phase !== "complete") for (const offset of [-.012, .035]) {
        const p = coursePoint(nearest!.t + offset, nearest!.branch);
        context.push(courseEdge(p, -p.width / 2 - 1.2, .7), courseEdge(p, p.width / 2 + 1.2, .7));
      }
      return context;
    });
    const width = root.clientWidth, height = root.clientHeight;
    const top = Math.min(155, height * .24);
    const resultHeight = phase === "results" ? card.offsetHeight + 24 : 0;
    const giantHeight = element("[data-giant]").hidden ? 0 : element("[data-giant]").offsetHeight + 64;
    const roomHeight = element("[data-room]").hidden ? 0 : element("[data-room]").offsetHeight + 64;
    const inset = { top, right: 28, bottom: Math.max(76, resultHeight, giantHeight, roomHeight), left: 28 };
    cameraFrame = frameBallsyCamera(points, overviewMode ? overview : safety,
      { width, height, fov: host.camera.fov, inset }, reset ? null : cameraFrame, seconds);
    host.frameView(cameraFrame.position, cameraFrame.target, 0);
    host.camera.updateMatrixWorld();
  };
  const fit = (): void => { updateCamera(0, true); };
  fit();
  const courseSelect = element<HTMLSelectElement>("[data-course]");
  const modeSelect = element<HTMLSelectElement>("[data-mode]");
  courseSelect.value = isVolcano ? "volcano" : "practice";
  modeSelect.value = volcanoMode === "help" ? `help-${ally}` : "challenge";
  element("[data-mode-label]").hidden = !isVolcano || !legacyShovel;
  courseSelect.addEventListener("change", () => { const next = new URL(window.location.href); next.searchParams.set("course", courseSelect.value); window.location.assign(next.href); });
  modeSelect.addEventListener("change", () => {
    if (phase !== "lobby") return;
    volcanoMode = modeSelect.value.startsWith("help") ? "help" : "challenge";
    ally = modeSelect.value === "help-1" ? 1 : 0;
    volcano = createVolcano(volcanoMode);
    paint();
  });
  const commandGiant = (command: unknown, remote = false): { ok: boolean; reason?: string } => {
    if (!isVolcano || phase !== "racing") return { ok: false, reason: "Le géant attend le départ ou la reprise." };
    if (!remote && room?.state().connected) return { ok: false, reason: "Le géant joue depuis sa maquette." };
    const parsed = parseGiantCommand(command);
    const result = parsed?.type === "slime" ? launchBallsySlime(slime, parsed) : commandVolcano(volcano, command);
    giantFeedback = result.ok ? "" : result.reason ?? "";
    paint();
    return result;
  };
  function networkSnapshot(): BallsySnapshot {
    const standings = standingsNow();
    return { roundId, phase, volcano: structuredClone(volcano), slime: snapshotBallsySlime(slime), ally: volcanoMode === "help" ? ally : null,
      players: PLAYERS.map((player) => ({ id: player.id, position: [...(api.query({ ids: [player.id] })[0]?.position ?? player.spawn)] as [number, number, number],
        lap: standings.find((entry) => entry.subjectId === player.id)?.run.lap ?? 0, finished: standings.find((entry) => entry.subjectId === player.id)?.run.phase === "complete" })) };
  }
  // Always leave the invitation action reachable. A slow first probe must not permanently
  // remove the only retry control; discovery happens when the user chooses to invite.
  if (isVolcano) {
    room = createBallsyHostLink({ snapshot: networkSnapshot, command: (command) => { commandGiant(command, true); },
      presence: () => { commandVolcano(volcano, { type: "release" }); cancelBallsySlimeFlight(slime); roundId = crypto.randomUUID(); paint(); } });
    button("invite").hidden = false;
  }
  button("invite").addEventListener("click", () => {
    if (!room || disposed || button("invite").disabled) return;
    button("invite").disabled = true;
    // Invitation errors belong to the room panel, never to the race's pause notice.
    void room.open().catch(() => undefined)
      .finally(() => { button("invite").disabled = false; paint(); });
  });
  const pointerRay = new Raycaster(), pointer = new Vector2(), digPoint = new Vector3();
  let localDig = false, localTip: [number, number, number] | null = null;
  const cancelLocalDig = (): void => { if (localDig) commandVolcano(volcano, { type: "release" }); localDig = false; localTip = null; };
  const pickEarth = (event: PointerEvent): [number, number, number] | null => {
    const rect = host.renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX-rect.left)/rect.width*2-1, 1-(event.clientY-rect.top)/rect.height*2);
    pointerRay.setFromCamera(pointer, host.camera);
    // Visible terrain only: the bridge clips the ray before the heightfield beneath it.
    const maximumDistance = Math.min(host.camera.far, bridgeOcclusionDistance(pointerRay.ray));
    // Sample the authoritative surface, not a stale render mesh or a preselected route.
    for (let distance=0.1; distance<maximumDistance; distance+=0.08) {
      pointerRay.ray.at(distance,digPoint);
      if (digPoint.x<EARTH_BOUNDS.minX || digPoint.x>EARTH_BOUNDS.maxX || digPoint.z<EARTH_BOUNDS.minZ || digPoint.z>EARTH_BOUNDS.maxZ) continue;
      const height=surfaceHeightAt(volcano.earth,digPoint.x,digPoint.z);
      if (digPoint.y<=height) return [digPoint.x,height-0.14,digPoint.z];
    }
    return null;
  };
  host.renderer.domElement.addEventListener("pointerdown",(event)=>{
    event.stopImmediatePropagation();
    if (!isVolcano || !legacyShovel || phase!=="racing" || room?.state().connected || event.button!==0) return;
    localTip=pickEarth(event); if (!localTip) return;
    event.preventDefault(); localDig=true; host.renderer.domElement.setPointerCapture(event.pointerId);
    commandGiant({type:"shovel",tip:localTip,held:true});
  }, true);
  host.renderer.domElement.addEventListener("pointermove",(event)=>{event.stopImmediatePropagation(); if(localDig) { localTip=pickEarth(event); if(!localTip) cancelLocalDig(); }}, true);
  for(const name of ["pointerup","pointercancel","lostpointercapture"]) host.renderer.domElement.addEventListener(name,(event)=>{event.stopImmediatePropagation();cancelLocalDig();},true);
  host.renderer.domElement.addEventListener("wheel",(event)=>{event.preventDefault();event.stopImmediatePropagation();},{capture:true,passive:false});

  function pollPads(): void {
    try { pads = Array.from(navigator.getGamepads?.() ?? []); } catch { pads = []; }
    if (phase === "lobby" || phase === "results") slots = assignBallsyPads(slots, pads);
    for (let i = 0; i < 2; i++) {
      const pad = currentPad(i);
      const available = !!pad?.connected && pad.mapping === "standard";
      if (connected[i] && !available && (phase === "racing" || phase === "countdown")) pause(`Manette ${i + 1} déconnectée. Rebranchez-la ou continuez au clavier.`);
      connected[i] = available;
      padChecks[i] = updateBallsyPadCheck(padChecks[i], pad, checkingPads);
      const name = available ? `Manette ${i + 1} · profil standard` : slots[i] === null ? "Clavier disponible" : "Manette déconnectée · clavier disponible";
      element(`[data-pad="${i}"]`).textContent = name;
    }
    const unsupported = pads.some((pad) => pad?.connected && pad.mapping !== "standard");
    element("[data-pad-help]").textContent = unsupported
      ? "Une manette sans profil standard est détectée. Utilisez le clavier pour ce prototype."
      : "Manettes : stick gauche pour rouler · bouton du bas pour freiner. Appuyez sur un bouton pour les détecter.";
    const pressed = [0, 1].some((slot) => ballsyButton(currentPad(slot), 9));
    if (pressed && !startHeld && !checkingPads) {
      if (phase === "lobby" || phase === "results") start();
      else if (phase === "paused") resume();
      else pause();
    }
    startHeld = pressed;
  }

  function start(): void {
    if (phase !== "lobby" && phase !== "results") return;
    checkingPads = false;
    keys.clear();
    neutral();
    api.rules.reset();
    runs = PLAYERS.map((player) => createVolcanoRun(player.spawn));
    finishes = [];
    element("[data-finish-announcement]").textContent = "";
    for (const player of PLAYERS) {
      if (isVolcano) api.update(player.id, { transform: { position: [...player.spawn] }, physics: { mode: "dynamic", linearVelocity: [0, 0, 0], angularVelocity: [0, 0, 0] } });
      api.steer(player.id, { headingDegrees: isVolcano ? 270 : 90 });
      if (isVolcano) api.setSlowdownLive(player.id, 1);
    }
    countdown = 3;
    rescues.fill(0);
    volcano = createVolcano(volcanoMode);
    slime = createBallsySlime();
    projectBallsySlime(slime, (id) => host.world.getEntityObject(id));
    roundId = crypto.randomUUID();
    visualTime = -1;
    giantFeedback = "";
    boosts = [createBallsyBoost(), createBallsyBoost()];
    cancelLocalDig();
    speedCaps.fill(8);
    for (const player of PLAYERS) api.update(player.id, { steering: { speedCap: 8 } });
    if (isVolcano) projectVolcano(api, volcano, (id) => host.world.getEntityObject(id));
    notice.textContent = "";
    phase = "countdown";
    syncPause();
    paint();
  }
  function pause(reason = "La course vous attend."): void {
    if (phase !== "racing" && phase !== "countdown") return;
    resumePhase = phase;
    phase = "paused";
    // Invalidate commands queued before this interruption, even if resume is immediate.
    roundId = crypto.randomUUID();
    cancelBallsySlimeFlight(slime);
    projectBallsySlime(slime, (id) => host.world.getEntityObject(id));
    keys.clear();
    neutral();
    cancelLocalDig();
    commandVolcano(volcano, { type: "release" });
    notice.textContent = reason;
    syncPause();
    paint();
  }
  function resume(): void {
    if (phase !== "paused") return;
    keys.clear();
    phase = resumePhase;
    notice.textContent = "";
    syncPause();
    paint();
  }
  function togglePause(): void { if (phase === "paused") resume(); else pause(); }
  function tick(seconds: number, explicitStep = false): void {
    pollPads();
    const settlingResults = phase === "results";
    if (phase === "countdown") {
      countdown = Math.max(0, countdown - seconds);
      if (countdown === 0) { phase = "racing"; if (!isVolcano) api.rules.reset(); syncPause(); }
    }
    if (phase === "racing") {
      if (isVolcano) {
        advanceVolcano(volcano, seconds);
        if (localDig && localTip && !room?.state().connected) commandVolcano(volcano, { type: "shovel", tip: localTip, held: true });
        if (volcano.time - visualTime >= 0.1 || visualTime < 0) { projectVolcano(api, volcano, (id) => host.world.getEntityObject(id)); visualTime = volcano.time; }
      }
      const standings = standingsNow();
      const previousPositions = isVolcano ? PLAYERS.map(player => api.query({ ids: [player.id] })[0]?.position ?? player.spawn) : [];
      PLAYERS.forEach((player, slot) => {
        const run = standings.find((entry) => entry.subjectId === player.id)?.run;
        const entity = api.query({ ids: [player.id] })[0];
        const requestedDrive = readBallsyDrive(slot, keys, currentPad(slot));
        const drive = run?.phase === "complete" || requestedDrive.thrust < 0
          ? ballsyVelocityBrake(entity?.physics?.linearVelocity ?? [0, 0, 0], entity?.steering?.force ?? 0, entity?.physics?.mass ?? 0)
          : requestedDrive;
        api.steerLive(player.id, drive);
        const position = entity?.position;
        const slow = isVolcano && position ? volcanoSlowAt(volcano, position) : { intensity: 0, speedCap: 8 };
        const velocity = entity?.physics?.linearVelocity;
        // No invisible boost strips: speed comes from steering, gravity and surface contact.
        const slimeFactor = isVolcano ? ballsySlimeSpeedFactor(slime, slot) : 1;
        // Take the strongest cap, never multiply lava and slime into a stun.
        const cap = slow.intensity > 0 ? slow.speedCap : 8;
        if (isVolcano) api.setSlowdownLive(player.id, Math.min(1, 8 * slimeFactor / cap));
        const capChanged = Math.abs(cap - speedCaps[slot]) > 0.01;
        if (position && velocity && entity.physics) {
          const nextVelocity: [number, number, number] = [velocity[0], velocity[1], velocity[2]];
          let changedVelocity = false;
          const speed = Math.hypot(nextVelocity[0], nextVelocity[2]);
          if (slow.intensity > 0 && speed > cap) {
            const factor = Math.max(cap, speed * Math.exp(-3 * slow.intensity * seconds)) / speed;
            nextVelocity[0] *= factor; nextVelocity[2] *= factor; changedVelocity = true;
          }
          if (capChanged || changedVelocity) {
            // Authoring updates rebuild a body from its definition: preserve the LIVE pose
            // and spin, or changing a velocity would silently return it to the grid.
            api.update(player.id, { transform: { position: [...position], rotationDegrees: [...entity.rotationDegrees] },
              physics: { mode: "dynamic", linearVelocity: nextVelocity, angularVelocity: [...entity.physics.angularVelocity] },
              ...(capChanged ? { steering: { speedCap: cap } } : {}) });
            speedCaps[slot] = cap;
          }
        }
        if (!isVolcano && position && (position[1] < -3 || Math.abs(position[0]) > 20 || Math.abs(position[2]) > 16)) {
          const safe: [number, number, number][] = [[...player.spawn], [14, 0.7, -2], [-2, 0.7, -9], [-14, 0.7, 2]];
          api.update(player.id, { transform: { position: safe[Math.min(3, run?.checkpointIndex ?? 0)] },
            physics: { mode: "dynamic", linearVelocity: [0, 0, 0], angularVelocity: [0, 0, 0] } });
          rescues[slot]++;
        }
      });
      if (explicitStep && seconds > 0) api.step(seconds);
      if (isVolcano) {
        advanceBallsySlime(slime, seconds, PLAYERS.map((player, slot) => ({ position: api.query({ ids: [player.id] })[0]?.position ?? player.spawn, previous: previousPositions[slot], finished: runs[slot].phase === "complete" })));
        projectBallsySlime(slime, (id) => host.world.getEntityObject(id));
        PLAYERS.forEach((player, slot) => {
          const position = api.query({ ids: [player.id] })[0]?.position;
          if (!position) return;
          const recovery = advanceVolcanoRun(runs[slot], position, seconds, { tryingToMove: readBallsyDrive(slot, keys, currentPad(slot)).thrust > 0.5 });
          if (recovery) {
            api.update(player.id, { transform: { position: recovery.position }, physics: { mode: "dynamic", linearVelocity: [0, 0, 0], angularVelocity: [0, 0, 0] } });
            api.steer(player.id, { headingDegrees: recovery.headingDegrees, thrust: 0, turn: 0 });
          }
          rescues[slot] = runs[slot].rescues;
        });
      }
      if (standingsNow().length === PLAYERS.length && standingsNow().every((entry) => entry.run.phase === "complete")) {
        phase = "results";
        cancelBallsySlimeFlight(slime);
        projectBallsySlime(slime, (id) => host.world.getEntityObject(id));
        neutral();
        syncPause();
      }
    }
    // Finish clocks are already final. Let the same paused native world consume the
    // last braking inputs before resting instead of freezing a moving ball at the line.
    // This is inside the existing tick, never a parallel physics or animation loop.
    if (settlingResults && phase === "results" && seconds > 0) {
      let coasting = false;
      for (const player of PLAYERS) {
        const entity = api.query({ ids: [player.id] })[0];
        const velocity = entity?.physics?.linearVelocity ?? [0, 0, 0];
        if (Math.hypot(velocity[0], velocity[2]) > .04 || Math.abs(velocity[1]) > .08) coasting = true;
        api.steerLive(player.id, ballsyVelocityBrake(velocity, entity?.steering?.force ?? 0, entity?.physics?.mass ?? 0));
      }
      if (coasting) api.step(seconds);
      else for (const player of PLAYERS) api.steerLive(player.id, { thrust: 0, turn: 0 });
    }
    const previousFinishes = finishes;
    finishes = advanceBallsyFinishes(finishes, standingsNow(), seconds, phase === "paused");
    const newlyFinished = finishes.filter(finish => !previousFinishes.some(previous => previous.subjectId === finish.subjectId));
    if (newlyFinished.length) {
      const name = (id: string): string => id === PLAYERS[0].id ? "Lagon" : "Corail";
      element("[data-finish-announcement]").textContent = finishes.length === PLAYERS.length
        ? "Course terminée · Les 2 billes sont arrivées !"
        : `${name(newlyFinished[0].subjectId)} a terminé ses 2 tours ! ${name(PLAYERS.find(player => player.id !== newlyFinished[0].subjectId)!.id)} continue sa course.`;
    }
    paint();
    if (phase !== "paused") updateCamera(seconds);
    paintRacerOverlays();
    if (newlyFinished.length && phase === "results") button("start").focus({ preventScroll: true });
  }
  const scratch = new Vector3();
  function paintRacerOverlays(): void {
    const visible = phase !== "lobby" && !checkingPads;
    const arrivals: { label: HTMLElement; leader: HTMLElement; anchor: BallsyLabelAnchor; ballX: number; ballY: number }[] = [];
    projectBallsyFinishes(finishes, PLAYERS.map(player => ({ id: player.id, position: api.query({ ids: [player.id] })[0]?.position ?? player.spawn })), id => host.world.getEntityObject(id));
    PLAYERS.forEach((player, i) => {
      const position = api.query({ ids: [player.id] })[0]?.position;
      const finish = finishes.find(entry => entry.subjectId === player.id);
      const label = element(`[data-label="${i}"]`);
      const leader = element(`[data-label-leader="${i}"]`);
      const sparkle = element(`[data-finish-sparkle="${i}"]`);
      label.hidden = !visible || !position;
      leader.hidden = !visible || !position || !finish;
      label.dataset.finished = String(!!finish);
      label.textContent = finish ? `✓ ${ballsyFinishPlace(finishes.indexOf(finish))} · Arrivée` : String(i + 1);
      sparkle.hidden = !visible || !position || !finish || finish.sparkleSeconds >= BALLSY_SPARKLE_SECONDS;
      if (!position) return;
      scratch.set(position[0], position[1], position[2]).project(host.camera);
      const ballX = (scratch.x + 1) * root.clientWidth / 2, ballY = (1 - scratch.y) * root.clientHeight / 2;
      sparkle.style.left = `${ballX}px`;
      sparkle.style.top = `${ballY}px`;
      const progress = (finish?.sparkleSeconds ?? 0) / BALLSY_SPARKLE_SECONDS;
      sparkle.style.setProperty("--burst", `${16 + 26 * Math.sin(progress * Math.PI / 2)}px`);
      sparkle.style.setProperty("--spark-opacity", String(Math.min(1, (1 - progress) * 3)));
      sparkle.style.setProperty("--ring-size", `${24 + progress * 52}px`);
      scratch.set(position[0], position[1] + 1.3, position[2]).project(host.camera);
      // Actual measured rectangles resolve close finishes after both labels exist.
      const x = (scratch.x + 1) * root.clientWidth / 2;
      const y = (1 - scratch.y) * root.clientHeight / 2 - (finish ? 42 : 0);
      label.style.left = `${Math.max(finish ? 75 : 26, Math.min(root.clientWidth - (finish ? 75 : 26), x))}px`;
      label.style.top = `${Math.max(38, Math.min(root.clientHeight - 32, y))}px`;
      if (visible && finish) arrivals.push({ label, leader, ballX, ballY,
        anchor: { x, bottom: y, width: label.offsetWidth, height: label.offsetHeight } });
    });
    if (arrivals.length) {
      const blockers = Array.from(surface.querySelectorAll<HTMLElement>(".ballsy-header,.ballsy-score,[data-card],[data-pad-test],[data-race-tip],[data-volcano-signal],[data-giant],[data-room],[data-finish-announcement],.ballsy-ball-label[data-finished='false']"))
        .filter(node => node.getClientRects().length > 0 && node.offsetWidth > 0 && node.offsetHeight > 0)
        .map(node => { const box = node.getBoundingClientRect(); return { left: box.left, right: box.right, top: box.top, bottom: box.bottom }; });
      // Reserve the small celebration footprint too, so moving one badge does not
      // solve a text collision by covering its neighbour's ball or stars.
      blockers.push(...arrivals.map(arrival => ({ left: arrival.ballX - 50, right: arrival.ballX + 50, top: arrival.ballY - 50, bottom: arrival.ballY + 50 })));
      const positions = layoutBallsyArrivalLabels(arrivals.map(arrival => arrival.anchor), { width: root.clientWidth, height: root.clientHeight }, blockers);
      arrivals.forEach((arrival, i) => {
        const position = positions[i];
        arrival.label.style.left = `${position.x}px`;
        arrival.label.style.top = `${position.bottom}px`;
        const fromX = Math.max(position.box.left + 8, Math.min(position.box.right - 8, arrival.ballX));
        const fromY = arrival.ballY >= position.bottom ? position.bottom : position.box.top;
        const dx = arrival.ballX - fromX, dy = arrival.ballY - fromY;
        arrival.leader.style.left = `${fromX}px`;
        arrival.leader.style.top = `${fromY}px`;
        arrival.leader.style.width = `${Math.max(0, Math.hypot(dx, dy) - 15)}px`;
        arrival.leader.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
      });
    }
  }
  function paint(): void {
    if (isVolcano) {
      const fade = PLAYERS.some(player => { const p = api.query({ids:[player.id]})[0]?.position; return !!p && Math.abs(p[0]) < 2.4 && Math.abs(p[2]-19) < 7; });
      if (fade !== finishArchFaded) { api.update("ballsy-finish-banner", {material:{opacity:fade ? 0.15 : 1}}); finishArchFaded = fade; }
    }
    surface.dataset.phase = phase;
    surface.dataset.tool = legacyShovel ? "shovel" : "slime";
    const racing = phase === "racing" || phase === "countdown";
    card.hidden = racing || checkingPads;
    element("[data-pad-test]").hidden = !checkingPads;
    element(".ballsy-header").hidden = checkingPads;
    element(".ballsy-scores").hidden = checkingPads;
    button("pad-check").hidden = phase !== "lobby" && phase !== "results";
    if (checkingPads) {
      for (let i = 0; i < 2; i++) {
        const check = padChecks[i], pad = currentPad(i);
        const model = element(`[data-pad-model="${i}"]`), instruction = element(`[data-pad-instruction="${i}"]`);
        const name = check.device && pad ? pad.id.slice(0, 140) : "Aucune manette standard détectée";
        if (model.textContent !== name) model.textContent = name;
        const text = ballsyPadInstruction(check);
        if (instruction.textContent !== text) instruction.textContent = text;
        element(`[data-pad-test-slot="${i}"]`).dataset.ready = String(ballsyPadReady(check));
        element(`[data-stick="${i}"]`).style.transform = `translate(${check.x * 26}px, ${check.y * 26}px)`;
        element(`[data-brake="${i}"]`).dataset.pressed = String(check.brakeDown);
      }
      element("[data-pad-check-notice]").textContent = pads.some((pad) => pad?.connected && pad.mapping !== "standard")
        ? "Une manette sans profil standard est détectée. Le clavier reste disponible."
        : "Le clavier reste disponible. Ce test ne lance pas la course.";
    }
    button("pause").hidden = !racing && phase !== "paused";
    button("pause").textContent = phase === "paused" ? "Reprendre" : "Pause";
    element("[data-race-tip]").hidden = !racing;
    element("[data-controls]").hidden = phase !== "lobby";
    element("[data-settings]").hidden = phase !== "lobby";
    element("[data-pad-help]").hidden = phase !== "lobby";
    element("[data-footnote]").hidden = phase !== "lobby";
    button("reassign").hidden = phase !== "lobby" && phase !== "results";
    button("restart").hidden = phase !== "paused";
    countdownLabel.hidden = phase !== "countdown";
    countdownLabel.textContent = String(Math.ceil(countdown));
    const standings = standingsNow();
    element("[data-results]").hidden = phase !== "results";
    const announcement = element("[data-finish-announcement]");
    // The final live status belongs to the result sheet, not the billes' play area.
    // Reuse the same accessible node so a completed racer never loses its status.
    if (phase === "results") {
      if (announcement.parentElement !== card) card.insertBefore(announcement, heading);
    } else if (announcement.parentElement !== surface) surface.insertBefore(announcement, card);
    announcement.hidden = finishes.length === 0 || checkingPads;
    if (phase === "lobby") {
      heading.textContent = isVolcano ? "La Boucle du Volcan" : "On fait la course ?";
      description.textContent = isVolcano ? "Deux tours autour du volcan. La voie large est s\u00fbre ; le raccourci de la fourche est plus \u00e9troit. Le g\u00e9ant lance des ballons de slime pour ralentir doucement les billes." : "Deux balles, deux tours. Faites le tour de l'\u00eele dans le sens des fl\u00e8ches !";
      button("start").textContent = "C'est parti ! ↗";
    }
    if (phase === "paused") {
      heading.textContent = "Petite pause";
      description.textContent = "Soufflez un peu. Les deux balles vous attendent.";
      button("start").textContent = "On continue ↗";
    }
    if (phase === "results") {
      heading.textContent = `${standings[0]?.subjectId === PLAYERS[0].id ? "Lagon" : "Corail"} remporte la course !`;
      const gap = standings.length > 1 ? standings[1].run.elapsedSeconds - standings[0].run.elapsedSeconds : 0;
      description.textContent = gap < .25 ? `Arrivée serrée : ${gap.toFixed(3)} s d'écart !` : "Deux tours bouclés. Bien joué à vous deux !";
      const rows = standings.map((entry, i) => `<li data-result="${entry.subjectId}"><b>${ballsyFinishPlace(i)} · ${entry.subjectId === PLAYERS[0].id ? "Lagon" : "Corail"}</b><span>${ballsyFinishTime(entry.run.elapsedSeconds)}</span></li>`).join("");
      if (element("[data-results]").innerHTML !== rows) element("[data-results]").innerHTML = rows;
      button("start").textContent = "La revanche ! ↗";
    }
    element("[data-giant]").hidden = !isVolcano || (phase !== "racing" && phase !== "paused") || (!legacyShovel && !room?.state().connected);
    const signal = element("[data-volcano-signal]");
    signal.hidden = !isVolcano || !racing;
    if (isVolcano) {
      const wave = volcanoWave(volcano);
      signal.textContent = volcanoMode === "help" ? `Aide ${ally === 0 ? "Lagon" : "Corail"} \u00b7 ${wave.active ? "CRUE !" : `Crue dans ${Math.ceil(wave.inSeconds)} s`}` : "Voie large ou raccourci risqu\u00e9 \u00b7 suis les fl\u00e8ches";
      signal.dataset.flood = String(wave.active);
      element("[data-charges]").textContent = legacyShovel ? `${volcano.earth.revision} coups` : `${slime.hits} touche${slime.hits === 1 ? "" : "s"}`;
      element("[data-giant-status]").textContent = legacyShovel ? "Creuse des tranchées : la lave suit le relief." : "Une touche : 25 % moins vite, pendant 2 secondes.";
      const remote = room?.state().connected ?? false;
      element("[data-giant-feedback]").textContent = giantFeedback || (remote ? "Le géant joue dans sa maquette." : legacyShovel ? "La terre reste creusée jusqu'à la revanche." : "Invite un géant pour lancer les ballons.");

    }
    const roomState = room?.state();
    button("invite").textContent = roomState?.status === "expired" ? "Nouvelle invitation"
      : roomState?.status === "interrupted" ? "Réessayer la connexion"
      : roomState?.status === "opening" ? "Connexion…" : roomState?.code ? "Code du géant" : "Inviter un géant";
    element("[data-room]").hidden = checkingPads || (!roomState?.code && !roomState?.message);
    element("[data-room-code]").textContent = roomState?.code ? `Code géant ${roomState.code.slice(0, 4)}-${roomState.code.slice(4)}`
      : roomState?.status === "expired" ? "Invitation terminée" : "Connexion du géant";
    element("[data-room-status]").textContent = roomState?.message || (roomState?.connected ? "Géant connecté · la course reste sur la télé." : "Le géant peut rejoindre cette partie.");
    PLAYERS.forEach((player, i) => {
      const run = standings.find((entry) => entry.subjectId === player.id)?.run;
      element(`[data-progress="${i}"]`).textContent = phase === "lobby" ? "Prêt à rouler"
        : run?.phase === "complete" ? `✓ Arrivée · ${ballsyFinishTime(run.elapsedSeconds)}`
        : `Tour ${Math.min(2, (run?.lap ?? 0) + 1)}/2 · ${isVolcano ? `${Math.max(0, Math.round((runs[i].progress - Math.floor(Math.max(0, runs[i].progress))) * 100))} %${runs[i].offTrackSeconds > 0 ? " · Retour piste…" : runs[i].wrongWay ? " · Sens inverse" : runs[i].branch === "shortcut" ? " · Raccourci" : " · Voie large"}` : `${run?.checkpointIndex ?? 0}/3 portes`}`;
      const velocity = api.query({ ids: [player.id] })[0]?.physics?.linearVelocity;
      element(`[data-speed="${i}"]`).textContent = !racing ? "" : `${Math.hypot(velocity?.[0]??0,velocity?.[2]??0).toFixed(1)} m/s${isVolcano && ballsySlimeSpeedFactor(slime, i) < 1 ? " · Slime !" : ""}`;
      element(`[data-slot="${i}"]`).dataset.boost = "false";
      element(`[data-slot="${i}"]`).dataset.finished = String(run?.phase === "complete");

    });
    paintRacerOverlays();
  }
  const state = (): unknown => ({ coordinateSystem: "right-handed; +x screen right, +y up, -z screen up", phase,
    countdown: phase === "countdown" ? Math.ceil(countdown) : null, laps: 2, slots, connected, rescues, boosts: structuredClone(boosts),
    course: isVolcano ? "volcano" : "practice", volcano: isVolcano ? structuredClone(volcano) : null, ally: volcanoMode === "help" ? ally : null,
    slime: isVolcano ? snapshotBallsySlime(slime) : null,
    roundId, room: room?.state() ?? null, checkingPads, finishes: structuredClone(finishes),
    camera: cameraFrame ? { mode: phase === "lobby" || legacyShovel ? "course" : "group", ...structuredClone(cameraFrame) } : null,
    race: isVolcano ? { stepSeconds: VOLCANO_RACE_STEP, gatesPerLap: VOLCANO_RACE_GATES, standings: structuredClone(standingsNow()) } : null,
    padChecks: padChecks.map((check) => ({ ...check, ready: ballsyPadReady(check) })),
    players: PLAYERS.map((player) => ({ id: player.id, position: api.query({ ids: [player.id] })[0]?.position,
      velocity: api.query({ ids: [player.id] })[0]?.physics?.linearVelocity, run: structuredClone(standingsNow().find((entry) => entry.subjectId === player.id)?.run) })) });
  const advanceTime = (milliseconds: number): unknown => {
    if (!Number.isFinite(milliseconds) || milliseconds < 0 || milliseconds > 60_000) throw new RangeError("advanceTime expects 0..60000 milliseconds");
    manual = true;
    syncPause();
    if (milliseconds === 0) { pollPads(); paint(); if (phase !== "paused") updateCamera(0, true); paintRacerOverlays(); return state(); }
    if (isVolcano) advanceFixed(milliseconds / 1000);
    else {
      const steps = Math.ceil(milliseconds / (1000 / 60));
      for (let i = 0; i < steps; i++) tick(milliseconds / steps / 1000, true);
    }
    return state();
  };
  function advanceFixed(seconds: number): void {
    accumulatedSeconds += seconds;
    while (accumulatedSeconds + 1e-10 >= VOLCANO_RACE_STEP) {
      accumulatedSeconds -= VOLCANO_RACE_STEP;
      tick(VOLCANO_RACE_STEP, true);
    }
  }
  const stopFrame = host.subscribeFrame((seconds) => {
    room?.maintain();
    if (!manual) { if (isVolcano) advanceFixed(Math.min(seconds, 0.1)); else tick(Math.min(seconds, 0.1)); }
    else paint();
  });
  const fullscreen = async (): Promise<void> => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await root.requestFullscreen(); }
    catch { notice.textContent = "Le plein écran est indisponible dans ce navigateur."; }
  };
  const syncFullscreen = (): void => { button("fullscreen").textContent = document.fullscreenElement ? "Fenêtre" : "Plein écran"; fit(); };
  button("fullscreen").addEventListener("click", () => { void fullscreen(); });
  button("pause").addEventListener("click", togglePause);
  button("start").addEventListener("click", () => { if (phase === "paused") resume(); else start(); });
  button("reassign").addEventListener("click", () => { slots = [null, null]; connected = [false, false]; padChecks = [createBallsyPadCheck(), createBallsyPadCheck()]; pollPads(); paint(); });
  button("pad-check").addEventListener("click", () => { checkingPads = true; keys.clear(); paint(); button("close-pad-check").focus(); });
  const closePadCheck = (): void => { checkingPads = false; paint(); button("pad-check").focus(); };
  button("close-pad-check").addEventListener("click", closePadCheck);
  button("reset-pad-check").addEventListener("click", () => { padChecks = [createBallsyPadCheck(), createBallsyPadCheck()]; pollPads(); paint(); });
  button("save-pad-check").addEventListener("click", () => {
    const receipt = { schema: "ballsy-pad-check/v1", observedAt: new Date().toISOString(), evidence: "browser inputs observed; physical play is a separate check",
      browser: navigator.userAgent, secureContext: window.isSecureContext,
      players: padChecks.map((check, i) => { const pad = currentPad(i); return { player: i + 1, name: PLAYERS[i].name,
        device: pad?.connected ? { id: pad.id.slice(0, 140), index: pad.index, mapping: pad.mapping, axes: pad.axes.length, buttons: pad.buttons.length } : null,
        directions: check.directions, centred: check.centred, braked: check.braked, released: check.released, ready: ballsyPadReady(check) }; }) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(receipt, null, 2)], { type: "application/json" }));
    const download = document.createElement("a"); download.href = url; download.download = "ballsy-manettes.json"; download.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  button("restart").addEventListener("click", () => { if (phase === "paused") { phase = "lobby"; start(); } });
  const controlKeys = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD", "KeyZ", "KeyQ", "Space", "ShiftLeft", "ShiftRight"]);
  const keydown = (event: KeyboardEvent): void => {
    if (event.target instanceof HTMLElement && event.target.closest("input, select, textarea")) return;
    if (checkingPads) {
      if (event.code === "Tab") {
        const controls = Array.from(element("[data-pad-test]").querySelectorAll<HTMLButtonElement>("button:not([disabled])"));
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
      if (event.code === "Escape") { event.preventDefault(); closePadCheck(); }
      if (event.code === "KeyF" && !event.repeat) { event.preventDefault(); void fullscreen(); }
      return;
    }
    if (controlKeys.has(event.code)) { keys.add(event.code); event.preventDefault(); }
    if (event.repeat) return;
    if (event.code === "KeyF") { event.preventDefault(); void fullscreen(); }
    if (event.code === "KeyP" || event.code === "Escape") { event.preventDefault(); togglePause(); }
    if (event.code === "Enter" && !(event.target instanceof HTMLButtonElement)) { if (phase === "paused") resume(); else start(); }
  };
  const keyup = (event: KeyboardEvent): void => { keys.delete(event.code); if (/^Digit[123]$/.test(event.code) && !room?.state().connected) commandVolcano(volcano, { type: "release" }); };
  const blur = (): void => { cancelLocalDig(); keys.clear(); neutral(); if (!room?.state().connected) pause("La fenêtre a perdu le focus. Reprenez quand tout le monde est prêt."); };
  const visibility = (): void => { if (document.hidden) { keys.clear(); pause("La télé n'est plus visible. Reprenez quand tout le monde est prêt."); } };
  window.addEventListener("keydown", keydown);
  window.addEventListener("keyup", keyup);
  window.addEventListener("blur", blur);
  window.addEventListener("resize", fit);
  document.addEventListener("visibilitychange", visibility);
  document.addEventListener("fullscreenchange", syncFullscreen);
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    stopFrame();
    room?.dispose();
    neutral();
    window.removeEventListener("keydown", keydown);
    window.removeEventListener("keyup", keyup);
    window.removeEventListener("blur", blur);
    window.removeEventListener("resize", fit);
    document.removeEventListener("visibilitychange", visibility);
    document.removeEventListener("fullscreenchange", syncFullscreen);
    surface.remove();
    host.dispose();
  };
  window.addEventListener("pagehide", dispose, { once: true });
  Object.assign(window, { __GRAPHYSX__: api, __GRAPHYSX_HOST__: host,
    __BALLSY__: { state, advanceTime, commandGiant, dispose, course: () => structuredClone({ main: COURSE_MAIN, shortcut: COURSE_SHORTCUT, fork: COURSE_FORK, length: COURSE_LENGTH, sections: COURSE_SECTIONS }) }, render_game_to_text: () => JSON.stringify(state()), advanceTime });
  if (isVolcano) projectVolcano(api, volcano, (id) => host.world.getEntityObject(id));
  pollPads();
  paint();
} catch (error) { showStartupError(root, error); }
