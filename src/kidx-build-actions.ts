export function smoothKidx(t: number) { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); }
export function parseKidxBuildRequest(text: string): { action: string; value?: number; search?: string } {
  const request = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const step = /(?:etape|assemblage)\s*(\d+)/.exec(request);
  if (step) return { action: "step", value: Number(step[1]) - 1 };
  if (/dessous|en dessous/.test(request)) return { action: "underside" };
  if (/dessus|vue normale/.test(request)) return { action: "above" };
  if (/eclat|separ/.test(request)) return { action: "explode" };
  if (/rassembl/.test(request)) return { action: "assemble" };
  if (/ralenti|lentement/.test(request)) return { action: "slow" };
  if (/pause|arrete/.test(request)) return { action: "pause" };
  if (/rejou|recommence|montre.moi|demonstration/.test(request)) return { action: "replay" };
  if (/suivant/.test(request)) return { action: "next" };
  if (/precedent|retour/.test(request)) return { action: "previous" };
  if (/tourne|rotation/.test(request)) return { action: "rotate" };
  if (/repren|continue/.test(request)) return { action: "resume" };
  return { action: "piece", search: request.replace(/^(?:ou va|montre|trouve|ou est)\s+(?:le |la |les |l')?/, "") };
}
