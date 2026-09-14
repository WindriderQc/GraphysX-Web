import type { LlmXReply, LlmXSession } from './llmx-audio';
import type { LlmXSceneProposal, LlmXSceneReceipt } from './llmx-actions';
import { createLlmXFetch } from "./llmx-transport";

export type { LlmXReply, LlmXSession } from './llmx-audio';
export type LlmXSceneContext = {
  schemaVersion: 1;
  environment: { id: string; name: string };
  revision?: string;
  capabilities?: { commandsVersion: 1 | 2; mathVersion: 1 };
  world?: Record<string, unknown>;
  buildZone?: { center: [number, number, number]; radius: number };
  lastAction?: LlmXSceneReceipt;
  mathLesson?: { operation: 'count' | 'add' | 'subtract'; left: number; right: number; step: number; result: number };
  selectedEntityIds?: string[];
  entities?: { id: string; name?: string; type: string; position?: [number, number, number] }[];
};
export type LlmXConfig = {
  enabled: boolean;
  schemaVersion?: number;
  openingVersion?: number;
  capabilities?: { openingTurn?: boolean; sceneContext?: boolean; sceneProposals?: boolean;
    interrupt?: boolean; playbackSignals?: boolean };
};
export type LlmXMessage = { role: 'user' | 'assistant'; content: string; turnId?: string; interrupted?: boolean;
  outcome?: 'completed' | 'cancelled' | 'failed' };
export type LlmXTurnResult = { session: LlmXSession; reply: LlmXReply; turnId: string;
  origin?: 'human' | 'application_opening'; traceId?: string; sceneProposal?: LlmXSceneProposal };
export type LlmXSessionSelection = { language?: string; label?: string; personaId?: string;
  agentId?: string; backend?: string; voice?: Record<string, unknown> };
export type LlmXTurnOptions = { turnId?: string; signal?: AbortSignal; channel?: 'text' | 'voice';
  onDelta?: (delta: string, answer: string, turnId: string) => void };
export type LlmXConversationState = 'idle' | 'initializing' | 'disabled' | 'opening' | 'sending' |
  'interrupting' | 'error' | 'disposed';
type StorageAccess = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Options = { fetch?: typeof fetch; storage?: StorageAccess | null; storageKey?: string; profile?: 'personal' | 'family';
  onChange?: (client: LlmXConversationClient) => void;
  onDelta?: LlmXTurnOptions['onDelta'] };
type Turn = { id: string; epoch: number; kind: 'opening' | 'human'; controller: AbortController;
  dispatched: boolean; suppressed: boolean; sessionId?: string };
type TurnAddress = { sessionId: string; turnId: string };
type InterruptReceipt = { interrupted: true; turnId: string };

export const LLMX_SESSION_STORAGE_KEY = 'graphysx.llmx.session.v1';
const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9-]{16,80}$/.test(value);
const aborted = () => new DOMException('Conversation annulée.', 'AbortError');
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const unpack = (value: unknown): Record<string, unknown> => {
  const body = object(value);
  if (body.ok === false || body.status === 'error') throw new Error(typeof body.message === 'string' ? body.message : 'Conversation indisponible.');
  return 'data' in body ? object(body.data) : body;
};
const sessionValue = (value: unknown, expected?: string, profile = 'personal'): LlmXSession => {
  const session = object(value);
  if (typeof session.sessionId !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(session.sessionId) ||
      (expected !== undefined && session.sessionId !== expected) || object(session.llmx).schemaVersion !== 1 ||
      (session.packId !== undefined && session.packId !== (profile === 'family' ? 'kidx_nestor' : 'personal_operator')) ||
      (session.scopeId !== undefined && session.scopeId !== profile)) throw new Error('Session LLMx invalide.');
  return session as LlmXSession;
};
const replyValue = (value: unknown): LlmXReply => {
  const reply = object(value);
  if (typeof reply.text !== 'string' || !reply.text.trim() ||
      (reply.language !== undefined && typeof reply.language !== 'string')) throw new Error('Réponse LLMx incomplète.');
  const result: LlmXReply = { text: reply.text, ...(typeof reply.language === 'string' ? { language: reply.language } : {}) };
  if (reply.speech !== undefined && reply.speech !== null) {
    if (typeof reply.speech !== 'object' || Array.isArray(reply.speech)) throw new Error('Voix LLMx invalide.');
    const speech = object(reply.speech);
    for (const field of ['provider', 'voice', 'language']) {
      if (speech[field] !== undefined && typeof speech[field] !== 'string') throw new Error('Voix LLMx invalide.');
    }
    result.speech = { ...speech };
  }
  return result;
};
const resultValue = (value: unknown, turn: Turn, profile = 'personal'): LlmXTurnResult => {
  const data = object(value);
  if ((data.turnId !== undefined && data.turnId !== turn.id) ||
      (data.origin !== undefined && data.origin !== (turn.kind === 'opening' ? 'application_opening' : 'human'))) {
    throw new Error('Réponse LLMx incomplète.');
  }
  if (turn.kind === 'opening' && data.sceneProposal !== undefined) throw new Error('L’accueil ne peut pas modifier le décor.');
  return { ...data, session: sessionValue(data.session, turn.sessionId, profile), reply: replyValue(data.reply), turnId: turn.id };
};
const browserStorage = (): StorageAccess | null => {
  try { return globalThis.localStorage ?? null; } catch { return null; }
};

