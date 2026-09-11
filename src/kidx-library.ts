import catalog from "./kidx-document-catalog.json" with { type: "json" };

export type KidxDocument = typeof catalog[number];
export const KIDX_DOCUMENTS: readonly KidxDocument[] = catalog;
export const KIDX_PROGRESS_KEY = "graphysx:kidx:reading:v1";
export type KidxReadingProgress = Record<string, number>;

export function readKidxProgress(storage: Pick<Storage, "getItem">): KidxReadingProgress {
  try {
    const value: unknown = JSON.parse(storage.getItem(KIDX_PROGRESS_KEY) ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([id, page]) => {
      const document = KIDX_DOCUMENTS.find((item) => item.id === id);
      return document && Number.isInteger(page) && page >= 1 && page <= document.pages;
    }));
  } catch { return {}; }
}

export function findKidxDocuments(query: string, family: string, kind: string): KidxDocument[] {
  const normalized = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const words = normalized(query).trim().split(/\s+/).filter(Boolean);
  return KIDX_DOCUMENTS.filter((item) => (!family || item.family === family) && (!kind || item.kind === kind)
    && words.every((word) => normalized(`${item.title} ${item.family} ${item.filename}`).includes(word)));
}

export async function availableKidxDocuments(): Promise<Set<string>> {
  try {
    const response = await fetch("/kidx-document-status");
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) return new Set();
    const data = await response.json() as { available?: unknown };
    return new Set(Array.isArray(data.available) ? data.available.filter((id): id is string => typeof id === "string") : []);
  } catch { return new Set(); }
}
