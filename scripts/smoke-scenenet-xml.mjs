import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { SMOKE_TIMEOUT, applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";

const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:4188/";
const ART = process.env.SMOKE_ARTIFACTS || path.resolve("output/smoke");
mkdirSync(ART, { recursive: true });

const fixtures = {
  v10: `<?xml version="1.0" encoding="utf-8"?>
<CScene3D><Actions>0=CUBE 7=PHYSICCUBE 15=V1_0</Actions><ObjList><Object3D><Type>7</Type><Name>V10 Cube</Name><TextureName>TwoWay</TextureName><Pos><x>5</x><y>1</y><z>-2</z></Pos><Scale><x>2</x><y>3</y><z>4</z></Scale><bEnable>true</bEnable><masse>0</masse><iNewtonMat>1</iNewtonMat></Object3D></ObjList></CScene3D>`,
  v11: `<?xml version="1.0" encoding="utf-8"?>
<Scene3D><ActionsHeader>0=CUBE 7=PHYSICCUBE 17=V1_1</ActionsHeader><ObjList><Obj3D Type="7" Name="Repeated Cube" Enabled="true" masse="0" MeshControlled="false" NewtonMat="0"><Pos x="0" y="0" z="0"/><Scale x="1" y="1" z="1"/><TextureName>TwoWay</TextureName></Obj3D><Obj3D Type="7" Name="Repeated Cube" Enabled="false" masse="0" MeshControlled="false" NewtonMat="0"><Pos x="4" y="0" z="0"/><Scale x="1" y="1" z="1"/><TextureName>TwoWay</TextureName></Obj3D></ObjList></Scene3D>`,
  v12: `<?xml version="1.0" encoding="utf-8"?>
<Scene3D><ActionsHeader>0=CUBE 9=PHYSICSCYLINDER 18=V1_2</ActionsHeader><ObjList><Obj3D Type="9" Name="V12 Rotor" Enabled="true" Masse="2" MeshControlled="true" NewtonMat="4"><Pos x="1.25" y="6.5" z="-3.75"/><Rot x="10" y="20" z="30"/><Scale x="0.5" y="2" z="0.5"/><PathToMesh/><TextureName>Checkerboard</TextureName></Obj3D></ObjList><ringPosList/></Scene3D>`,
  splitEnum: `<?xml version="1.0" encoding="utf-8"?>
<SceneNET><EntityNETList><EntityNET Type="PHYSPRIMITIVE" Geom="SPHERE" Name="Enum Sphere" Enabled="true" Masse="1.5" MeshControlled="false" NewtonMat="FINISH"><Pos x="-2" y="3" z="4"/><Rot x="0" y="45" z="0"/><Scale x="1" y="1" z="1"/><TextureName>Marble</TextureName></EntityNET></EntityNETList></SceneNET>`,
};

const browser = await launchSmokeBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
applySmokeTimeout(page);
const consoleErrors = [];
const pageErrors = [];
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("pageerror", (error) => pageErrors.push(String(error)));
const out = {};

try {
  await page.goto(`${BASE}?host=editor&intro=0`, { waitUntil: "load" });
  await page.waitForFunction(() => !!window.__GRAPHYSX__ && typeof window.render_game_to_text === "function", null, { timeout: SMOKE_TIMEOUT });
  out.contract = await page.evaluate((sourceFixtures) => {
    const api = window.__GRAPHYSX__;
    const summarize = (definition) => (definition?.entities ?? []).map((entity) => ({
      id: entity.id,
      type: entity.type,
      transform: entity.transform,
      texture: entity.material?.texture?.id ?? null,
      visible: entity.visible,
      physics: entity.physics ? {
        mode: entity.physics.mode,
        mass: entity.physics.mass,
        material: entity.physics.material,
      } : null,
    })).sort((left, right) => left.id.localeCompare(right.id));
    const fixtureResults = {};
    for (const [version, xml] of Object.entries(sourceFixtures)) {
      const first = api.importLegacyXml(xml, { id: `fixture-${version}` });
      const before = summarize(api.exportDocument());
      const exported = api.exportLegacyXml();
      const deterministic = exported.ok && api.exportLegacyXml().value?.xml === exported.value?.xml;
      const second = exported.ok ? api.importLegacyXml(exported.value.xml, { id: `fixture-${version}-roundtrip` }) : null;
      const after = summarize(api.exportDocument());
      fixtureResults[version] = {
        importOk: first.ok,
        sourceEntityCount: first.value?.sourceEntityCount ?? null,
        importWarnings: first.value?.warnings ?? [],
        exportOk: exported.ok,
        format: exported.value?.format ?? null,
        deterministic,
        warningCodes: exported.value?.warnings.map((warning) => warning.code) ?? [],
        reimportOk: second?.ok ?? false,
        equivalent: JSON.stringify(before) === JSON.stringify(after),
        before,
        after,
      };
    }

    const lossyDefinition = {
      schema: api.worldSchema,
      id: "legacy-loss-contract",
      label: "Legacy loss contract",
      environment: { background: "#123456" },
      entities: [
        { id: "wide-box", label: "Wide box label", type: "box", geometry: { width: 3, height: 2, depth: 5 }, transform: { position: [1, 2, 3], rotationDegrees: [5, 15, 25], scale: [1, 1, 1] }, material: { color: "#ff0000", texture: { id: "two-way" } }, physics: { mode: "dynamic", mass: 3, material: "ball", friction: 0.2 } },
        { id: "modern-light", type: "point-light", intensity: 4, transform: { position: [0, 6, 0] } },
      ],
      rules: { subjectId: "wide-box", spawn: { position: [1, 2, 3] }, checkpoints: [], finish: { triggerId: "wide-box" }, laps: 1, requireCollectibles: false },
    };
    const lossy = api.exportLegacyXml(lossyDefinition);
    const duplicate = api.exportLegacyXml({
      schema: api.worldSchema,
      id: "duplicates",
      label: "Duplicates",
      entities: [{ id: "same", type: "box" }, { id: "same", type: "sphere" }],
    });
    const hierarchy = api.exportLegacyXml({
      schema: api.worldSchema,
      id: "hierarchy",
      label: "Hierarchy",
      entities: [{ id: "root", type: "group" }, { id: "child", parentId: "root", type: "box" }],
    });
    return {
      fixtures: fixtureResults,
      lossy: {
        ok: lossy.ok,
        exported: lossy.value?.exportedEntityCount ?? null,
        omitted: lossy.value?.omittedEntityIds ?? [],
        warningCodes: lossy.value?.warnings.map((warning) => warning.code) ?? [],
        warningShape: lossy.value?.warnings.every((warning) => warning.severity === "warning" && typeof warning.field === "string" && "entityId" in warning) ?? false,
        xmlHasPose: lossy.value?.xml.includes('<Pos x="1" y="2" z="3" />') && lossy.value.xml.includes('<Rot x="5" y="15" z="25" />'),
        xmlHasKnownTexture: lossy.value?.xml.includes("<TextureName>TwoWay</TextureName>") ?? false,
      },
      duplicate: { ok: duplicate.ok, error: duplicate.error ?? null },
      hierarchy: { ok: hierarchy.ok, error: hierarchy.error ?? null },
      bridgeListed: window.__GRAPHYSX_AGENT_BRIDGE__.manifest().tools.some((tool) => tool.name === "exportLegacyXml" && !tool.mutates),
    };
  }, fixtures);

  await page.evaluate(() => window.__GRAPHYSX__.create({
    schema: window.__GRAPHYSX__.worldSchema,
    id: "legacy-ui-proof",
    label: "Legacy XML UI Proof",
    environment: { background: "#9cc8e4", ground: { visible: true, size: 24, color: "#274451", grid: true, gridColor: "#8ed6e8" } },
    entities: [
      { id: "xml-cube", type: "box", transform: { position: [-2, 1, 0], rotationDegrees: [0, 25, 0] }, material: { color: "#58c4dd" }, physics: { mode: "static", material: "wall" } },
      { id: "xml-sphere", type: "sphere", transform: { position: [2, 1.2, 0] }, material: { color: "#f2b45f" }, physics: { mode: "dynamic", mass: 2, material: "ball" } },
    ],
  }));
  const downloadPromise = page.waitForEvent("download");
  await page.locator('[data-gx-export="legacy-xml"]').click();
  const download = await downloadPromise;
  const downloadedPath = path.join(ART, "legacy-ui-proof.scenenet.xml");
  await download.saveAs(downloadedPath);
  await page.waitForTimeout(500);
  out.ui = {
    suggestedFilename: download.suggestedFilename(),
    status: await page.locator(".gx-ed-status").textContent(),
    buttonVisible: await page.locator('[data-gx-export="legacy-xml"]').isVisible(),
    downloadedXml: readFileSync(downloadedPath, "utf8").startsWith('<?xml version="1.0" encoding="utf-8"?>\n<Scene3D'),
    text: JSON.parse(await page.evaluate(() => window.render_game_to_text())),
  };
  await page.screenshot({ path: path.join(ART, "scenenet-xml-export.png") });
} catch (error) {
  out.fatal = String(error);
}

out.consoleErrors = consoleErrors;
out.pageErrors = pageErrors;
await browser.close();

const fixtureRows = Object.values(out.contract?.fixtures ?? {});
const pass = !out.fatal
  && fixtureRows.length === 4
  && fixtureRows.every((fixture) => fixture.importOk && fixture.exportOk && fixture.deterministic && fixture.reimportOk && fixture.equivalent)
  && out.contract.fixtures.v11.importWarnings.some((warning) => warning.includes("duplicate legacy Name"))
  && JSON.stringify(out.contract.fixtures.v12.after[0]?.transform?.rotationDegrees) === JSON.stringify([10, 20, 30])
  && out.contract.fixtures.v12.after[0]?.physics?.mode === "kinematic"
  && out.contract.fixtures.splitEnum.after[0]?.type === "sphere"
  && out.contract.lossy.ok && out.contract.lossy.exported === 1
  && out.contract.lossy.omitted.includes("modern-light")
  && ["environment-unsupported", "rules-unsupported", "entity-type-unsupported", "geometry-baked-into-scale", "material-unsupported", "physics-field-unsupported"].every((code) => out.contract.lossy.warningCodes.includes(code))
  && out.contract.lossy.warningShape && out.contract.lossy.xmlHasPose && out.contract.lossy.xmlHasKnownTexture
  && !out.contract.duplicate.ok && out.contract.duplicate.error.includes("duplicate entity id")
  && !out.contract.hierarchy.ok && out.contract.hierarchy.error.includes("cannot represent hierarchy")
  && out.contract.bridgeListed
  && out.ui?.suggestedFilename === "legacy-ui-proof.scenenet.xml"
  && out.ui?.status?.includes("XML 2/2") && out.ui?.buttonVisible && out.ui?.downloadedXml
  && out.ui?.text?.world?.id === "legacy-ui-proof"
  && consoleErrors.length === 0 && pageErrors.length === 0;

console.log(JSON.stringify(out, null, 2));
console.log(pass ? "SMOKE PASS" : "SMOKE FAIL");
process.exit(pass ? 0 : 1);
