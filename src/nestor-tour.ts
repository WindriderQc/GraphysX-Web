// Nestor showing you around: a sequence of camera cues, one line each, over real entities.
//
// The AgentX Center is a place with things in it, and until now a first-time visitor was told
// "click Nestor or a glowing console in 3D" and left to find them. A tour is the guided read of
// the same room — stop at the thing, say what it is, move on — and it is the difference between
// a scene you are shown and a scene you have to excavate.
//
// Everything about this is **runtime-only**. Highlighting calls `api.select`, which sets
// `selectedIds` and nothing else: no revision, no history, no export. Dwell is a timer, not an
// animation loop — the camera easing belongs to the host's existing `focusOn`, and CLAUDE.md's
// "never a second requestAnimationFrame" is a rule about frames, which this never claims.
//
// The state machine is pure and lives here so it can be tested without a renderer. What a
// visitor sees is entirely a function of (tour, index, reduced-motion), and that is what makes
// the sequence deterministic in the way the roadmap asks for.

export type NestorTourStop = {
  /** Stable across runs; the smoke and the DOM both key off it. */
  id: string;
  /** The entity to frame and highlight. A stop whose entity is gone is skipped, not faked. */
  entityId: string;
  title: string;
  /** One sentence. If it needs two, it is two stops. */
  line: string;
};

export type NestorTour = {
  id: string;
  label: string;
  stops: NestorTourStop[];
};

export type NestorTourStatus = "idle" | "running" | "finished" | "cancelled";

export type NestorTourState = {
  status: NestorTourStatus;
  tourId: string | null;
  /** -1 when not running. */
  index: number;
  stop: NestorTourStop | null;
  /** 1-based, for "stop 2 of 5". 0 when not running. */
  position: number;
  total: number;
  atLast: boolean;
};

/**
 * How long each stop holds before advancing.
 *
 * Long enough to read one sentence and look at what is being pointed at, short enough that
 * five stops is not a commitment. Reduced motion gets *longer*, not shorter: without the
 * camera easing there is no travel time, so the same words arrive with less room to read them.
 */
export const TOUR_DWELL_MS = 4200;
export const TOUR_DWELL_REDUCED_MS = 5200;

export const tourDwellMs = (reducedMotion: boolean): number =>
  reducedMotion ? TOUR_DWELL_REDUCED_MS : TOUR_DWELL_MS;

/**
 * The AgentX Center tour.
 *
 * Ordered as a person would walk it — the host first, then the three consoles left to right as
 * they stand in the scene, then the living systems that are easy to miss because nothing tells
 * you to look up. Every id here is in `NESTOR_CENTER_REQUIRED_IDS`, so a composed center always
 * has all of them and a scene that has been edited away from it degrades by skipping stops.
 */
export const AGENTX_CENTER_TOUR: NestorTour = {
  id: "agentx-center",
  label: "Show me around",
  stops: [
    {
      id: "host",
      entityId: "showroom-nestor",
      title: "Nestor",
      line: "I am an ordinary scene entity — an agent with a role, a status and capabilities. Open the editor and you will find me in the outliner.",
    },
    {
      id: "build",
      entityId: "showroom-nestor-console-build",
      title: "Build console",
      line: "Ask here and I compose a change: entities, materials, a prefab. You see every command before any of it happens.",
    },
    {
      id: "play",
      entityId: "showroom-nestor-console-play",
      title: "Play console",
      line: "This one wakes the physics. Rapier runs the same simulation the games use — nothing here is a special case.",
    },
    {
      id: "explore",
      entityId: "showroom-nestor-console-explore",
      title: "Explore console",
      line: "Living systems: flocks and swarms retuned live, thousands of members in one draw call.",
    },
    {
      id: "flock",
      entityId: "showroom-starlings",
      title: "The starlings",
      line: "Separation, alignment, cohesion — the same three rules the 1986 boids paper described, ticked inside the one shared frame loop.",
    },
  ],
};

export const IDLE_TOUR_STATE: NestorTourState = {
  status: "idle",
  tourId: null,
  index: -1,
  stop: null,
  position: 0,
  total: 0,
  atLast: false,
};

/** The state at a given index. Out-of-range indices finish the tour rather than throwing. */
export function tourStateAt(tour: NestorTour, index: number, status: NestorTourStatus = "running"): NestorTourState {
  if (index < 0 || index >= tour.stops.length) {
    return { ...IDLE_TOUR_STATE, status: status === "running" ? "finished" : status, tourId: tour.id, total: tour.stops.length };
  }
  return {
    status,
    tourId: tour.id,
    index,
    stop: tour.stops[index],
    position: index + 1,
    total: tour.stops.length,
    atLast: index === tour.stops.length - 1,
  };
}

/**
 * The next index whose entity still exists, or null when the tour is done.
 *
 * `exists` is injected rather than the module reaching for the runtime, which keeps this
 * testable and keeps the decision honest: a stop pointing at an entity the scene no longer has
 * is skipped silently. The alternative — narrating a thing that is not there while the camera
 * sits on nothing — is the one outcome a guided tour must never produce.
 */
