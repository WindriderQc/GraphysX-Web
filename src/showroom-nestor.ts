import type {
  AgentWorldCommand,
  AgentWorldCommitSummary,
  AgentWorldEntityDefinition,
  GraphysXAgentWorldApi,
} from "./agent-world-runtime";
import { createProposal, includedCommands, isProposalEmpty, isProposalStale, toggleCommandInclusion } from "./coauthor-proposal";
import type { CoauthorOutcome, CoauthorProposal } from "./coauthor-proposal";

export type NestorTopic = "build" | "play" | "explore";

/** One identity for every commit Nestor makes, whether proposed first or not. */
const NESTOR_ACTOR = { id: "nestor", label: "Nestor", kind: "agent" } as const;

export const NESTOR_AGENT_ID = "showroom-nestor";
export const NESTOR_STAGE_ID = "showroom-nestor-stage";
export const NESTOR_BUILD_ID = "showroom-nestor-build";

export const NESTOR_TOPICS: readonly NestorTopic[] = ["build", "play", "explore"];

const TOPIC_COLOR: Record<NestorTopic, string> = {
  build: "#63e6ff",
  play: "#76f0ae",
  explore: "#bd9cff",
};

const TOPIC_EMISSIVE: Record<NestorTopic, string> = {
  build: "#126b80",
  play: "#176b4a",
  explore: "#4c328d",
};

const TOPIC_TARGET: Record<NestorTopic, string> = {
  build: NESTOR_BUILD_ID,
  play: "showroom-plinth",
  explore: "showroom-starlings",
};

const NESTOR_CENTER_REQUIRED_IDS = [
  NESTOR_STAGE_ID,
  NESTOR_AGENT_ID,
  "showroom-nestor-aura",
  "showroom-nestor-light",
  ...NESTOR_TOPICS.flatMap((topic) => [
    `showroom-nestor-console-${topic}`,
    `showroom-nestor-console-${topic}:core`,
  ]),
  "showroom-block-3",
  "showroom-block-5",
  "showroom-orb-0",
  "showroom-orb-1",
  "showroom-plinth",
  "showroom-starlings",
  "showroom-cubx-swarm",
] as const;

export const isNestorCenterReady = (api: GraphysXAgentWorldApi): boolean =>
  api.query({ ids: [...NESTOR_CENTER_REQUIRED_IDS] }).length === NESTOR_CENTER_REQUIRED_IDS.length;

export type NestorPresentation = {
  topic: NestorTopic | null;
  eyebrow: string;
  title: string;
  message: string;
  targetId: string;
  commit: AgentWorldCommitSummary | null;
  error: string | null;
};

export type NestorPresenterState = {
  agentId: typeof NESTOR_AGENT_ID;
  status: string;
  topic: NestorTopic | null;
  targetId: string;
  presentation: NestorPresentation;
  agent: ReturnType<GraphysXAgentWorldApi["query"]>[number]["agent"] | null;
  lastCommit: AgentWorldCommitSummary | null;
  /** The change awaiting a human decision, or null when nothing is pending. */
  proposal: CoauthorProposal | null;
  /** True when the world moved after the proposal was composed, so accepting cannot work. */
  proposalStale: boolean;
  /** What happened to the last decided proposal, so the panel can report it honestly. */
  lastOutcome: CoauthorOutcome | null;
};

export interface NestorPresenter {
  /**
   * Compose a topic's change set and hold it for a human decision. Nothing is committed and
   * the scene does not move — this is the whole point of the co-author queue.
   */
  propose: (topic: NestorTopic) => CoauthorProposal;
  /**
   * Include or exclude one command of the pending proposal, keeping the selection consistent:
   * dropping a command that creates an entity drops what needs it, and restoring a dependent
   * restores its creator.
   */
  toggleProposalCommand: (index: number) => CoauthorProposal | null;
  /**
   * Commit the held proposal, at the revision it was composed against. Sending the original
   * `expectedRevision` is deliberate: if the world moved while the human was reading, the
   * runtime refuses it rather than applying a change that was decided against a stale view.
   */
  accept: () => NestorPresentation;
  /** Drop the held proposal. Nothing was committed, so there is nothing to undo. */
  discard: () => NestorPresentation;
  /**
   * The pre-proposal path: compose and commit in one step, with no human gate. Retained for
   * the physical console route and the existing showroom smoke; the DOM buttons go through
   * `propose` so the person sees the change before it happens.
   */
  present: (topic: NestorTopic) => NestorPresentation;
  reset: () => NestorPresentation;
  state: () => NestorPresenterState;
}

