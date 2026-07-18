import fs from "node:fs";
import readline from "node:readline";
import { chromium } from "playwright";

const REQUEST_SCHEMA = "graphysx.agent-tool-request/v1";
const RESPONSE_SCHEMA = "graphysx.agent-tool-response/v1";
const args = process.argv.slice(2);
const url = option("--url") ?? process.env.GRAPHYSX_URL ?? "http://127.0.0.1:4177/";
const requestText = option("--request");
const requestFile = option("--file");
const stdio = args.includes("--stdio");
const headed = args.includes("--headed");

if (args.includes("--help")) {
  process.stdout.write(`GraphysX external agent adapter

Usage:
  node tools/graphysx-agent-stdio.mjs --url http://127.0.0.1:4177 --request '{"id":"one","method":"state","args":[]}'
  node tools/graphysx-agent-stdio.mjs --file requests.json
  node tools/graphysx-agent-stdio.mjs --stdio

With no request, the adapter prints the discoverable tool manifest. --stdio accepts one JSON request per line and keeps one world session alive.
`);
  process.exit(0);
}

const browser = await chromium.launch({
  headless: !headed,
  args: ["--use-gl=angle", "--use-angle=swiftshader"]
});

let exitCode = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__GRAPHYSX_AGENT_BRIDGE__, null, { timeout: 30_000 });

  if (stdio) {
    const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
    for await (const line of lines) {
      if (!line.trim()) continue;
      process.stdout.write(`${JSON.stringify(await runSafely(page, line))}\n`);
    }
  } else if (requestText || requestFile) {
    const source = requestText ?? fs.readFileSync(requestFile, "utf8");
    const parsed = JSON.parse(source);
    const requests = Array.isArray(parsed) ? parsed : [parsed];
    const responses = [];
    for (const request of requests) responses.push(await invoke(page, request));
    process.stdout.write(`${JSON.stringify(Array.isArray(parsed) ? responses : responses[0], null, 2)}\n`);
    if (responses.some((response) => !response.ok)) exitCode = 1;
  } else {
    const manifest = await page.evaluate(() => window.__GRAPHYSX_AGENT_BRIDGE__.manifest());
    process.stdout.write(`${JSON.stringify({ adapter: "graphysx.playwright-stdio/v1", url, manifest }, null, 2)}\n`);
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  exitCode = 1;
} finally {
  await browser.close();
}

process.exitCode = exitCode;

async function runSafely(page, line) {
  try {
    return await invoke(page, JSON.parse(line));
  } catch (error) {
    return {
      schema: RESPONSE_SCHEMA,
      id: "invalid-request",
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function invoke(page, request) {
  const normalized = {
    schema: request?.schema ?? REQUEST_SCHEMA,
    id: typeof request?.id === "string" && request.id ? request.id : `stdio-${Date.now()}`,
    method: request?.method,
    args: request?.args ?? []
  };
  return page.evaluate((source) => window.__GRAPHYSX_AGENT_BRIDGE__.request(source), normalized);
}

function option(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
