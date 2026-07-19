// Shared plumbing for the smokes: one deadline, and browsers that always get closed.
//
// ## The deadline
//
// The smokes used to carry their own numbers — 15s here, 20s there — chosen against an idle
// machine. Under load (a build finishing, several headless browsers in a row) those expire
// on work that is merely slow, and the failure rotates between smokes run to run. That is
// worse than a slow suite: a gate that fails somewhere different each time teaches you to
// re-run rather than to look, and a real regression hides in the noise.
//
// The tell that this was never a product bug: a run failed `waitForSelector('.gx-welcome')`
// while Playwright's own log said "locator resolved to visible". The element was there. The
// clock ran out.
//
// Raise it for a slow machine or CI: SMOKE_TIMEOUT=90000 npm run verify
//
// ## The browsers
//
// Each smoke closed its browser on the last line of the script. That covers the happy path
// and nothing else: a throw outside the try, a `process.exit` from a failed assertion, or
// the run being interrupted all left a headless Chromium alive forever. They accumulate
// silently — 23 of them were found on one machine — and once enough pile up, *every* smoke
// in the next run fails at once, which reads exactly like a catastrophic regression and is
// not one. Registering the browser here means it closes on the way out no matter which exit
// the script takes.

import { chromium } from "playwright";

export const SMOKE_TIMEOUT = Number(process.env.SMOKE_TIMEOUT || 45000);

/**
 * Applies the shared deadline to a page, covering the explicit waits in the smokes and any
 * Playwright call that takes its timeout from the default.
 */
export function applySmokeTimeout(page) {
  page.setDefaultTimeout(SMOKE_TIMEOUT);
  page.setDefaultNavigationTimeout(SMOKE_TIMEOUT);
  return page;
}

const open = new Set();
let hooked = false;

function closeAllSync() {
  // `exit` handlers cannot await, so this is best-effort: ask each browser to close and let
  // the kill signal do the rest. It is still far better than leaving them running.
  for (const browser of open) {
    try {
      browser.close();
    } catch {
      // Nothing useful to do while the process is unwinding.
    }
  }
  open.clear();
}

function hookOnce() {
  if (hooked) return;
  hooked = true;
  process.on("exit", closeAllSync);
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => {
      closeAllSync();
      process.exit(130);
    });
  }
  // A smoke that throws at the top level would otherwise die before its own cleanup.
  process.on("uncaughtException", (error) => {
    closeAllSync();
    console.error(error);
    process.exit(1);
  });
  process.on("unhandledRejection", (error) => {
    closeAllSync();
    console.error(error);
    process.exit(1);
  });
}

/**
 * Launches the browser every smoke uses, and guarantees it is closed however the script
 * ends. Prefer this over calling `chromium.launch` directly.
 */
export async function launchSmokeBrowser(options = {}) {
  hookOnce();
  const browser = await chromium.launch({
    executablePath: process.env.SMOKE_CHROMIUM || undefined,
    headless: true,
    args: ["--no-sandbox"],
    ...options,
  });
  open.add(browser);
  const close = browser.close.bind(browser);
  // Explicit closes stay correct and stop double-closing at exit.
  browser.close = async () => {
    open.delete(browser);
    await close();
  };
  return browser;
}