const READY_PRESENTATION: NestorPresentation = {
  topic: null,
  eyebrow: "NESTOR ONLINE",
  title: "What should we make real?",
  message: "Pick a live demo. I’ll change this scene with the same inspectable commands available to every AgentX collaborator.",
  targetId: NESTOR_STAGE_ID,
  commit: null,
  error: null,
};

/**
 * Scene-native geometry for the AgentX Center guide and its three physical topic consoles.
 * Nothing here relies on private renderer objects: the avatar, light, particles, stage and
 * controls all survive export/load as ordinary v2 entities.
 */
export function buildNestorCenter(): AgentWorldEntityDefinition[] {
  // These roots deliberately remain top-level. Interaction routing climbs to the outermost
  // entity, so each console keeps its physical `nestor-topic:*` contract while its children
  // provide a much more legible presentation bay.
  const consoleDefinitions: Array<{
    topic: NestorTopic;
    label: string;
    position: [number, number, number];
  }> = [
    { topic: "build", label: "Build Console", position: [2.8, 0, 2.8] },
    { topic: "play", label: "Play Console", position: [8.2, 0, 2.4] },
    { topic: "explore", label: "Explore Console", position: [8.4, 0, -1.5] },
  ];

  const consoles = consoleDefinitions.flatMap(({ topic, label, position }): AgentWorldEntityDefinition[] => {
    const id = `showroom-nestor-console-${topic}`;
    const color = TOPIC_COLOR[topic];
    const emissive = TOPIC_EMISSIVE[topic];
    const topicTags = ["showroom", "agentx-center", "nestor-console", `nestor-topic:${topic}`];
    const glyph: AgentWorldEntityDefinition = topic === "build"
      ? {
          id: `${id}:glyph`,
          parentId: id,
          type: "box",
          label: `${label} Build Glyph`,
          geometry: { width: 0.72, height: 0.48, depth: 0.08 },
          transform: { position: [0, 1.2, -0.41] },
          material: { color, emissive, emissiveIntensity: 1.7, roughness: 0.12, metalness: 0.3 },
          castShadow: false,
          tags: topicTags,
        }
      : topic === "play"
        ? {
            id: `${id}:glyph`,
            parentId: id,
            type: "cone",
            label: `${label} Play Glyph`,
            geometry: { radius: 0.36, height: 0.58, radialSegments: 3 },
            transform: { position: [0, 1.2, -0.42], rotationDegrees: [90, 0, 0] },
            material: { color, emissive, emissiveIntensity: 1.7, roughness: 0.12, metalness: 0.3 },
            castShadow: false,
            tags: topicTags,
          }
        : {
            id: `${id}:glyph`,
            parentId: id,
            type: "torus",
            label: `${label} Explore Glyph`,
            geometry: { radius: 0.31, tube: 0.065, radialSegments: 32 },
            transform: { position: [0, 1.2, -0.42] },
            material: { color, emissive, emissiveIntensity: 1.7, roughness: 0.12, metalness: 0.3 },
            castShadow: false,
            tags: topicTags,
          };

    return [
      {
        id,
        type: "group",
        label,
        transform: { position },
        tags: topicTags,
      },
      {
        id: `${id}:base`,
        parentId: id,
        type: "cylinder",
        label: `${label} Base`,
        geometry: { radius: 0.76, height: 0.28, radialSegments: 16 },
        transform: { position: [0, 0.14, 0] },
        material: { color: "#172e39", emissive, emissiveIntensity: 0.24, roughness: 0.4, metalness: 0.72 },
        castShadow: false,
        tags: topicTags,
      },
      {
        id: `${id}:screen`,
        parentId: id,
        type: "box",
        label: `${label} Display`,
        geometry: { width: 1.72, height: 1.18, depth: 0.12 },
        transform: { position: [0, 1.2, -0.5] },
        material: { color: "#071722", emissive, emissiveIntensity: 0.72, roughness: 0.16, metalness: 0.76 },
        castShadow: false,
        tags: topicTags,
      },
      {
        id: `${id}:screen-header`,
        parentId: id,
        type: "box",
        label: `${label} Display Header`,
        geometry: { width: 1.22, height: 0.09, depth: 0.06 },
        transform: { position: [0, 1.61, -0.58] },
        material: { color, emissive, emissiveIntensity: 1.95, roughness: 0.1, metalness: 0.35 },
        castShadow: false,
        tags: topicTags,
      },
      glyph,
      {
        id: `${id}:ring`,
        parentId: id,
        type: "torus",
        label: `${label} Signal Ring`,
        geometry: { radius: 0.61, tube: 0.045, radialSegments: 40 },
        transform: { position: [0, 0.4, 0], rotationDegrees: [90, 0, 0] },
        material: { color, emissive, emissiveIntensity: 1.05, roughness: 0.2, metalness: 0.65 },
        behaviors: [{ id: `${topic}-console-spin`, type: "spin", axis: "z", speedDegrees: topic === "play" ? -22 : 18 }],
        castShadow: false,
        tags: topicTags,
      },
      {
        id: `${id}:core`,
        parentId: id,
        type: "icosahedron",
        label: `${label} Core`,
        geometry: { radius: 0.34, radialSegments: 24 },
        transform: { position: [0, 0.72, 0.08] },
        material: { color, emissive, emissiveIntensity: 1.2, roughness: 0.16, metalness: 0.44 },
        behaviors: [{ id: `${topic}-console-pulse`, type: "pulse", minimumScale: 0.86, maximumScale: 1.14, frequencyHz: 0.7 }],
        castShadow: false,
        tags: topicTags,
      },
    ];
  });

  const nestorTags = ["showroom", "agentx-center", "nestor", "nestor-home"];
  const homeTags = ["showroom", "agentx-center", "nestor-home"];

  return [
    {
      id: NESTOR_STAGE_ID,
      type: "group",
      label: "Nestor Command Stage",
      // The right-side presentation lane stays clear of the welcome card while keeping CubX
      // in Nestor's raised-hand sightline.
      transform: { position: [5.25, 0, 0.8] },
      tags: homeTags,
    },
    {
      id: "showroom-nestor-dais",
      parentId: NESTOR_STAGE_ID,
      type: "cylinder",
      label: "Nestor Dais",
      geometry: { radius: 2.12, height: 0.34, radialSegments: 32 },
      transform: { position: [0, 0.17, 0] },
      material: { color: "#102c39", emissive: "#0c6076", emissiveIntensity: 0.5, roughness: 0.28, metalness: 0.72 },
      castShadow: false,
      tags: homeTags,
    },
    {
      id: "showroom-nestor-dais-ring",
      parentId: NESTOR_STAGE_ID,
      type: "torus",
      label: "Nestor Dais Ring",
      geometry: { radius: 1.8, tube: 0.055, radialSegments: 64 },
      transform: { position: [0, 0.38, 0], rotationDegrees: [90, 0, 0] },
      material: { color: "#70edff", emissive: "#16768f", emissiveIntensity: 1.35, roughness: 0.12, metalness: 0.7 },
      behaviors: [{ id: "nestor-dais-spin", type: "spin", axis: "z", speedDegrees: 10 }],
      castShadow: false,
      tags: homeTags,
    },
    {
      id: NESTOR_AGENT_ID,
      parentId: NESTOR_STAGE_ID,
      type: "agent",
      label: "Nestor · AgentX Guide",
      geometry: { radius: 1.15, height: 5.2, radialSegments: 28 },
      // Agent avatars face local -Z. Turn the full scene-native rig toward the +Z camera.
      transform: { position: [0, 0.38, 0], rotationDegrees: [0, 180, 0] },
      material: { color: "#3fc8df", emissive: "#0d566b", emissiveIntensity: 0.95, roughness: 0.22, metalness: 0.58 },
      agent: {
        role: "AgentX Center guide",
        status: "ready",
        perceptionRadius: 12,
        capabilities: ["present", "build", "play", "explore"],
      },
      behaviors: [{ id: "nestor-hover", type: "bob", axis: "y", amplitude: 0.08, frequencyHz: 0.32 }],
      tags: nestorTags,
    },
    {
      id: "showroom-nestor-face",
      parentId: NESTOR_AGENT_ID,
      type: "box",
      label: "Nestor Face Display",
      geometry: { width: 1.58, height: 0.76, depth: 0.14 },
      transform: { position: [0, 4.1, -1.02] },
      material: { color: "#071a25", emissive: "#0a4255", emissiveIntensity: 0.9, roughness: 0.12, metalness: 0.62 },
      castShadow: false,
      tags: nestorTags,
    },
    {
      id: "showroom-nestor-eye-left",
      parentId: NESTOR_AGENT_ID,
      type: "box",
      label: "Nestor Left Eye",
      geometry: { width: 0.25, height: 0.11, depth: 0.07 },
      transform: { position: [-0.34, 4.12, -1.11] },
      material: { color: "#d8fbff", emissive: "#5ceaff", emissiveIntensity: 2.2, roughness: 0.08, metalness: 0.2 },
      castShadow: false,
      tags: nestorTags,
    },
    {
      id: "showroom-nestor-eye-right",
      parentId: NESTOR_AGENT_ID,
      type: "box",
      label: "Nestor Right Eye",
      geometry: { width: 0.25, height: 0.11, depth: 0.07 },
      transform: { position: [0.34, 4.12, -1.11] },
      material: { color: "#d8fbff", emissive: "#5ceaff", emissiveIntensity: 2.2, roughness: 0.08, metalness: 0.2 },
      castShadow: false,
      tags: nestorTags,
    },
    {
      id: "showroom-nestor-chest-display",
      parentId: NESTOR_AGENT_ID,
      type: "box",
      label: "Nestor Chest Display",
      geometry: { width: 1.42, height: 0.78, depth: 0.14 },
      transform: { position: [0, 2.38, -1.02] },
      material: { color: "#071a25", emissive: "#106d82", emissiveIntensity: 1.12, roughness: 0.12, metalness: 0.66 },
      castShadow: false,
      tags: nestorTags,
    },
    {
      id: "showroom-nestor-chest-signal",
      parentId: NESTOR_AGENT_ID,
      type: "box",
      label: "Nestor Chest Signal",
      geometry: { width: 0.92, height: 0.1, depth: 0.07 },
      transform: { position: [0, 2.38, -1.11] },
      material: { color: "#aff7ff", emissive: "#4de6ff", emissiveIntensity: 2, roughness: 0.08, metalness: 0.2 },
      castShadow: false,
      tags: nestorTags,
    },
    {
      id: "showroom-nestor-arm-present",
      parentId: NESTOR_AGENT_ID,
      type: "cylinder",
      label: "Nestor Presenting Arm",
      geometry: { radius: 0.17, height: 1.58, radialSegments: 16 },
      transform: { position: [1.3, 3.05, -0.08], rotationDegrees: [0, 0, -56] },
      material: { color: "#49cde2", emissive: "#0d566b", emissiveIntensity: 0.82, roughness: 0.24, metalness: 0.54 },
      tags: nestorTags,
    },
    {
      id: "showroom-nestor-hand-present",
      parentId: NESTOR_AGENT_ID,
      type: "sphere",
      label: "Nestor Presenting Hand",
      geometry: { radius: 0.29, radialSegments: 18 },
      transform: { position: [1.72, 3.4, -0.1] },
      material: { color: "#aff7ff", emissive: "#197d96", emissiveIntensity: 1.08, roughness: 0.2, metalness: 0.45 },
      tags: nestorTags,
    },
    {
      id: "showroom-nestor-arm-rest",
      parentId: NESTOR_AGENT_ID,
      type: "cylinder",
      label: "Nestor Resting Arm",
      geometry: { radius: 0.17, height: 1.5, radialSegments: 16 },
      transform: { position: [-1.25, 2.48, -0.06], rotationDegrees: [0, 0, 44] },
      material: { color: "#49cde2", emissive: "#0d566b", emissiveIntensity: 0.82, roughness: 0.24, metalness: 0.54 },
      tags: nestorTags,
    },
    {
      id: "showroom-nestor-hand-rest",
      parentId: NESTOR_AGENT_ID,
      type: "sphere",
      label: "Nestor Resting Hand",
      geometry: { radius: 0.27, radialSegments: 18 },
      transform: { position: [-1.66, 1.96, -0.08] },
      material: { color: "#aff7ff", emissive: "#197d96", emissiveIntensity: 1.02, roughness: 0.2, metalness: 0.45 },
      tags: nestorTags,
    },
    {
      id: "showroom-nestor-halo",
      parentId: NESTOR_STAGE_ID,
      type: "torus",
      label: "Nestor Holographic Halo",
      geometry: { radius: 1.66, tube: 0.045, radialSegments: 64 },
      transform: { position: [0, 4.55, 0], rotationDegrees: [12, 0, 0] },
      material: { color: "#aaf5ff", emissive: "#197d96", emissiveIntensity: 1.7, roughness: 0.12, metalness: 0.52 },
      behaviors: [{ id: "nestor-halo-spin", type: "spin", axis: "y", speedDegrees: 28 }],
      castShadow: false,
      tags: homeTags,
    },
    {
      id: "showroom-nestor-aura",
      parentId: NESTOR_STAGE_ID,
      type: "emitter",
      label: "Nestor Signal Aura",
      transform: { position: [0, 3.9, 0] },
      emitter: { preset: "energy-orb", sizeScale: 2.8, speed: 1.6, spread: 1.6, maxParticles: 24, rate: 30, color: "#6fe9ff" },
      tags: homeTags,
    },
    {
      id: "showroom-nestor-light",
      parentId: NESTOR_STAGE_ID,
      type: "point-light",
      label: "Nestor Stage Light",
      transform: { position: [-1.5, 3.7, 1.6] },
      intensity: 3.8,
      distance: 11,
      marker: false,
      material: { color: "#72eaff", emissive: "#167b94", emissiveIntensity: 1.6 },
      castShadow: false,
      tags: homeTags,
    },
    {
      id: "showroom-nestor-key-light",
      parentId: NESTOR_STAGE_ID,
      type: "point-light",
      label: "Nestor Warm Key Light",
      transform: { position: [2.4, 5.1, 2.8] },
      intensity: 5.4,
      distance: 12,
      marker: false,
      material: { color: "#ffd5ad", emissive: "#7c3f1a", emissiveIntensity: 1.2 },
      castShadow: false,
      tags: homeTags,
    },
    ...consoles,
  ];
}
/**
 * Runs Nestor's demos through attributed world commits. The controller owns presentation
 * state only; scene state remains authoritative and exportable through the public API.
 */
