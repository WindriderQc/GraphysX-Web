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
import { composeSkyboxSpiral, SKYBOX_SPIRAL_PROVENANCE } from "./archive-skybox-spiral";
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
const storeUrl = explicitStore ?? "http://localhost:8788";
// Probing a store that isn't there costs a `net::ERR_CONNECTION_REFUSED` in the console —
// Chromium logs the failed request itself, so no try/catch can swallow it. The production
// deploy is static with no store behind it, so every visitor would see that error. Probe
// only when a store was actually asked for, or in dev where one is plausibly running.
const wantsStore = Boolean(storeScene || explicitStore || import.meta.env.DEV);

if (mode === "legacy") {
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
  ]).then(([{ PlatformHost }, { composeShowroom }, { mountShowroomEnvironment }, { mountWelcome }, { mountShowroomInteraction }]) => {
    // Declared up front so the host's exit callback can re-arm it; assigned once the
    // showroom is composed below.
    let interaction: ReturnType<typeof mountShowroomInteraction> | null = null;
    // The showroom's terrain, water and key light are host-mounted objects rather than scene
    // entities, so loading a stored scene replaces the entities and leaves this behind —
    // a ported village would otherwise sit inside the showroom's hills. Kept so opening a
    // scene can take the showroom down with it.
    let showroomEnvironment: (() => void) | null = null;
    const enterEditor = (): void => {
      interaction?.setEnabled(false);
      void host.enterEditor();
    };
    // Rebuild the front door from scratch. Playing a level REPLACES the world, so coming back
    // cannot just mean un-hiding chrome — the showroom's entities are gone and its host-mounted
    // set was torn down with them. Recomposing is the honest "back", and it is cheap because the
    // showroom is ordinary API calls rather than a retained scene.
    const restoreShowroom = (): void => {
      // Callers can reach here with a welcome card already up (exitEditor mounts one);
      // recomposing must not stack a second card on top of it.
      document.querySelector(".gx-welcome")?.remove();
      composeShowroom(host.api);
      host.applyEnvironment();
      showroomEnvironment?.();
      showroomEnvironment = mountShowroomEnvironment(host.scene, host.renderer);
      interaction?.setEnabled(true);
      mountWelcome(root, enterEditor, openGames, openBrowse);
    };
    // Chrome only — for backing out of an overlay that never touched the world. The welcome
    // card disposes itself the moment a destination is clicked, so whoever dismisses that
    // destination must put it back or the front door is a dead end.
    const remountFrontDoor = (): void => {
      document.querySelector(".gx-welcome")?.remove();
      interaction?.setEnabled(true);
      mountWelcome(root, enterEditor, openGames, openBrowse);
    };
    const openGames = (): void => {
      interaction?.setEnabled(false);
      void import("./games-shelf").then(({ mountGamesShelf }) => {
        mountGamesShelf(root, {
          api: host.api,
          // Archive courses composed as whole scenes rather than grid levels. Same deal as
          // the garage row in Browse: main.ts supplies them because composing needs the host.
          composed: [
            {
              id: "archive-skybox-spiral",
              label: "Skybox Spiral",
              meta: "archive course  ·  16 rings  ·  moving parts  ·  lostvalley sky",
              play: () => {
                showroomEnvironment?.();
                showroomEnvironment = null;
                composeSkyboxSpiral(host.api);
                host.applyEnvironment();
              },
            },
            {
              id: "archive-world1",
              label: "World 1",
              meta: "recovered mesh world  ·  descend through both holes  ·  bloom + envelope",
              play: async () => {
                const { composeArchiveWorld1, frameArchiveWorld1 } = await import("./archive-world1-scene");
                showroomEnvironment?.();
                showroomEnvironment = null;
                composeArchiveWorld1(host.api);
                host.applyEnvironment();
                frameArchiveWorld1(host);
              },
            },
          ],
          // The level is already materialised by the time this fires; the host has switched to
          // play mode on its own. All that is left is taking the showroom's set down so a
          // course is not sitting inside the showroom's hills.
          onPlay: () => {
            showroomEnvironment?.();
            showroomEnvironment = null;
          },
          onClose: remountFrontDoor,
        });
      });
    };
    const openBrowse = (): void => {
      interaction?.setEnabled(false);
      void import("./browse-shelf").then(({ mountBrowseShelf }) => {
        mountBrowseShelf(root, {
          api: host.api,
          // The recovered vehicle garage is composed, not a starter definition, so it comes in
          // as a composed row. main.ts supplies it because framing needs the host, which the
          // shelf deliberately does not have.
          composed: [
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
              void host.enterEditor();
            }),
            ...archiveMathBrowseRows(host.api, () => {
              showroomEnvironment?.();
              showroomEnvironment = null;
              host.applyEnvironment();
              void host.enterEditor();
            }),
            ...archiveMilkyWayBrowseRows(host.api, () => {
              showroomEnvironment?.();
              showroomEnvironment = null;
              host.applyEnvironment();
              void host.enterEditor();
            }),
            ...archivePlaygroundBrowseRows(host.api, () => {
              showroomEnvironment?.();
              showroomEnvironment = null;
              host.applyEnvironment();
              void host.enterEditor();
            }),
            {
              id: "archive-garage",
              label: "Archive Garage",
              summary: "The recovered Impreza and Cobra on turntables, with the Piste Ovale as a table model.",
              meta: "25 entities  ·  3 recovered meshes",
              open: async () => {
                const { composeArchiveVehicles, frameArchiveVehicles } = await import("./archive-vehicles-scene");
                showroomEnvironment?.();
                showroomEnvironment = null;
                composeArchiveVehicles(host.api);
                host.applyEnvironment();
                frameArchiveVehicles(host);
              },
            },
          ],
          // A starter replaces the world, so take the showroom's host-mounted set down with it,
          // then open the loaded scene in the editor — Browse is "load a scene to work on it".
          onOpen: () => {
            showroomEnvironment?.();
            showroomEnvironment = null;
            void host.enterEditor();
          },
          onClose: remountFrontDoor,
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
      // Leaving the editor restores the welcome overlay and hands the pointer back to the
      // showroom, so it is a place you can come back to rather than a one-way door.
      onExitEditor: editorFirst
        ? undefined
        : () => {
            interaction?.setEnabled(true);
            mountWelcome(root, enterEditor, openGames, openBrowse);
          },
      // Leaving a game returns to the front door rather than to a chrome-less view of the level
      // you just finished, which would be a dead end with no way onward.
      onExitPlay: editorFirst ? undefined : () => restoreShowroom(),
    });
    Object.assign(window, {
      __GRAPHYSX_HOST__: host,
      __GRAPHYSX__: host.api,
      __GRAPHYSX_AGENT_BRIDGE__: host.bridge,
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
        // World 1 — the first true mesh-world port. Lazy, so the manifest's slab table
        // stays off the boot path until someone actually opens the world.
        composeArchiveWorld1: () => import("./archive-world1-scene").then(({ composeArchiveWorld1, WORLD1_PROVENANCE }) => {
          const result = composeArchiveWorld1(host.api);
          return { ...result, provenance: WORLD1_PROVENANCE };
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
        // §5's click-to-focus. The host owns the camera and orbit controls, so it does the
        // easing; the interaction layer only decides what is worth looking at.
        focusOn: (point, radius) => host.focusOn(point, radius),
      });
      mountWelcome(root, enterEditor, openGames, openBrowse);
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
          configureAgentWorldMedia(storeUrl);
          void host.api.media.refresh();
        });
        const browser = mountSceneBrowser(root, {
          api: host.api,
          client,
          initialScene: storeScene,
          actor: "browser",
          onSceneOpened: () => {
            // A stored scene replaces the showroom entirely: take down the host-mounted
            // showroom set, hand the pointer back, and apply the environment the incoming
            // document asked for. The welcome card is showroom copy and does not describe
            // whatever just loaded, so it goes too.
            showroomEnvironment?.();
            showroomEnvironment = null;
            document.querySelector(".gx-welcome")?.remove();
            interaction?.setEnabled(true);
            host.applyEnvironment();
          },
          // Closing a stored scene is "back to the front door" — the exit that opening
          // took away. The standalone editor routes keep their world; the tab has simply
          // stopped following the store.
          onSceneClosed: () => {
            if (editorFirst) return;
            // Hides the editor if it was up; its exit callback mounts a welcome card,
            // which restoreShowroom replaces along with the world.
            host.exitEditor();
            restoreShowroom();
          },
        });
        Object.assign(window, { __GRAPHYSX_SCENE_BROWSER__: browser, __GRAPHYSX_SCENE_STORE__: { client, browser } });
      },
    );
  });
}
