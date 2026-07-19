// One deadline for every smoke, instead of thirty-four hardcoded ones.
//
// The smokes used to carry their own numbers — 15s here, 20s there — chosen against an idle
// machine. Under load (a build finishing, several headless browsers in a row, whatever else
// the developer is running) those deadlines start expiring on work that is merely slow, and
// the failure rotates between smokes run to run. That is worse than a slow suite: a gate
// that fails somewhere different each time teaches you to re-run rather than to look, and
// then a real regression hides in the noise.
//
// The tell that this was never a product bug: a run failed `waitForSelector('.gx-welcome')`
// while Playwright's own log said "locator resolved to visible". The element was there. The
// clock ran out.
//
// Raise it for a slow machine or CI: SMOKE_TIMEOUT=90000 npm run verify
export const SMOKE_TIMEOUT = Number(process.env.SMOKE_TIMEOUT || 45000);

/**
 * Applies the shared deadline to a page, covering both the explicit waits below and any
 * Playwright call that takes its timeout from the default.
 */
export function applySmokeTimeout(page) {
  page.setDefaultTimeout(SMOKE_TIMEOUT);
  page.setDefaultNavigationTimeout(SMOKE_TIMEOUT);
  return page;
}
