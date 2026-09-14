import { applyCommands } from "../server/scene-commands.mjs";
import type { GraphysXAgentWorldApi, AgentWorldCommand, AgentWorldDefinition } from "./agent-world-runtime";
import { buildLlmXMath, reconcileLlmXMathCommands, type LlmXMathConfig } from "./llmx-math";
import { validateLlmXLibraryWorld } from "./llmx-library";

export type LlmXSceneProposal = { schemaVersion: 1; environmentId: string; revision: string; intent: string;
  commands?: AgentWorldCommand[]; math?: LlmXMathConfig };
export type LlmXSceneReceipt = { turnId: string; status: 'applied' | 'rejected'; entityIds: string[]; message?: string };
type SceneIdentity = { environmentId: string; revision: string };
type BuildZone = { center: [number, number, number]; radius: number };
/** The teaching table is a placement suggestion, not the boundary of the world. */
export const llmxMathBuildZone = (zone: BuildZone): BuildZone => ({ center: [-zone.center[0], zone.center[1], zone.center[2]], radius: zone.radius });
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('La modification reçue est incomplète.');
  return value as Record<string, unknown>;
};
const keys = (value: Record<string, unknown>, allowed: string[]) => {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error('La modification contient une propriété inconnue.');
};

/** Preflight uses the shared document validator. Live inputs use the native runtime commit. */
export function prepareLlmXSceneAction(raw: unknown, world: AgentWorldDefinition, identity: SceneIdentity, zone: BuildZone) {
  const proposal = record(raw);
  keys(proposal, ['schemaVersion', 'environmentId', 'revision', 'intent', 'commands', 'math']);
  if (proposal.schemaVersion !== 1 || proposal.environmentId !== identity.environmentId || proposal.revision !== identity.revision) {
    throw new Error('Le décor a changé depuis cette demande. Demande-moi de réessayer ici.');
  }
  if (typeof proposal.intent !== 'string' || !proposal.intent.trim() || proposal.intent.length > 200) throw new Error('L’intention de la modification est manquante.');
  if (('commands' in proposal) === ('math' in proposal)) throw new Error('La modification reçue est ambiguë.');
  let commands: AgentWorldCommand[];
  let message = 'Le monde a été modifié. Tu peux annuler ce geste ou le sauvegarder.';
  if ('math' in proposal) {
    const config = record(proposal.math);
    keys(config, ['operation', 'left', 'right', 'step']);
    const lesson = buildLlmXMath({ ...config, step: config.step ?? 0 } as LlmXMathConfig, llmxMathBuildZone(zone));
    commands = reconcileLlmXMathCommands(world, lesson);
    message = lesson.narrative;
  } else {
    if (!Array.isArray(proposal.commands) || !proposal.commands.length || proposal.commands.length > 40 ||
        new TextEncoder().encode(JSON.stringify(proposal.commands)).byteLength > 65536) throw new Error('Cette modification est trop grande pour un seul geste.');
    commands = structuredClone(proposal.commands) as AgentWorldCommand[];
    for (const command of commands) {
      const value = record(command);
      if (value.op === 'spawn') {
        const entity = record(value.entity);
        const tags = entity.tags ?? [];
        if (!Array.isArray(tags) || tags.some(tag => typeof tag !== 'string')) throw new Error('Étiquettes de création invalides.');
        entity.tags = [...new Set([...tags, 'llmx-creation'])];
      }
    }
  }
  let next = world;
  let pending: AgentWorldCommand[] = [];
  const flush = () => { if (pending.length) { next = applyCommands(next, pending).definition; pending = []; } };
  for (const command of commands) {
    if (['interact', 'steer', 'select'].includes(command.op)) flush();
    if (command.op === 'interact') {
      keys(record(command), ['op', 'id', 'interactionId']);
      const entity = next.entities.find(entry => entry.id === command.id);
      const interaction = command.interactionId ? entity?.interactions?.find(entry => entry.id === command.interactionId) : entity?.interactions?.[0];
      if (!interaction) throw new Error('Cette interaction n’existe pas sur cet objet.');
    } else if (command.op === 'steer') {
      keys(record(command), ['op', 'id', 'input']);
      const entity = next.entities.find(entry => entry.id === command.id);
      if (!entity?.steering || entity.physics?.mode !== 'dynamic') throw new Error('Cet objet ne dispose pas de commandes physiques.');
      const input = record(command.input); keys(input, ['headingDegrees', 'thrust', 'turn', 'kick', 'jump']);
      for (const [key, value] of Object.entries(input)) {
        const min = key === 'headingDegrees' ? -360000 : key === 'kick' || key === 'jump' ? 0 : -1;
        const max = key === 'headingDegrees' ? 360000 : 1;
        if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error('Commande physique invalide.');
      }
    } else if (command.op === 'select') {
      keys(record(command), ['op', 'ids']);
      if (!Array.isArray(command.ids) || command.ids.some(id => !next.entities.some(entity => entity.id === id))) throw new Error('Sélection inconnue.');
    } else pending.push(command);
  }
  flush();
  // Preserve a reloadable conversation room, including its movable face and anchor.
  validateLlmXLibraryWorld(next);
  return { commands, kind: 'math' in proposal ? 'math' as const : 'world' as const, intent: proposal.intent.trim(), message,
    entityIds: [...new Set(commands.flatMap(command => command.op === 'spawn' ? [command.entity.id!] : command.op === 'select' ? command.ids
      : command.op === 'add-joint' ? [command.joint.bodyA, command.joint.bodyB] : 'id' in command ? [String(command.id)] : []))] };
}

/** Turn IDs are consumed even on rejection; replaying history/audio never retries an edit. */
export function createLlmXSceneActions(api: Pick<GraphysXAgentWorldApi, 'exportDocument' | 'state' | 'commit'>,
  identity: () => SceneIdentity, zone: BuildZone, onApplied: (receipt: LlmXSceneReceipt, kind: 'math' | 'world') => void) {
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
          if (!result.ok) throw new Error(result.error || 'La modification n’a pas pu être appliquée.');
        }
        const receipt: LlmXSceneReceipt = { turnId, status: 'applied', entityIds: action.entityIds, message: action.message };
        try { onApplied(receipt, action.kind); } catch { /* Presentation cannot undo a committed edit. */ }
        return receipt;
      } catch (error) {
        return { turnId, status: 'rejected', entityIds: [], message: error instanceof Error ? error.message : 'La modification n’a pas pu être appliquée.' };
      }
    },
  };
}
