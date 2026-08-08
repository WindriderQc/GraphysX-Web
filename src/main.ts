import {
  ARCHIVE_BUILDINGS,
  ARCHIVE_BUILDINGS_NOT_REVIVED,
  archiveBuildingBrowseRows,
  buildArchiveBuilding,
  composeArchiveBuilding,
} from "./archive-buildings";
import {
  ARCHIVE_MATH_NOT_REVIVED,
  ARCHIVE_MATH_SCENES,
  archiveMathBrowseRows,
  buildArchiveMathLab,
  composeArchiveMathLab,
} from "./archive-math-lab";
import {
  ARCHIVE_MILKYWAY_NOT_REVIVED,
  ARCHIVE_MILKYWAY_SCENES,
  archiveMilkyWayBrowseRows,
  buildArchiveMilkyWay,
  composeArchiveMilkyWay,
} from "./archive-milkyway";
import {
  ARCHIVE_PLAYGROUNDS,
  ARCHIVE_PLAYGROUNDS_NOT_REVIVED,
  archivePlaygroundBrowseRows,
  buildArchivePlayground,
  composeArchivePlayground,
} from "./archive-playgrounds";
import { composeSkyboxSpiral, frameSkyboxSpiral, SKYBOX_SPIRAL_PROVENANCE } from "./archive-skybox-spiral";
import type { GraphysXAgentWorldApi } from "./agent-world-runtime";
import type { LiveAgentPresenceController, LiveAgentPresenceState } from "./live-agent-presence";
import type { LiveMissionRuntimeController, LiveMissionRuntimeState } from "./live-mission-runtime";
import type { NestorTopic } from "./showroom-nestor";
import { archiveReferenceMs } from "./archive-race-records";
import { getArchiveCupRuntimeState, type ArchiveCupCourse } from "./archive-cup";
import { getPersonalGhostState } from "./level-ghosts";
import { randomPlayerName } from "./player-name";
import {
  ARCHIVE_BALLZ_LEVELS,
  ARCHIVE_BALLZ_NOT_REVIVED,
  seedArchiveBallzLevels,
  toPlatformRows,
} from "./archive-ballz-levels";
const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("App root not found.");
}

const params = new URLSearchParams(window.location.search);
const mode = params.get("host");
// `?scene=<name>` opens a scene held by the scene store instead of the built-in showroom,
// and keeps polling it, so an agent writing to the store changes what is on screen here.
// `?store=<url>` points at a store other than the local default.
const storeScene = params.get("scene");
const explicitStore = params.get("store");

/**
 * The store a production visitor talks to, baked in at build time.
 *
 * Opt-in, and deliberately empty by default. Set `VITE_GRAPHYSX_STORE_URL` when a store is
 * actually reachable from the browser and every visitor gets live sessions, leaderboards and
 * shared ghosts without a `?store=` parameter. Leave it unset and the build behaves exactly
 * as it always has: no probe, no request, no console error.
 *
 * A **same-origin path** (`/store`) is the intended value rather than an absolute URL. It
 * inherits the site's TLS — an `http://` store on an `https://` page is blocked outright as
 * mixed content — it needs no CORS allowlist because it is not cross-origin, and it needs no
 * second certificate. `ops/nginx/graphysx.specialblend.ca` carries the proxy block, and
 * `docs/DEPLOYING_THE_STORE.md` is the runbook.
 */
const configuredStore = (import.meta.env.VITE_GRAPHYSX_STORE_URL ?? "").trim();
const storeUrl = explicitStore ?? (configuredStore || "http://localhost:8788");
// Probing a store that isn't there costs a `net::ERR_CONNECTION_REFUSED` in the console —
// Chromium logs the failed request itself, so no try/catch can swallow it. A deploy with no
// store behind it would show that to every visitor. Probe only when a store was actually
// asked for, configured at build time, or in dev where one is plausibly running.
const wantsStore = Boolean(storeScene || explicitStore || configuredStore || import.meta.env.DEV);

