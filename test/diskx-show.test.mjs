import { test } from "node:test";
import assert from "node:assert/strict";
import { importBrowserModule } from "./support/import-browser-module.mjs";

const { createLedger, LEDGER_ALL, DEFAULT_LEDGER_FILTER } = await importBrowserModule(new URL("../src/diskx-show-ledger.ts", import.meta.url));
const { parseShowScript, showScriptText, createShowPlayer, DEFAULT_SHOW_SCRIPT, SHOW_STEP_SECONDS } =
  await importBrowserModule(new URL("../src/diskx-show-script.ts", import.meta.url));

const sha = (c) => c.repeat(64);
const group = (c, size, survivor, paths, extra = {}) => ({
  sha256: sha(c), proof: "sha256-current-metadata", size, count: paths.length, provenSavingsBytes: size * (paths.length - 1),
  files: paths.map((path) => ({ path })), filesOmitted: 0, policySurvivorPath: survivor, review: null, ...extra,
});
const PAGE = [
  group("a", 1000, "/d/iso/x.iso", ["/d/iso/x.iso", "/d/backup/old/x.iso", "/m/films/x.iso"]),
  group("b", 300, "/m/films/y.mkv", ["/m/films/y.mkv", "/d/backup/y.mkv"]),
  group("c", 50, null, ["/d/iso/z", "/d/backup/z"]),
  group("e", 20, "/d/iso/w", ["/d/iso/w", "/d/iso/sub/w"]),
];

test("the ledger folds copies per folder and up to every root, by the rule's roles", () => {
  const ledger = createLedger();
  ledger.reset("r1", { groups: 10, bytes: 5000 });
  ledger.add("r1", PAGE, false);
  const view = ledger.view();
  assert.deepEqual(view.under("/d/backup"), { extraBytes: 1300, keepBytes: 0, unresolvedBytes: 50, groups: 3 });
  assert.deepEqual(view.under("/d"), { extraBytes: 1320, keepBytes: 1020, unresolvedBytes: 100, groups: 4 },
    "a group touching two folders of one disk counts once for the disk");
  assert.equal(view.under(LEDGER_ALL).extraBytes, 2320);
  assert.equal(view.extraUnder("/m"), 1000);
  assert.equal(view.extraDirect("/d/iso"), 0);
  assert.equal(view.extraDirect("/d/iso/sub"), 20);
  assert.deepEqual(view.top(2).map((g) => g.sha256[0]), ["a", "b"], "largest saving first");
  assert.deepEqual(view.groupsUnder("/m", 5).map((g) => g.sha256[0]), ["a", "b"]);
  const coverage = ledger.coverage();
  assert.deepEqual(coverage, { groupsRead: 4, groupsTotal: 10, bytesCovered: 2000 + 300 + 50 + 20, bytesTotal: 5000, complete: false },
    "coverage uses the report's measure: size × (copies − 1), survivor or not");
});

test("filters: roots, minimum size and role change the columns, never the target", () => {
  const ledger = createLedger();
  ledger.add("r1", PAGE, true);
  const media = ledger.view({ roots: ["/m"], minSize: 0, role: "all" });
  assert.deepEqual(media.under(LEDGER_ALL), { extraBytes: 1000, keepBytes: 300, unresolvedBytes: 0, groups: 2 });
  const big = ledger.view({ roots: null, minSize: 100, role: "extra" });
  assert.deepEqual(big.under("/d"), { extraBytes: 1300, keepBytes: 0, unresolvedBytes: 0, groups: 2 });
  assert.equal(big.extraUnder("/d"), 1300);
  assert.equal(ledger.view({ ...DEFAULT_LEDGER_FILTER, role: "keep" }).under("/m/films").keepBytes, 300);
  assert.equal(ledger.coverage().complete, true);
});

test("pairs fold extra copies onto the visible districts; inside and outside are counted, not drawn", () => {
  const ledger = createLedger();
  ledger.add("r1", PAGE, true);
  const { pairs, inside, outside, total } = ledger.view().pairs(["/d", "/m"], 24);
  assert.deepEqual(pairs, [
    { from: "/m", to: "/d", bytes: 1000, groups: 1 },
    { from: "/d", to: "/m", bytes: 300, groups: 1 },
  ]);
  assert.equal(inside, 1020, "/d/backup/old and /d/iso/sub sit in the same district as their kept copy");
  assert.equal(outside, 0);
  assert.equal(total, 2);
  const deeper = ledger.view().pairs(["/d/iso", "/d/backup"], 1);
  assert.equal(deeper.pairs.length, 1, "the pair budget is honoured");
  assert.deepEqual(deeper.pairs[0], { from: "/d/backup", to: "/d/iso", bytes: 1000, groups: 1 });
  assert.equal(deeper.outside, 1300, "copies outside the level are counted");
});