export function createNestorPresenter(options: {
  api: GraphysXAgentWorldApi;
  focusEntity?: (id: string) => boolean;
}): NestorPresenter {
  const { api, focusEntity } = options;
  let presentation = clonePresentation(READY_PRESENTATION);
  let status = "ready";
  let lastCommit: AgentWorldCommitSummary | null = null;
  /** The change composed and waiting for a human decision. Never touches the scene. */
  let proposal: CoauthorProposal | null = null;
  let proposedTopic: NestorTopic | null = null;
  let lastOutcome: CoauthorOutcome | null = null;
  let failedPresentation: {
    revision: number;
    agentStatus: string | undefined;
    presentation: NestorPresentation;
  } | null = null;

  const topicFromStatus = (value: string | undefined): NestorTopic | null => {
    const topic = value?.startsWith("presenting:") ? value.slice("presenting:".length) : null;
    return topic === "build" || topic === "play" || topic === "explore" ? topic : null;
  };

  /**
   * Undo, redo and document loads replace scene state without replacing this controller.
   * Rebuild the narration from the scene-native agent on every public read so the card can
   * never claim a demonstration whose entities have already been reverted or replaced.
   */
  const reconcile = () => {
    const agent = api.query({ ids: [NESTOR_AGENT_ID] })[0]?.agent ?? null;
    const revision = api.state()?.revision ?? 0;
    if (
      failedPresentation &&
      failedPresentation.revision === revision &&
      failedPresentation.agentStatus === agent?.status
    ) {
      status = "attention";
      lastCommit = null;
      presentation = clonePresentation(failedPresentation.presentation);
      return agent;
    }
    failedPresentation = null;

    const topic = topicFromStatus(agent?.status);
    if (!topic) {
      status = agent?.status ?? "offline";
      lastCommit = null;
      presentation = clonePresentation(READY_PRESENTATION);
      return agent;
    }

    const targetId = TOPIC_TARGET[topic];
    if (api.query({ ids: [targetId] }).length === 0) {
      const error = `The ${topic} demonstration target is no longer present in this scene.`;
      status = "attention";
      lastCommit = null;
      presentation = {
        topic,
        eyebrow: "NESTOR NEEDS A HAND",
        title: "This demonstration changed underneath me.",
        message: `${error} Restore it or choose another scene before presenting again.`,
        targetId: NESTOR_STAGE_ID,
        commit: null,
        error,
      };
      return agent;
    }

    lastCommit = api.history()
      .filter((entry) => entry.actor.id === "nestor" && entry.intent === intentFor(topic))
      .pop() ?? null;
    status = agent?.status ?? `presenting:${topic}`;
    presentation = successfulPresentation(topic, targetId, lastCommit);
    return agent;
  };

  /**
   * Compose without committing.
   *
   * Reconciles first so the proposal is built against the world as it is right now — a
   * proposal composed from a stale read would be born stale and refuse itself on accept.
   */
  const propose = (topic: NestorTopic): CoauthorProposal => {
    reconcile();
    lastOutcome = null;
    proposal = createProposal({
      actor: NESTOR_ACTOR,
      intent: intentFor(topic),
      expectedRevision: api.state()?.revision ?? 0,
      commands: presentationCommands(api, topic),
    });
    proposedTopic = topic;
    return proposal;
  };

  /** Include or exclude one command of the pending proposal. Returns the updated proposal. */
  const toggleProposalCommand = (index: number): CoauthorProposal | null => {
    if (!proposal) return null;
    proposal = toggleCommandInclusion(proposal, index);
    return proposal;
  };

  const discard = (): NestorPresentation => {
    if (proposal) lastOutcome = { status: "discarded", proposal };
    proposal = null;
    proposedTopic = null;
    // Deliberately no scene call of any kind. A discarded proposal must leave the document,
    // the revision and the history exactly as they were, because nothing happened.
    return clonePresentation(presentation);
  };

  const accept = (): NestorPresentation => {
    if (!proposal || !proposedTopic) return clonePresentation(presentation);
    const held = proposal;
    const topic = proposedTopic;
    const currentRevision = api.state()?.revision ?? 0;
    if (isProposalStale(held, currentRevision)) {
      // Reported before the commit is attempted, so the person is told the world moved rather
      // than handed a rejection they did not cause. The commit below would refuse it anyway.
      lastOutcome = { status: "stale", proposal: held, currentRevision };
      proposal = null;
      proposedTopic = null;
      return clonePresentation(presentation);
    }
    if (isProposalEmpty(held)) {
      // Narrowed to nothing. That is a discard expressed a different way, and calling it one
      // is more honest than committing an empty transaction to say the same thing.
      lastOutcome = { status: "discarded", proposal: held };
      proposal = null;
      proposedTopic = null;
      return clonePresentation(presentation);
    }
    proposal = null;
    proposedTopic = null;
    const outcome = present(topic, held);
    lastOutcome = outcome.error
      ? { status: "rejected", proposal: held, error: outcome.error }
      : { status: "accepted", proposal: held, commit: outcome.commit };
    return outcome;
  };

  /**
   * `held` is supplied when this is an accepted proposal, so the commit carries the revision
   * the human actually saw rather than one re-read a moment later.
   */
  const present = (topic: NestorTopic, held?: CoauthorProposal): NestorPresentation => {
    reconcile();
    const targetId = TOPIC_TARGET[topic];
    // `includedCommands`, not `commands`: if the person took lines out, the commit is what
    // they left in. Sending the original set would apply changes they explicitly removed.
    const commands = held ? includedCommands(held) : presentationCommands(api, topic);
    const result = api.commit({
      actor: NESTOR_ACTOR,
      intent: intentFor(topic),
      expectedRevision: held?.expectedRevision ?? api.state()?.revision ?? 0,
      commands,
    });

    if (!result.ok) {
      lastCommit = null;
      status = "attention";
      presentation = {
        topic,
        eyebrow: "NESTOR NEEDS A HAND",
        title: "That demonstration did not land.",
        message: result.error ?? "The scene rejected the change.",
        targetId: NESTOR_STAGE_ID,
        commit: null,
        error: result.error ?? "The scene rejected the change.",
      };
      failedPresentation = {
        revision: api.state()?.revision ?? 0,
        agentStatus: api.query({ ids: [NESTOR_AGENT_ID] })[0]?.agent?.status,
        presentation: clonePresentation(presentation),
      };
      focusEntity?.(NESTOR_STAGE_ID);
      return clonePresentation(presentation);
    }

    failedPresentation = null;
    lastCommit = result.value?.commit ?? null;
    status = `presenting:${topic}`;
    presentation = successfulPresentation(topic, targetId, lastCommit);
    focusEntity?.(targetId);
    return clonePresentation(presentation);
  };

  return {
    propose,
    toggleProposalCommand,
    accept,
    discard,
    present: (topic: NestorTopic) => present(topic),
    reset: () => {
      failedPresentation = null;
      status = "ready";
      lastCommit = null;
      proposal = null;
      proposedTopic = null;
      lastOutcome = null;
      presentation = clonePresentation(READY_PRESENTATION);
      return clonePresentation(presentation);
    },
    state: () => {
      const agent = reconcile();
      return {
        agentId: NESTOR_AGENT_ID,
        status,
        topic: presentation.topic,
        targetId: presentation.targetId,
        presentation: clonePresentation(presentation),
        agent,
        lastCommit: lastCommit ? { ...lastCommit, actor: { ...lastCommit.actor } } : null,
        proposal,
        proposalStale: proposal ? isProposalStale(proposal, api.state()?.revision ?? 0) : false,
        lastOutcome,
      };
    },
  };
}