/** A bounded observation, copied before an asynchronous send; never a world/session store. */
export function llmxSceneContext(value: LlmXSceneContext): LlmXSceneContext {
  const text = (input: string, max: number) => {
    if (typeof input !== 'string' || !input.trim() || input.length > max || /[\u0000-\u001f]/.test(input)) {
      throw new Error('Observation de scène invalide.');
    }
    return input.trim();
  };
  if (value?.schemaVersion !== 1 || !value.environment) throw new Error('Observation de scène invalide.');
  const context: LlmXSceneContext = { schemaVersion: 1,
    environment: { id: text(value.environment.id, 80), name: text(value.environment.name, 120) } };
  if (value.revision !== undefined) context.revision = text(value.revision, 80);
  if (value.capabilities !== undefined) {
    if (![1, 2].includes(value.capabilities.commandsVersion) || value.capabilities.mathVersion !== 1) throw new Error('Création de scène incompatible.');
    context.capabilities = { commandsVersion: value.capabilities.commandsVersion, mathVersion: 1 };
  }
  if (value.buildZone !== undefined) {
    const { center, radius } = value.buildZone;
    if (!Array.isArray(center) || center.length !== 3 || center.some(n => !Number.isFinite(n) || Math.abs(n) > 10000) ||
        !Number.isFinite(radius) || radius <= 0 || radius > 100) throw new Error('Zone de création invalide.');
    context.buildZone = { center: [...center], radius };
  }
  if (value.lastAction !== undefined) {
    const receipt = value.lastAction;
    if (!validId(receipt.turnId) || !['applied', 'rejected'].includes(receipt.status) ||
        !Array.isArray(receipt.entityIds) || receipt.entityIds.length > 256) throw new Error('Résultat de création invalide.');
    context.lastAction = { turnId: receipt.turnId, status: receipt.status, entityIds: receipt.entityIds.map(id => text(id, 80)),
      ...(receipt.message ? { message: text(receipt.message, 400) } : {}) };
  }
  if (value.mathLesson !== undefined) {
    const math = value.mathLesson;
    if (!['count', 'add', 'subtract'].includes(math.operation) || [math.left, math.right, math.step, math.result].some(n => !Number.isInteger(n) || n < 0 || n > 20) ||
        (math.operation === 'count' && math.right !== 0) || math.step > (math.operation === 'count' ? math.left : math.right) ||
        math.result !== (math.operation === 'count' ? math.left : math.operation === 'add' ? math.left + math.right : math.left - math.right)) {
      throw new Error('Observation de l’exercice invalide.');
    }
    context.mathLesson = { ...math };
  }
  if (value.selectedEntityIds !== undefined) {
    if (!Array.isArray(value.selectedEntityIds) || value.selectedEntityIds.length > 8) throw new Error('Sélection de scène trop grande.');
    context.selectedEntityIds = value.selectedEntityIds.map(id => text(id, 80));
  }
  if (value.entities !== undefined) {
    if (!Array.isArray(value.entities) || value.entities.length > (context.capabilities?.commandsVersion === 2 ? 1024 : 24)) throw new Error('Observation de scène trop grande.');
    context.entities = value.entities.map(entity => {
      const item: NonNullable<LlmXSceneContext['entities']>[number] = { id: text(entity.id, 80), type: text(entity.type, 40) };
      if (entity.name !== undefined) item.name = text(entity.name, 120);
      if (entity.position !== undefined) {
        if (!Array.isArray(entity.position) || entity.position.length !== 3 ||
            entity.position.some(n => !Number.isFinite(n) || Math.abs(n) > 10000)) throw new Error('Position de scène invalide.');
        item.position = [...entity.position];
      }
      return item;
    });
  }
  if (value.world !== undefined && context.capabilities?.commandsVersion === 2) context.world = structuredClone(value.world);
  if (new TextEncoder().encode(JSON.stringify(context)).byteLength > 196608) throw new Error('Observation de scène trop grande.');
  return context;
}

