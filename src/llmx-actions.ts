import { applyCommands } from "../server/scene-commands.mjs";
import type { GraphysXAgentWorldApi, AgentWorldCommand, AgentWorldDefinition } from "./agent-world-runtime";
import { buildLlmXMath, reconcileLlmXMathCommands, type LlmXMathConfig } from "./llmx-math";
import { validateLlmXCreationBounds } from "./llmx-action-bounds";

export type LlmXSceneProposal = { schemaVersion: 1; environmentId: string; revision: string; intent: string;
  commands?: AgentWorldCommand[]; math?: LlmXMathConfig };
export type LlmXSceneReceipt = { turnId: string; status: 'applied' | 'rejected'; entityIds: string[]; message?: string };
type SceneIdentity = { environmentId: string; revision: string };
type BuildZone = { center: [number, number, number]; radius: number };
/** A separate teaching table keeps unrelated creations out of the counted groups. */
export const llmxMathBuildZone = (zone: BuildZone): BuildZone => ({ center: [-zone.center[0], zone.center[1], zone.center[2]], radius: zone.radius });
const createdId = (id: unknown): id is string => typeof id === 'string' && /^llmx-created-[a-zA-Z0-9._:-]{1,67}$/.test(id);
const shapeTypes = new Set(['box', 'sphere', 'icosahedron', 'cylinder', 'cone', 'torus', 'plane', 'group', 'point-light']);
const fields = new Set(['id', 'type', 'label', 'parentId', 'transform', 'material', 'geometry', 'intensity', 'distance', 'marker', 'visible', 'castShadow', 'receiveShadow', 'tags']);
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('La création reçue est incomplète.');
  return value as Record<string, unknown>;
};
const keys = (value: Record<string, unknown>, allowed: Set<string>) => {
  if (Object.keys(value).some(key => !allowed.has(key))) throw new Error('Cette modification dépasse les objets créés ici.');
};

