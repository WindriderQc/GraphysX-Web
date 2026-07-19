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
      // Leaving the editor restores the welcome overlay and hands the pointer back to the
      // showroom, so it is a place you can come back to rather than a one-way door.
      onExitEditor: editorFirst
        ? undefined
        : () => {
            interaction?.setEnabled(true);
            mountWelcome(root, enterEditor);
          },
    });
    Object.assign(window, {
      __GRAPHYSX_HOST__: host,
      __GRAPHYSX__: host.api,
      __GRAPHYSX_AGENT_BRIDGE__: host.bridge,
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
      mountWelcome(root, enterEditor);
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
        });
        Object.assign(window, { __GRAPHYSX_SCENE_BROWSER__: browser, __GRAPHYSX_SCENE_STORE__: { client, browser } });
      },
    );
  });
}
