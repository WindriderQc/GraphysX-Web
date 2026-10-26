/** Core-hosted Forge: the existing app, conversation and one owned frame loop. */
import { DefaultLoadingManager } from 'three';
import { PlatformHost } from './platform-host';
import { mountLlmXApp } from './llmx-app';

// The published module is relayed by Core. Its graphical assets use the same
// bounded relay; conversations and voice keep their existing native Core URLs.
DefaultLoadingManager.setURLModifier(url => url.startsWith('/assets/')
  ? '/api/household/llmx/assets/' + url.slice('/assets/'.length) : url);

const root = document.querySelector<HTMLElement>('[data-llmx-root]');
if (!root) throw new Error('LLMx requires its Core host page');
root.replaceChildren();
const host = new PlatformHost(root, { interactive: false, editorVisible: false, autoOrbit: false, intro: false });
const app = mountLlmXApp(root, host, () => {
  window.location.assign(new URLSearchParams(window.location.search).get('profile') === 'family' ? '/panel' : '/dad');
});
const hide = (event: PageTransitionEvent) => {
  if ((event as PageTransitionEvent).persisted) return;
  window.removeEventListener('pagehide', hide);
  try { app.dispose(); } finally { host.dispose(); }
};
window.addEventListener('pagehide', hide);
