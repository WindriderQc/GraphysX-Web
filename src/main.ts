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
const storeUrl = params.get("store") ?? "http://localhost:8788";

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
    const enterEditor = (): void => {
      interaction?.setEnabled(false);
      void host.enterEditor();
    };
    const host = new PlatformHost(root, {
      autoOrbit: !editorFirst,
      editorVisible: editorFirst,
      // The showroom is a composed set, not an overview of a demo world: frame it closer
      // and slightly off-axis so the kinetic plinth reads and the sky stays in shot.
      framing: editorFirst ? undefined : { position: [6.5, 8.5, 19], target: [0, 2.6, 1.8] },
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
      mountShowroomEnvironment(host.scene, host.renderer);
      interaction = mountShowroomInteraction({
        renderer: host.renderer,
        camera: host.camera,
        scene: host.scene,
        world: host.world,
        api: host.api,
      });
      mountWelcome(root, enterEditor);
    }

    if (storeScene) {
      // Loaded after the showroom composes so there is always something on screen: if the
      // store is down or the scene is missing, you get the showroom and an error in the
      // console rather than an empty world.
      void import("./scene-store-client").then(({ createSceneStoreClient, connectSceneStore }) => {
        const client = createSceneStoreClient(storeUrl);
        const session = connectSceneStore({
          api: host.api,
          client,
          name: storeScene,
          onPulled: (record) => {
            interaction?.setEnabled(true);
            host.applyEnvironment();
            console.info(`[graphysx] pulled scene "${record.name}" at revision ${record.revision}`);
          },
          onError: (error) => console.warn("[graphysx] scene store poll failed:", error),
        });
        Object.assign(window, { __GRAPHYSX_SCENE_STORE__: { client, session } });
        void session.pull().catch((error) => {
          console.warn(`[graphysx] could not open scene "${storeScene}":`, error);
        });
      });
    }
  });
}
