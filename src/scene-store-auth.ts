const TOKEN_FRAGMENT_KEY = "storeToken";
const TOKEN_SESSION_PREFIX = "graphysx.store-token:";

function sessionKey(baseUrl: string): string {
  try {
    return `${TOKEN_SESSION_PREFIX}${new URL(baseUrl, window.location.href).toString().replace(/\/+$/, "")}`;
  } catch {
    return `${TOKEN_SESSION_PREFIX}${baseUrl.replace(/\/+$/, "")}`;
  }
}

/**
 * Resolve a browser store token without leaving it in a request URL.
 *
 * A caller may bootstrap a tab with `#storeToken=<token>`. Fragments are never sent in
 * HTTP requests or Referer headers. The first client to run moves the value into this
 * tab's sessionStorage and removes it from the visible URL with replaceState; later lazy
 * modules resolve the same store-scoped value from sessionStorage.
 */
export function resolveSceneStoreToken(baseUrl: string): string | null {
  if (typeof window === "undefined" || !window.location) return null;
  const key = sessionKey(baseUrl);
  let fragment: URLSearchParams;
  try {
    fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  } catch {
    fragment = new URLSearchParams();
  }

  if (fragment.has(TOKEN_FRAGMENT_KEY)) {
    const token = fragment.get(TOKEN_FRAGMENT_KEY)?.trim() || null;
    try {
      if (token) window.sessionStorage.setItem(key, token);
      else window.sessionStorage.removeItem(key);
    } catch {
      // Storage can be disabled; the caller can still use the fragment value in memory.
    }

    fragment.delete(TOKEN_FRAGMENT_KEY);
    const remaining = fragment.toString();
    try {
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${window.location.search}${remaining ? `#${remaining}` : ""}`,
      );
    } catch {
      // A locked-down embedding may reject history writes; never reject the token itself.
    }
    return token;
  }

  try {
    return window.sessionStorage.getItem(key)?.trim() || null;
  } catch {
    return null;
  }
}
