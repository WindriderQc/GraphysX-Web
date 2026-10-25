import type { JanitorGroup, JanitorGroupPage } from './diskx-janitor-source';
/** Local presentation contract ONLY. The real Janitor schema/transport remains unconfirmed. */
export const JANITOR_PRESENTATION_SCHEMA = 'graphysx.janitor-presentation-draft/v1';
export type JanitorStatus = 'proposed' | 'authorized' | 'running' | 'completed' | 'failed' | 'unknown';
export type JanitorCandidate = {
  id: string; operationId: string; status: JanitorStatus;
  source: string; target: string; evidence: string;
  equivalence: 'exact' | 'similar' | 'unverified';
  logicalBytes: number; reclaimableBytes: number | null;
};
export type JanitorReport = { schema: typeof JANITOR_PRESENTATION_SCHEMA; runId: string; synthetic: true; candidates: JanitorCandidate[] };
export const JANITOR_STATUS_LABELS: Record<JanitorStatus, string> = {
  proposed: 'Proposé', authorized: 'Autorisé', running: 'En cours', completed: 'Terminé', failed: 'Échoué', unknown: 'Inconnu',
};
export const JANITOR_DEMO: JanitorReport = {
  schema: JANITOR_PRESENTATION_SCHEMA, runId: 'synthetic-run-1', synthetic: true,
  candidates: (['proposed', 'authorized', 'running', 'completed', 'failed', 'unknown'] as const).map((status, index) => ({
    id: `demo-candidate-${index}`, operationId: `demo-operation-${index}`, status,
    source: '/mnt/media/Movies', target: '/mnt/media/Projects',
    equivalence: index === 0 ? 'similar' : 'unverified', logicalBytes: 1024 ** 3, reclaimableBytes: null,
    evidence: index === 0 ? 'Exemple de similarité : aucune preuve de doublon exact, aucune suppression justifiée.' : 'État fictif pour vérifier la présentation. Aucun résultat du backend Janitor.',
  })),
};
export function janitorAvailability() {
  return { status: 'unavailable' as const, reason: 'Rapport Janitor non chargé. Contrat source connu ; disponibilité du serveur à vérifier par une lecture.', schema: JANITOR_PRESENTATION_SCHEMA };
}

/**
 * Synthetic report for the public demo (`?app=diskx&source=fixture&janitor=demo`): the same
 * shapes the live GET routes return, on the synthetic fixture's folders, so the duplicate view
 * can be seen without a relay. Sizes and names are invented.
 */
export const JANITOR_DEMO_SUMMARY = {
  available: true as const, generatedAt: '2026-01-01T00:00:00.000Z', status: 'ready_for_review',
  verifiedGroups: 2, provenSavingsBytes: 3 * 4_700_000_000 + 2_100_000_000, candidateGroups: 0, candidateBytes: 0,
  filesToHash: 0, bytesToHash: 0, executableActions: 0,
};
const demoGroup = (sha: string, size: number, survivor: string | null, paths: string[]): JanitorGroup => ({
  sha256: sha.repeat(64 / sha.length), proof: 'sha256-current-metadata (synthétique)', size, count: paths.length,
  provenSavingsBytes: survivor ? size * (paths.length - 1) : 0, files: paths.map((path) => ({ path })), filesOmitted: 0,
  policySurvivorPath: survivor, review: null,
});
export const JANITOR_DEMO_GROUPS: JanitorGroupPage = {
  report: { id: 'synthetic-report', generatedAt: JANITOR_DEMO_SUMMARY.generatedAt, status: 'ready_for_review' },
  total: 2, offset: 0, limit: 20, nextOffset: null, scanBoundReached: false,
  groups: [
    demoGroup('d1', 4_700_000_000, '/mnt/datalake/ISO/Example/demo-installer.iso', [
      '/mnt/datalake/ISO/Example/demo-installer.iso',
      '/mnt/datalake/Backups/Example/demo-installer.iso',
      '/mnt/datalake/Archives/Example/demo-installer.iso',
      '/mnt/datalake/Projects/Example/demo-installer.iso',
    ]),
    demoGroup('e2', 2_100_000_000, '/mnt/media/Movies/Example/demo-film.mkv', [
      '/mnt/media/Movies/Example/demo-film.mkv',
      '/mnt/datalake/Video/Example/demo-film.mkv',
    ]),
  ],
};