export function nextLiveStopIndex(
  tour: NestorTour,
  from: number,
  exists: (entityId: string) => boolean,
): number | null {
  for (let index = Math.max(0, from); index < tour.stops.length; index += 1) {
    if (exists(tour.stops[index].entityId)) return index;
  }
  return null;
}

/** The previous index whose entity still exists, or null when there is nothing behind. */
export function previousLiveStopIndex(
  tour: NestorTour,
  from: number,
  exists: (entityId: string) => boolean,
): number | null {
  for (let index = Math.min(from, tour.stops.length - 1); index >= 0; index -= 1) {
    if (exists(tour.stops[index].entityId)) return index;
  }
  return null;
}

/** "Stop 2 of 5 · Build console" — the one line that says where you are. */
export function describeTourPosition(state: NestorTourState): string {
  if (state.status !== "running" || !state.stop) return "";
  return `Stop ${state.position} of ${state.total} · ${state.stop.title}`;
}

export interface NestorTourController {
  start: (tour?: NestorTour) => NestorTourState;
  next: () => NestorTourState;
  previous: () => NestorTourState;
  /** Stop where you are. Distinct from finishing, and the panel says so. */
  cancel: () => NestorTourState;
  state: () => NestorTourState;
  dispose: () => void;
}

/**
 * Drives the tour: frame the entity, highlight it, hold, move on.
 *
 * Every effect is injected. That is not ceremony — it is what keeps this module free of the
 * renderer and the runtime, so the sequencing above stays testable, and it makes the two
 * boundaries that matter explicit at the call site: `highlight` must be a selection call that
 * does not revise the document, and `focusEntity` must be the host's existing camera easing
 * rather than anything that opens a second frame loop.
 *
 * Dwell is a `setTimeout`. A tour advances on wall-clock time, not per-frame, so it neither
 * needs nor creates an animation loop; the only thing animating is the camera, and the host
 * was already doing that.
 */
export function createNestorTourController(options: {
  entityExists: (entityId: string) => boolean;
  focusEntity: (entityId: string) => void;
  /** Runtime selection only. Never a command, never a commit. */
  highlight: (entityIds: string[]) => void;
  reducedMotion: () => boolean;
  onChange: (state: NestorTourState) => void;
  /** Injected for tests; defaults to the real timers. */
  schedule?: (callback: () => void, ms: number) => number;
  cancelScheduled?: (handle: number) => void;
}): NestorTourController {
  const {
    entityExists,
    focusEntity,
    highlight,
    reducedMotion,
    onChange,
    schedule = (callback, ms) => window.setTimeout(callback, ms),
    cancelScheduled = (handle) => window.clearTimeout(handle),
  } = options;

  let tour: NestorTour = AGENTX_CENTER_TOUR;
  let current: NestorTourState = { ...IDLE_TOUR_STATE };
  let timer: number | null = null;

  const clearTimer = (): void => {
    if (timer !== null) cancelScheduled(timer);
    timer = null;
  };

  const settle = (next: NestorTourState): NestorTourState => {
    current = next;
    onChange(current);
    return current;
  };

  /** Ends the tour in a given terminal status, releasing the highlight it was holding. */
  const finish = (status: Exclude<NestorTourStatus, "running">): NestorTourState => {
    clearTimer();
    // The selection was the tour's, so the tour gives it back. Leaving an entity selected
    // after the tour ends would hand the editor a selection the person never made.
    highlight([]);
    return settle({ ...IDLE_TOUR_STATE, status, tourId: tour.id, total: tour.stops.length });
  };

  const goTo = (index: number | null): NestorTourState => {
    clearTimer();
    if (index === null) return finish("finished");
    const next = tourStateAt(tour, index);
    if (!next.stop) return finish("finished");
    focusEntity(next.stop.entityId);
    highlight([next.stop.entityId]);
    timer = schedule(() => {
      timer = null;
      advance();
    }, tourDwellMs(reducedMotion()));
    return settle(next);
  };

  const advance = (): NestorTourState => {
    if (current.status !== "running") return current;
    return goTo(nextLiveStopIndex(tour, current.index + 1, entityExists));
  };

  return {
    start: (requested = AGENTX_CENTER_TOUR) => {
      tour = requested;
      return goTo(nextLiveStopIndex(tour, 0, entityExists));
    },
    next: advance,
    previous: () => {
      if (current.status !== "running") return current;
      const back = previousLiveStopIndex(tour, current.index - 1, entityExists);
      // Already at the front: hold this stop rather than silently ending the tour backwards.
      return back === null ? goTo(current.index) : goTo(back);
    },
    cancel: () => (current.status === "running" ? finish("cancelled") : current),
    state: () => current,
    dispose: () => {
      clearTimer();
      current = { ...IDLE_TOUR_STATE };
    },
  };
}
