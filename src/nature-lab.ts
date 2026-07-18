import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Points,
  PointsMaterial,
  RingGeometry,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector3
} from "three";
import { OrbitalObservatory, type OrbitalObservatoryState } from "./orbital-observatory";
import {
  GRAPHYSX_WORLD_RECIPE_SCHEMA,
  isGraphysXWorldRecipe,
  type GraphysXWorldLayer,
  type GraphysXWorldObserver,
  type GraphysXWorldParameter,
  type GraphysXWorldRecipe,
  type GraphysXWorldStudyId
} from "./world-recipes";

export type NatureLabStudyId = GraphysXWorldStudyId;
export type NatureLabParameter = GraphysXWorldParameter;
export type NatureLabLayer = GraphysXWorldLayer;

export type NatureLabLessonId =
  | "flock-separation"
  | "flock-alignment"
  | "flock-cohesion"
  | "flock-complete"
  | "forces-random-walk"
  | "forces-attraction"
  | "forces-flow-field"
  | "forces-combined"
  | "forest-branching"
  | "forest-leaf-fall"
  | "forest-evolution"
  | "forest-life-cycle"
  | "orbital-live";

export type NatureLabLessonDefinition = {
  id: NatureLabLessonId;
  label: string;
  session: string;
  concept: string;
  observe: string;
  action: string;
  source: string;
};

export type NatureLabSettings = Record<NatureLabParameter, number>;
export type NatureLabLayers = Record<NatureLabLayer, boolean>;

export type NatureLabState = {
  study: NatureLabStudyId;
  title: string;
  source: string;
  elapsedSeconds: number;
  seed: number;
  population: number;
  trails: boolean;
  generation: number;
  paused: boolean;
  actionCount: number;
  lesson: NatureLabLessonDefinition;
  demonstration: {
    phase: string;
    effectiveRules: string[];
    interaction: string;
  };
  settings: NatureLabSettings;
  layers: NatureLabLayers;
  recipe: GraphysXWorldRecipe;
  observatory?: OrbitalObservatoryState;
  visibleSystems: string[];
};

export type NatureLabParameterDefinition = {
  key: NatureLabParameter;
  label: string;
  min: number;
  max: number;
  step: number;
};

export const NATURE_LAB_STUDIES: Array<{
  id: NatureLabStudyId;
  label: string;
  short: string;
  source: string;
  summary: string;
  parameters: NatureLabParameterDefinition[];
  lessons: NatureLabLessonDefinition[];
}> = [
  {
    id: "flock-planet",
    label: "Flock Planet",
    short: "3D flocking on a spherical world",
    source: "SBQC/public/js/{Boid3D,Flock3D,threejs_setup}.js",
    summary: "Separation, alignment, and cohesion run tangentially around a layered planet with orbital trails.",
    parameters: [
      { key: "separation", label: "Separation", min: 0, max: 3, step: 0.05 },
      { key: "alignment", label: "Alignment", min: 0, max: 3, step: 0.05 },
      { key: "cohesion", label: "Cohesion", min: 0, max: 3, step: 0.05 },
      { key: "speed", label: "Max Speed", min: 0.25, max: 2.2, step: 0.05 }
    ],
    lessons: [
      { id: "flock-separation", label: "Separation", session: "Flocking 1/4", concept: "One rule only: nearby boids push apart.", observe: "Watch dense knots open while headings remain deliberately uncoordinated.", action: "Compress the flock", source: "flock/{boid,flock,sketch}.js · Boid.separate" },
      { id: "flock-alignment", label: "Alignment", session: "Flocking 2/4", concept: "One rule only: neighbors match velocity.", observe: "Watch crossed currents settle into a shared heading without being pulled together.", action: "Cross the currents", source: "flock/{boid,flock}.js · Boid.align" },
      { id: "flock-cohesion", label: "Cohesion", session: "Flocking 3/4", concept: "One rule only: each boid steers toward its local center.", observe: "Watch two scattered hemispheres gather without separation protection.", action: "Split the flock", source: "flock/{boid,flock}.js · Boid.cohesion" },
      { id: "flock-complete", label: "Complete Flock", session: "Flocking 4/4", concept: "Separation, alignment, and cohesion run together.", observe: "Tune the three original weights, then disturb the flock and watch it recover.", action: "Add 12 boids", source: "flock/sketch.js · click/drag adds boids · Space toggles trails" }
    ]
  },
  {
    id: "forces-garden",
    label: "Forces & Flow Garden",
    short: "Walkers, attraction, particles, and vector fields",
    source: "SBQC/public/Projects/Nature of Code/s1, s2, s3, sAll/flowfield.js",
    summary: "Mass-aware particles orbit an attractor while guided walkers surf a visible three-dimensional flow field.",
    parameters: [
      { key: "attraction", label: "Attraction", min: 0, max: 3, step: 0.05 },
      { key: "flowStrength", label: "Flow Strength", min: 0, max: 2.5, step: 0.05 },
      { key: "speed", label: "Motion Limit", min: 0.25, max: 2.2, step: 0.05 }
    ],
    lessons: [
      { id: "forces-random-walk", label: "Random Walk", session: "Session 1", concept: "Two walkers accumulate an unpredictable path.", observe: "Only two walkers are active; their trails make stochastic motion readable over time.", action: "Restart both walkers", source: "s1/{sketch,walker}.js" },
      { id: "forces-attraction", label: "Gravity & Mass", session: "Session 2A", concept: "Mass-aware particles orbit an inverse-square attractor.", observe: "Light and heavy particles receive visibly different acceleration around the amber attractor.", action: "Release 12 particles", source: "s2/{sketch,particle,attractor}.js" },
      { id: "forces-flow-field", label: "Flow Field", session: "Session All", concept: "Vehicles sample a spatial vector field and steer toward it.", observe: "The turquoise vectors animate with the same field followed by the 18 vehicles.", action: "Scatter the vehicles", source: "sAll/{flowfield,animal,sketch}.js" },
      { id: "forces-combined", label: "Combined Garden", session: "Session 2 + All", concept: "Attraction, mass, walkers, and the flow field share one garden.", observe: "Use this synthesis only after inspecting the three isolated mechanisms.", action: "Impulse the system", source: "s2 + sAll (GraphysX 3D composition)" }
    ]
  },
  {
    id: "living-forest",
    label: "Living Forest",
    short: "Recursive growth, leaf fall, DNA, and generations",
    source: "SBQC/public/Projects/Nature of Code/s4 and s5",
    summary: "Recursive trees grow, change season, shed leaves, and advance through visibly mutating generations.",
    parameters: [
      { key: "mutationRate", label: "Mutation", min: 0, max: 0.35, step: 0.01 },
      { key: "cycleSeconds", label: "Season Length", min: 8, max: 28, step: 0.5 }
    ],
    lessons: [
      { id: "forest-branching", label: "Recursive Growth", session: "Session 4A", concept: "Branches recursively split and shrink over time.", observe: "Leaves are hidden so the branch recursion can be read from trunk to tips.", action: "Regrow the branches", source: "s4/{branch,tree,sketch}.js" },
      { id: "forest-leaf-fall", label: "Leaf Fall", session: "Session 4B", concept: "Leaves accelerate, drift, fall, and recycle.", observe: "The tree is already grown; trigger autumn to isolate falling-leaf motion.", action: "Trigger autumn", source: "s4/{leaf,tree}.js" },
      { id: "forest-evolution", label: "DNA & Evolution", session: "Session 5", concept: "Leaf color mutates between generations.", observe: "Advance generations directly and compare the inherited color families.", action: "Next generation", source: "s5/{dna,forest,tree,leaf}.js" },
      { id: "forest-life-cycle", label: "Complete Life Cycle", session: "Session 4 + 5", concept: "Growth, season, leaf fall, mutation, and rebirth run as one cycle.", observe: "The phase readout names what is happening instead of hiding it in a compressed animation.", action: "Plant another tree", source: "s4 + s5 (GraphysX 3D composition)" }
    ]
  },
  {
    id: "orbital-observatory",
    label: "Orbital Observatory",
    short: "Earth telemetry, ISS trajectory, pass windows, and quakes",
    source: "SBQC/public/js/{Globe,Trajectory,Starfield,earth3D,threeEarth}.js",
    summary: "A layered Earth tracks an inclined ISS orbit, observer pass radius, and a curated field of source earthquake telemetry.",
    parameters: [
      { key: "orbitSpeed", label: "Orbit Speed", min: 0.1, max: 3, step: 0.05 },
      { key: "earthSpin", label: "Earth Spin", min: 0, max: 2, step: 0.05 },
      { key: "detectionRadiusKm", label: "Pass Radius KM", min: 250, max: 4500, step: 50 },
      { key: "quakeScale", label: "Quake Scale", min: 0, max: 3, step: 0.05 }
    ],
    lessons: [
      { id: "orbital-live", label: "Live Observatory", session: "World telemetry", concept: "ISS trajectory, quakes, and observer passes remain an independent world.", observe: "Move the observer or toggle layers through the recipe API.", action: "Advance to next pass", source: "public/js/{Globe,Trajectory,Starfield,earth3D,threeEarth}.js" }
    ]
  }
];

