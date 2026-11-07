export type VrSessionPhase = 'checking' | 'unsupported' | 'ready' | 'starting' | 'active' | 'stopping' | 'error' | 'disposed';
export interface VrSessionSnapshot { readonly phase: VrSessionPhase; readonly message: string }
export interface VrSessionOptions {
  xr: XRSystem | undefined;
  secureContext: boolean;
  bindSession: (session: XRSession) => Promise<void>;
  onStarted: (session: XRSession) => void;
  onEnded: () => void;
  onInterrupted: () => void;
}

/** DOM-free owner of one immersive session. Call enter directly from a user gesture. */
export class VrSessionController {
  private readonly options: VrSessionOptions;
  private current: VrSessionSnapshot = Object.freeze({ phase: 'checking', message: 'Checking VR support…' });
  private listeners = new Set<(snapshot: VrSessionSnapshot) => void>();
  private owned: XRSession | null = null;
  private detach: (() => void) | null = null;
  private entry: Promise<void> | null = null;
  private ending: Promise<void> | null = null;
  private generation = 0;
  private cancelled = false;
  private disposing = false;

  constructor(options: VrSessionOptions) { this.options = options; }
  get snapshot(): VrSessionSnapshot { return this.current; }
  get session(): XRSession | null { return this.owned; }
  subscribe(listener: (snapshot: VrSessionSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.current);
    return () => { this.listeners.delete(listener); };
  }
  private set(phase: VrSessionPhase, message: string): void {
    this.current = Object.freeze({ phase, message });
    for (const listener of this.listeners) listener(this.current);
  }
  async checkSupport(): Promise<void> {
    if (this.disposing || this.entry || this.owned) return;
    const generation = ++this.generation;
    if (!this.options.secureContext || !this.options.xr) {
      this.set('unsupported', !this.options.secureContext ? 'VR requires HTTPS or localhost.' : 'WebXR is unavailable in this browser.');
      return;
    }
    this.set('checking', 'Checking VR support…');
    try {
      const supported = await this.options.xr.isSessionSupported('immersive-vr');
      if (generation !== this.generation || this.disposing) return;
      this.set(supported ? 'ready' : 'unsupported', supported ? 'Ready to enter VR.' : 'No immersive VR headset is available.');
    } catch {
      if (generation === this.generation && !this.disposing) this.set('error', 'Unable to check VR support. Try again.');
    }
  }
  enter(): Promise<void> {
    if (this.disposing || this.entry || this.owned || this.current.phase === 'starting') return this.entry ?? Promise.resolve();
    if (!this.options.xr || !this.options.secureContext || this.current.phase === 'unsupported') return Promise.resolve();
    ++this.generation;
    this.cancelled = false;
    // requestSession must happen before any await to preserve transient activation.
    let request: Promise<XRSession>;
    try {
      request = this.options.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'hand-tracking'] });
    } catch {
      this.set('error', 'VR could not start. Check headset access and try again.');
      return Promise.resolve();
    }
    this.set('starting', 'Starting VR…');
    this.entry = this.start(request).finally(() => { this.entry = null; });
    return this.entry;
  }
  private async start(request: Promise<XRSession>): Promise<void> {
    let acquired: XRSession | null = null;
    try {
      const session = await request;
      acquired = session;
      this.owned = session;
      const ended = () => {
        if (this.owned !== session) return;
        this.detach?.();
        this.detach = null;
        this.owned = null;
        this.options.onEnded();
        this.set(this.disposing ? 'disposed' : 'ready', this.disposing ? 'VR disposed.' : 'Ready to enter VR.');
      };
      const visibility = () => {
        if (this.owned === session && session.visibilityState !== 'visible') this.options.onInterrupted();
      };
      session.addEventListener('end', ended);
      session.addEventListener('visibilitychange', visibility);
      this.detach = () => {
        session.removeEventListener('end', ended);
        session.removeEventListener('visibilitychange', visibility);
      };
      if (this.cancelled || this.disposing) { await this.stop(); return; }
      await this.options.bindSession(session);
      if (this.owned !== session) return;
      if (this.cancelled || this.disposing) { await this.stop(); return; }
      this.options.onStarted(session);
      if (this.owned === session && !this.cancelled && !this.disposing) this.set('active', 'VR active.');
    } catch {
      if (acquired && this.owned !== acquired) return;
      if (this.owned) {
        await this.stop();
        if (this.owned) return; // End failed: keep ownership for an explicit retry.
      }
      if (!this.disposing && !this.cancelled) this.set('error', 'VR could not start. Check headset access and try again.');
      else if (this.disposing) this.set('disposed', 'VR disposed.');
      else this.set('ready', 'Ready to enter VR.');
    }
  }
  private stop(): Promise<void> {
    if (this.ending) return this.ending;
    const session = this.owned;
    if (!session) return Promise.resolve();
    this.options.onInterrupted();
    this.set('stopping', 'Leaving VR…');
    this.ending = (async () => {
      try {
        await session.end();
        // Some runtimes settle end() before dispatching the event.
        if (this.owned === session) {
          this.detach?.();
          this.detach = null;
          this.owned = null;
          this.options.onEnded();
          this.set(this.disposing ? 'disposed' : 'ready', this.disposing ? 'VR disposed.' : 'Ready to enter VR.');
        }
      } catch {
        if (this.owned === session) this.set('error', 'Unable to leave VR. Try leaving VR again.');
      }
    })().finally(() => { this.ending = null; });
    return this.ending;
  }
  async exit(): Promise<void> {
    ++this.generation;
    this.cancelled = true;
    if (this.owned) await this.stop();
    else if (this.entry) await this.entry;
  }
  async dispose(): Promise<void> {
    this.disposing = true;
    await this.exit();
    if (this.entry) await this.entry;
    if (!this.owned) {
      this.set('disposed', 'VR disposed.');
      this.listeners.clear();
    }
  }
}
