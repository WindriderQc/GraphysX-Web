/**
 * Optional film clips (intro, menu attract loop, race outro).
 *
 * The clips are never part of the repository or the site: scripts/extract-cyber-race-film.mjs
 * cuts them from the player's own copy of the film into a `film/` folder next to the packaged
 * page. When a clip is missing the game simply skips that moment.
 */
/** "intro", "attract", "outro", or a story chapter clip ("story-N"). */
export type ClipName = string;

export interface PlayOptions {
  loop?: boolean;
  /** Line shown over the clip, e.g. the game title. */
  title?: string;
  muted?: boolean;
}

export class FilmPlayer {
  private readonly root: HTMLDivElement;
  private readonly video: HTMLVideoElement;
  private readonly titleEl: HTMLDivElement;
  private finish: (() => void) | null = null;
  private readonly available = new Set<ClipName>();

  constructor(container: HTMLElement, private readonly folder = "film") {
    this.root = document.createElement("div");
    this.root.id = "film";
    this.root.className = "hidden";
    this.root.innerHTML = `
      <video playsinline preload="auto"></video>
      <div class="film-title"></div>
      <div class="film-hint">A / ENTRÉE : PASSER</div>`;
    container.appendChild(this.root);
    this.video = this.root.querySelector("video") as HTMLVideoElement;
    this.titleEl = this.root.querySelector(".film-title") as HTMLDivElement;
    this.video.addEventListener("ended", () => this.stop());
    this.video.addEventListener("error", () => this.stop());
    this.root.addEventListener("click", () => this.stop());
  }

  private src(name: ClipName): string {
    return `${this.folder}/${name}.mp4`;
  }

  /** Find out which clips exist (a short metadata load each; failures are silent). */
  async probe(names: ClipName[]): Promise<void> {
    await Promise.all(
      names.map(
        (name) =>
          new Promise<void>((resolve) => {
            const probe = document.createElement("video");
            probe.preload = "metadata";
            probe.muted = true;
            const done = (ok: boolean): void => {
              if (ok) this.available.add(name);
              probe.removeAttribute("src");
              probe.load();
              resolve();
            };
            const timer = window.setTimeout(() => done(false), 2500);
            probe.addEventListener("loadedmetadata", () => {
              window.clearTimeout(timer);
              done(true);
            });
            probe.addEventListener("error", () => {
              window.clearTimeout(timer);
              done(false);
            });
            probe.src = this.src(name);
          })
      )
    );
  }

  has(name: ClipName): boolean {
    return this.available.has(name);
  }

  get playing(): boolean {
    return this.finish !== null;
  }

  /** Play a clip full screen; resolves when it ends or is skipped. */
  play(name: ClipName, options: PlayOptions = {}): Promise<void> {
    if (!this.available.has(name)) return Promise.resolve();
    this.stop();
    return new Promise<void>((resolve) => {
      this.finish = resolve;
      this.root.classList.remove("hidden");
      this.titleEl.textContent = options.title ?? "";
      this.video.loop = Boolean(options.loop);
      this.video.muted = Boolean(options.muted);
      this.video.volume = 0.8;
      this.video.src = this.src(name);
      this.video.currentTime = 0;
      this.video.play().catch(() => {
        // Autoplay with sound refused (no gesture yet): play muted instead.
        this.video.muted = true;
        this.video.play().catch(() => this.stop());
      });
    });
  }

  /** Skip or end the current clip. */
  stop(): void {
    if (!this.finish) return;
    const finish = this.finish;
    this.finish = null;
    this.video.pause();
    this.video.removeAttribute("src");
    this.video.load();
    this.root.classList.add("hidden");
    finish();
  }

  setMuted(muted: boolean): void {
    this.video.muted = muted;
  }
}
