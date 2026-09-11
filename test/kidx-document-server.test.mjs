import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createKidxDocumentRoute } from "../scripts/kidx-document-server.mjs";

test("local instructions serve only catalogued PDFs, with honest availability and no write route", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "kidx-documents-"));
  const catalogPath = path.join(root, "catalog.json");
  const pdf = "%PDF-1.7\nTest document";
  await writeFile(path.join(root, "A robot.pdf"), pdf);
  await writeFile(path.join(root, "private.txt"), "must not be served");
  await writeFile(catalogPath, JSON.stringify([{ id: "robot", filename: "A robot.pdf" }, { id: "missing", filename: "absent.pdf" }, { id: "escape", filename: "../private.txt" }]));
  const route = await createKidxDocumentRoute({ root, catalogPath });
  const server = http.createServer((req, res) => { if (!route(req, res)) { res.writeHead(404); res.end(); } });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const available = await (await fetch(`${base}/kidx-document-status`)).json();
    assert.deepEqual(available, { available: ["robot"] });
    const response = await fetch(`${base}/kidx-documents/robot.pdf`);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    assert.equal(await response.text(), pdf);
    assert.equal((await fetch(`${base}/kidx-documents/robot.pdf`, { method: "HEAD" })).headers.get("content-length"), String(pdf.length));
    for (const target of ["missing.pdf", "escape.pdf", "private.txt", "%2e%2e%2fprivate.txt", "%72obot.pdf"])
      assert.equal((await fetch(`${base}/kidx-documents/${target}`)).status, 404);
    assert.equal((await fetch(`${base}/kidx-documents/robot.pdf`, { method: "POST", body: "overwrite" })).status, 405);
    assert.equal(await (await fetch(`${base}/kidx-documents/robot.pdf`)).text(), pdf);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