test("another report's page is refused instead of mixed in", () => {
  const ledger = createLedger();
  ledger.reset("r1", { groups: 1, bytes: 1 });
  assert.throws(() => ledger.add("r2", PAGE, true), /rapport a changé/);
});

test("the play list: known steps only, tours bounded, groups by SHA-256", () => {
  assert.equal(showScriptText(parseShowScript(DEFAULT_SHOW_SCRIPT)), DEFAULT_SHOW_SCRIPT);
  assert.deepEqual(parseShowScript(" Duplicates , tour-5 ,group-" + sha("f")), [
    { kind: "duplicates" }, { kind: "tour", count: 5 }, { kind: "group", sha256: sha("f") },
  ]);
  for (const bad of ["", "delete", "tour-0", "tour-21", "group-abc", "duplicates,move", Array(25).fill("pairs").join(",")]) {
    assert.throws(() => parseShowScript(bad), /play/, bad);
  }
});

test("the player walks the list on the frame clock and holds the last step", () => {
  const player = createShowPlayer(parseShowScript("overview,duplicates,tour-2,summary"));
  assert.equal(player.tick(10), false, "paused players do not move");
  player.play();
  assert.equal(player.tick(SHOW_STEP_SECONDS.overview), true);
  assert.equal(player.state().step.kind, "duplicates");
  player.next();
  assert.equal(player.state().step.kind, "tour");
  player.expand(2, [{ kind: "group", sha256: sha("a") }, { kind: "group", sha256: sha("b") }]);
  assert.deepEqual(player.steps().map((s) => s.kind), ["overview", "duplicates", "group", "group", "summary"]);
  assert.equal(player.state().index, 2);
  player.goto(99);
  assert.equal(player.state().step.kind, "summary");
  player.tick(SHOW_STEP_SECONDS.summary + 1);
  assert.equal(player.state().playing, false, "the last step holds and stops");
  player.play();
  assert.equal(player.state().index, 0, "playing again from the end starts over");
  player.previous();
  assert.equal(player.state().index, 0);
});

const { buildDiskxTree, layoutDiskxCity } = await importBrowserModule(new URL("../src/diskx-data.ts", import.meta.url));
const { duplicateLooks, targetLooks, worldLook } = await importBrowserModule(new URL("../src/diskx-show-looks.ts", import.meta.url));

test("scene looks: duplicates fade the rest and raise columns; the target lays the level out without extras", () => {
  const tree = buildDiskxTree(["/d"], [
    { path: "/d/iso", fileCount: 10, totalSize: 4000 }, { path: "/d/backup", fileCount: 10, totalSize: 4000 }, { path: "/d/docs", fileCount: 10, totalSize: 2000 },
  ]);
  const focus = tree.byPath.get("/d");
  const layout = layoutDiskxCity(focus, { size: 40 });
  const blocks = layout.blocks.filter((b) => b.level === 0).map((b) => ({ id: b.node.path, node: b.node, rect: b.rect, height: b.height, kind: b.kind }));
  const ledger = createLedger();
  ledger.add("r1", [group("a", 1000, "/d/iso/x", ["/d/iso/x", "/d/backup/x", "/d/backup/y"])], true);
  const view = ledger.view();
  const dup = duplicateLooks(blocks, view);
  const docs = dup.get("/d/docs"), backup = dup.get("/d/backup"), iso = dup.get("/d/iso");
  assert.equal(docs.keepHeight + docs.extraHeight, 0, "no duplicate, no column");
  assert.ok(docs.shellOpacity < worldLook(blocks[0]).shellOpacity, "the rest fades");
  assert.ok(backup.extraHeight > 0 && backup.keepHeight === 0);
  assert.ok(iso.keepHeight > 0 && iso.extraHeight === 0);
  assert.ok(backup.extraHeight > iso.keepHeight, "twice the duplicate bytes stand taller on the log scale");
  const target = targetLooks(focus, blocks, view, 40);
  assert.equal(target.get("/d/backup").extraHeight, 0, "extra copies are gone at the target");
  const area = (look) => look.width * look.depth;
  assert.ok(area(target.get("/d/backup")) < area(dup.get("/d/backup")), "the folder losing 2 000 bytes shrinks");
  assert.ok(area(target.get("/d/iso")) > area(dup.get("/d/iso")), "and the others take the room on the re-laid plaza");
});
