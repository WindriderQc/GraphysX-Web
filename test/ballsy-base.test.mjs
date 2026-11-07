import { test } from "node:test";
import assert from "node:assert/strict";
import { browserModuleUrl, importBrowserModule } from "./support/import-browser-module.mjs";

const { createVolcano } = await importBrowserModule(new URL("../src/ballsy-volcano.ts", import.meta.url));

for (const base of ["/", "/shovel/", "/nested/"]) for (const preview of [true, false]) {
  test(`all Ballsy relay calls respect build base ${base} in ${preview ? "preview" : "production"}`, async () => {
    const originalFetch = globalThis.fetch, originalWindow = globalThis.window;
    const calls = [];
    const snapshot = {
      roundId: "round-aaaaaaaaaaaaaaaa", phase: "racing", ally: 0, volcano: createVolcano("help"),
      players: [0, 1].map((i) => ({ id: `ballsy-p${i + 1}`, position: [-4, 0.7, 8 + i * 2], lap: 0, finished: false })),
    };
    globalThis.window = { location: new URL(`https://graphysx.example${base}ballsy.html`), setTimeout: () => 0, clearTimeout: () => {} };
    globalThis.fetch = async (url, options = {}) => {
      const target = new URL(url, window.location.href);
      assert.equal(target.origin, window.location.origin, "every discovery and game request stays on the page's origin");
      assert.equal(options.redirect, "error", "discovery and credentials cannot follow a redirect elsewhere");
      calls.push(target.pathname);
      if (options.method === "HEAD") return new Response(null, { headers: preview ? { "X-Ballsy-Relay": "1" } : {} });
      const action = target.pathname.split("/").at(-1);
      if (action === "status") return Response.json({ schema: "ballsy-room/v1" });
      const data = action === "create" ? { roomId: "room", hostToken: "host", code: "123456" }
        : action === "join" ? { roomId: "room", guestToken: "guest" }
          : action === "host" ? { commands: [], guestConnected: true }
            : action === "view" ? { snapshot, hostLive: true } : { accepted: true };
      return Response.json(data);
    };
    try {
      // Substitute the same build-time constant Vite replaces, then execute the real module.
      const moduleUrl = browserModuleUrl(new URL("../src/ballsy-link.ts", import.meta.url));
      const source = Buffer.from(moduleUrl.split(",")[1], "base64").toString("utf8")
        .replace(/import\.meta\.env\??\.BASE_URL/g, JSON.stringify(base));
      assert.ok(!source.includes("import.meta.env"), "the fixture must replace the actual Vite build constant");
      const { createBallsyHostLink, createBallsyGuestLink } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}#${preview ? "preview" : "production"}`);
      const host = createBallsyHostLink({ snapshot: () => snapshot, command: () => {}, presence: () => {} });
      const guest = createBallsyGuestLink(() => {});
      await host.open();
      await guest.join("123456");
      assert.equal(guest.state().live, true);
      guest.send({ type: "release" });
      await new Promise((resolve) => setImmediate(resolve));
      guest.leave();
      host.dispose();
      const relay = `${base}${preview ? "" : "store/"}api/ballsy/`;
      assert.deepEqual(calls, [`${base}ballsy.html`, ...["status", "create", "room/host", "join", "room/view", "room/command", "room/leave", "room/close"]
        .map((route) => `${relay}${route}`)]);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalWindow === undefined) delete globalThis.window;
      else globalThis.window = originalWindow;
    }
  });
}