function presentationCommands(api: GraphysXAgentWorldApi, topic: NestorTopic): AgentWorldCommand[] {
  const color = TOPIC_COLOR[topic];
  const emissive = TOPIC_EMISSIVE[topic];
  const commands: AgentWorldCommand[] = [
    {
      op: "update",
      id: NESTOR_AGENT_ID,
      patch: {
        agent: { status: `presenting:${topic}` },
        material: { color, emissive, emissiveIntensity: 1.2 },
      },
    },
    {
      op: "update",
      id: "showroom-nestor-aura",
      patch: { emitter: { preset: "energy-orb", color, speed: topic === "play" ? 3.2 : 2.1, spread: topic === "explore" ? 2.4 : 1.7 } },
    },
    {
      op: "update",
      id: "showroom-nestor-light",
      patch: { material: { color, emissive }, intensity: 5.4 },
    },
  ];

  for (const candidate of NESTOR_TOPICS) {
    const active = candidate === topic;
    commands.push({
      op: "update",
      id: `showroom-nestor-console-${candidate}:core`,
      patch: {
        material: {
          color: active ? TOPIC_COLOR[candidate] : "#67818c",
          emissive: active ? TOPIC_EMISSIVE[candidate] : "#152c35",
          emissiveIntensity: active ? 1.8 : 0.28,
        },
      },
    });
  }

  if (topic === "build") {
    if (api.query({ ids: [NESTOR_BUILD_ID] }).length > 0) commands.push({ op: "remove", id: NESTOR_BUILD_ID });
    commands.push(
      {
        op: "spawn-prefab",
        prefabId: "signal-beacon",
        options: {
          idPrefix: NESTOR_BUILD_ID,
          position: [5, 0, -2.5],
          scale: [0.78, 0.78, 0.78],
          palette: { primary: "#5ee8ff", secondary: "#183f57", accent: "#d1a4ff", emissive: "#126f88" },
          tags: ["showroom", "agentx-center", "nestor-demo", "nestor-build"],
        },
      },
      { op: "update", id: NESTOR_BUILD_ID, patch: { label: "Nestor's Signal Beacon" } },
      { op: "select", ids: [NESTOR_BUILD_ID] },
    );
  } else if (topic === "play") {
    commands.push(
      { op: "interact", id: "showroom-block-5" },
      { op: "interact", id: "showroom-block-3" },
      { op: "interact", id: "showroom-orb-0" },
      { op: "interact", id: "showroom-orb-1" },
      { op: "select", ids: ["showroom-plinth"] },
    );
  } else {
    commands.push(
      {
        op: "update",
        id: "showroom-starlings",
        patch: { flock: { speed: 6.2, cohesion: 1.35, color: "#6fe2ff", emissive: "#123f58", emissiveIntensity: 0.72 } },
      },
      {
        op: "update",
        id: "showroom-cubx-swarm",
        patch: { flock: { speed: 1.8, color: "#d9c2ff", emissive: "#5635a0", trailColor: "#b697ff" } },
      },
      { op: "select", ids: ["showroom-starlings", "showroom-cubx-swarm"] },
    );
  }
  return commands;
}