/** Native document commands, scoped to the user's creations; no code or alternate renderer. */
export function prepareLlmXSceneAction(raw: unknown, world: AgentWorldDefinition, identity: SceneIdentity, zone: BuildZone) {
  const proposal = record(raw);
  keys(proposal, new Set(['schemaVersion', 'environmentId', 'revision', 'intent', 'commands', 'math']));
  if (proposal.schemaVersion !== 1 || proposal.environmentId !== identity.environmentId || proposal.revision !== identity.revision) {
    throw new Error('Le décor a changé depuis cette demande. Demande-moi de réessayer ici.');
  }
  if (typeof proposal.intent !== 'string' || !proposal.intent.trim() || proposal.intent.length > 200) throw new Error('L’intention de la création est manquante.');
  if (('commands' in proposal) === ('math' in proposal)) throw new Error('La création reçue est ambiguë.');
  let commands: AgentWorldCommand[];
  let message: string;
  if ('math' in proposal) {
    const config = record(proposal.math);
    keys(config, new Set(['operation', 'left', 'right', 'step']));
    const lesson = buildLlmXMath({ ...config, step: config.step ?? 0 } as LlmXMathConfig, llmxMathBuildZone(zone));
    commands = reconcileLlmXMathCommands(world, lesson);
    message = lesson.narrative;
  } else {
    if (!Array.isArray(proposal.commands) || !proposal.commands.length || proposal.commands.length > 40 ||
        new TextEncoder().encode(JSON.stringify(proposal.commands)).byteLength > 65536) throw new Error('Cette création est trop grande pour un seul geste.');
    commands = structuredClone(proposal.commands) as AgentWorldCommand[];
    for (const command of commands) {
      const value = record(command);
      const targetId = value.op === 'spawn' ? record(value.entity).id : value.id;
      if (String(targetId).startsWith('llmx-created-math') && !(value.op === 'remove' && targetId === 'llmx-created-math')) {
        throw new Error('Pour changer les quantités, utilise un exercice de l’atelier maths.');
      }
      if (value.op === 'spawn') {
        keys(value, new Set(['op', 'entity']));
        const entity = record(value.entity); keys(entity, fields);
        if (!createdId(entity.id) || !shapeTypes.has(String(entity.type))) throw new Error('Cet objet ne peut pas être créé ici.');
        if (entity.parentId !== undefined && (!createdId(entity.parentId) || entity.parentId.startsWith('llmx-created-math'))) throw new Error('Le décor et l’atelier gardent leurs propres ancrages.');
        if (entity.tags !== undefined && (!Array.isArray(entity.tags) || entity.tags.some(tag => typeof tag !== 'string'))) throw new Error('Étiquettes de création invalides.');
        if ((entity.tags as string[] | undefined)?.some(tag => tag.startsWith('llmx-math'))) throw new Error('Les repères de l’atelier maths sont réservés à ses exercices.');
        entity.tags = [...new Set([...(entity.tags as string[] | undefined ?? []), 'llmx-creation'])];
      } else if (value.op === 'update') {
        keys(value, new Set(['op', 'id', 'patch']));
        if (!createdId(value.id)) throw new Error('Seuls les objets créés ici peuvent être modifiés.');
        const patch = record(value.patch); keys(patch, new Set([...fields].filter(key => !['id', 'type', 'geometry', 'tags'].includes(key))));
        if (patch.parentId !== undefined && (!createdId(patch.parentId) || patch.parentId.startsWith('llmx-created-math'))) throw new Error('Le décor et l’atelier gardent leurs propres ancrages.');
      } else if (value.op === 'remove') {
        keys(value, new Set(['op', 'id']));
        if (!createdId(value.id)) throw new Error('Seuls les objets créés ici peuvent être retirés.');
      } else throw new Error('Cette action n’est pas disponible dans la Forge.');
    }
    message = 'La création est en place. Tu peux l’annuler ou la sauvegarder.';
  }
  if (commands.length) {
    // Full canonical preflight before touching runtime or undo history, including references/budgets.
    const next = applyCommands(world, commands).definition;
    validateLlmXCreationBounds(next, zone, llmxMathBuildZone(zone));
    for (const entity of next.entities) {
      if (!createdId(entity.id)) continue;
      const transform = entity.transform;
      if (transform?.position?.some(value => Math.abs(value) > 50) || transform?.scale?.some(value => value <= 0 || value > 12) ||
          (entity.intensity ?? 0) > 30) throw new Error('Cette création serait trop grande ou trop lumineuse.');
      if (entity.parentId && !createdId(entity.parentId)) throw new Error('Une création doit rester indépendante du visage et du décor.');
    }
    // Removing a parent must never remove a protected authored descendant through cascade semantics.
    const protectedEntities = world.entities.filter(entity => !createdId(entity.id));
    const protectedAfter = next.entities.filter(entity => !createdId(entity.id));
    if (JSON.stringify(protectedEntities) !== JSON.stringify(protectedAfter)) throw new Error('Cette modification toucherait le décor de la Forge.');
  }
  return { commands, intent: proposal.intent.trim(), message,
    entityIds: [...new Set(commands.flatMap(command => command.op === 'spawn' ? [command.entity.id!] : 'id' in command ? [String(command.id)] : []))] };
}

/** Turn IDs are consumed even on rejection; replaying history/audio never retries an edit. */
export function createLlmXSceneActions(api: Pick<GraphysXAgentWorldApi, 'exportDocument' | 'state' | 'commit'>,
  identity: () => SceneIdentity, zone: BuildZone, onApplied: (receipt: LlmXSceneReceipt) => void) {
  const consumed = new Set<string>();
  return {
    apply(raw: unknown, turnId: string): LlmXSceneReceipt {
      if (consumed.has(turnId)) return { turnId, status: 'rejected', entityIds: [], message: 'Cette réponse a déjà été traitée.' };
      consumed.add(turnId);
      try {
        const world = api.exportDocument();
        if (!world) throw new Error('Le décor n’est plus disponible.');
        const action = prepareLlmXSceneAction(raw, world, identity(), zone);
        if (action.commands.length) {
          const result = api.commit({ id: 'llmx-turn-' + turnId, actor: { id: 'llmx-agent', kind: 'agent', label: 'Notre agent' },
            intent: action.intent, expectedRevision: api.state()!.revision, commands: action.commands });
          if (!result.ok) throw new Error(result.error || 'La création n’a pas pu être appliquée.');
        }
        const receipt: LlmXSceneReceipt = { turnId, status: 'applied', entityIds: action.entityIds, message: action.message };
        // Presentation is optional; a rendering callback cannot turn a committed edit into a rejection.
        try { onApplied(receipt); } catch { /* The receipt remains the actual native commit outcome. */ }
        return receipt;
      } catch (error) {
        return { turnId, status: 'rejected', entityIds: [], message: error instanceof Error ? error.message : 'La création n’a pas pu être appliquée.' };
      }
    },
  };
}