const DEFAULT_SETTINGS: NatureLabSettings = {
  separation: 1.5,
  alignment: 1,
  cohesion: 1,
  speed: 1,
  attraction: 1.15,
  flowStrength: 0.72,
  mutationRate: 0.08,
  cycleSeconds: 17,
  orbitSpeed: 1,
  earthSpin: 0.2,
  detectionRadiusKm: 1500,
  quakeScale: 1
};

const DEFAULT_LAYERS: NatureLabLayers = {
  trails: true,
  clouds: true,
  trajectory: true,
  quakes: true,
  observer: true
};

const DEFAULT_OBSERVER: GraphysXWorldObserver = {
  label: "Québec City",
  latitude: 46.8139,
  longitude: -71.208
};

type FlockRuntime = {
  positions: Vector3[];
  velocities: Vector3[];
  mesh: InstancedMesh;
  planet: Group;
  trailGeometry: BufferGeometry;
  trailPositions: Float32BufferAttribute;
  trailHistory: Vector3[][];
  trailIndices: number[];
  trailLength: number;
  capacity: number;
};

type ForcesRuntime = {
  positions: Vector3[];
  velocities: Vector3[];
  masses: number[];
  particles: InstancedMesh;
  walkerPositions: Vector3[];
  walkerVelocities: Vector3[];
  walkers: InstancedMesh;
  attractor: Mesh;
  field: LineSegments;
  fieldPositions: Float32BufferAttribute;
  walkerTrails: LineSegments;
  walkerTrailPositions: Float32BufferAttribute;
  walkerTrailHistory: Vector3[][];
  walkerTrailLength: number;
  particleCapacity: number;
};

type ForestLeaf = {
  base: Vector3;
  phase: number;
  fallSpeed: number;
  drift: number;
  treeIndex: number;
};

type ForestRuntime = {
  branches: LineSegments;
  branchSegmentCount: number;
  leaves: InstancedMesh;
  leafData: ForestLeaf[];
  treeCount: number;
};

const UP = new Vector3(0, 1, 0);

export class NatureLab {
  readonly group = new Group();
  private readonly studyRoot = new Group();
  private readonly settings: NatureLabSettings = { ...DEFAULT_SETTINGS };
  private readonly layers: NatureLabLayers = { ...DEFAULT_LAYERS };
  private study: NatureLabStudyId;
  private lesson: NatureLabLessonId;
  private seed: number;
  private observer: GraphysXWorldObserver = { ...DEFAULT_OBSERVER };
  private elapsedSeconds = 0;
  private generation = 1;
  private trails = true;
  private paused = false;
  private actionCount = 0;
  private plantedTrees = 0;
  private flock: FlockRuntime | null = null;
  private forces: ForcesRuntime | null = null;
  private forest: ForestRuntime | null = null;
  private orbital: OrbitalObservatory | null = null;
  private readonly dummy = new Object3D();
  private readonly scratch = {
    a: new Vector3(),
    b: new Vector3(),
    c: new Vector3(),
    d: new Vector3(),
    e: new Vector3(),
    f: new Vector3()
  };

  constructor(study: NatureLabStudyId = "flock-planet", seed = 1977) {
    this.study = study;
    this.lesson = defaultLessonForStudy(study).id;
    this.seed = seed;
    this.group.name = "SBQCNatureLab";
    this.studyRoot.name = "NatureStudy";
    this.group.add(this.studyRoot);
    this.buildStudy();
  }

  getState(): NatureLabState {
    const metadata = NATURE_LAB_STUDIES.find((candidate) => candidate.id === this.study) ?? NATURE_LAB_STUDIES[0];
    const lesson = metadata.lessons.find((candidate) => candidate.id === this.lesson) ?? metadata.lessons[0];
    const observatory = this.orbital?.getState();
    const population = this.visiblePopulation(observatory);
    const visibleSystems = this.visibleSystemsForLesson();
    return {
      study: this.study,
      title: metadata.label,
      source: metadata.source,
      elapsedSeconds: this.elapsedSeconds,
      seed: this.seed,
      population,
      trails: this.trails,
      generation: this.generation,
      paused: this.paused,
      actionCount: this.actionCount,
      lesson: { ...lesson },
      demonstration: {
        phase: this.demonstrationPhase(),
        effectiveRules: this.effectiveRules(),
        interaction: `${lesson.action} · canvas click or Experiment button`
      },
      settings: { ...this.settings },
      layers: { ...this.layers },
      recipe: this.getRecipe(),
      observatory,
      visibleSystems
    };
  }

  getRecipe(): GraphysXWorldRecipe {
    const metadata = NATURE_LAB_STUDIES.find((candidate) => candidate.id === this.study) ?? NATURE_LAB_STUDIES[0];
    const activeParameters = Object.fromEntries(
      metadata.parameters.map((parameter) => [parameter.key, this.settings[parameter.key]])
    ) as Partial<Record<NatureLabParameter, number>>;
    return {
      schema: GRAPHYSX_WORLD_RECIPE_SCHEMA,
      id: `graphysx.live.${this.study}`,
      label: `${metadata.label} — live recipe`,
      study: this.study,
      lesson: this.lesson,
      seed: this.seed,
      settings: activeParameters,
      layers: { ...this.layers },
      ...(this.study === "orbital-observatory" ? { observer: { ...this.observer } } : {})
    };
  }

  loadRecipe(recipe: GraphysXWorldRecipe): boolean {
    if (!isGraphysXWorldRecipe(recipe)) {
      return false;
    }
    this.seed = Math.floor(recipe.seed) >>> 0;
    for (const [parameter, value] of Object.entries(recipe.settings)) {
      if (typeof value === "number" && Number.isFinite(value) && parameter in this.settings) {
        const definition = NATURE_LAB_STUDIES.flatMap((study) => study.parameters).find((candidate) => candidate.key === parameter);
        this.settings[parameter as NatureLabParameter] = definition
          ? Math.min(definition.max, Math.max(definition.min, value))
          : value;
      }
    }
    for (const [layer, visible] of Object.entries(recipe.layers)) {
      if (typeof visible === "boolean" && layer in this.layers) {
        this.layers[layer as NatureLabLayer] = visible;
      }
    }
    if (recipe.observer) {
      this.observer = {
        label: recipe.observer.label,
        latitude: Math.max(-90, Math.min(90, recipe.observer.latitude)),
        longitude: Math.max(-180, Math.min(180, recipe.observer.longitude))
      };
    }
    this.study = recipe.study;
    const recipeStudy = NATURE_LAB_STUDIES.find((candidate) => candidate.id === recipe.study) ?? NATURE_LAB_STUDIES[0];
    this.lesson = recipeStudy.lessons.some((candidate) => candidate.id === recipe.lesson)
      ? recipe.lesson as NatureLabLessonId
      : recipeStudy.lessons[0].id;
    this.elapsedSeconds = 0;
    this.generation = 1;
    this.actionCount = 0;
    this.plantedTrees = 0;
    this.trails = this.layers.trails;
    this.buildStudy();
    return true;
  }

  setStudy(study: NatureLabStudyId): void {
    if (!NATURE_LAB_STUDIES.some((candidate) => candidate.id === study)) {
      return;
    }
    this.study = study;
    this.lesson = defaultLessonForStudy(study).id;
    this.elapsedSeconds = 0;
    this.generation = 1;
    this.actionCount = 0;
    this.plantedTrees = 0;
    this.buildStudy();
  }

  setLesson(lesson: NatureLabLessonId): boolean {
    const metadata = NATURE_LAB_STUDIES.find((candidate) => candidate.id === this.study);
    if (!metadata?.lessons.some((candidate) => candidate.id === lesson)) {
      return false;
    }
    this.lesson = lesson;
    this.elapsedSeconds = 0;
    this.actionCount = 0;
    this.applyLessonPresentation();
    this.performLessonSetup();
    return true;
  }

  setPaused(paused: boolean): boolean {
    this.paused = paused;
    return this.paused;
  }

  step(seconds = 1 / 6): boolean {
    const duration = Math.min(30, Math.max(1 / 60, seconds));
    const steps = Math.max(1, Math.ceil(duration * 60));
    for (let index = 0; index < steps; index += 1) {
      this.advanceSimulation(duration / steps);
    }
    return true;
  }

