import { Raycaster, Vector2, Vector3 } from "three";
import { createBallsyBoost, advanceBallsyBoost } from "./ballsy-boost";
import { EARTH_BOUNDS, surfaceHeightAt } from "./ballsy-earth";
import { PlatformHost } from "./platform-host";
import { showStartupError } from "./startup-error";
import { assignBallsyPads, ballsyButton, readBallsyDrive, type BallsyPad, type BallsySlots } from "./ballsy-input";
import { createBallsyPadCheck, updateBallsyPadCheck, ballsyPadReady, ballsyPadInstruction } from "./ballsy-pad-check";
import { BALLSY_PLAYERS, composeBallsyCourse } from "./ballsy-scene";
import { createVolcano, commandVolcano, advanceVolcano, volcanoSlowAt, volcanoWave, type VolcanoMode } from "./ballsy-volcano";
import { projectVolcano } from "./ballsy-volcano-scene";
import { ballsyRelayAvailable, createBallsyHostLink } from "./ballsy-link";
import type { BallsySnapshot } from "../server/ballsy-protocol.mjs";
import "./ballsy.css";

type Phase = "lobby" | "countdown" | "racing" | "paused" | "results";
const root = document.querySelector<HTMLDivElement>("#ballsy")!;
const params = new URLSearchParams(window.location.search);
const isVolcano = params.get("course") !== "practice";
let volcanoMode: VolcanoMode = params.get("mode") === "help" ? "help" : "challenge";
let ally = params.get("ally") === "1" ? 1 : 0;

