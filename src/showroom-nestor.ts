import type {
  AgentWorldCommand,
  AgentWorldCommitSummary,
  AgentWorldEntityDefinition,
  GraphysXAgentWorldApi,
} from "./agent-world-runtime";
import { createProposal, includedCommands, isProposalEmpty, isProposalStale, toggleCommandInclusion } from "./coauthor-proposal";
import type { CoauthorActor, CoauthorOutcome, CoauthorProposal } from "./coauthor-proposal";

/** The three physical consoles, each with a locally composed demonstration. */
export type NestorConsoleTopic = "build" | "play" | "explore";
/**
 * `request` is a change asked for in the person's own words and composed by a provider. It has
 * no console, no local composition and no fixed target: the card shows the provider's intent
 * and the camera goes to whatever the accepted commands made.
 */
export type NestorTopic = NestorConsoleTopic | "request";

/** What a proposal composed elsewhere may say about itself beyond its intent and commands. */
export type ExternalProposalOptions = {
  /** Who proposes. Defaults to Nestor; a pushed proposal says which Nestor (`Nestor · Core`). */
  actor?: CoauthorActor;
  /**
   * The revision the composer read. Defaults to the current one. A pushed proposal composed
   * against an older revision is held at that revision, so the card shows it stale and Apply
   * refuses it, rather than silently re-reading the world the composer never saw.
   */
  expectedRevision?: number;
  /** Core's id for the push that carried this proposal; the decision is reported under it. */
  pushId?: string;
};

/** One identity for every commit Nestor makes, whether proposed first or not. */
const NESTOR_ACTOR = { id: "nestor", label: "Nestor", kind: "agent" } as const;

export const NESTOR_AGENT_ID = "showroom-nestor";
export const NESTOR_STAGE_ID = "showroom-nestor-stage";
export const NESTOR_BUILD_ID = "showroom-nestor-build";

export const NESTOR_TOPICS: readonly NestorConsoleTopic[] = ["build", "play", "explore"];

const TOPIC_COLOR: Record<NestorConsoleTopic, string> = {
  build: "#63e6ff",
  play: "#76f0ae",
  explore: "#bd9cff",
};

const TOPIC_EMISSIVE: Record<NestorConsoleTopic, string> = {
  build: "#126b80",
  play: "#176b4a",
  explore: "#4c328d",
};

const TOPIC_TARGET: Record<NestorConsoleTopic, string> = {
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
  "showroom-cubx",
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
  propose: (topic: NestorConsoleTopic) => CoauthorProposal;
  /**
   * Compose from a command list somebody else wrote — a model provider. Downstream nothing can
   * tell the difference, which is the point: a provider gets no path the local composer lacks,
   * and no path around the human gate. A pushed proposal (docs/NESTOR_PROPOSALS.md, phase 2)
   * names who proposes and the revision it was composed against; a reply to a request does not.
   */
  proposeExternal: (topic: NestorTopic, intent: string, commands: AgentWorldCommand[], options?: ExternalProposalOptions) => CoauthorProposal;
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
  present: (topic: NestorConsoleTopic) => NestorPresentation;
  reset: () => NestorPresentation;
  state: () => NestorPresenterState;
}

const READY_PRESENTATION: NestorPresentation = {
  topic: null,
  eyebrow: "NESTOR ONLINE",
  title: "What should we make real?",
  message: "Pick a demo or ask; nothing changes until you accept.",
  targetId: NESTOR_STAGE_ID,
  commit: null,
  error: null,
};

/**
 * Nestor's document identity, scene lighting and three small physical topic orbs.
 * The guide stays in the interface; no humanoid geometry competes with the landscape.
 * All signals and attributed state survive export/load as ordinary v2 entities.
 */
