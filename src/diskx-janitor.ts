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
