import { test } from "node:test";
import assert from "node:assert/strict";
import { browserModuleUrl, importBrowserModule } from "./support/import-browser-module.mjs";

const { createVolcano } = await importBrowserModule(new URL("../src/ballsy-volcano.ts", import.meta.url));

for (const base of ["/", "/shovel/"]) {
  test(`all Ballsy relay calls respect build base ${base}`, async () => {
    const originalFetch = globalThis.fetch, originalWindow = globalThis.window;
    const calls = [];
    const snapshot = {
      roundId: "round-aaaaaaaaaaaaaaaa", phase: "racing", ally: 0, volcano: createVolcano("help"),
      players: [0, 1].map((i) => ({ id: `ballsy-p${i + 1}`, position: [-4, 0.7, 8 + i * 2], lap: 0, finished: false })),
    };
    globalThis.window = { setTimeout: () => 0, clearTimeout: () => {} };
    globalThis.fetch = async (url) => {
      calls.push(url);
      const action = url.split("/").at(-1);
      const data = action === "create" ? { roomId: "room", hostToken: "host", code: "123456" }
        : action === "join" ? { roomId: "room", guestToken: "guest" }
          : action === "host" ? { commands: [], guestConnected: true }
            : action === "view" ? { snapshot, hostLive: true } : { accepted: true };
      return { ok: true, json: async () => data };
    };
    try {
      // Substitute the same build-time constant Vite replaces, then execute the real module.
      const moduleUrl = browserModuleUrl(new URL("../src/ballsy-link.ts", import.meta.url));
      const source = Buffer.from(moduleUrl.split(",")[1], "base64").toString("utf8")
        .replaceAll("import.meta.env.BASE_URL", JSON.stringify(base));
      const { createBallsyHostLink, createBallsyGuestLink } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
      const host = createBallsyHostLink({ snapshot: () => snapshot, command: () => {}, presence: () => {} });
      const guest = createBallsyGuestLink(() => {});
      await host.open();
      await guest.join("123456");
      assert.equal(guest.state().live, true);
      guest.send({ type: "release" });
      await new Promise((resolve) => setImmediate(resolve));
      guest.leave();
      host.dispose();
      assert.deepEqual(calls, ["create", "room/host", "join", "room/view", "room/command", "room/leave", "room/close"]
        .map((route) => `${base}api/ballsy/${route}`));
    } finally {
      globalThis.fetch = originalFetch;
      if (originalWindow === undefined) delete globalThis.window;
      else globalThis.window = originalWindow;
    }
  });
}