  performLessonAction(): boolean {
    this.actionCount += 1;
    if (this.flock) {
      this.performFlockAction();
      return true;
    }
    if (this.forces) {
      this.performForcesAction();
      return true;
    }
    if (this.forest) {
      this.performForestAction();
      return true;
    }
    if (this.orbital) {
      this.step(18);
      return true;
    }
    return false;
  }

  setParameter(parameter: NatureLabParameter, value: number): void {
    if (!(parameter in this.settings) || !Number.isFinite(value)) {
      return;
    }
    const definition = NATURE_LAB_STUDIES.flatMap((study) => study.parameters).find((candidate) => candidate.key === parameter);
    this.settings[parameter] = definition ? Math.min(definition.max, Math.max(definition.min, value)) : value;
    this.syncOrbitalConfiguration();
  }

  setLayer(layer: NatureLabLayer, visible: boolean): boolean {
    if (!(layer in this.layers)) {
      return false;
    }
    this.layers[layer] = visible;
    if (layer === "trails") {
      this.trails = visible;
      if (this.flock) {
        this.flock.trailGeometry.setDrawRange(0, visible ? this.flock.trailPositions.count : 0);
      }
    }
    this.syncOrbitalConfiguration();
    return this.layers[layer];
  }

  setObserver(observer: GraphysXWorldObserver): boolean {
    if (
      !observer.label ||
      !Number.isFinite(observer.latitude) ||
      !Number.isFinite(observer.longitude) ||
      observer.latitude < -90 ||
      observer.latitude > 90 ||
      observer.longitude < -180 ||
      observer.longitude > 180
    ) {
      return false;
    }
    this.observer = { ...observer };
    this.orbital?.setObserver(this.observer);
    return true;
  }

  setSeed(seed: number): void {
    if (!Number.isFinite(seed)) {
      return;
    }
    this.seed = Math.floor(seed) >>> 0;
    this.reset();
  }

  toggleTrails(): boolean {
    return this.setLayer("trails", !this.layers.trails);
  }

  reset(): void {
    this.elapsedSeconds = 0;
    this.generation = 1;
    this.actionCount = 0;
    this.plantedTrees = 0;
    this.buildStudy();
  }

  update(deltaSeconds: number): void {
    if (this.paused) {
      return;
    }
    this.advanceSimulation(deltaSeconds);
  }

  private advanceSimulation(deltaSeconds: number): void {
    const delta = Math.min(1 / 20, Math.max(0, deltaSeconds));
    this.elapsedSeconds += delta;
    if (this.flock) {
      this.updateFlock(delta);
    }
    if (this.forces) {
      this.updateForces(delta);
    }
    if (this.forest) {
      this.updateForest(delta);
    }
    this.orbital?.update(delta);
  }

  dispose(): void {
    this.orbital?.dispose();
    disposeObjectTree(this.studyRoot);
    this.studyRoot.clear();
    this.flock = null;
    this.forces = null;
    this.forest = null;
    this.orbital = null;
  }

  private buildStudy(): void {
    this.orbital?.dispose();
    disposeObjectTree(this.studyRoot);
    this.studyRoot.clear();
    this.flock = null;
    this.forces = null;
    this.forest = null;
    this.orbital = null;
    if (this.study === "flock-planet") {
      this.buildFlockPlanet();
    } else if (this.study === "forces-garden") {
      this.buildForcesGarden();
    } else if (this.study === "living-forest") {
      this.buildLivingForest();
    } else {
      this.buildOrbitalObservatory();
    }
    this.applyLessonPresentation();
    this.performLessonSetup();
  }

  private buildOrbitalObservatory(): void {
    const observatory = new OrbitalObservatory(
      {
        orbitSpeed: this.settings.orbitSpeed,
        earthSpin: this.settings.earthSpin,
        detectionRadiusKm: this.settings.detectionRadiusKm,
        quakeScale: this.settings.quakeScale
      },
      {
        clouds: this.layers.clouds,
        trajectory: this.layers.trajectory,
        quakes: this.layers.quakes,
        observer: this.layers.observer
      },
      this.observer
    );
    this.orbital = observatory;
    this.studyRoot.add(observatory.group);
  }

  private syncOrbitalConfiguration(): void {
    if (!this.orbital) {
      return;
    }
    this.orbital.setSettings({
      orbitSpeed: this.settings.orbitSpeed,
      earthSpin: this.settings.earthSpin,
      detectionRadiusKm: this.settings.detectionRadiusKm,
      quakeScale: this.settings.quakeScale
    });
    this.orbital.setLayers({
      clouds: this.layers.clouds,
      trajectory: this.layers.trajectory,
      quakes: this.layers.quakes,
      observer: this.layers.observer
    });
  }

  private buildFlockPlanet(): void {
    const rng = seededRandom(this.seed);
    const planet = new Group();
    planet.name = "LayeredPlanet";
    const earthTexture = createPlanetTexture(this.seed);
    const surface = new Mesh(
      new SphereGeometry(4.4, 64, 40),
      new MeshStandardMaterial({
        map: earthTexture,
        color: new Color("#c9e7ec"),
        roughness: 0.76,
        metalness: 0.06
      })
    );
    surface.castShadow = true;
    surface.receiveShadow = true;
    planet.add(surface);

    const atmosphere = new Mesh(
      new SphereGeometry(4.54, 48, 32),
      new MeshPhysicalMaterial({
        color: new Color("#8ad8ff"),
        transparent: true,
        opacity: 0.12,
        roughness: 0.08,
        metalness: 0,
        transmission: 0.15,
        side: DoubleSide
      })
    );
    atmosphere.name = "CloudAtmosphere";
    planet.add(atmosphere);

    const latitude = new Mesh(
      new TorusGeometry(4.72, 0.018, 6, 160),
      new MeshBasicMaterial({ color: new Color("#75e8ff"), transparent: true, opacity: 0.28, blending: AdditiveBlending })
    );
    latitude.rotation.x = Math.PI / 2;
    planet.add(latitude);
    const tiltedOrbit = latitude.clone();
    tiltedOrbit.rotation.set(0.72, 0.25, 0.2);
    planet.add(tiltedOrbit);
    this.studyRoot.add(planet);

    const starPositions: number[] = [];
    for (let index = 0; index < 900; index += 1) {
      const direction = randomUnitVector(rng);
      const distance = 18 + rng() * 26;
      starPositions.push(direction.x * distance, direction.y * distance, direction.z * distance);
    }
    const starGeometry = new BufferGeometry();
    starGeometry.setAttribute("position", new Float32BufferAttribute(starPositions, 3));
    const stars = new Points(
      starGeometry,
      new PointsMaterial({ color: new Color("#d9f5ff"), size: 0.095, transparent: true, opacity: 0.76, sizeAttenuation: true })
    );
    stars.name = "NatureStarfield";
    this.studyRoot.add(stars);

    // The source flock page starts at 60 and adds boids on click/drag. Keep
    // that readable starting population while reserving room for live actions.
    const count = 60;
    const capacity = 216;
    const radius = 5.25;
    const positions: Vector3[] = [];
    const velocities: Vector3[] = [];
    const mesh = new InstancedMesh(
      new ConeGeometry(0.11, 0.38, 5),
      new MeshStandardMaterial({
        color: new Color("#d9fbff"),
        emissive: new Color("#167ca0"),
        emissiveIntensity: 0.72,
        roughness: 0.28,
        metalness: 0.18
      }),
      capacity
    );
    mesh.name = "SphericalBoidFlock";
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);

    for (let index = 0; index < count; index += 1) {
      const y = 1 - (index / Math.max(1, count - 1)) * 2;
      const radial = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = Math.PI * (3 - Math.sqrt(5)) * index + (rng() - 0.5) * 0.18;
      const position = new Vector3(Math.cos(theta) * radial, y, Math.sin(theta) * radial).multiplyScalar(radius);
      const tangent = randomUnitVector(rng).cross(position).normalize().multiplyScalar(0.62 + rng() * 0.28);
      positions.push(position);
      velocities.push(tangent);
      mesh.setColorAt(index, new Color().setHSL(0.48 + rng() * 0.12, 0.82, 0.66));
    }
    mesh.instanceColor!.needsUpdate = true;
    mesh.count = count;
    this.studyRoot.add(mesh);

