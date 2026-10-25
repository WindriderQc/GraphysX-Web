import { test } from "node:test";
import assert from "node:assert/strict";
import { importBrowserModule } from "./support/import-browser-module.mjs";

const { parseDiskxCityAttributes, coreEndpoints } = await importBrowserModule(new URL("../src/diskx-embed-attributes.ts", import.meta.url));
const { RELAY_ENDPOINTS } = await import("../src/diskx-source.ts");
const parse = (attributes) => parseDiskxCityAttributes((name) => (name in attributes ? attributes[name] : null));

test("a Core page reads its own Data Toolbox routes; the relay keeps its names", () => {
  assert.deepEqual(coreEndpoints("/api/data-toolbox/"), {
    summary: "/api/data-toolbox/storage/summary", tree: "/api/data-toolbox/storage/tree", files: "/api/data-toolbox/storage/files", volumes: null,
    janitorStrategy: "/api/data-toolbox/janitor/strategy/latest", janitorGroups: "/api/data-toolbox/janitor/strategy/latest/groups",
  });
  assert.equal(RELAY_ENDPOINTS.janitorGroups, "/diskx-api/janitor-groups");
  for (const bad of ["https://elsewhere.example/api", "//elsewhere.example", "/api/../admin", "api/data-toolbox", "/api?x=1"]) {
    assert.throws(() => coreEndpoints(bad), /same-origin/, bad);
  }
});

test("element attributes: roots required and absolute, group is a SHA-256, focus sits under a root", () => {
  const options = parse({ roots: "/mnt/datalake, /mnt/media,/mnt/media", janitor: "latest", group: "a".repeat(64), focus: "/mnt/media/Movies" });
  assert.deepEqual(options.roots, ["/mnt/datalake", "/mnt/media"]);
  assert.equal(options.endpoints.summary, "/api/data-toolbox/storage/summary", "api-base defaults to Core's Data Toolbox");
  assert.equal(options.janitor, "latest");
  assert.equal(options.group, "a".repeat(64));
  assert.equal(parse({ roots: "/data", janitor: "yes" }).janitor, null, "only janitor=\"latest\" opens the report");
  assert.throws(() => parse({}), /roots/);
  assert.throws(() => parse({ roots: "relative" }), /roots/);
  assert.throws(() => parse({ roots: "/data/" }), /roots/);
  assert.throws(() => parse({ roots: "/data", group: "ABC" }), /SHA-256/);
  assert.throws(() => parse({ roots: "/data", focus: "/database" }), /focus/, "a prefix neighbour is not under the root");
});
