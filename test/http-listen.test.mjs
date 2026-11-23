import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { listenHttp } from "../scripts/http-listen.mjs";

const close = server => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });

test("automatic HTTP fixtures are fetchable independently of the OS port-zero range", async t => {
  const server = createServer((req, res) => { res.writeHead(200); res.end("received " + req.url); });
  t.after(() => close(server));
  const address = await listenHttp(server);
  assert.ok(address.port >= 49152 && address.port <= 65535);
  const response = await fetch(`http://127.0.0.1:${address.port}/actual-request`);
  assert.equal(response.status, 200); assert.equal(await response.text(), "received /actual-request");
});

test("an occupied explicit HTTP port is refused without moving or replacing its owner", async t => {
  const owner = createServer((req, res) => res.end("original owner"));
  const second = createServer((req, res) => res.end("wrong owner"));
  t.after(() => close(owner)); t.after(() => close(second));
  const address = await listenHttp(owner);
  await assert.rejects(listenHttp(second, { port: address.port }), { code: "EADDRINUSE" });
  assert.equal(second.listening, false);
  assert.equal(await (await fetch(`http://127.0.0.1:${address.port}/`)).text(), "original owner");
});

test("automatic HTTP allocation recovers from a real bind collision", async t => {
  const owner = createServer((req, res) => res.end("first server"));
  const second = createServer((req, res) => res.end("second server"));
  t.after(() => close(owner)); t.after(() => close(second));
  const occupied = await listenHttp(owner), listen = second.listen.bind(second);
  let attempts = 0;
  second.listen = options => listen({ ...options, port: ++attempts === 1 ? occupied.port : options.port });
  const address = await listenHttp(second);
  assert.ok(attempts >= 2); assert.notEqual(address.port, occupied.port);
  assert.equal(await (await fetch(`http://127.0.0.1:${occupied.port}/`)).text(), "first server");
  assert.equal(await (await fetch(`http://127.0.0.1:${address.port}/`)).text(), "second server");
});