/** Owns transport and the one exact LLMx session. Audio and scene actions belong to the caller. */
export class LlmXConversationClient {
  state: LlmXConversationState = 'idle';
  config: LlmXConfig | null = null;
  session: LlmXSession | null = null;
  history: LlmXMessage[] = [];
  latestTurnId: string | null = null;
  latestReply: { reply: LlmXReply; turnId: string } | null = null;
  cleanupWarning: string | null = null;
  private readonly options: Options;
  private readonly fetcher: typeof fetch;
  private readonly storage: StorageAccess | null;
  private readonly storageKey: string;
  private readonly base: string;
  private readonly profile: 'personal' | 'family';
  private epoch = 0;
  private readonly requests = new Set<AbortController>();
  private initialization: Promise<LlmXSession | null> | null = null;
  private active: Turn | null = null;
  private humanPending = false;
  private humanStarted = false;
  private openingAttempted = false;
  private unsettled: TurnAddress | null = null;
  private interruption: { address: TurnAddress; promise: Promise<InterruptReceipt>; transport: Promise<InterruptReceipt> } | null = null;
  private resetPending: Promise<void> | null = null;
  private disposal: Promise<void> | null = null;
  private readonly sentTurnIds = new Set<string>();
  private readonly completedTurnIds = new Set<string>();
  private selection: LlmXSessionSelection = {};

  constructor(options: Options = {}) {
    this.options = options;
    this.fetcher = options.fetch ?? createLlmXFetch();
    this.storage = options.storage === undefined ? browserStorage() : options.storage;
    this.profile = options.profile ?? 'personal';
    this.base = '/llmx-api' + (this.profile === 'family' ? '/family' : '');
    this.storageKey = options.storageKey ?? (this.profile === 'family' ? 'graphysx.llmx.family.session.v1' : LLMX_SESSION_STORAGE_KEY);
  }