    // Source boid.js retains 45 trail samples for every active boid.
    const trailIndices = Array.from({ length: count }, (_, index) => index);
    const trailLength = 45;
    const trailHistory = trailIndices.map((index) => Array.from({ length: trailLength }, () => positions[index].clone()));
    const trailArray = new Float32Array(trailIndices.length * (trailLength - 1) * 2 * 3);
    const trailPositions = new Float32BufferAttribute(trailArray, 3);
    trailPositions.setUsage(DynamicDrawUsage);
    const trailGeometry = new BufferGeometry();
    trailGeometry.setAttribute("position", trailPositions);
    const trails = new LineSegments(
      trailGeometry,
      new LineBasicMaterial({ color: new Color("#56dfff"), transparent: true, opacity: 0.34, blending: AdditiveBlending })
    );
    trails.name = "FlockTrails";
    this.studyRoot.add(trails);
    this.flock = { positions, velocities, mesh, planet, trailGeometry, trailPositions, trailHistory, trailIndices, trailLength, capacity };
    this.updateFlockInstances();
  }

  private updateFlock(delta: number): void {
    const runtime = this.flock;
    if (!runtime) {
      return;
    }
    const neighborDistance = 1.75;
    const separationDistance = 0.78;
    const maxSpeed = 0.38 + this.settings.speed * 0.74;
    const maxForce = 0.58;
    const weights = this.effectiveFlockWeights();
    const { a: separation, b: alignment, c: cohesion, d: diff, e: normal, f: desired } = this.scratch;

    const accelerations = runtime.positions.map(() => new Vector3());
    for (let index = 0; index < runtime.positions.length; index += 1) {
      separation.set(0, 0, 0);
      alignment.set(0, 0, 0);
      cohesion.set(0, 0, 0);
      let separationCount = 0;
      let neighborCount = 0;
      const position = runtime.positions[index];
      for (let otherIndex = 0; otherIndex < runtime.positions.length; otherIndex += 1) {
        if (index === otherIndex) {
          continue;
        }
        diff.subVectors(position, runtime.positions[otherIndex]);
        const distance = diff.length();
        if (distance > 0 && distance < separationDistance) {
          separation.addScaledVector(diff.normalize(), 1 / Math.max(distance, 0.08));
          separationCount += 1;
        }
        if (distance < neighborDistance) {
          alignment.add(runtime.velocities[otherIndex]);
          cohesion.add(runtime.positions[otherIndex]);
          neighborCount += 1;
        }
      }
      normal.copy(position).normalize();
      if (separationCount > 0) {
        separation.divideScalar(separationCount).projectOnPlane(normal).setLength(maxForce * weights.separation);
        accelerations[index].add(separation);
      }
      if (neighborCount > 0) {
        alignment.divideScalar(neighborCount).projectOnPlane(normal);
        if (alignment.lengthSq() > 0.0001) {
          alignment.setLength(maxSpeed).sub(runtime.velocities[index]).clampLength(0, maxForce * weights.alignment);
          accelerations[index].add(alignment);
        }
        cohesion.divideScalar(neighborCount);
        desired.subVectors(cohesion, position).projectOnPlane(normal);
        if (desired.lengthSq() > 0.0001) {
          desired.setLength(maxSpeed).sub(runtime.velocities[index]).clampLength(0, maxForce * weights.cohesion);
          accelerations[index].add(desired);
        }
      }
      const curl = diff.set(-normal.z, Math.sin(this.elapsedSeconds * 0.21 + index) * 0.15, normal.x).projectOnPlane(normal);
      if (curl.lengthSq() > 0.0001) {
        accelerations[index].addScaledVector(curl.normalize(), this.lesson === "flock-complete" ? 0.12 : 0.025);
      }
    }

    for (let index = 0; index < runtime.positions.length; index += 1) {
      const position = runtime.positions[index];
      const velocity = runtime.velocities[index];
      velocity.addScaledVector(accelerations[index], delta).clampLength(maxSpeed * 0.38, maxSpeed);
      position.addScaledVector(velocity, delta);
      normal.copy(position).normalize();
      position.copy(normal).multiplyScalar(5.25);
      velocity.projectOnPlane(normal);
      if (velocity.lengthSq() < 0.001) {
        velocity.copy(randomUnitVector(seededRandom(this.seed + index))).cross(normal).normalize().multiplyScalar(maxSpeed * 0.6);
      }
    }

    runtime.planet.rotation.y += delta * 0.055;
    runtime.planet.children[1].rotation.y += delta * 0.082;
    this.updateFlockInstances();
    this.updateFlockTrails();
  }

  private updateFlockInstances(): void {
    const runtime = this.flock;
    if (!runtime) {
      return;
    }
    for (let index = 0; index < runtime.positions.length; index += 1) {
      const direction = this.scratch.a.copy(runtime.velocities[index]).normalize();
      this.dummy.position.copy(runtime.positions[index]);
      this.dummy.quaternion.setFromUnitVectors(UP, direction);
      this.dummy.scale.setScalar(0.82 + (index % 7) * 0.035);
      this.dummy.updateMatrix();
      runtime.mesh.setMatrixAt(index, this.dummy.matrix);
    }
    runtime.mesh.instanceMatrix.needsUpdate = true;
  }

  private updateFlockTrails(): void {
    const runtime = this.flock;
    if (!runtime || !this.trails) {
      runtime?.trailGeometry.setDrawRange(0, 0);
      return;
    }
    const array = runtime.trailPositions.array as Float32Array;
    let offset = 0;
    runtime.trailIndices.forEach((boidIndex, trailIndex) => {
      const history = runtime.trailHistory[trailIndex];
      history.push(runtime.positions[boidIndex].clone());
      if (history.length > runtime.trailLength) {
        history.shift();
      }
      for (let pointIndex = 1; pointIndex < history.length; pointIndex += 1) {
        const previous = history[pointIndex - 1];
        const current = history[pointIndex];
        array[offset++] = previous.x;
        array[offset++] = previous.y;
        array[offset++] = previous.z;
        array[offset++] = current.x;
        array[offset++] = current.y;
        array[offset++] = current.z;
      }
    });
    runtime.trailPositions.needsUpdate = true;
    runtime.trailGeometry.setDrawRange(0, offset / 3);
  }

  private buildForcesGarden(): void {
    const rng = seededRandom(this.seed + 1000);
    const floorGeometry = new PlaneGeometry(24, 18, 32, 24);
    floorGeometry.rotateX(-Math.PI / 2);
    const floorPositions = floorGeometry.attributes.position;
    for (let index = 0; index < floorPositions.count; index += 1) {
      const x = floorPositions.getX(index);
      const z = floorPositions.getZ(index);
      floorPositions.setY(index, Math.sin(x * 0.42) * 0.08 + Math.cos(z * 0.51) * 0.08);
    }
    floorPositions.needsUpdate = true;
    floorGeometry.computeVertexNormals();
    const floor = new Mesh(
      floorGeometry,
      new MeshStandardMaterial({ color: new Color("#132d31"), roughness: 0.82, metalness: 0.08, side: DoubleSide })
    );
    floor.receiveShadow = true;
    this.studyRoot.add(floor);

    const fieldVertices: number[] = [];
    for (let x = -10; x <= 10; x += 1.4) {
      for (let z = -7; z <= 7; z += 1.4) {
        const angle = flowAngle(x, z, 0);
        const length = 0.52;
        fieldVertices.push(x, 0.13, z, x + Math.cos(angle) * length, 0.13, z + Math.sin(angle) * length);
      }
    }
    const fieldGeometry = new BufferGeometry();
    const fieldPositions = new Float32BufferAttribute(fieldVertices, 3);
    fieldPositions.setUsage(DynamicDrawUsage);
    fieldGeometry.setAttribute("position", fieldPositions);
    const field = new LineSegments(
      fieldGeometry,
      new LineBasicMaterial({ color: new Color("#4ce2c2"), transparent: true, opacity: 0.34, blending: AdditiveBlending })
    );
    field.name = "FlowFieldVectors";
    this.studyRoot.add(field);

    const attractor = new Mesh(
      new IcosahedronGeometry(0.92, 3),
      new MeshStandardMaterial({
        color: new Color("#ffbf69"),
        emissive: new Color("#6f2700"),
        emissiveIntensity: 1.05,
        roughness: 0.22,
        metalness: 0.28
      })
    );
    attractor.name = "InverseSquareAttractor";
    attractor.position.set(0, 2.55, 0);
    this.studyRoot.add(attractor);
    const attractorRing = new Mesh(
      new TorusGeometry(1.36, 0.035, 8, 72),
      new MeshBasicMaterial({ color: new Color("#ff9857"), transparent: true, opacity: 0.72, blending: AdditiveBlending })
    );
    attractorRing.rotation.x = Math.PI / 2;
    attractor.add(attractorRing);

    const count = 176;
    const particleCapacity = 240;
    const positions: Vector3[] = [];
    const velocities: Vector3[] = [];
    const masses: number[] = [];
    const particles = new InstancedMesh(
      new SphereGeometry(0.12, 10, 7),
      new MeshStandardMaterial({ color: new Color("#ffffff"), emissive: new Color("#153845"), emissiveIntensity: 0.7, roughness: 0.3 }),
      particleCapacity
    );
    particles.name = "MassParticles";
    particles.instanceMatrix.setUsage(DynamicDrawUsage);
    for (let index = 0; index < count; index += 1) {
      const position = new Vector3((rng() - 0.5) * 19, 0.7 + rng() * 5.8, (rng() - 0.5) * 13.5);
      const mass = 0.55 + rng() * 2.45;
      const toward = new Vector3().subVectors(attractor.position, position);
      const velocity = new Vector3(-toward.z, (rng() - 0.5) * 0.35, toward.x).normalize().multiplyScalar(0.65 + rng() * 0.65);
      positions.push(position);
      velocities.push(velocity);
      masses.push(mass);
      particles.setColorAt(index, new Color().setHSL(mass < 1.65 ? 0.45 : 0.12, 0.82, 0.61));
    }
    particles.instanceColor!.needsUpdate = true;
    particles.count = count;
    this.studyRoot.add(particles);

    const walkerCount = 18;
    const walkerPositions: Vector3[] = [];
    const walkerVelocities: Vector3[] = [];
    const walkers = new InstancedMesh(
      new ConeGeometry(0.2, 0.52, 5),
      new MeshStandardMaterial({ color: new Color("#f0fbff"), emissive: new Color("#116d79"), emissiveIntensity: 0.7, roughness: 0.38 }),
      walkerCount
    );
    walkers.name = "FlowWalkers";
    walkers.instanceMatrix.setUsage(DynamicDrawUsage);
    for (let index = 0; index < walkerCount; index += 1) {
      walkerPositions.push(new Vector3((rng() - 0.5) * 18, 0.42, (rng() - 0.5) * 12));
      walkerVelocities.push(new Vector3(0.4, 0, 0));
      walkers.setColorAt(index, index === 0 ? new Color("#f4f7f8") : index === 1 ? new Color("#ffd34f") : new Color().setHSL(0.48 + rng() * 0.14, 0.8, 0.64));
    }
    walkers.instanceColor!.needsUpdate = true;
    this.studyRoot.add(walkers);

    // Session 1 draws into a canvas that is never cleared, so the path is the
    // experiment. Keep roughly seven seconds of 60 Hz history in 3D.
    const walkerTrailLength = 420;
    const walkerTrailHistory = walkerPositions.map((position) => Array.from({ length: walkerTrailLength }, () => position.clone()));
    const walkerTrailArray = new Float32Array(walkerCount * (walkerTrailLength - 1) * 2 * 3);
    const walkerTrailPositions = new Float32BufferAttribute(walkerTrailArray, 3);
    walkerTrailPositions.setUsage(DynamicDrawUsage);
    const walkerTrailGeometry = new BufferGeometry();
    walkerTrailGeometry.setAttribute("position", walkerTrailPositions);
    const walkerTrails = new LineSegments(
      walkerTrailGeometry,
      new LineBasicMaterial({ color: new Color("#ffe47a"), transparent: true, opacity: 0.9, blending: AdditiveBlending })
    );
    walkerTrails.name = "WalkerPathMemory";
    this.studyRoot.add(walkerTrails);
    this.forces = {
      positions,
      velocities,
      masses,
      particles,
      walkerPositions,
      walkerVelocities,
      walkers,
      attractor,
      field,
      fieldPositions,
      walkerTrails,
      walkerTrailPositions,
      walkerTrailHistory,
      walkerTrailLength,
      particleCapacity
    };
    this.updateForcesInstances();
  }

  private updateForces(delta: number): void {
    const runtime = this.forces;
    if (!runtime) {
      return;
    }
    const attractionActive = this.lesson === "forces-attraction" || this.lesson === "forces-combined";
    const flowActive = this.lesson === "forces-flow-field" || this.lesson === "forces-combined";
    const randomWalkActive = this.lesson === "forces-random-walk";
    runtime.attractor.position.x = this.lesson === "forces-combined" ? Math.sin(this.elapsedSeconds * 0.31) * 1.8 : 0;
    runtime.attractor.position.z = this.lesson === "forces-combined" ? Math.cos(this.elapsedSeconds * 0.23) * 1.25 : 0;
    runtime.attractor.rotation.y += delta * 0.8;
    runtime.attractor.children[0].rotation.z += delta * 0.7;
    const maxSpeed = 0.75 + this.settings.speed * 1.1;
    if (attractionActive) {
      for (let index = 0; index < runtime.positions.length; index += 1) {
        const position = runtime.positions[index];
        const velocity = runtime.velocities[index];
        const toAttractor = this.scratch.a.subVectors(runtime.attractor.position, position);
        const distanceSq = Math.max(1.4, toAttractor.lengthSq());
        const attraction = toAttractor.normalize().multiplyScalar((this.settings.attraction * 5.2 * runtime.masses[index]) / distanceSq);
        const angle = flowAngle(position.x, position.z, this.elapsedSeconds * 0.17);
        const flowAmount = this.lesson === "forces-combined" ? this.settings.flowStrength * 0.48 : 0;
        const flow = this.scratch.b.set(Math.cos(angle), Math.sin(angle * 0.7) * 0.18, Math.sin(angle)).multiplyScalar(flowAmount);
        velocity.addScaledVector(attraction, delta).addScaledVector(flow, delta).clampLength(0, maxSpeed);
        position.addScaledVector(velocity, delta);
        bounceWithin(position, velocity, 10.8, 0.28, 7.3, 7.6);
      }
    }

    const activeWalkers = randomWalkActive ? 2 : flowActive ? runtime.walkerPositions.length : 0;
    for (let index = 0; index < activeWalkers; index += 1) {
      const position = runtime.walkerPositions[index];
      const velocity = runtime.walkerVelocities[index];
      const angle = randomWalkActive
        ? flowAngle(position.x * 0.3 + index * 7.1, position.z * 0.3, this.elapsedSeconds * 1.4 + index * 11.7)
        : flowAngle(position.x, position.z, this.elapsedSeconds * 0.2 + index * 0.7);
      const desiredSpeed = randomWalkActive ? maxSpeed * 1.05 : maxSpeed * 0.58;
      const desired = this.scratch.c.set(Math.cos(angle), 0, Math.sin(angle)).multiplyScalar(desiredSpeed);
      velocity
        .lerp(desired, Math.min(1, delta * (randomWalkActive ? 5.6 : 1.8 + this.settings.flowStrength)))
        .clampLength(0, maxSpeed * (randomWalkActive ? 1.1 : 0.7));
      position.addScaledVector(velocity, delta);
      if (randomWalkActive) {
        bounceWithin(position, velocity, 10.5, 0.42, 7.1, 0.42);
      } else {
        if (position.x < -10.5) position.x = 10.5;
        if (position.x > 10.5) position.x = -10.5;
        if (position.z < -7.1) position.z = 7.1;
        if (position.z > 7.1) position.z = -7.1;
      }
    }
    if (flowActive) {
      this.updateFlowFieldGeometry();
    }
    this.updateForcesInstances();
    this.updateWalkerTrails(activeWalkers);
  }

  private updateForcesInstances(): void {
    const runtime = this.forces;
    if (!runtime) {
      return;
    }
    runtime.positions.forEach((position, index) => {
      const scale = 0.72 + runtime.masses[index] * 0.24;
      this.dummy.position.copy(position);
      this.dummy.quaternion.identity();
      this.dummy.scale.setScalar(scale);
      this.dummy.updateMatrix();
      runtime.particles.setMatrixAt(index, this.dummy.matrix);
    });
    runtime.particles.instanceMatrix.needsUpdate = true;
    runtime.walkerPositions.forEach((position, index) => {
      const direction = this.scratch.d.copy(runtime.walkerVelocities[index]).normalize();
      this.dummy.position.copy(position);
      this.dummy.quaternion.setFromUnitVectors(UP, direction);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      runtime.walkers.setMatrixAt(index, this.dummy.matrix);
    });
    runtime.walkers.instanceMatrix.needsUpdate = true;
  }

  private updateFlowFieldGeometry(): void {
    const runtime = this.forces;
    if (!runtime) {
      return;
    }
    const array = runtime.fieldPositions.array as Float32Array;
    let offset = 0;
    for (let x = -10; x <= 10; x += 1.4) {
      for (let z = -7; z <= 7; z += 1.4) {
        const angle = flowAngle(x, z, this.elapsedSeconds * 0.2);
        const length = 0.52;
        array[offset++] = x;
        array[offset++] = 0.13;
        array[offset++] = z;
        array[offset++] = x + Math.cos(angle) * length;
        array[offset++] = 0.13;
        array[offset++] = z + Math.sin(angle) * length;
      }
    }
    runtime.fieldPositions.needsUpdate = true;
  }

  private updateWalkerTrails(activeWalkers: number): void {
    const runtime = this.forces;
    if (!runtime || activeWalkers === 0) {
      runtime?.walkerTrails.geometry.setDrawRange(0, 0);
      return;
    }
    const array = runtime.walkerTrailPositions.array as Float32Array;
    let offset = 0;
    for (let walkerIndex = 0; walkerIndex < activeWalkers; walkerIndex += 1) {
      const history = runtime.walkerTrailHistory[walkerIndex];
      history.push(runtime.walkerPositions[walkerIndex].clone());
      if (history.length > runtime.walkerTrailLength) {
        history.shift();
      }
      for (let pointIndex = 1; pointIndex < history.length; pointIndex += 1) {
        const previous = history[pointIndex - 1];
        const current = history[pointIndex];
        array[offset++] = previous.x;
        array[offset++] = previous.y + 0.03;
        array[offset++] = previous.z;
        array[offset++] = current.x;
        array[offset++] = current.y + 0.03;
        array[offset++] = current.z;
      }
    }
    runtime.walkerTrailPositions.needsUpdate = true;
    runtime.walkerTrails.geometry.setDrawRange(0, offset / 3);
  }

  private buildLivingForest(): void {
    const rng = seededRandom(this.seed + 2000);
    const groundGeometry = new PlaneGeometry(25, 18, 32, 24);
    groundGeometry.rotateX(-Math.PI / 2);
    const groundPositions = groundGeometry.attributes.position;
    for (let index = 0; index < groundPositions.count; index += 1) {
      const x = groundPositions.getX(index);
      const z = groundPositions.getZ(index);
      groundPositions.setY(index, Math.sin(x * 0.25) * 0.22 + Math.cos(z * 0.32) * 0.18);
    }
    groundPositions.needsUpdate = true;
    groundGeometry.computeVertexNormals();
    const ground = new Mesh(
      groundGeometry,
      new MeshStandardMaterial({ color: new Color("#28523a"), roughness: 0.94, metalness: 0.01, side: DoubleSide })
    );
    ground.receiveShadow = true;
    this.studyRoot.add(ground);

    const treeCount = 13 + this.plantedTrees;
    const branchPositions: number[] = [];
    const leafData: ForestLeaf[] = [];
    for (let treeIndex = 0; treeIndex < treeCount; treeIndex += 1) {
      const column = treeIndex % 5;
      const row = Math.floor(treeIndex / 5);
      const root = new Vector3(-9 + column * 4.5 + (rng() - 0.5) * 1.2, 0.12, -5 + row * 4.6 + (rng() - 0.5) * 1.2);
      const height = 0.78 + rng() * 0.24;
      growTreeBranches({
        start: root,
        direction: new Vector3((rng() - 0.5) * 0.08, height, (rng() - 0.5) * 0.08),
        depth: 6,
        treeIndex,
        rng,
        branchPositions,
        leafData
      });
    }
    const branchGeometry = new BufferGeometry();
    branchGeometry.setAttribute("position", new Float32BufferAttribute(branchPositions, 3));
    const branches = new LineSegments(
      branchGeometry,
      new LineBasicMaterial({ color: new Color("#b8753f"), transparent: true, opacity: 0.98 })
    );
    branches.name = "RecursiveBranches";
    this.studyRoot.add(branches);

    const leaves = new InstancedMesh(
      new IcosahedronGeometry(0.15, 1),
      new MeshStandardMaterial({ color: new Color("#c8ffd0"), emissive: new Color("#12351d"), emissiveIntensity: 0.22, roughness: 0.72, metalness: 0.02 }),
      leafData.length
    );
    leaves.name = "DNALeaves";
    leaves.instanceMatrix.setUsage(DynamicDrawUsage);
    this.studyRoot.add(leaves);

    const groveRing = new Mesh(
      new RingGeometry(10.8, 10.92, 96),
      new MeshBasicMaterial({ color: new Color("#62e6ad"), transparent: true, opacity: 0.2, side: DoubleSide })
    );
    groveRing.rotation.x = -Math.PI / 2;
    groveRing.position.y = 0.09;
    this.studyRoot.add(groveRing);
    this.forest = { branches, branchSegmentCount: branchPositions.length / 6, leaves, leafData, treeCount };
    this.updateForest(0);
  }

  private updateForest(_delta: number): void {
    const runtime = this.forest;
    if (!runtime) {
      return;
    }
    const cycle = Math.max(8, this.settings.cycleSeconds);
    let progress = 0;
    if (this.lesson === "forest-life-cycle") {
      if (this.elapsedSeconds >= cycle) {
        this.elapsedSeconds %= cycle;
        this.generation += 1;
      }
      progress = this.elapsedSeconds / cycle;
    } else if (this.lesson === "forest-branching") {
      progress = Math.min(0.46, this.elapsedSeconds / Math.max(1, cycle * 0.7) * 0.46);
    } else if (this.lesson === "forest-leaf-fall") {
      const fallCycle = Math.max(3, cycle * 0.55);
      progress = 0.48 + (this.elapsedSeconds % fallCycle) / fallCycle * 0.52;
    } else {
      progress = 0.47;
    }
    const growth = smoothstep(0, 0.34, progress);
    runtime.branches.geometry.setDrawRange(0, Math.floor(runtime.branchSegmentCount * growth) * 2);
    const leafVisibility = this.lesson === "forest-branching" ? 0 : smoothstep(0.2, 0.42, progress);
    const fallProgress = smoothstep(0.58, 1, progress);
    const mutation = this.settings.mutationRate * (this.generation - 1);
    runtime.leafData.forEach((leaf, index) => {
      const localFall = Math.max(0, Math.min(1, (fallProgress - leaf.phase * 0.28) / Math.max(0.15, 1 - leaf.phase * 0.28)));
      this.dummy.position.copy(leaf.base);
      this.dummy.position.y = Math.max(0.16, leaf.base.y - localFall * leaf.fallSpeed * 5.4);
      this.dummy.position.x += Math.sin(localFall * 9 + leaf.phase * 12) * leaf.drift * localFall;
      this.dummy.position.z += Math.cos(localFall * 7 + leaf.phase * 9) * leaf.drift * localFall;
      const scale = leafVisibility * (1 - localFall * 0.48) * (0.82 + leaf.phase * 0.42);
      this.dummy.scale.setScalar(Math.max(0.001, scale));
      this.dummy.rotation.set(localFall * 3.2, leaf.phase * Math.PI * 2, localFall * 2.1);
      this.dummy.updateMatrix();
      runtime.leaves.setMatrixAt(index, this.dummy.matrix);
      const baseHue = 0.29 + ((leaf.treeIndex * 0.031 + mutation * Math.sin(leaf.treeIndex * 1.7)) % 0.18);
      const autumnHue = 0.03 + leaf.phase * 0.1;
      runtime.leaves.setColorAt(index, new Color().setHSL(baseHue + (autumnHue - baseHue) * fallProgress, 0.72, 0.44 + leaf.phase * 0.16));
    });
    runtime.leaves.instanceMatrix.needsUpdate = true;
    runtime.leaves.instanceColor!.needsUpdate = true;
  }

  private visiblePopulation(observatory?: OrbitalObservatoryState): number {
    if (this.flock) {
      return this.flock.positions.length;
    }
    if (this.forces) {
      if (this.lesson === "forces-random-walk") return 2;
      if (this.lesson === "forces-attraction") return this.forces.positions.length;
      if (this.lesson === "forces-flow-field") return this.forces.walkerPositions.length;
      return this.forces.positions.length + this.forces.walkerPositions.length;
    }
    if (this.forest) {
      return this.lesson === "forest-branching" ? this.forest.treeCount : this.forest.treeCount + this.forest.leafData.length;
    }
    return observatory ? observatory.earthquakes.count + 1 : 0;
  }

  private visibleSystemsForLesson(): string[] {
    const systems: Record<NatureLabLessonId, string[]> = {
      "flock-separation": ["60 source-count boids", "separation only", "neighbor radius", "spherical boundary", "path trails"],
      "flock-alignment": ["60 source-count boids", "alignment only", "crossed headings", "spherical boundary", "path trails"],
      "flock-cohesion": ["60 source-count boids", "cohesion only", "two starting groups", "local center", "path trails"],
      "flock-complete": ["live boid spawning", "separation", "alignment", "cohesion", "spherical boundary", "path trails"],
      "forces-random-walk": ["two walkers", "stochastic steering", "persistent trails", "edge bounce"],
      "forces-attraction": ["mass particles", "inverse-square attractor", "mass color groups", "distance constraint", "particle spawning"],
      "forces-flow-field": ["animated vectors", "18 steering vehicles", "field lookup", "edge wrapping", "path memory"],
      "forces-combined": ["mass particles", "inverse-square attraction", "animated flow field", "18 steering vehicles", "boundary response"],
      "forest-branching": ["13 recursive trees", "branch timers", "shrinking child vectors", "growth reveal"],
      "forest-leaf-fall": ["fully grown branches", "seasonal leaves", "gravity", "drift", "recycling fall"],
      "forest-evolution": ["DNA leaf color", "mutation rate", "generation comparison", "inherited families"],
      "forest-life-cycle": ["recursive growth", "seasonal leaves", "falling leaves", "mutation", "generations", "live planting"],
      "orbital-live": ["day/night Earth", "cloud shell", "ISS", "inclined trajectory", "observer pass window", "earthquake telemetry", "reference grid"]
    };
    return systems[this.lesson];
  }

  private demonstrationPhase(): string {
    if (this.lesson.startsWith("flock-")) {
      return this.actionCount > 0 && this.elapsedSeconds < 2.2 ? "disturbance applied — watch recovery" : "isolated flock rule running";
    }
    if (this.lesson === "forces-random-walk") return `two path histories · ${Math.floor(this.elapsedSeconds * 60)} samples`;
    if (this.lesson === "forces-attraction") return `${this.forces?.positions.length ?? 0} particles orbiting a fixed attractor`;
    if (this.lesson === "forces-flow-field") return "vehicles sampling the visible animated field";
    if (this.lesson === "forces-combined") return "attraction and flow active together";
    if (this.lesson === "forest-branching") {
      const progress = Math.min(100, Math.round(this.elapsedSeconds / Math.max(1, this.settings.cycleSeconds * 0.7) * 100));
      return `recursive growth ${progress}%`;
    }
    if (this.lesson === "forest-leaf-fall") return "autumn fall loop";
    if (this.lesson === "forest-evolution") return `generation ${this.generation} DNA colors`;
    if (this.lesson === "forest-life-cycle") {
      const progress = (this.elapsedSeconds % this.settings.cycleSeconds) / this.settings.cycleSeconds;
      if (progress < 0.2) return "germination";
      if (progress < 0.45) return "branch and leaf growth";
      if (progress < 0.62) return "mature canopy";
      if (progress < 0.84) return "autumn mutation colors";
      return "leaf fall and rebirth";
    }
    const pass = this.orbital?.getState().pass;
    return pass?.insideDetectionRadius ? "observer pass active" : "orbit and pass prediction running";
  }

  private effectiveRules(): string[] {
    const weights = this.effectiveFlockWeights();
    if (this.lesson.startsWith("flock-")) {
      return [
        `separation ${weights.separation.toFixed(2)}`,
        `alignment ${weights.alignment.toFixed(2)}`,
        `cohesion ${weights.cohesion.toFixed(2)}`
      ];
    }
    if (this.lesson === "forces-random-walk") return ["random steering", "two walkers", "bounce at bounds"];
    if (this.lesson === "forces-attraction") return [`G ${this.settings.attraction.toFixed(2)}`, "F ∝ mass / distance²", "distance clamped"];
    if (this.lesson === "forces-flow-field") return [`flow ${this.settings.flowStrength.toFixed(2)}`, "field lookup", "steering interpolation"];
    if (this.lesson === "forces-combined") return [`attraction ${this.settings.attraction.toFixed(2)}`, `flow ${this.settings.flowStrength.toFixed(2)}`];
    if (this.lesson === "forest-branching") return ["recursive split", "child length × 0.69", "six depths"];
    if (this.lesson === "forest-leaf-fall") return ["gravity", "phase-delayed fall", "wind drift"];
    if (this.lesson === "forest-evolution") return [`mutation ${this.settings.mutationRate.toFixed(2)}`, `generation ${this.generation}`];
    if (this.lesson === "forest-life-cycle") return [`season ${this.settings.cycleSeconds.toFixed(1)} s`, `mutation ${this.settings.mutationRate.toFixed(2)}`];
    return ["inclined orbit", "observer distance", "pass prediction"];
  }

  private effectiveFlockWeights(): { separation: number; alignment: number; cohesion: number } {
    if (this.lesson === "flock-separation") return { separation: this.settings.separation, alignment: 0, cohesion: 0 };
    if (this.lesson === "flock-alignment") return { separation: 0, alignment: this.settings.alignment, cohesion: 0 };
    if (this.lesson === "flock-cohesion") return { separation: 0, alignment: 0, cohesion: this.settings.cohesion };
    return { separation: this.settings.separation, alignment: this.settings.alignment, cohesion: this.settings.cohesion };
  }

  private applyLessonPresentation(): void {
    if (this.forces) {
      const attractionVisible = this.lesson === "forces-attraction" || this.lesson === "forces-combined";
      const flowVisible = this.lesson === "forces-flow-field" || this.lesson === "forces-combined";
      const randomWalkVisible = this.lesson === "forces-random-walk";
      this.forces.particles.visible = attractionVisible;
      this.forces.particles.count = this.forces.positions.length;
      this.forces.attractor.visible = attractionVisible;
      this.forces.field.visible = flowVisible;
      this.forces.walkers.visible = flowVisible || randomWalkVisible;
      this.forces.walkers.count = randomWalkVisible ? 2 : flowVisible ? this.forces.walkerPositions.length : 0;
      this.forces.walkerTrails.visible = flowVisible || randomWalkVisible;
    }
    if (this.forest) {
      this.forest.branches.visible = true;
      this.forest.leaves.visible = this.lesson !== "forest-branching";
    }
  }

  private performLessonSetup(): void {
    if (this.flock) {
      this.resetFlockForLesson();
      return;
    }
    if (this.forces) {
      this.resetForcesForLesson();
      return;
    }
    if (this.forest) {
      this.elapsedSeconds = 0;
      this.updateForest(0);
    }
  }

  private performFlockAction(): void {
    if (this.lesson === "flock-complete") {
      this.addFlockBoids(12);
    } else {
      this.resetFlockForLesson(true);
    }
  }

  private resetFlockForLesson(isAction = false): void {
    const runtime = this.flock;
    if (!runtime) return;
    const rng = seededRandom(this.seed + this.actionCount * 173 + 31);
    runtime.positions.forEach((position, index) => {
      let normal: Vector3;
      if (this.lesson === "flock-separation") {
        const spread = isAction ? 0.12 : 0.24;
        normal = new Vector3((rng() - 0.5) * spread, (rng() - 0.5) * spread, 1).normalize();
      } else if (this.lesson === "flock-cohesion") {
        const side = index % 2 === 0 ? -1 : 1;
        normal = new Vector3(side, (rng() - 0.5) * 0.34, (rng() - 0.5) * 0.34).normalize();
      } else {
        normal = position.clone().normalize();
      }
      position.copy(normal).multiplyScalar(5.25);
      const tangent = this.scratch.a.set(-normal.z, 0.12 * (rng() - 0.5), normal.x).projectOnPlane(normal).normalize();
      if (this.lesson === "flock-alignment" && index % 2 === 0) tangent.multiplyScalar(-1);
      runtime.velocities[index].copy(tangent).multiplyScalar(0.72 + rng() * 0.22);
    });
    runtime.trailHistory.forEach((history, trailIndex) => {
      const source = runtime.positions[runtime.trailIndices[trailIndex]];
      history.splice(0, history.length, ...Array.from({ length: runtime.trailLength }, () => source.clone()));
    });
    this.elapsedSeconds = 0;
    this.updateFlockInstances();
  }

  private addFlockBoids(quantity: number): void {
    const runtime = this.flock;
    if (!runtime) return;
    const rng = seededRandom(this.seed + this.actionCount * 911);
    const targetCount = Math.min(runtime.capacity, runtime.positions.length + quantity);
    for (let index = runtime.positions.length; index < targetCount; index += 1) {
      const position = randomUnitVector(rng).multiplyScalar(5.25);
      const velocity = randomUnitVector(rng).cross(position).normalize().multiplyScalar(0.62 + rng() * 0.32);
      runtime.positions.push(position);
      runtime.velocities.push(velocity);
      runtime.mesh.setColorAt(index, new Color().setHSL(0.48 + rng() * 0.12, 0.82, 0.66));
    }
    runtime.mesh.count = runtime.positions.length;
    if (runtime.mesh.instanceColor) runtime.mesh.instanceColor.needsUpdate = true;
    this.updateFlockInstances();
  }

  private resetForcesForLesson(): void {
    const runtime = this.forces;
    if (!runtime) return;
    const rng = seededRandom(this.seed + this.actionCount * 257 + 1000);
    if (this.lesson === "forces-random-walk") {
      runtime.walkerPositions[0].set(-3.2, 0.42, 0);
      runtime.walkerPositions[1].set(3.2, 0.42, 0);
      runtime.walkerVelocities[0].set(0.5, 0, 0.18);
      runtime.walkerVelocities[1].set(-0.42, 0, -0.22);
    } else if (this.lesson === "forces-flow-field") {
      runtime.walkerPositions.forEach((position) => position.set((rng() - 0.5) * 18, 0.42, (rng() - 0.5) * 12));
    }
    runtime.walkerTrailHistory.forEach((history, index) => {
      const source = runtime.walkerPositions[index];
      history.splice(0, history.length, ...Array.from({ length: runtime.walkerTrailLength }, () => source.clone()));
    });
    this.elapsedSeconds = 0;
    this.updateForcesInstances();
    this.updateWalkerTrails(this.lesson === "forces-random-walk" ? 2 : runtime.walkerPositions.length);
  }

  private performForcesAction(): void {
    const runtime = this.forces;
    if (!runtime) return;
    if (this.lesson === "forces-random-walk") {
      this.resetForcesForLesson();
      return;
    }
    if (this.lesson === "forces-attraction") {
      this.addForceParticles(12);
      return;
    }
    if (this.lesson === "forces-flow-field") {
      this.resetForcesForLesson();
      return;
    }
    const rng = seededRandom(this.seed + this.actionCount * 613);
    runtime.velocities.forEach((velocity) => velocity.add(new Vector3((rng() - 0.5) * 2.4, (rng() - 0.5) * 0.8, (rng() - 0.5) * 2.4)));
  }

  private addForceParticles(quantity: number): void {
    const runtime = this.forces;
    if (!runtime) return;
    const rng = seededRandom(this.seed + this.actionCount * 733);
    const targetCount = Math.min(runtime.particleCapacity, runtime.positions.length + quantity);
    for (let index = runtime.positions.length; index < targetCount; index += 1) {
      const position = new Vector3((rng() - 0.5) * 19, 4.8 + rng() * 1.2, (rng() - 0.5) * 3);
      const mass = 0.55 + rng() * 2.45;
      const toward = new Vector3().subVectors(runtime.attractor.position, position);
      runtime.positions.push(position);
      runtime.velocities.push(new Vector3(-toward.z, 0, toward.x).normalize().multiplyScalar(0.7 + rng() * 0.5));
      runtime.masses.push(mass);
      runtime.particles.setColorAt(index, new Color().setHSL(mass < 1.65 ? 0.45 : 0.12, 0.82, 0.61));
    }
    runtime.particles.count = runtime.positions.length;
    if (runtime.particles.instanceColor) runtime.particles.instanceColor.needsUpdate = true;
    this.updateForcesInstances();
  }

  private performForestAction(): void {
    if (!this.forest) return;
    if (this.lesson === "forest-branching") {
      this.elapsedSeconds = 0;
    } else if (this.lesson === "forest-leaf-fall") {
      this.elapsedSeconds = Math.max(3, this.settings.cycleSeconds * 0.55) * 0.25;
    } else if (this.lesson === "forest-evolution") {
      this.generation += 1;
    } else {
      this.plantedTrees = Math.min(5, this.plantedTrees + 1);
      this.buildStudy();
      return;
    }
    this.updateForest(0);
  }
}

