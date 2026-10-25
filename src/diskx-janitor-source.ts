/** AgentX source contract pinned at 87fc29fd0565fb16b11b3dbdeb70ed4758f19ae5.
 * GET only. A report is assessment evidence, never an execution authorization. */
export type JanitorGroup = {
  sha256: string; proof: unknown; size: number; count: number; provenSavingsBytes: number;
  files: { path: string; mtime?: unknown; storageRole?: unknown }[];
  filesOmitted: number; policySurvivorPath: string | null; review: unknown;
};
export type JanitorGroupPage = {
  report: { id: string; generatedAt: string | null; status: string };
  total: number; offset: number; limit: number; nextOffset: number | null;
  scanBoundReached: boolean; groups: JanitorGroup[];
};
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Contrat Janitor incompatible');
  return value as Record<string, unknown>;
};
const count = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Nombre Janitor invalide');
  return value;
};
const text = (value: unknown): string => {
  if (typeof value !== 'string' || value.length > 4096) throw new Error('Texte Janitor invalide');
  return value;
};
async function read(fetchImpl: typeof fetch, route: string) {
  const response = await fetchImpl(route, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Janitor HTTP ${response.status}`);
  const envelope = object(await response.json());
  if (envelope.status !== 'success') throw new Error('Réponse Janitor incompatible');
  return object(envelope.data);
}
export async function readJanitorSummary(fetchImpl: typeof fetch = fetch) {
  const data = await read(fetchImpl, '/diskx-api/janitor-strategy');
  if (data.available === false || data.status === 'unavailable') return { available: false as const };
  const summary = object(data.summary);
  return { available: true as const, generatedAt: text(data.generatedAt), status: text(data.status),
    verifiedGroups: count(summary.verifiedGroups), provenSavingsBytes: count(summary.provenSavingsBytes),
    candidateGroups: count(summary.candidateGroups), candidateBytes: count(summary.candidateBytes),
    filesToHash: count(summary.filesToHash), bytesToHash: count(summary.bytesToHash),
    executableActions: count(summary.executableActions) };
}
export async function readJanitorGroups(offset = 0, fetchImpl: typeof fetch = fetch): Promise<JanitorGroupPage> {
  count(offset);
  const data = await read(fetchImpl, `/diskx-api/janitor-groups?offset=${offset}&limit=20`);
  const report = object(data.report);
  if (!Array.isArray(data.groups) || data.groups.length > 100) throw new Error('Groupes Janitor invalides');
  const nextOffset = data.nextOffset === null ? null : count(data.nextOffset);
  if (nextOffset !== null && nextOffset <= offset) throw new Error('Pagination Janitor sans progression');
  return {
    report: { id: text(report.id), generatedAt: report.generatedAt == null ? null : text(report.generatedAt), status: text(report.status) },
    total: count(data.total), offset: count(data.offset), limit: count(data.limit), nextOffset,
    scanBoundReached: data.scanBoundReached === true,
    groups: data.groups.map(raw => {
      const group = object(raw);
      if (!Array.isArray(group.files) || group.files.length > 2000) throw new Error('Fichiers Janitor invalides');
      return { sha256: text(group.sha256), proof: group.proof, size: count(group.size), count: count(group.count),
        provenSavingsBytes: count(group.provenSavingsBytes), filesOmitted: count(group.filesOmitted),
        policySurvivorPath: group.policySurvivorPath == null ? null : text(group.policySurvivorPath), review: group.review,
        files: group.files.map(rawFile => { const file = object(rawFile); return { path: text(file.path), mtime: file.mtime, storageRole: file.storageRole }; }) };
    }),
  };
}