  private current(epoch: number): void {
    if (this.state === 'disposed' || this.epoch !== epoch) throw aborted();
  }
  private changed(state?: LlmXConversationState): void {
    if (state) this.state = state;
    this.options.onChange?.(this);
  }
  private remember(sessionId: string | null): void {
    try {
      if (sessionId) this.storage?.setItem(this.storageKey, sessionId);
      else this.storage?.removeItem(this.storageKey);
    } catch { /* Session continuity is optional when browser storage is unavailable. */ }
  }
  private async json(path: string, epoch: number, body?: unknown, timeoutMs?: number): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    this.requests.add(controller);
    const timer = timeoutMs ? setTimeout(() => controller.abort(new DOMException(
      'La connexion à AgentX ne répond pas. Vérifie ton réseau privé puis réessaie.', 'TimeoutError')), timeoutMs) : undefined;
    try {
      const response = await this.fetcher(this.base + path, { signal: controller.signal,
        ...(body !== undefined ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
      this.current(epoch);
      const payload: unknown = await response.json();
      this.current(epoch);
      controller.signal.throwIfAborted();
      if (!response.ok) throw new Error(typeof object(payload).message === 'string' ? String(object(payload).message) : 'Conversation indisponible.');
      return unpack(payload);
    } finally { clearTimeout(timer); this.requests.delete(controller); }
  }

  initialize(): Promise<LlmXSession | null> {
    if (this.state === 'disposed') return Promise.reject(aborted());
    if (this.resetPending) return this.resetPending.catch(() => {}).then(() => this.initialize());
    if (this.initialization) return this.initialization;
    if (this.session || this.config?.enabled === false) return Promise.resolve(this.session);
    const epoch = this.epoch;
    this.changed('initializing');
    const promise = (async () => {
      const config = await this.json('/config', epoch, undefined, 15000);
      if (config.enabled === false) {
        this.config = { ...config, enabled: false };
        this.changed('disabled');
        return null;
      }
      if (config.schemaVersion !== 1) throw new Error('Configuration LLMx incompatible.');
      this.config = { ...config, enabled: true };
      let saved: string | null = null;
      try { saved = this.storage?.getItem(this.storageKey) ?? null; } catch { /* Optional storage. */ }
      if (saved && /^[a-zA-Z0-9-]{1,64}$/.test(saved)) {
        // Do not fall back to recent/private sessions, or silently replace a failed restore.
        const data = await this.json('/sessions/' + encodeURIComponent(saved) + '/history', epoch);
        const restored = sessionValue(data.session, saved, this.profile);
        this.restoreHistory(data);
        this.session = restored;
      } else {
        const data = await this.json('/sessions', epoch,
          { language: 'fr', label: 'LLMx · Forge nocturne', ...this.selection });
        this.session = sessionValue(data.session, undefined, this.profile);
        this.remember(this.session.sessionId);
      }
      this.openingAttempted ||= Boolean(this.session.llmx?.opening);
      this.humanStarted ||= (this.session.turnCount ?? 0) > 0 || this.history.some(message => message.role === 'user');
      this.latestTurnId ??= this.session.llmx?.opening?.turnId ?? null;
      if (this.session.llmx?.opening?.status === 'pending' && validId(this.session.llmx.opening.turnId)) {
        this.unsettled = { sessionId: this.session.sessionId, turnId: this.session.llmx.opening.turnId };
      }
      this.changed('idle');
      return this.session;
    })().catch((error: unknown) => {
      if (this.epoch === epoch && this.state !== 'disposed') this.changed('error');
      throw error;
    }).finally(() => { if (this.epoch === epoch) this.initialization = null; });
    this.initialization = promise;
    return promise;
  }

  private restoreHistory(data: Record<string, unknown>): void {
    const messages: LlmXMessage[] = [];
    let latestTurnId: string | null = null;
    let latestReply: LlmXConversationClient['latestReply'] = null;
    if (Array.isArray(data.turns)) {
      for (const value of data.turns) {
        const turn = object(value), turnId = typeof turn.clientTurnId === 'string' ? turn.clientTurnId : undefined;
        // Opening audits are application events, never synthetic human greetings.
        if (turn.origin !== 'application_opening' && typeof turn.inputText === 'string' && turn.inputText.trim()) {
          messages.push({ role: 'user', content: turn.inputText, turnId });
        }
        if (typeof turn.replyText === 'string' && turn.replyText.trim()) {
          const outcome = turn.outcome === 'completed' || turn.outcome === 'cancelled' || turn.outcome === 'failed' ? turn.outcome : undefined;
          messages.push({ role: 'assistant', content: turn.replyText, turnId,
            interrupted: turn.interrupted === true || outcome === 'cancelled' || outcome === 'failed', ...(outcome ? { outcome } : {}) });
        }
        if (turnId) latestTurnId = turnId;
      }
    } else if (Array.isArray(data.history)) {
      for (const value of data.history) {
        const message = object(value);
        if ((message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string') {
          messages.push({ role: message.role, content: message.content });
        }
      }
    }
    if (data.lastReply !== undefined && data.lastReply !== null) {
      const latest = object(data.lastReply);
      if (!validId(latest.turnId)) throw new Error('Dernière réponse LLMx invalide.');
      latestReply = { turnId: latest.turnId, reply: replyValue(latest.reply) };
    }
    this.history = messages;
    this.latestTurnId = latestTurnId;
    this.latestReply = latestReply;
  }

  async recordSceneReceipt(receipt: LlmXSceneReceipt, sessionId: string): Promise<void> {
    const epoch = this.epoch;
    this.current(epoch);
    if (this.session?.sessionId !== sessionId || !this.completedTurnIds.has(receipt.turnId)) throw new Error('La conversation de cette création a changé.');
    const controller = new AbortController();
    this.requests.add(controller);
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await this.fetcher(`${this.base}/sessions/${encodeURIComponent(sessionId)}/scene-receipts`, {
        method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(receipt),
      });
      this.current(epoch);
      const data = unpack(await response.json());
      this.current(epoch);
      if (!response.ok || data.turnId !== receipt.turnId) throw new Error('Le résultat n’a pas été confirmé à notre agent.');
    } finally { clearTimeout(timer); this.requests.delete(controller); }
  }

  /** Resolve the recorded French outcome through the same session/persona voice authority. */
  async readSceneReply(turnId: string, sessionId: string, expectedText: string): Promise<LlmXReply> {
    const epoch = this.epoch;
    this.current(epoch);
    if (this.session?.sessionId !== sessionId || !this.completedTurnIds.has(turnId)) throw new Error('La conversation de cette création a changé.');
    const data = await this.json('/sessions/' + encodeURIComponent(sessionId) + '/history', epoch, undefined, 10000);
    this.current(epoch);
    sessionValue(data.session, sessionId, this.profile);
    const latest = object(data.lastReply);
    if (latest.turnId !== turnId) throw new Error('La voix de cette réponse n’est plus disponible dans ce tour.');
    const reply = replyValue(latest.reply);
    if (reply.text !== expectedText || reply.language !== 'fr' || reply.speech?.language !== 'fr' || !reply.speech.provider?.trim()) {
      throw new Error('La voix française de cette réponse n’a pas pu être confirmée.');
    }
    return reply;
  }

  observeSceneReply(turnId: string, reply: LlmXReply): void {
    if (!this.completedTurnIds.has(turnId)) throw new Error('Le tour de cette création n’est pas terminé.');
    const checked = replyValue(reply);
    const message = this.history.find(item => item.role === 'assistant' && item.turnId === turnId);
    if (message) message.content = checked.text;
    if (this.latestReply?.turnId === turnId) this.latestReply = { turnId, reply: checked };
    this.changed();
  }

  async opening(sceneContext: LlmXSceneContext, options: Omit<LlmXTurnOptions, 'turnId' | 'channel'> & { voice?: boolean } = {}): Promise<LlmXTurnResult | null> {
    this.current(this.epoch);
    if (this.openingAttempted || this.humanPending || this.humanStarted || this.active) return null;
    const context = llmxSceneContext(sceneContext);
    const turn = this.makeTurn('opening', globalThis.crypto.randomUUID(), options.signal);
    this.active = turn;
    try {
      const session = await this.initialize();
      this.checkTurn(turn);
      if (!session || this.openingAttempted || this.humanStarted || this.humanPending ||
          !this.config?.capabilities?.openingTurn || session.llmx?.opening) return null;
      this.openingAttempted = true;
      this.changed('opening');
      return await this.performTurn(turn, '/opening', { requestId: turn.id, openingVersion: this.config.openingVersion ?? 1,
        channel: options.voice ? 'voice' : 'text', stream: true, sceneContext: context }, options.onDelta);
    } catch (error) { this.turnFailed(turn); throw error; }
    finally { await this.finishTurn(turn); }
  }

  async send(text: string, sceneContext: LlmXSceneContext, options: LlmXTurnOptions = {}): Promise<LlmXTurnResult> {
    this.current(this.epoch);
    if (this.humanPending || this.active?.kind === 'human') throw new Error('Une réponse est déjà en cours.');
    if (typeof text !== 'string' || !text.trim()) throw new Error('Écris un message avant de l’envoyer.');
    const context = llmxSceneContext(sceneContext), id = options.turnId ?? globalThis.crypto.randomUUID();
    if (!validId(id)) throw new Error('Identifiant de tour invalide.');
    if (this.sentTurnIds.has(id)) throw new Error('Ce message a déjà été envoyé.');
    const epoch = this.epoch;
    this.humanPending = true;
    this.humanStarted = true;
    let turn: Turn | null = null;
    try {
      options.signal?.throwIfAborted();
      if (this.active?.kind === 'opening') await this.interrupt(this.active.id);
      if (this.interruption) await this.interruption.promise;
      if (this.unsettled) await this.interrupt(this.unsettled.turnId);
      this.current(epoch);
      const session = await this.initialize();
      this.current(epoch);
      options.signal?.throwIfAborted();
      if (!session) throw new Error('La conversation LLMx n’est pas configurée.');
      if (session.llmx?.opening?.status === 'uncertain') throw new Error('L’état de l’accueil est incertain. Ouvre une nouvelle conversation.');
      if (this.unsettled) await this.interrupt(this.unsettled.turnId);
      this.current(epoch);
      options.signal?.throwIfAborted();
      turn = this.makeTurn('human', id, options.signal);
      this.active = turn;
      this.changed('sending');
      const result = await this.performTurn(turn, '/turns/text', { text: text.trim(), turnId: id,
        channel: options.channel ?? 'text', stream: true, sceneContext: context }, options.onDelta, text.trim());
      if (!result) throw new Error('Réponse LLMx incomplète.');
      return result;
    } catch (error) {
      if (turn) this.turnFailed(turn);
      else if (this.epoch === epoch && this.state !== 'disposed' && this.config?.enabled !== false) this.changed('error');
      throw error;
    } finally {
      if (this.epoch === epoch) this.humanPending = false;
      if (turn) await this.finishTurn(turn);
    }
  }

  private makeTurn(kind: Turn['kind'], id: string, signal?: AbortSignal): Turn {
    signal?.throwIfAborted();
    const turn: Turn = { kind, id, epoch: this.epoch, controller: new AbortController(), dispatched: false, suppressed: false };
    const cancel = () => {
      turn.suppressed = true;
      if (turn.dispatched && this.epoch === turn.epoch && this.state !== 'disposed') {
        // Keep the stream alive until the server confirms its executor and audit settled.
        void this.interrupt(turn.id).catch(() => { if (this.epoch === turn.epoch && this.state !== 'disposed') this.changed('error'); });
      } else turn.controller.abort();
    };
    signal?.addEventListener('abort', cancel, { once: true });
    turn.controller.signal.addEventListener('abort', () => signal?.removeEventListener('abort', cancel), { once: true });
    this.requests.add(turn.controller);
    return turn;
  }
  private checkTurn(turn: Turn): void {
    this.current(turn.epoch);
    if (turn.suppressed || turn.controller.signal.aborted) throw aborted();
  }
  private turnFailed(turn: Turn): void {
    if (this.epoch === turn.epoch && this.state !== 'disposed' && !turn.suppressed) this.changed('error');
  }
  private async finishTurn(turn: Turn): Promise<void> {
    if (turn.suppressed && this.interruption?.address.turnId === turn.id) await this.interruption.transport.catch(() => {});
    this.requests.delete(turn.controller);
    turn.controller.abort();
    if (this.active === turn) {
      this.active = null;
      if (this.state === 'sending' || this.state === 'opening') this.changed('idle');
    }
  }

  private async performTurn(turn: Turn, path: string, body: unknown, onDelta?: LlmXTurnOptions['onDelta'], input?: string): Promise<LlmXTurnResult | null> {
    this.checkTurn(turn);
    if (!this.config?.capabilities?.sceneProposals) {
      const request = object(body), context = object(request.sceneContext);
      const { capabilities: _capabilities, buildZone: _zone, lastAction: _action, mathLesson: _math, world: _world, ...observation } = context;
      if (Array.isArray(observation.entities)) observation.entities = observation.entities.slice(0, 24);
      body = { ...request, sceneContext: observation };
    }
    turn.sessionId = this.session!.sessionId;
    turn.dispatched = true;
    this.sentTurnIds.add(turn.id);
    this.latestTurnId = turn.id;
    this.unsettled = { sessionId: turn.sessionId, turnId: turn.id };
    const response = await this.fetcher(`${this.base}/sessions/${encodeURIComponent(turn.sessionId)}${path}`, {
      method: 'POST', signal: turn.controller.signal, headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
      body: JSON.stringify(body) });
    this.checkTurn(turn);
    if (!response.ok) {
      const payload: unknown = await response.json();
      this.checkTurn(turn);
      throw new Error(typeof object(payload).message === 'string' ? String(object(payload).message) : 'Conversation indisponible.');
    }
    let result: LlmXTurnResult;
    if (response.headers.get('content-type')?.includes('application/json')) {
      const payload = unpack(await response.json());
      this.checkTurn(turn);
      if (turn.kind === 'opening' && payload.opening) {
        if (payload.session) this.session = sessionValue(payload.session, turn.sessionId, this.profile);
        const opening = object(payload.opening);
        if (typeof opening.turnId === 'string') this.latestTurnId = opening.turnId;
        this.unsettled = opening.status === 'pending' && validId(opening.turnId)
          ? { sessionId: turn.sessionId, turnId: opening.turnId } : null;
        this.changed();
        return null; // A duplicate may carry reply text. It is history, never permission to speak.
      }
      result = resultValue(payload, turn, this.profile);
    } else {
      if (!response.body) throw new Error('Flux LLMx absent.');
      const reader = response.body.getReader(), decoder = new TextDecoder();
      let pending = '', answer = '', completed: LlmXTurnResult | null = null;
      const consume = (line: string) => {
        this.checkTurn(turn);
        if (!line.trim()) return;
        const event = object(JSON.parse(line));
        if (completed) throw new Error('Flux LLMx reçu après sa fin.');
        if (event.type === 'error') throw new Error(typeof event.message === 'string' ? event.message : 'La réponse LLMx a échoué.');
        if (event.type === 'delta') {
          if (typeof event.delta !== 'string') throw new Error('Fragment LLMx invalide.');
          answer += event.delta;
          this.options.onDelta?.(event.delta, answer, turn.id);
          onDelta?.(event.delta, answer, turn.id);
        }
        if (event.type === 'done') completed = resultValue(event.data, turn, this.profile);
      };
      try {
        while (true) {
          const chunk = await reader.read();
          this.checkTurn(turn);
          pending += chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true });
          let end: number;
          while ((end = pending.indexOf('\n')) >= 0) {
            consume(pending.slice(0, end)); pending = pending.slice(end + 1);
          }
          if (pending.length > 1024 * 1024 || answer.length > 1024 * 1024) throw new Error('Flux LLMx trop grand.');
          if (chunk.done) break;
        }
        if (pending.trim()) consume(pending);
        if (!completed) throw new Error('Réponse LLMx interrompue : reçu final absent.');
        result = completed;
      } finally {
        if (turn.suppressed && this.interruption?.address.turnId === turn.id) await this.interruption.transport.catch(() => {});
        await reader.cancel().catch(() => {}); reader.releaseLock();
      }
    }
    this.checkTurn(turn);
    this.session = result.session;
    this.latestReply = { turnId: result.turnId, reply: result.reply };
    this.completedTurnIds.add(turn.id);
    this.unsettled = null;
    if (input) this.history.push({ role: 'user', content: input, turnId: turn.id });
    this.history.push({ role: 'assistant', content: result.reply.text, turnId: turn.id });
    this.changed();
    return result;
  }