// `?session=<id>` joins a live collaboration session on the store. The invitation itself
// arrives in the fragment as `#session=<id>&invite=<code>` — never in the query string,
// because a query string is what gets pasted, bookmarked and sent as a referrer. The client
// exchanges the code for a scoped credential and scrubs the fragment on the way in.
const sessionParam = params.get("session");
const liveSessionRequested = Boolean(
  sessionParam || new URLSearchParams(window.location.hash.replace(/^#/, "")).get("session"),
);

/**
 * Exact model colliders resolve asynchronously from their registered asset. Pause before a game
 * load and wait for both layers to say ready so neither gravity nor the rules clock can start
 * while the course is still missing its floor.
 */
async function waitForExactCollider(
  api: GraphysXAgentWorldApi,
  entityId: string,
  timeoutMs = 20_000,
): Promise<void> {
  const startedAt = performance.now();
  while (performance.now() - startedAt < timeoutMs) {
    const entity = api.query({ ids: [entityId] })[0];
    if (entity?.asset?.status === "ready" && entity.physics?.collider?.effective === "trimesh") return;
    if (entity?.asset?.status === "error" || entity?.physics?.collider?.error) {
      throw new Error(entity.asset?.error ?? entity.physics?.collider?.error ?? "Exact collider failed to load");
    }
    await new Promise((resolve) => window.setTimeout(resolve, 40));
  }
  throw new Error(`Timed out waiting for ${entityId}'s exact collider`);
}

// `?host=previews` — the workshop preview index. Development only, and guarded by
// `import.meta.env.DEV` rather than a runtime flag so the whole subtree is dead code in a
// production build: these are restoration harnesses, not product, and shipping them would
// also drag archive assets into the release manifest the product deliberately prunes.
if (mode === "previews" && import.meta.env.DEV) {
  root.style.position = "fixed";
  root.style.inset = "0";
  void Promise.all([import("./styles.css"), import("./preview-host")]).then(([, { mountPreviewHost }]) => {
    Object.assign(window, { __GRAPHYSX_PREVIEW_HOST__: mountPreviewHost(root) });
  });
} else if (mode === "legacy") {
  // The archive-revival player on race-scene, kept as a reference fallback only.
  // `styles.css` is entirely prototype-app selectors, so it loads with this route rather
  // than blocking first paint on the default one.
  void Promise.all([import("./styles.css"), import("./prototype-app")]).then(([, { PrototypeApp }]) => new PrototypeApp(root));
} else {
  // Default product: the clean PlatformHost. No param → welcome showroom; `?host=editor`
  // (or `standalone`) opens straight into the Scene Editor on the demo world.
  root.style.position = "fixed";
  root.style.inset = "0";
  const editorFirst = mode === "editor" || mode === "standalone";
  void Promise.all([
    import("./platform-host"),
    import("./showroom-scene"),
    import("./showroom-environment"),
    import("./showroom-welcome"),
    import("./showroom-interaction"),
    import("./showroom-nestor"),
  ]).then(([{ PlatformHost }, { composeShowroom }, { mountShowroomEnvironment }, { mountWelcome }, { mountShowroomInteraction }, { createNestorPresenter, isNestorCenterReady }]) => {
    // Declared up front so the host's exit callback can re-arm it; assigned once the
    // showroom is composed below.
    let interaction: ReturnType<typeof mountShowroomInteraction> | null = null;
    let welcome: ReturnType<typeof mountWelcome> | null = null;
    let nestor: ReturnType<typeof createNestorPresenter> | null = null;
    let livePresence: LiveAgentPresenceController | null = null;
    let liveMission: LiveMissionRuntimeController | null = null;
    // The showroom's terrain, water and key light are host-mounted objects rather than scene
    // entities, so loading a stored scene replaces the entities and leaves this behind —
    // a ported village would otherwise sit inside the showroom's hills. Kept so opening a
    // scene can take the showroom down with it.
    let showroomEnvironment: (() => void) | null = null;
    // A campaign race returns to the standings instead of dropping the player at the generic
    // front door. The flag is armed only by Archive Cup launchers and consumed on exit.
    let resumeArchiveCup = false;
    // Editors entered from Browse hold a different world. Their Showroom exit must rebuild
    // the AgentX Center instead of mounting Nestor's controls over unrelated scene targets.
    let restoreShowroomOnEditorExit = false;
    // DOM topics and physical consoles share this guard. A live client owns its operation
    // path and role checks, so Nestor cannot make an unbroadcast local commit while attached.
    let nestorBlockedByLiveSession = (): boolean => false;
    let reassertLiveAuthority: (() => Promise<number>) | null = null;
    let activeShelf: (() => void) | null = null;
    // Call sites express whether showroom interaction is wanted; this one predicate decides
    // whether it is actually legal. In particular, no late navigation callback can re-enable
    // canvas mutations while a live-session snapshot is authoritative.
    let showroomInteractionRequested = false;
    const syncShowroomInteraction = (): void => {
      interaction?.setEnabled(
        showroomInteractionRequested && host.mode === "scene" && !nestorBlockedByLiveSession(),
      );
    };
    const requestShowroomInteraction = (enabled: boolean): void => {
      showroomInteractionRequested = enabled;
      syncShowroomInteraction();
    };
    const dismissTransientShelf = (): void => {
      activeShelf?.();
      activeShelf = null;
    };
    const assertLocalWorldAuthority = (): void => {
      if (nestorBlockedByLiveSession()) {
        throw new Error("Leave the live session before changing worlds");
      }
    };
    type WelcomeVariant = "agentx" | "scene-resume" | "live-observer";
    let mountedWelcomeVariant: WelcomeVariant | null = null;
    const enterEditor = (): void => {
      if (nestorBlockedByLiveSession()) {
        syncFrontDoor();
        return;
      }
      restoreShowroomOnEditorExit = false;
      requestShowroomInteraction(false);
      void host.enterEditor();
    };
    const enterBrowsedEditor = (): void => {
      if (nestorBlockedByLiveSession()) {
        // A composed Browse row may have crossed the async join boundary. Restore the
        // server snapshot instead of leaving that late local composition on screen.
        void reassertLiveAuthority?.();
        syncFrontDoor();
        return;
      }
      restoreShowroomOnEditorExit = true;
      requestShowroomInteraction(false);
      void host.enterEditor();
    };
    /**
     * Asking Nestor for a capability now composes a proposal instead of committing.
     *
     * Both routes go through here — the DOM buttons and clicking a physical console in 3D —
     * so there is exactly one path from "a human asked" to "the scene changed", and it always
     * passes a human decision. Two routes with different safety properties would make "no
     * hidden mutation" a claim about one of them rather than about the product.
     */
    const presentNestor = (topic: NestorTopic): void => {
      if (nestorBlockedByLiveSession() || !isNestorCenterReady(host.api)) {
        syncFrontDoor();
        return;
      }
      const proposal = nestor?.propose(topic);
      welcome?.showOutcome(null);
      if (proposal) welcome?.showProposal(proposal, false);
    };
    const acceptNestorProposal = (): void => {
      // Re-checked at the moment of the decision, not when the card was drawn: a live session
      // may have attached while the person was reading, and that path owns scene operations.
      if (nestorBlockedByLiveSession() || !isNestorCenterReady(host.api)) {
        nestor?.discard();
        welcome?.showProposal(null);
        syncFrontDoor();
        return;
      }
      const next = nestor?.accept();
      const outcome = nestor?.state().lastOutcome ?? null;
      welcome?.showProposal(null);
      welcome?.showOutcome(outcome);
      if (next && outcome?.status === "accepted") welcome?.present(next);
    };
    const discardNestorProposal = (): void => {
      nestor?.discard();
      welcome?.showProposal(null);
      welcome?.showOutcome(nestor?.state().lastOutcome ?? null);
    };
    const desiredWelcomeVariant = (): WelcomeVariant => {
      if (nestorBlockedByLiveSession()) return "live-observer";
      return isNestorCenterReady(host.api) ? "agentx" : "scene-resume";
    };
    const mountFrontDoor = (): void => {
      welcome?.dispose();
      const variant = desiredWelcomeVariant();
      const agentxDoor = variant === "agentx";
      welcome = mountWelcome(
        root,
        variant === "live-observer" ? undefined : enterEditor,
        agentxDoor ? openGames : undefined,
        agentxDoor ? openBrowse : undefined,
        agentxDoor ? presentNestor : undefined,
        variant,
        agentxDoor ? { onAccept: acceptNestorProposal, onDiscard: discardNestorProposal } : undefined,
      );
      mountedWelcomeVariant = variant;
      if (variant === "live-observer") {
        welcome.observeLiveActivity(livePresence?.state().activity ?? null);
        welcome.observeMission(liveMission?.state() ?? null);
        return;
      }
      if (variant !== "agentx") return;
      const nestorState = nestor?.state();
      const current = nestorState?.presentation;
      // Returning from the editor should keep the last demonstration's explanation beside
      // the still-inspectable scene change. A freshly recomposed showroom resets below.
      if (current?.topic || current?.error) welcome.present(current);
      // A proposal survives a front-door remount, because the person never answered it. It is
      // redrawn with freshly evaluated staleness: the round trip they just took is exactly the
      // kind of thing that moves the revision out from under it.
      if (nestorState?.proposal) welcome.showProposal(nestorState.proposal, nestorState.proposalStale);
    };
    const focusFrontDoor = (): void => {
      queueMicrotask(() => document.querySelector<HTMLButtonElement>(".gx-go-editor")?.focus());
    };
    const syncFrontDoor = (): void => {
      if (host.mode === "editor" || !document.querySelector(".gx-welcome")) return;
      if (desiredWelcomeVariant() !== mountedWelcomeVariant) mountFrontDoor();
    };
    // Rebuild the front door from scratch. Playing a level REPLACES the world, so coming back
    // cannot just mean un-hiding chrome — the showroom's entities are gone and its host-mounted
    // set was torn down with them. Recomposing is the honest "back", and it is cheap because the
    // showroom is ordinary API calls rather than a retained scene.
    const restoreShowroom = (showWelcome = true): void => {
      if (nestorBlockedByLiveSession()) {
        void reassertLiveAuthority?.();
        syncFrontDoor();
        return;
      }
      // Callers can reach here with a welcome card already up (exitEditor mounts one);
      // recomposing must not stack a second card on top of it.
      restoreShowroomOnEditorExit = false;
      welcome?.dispose();
      welcome = null;
      composeShowroom(host.api);
      nestor?.reset();
      host.applyEnvironment();
      showroomEnvironment?.();
      showroomEnvironment = mountShowroomEnvironment(host.scene, host.renderer);
      host.resetFraming();
      requestShowroomInteraction(showWelcome);
      if (showWelcome) mountFrontDoor();
    };
    // A composed course may replace the world before a later asynchronous asset step fails.
    // Pause across the whole transaction and restore the showroom background (but keep the
    // Games shelf open with its actionable error) on any rejection.
    const loadComposedGame = async (load: () => void | Promise<void>): Promise<void> => {
      assertLocalWorldAuthority();
      host.api.pause(true);
      try {
        await load();
        if (nestorBlockedByLiveSession()) {
          throw new Error("The live session attached while that game was loading");
        }
      } catch (error) {
        if (nestorBlockedByLiveSession()) {
          await reassertLiveAuthority?.();
        } else {
          restoreShowroom(false);
        }
        throw error;
      } finally {
        host.api.pause(false);
      }
    };
    // Chrome only — for backing out of an overlay that never touched the world. The welcome
    // card disposes itself the moment a destination is clicked, so whoever dismisses that
    // destination must put it back or the front door is a dead end.
    const remountFrontDoor = (): void => {
      activeShelf = null;
      requestShowroomInteraction(true);
      mountFrontDoor();
      focusFrontDoor();
    };
    const openGamesShelf = (showArchiveCup = false): void => {
      if (nestorBlockedByLiveSession()) {
        mountFrontDoor();
        return;
      }
      requestShowroomInteraction(false);
      void import("./games-shelf").then(({ mountGamesShelf }) => {
        if (nestorBlockedByLiveSession()) {
          requestShowroomInteraction(true);
          mountFrontDoor();
          return;
        }
        const composed = [
          // Archive courses composed as whole scenes rather than grid levels. Same deal as
          // the garage row in Browse: main.ts supplies them because composing needs the host.
            {
              id: "archive-level3-v2",
              label: "Level 3: Alien Catwalks",
              meta: "exact 20×19 ASCII  ·  178 raised platforms  ·  20 checkpoints  ·  3 laps",
              play: () => loadComposedGame(async () => {
                const { composeArchiveLevel3, frameArchiveLevel3 } = await import("./archive-level3-scene");
                assertLocalWorldAuthority();
                const result = composeArchiveLevel3(host.api);
                if (!result.ok) throw new Error(result.error ?? "Could not compose Archive Level 3");
                host.applyEnvironment();
                frameArchiveLevel3(host);
              }),
            },
            {
              id: "archive-great-slide",
              label: "Great Slide: Gravity Run",
              meta: "exact recovered mesh  ·  2 checkpoints  ·  modern adapted gameplay",
              play: () => loadComposedGame(async () => {
                  const loaded = host.api.loadStarter("archive-great-slide");
                  if (!loaded.ok) throw new Error(loaded.error ?? "Could not load Great Slide");
                  host.applyEnvironment();
                  await waitForExactCollider(host.api, "great-slide-terrain");
              }),
            },
            {
              id: "archive-suzanne-machinery",
              label: "Suzanne Machinery Run",
              meta: "8 exact recovered meshes  ·  3 moving obstacles  ·  12-point archive route",
              play: () => loadComposedGame(async () => {
                const { composeArchiveSuzanneMachinery, frameArchiveSuzanneMachinery } = await import("./archive-suzanne-machinery-scene");
                assertLocalWorldAuthority();
                const result = composeArchiveSuzanneMachinery(host.api);
                if (!result.ok) throw new Error(result.error ?? "Could not compose Suzanne Machinery Run");
                host.applyEnvironment();
                frameArchiveSuzanneMachinery(host);
                await waitForExactCollider(host.api, "suzanne-machinery-level");
              }),
            },
            {
              id: "archive-suzanne1",
              label: "Suzanne 1: The Pushable Maze",
              meta: "authored 40×40 arena  ·  208 dynamic walls  ·  3 pistons  ·  line gates  ·  3 laps",
              play: () => loadComposedGame(async () => {
                const { composeSuzanne1, frameSuzanne1 } = await import("./archive-suzanne1-scene");
                assertLocalWorldAuthority();
                const result = composeSuzanne1(host.api);
                if (!result.ok) throw new Error(result.error ?? "Could not compose Suzanne 1");
                host.applyEnvironment();
                frameSuzanne1(host);
              }),
            },
            {
              id: "archive-suzanne2",
              label: "Suzanne 2: Any Two Rings",
              meta: "authored 40×40 arena  ·  315 dynamic walls  ·  15 rings  ·  shipped any-two rule",
              play: () => loadComposedGame(async () => {
                const { composeSuzanne2, frameSuzanne2 } = await import("./archive-suzanne2-scene");
                assertLocalWorldAuthority();
                const result = composeSuzanne2(host.api);
                if (!result.ok) throw new Error(result.error ?? "Could not compose Suzanne 2");
                host.applyEnvironment();
                frameSuzanne2(host);
              }),
            },
            {
              id: "archive-map1",
              label: "Map 1: Gravity Descent",
              meta: "exact recovered mesh  ·  halfway gate  ·  adapted gravity run",
              play: () => loadComposedGame(async () => {
                const { composeArchiveMap1, frameArchiveMap1 } = await import("./archive-map1-scene");
                assertLocalWorldAuthority();
                const result = composeArchiveMap1(host.api);
                if (!result.ok) throw new Error(result.error ?? "Could not compose Map 1");
                host.applyEnvironment();
                frameArchiveMap1(host);
                await waitForExactCollider(host.api, "map1-terrain");
              }),
            },
            {
              id: "archive-level1-2011",
              label: "Level1 2011: The Long Canyon",
              meta: "largest recovered mesh, 1:1  ·  2 gates  ·  adapted canyon run",
              play: () => loadComposedGame(async () => {
                const { composeArchiveLevel12011, frameArchiveLevel12011 } = await import("./archive-level1-2011-scene");
                assertLocalWorldAuthority();
                const result = composeArchiveLevel12011(host.api);
                if (!result.ok) throw new Error(result.error ?? "Could not compose Level1 2011");
                host.applyEnvironment();
                frameArchiveLevel12011(host);
                await waitForExactCollider(host.api, "level1-terrain");
              }),
            },
            {
              id: "archive-skybox-spiral",
              label: "Skybox Spiral",
              meta: "archive course  ·  16 rings  ·  moving parts  ·  lostvalley sky",
              play: () => loadComposedGame(() => {
                const result = composeSkyboxSpiral(host.api);
                if (!result.ok) throw new Error(result.error ?? "Could not compose Skybox Spiral");
                host.applyEnvironment();
                frameSkyboxSpiral(host);
              }),
            },
            {
              id: "archive-world1",
              label: "World 1",
              meta: "recovered mesh world  ·  descend through both holes  ·  bloom + envelope",
              play: () => loadComposedGame(async () => {
                const { composeArchiveWorld1, frameArchiveWorld1 } = await import("./archive-world1-scene");
                assertLocalWorldAuthority();
                composeArchiveWorld1(host.api);
                host.applyEnvironment();
                frameArchiveWorld1(host);
              }),
            },
          ];

        const composedRound = (id: string, recordId: string = id): ArchiveCupCourse => {
          const course = composed.find((candidate) => candidate.id === id);
          if (!course) throw new Error(`Archive Cup course ${id} is not registered`);
          return {
            ...course,
            recordId,
            referenceMs: archiveReferenceMs(recordId),
            play: async () => {
              resumeArchiveCup = true;
              try {
                await course.play();
              } catch (error) {
                resumeArchiveCup = false;
                throw error;
              }
            },
          };
        };
        const gridRound = (id: string, label: string, meta: string): ArchiveCupCourse => ({
          id,
          recordId: id,
          label,
          meta,
          referenceMs: archiveReferenceMs(id),
          play: () => {
            resumeArchiveCup = true;
            const result = host.api.levels.play(id);
            if (!result.ok) {
              resumeArchiveCup = false;
              throw new Error(result.error ?? `Could not play ${label}`);
            }
          },
        });
        const archiveCup: ArchiveCupCourse[] = [
          gridRound("archive-ballz-level1", "Level 1: Alien Landing", "Alien floor · 3 laps · recovered ScoreBest"),
          gridRound("archive-ballz-level2", "Level 2: Checkerboard Crowd", "Checkerboard · wandering crowd · recovered ScoreBest"),
          composedRound("archive-level3-v2"),
          composedRound("archive-great-slide"),
          composedRound("archive-map1", "graphysx-archive-map1"),
          composedRound("archive-level1-2011", "graphysx-archive-level1-2011"),
          composedRound("archive-suzanne-machinery", "graphysx-archive-suzanne-machinery"),
          composedRound("archive-suzanne1"),
          composedRound("archive-suzanne2"),
        ];

        activeShelf = mountGamesShelf(root, {
          api: host.api,
          composed,
          archiveCup,
          canNavigate: () => !nestorBlockedByLiveSession(),
          openArchiveCup: showArchiveCup,
          // The level is already materialised by the time this fires; the host has switched to
          // play mode on its own. All that is left is taking the showroom's set down so a
          // course is not sitting inside the showroom's hills.
          onPlay: () => {
            activeShelf = null;
            showroomEnvironment?.();
            showroomEnvironment = null;
          },
          onClose: () => remountFrontDoor(),
        });
      });
    };
    const openGames = (): void => openGamesShelf(false);
    const openBrowse = (): void => {
      if (nestorBlockedByLiveSession()) {
        mountFrontDoor();
        return;
      }
      requestShowroomInteraction(false);
      void import("./browse-shelf").then(({ mountBrowseShelf }) => {
        if (nestorBlockedByLiveSession()) {
          requestShowroomInteraction(true);
          mountFrontDoor();
          return;
        }
        activeShelf = mountBrowseShelf(root, {
          api: host.api,
          canNavigate: () => !nestorBlockedByLiveSession(),
          featuredStarter: {
            id: "archive-great-slide",
            eyebrow: "SCENE-NATIVE PHYSICS",
            badges: ["Exact mesh", "Static trimesh", "Modern gravity run"],
          },
          // The recovered vehicle garage is composed, not a starter definition, so it comes in
          // as a composed row. main.ts supplies it because framing needs the host, which the
          // shelf deliberately does not have.
          composed: [
            {
              id: "archive-day-night-rig",
              label: "Archive Day / Night Observatory",
              summary: "The recovered atmosphere equations driving two scene-authored sky and HDRI looks over an editable celestial instrument.",
              meta: "12-second cycle  ·  recovered curves  ·  BallZ18 Clear Sky ↔ NightSky",
              open: async () => {
                const { composeArchiveDayNight, frameArchiveDayNight } = await import("./archive-day-night-scene");
                if (nestorBlockedByLiveSession()) return;
                showroomEnvironment?.();
                showroomEnvironment = null;
                const result = composeArchiveDayNight(host.api);
                if (!result.ok) throw new Error(result.error ?? "Could not compose Archive Day / Night Observatory");
                host.applyEnvironment();
                frameArchiveDayNight(host);
                enterBrowsedEditor();
              },
            },
            {
              id: "archive-meshlight-lab",
              label: "Archive meshlight.shade Lab",
              summary: "The recovered parallax, Lyon-specular and diffuse-floor equations beside the platform material reference, using Room 2's exact DDS maps.",
              meta: "source HLSL vendored  ·  selectable v2 material  ·  shadow-kernel adaptation disclosed",
              open: async () => {
                const { composeArchiveMeshlight, frameArchiveMeshlight } = await import("./archive-meshlight-scene");
                if (nestorBlockedByLiveSession()) return;
                showroomEnvironment?.();
                showroomEnvironment = null;
                const result = composeArchiveMeshlight(host.api);
                if (!result.ok) throw new Error(result.error ?? "Could not compose Archive meshlight.shade Lab");
                host.applyEnvironment();
                frameArchiveMeshlight(host);
                enterBrowsedEditor();
              },
            },
            {
              id: "archive-ppl-lab",
              label: "Archive ppl.shade Ring Lab",
              summary: "The recovered ZRing sphere binding with its exact normal/height map, source parallax default and active BallZ tuning.",
              meta: "source HLSL + normal vendored  ·  selectable v2 material  ·  active Anneaux binding",
              open: async () => {
                const { composeArchivePpl, frameArchivePpl } = await import("./archive-ppl-scene");
                if (nestorBlockedByLiveSession()) return;
                showroomEnvironment?.();
                showroomEnvironment = null;
                const result = composeArchivePpl(host.api);
                if (!result.ok) throw new Error(result.error ?? "Could not compose Archive ppl.shade Ring Lab");
                host.applyEnvironment();
                frameArchivePpl(host);
                enterBrowsedEditor();
              },
            },
            // The recovered Nature Lab playgrounds. They open in the editor like any browsed
            // scene, so their simulation vocabulary is selectable and editable.
            // The recovered Voie Lactee vignette. Same shape as the playgrounds: it opens in the
            // editor like any browsed scene.
            // The recovered Math Game screen, built on the `formula-field` entity type.
            // The recovered Maison massing model.
            ...archiveBuildingBrowseRows(host.api, () => {
              showroomEnvironment?.();
              showroomEnvironment = null;
              host.applyEnvironment();
              enterBrowsedEditor();
            }),
            ...archiveMathBrowseRows(host.api, () => {
              showroomEnvironment?.();
              showroomEnvironment = null;
              host.applyEnvironment();
              enterBrowsedEditor();
            }),
            ...archiveMilkyWayBrowseRows(host.api, () => {
              showroomEnvironment?.();
              showroomEnvironment = null;
              host.applyEnvironment();
              enterBrowsedEditor();
            }),
            ...archivePlaygroundBrowseRows(host.api, () => {
              showroomEnvironment?.();
              showroomEnvironment = null;
              host.applyEnvironment();
              enterBrowsedEditor();
            }),
            {
              id: "archive-garage",
              label: "Archive Garage",
              summary: "The recovered Impreza and Cobra on turntables, with the Piste Ovale as a table model.",
              meta: "25 entities  ·  3 recovered meshes",
              open: async () => {
                const { composeArchiveVehicles, frameArchiveVehicles } = await import("./archive-vehicles-scene");
                if (nestorBlockedByLiveSession()) return;
                showroomEnvironment?.();
                showroomEnvironment = null;
                composeArchiveVehicles(host.api);
                host.applyEnvironment();
                frameArchiveVehicles(host);
                enterBrowsedEditor();
              },
            },
            {
              id: "surfaces-showcase",
              label: "Generative Surfaces",
              summary: "Live Canvas2D sketches — waveform, grid-pulse and plasma — running on in-world screens, a billboard and a curved display, under bloom.",
              meta: "6 entities  ·  5 live surfaces  ·  one shared loop",
              open: async () => {
                const { composeGenerativeSurfaces, frameGenerativeSurfaces } = await import("./surfaces-showcase");
                if (nestorBlockedByLiveSession()) return;
                showroomEnvironment?.();
                showroomEnvironment = null;
                composeGenerativeSurfaces(host.api);
                host.applyEnvironment();
                frameGenerativeSurfaces(host);
                enterBrowsedEditor();
              },
            },
          ],
          // A starter replaces the world, so take the showroom's host-mounted set down with it,
          // then open the loaded scene in the editor — Browse is "load a scene to work on it".
          onOpen: () => {
            activeShelf = null;
            showroomEnvironment?.();
            showroomEnvironment = null;
            host.frameWorld();
            enterBrowsedEditor();
          },
          onClose: () => remountFrontDoor(),
        });
      });
    };
    const host = new PlatformHost(root, {
      autoOrbit: !editorFirst,
      editorVisible: editorFirst,
      // The showroom is a composed set, not an overview of a demo world: frame it closer
      // and slightly off-axis so the kinetic plinth reads and the sky stays in shot.
      // Framed for depth rather than for coverage: close enough that the foreground trees
      // crop and loom, high enough to see over the plinth to the lake and the far ridges, and
      // aimed slightly past the CubX assembly so the flock and the shoreline occupy the upper
      // two thirds instead of a flat horizon band.
      framing: editorFirst ? undefined : { position: [9, 12, 22], target: [-0.5, 3.4, -5] },
      // The entry move belongs to the front door only: arriving in the editor or via a
      // screenshot harness should put you where you asked to be, immediately. `?intro=0`
      // opts out, which is how smoke-showroom measures the idle orbit without an intro
      // moving the camera underneath its probe.
      intro: !editorFirst && new URLSearchParams(window.location.search).get("intro") !== "0",
      // `?post=bloom` turns the demo post stack on for any route (bloom + SMAA through the
      // composer). Scenes whose documents carry their own `environment.post` keep their
      // tuning either way; this is the demo/preview switch, not a scene setting.
      post: params.get("post") === "bloom",
      // Leaving the editor restores the welcome overlay and hands the pointer back to the
      // showroom, so it is a place you can come back to rather than a one-way door.
      onExitEditor: editorFirst
        ? undefined
        : () => {
            if (restoreShowroomOnEditorExit) {
              restoreShowroom();
              focusFrontDoor();
              return;
            }
            requestShowroomInteraction(true);
            // Door selection is authoritative: center, live observer, or preserved scene.
            mountFrontDoor();
            focusFrontDoor();
          },
      // Leaving a game returns to the front door rather than to a chrome-less view of the level
      // you just finished, which would be a dead end with no way onward.
      onExitPlay: editorFirst
        ? undefined
        : () => {
            const returnToCup = resumeArchiveCup;
            resumeArchiveCup = false;
            restoreShowroom(!returnToCup);
            if (!returnToCup) focusFrontDoor();
            if (returnToCup) openGamesShelf(true);
          },
    });
    let welcomeSyncQueued = false;
    host.world.subscribeEvents(() => {
      if (welcomeSyncQueued) return;
      welcomeSyncQueued = true;
      queueMicrotask(() => {
        welcomeSyncQueued = false;
        syncFrontDoor();
      });
    });
    Object.assign(window, {
      __GRAPHYSX_HOST__: host,
      __GRAPHYSX__: host.api,
      __GRAPHYSX_AGENT_BRIDGE__: host.bridge,
      // Deterministic, concise game-facing hooks. The full authoring state remains on the API;
      // this projection is biased toward what a player or browser driver needs right now.
      render_game_to_text: () => JSON.stringify({
        coordinateSystem: "right-handed; +x east, +y up, -z north",
        mode: host.mode,
        world: host.api.state()?.world ?? null,
        paused: host.api.state()?.paused ?? false,
        joints: host.api.state()?.joints ?? [],
        run: host.api.rules.status(),
        archiveCup: getArchiveCupRuntimeState(),
        personalGhost: getPersonalGhostState(),
        nestor: host.api.query({ ids: ["showroom-nestor"] }).length > 0
          ? nestor?.state() ?? null : null,
        livePresence: livePresence?.state() ?? null,
        liveMission: liveMission?.state() ?? null,
        atmosphere: host.dayNightState,
        players: host.api.query({ tag: "player" }).map((entity) => ({
          id: entity.id,
          position: entity.position,
          velocity: entity.physics?.linearVelocity ?? null,
        })),
      }),
      advanceTime: (milliseconds: number) => {
        if (!Number.isFinite(milliseconds) || milliseconds < 0) {
          throw new RangeError("advanceTime requires non-negative milliseconds");
        }
        // Zero means zero. Positive sub-frame requests intentionally advance the runtime's
        // minimum 1/60 quantum, matching the public `api.step()` contract.
        if (milliseconds === 0) return { ok: true, revision: host.api.state()?.revision ?? 0, value: 0 };
        // Honour the product pause gate (notably while an exact collider is loading).
        // Explicit authoring tests can still call `api.step()` when they intend to override it.
        if (host.api.state()?.paused) return { ok: true, revision: host.api.state()?.revision ?? 0, value: 0 };
        return host.api.step(milliseconds / 1000);
      },
    });

    // Seed the recovered archive levels into the level library on every platform-host route,
    // not just when the Games shelf opens: they are content the whole app should know about, so
    // an agent on ?host=standalone finds them exactly as a visitor browsing Games does. The seed
    // is idempotent and never overwrites a level a visitor has edited.
    seedArchiveBallzLevels(host.api);
    // Provenance is a feature (§11) and the platform is agent-native (§7): what was recovered,
    // what was faithful vs inferred, and what was deliberately NOT revived are all discoverable
    // rather than buried in a source comment. An agent can read why a record was skipped.
    Object.assign(window, {
      __GRAPHYSX_ARCHIVE__: {
        levels: ARCHIVE_BALLZ_LEVELS,
        notRevived: ARCHIVE_BALLZ_NOT_REVIVED,
        buildings: ARCHIVE_BUILDINGS,
        buildingsNotRevived: ARCHIVE_BUILDINGS_NOT_REVIVED,
        buildBuilding: buildArchiveBuilding,
        composeBuilding: composeArchiveBuilding,
        math: ARCHIVE_MATH_SCENES,
        mathNotRevived: ARCHIVE_MATH_NOT_REVIVED,
        buildMathLab: buildArchiveMathLab,
        composeMathLab: composeArchiveMathLab,
        milkyway: ARCHIVE_MILKYWAY_SCENES,
        milkywayNotRevived: ARCHIVE_MILKYWAY_NOT_REVIVED,
        buildMilkyWay: buildArchiveMilkyWay,
        composeMilkyWay: composeArchiveMilkyWay,
        playgrounds: ARCHIVE_PLAYGROUNDS,
        playgroundsNotRevived: ARCHIVE_PLAYGROUNDS_NOT_REVIVED,
        buildPlayground: buildArchivePlayground,
        composePlayground: composeArchivePlayground,
        // The first §14.5 course port. Published so an agent (and the smoke) can compose
        // it directly, with its provenance beside it.
        composeSkyboxSpiral: () => composeSkyboxSpiral(host.api),
        // Suzanne 1 — the 40×40 ASCII arena as a composed scene (complement to the
        // machinery run: same family, different record). Lazy like World 1, so the 200 KB
        // decoded arena stays off the boot path until someone opens it.
        composeSuzanne1: () => import("./archive-suzanne1-scene").then(({ composeSuzanne1 }) => composeSuzanne1(host.api)),
        // Suzanne 2 — distinct authored arena and its source-shaped any-two-of-fifteen rule.
        composeSuzanne2: () => import("./archive-suzanne2-scene").then(({ composeSuzanne2, SUZANNE2_PROVENANCE }) => {
          const result = composeSuzanne2(host.api);
          return { ...result, provenance: SUZANNE2_PROVENANCE };
        }),
        // Level 3 — its exact M/r/$ catwalk alphabet, lower Alien02 floor and endpoint LINE
        // gates as a composed v2 race rather than a lossy modern-grid transcription.
        composeArchiveLevel3: () => import("./archive-level3-scene").then(({ composeArchiveLevel3, ARCHIVE_LEVEL3_PROVENANCE }) => {
          const result = composeArchiveLevel3(host.api);
          host.applyEnvironment();
          return { ...result, provenance: ARCHIVE_LEVEL3_PROVENANCE };
        }),
        // The archived atmosphere equations as ordinary scene vocabulary, with the image
        // endpoints and modern observatory adaptation disclosed beside the composer.
        composeArchiveDayNight: () => import("./archive-day-night-scene").then(({ composeArchiveDayNight, DAY_NIGHT_PROVENANCE }) => {
          const result = composeArchiveDayNight(host.api);
          host.applyEnvironment();
          return { ...result, provenance: DAY_NIGHT_PROVENANCE };
        }),
        composeArchiveMeshlight: () => import("./archive-meshlight-scene").then(({ composeArchiveMeshlight, MESHLIGHT_SCENE_PROVENANCE }) => {
          const result = composeArchiveMeshlight(host.api);
          host.applyEnvironment();
          return { ...result, provenance: MESHLIGHT_SCENE_PROVENANCE };
        }),
        composeArchivePpl: () => import("./archive-ppl-scene").then(({ composeArchivePpl, PPL_SCENE_PROVENANCE }) => {
          const result = composeArchivePpl(host.api);
          host.applyEnvironment();
          return { ...result, provenance: PPL_SCENE_PROVENANCE };
        }),
        // World 1 — the first true mesh-world port. Lazy, so the manifest's slab table
        // stays off the boot path until someone actually opens the world.
        composeArchiveWorld1: () => import("./archive-world1-scene").then(({ composeArchiveWorld1, WORLD1_PROVENANCE }) => {
          const result = composeArchiveWorld1(host.api);
          return { ...result, provenance: WORLD1_PROVENANCE };
        }),
        // Map 1 — exact recovered geometry wrapped in an explicitly adapted gravity run.
        composeArchiveMap1: () => import("./archive-map1-scene").then(({ composeArchiveMap1, MAP1_PROVENANCE }) => {
          const result = composeArchiveMap1(host.api);
          return { ...result, provenance: MAP1_PROVENANCE };
        }),
        // Level1 2011 — the largest recovered mesh at 1:1, gameplay explicitly adapted
        // because no archived runtime source loads it.
        composeArchiveLevel12011: () => import("./archive-level1-2011-scene").then(({ composeArchiveLevel12011, LEVEL1_2011_PROVENANCE }) => {
          const result = composeArchiveLevel12011(host.api);
          return { ...result, provenance: LEVEL1_2011_PROVENANCE };
        }),
        skyboxSpiralProvenance: SKYBOX_SPIRAL_PROVENANCE,
        toPlatformRows,
        seed: seedArchiveBallzLevels,
      },
    });
    if (!editorFirst) {
      composeShowroom(host.api);
      host.applyEnvironment();
      showroomEnvironment = mountShowroomEnvironment(host.scene, host.renderer);
      interaction = mountShowroomInteraction({
        renderer: host.renderer,
        camera: host.camera,
        scene: host.scene,
        world: host.world,
        api: host.api,
        onNestorTopic: presentNestor,
        // §5's click-to-focus. The host owns the camera and orbit controls, so it does the
        // easing; the interaction layer only decides what is worth looking at.
        focusOn: (point, radius, direction) => host.focusOn(point, radius, 1.5, 46, direction),
      });
      nestor = createNestorPresenter({
        api: host.api,
        focusEntity: (id) => interaction?.focusEntity(id, true) ?? false,
      });
      requestShowroomInteraction(true);
      Object.assign(window, { __GRAPHYSX_NESTOR__: nestor });
      mountFrontDoor();
    }

    // Mounted after the showroom composes so there is always something on screen, and only
    // when a store actually answers: the production deploy is static with no store behind
    // it, and a permanently offline panel on the front door would be noise.
    if (wantsStore) void Promise.all([import("./scene-store-client"), import("./scene-browser")]).then(
      async ([{ createSceneStoreClient }, { mountSceneBrowser }]) => {
        const client = createSceneStoreClient(storeUrl);
        try {
          await client.list();
        } catch {
          if (storeScene) console.warn(`[graphysx] no scene store at ${storeUrl}; staying in the showroom`);
          return;
        }
        // The same server fronts the media library. Pull its manifest now so imported
        // textures/models are registered before anyone opens the editor's library — the
        // refresh is idempotent and the editor re-pulls on demand anyway.
        void import("./agent-world-media").then(({ configureAgentWorldMedia }) => {
          configureAgentWorldMedia(storeUrl, client.token);
          void host.api.media.refresh();
        });
        // Best times, leaderboards and shared ghosts. Configured here and nowhere else:
        // until this runs the results client makes no request at all, which is what keeps a
        // storeless production visitor's console clean. `?actor=` names the player on the
        // board; without one they are anonymous-<n> rather than silently colliding with
        // every other anonymous player on the same board.
        void Promise.all([
          import("./results-client"),
          import("./leaderboard-panel"),
          import("./level-ghosts"),
        ]).then(([resultsClient, { buildLeaderboardPanel }, { createPersonalGhostSession }]) => {
          const player = params.get("actor") ?? randomPlayerName();
          resultsClient.configureResultsClient(storeUrl, client.token, player);
          // Exposed on the same footing as the scene browser and the live-session panel:
          // leaderboards are public read data, so an agent can ask for one, and a smoke can
          // drive the real code rather than guessing a hashed chunk filename. Both globals
          // exist only when a store answered — their absence IS the storeless contract.
          Object.assign(window, {
            __GRAPHYSX_RESULTS__: resultsClient,
            __GRAPHYSX_RESULTS_UI__: { buildLeaderboardPanel, createGhostSession: createPersonalGhostSession },
          });
        });
        const browser = mountSceneBrowser(root, {
          api: host.api,
          client,
          initialScene: liveSessionRequested ? null : storeScene,
          actor: "browser",
          onSceneOpened: () => {
            restoreShowroomOnEditorExit = true;
            // A stored scene replaces the showroom entirely: take down the host-mounted
            // showroom set, hand the pointer back, and apply the environment the incoming
            // document asked for. The welcome card is showroom copy and does not describe
            // whatever just loaded, so it goes too.
            showroomEnvironment?.();
            showroomEnvironment = null;
            welcome?.dispose();
            welcome = null;
            requestShowroomInteraction(true);
            host.applyEnvironment();
            host.frameWorld();
          },
          // Closing a stored scene is "back to the front door" — the exit that opening
          // took away. The standalone editor routes keep their world; the tab has simply
          // stopped following the store.
          onSceneClosed: () => {
            if (editorFirst) return;
            // When the editor is up its exit callback consumes the stored-scene return flag;
            // otherwise there is no callback to rebuild the showroom for us.
            if (host.mode === "editor") host.exitEditor();
            else restoreShowroom();
          },
        });
        if (liveSessionRequested) browser.setEnabled(false);
        Object.assign(window, { __GRAPHYSX_SCENE_BROWSER__: browser, __GRAPHYSX_SCENE_STORE__: { client, browser } });

        // Live sessions: identity, roles, presence and incremental operations on top of the
        // same store. Loaded only when one was asked for — the panel is meaningless without
        // a session, and the production deploy has no store behind it at all.
        const [
          { createLiveSessionClient, consumeInviteFromLocation },
          { mountLiveSessionPanel },
          { mountLiveMissionPanel },
          { createLiveAgentPresenceController },
          { createLiveMissionRuntime },
        ] = await Promise.all([
          import("./live-session-client"),
          import("./live-session-panel"),
          import("./live-mission-panel"),
          import("./live-agent-presence"),
          import("./live-mission-runtime"),
        ]);
        const invitation = consumeInviteFromLocation(window.location, window.history);
        const joiningSession = invitation?.sessionId ?? sessionParam;
        if (joiningSession) {
          const reflectLivePresence = (state: LiveAgentPresenceState): void => {
            if (mountedWelcomeVariant === "live-observer") welcome?.observeLiveActivity(state.activity);
          };
          const reflectLiveMission = (state: LiveMissionRuntimeState): void => {
            if (mountedWelcomeVariant === "live-observer") welcome?.observeMission(state);
          };
          livePresence = createLiveAgentPresenceController({
            runtime: host.world,
            subscribeFrame: host.subscribeFrame.bind(host),
            onState: reflectLivePresence,
          });
          liveMission = createLiveMissionRuntime({
            runtime: host.world,
            presence: livePresence,
            focusEntity: (id) => interaction?.focusEntity(id, true) ?? false,
            qualityProfile: () => host.qualityProfile.name,
            subscribeFrame: host.subscribeFrame.bind(host),
            onState: reflectLiveMission,
          });
          const liveClient = createLiveSessionClient({
            baseUrl: storeUrl,
            api: host.api,
            events: {
              onStatus: (status) => {
                panel?.setStatus(status);
                missionPanel?.setStatus(status);
                livePresence?.setSession(status.sessionId);
                livePresence?.setConnection(status.connection);
                liveMission?.setSession(status.sessionId);
                liveMission?.setConnection(status.connection);
                liveMission?.syncMissions(status.missions);
                const attached = status.sessionId !== null;
                browser.setEnabled(!attached);
                if (attached) {
                  dismissTransientShelf();
                  restoreShowroomOnEditorExit = false;
                  resumeArchiveCup = false;
                  // A join can resolve after someone entered Editor or Play. Switch surfaces
                  // without their ordinary exit callbacks, which would rebuild a local world.
                  if (host.mode !== "scene") host.setMode("scene");
                  requestShowroomInteraction(true);
                  // Entering Editor consumes the old door. A later public rejoin has no boot
                  // continuation to remount it, so attach itself must restore observer chrome.
                  if (!document.querySelector(".gx-welcome")) mountFrontDoor();
                  else queueMicrotask(syncFrontDoor);
                } else {
                  syncShowroomInteraction();
                  queueMicrotask(syncFrontDoor);
                }
              },
              onMembers: (members) => {
                livePresence?.syncMembers(members);
                liveMission?.syncMembers(members);
              },
              onOperation: (operation) => {
                panel?.recordOperation(operation);
                livePresence?.recordOperation(operation);
                liveMission?.recordOperation(operation);
              },
              onMissions: (missions) => liveMission?.syncMissions(missions),
              onMission: (event) => {
                liveMission?.recordEvent(event);
                // Catch-up events are cached while reconnecting. Announce only after the
                // terminal presence cut marks this session live and its projection valid.
                if (liveMission?.state().connection !== "live") return;
                const directorMessage = liveMission.state().director.message
                  ?? `${event.mission.title} is ${event.mission.status}`;
                missionPanel?.announce(`${directorMessage}. Mission ${event.mission.status}, server sequence ${event.seq}`);
              },
              onResync: (revision) => panel?.announce(`Resynced to revision ${revision}`),
              onError: (error) => console.warn(`[graphysx] live session: ${error.message}`),
            },
          });
          nestorBlockedByLiveSession = () => liveClient.status.sessionId !== null;
          reassertLiveAuthority = () => liveClient.resync();
          const panel = mountLiveSessionPanel(root, liveClient);
          const missionPanel = mountLiveMissionPanel(root, liveClient, {
            focusMission: (missionId) => { liveMission?.focusMission(missionId); },
            inspectEvidence: (_missionId, evidenceId) => { liveMission?.inspectEvidence(evidenceId); },
          });
          Object.assign(window, {
            __GRAPHYSX_LIVE_SESSION__: liveClient,
            __GRAPHYSX_LIVE_PANEL__: panel,
            __GRAPHYSX_LIVE_MISSION_PANEL__: missionPanel,
            __GRAPHYSX_LIVE_PRESENCE__: livePresence,
            __GRAPHYSX_LIVE_MISSION__: liveMission,
          });
          const actorId = params.get("actor") ?? randomPlayerName();
          try {
            if (invitation) {
              await liveClient.join(invitation.sessionId, invitation.code, { id: actorId, label: actorId, kind: "human" });
            }
            // Without an invitation the tab has no credential of its own; `?session=` alone
            // is the owner's own route, and the owner attaches with the credential it was
            // issued at creation. A tab with neither stays in the showroom rather than
            // silently pretending to be in a session.
            const attached = liveClient.status.sessionId !== null;
            browser.setEnabled(!attached);
            if (attached) {
              dismissTransientShelf();
              restoreShowroomOnEditorExit = false;
              resumeArchiveCup = false;
              if (host.mode !== "scene") host.setMode("scene");
              requestShowroomInteraction(true);
              showroomEnvironment?.();
              showroomEnvironment = null;
              welcome?.dispose();
              welcome = null;
              host.applyEnvironment();
              mountFrontDoor();
            } else {
              syncShowroomInteraction();
            }
          } catch (error) {
            // A public rejoin can supersede the boot invitation while its request is in
            // flight. That old promise must not leave (and thereby revoke) the newer claim.
            if ((error as { code?: unknown } | null)?.code === "session-authority-revoked") return;
            await liveClient.leave();
            browser.setEnabled(true);
            syncShowroomInteraction();
            if (!welcome && host.mode === "scene") mountFrontDoor();
            panel.announce(`Could not join the live session: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      },
    );
  });
}
