/** CPU submission and observed frame intervals, never a GPU or compositor measurement. */
export class RenderDiagnostics {
  private intervals: number[] = [];
  private submissions: number[] = [];
  private scope = "desktop";
  private frames = 0;
  private last = { calls: 0, triangles: 0, geometries: 0, textures: 0 };

  record(scope: string, intervalMs: number, cpuMs: number, counts: typeof this.last): void {
    if (scope !== this.scope) { this.scope = scope; this.intervals = []; this.submissions = []; this.frames = 0; }
    this.frames++;
    this.last = { ...counts };
    // Retain long intervals too: hiding stalls would make the diagnostic misleading.
    if (Number.isFinite(intervalMs) && intervalMs > 0 && Number.isFinite(cpuMs)) {
      this.intervals.push(intervalMs); this.submissions.push(cpuMs);
      if (this.intervals.length > 240) { this.intervals.shift(); this.submissions.shift(); }
    }
  }

  snapshot() {
    const percentile = (values: number[], p: number) => {
      const sorted = [...values].sort((a, b) => a - b);
      return sorted.length ? Math.round(sorted[Math.ceil(p * sorted.length) - 1]! * 100) / 100 : null;
    };
    const median = percentile(this.intervals, .5);
    return {
      scope: this.scope, frames: this.frames, samples: this.intervals.length,
      observedHz: median ? Math.round(1000 / median) : null,
      intervalMs: { latest: this.intervals.length ? Math.round(this.intervals.at(-1)! * 100) / 100 : null, p50: median, p95: percentile(this.intervals, .95), p99: percentile(this.intervals, .99) },
      cpuSubmissionMs: { p50: percentile(this.submissions, .5), p95: percentile(this.submissions, .95) },
      gpuMs: null, memoryBytes: null, ...this.last,
      measurement: "Observed frame intervals and CPU submission; GPU time, compositor drops and byte memory are unavailable.",
    };
  }
}

export type RenderDiagnosticSnapshot = ReturnType<RenderDiagnostics["snapshot"]>;