  async interrupt(turnId = this.active?.id ?? this.unsettled?.turnId): Promise<InterruptReceipt | null> {
    this.current(this.epoch);
    if (!turnId) return null;
    const turn = this.active?.id === turnId ? this.active : null;
    if (turn) {
      turn.suppressed = true;
      if (!turn.dispatched) { turn.controller.abort(); return null; }
    }
    const sessionId = turn?.sessionId ?? this.unsettled?.sessionId ?? this.session?.sessionId;
    if (!sessionId || !validId(turnId)) throw new Error('Tour LLMx introuvable.');
    if (this.interruption) {
      if (this.interruption.address.turnId !== turnId) throw new Error('Une interruption est déjà en cours.');
      return this.interruption.promise;
    }
    const epoch = this.epoch, address = { sessionId, turnId };
    this.changed('interrupting');
    const transport = this.interruptAddress(address);
    const promise = transport.then(receipt => {
      this.current(epoch);
      if (this.unsettled?.turnId === turnId) this.unsettled = null;
      if (this.session?.llmx?.opening?.turnId === turnId && this.session.llmx.opening.status === 'pending') {
        this.session.llmx.opening.status = 'cancelled';
      }
      if (turn) { turn.controller.abort(); if (this.active === turn) this.active = null; }
      for (const message of this.history) if (message.turnId === turnId && message.role === 'assistant') message.interrupted = true;
      this.changed('idle');
      return receipt;
    }).catch((error: unknown) => {
      if (this.epoch === epoch && this.state !== 'disposed') this.changed('error');
      throw error;
    }).finally(() => { if (this.epoch === epoch) this.interruption = null; });
    this.interruption = { address, promise, transport };
    return promise;
  }