function intentFor(topic: NestorTopic): string {
  if (topic === "build") return "Assemble a signal beacon in the AgentX Center";
  if (topic === "play") return "Wake the kinetic playground with shared scene interactions";
  return "Illuminate the showroom's living flock systems";
}

function successfulPresentation(topic: NestorTopic, targetId: string, commit: AgentWorldCommitSummary | null): NestorPresentation {
  if (topic === "build") {
    return {
      topic,
      eyebrow: "NESTOR · BUILD",
      title: "I assembled a signal beacon.",
      message: "That was one attributed AgentX transaction. Open the editor and you’ll find every ring, light, and material waiting in the outliner.",
      targetId,
      commit,
      error: null,
    };
  }
  if (topic === "play") {
    return {
      topic,
      eyebrow: "NESTOR · PLAY",
      title: "Physics is live scene vocabulary.",
      message: "I nudged the same bodies you can click. Their impulses, collisions, and chime belong to the document—not a private demo script.",
      targetId,
      commit,
      error: null,
    };
  }
  return {
    topic,
    eyebrow: "NESTOR · EXPLORE",
    title: "The world can behave, not just sit still.",
    message: "I retuned both flock systems in place. Their motion, palette, and trails remain inspectable scene data.",
    targetId,
    commit,
    error: null,
  };
}

function clonePresentation(value: NestorPresentation): NestorPresentation {
  return {
    ...value,
    commit: value.commit ? { ...value.commit, actor: { ...value.commit.actor } } : null,
  };
}
