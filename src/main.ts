const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("App root not found.");
}

const params = new URLSearchParams(window.location.search);
const mode = params.get("host");

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
  ]).then(([{ PlatformHost }, { composeShowroom, mountWelcome }, { mountShowroomEnvironment }]) => {
    const host = new PlatformHost(root, {
      autoOrbit: !editorFirst,
      editorVisible: editorFirst,
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
      mountWelcome(root, () => host.enterEditor());
    }
  });
}