function defaultLessonForStudy(study: NatureLabStudyId): NatureLabLessonDefinition {
  const metadata = NATURE_LAB_STUDIES.find((candidate) => candidate.id === study) ?? NATURE_LAB_STUDIES[0];
  return metadata.lessons[0];
}

function growTreeBranches(options: {
  start: Vector3;
  direction: Vector3;
  depth: number;
  treeIndex: number;
  rng: () => number;
  branchPositions: number[];
  leafData: ForestLeaf[];
}): void {
  const end = options.start.clone().add(options.direction);
  options.branchPositions.push(options.start.x, options.start.y, options.start.z, end.x, end.y, end.z);
  if (options.depth <= 0) {
    options.leafData.push({
      base: end,
      phase: options.rng(),
      fallSpeed: 0.35 + options.rng() * 0.75,
      drift: 0.18 + options.rng() * 0.5,
      treeIndex: options.treeIndex
    });
    return;
  }
  const branchCount = options.depth > 4 ? 2 : options.rng() > 0.72 ? 3 : 2;
  for (let branchIndex = 0; branchIndex < branchCount; branchIndex += 1) {
    const sign = branchIndex % 2 === 0 ? -1 : 1;
    const nextDirection = options.direction.clone().multiplyScalar(0.69 + options.rng() * 0.035);
    nextDirection.applyAxisAngle(new Vector3(0, 0, 1), sign * (0.36 + options.rng() * 0.16));
    nextDirection.applyAxisAngle(UP, (branchIndex / branchCount) * Math.PI * 1.7 + (options.rng() - 0.5) * 0.5);
    growTreeBranches({ ...options, start: end, direction: nextDirection, depth: options.depth - 1 });
  }
}