  private async interruptAddress(address: TurnAddress): Promise<InterruptReceipt> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    try {
      // Retrying an acknowledged pending cancellation is safe; never retry a text/opening POST.
      for (let attempt = 0; attempt < 4; attempt++) {
        const response = await this.fetcher(`${this.base}/sessions/${encodeURIComponent(address.sessionId)}/interrupt`, {
          method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ turnId: address.turnId }) });
        const data = unpack(await response.json());
        if (response.status === 202 && data.pending === true && data.turnId === address.turnId) continue;
        if (response.status === 200 && data.interrupted === true && data.turnId === address.turnId) return { interrupted: true, turnId: address.turnId };
        throw new Error('L’arrêt du tour précédent n’est pas confirmé.');
      }
      throw new Error('Le tour précédent est encore en cours d’arrêt.');
    } finally { clearTimeout(timeout); }
  }

  async newSession(selection: LlmXSessionSelection = {}): Promise<LlmXSession | null> {
    this.current(this.epoch);
    if (this.resetPending) throw new Error('Une nouvelle conversation est déjà en préparation.');
    const cleanup = this.reset(false);
    const epoch = this.epoch;
    this.resetPending = cleanup;
    this.selection = selection;
    this.remember(null);
    try { await cleanup; }
    catch (error) {
      this.current(epoch);
      // A new conversation is an explicit escape from uncertain old work, not a
      // replay or a claim that cancellation succeeded. Require the human to speak first.
      this.cleanupWarning = 'L’arrêt de la conversation précédente n’a pas été confirmé.'
        + (error instanceof Error ? ' ' + error.message : '');
      this.openingAttempted = true;
    }
    finally { if (this.epoch === epoch) this.resetPending = null; }
    this.current(epoch);
    return this.initialize();
  }

  /** Invalidates callbacks immediately. Await the returned promise to know server cleanup succeeded. */
  dispose(): Promise<void> { return this.disposal ??= this.reset(true); }

  private async reset(dispose: boolean): Promise<void> {
    const address = this.unsettled;
    const cleanup = this.interruption?.transport ?? this.resetPending;
    this.epoch++;
    if (this.active) this.active.suppressed = true;
    for (const controller of this.requests) controller.abort();
    this.requests.clear();
    this.active = null; this.initialization = null; this.interruption = null; this.unsettled = null;
    this.resetPending = null; this.sentTurnIds.clear(); this.completedTurnIds.clear();
    this.session = null; this.history = []; this.latestTurnId = null; this.latestReply = null;
    this.cleanupWarning = null;
    this.humanPending = false; this.humanStarted = false; this.openingAttempted = false; this.config = null;
    this.changed(dispose ? 'disposed' : 'idle');
    if (cleanup) await cleanup;
    else if (address) await this.interruptAddress(address);
  }
}