try {
  const host = new PlatformHost(root, { world: composeBallsyCourse({ volcano: isVolcano }), autoOrbit: false, intro: false, editorVisible: false,
    framing: { position: [0, 31, 24], target: [0, 0, 0] } });
  const api = host.api;
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
    <div class="ballsy-card" data-card>
      <p class="ballsy-eyebrow">BALLSY · ${isVolcano ? "LE VOLCAN" : "PREMIÈRE PISTE"}</p><h1>On fait la course ?</h1>
      <p data-description>Deux balles, deux tours. Faites le tour de l'île dans le sens des flèches !</p>
      <div class="ballsy-settings" data-settings><label>Tableau <select data-course><option value="volcano">Le volcan</option><option value="practice">Piste découverte</option></select></label>
      <label data-mode-label>Géant <select data-mode><option value="challenge">Défie la course</option><option value="help-0">Aide Lagon</option><option value="help-1">Aide Corail</option></select></label></div>
      <div class="ballsy-controls" data-controls>
        <div><b><i>1</i> Lagon</b><p>Flèches pour rouler<br>Espace pour freiner</p><small data-pad="0">Clavier disponible</small></div>
        <div><b><i>2</i> Corail</b><p>WASD / ZQSD pour rouler<br>Majuscule pour freiner</p><small data-pad="1">Clavier disponible</small></div>
      </div>
      <p class="ballsy-pad-help" data-pad-help>Manettes : appuyez sur un bouton pour les détecter.<br>Stick gauche pour rouler · bouton du bas pour freiner.</p>
      <p class="ballsy-notice" data-notice role="status"></p>
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
      <div class="ballsy-giant-title"><b>La pelle du géant</b><span data-charges></span></div>
      <p data-giant-status>Choisis où canaliser la lave.</p>
      <p class="ballsy-shovel-help">Clique et glisse dans la terre ambrée pour creuser. Au Quest, enfonce la pelle et tire avec la main.</p>
      <small data-giant-feedback>Les coureurs peuvent passer au sec à l'extérieur.</small>
    </aside>
    <aside class="ballsy-room" data-room hidden aria-label="Connexion du géant"><b data-room-code></b><p data-room-status></p><a href="./ballsy-giant.html" target="_blank" rel="noopener">Ouvrir la vue du géant ↗</a><small>Quest : accès privé HTTPS ou USB local requis.</small></aside>
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
  let visualTime = -1;
  let giantFeedback = "";
  const speedCaps = [8, 8];
  let boosts = [createBallsyBoost(), createBallsyBoost()];
  let roundId = crypto.randomUUID();
  let room: ReturnType<typeof createBallsyHostLink> | null = null;
  const rescues = [0, 0];
  let pads: readonly (BallsyPad | null)[] = [];
  const currentPad = (slot: number): BallsyPad | null => pads.find((pad) => pad?.index === slots[slot]) ?? null;
  const neutral = (): void => { for (const player of BALLSY_PLAYERS) api.steer(player.id, { thrust: 0, turn: 0 }); };
  const syncPause = (): void => { api.pause(manual || phase !== "racing"); };
  const fit = (): void => {
    const scale = Math.max(1, 1.4 / Math.max(0.3, window.innerWidth / window.innerHeight));
    host.frameView([0, 31 * scale, 24 * scale], [0, 0, 0], 0);
  };
  fit();
  const courseSelect = element<HTMLSelectElement>("[data-course]");
  const modeSelect = element<HTMLSelectElement>("[data-mode]");
  courseSelect.value = isVolcano ? "volcano" : "practice";
  modeSelect.value = volcanoMode === "help" ? `help-${ally}` : "challenge";
  element("[data-mode-label]").hidden = !isVolcano;
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
    if (!remote && room?.state().connected) return { ok: false, reason: "Le géant tient la pelle depuis sa maquette." };
    const result = commandVolcano(volcano, command);
    giantFeedback = result.ok ? "" : result.reason ?? "";
    paint();
    return result;
  };
  function networkSnapshot(): BallsySnapshot {
    const standings = api.rules.standings() ?? [];
    return { roundId, phase, volcano: structuredClone(volcano), ally: volcanoMode === "help" ? ally : null,
      players: BALLSY_PLAYERS.map((player) => ({ id: player.id, position: [...(api.query({ ids: [player.id] })[0]?.position ?? player.spawn)] as [number, number, number],
        lap: standings.find((entry) => entry.subjectId === player.id)?.run.lap ?? 0, finished: standings.find((entry) => entry.subjectId === player.id)?.run.phase === "complete" })) };
  }
  if (isVolcano) void ballsyRelayAvailable().then((available) => {
    if (!available || disposed) return;
    room = createBallsyHostLink({ snapshot: networkSnapshot, command: (command) => { commandGiant(command, true); },
      presence: () => { commandVolcano(volcano, { type: "release" }); paint(); } });
    button("invite").hidden = false;
  });
  button("invite").addEventListener("click", () => {
    button("invite").disabled = true;
    void room?.open().catch((error: unknown) => { notice.textContent = error instanceof Error ? error.message : "Connexion indisponible."; })
      .finally(() => { button("invite").disabled = false; paint(); });
  });
  const pointerRay = new Raycaster(), pointer = new Vector2(), digPoint = new Vector3();
  let localDig = false, localTip: [number, number, number] | null = null;
  const cancelLocalDig = (): void => { if (localDig) commandVolcano(volcano, { type: "release" }); localDig = false; localTip = null; };
  const pickEarth = (event: PointerEvent): [number, number, number] | null => {
    const rect = host.renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX-rect.left)/rect.width*2-1, 1-(event.clientY-rect.top)/rect.height*2);
    pointerRay.setFromCamera(pointer, host.camera);
    // Sample the authoritative surface, not a stale render mesh or a preselected route.
    for (let distance=0.1; distance<100; distance+=0.08) {
      pointerRay.ray.at(distance,digPoint);
      if (digPoint.x<EARTH_BOUNDS.minX || digPoint.x>EARTH_BOUNDS.maxX || digPoint.z<EARTH_BOUNDS.minZ || digPoint.z>EARTH_BOUNDS.maxZ) continue;
      const height=surfaceHeightAt(volcano.earth,digPoint.x,digPoint.z);
      if (digPoint.y<=height) return [digPoint.x,height-0.14,digPoint.z];
    }
    return null;
  };
  host.renderer.domElement.addEventListener("pointerdown",(event)=>{
    event.stopImmediatePropagation();
    if (!isVolcano || phase!=="racing" || room?.state().connected || event.button!==0) return;
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
    for (const player of BALLSY_PLAYERS) api.steer(player.id, { headingDegrees: 90 });
    countdown = 3;
    rescues.fill(0);
    volcano = createVolcano(volcanoMode);
    roundId = crypto.randomUUID();
    visualTime = -1;
    giantFeedback = "";
    boosts = [createBallsyBoost(), createBallsyBoost()];
    cancelLocalDig();
    speedCaps.fill(8);
    for (const player of BALLSY_PLAYERS) api.update(player.id, { steering: { speedCap: 8 } });
    if (isVolcano) projectVolcano(api, volcano);
    notice.textContent = "";
    phase = "countdown";
    syncPause();
    paint();
  }
  function pause(reason = "La course vous attend."): void {
    if (phase !== "racing" && phase !== "countdown") return;
    resumePhase = phase;
    phase = "paused";
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
    if (phase === "countdown") {
      countdown = Math.max(0, countdown - seconds);
      if (countdown === 0) { phase = "racing"; api.rules.reset(); syncPause(); }
    }
    if (phase === "racing") {
      if (isVolcano) {
        advanceVolcano(volcano, seconds);
        if (localDig && localTip && !room?.state().connected) commandVolcano(volcano, { type: "shovel", tip: localTip, held: true });
        if (volcano.time - visualTime >= 0.1 || visualTime < 0) { projectVolcano(api, volcano); visualTime = volcano.time; }
      }
      const standings = api.rules.standings() ?? [];
      BALLSY_PLAYERS.forEach((player, slot) => {
        const run = standings.find((entry) => entry.subjectId === player.id)?.run;
        const drive = run?.phase === "complete" ? { thrust: 0, turn: 0 } : readBallsyDrive(slot, keys, currentPad(slot));
        api.steer(player.id, drive);
        const entity = api.query({ ids: [player.id] })[0];
        const position = entity?.position;
        const slow = isVolcano && position ? volcanoSlowAt(volcano, position) : { intensity: 0, speedCap: 8 };
        const velocity = entity?.physics?.linearVelocity;
        const impulse = isVolcano && position && velocity ? advanceBallsyBoost(boosts[slot], seconds, position, velocity, slow.intensity === 0 && drive.thrust >= 0 && run?.phase !== "complete") : null;
        const cap = slow.intensity>0 ? slow.speedCap : boosts[slot].remaining>0 ? 10.4 : 8;
        const capChanged = Math.abs(cap - speedCaps[slot]) > 0.01;
        if (position && velocity && entity.physics) {
          const nextVelocity: [number, number, number] = [velocity[0] + (impulse?.[0] ?? 0), velocity[1], velocity[2] + (impulse?.[1] ?? 0)];
          let changedVelocity = !!impulse;
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
        if (position && (position[1] < -3 || Math.abs(position[0]) > 20 || Math.abs(position[2]) > 16)) {
          const safe: [number, number, number][] = [[...player.spawn], [14, 0.7, -2], [-2, 0.7, -9], [-14, 0.7, 2]];
          api.update(player.id, { transform: { position: safe[Math.min(3, run?.checkpointIndex ?? 0)] },
            physics: { mode: "dynamic", linearVelocity: [0, 0, 0], angularVelocity: [0, 0, 0] } });
          rescues[slot]++;
        }
      });
      if (explicitStep && seconds > 0) api.step(seconds);
      if (api.rules.standings()?.every((entry) => entry.run.phase === "complete")) {
        phase = "results";
        neutral();
        syncPause();
      }
    }
    paint();
  }
  const scratch = new Vector3();
  function paint(): void {
    surface.dataset.phase = phase;
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
    const standings = api.rules.standings() ?? [];
    if (phase === "lobby") {
      heading.textContent = isVolcano ? "Chaud devant !" : "On fait la course ?";
      description.textContent = isVolcano ? "Deux tours, deux rivaux. Vise les accélérateurs turquoise et contourne la lave. Le géant creuse vraiment le terrain." : "Deux balles, deux tours. Faites le tour de l'île dans le sens des flèches !";
      button("start").textContent = "C'est parti ! ↗";
    }
    if (phase === "paused") {
      heading.textContent = "Petite pause";
      description.textContent = "Soufflez un peu. Les deux balles vous attendent.";
      button("start").textContent = "On continue ↗";
    }
    if (phase === "results") {
      heading.textContent = `${standings[0]?.subjectId === BALLSY_PLAYERS[0].id ? "Lagon" : "Corail"} remporte la course !`;
      description.textContent = standings.map((entry, i) => `${i + 1}. ${entry.label} · ${entry.run.elapsedSeconds.toFixed(1)} s`).join("   ");
      button("start").textContent = "La revanche ! ↗";
    }
    element("[data-giant]").hidden = !isVolcano || (phase !== "racing" && phase !== "paused");
    const signal = element("[data-volcano-signal]");
    signal.hidden = !isVolcano || !racing;
    if (isVolcano) {
      const wave = volcanoWave(volcano);
      signal.textContent = volcanoMode === "help" ? `Aide ${ally === 0 ? "Lagon" : "Corail"} · ${wave.active ? "CRUE !" : `Crue dans ${Math.ceil(wave.inSeconds)} s`}` : "Vise les bandes turquoise · Évite la lave";
      signal.dataset.flood = String(wave.active);
      element("[data-charges]").textContent = `${volcano.earth.revision} coups`;
      element("[data-giant-status]").textContent = "Creuse des tranchées : la lave suit le relief.";
      const remote = room?.state().connected ?? false;
      element("[data-giant-feedback]").textContent = remote ? "Le géant tient la pelle dans sa maquette." : giantFeedback || "La terre reste creusée jusqu'à la revanche.";

    }
    const roomState = room?.state();
    element("[data-room]").hidden = checkingPads || !roomState?.code;
    element("[data-room-code]").textContent = roomState?.code ? `Code géant ${roomState.code.slice(0, 4)}-${roomState.code.slice(4)}` : "";
    element("[data-room-status]").textContent = roomState?.message || (roomState?.connected ? "Géant connecté · la course reste sur la télé." : "Le géant peut rejoindre cette partie.");
    BALLSY_PLAYERS.forEach((player, i) => {
      const run = standings.find((entry) => entry.subjectId === player.id)?.run;
      element(`[data-progress="${i}"]`).textContent = phase === "lobby" ? "Prêt à rouler"
        : run?.phase === "complete" ? `Arrivée · ${run.elapsedSeconds.toFixed(1)} s`
        : `Tour ${Math.min(2, (run?.lap ?? 0) + 1)}/2 · ${run?.checkpointIndex ?? 0}/3 portes`;
      const position = api.query({ ids: [player.id] })[0]?.position;
      const velocity = api.query({ ids: [player.id] })[0]?.physics?.linearVelocity;
      element(`[data-speed="${i}"]`).textContent = !racing ? "" : boosts[i].remaining>0 ? "TURBO !" : `${Math.hypot(velocity?.[0]??0,velocity?.[2]??0).toFixed(1)} m/s`;
      element(`[data-slot="${i}"]`).dataset.boost = String(boosts[i].remaining>0);
      const label = element(`[data-label="${i}"]`);
      label.hidden = !racing || !position;
      if (position) {
        scratch.set(position[0], position[1] + 1.3, position[2]).project(host.camera);
        label.style.left = `${(scratch.x + 1) * root.clientWidth / 2}px`;
        label.style.top = `${(1 - scratch.y) * root.clientHeight / 2}px`;
      }
    });
  }
  const state = (): unknown => ({ coordinateSystem: "right-handed; +x screen right, +y up, -z screen up", phase,
    countdown: phase === "countdown" ? Math.ceil(countdown) : null, laps: 2, slots, connected, rescues, boosts: structuredClone(boosts),
    course: isVolcano ? "volcano" : "practice", volcano: isVolcano ? structuredClone(volcano) : null, ally: volcanoMode === "help" ? ally : null,
    roundId, room: room?.state() ?? null, checkingPads,
    padChecks: padChecks.map((check) => ({ ...check, ready: ballsyPadReady(check) })),
    players: BALLSY_PLAYERS.map((player) => ({ id: player.id, position: api.query({ ids: [player.id] })[0]?.position,
      velocity: api.query({ ids: [player.id] })[0]?.physics?.linearVelocity, run: api.rules.standings()?.find((entry) => entry.subjectId === player.id)?.run })) });
  const advanceTime = (milliseconds: number): unknown => {
    if (!Number.isFinite(milliseconds) || milliseconds < 0 || milliseconds > 60_000) throw new RangeError("advanceTime expects 0..60000 milliseconds");
    manual = true;
    syncPause();
    if (milliseconds === 0) { pollPads(); paint(); return state(); }
    const steps = Math.ceil(milliseconds / (1000 / 60));
    for (let i = 0; i < steps; i++) tick(milliseconds / steps / 1000, true);
    return state();
  };
  const stopFrame = host.subscribeFrame((seconds) => { room?.maintain(); if (!manual) tick(Math.min(seconds, 0.1)); else paint(); });
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
      players: padChecks.map((check, i) => { const pad = currentPad(i); return { player: i + 1, name: BALLSY_PLAYERS[i].name,
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
    __BALLSY__: { state, advanceTime, commandGiant, dispose }, render_game_to_text: () => JSON.stringify(state()), advanceTime });
  if (isVolcano) projectVolcano(api, volcano);
  pollPads();
  paint();
} catch (error) { showStartupError(root, error); }