export function buildNestorCenter(): AgentWorldEntityDefinition[] {
  const consoles: AgentWorldEntityDefinition[] = NESTOR_TOPICS.flatMap((topic, index) => {
    const id = `showroom-nestor-console-${topic}`;
    const positions: [number, number, number][] = [[2.8, 0, 2.8], [8.2, 0, 2.4], [8.4, 0, -1.5]];
    const color = ["#88cddc", "#d5b080", "#96abc6"][index];
    return [
      { id, type: "group", label: `${topic} orb`, transform: { position: positions[index] },
        tags: ["showroom", "agentx-center", "nestor-console", `nestor-topic:${topic}`] },
      { id: `${id}:core`, parentId: id, type: "sphere", label: `${topic} signal`, geometry: { radius: 0.48, radialSegments: 40 },
        transform: { position: [0, 1, 0] }, material: { color, emissive: "#1c3c4d", emissiveIntensity: 0.4, roughness: 0.18, metalness: 0.7 },
        behaviors: [{ id: `${topic}-float`, type: "bob", axis: "y", amplitude: 0.09, frequencyHz: 0.25 }], tags: ["showroom", "nestor-signal"] },
      { id: `${id}:ring`, parentId: id, type: "torus", label: `${topic} rim`, geometry: { radius: 0.65, tube: 0.014, radialSegments: 48 },
        transform: { position: [0, 1, 0], rotationDegrees: [80, 0, 12] }, material: { color, emissive: "#376778", emissiveIntensity: 0.7, roughness: 0.25, metalness: 0.7 },
        tags: ["showroom", "nestor-signal"] },
    ];
  });
  return [
    { id: NESTOR_STAGE_ID, type: "group", label: "Nestor Presence", transform: { position: [0, 0, -6.2] }, tags: ["showroom", "agentx-center", "nestor-home"] },
    // Identity and attributed proposals remain canonical. The welcome no longer draws a robot.
    { id: NESTOR_AGENT_ID, parentId: NESTOR_STAGE_ID, type: "agent", label: "Nestor · AgentX Guide", visible: false,
      transform: { position: [0, 5.2, 0] }, agent: { role: "GraphysX guide", status: "ready", perceptionRadius: 12, capabilities: ["present", "build", "play", "explore"] },
      tags: ["showroom", "agentx-center", "nestor", "nestor-home"] },
    { id: "showroom-nestor-aura", parentId: NESTOR_STAGE_ID, type: "emitter", label: "Nestor Signal Aura", transform: { position: [0, 5.2, 0] },
      emitter: { preset: "energy-orb", sizeScale: 1.5, speed: 1, spread: 1.4, maxParticles: 18, rate: 12, color: "#6fe9ff" }, tags: ["showroom", "effect"] },
    { id: "showroom-nestor-light", parentId: NESTOR_STAGE_ID, type: "point-light", label: "CubX Cold Light", transform: { position: [-2.5, 6, 2] },
      intensity: 6, distance: 18, marker: false, material: { color: "#72d4ee" }, tags: ["showroom", "light"] },
    { id: "showroom-nestor-key-light", parentId: NESTOR_STAGE_ID, type: "point-light", label: "CubX Copper Light", transform: { position: [3.5, 4, 2.8] },
      intensity: 9, distance: 18, marker: false, material: { color: "#ffc58d" }, tags: ["showroom", "light"] },
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
  /**
   * An accepted free-text request, pinned to the revision its commit produced. A request's
   * commands are the provider's and say nothing about Nestor's own status, so unlike a console
   * demonstration the narration cannot be rebuilt from the agent entity; it is kept here and
   * dropped the moment the revision moves — undo, another commit, a document load — which is
   * exactly when claiming it would become false.
   */
  let requestPresentation: { revision: number; presentation: NestorPresentation; commit: AgentWorldCommitSummary | null } | null = null;

  const topicFromStatus = (value: string | undefined): NestorConsoleTopic | null => {
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
    if (requestPresentation && requestPresentation.revision === revision) {
      status = "presenting:request";
      lastCommit = requestPresentation.commit;
      presentation = clonePresentation(requestPresentation.presentation);
      return agent;
    }
    requestPresentation = null;

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
  const propose = (topic: NestorConsoleTopic): CoauthorProposal => {
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

  /**
   * Compose from commands somebody else wrote — a model provider, today.
   *
   * Identical to `propose` in every way that matters: the actor is still Nestor, the revision
   * is still read at the moment of composing, and the result is still inert until a human
   * accepts it. The only difference is where the command list came from, and that difference
   * is deliberately invisible to everything downstream — the card, the per-line narrowing, the
   * stale check and the undo path cannot tell, because there is nothing for them to tell apart.
   *
   * The commands are expected to have been validated by `coauthor-provider.ts` first. This does
   * not re-check them: a second validator would drift from the first, and the runtime refuses
   * anything malformed on commit regardless.
   */
  const proposeExternal = (topic: NestorTopic, intent: string, commands: AgentWorldCommand[], options?: ExternalProposalOptions): CoauthorProposal => {
    reconcile();
    lastOutcome = null;
    proposal = createProposal({
      actor: options?.actor ?? NESTOR_ACTOR,
      intent,
      expectedRevision: options?.expectedRevision ?? api.state()?.revision ?? 0,
      commands,
      ...(options?.pushId !== undefined ? { pushId: options.pushId } : {}),
    });
    // The topic is retained even though the commands did not come from it. `accept` refuses a
    // proposal with no topic, and the narration and camera cue after a successful commit are
    // still the topic's — a provider composing in answer to "Build something" is still
    // answering that button. Leaving it null shipped a card whose Apply did nothing at all.
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
    // A request has no local composition: without a held proposal there is nothing to commit.
    if (topic === "request" && !held) return clonePresentation(presentation);
    // `includedCommands`, not `commands`: if the person took lines out, the commit is what
    // they left in. Sending the original set would apply changes they explicitly removed.
    const commands = held ? includedCommands(held) : topic === "request" ? [] : presentationCommands(api, topic);
    const result = api.commit({
      // The actor the card named. For a locally composed proposal that is Nestor; for one Core
      // pushed it is the Nestor of that conversation, and history should say so.
      actor: held?.actor ?? NESTOR_ACTOR,
      // The held proposal's own intent, not the topic's. For a locally composed proposal these
      // are the same string. For one a model composed they are not, and committing the topic's
      // intent would file the change in history under a description nobody wrote and the card
      // never showed — the commit log would disagree with what the person agreed to.
      intent: held?.intent ?? intentFor(topic),
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
    // A console demonstration has a fixed target. A request's target is whatever it made:
    // the first created entity still present after the commit, else the first touched one,
    // else Nestor's stage.
    const targetId = topic === "request" ? requestTargetId(api, held) : TOPIC_TARGET[topic];
    presentation = successfulPresentation(topic, targetId, lastCommit, held?.intent);
    if (topic === "request") {
      requestPresentation = { revision: api.state()?.revision ?? 0, presentation: clonePresentation(presentation), commit: lastCommit };
    }
    focusEntity?.(targetId);
    return clonePresentation(presentation);
  };

  return {
    propose,
    proposeExternal,
    toggleProposalCommand,
    accept,
    discard,
    present: (topic: NestorConsoleTopic) => present(topic),
    reset: () => {
      failedPresentation = null;
      requestPresentation = null;
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

function requestTargetId(api: GraphysXAgentWorldApi, held: CoauthorProposal | undefined): string {
  const exists = (id: string): boolean => api.query({ ids: [id] }).length === 1;
  const touches = held?.touches ?? [];
  const created = touches.find((touch) => (touch.op === "spawn" || touch.op === "spawn-prefab") && exists(touch.id));
  if (created) return created.id;
  const touched = touches.find((touch) => exists(touch.id));
  return touched?.id ?? NESTOR_STAGE_ID;
}

function presentationCommands(api: GraphysXAgentWorldApi, topic: NestorConsoleTopic): AgentWorldCommand[] {
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

/**
 * What to ask a model for, when one is composing instead of Nestor.
 *
 * The topic buttons are the only request surface the Center has today, so each one carries the
 * sentence a person would have typed. Phrased as a request rather than as the intent, because
 * a provider is being asked to decide *what* to do — handing it the finished intent would make
 * it a paraphrase engine and the result would be Nestor's idea wearing a model's name.
 */
export function nestorTopicRequest(topic: NestorConsoleTopic): string {
  if (topic === "build") return "Build something small and inspectable in this scene, and say what you built.";
  if (topic === "play") return "Make something in this scene move or react, using the entities that are already here.";
  return "Reveal the living systems in this scene — the flocks, emitters and lights — by changing how they read.";
}

function intentFor(topic: NestorTopic): string {
  // Unreachable for a request — its intent is the provider's — but the type asks for an answer.
  if (topic === "request") return "Apply a requested change";
  if (topic === "build") return "Assemble a signal beacon in GraphysX";
  if (topic === "play") return "Wake the kinetic playground with shared scene interactions";
  return "Illuminate the showroom's living flock systems";
}

function successfulPresentation(topic: NestorTopic, targetId: string, commit: AgentWorldCommitSummary | null, intent?: string): NestorPresentation {
  if (topic === "request") {
    return {
      topic,
      eyebrow: "NESTOR · YOUR REQUEST",
      title: "Done — that was one attributed transaction.",
      message: `${intent ?? "Your request was applied."} Everything it made is in the editor's outliner, and Undo reverses it as a whole.`,
      targetId,
      commit,
      error: null,
    };
  }
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