function bounceWithin(position: Vector3, velocity: Vector3, halfX: number, minY: number, maxY: number, halfZ: number): void {
  if (position.x < -halfX || position.x > halfX) {
    position.x = Math.max(-halfX, Math.min(halfX, position.x));
    velocity.x *= -0.86;
  }
  if (position.y < minY || position.y > maxY) {
    position.y = Math.max(minY, Math.min(maxY, position.y));
    velocity.y *= -0.84;
  }
  if (position.z < -halfZ || position.z > halfZ) {
    position.z = Math.max(-halfZ, Math.min(halfZ, position.z));
    velocity.z *= -0.86;
  }
}

function flowAngle(x: number, z: number, time: number): number {
  return Math.sin(x * 0.27 + time) * 1.8 + Math.cos(z * 0.31 - time * 0.7) * 1.3 + Math.sin((x + z) * 0.12) * 0.8;
}

function randomUnitVector(rng: () => number): Vector3 {
  const z = rng() * 2 - 1;
  const angle = rng() * Math.PI * 2;
  const radial = Math.sqrt(Math.max(0, 1 - z * z));
  return new Vector3(Math.cos(angle) * radial, z, Math.sin(angle) * radial);
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const x = Math.max(0, Math.min(1, (value - edge0) / Math.max(0.0001, edge1 - edge0)));
  return x * x * (3 - 2 * x);
}

