/** A segment is a bounded read-only slice of one instance, never another run. */
export function archiveSource(value: string): { base: string; selected: number | null } | null {
  if (!value) return null;
  const url = new URL(value);
  const match = /^(.*\/recordings\/[a-f0-9-]{36})(?:\/parts\/(\d{1,6}))?$/.exec(url.pathname);
  return match ? { base: url.origin + match[1], selected: match[2] ? Number(match[2]) : null } : null;
}

export function mountArchiveParts(root: HTMLElement, source: string): () => void {
  const archive = archiveSource(source);
  if (!archive) return () => {};
  const controller = new AbortController();
  const label = document.createElement("label");
  label.className = "gx-island-archive";
  label.textContent = "Relecture · segment ";
  label.hidden = true;
  const select = document.createElement("select");
  select.setAttribute("aria-label", "Segment de l’archive");
  label.append(select); root.append(label);
  void fetch(`${archive.base}/parts`, { cache: "no-store", signal: controller.signal }).then(async response => {
    if (!response.ok) return;
    const data: unknown = await response.json();
    if (!data || typeof data !== "object" || !("parts" in data) || !Array.isArray(data.parts)) return;
    const parts = data.parts.filter((part: unknown): part is { id: number; bytes: number } =>
      !!part && typeof part === "object" && "id" in part && Number.isSafeInteger(part.id) &&
      // The service allows up to 8192 segments per instance (WORLD_RECORD_MAX_SEGMENTS).
      "bytes" in part && typeof part.bytes === "number" && part.bytes >= 0).slice(-8192);
    parts.forEach((part, index) => {
      const option = document.createElement("option"); option.value = String(part.id);
      option.textContent = `${index + 1} / ${parts.length} · ${(part.bytes / 1024 / 1024).toFixed(1)} Mio`;
      option.selected = part.id === (archive.selected ?? parts[0]?.id); select.append(option);
    });
    label.hidden = parts.length < 2;
  }).catch(() => {});
  select.addEventListener("change", () => {
    const page = new URL(location.href);
    page.searchParams.set("source", `${archive.base}/parts/${select.value}`);
    location.assign(page.href);
  });
  return () => { controller.abort(); label.remove(); };
}
