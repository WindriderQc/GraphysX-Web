/** Attribute rules of `<diskx-city>`, kept apart from the element so Node tests can run them. */
import type { DiskxEndpoints } from "./diskx-source";

/** Core's Data Toolbox routes under a same-origin base path such as `/api/data-toolbox`. */
export function coreEndpoints(apiBase: string): DiskxEndpoints {
  if (!/^\/[A-Za-z0-9._~\/-]{0,200}$/.test(apiBase) || apiBase.includes("..") || apiBase.startsWith("//")) throw new Error("api-base must be a same-origin path");
  const base = apiBase.replace(/\/+$/, "");
  return {
    summary: `${base}/storage/summary`, tree: `${base}/storage/tree`, files: `${base}/storage/files`, volumes: null,
    janitorStrategy: `${base}/janitor/strategy/latest`, janitorGroups: `${base}/janitor/strategy/latest/groups`,
  };
}

const SHA256 = /^[0-9a-f]{64}$/;
const ROOT = /^\/[^\0]{0,1023}$/;

export function parseDiskxCityAttributes(read: (name: string) => string | null) {
  const apiBase = read("api-base") || "/api/data-toolbox";
  const endpoints = coreEndpoints(apiBase);
  const roots = (read("roots") || "").split(",").map((root) => root.trim()).filter(Boolean);
  if (!roots.length || roots.some((root) => !ROOT.test(root) || root.endsWith("/") || root.includes("/../"))) throw new Error("roots must list absolute folder paths");
  const group = read("group");
  if (group !== null && group !== "" && !SHA256.test(group)) throw new Error("group must be a SHA-256");
  const focus = read("focus");
  if (focus && !roots.some((root) => focus === root || focus.startsWith(`${root}/`))) throw new Error("focus must sit under a root");
  const janitor = read("janitor") === "latest" ? "latest" as const : null;
  return { endpoints, roots: [...new Set(roots)], group: group || null, focus: focus || null, janitor };
}