function createPlanetTexture(seed: number): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) {
    return new CanvasTexture(canvas);
  }
  const ocean = context.createLinearGradient(0, 0, 0, canvas.height);
  ocean.addColorStop(0, "#0f4e72");
  ocean.addColorStop(0.5, "#12678b");
  ocean.addColorStop(1, "#092b4d");
  context.fillStyle = ocean;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const rng = seededRandom(seed + 77);
  for (let cluster = 0; cluster < 42; cluster += 1) {
    const centerX = rng() * canvas.width;
    const centerY = 55 + rng() * (canvas.height - 110);
    const hue = 92 + rng() * 34;
    context.fillStyle = `hsla(${hue}, ${38 + rng() * 20}%, ${28 + rng() * 18}%, ${0.48 + rng() * 0.34})`;
    context.beginPath();
    const points = 9 + Math.floor(rng() * 8);
    for (let point = 0; point < points; point += 1) {
      const angle = (point / points) * Math.PI * 2;
      const radiusX = 24 + rng() * 76;
      const radiusY = 12 + rng() * 38;
      const x = centerX + Math.cos(angle) * radiusX;
      const y = centerY + Math.sin(angle) * radiusY;
      if (point === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
    context.fill();
  }
  context.globalAlpha = 0.22;
  context.strokeStyle = "#d9fbff";
  context.lineWidth = 1;
  for (let latitude = 64; latitude < canvas.height; latitude += 64) {
    context.beginPath();
    context.moveTo(0, latitude);
    context.lineTo(canvas.width, latitude);
    context.stroke();
  }
  context.globalAlpha = 1;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function disposeObjectTree(root: Group): void {
  root.traverse((child) => {
    const candidate = child as Mesh;
    candidate.geometry?.dispose();
    const materials = Array.isArray(candidate.material) ? candidate.material : candidate.material ? [candidate.material] : [];
    materials.forEach((material) => {
      const mappedMaterial = material as MeshStandardMaterial;
      mappedMaterial.map?.dispose();
      material.dispose();
    });
  });
}
