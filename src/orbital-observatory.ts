import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  ConeGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  RingGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  TorusGeometry,
  Vector3
} from "three";
import quakeCatalog from "./legacy/sbqc-quakes.json";
import type { GraphysXWorldLayer, GraphysXWorldObserver, GraphysXWorldParameter } from "./world-recipes";

const EARTH_RADIUS = 4.5;
const EARTH_RADIUS_KM = 6371;
const ISS_ALTITUDE_KM = 420;
// SBQC's earth3D uses 50 visual units above a radius-300 Earth. Preserve that
// readable exaggeration while telemetry continues to report the real 420 km.
const ORBIT_RADIUS = EARTH_RADIUS * (1 + 50 / 300);
const ISS_INCLINATION = (51.6 * Math.PI) / 180;
const ORBIT_PHASE = -0.72;
const UP = new Vector3(0, 1, 0);
const FORWARD = new Vector3(0, 0, 1);

type ObservatorySettings = Pick<
  Record<GraphysXWorldParameter, number>,
  "orbitSpeed" | "earthSpin" | "detectionRadiusKm" | "quakeScale"
>;

type ObservatoryLayers = Pick<Record<GraphysXWorldLayer, boolean>, "clouds" | "trajectory" | "quakes" | "observer">;

export type OrbitalObservatoryState = {
  satellite: {
    label: "ISS";
    latitude: number;
    longitude: number;
    altitudeKm: number;
    position: { x: number; y: number; z: number };
    simulatedPeriodSeconds: number;
  };
  observer: GraphysXWorldObserver & {
    detectionRadiusKm: number;
    distanceToSatelliteKm: number;
  };
  pass: {
    insideDetectionRadius: boolean;
    entryInSeconds: number | null;
    exitInSeconds: number | null;
  };
  earthquakes: {
    visible: boolean;
    count: number;
    maximumMagnitude: number;
    source: string;
    sourceCommit: string;
  };
  sources: string[];
};

type QuakeEvent = (typeof quakeCatalog.events)[number];

export class OrbitalObservatory {
  readonly group = new Group();
  private readonly globe = new Group();
  private readonly trajectoryRoot = new Group();
  private readonly satelliteRoot = new Group();
  private readonly textureLoader = new TextureLoader();
  private readonly textures: Texture[] = [];
  private readonly dummy = new Object3D();
  private readonly scratch = {
    satellite: new Vector3(),
    next: new Vector3(),
    observer: new Vector3(),
    normal: new Vector3()
  };
  private readonly earth: Mesh;
  private readonly clouds: Mesh;
  private readonly quakes: InstancedMesh;
  private readonly observerRoot = new Group();
  private readonly observerRange: Mesh;
  private readonly trajectory: Line;
  private readonly satelliteGlow: Mesh;
  private readonly satellite: Sprite;
  private elapsedSeconds = 0;
  private telemetryAccumulator = 0;
  private settings: ObservatorySettings;
  private layers: ObservatoryLayers;
  private observer: GraphysXWorldObserver;
  private state: OrbitalObservatoryState;

  constructor(
    settings: ObservatorySettings,
    layers: ObservatoryLayers,
    observer: GraphysXWorldObserver
  ) {
    this.settings = { ...settings };
    this.layers = { ...layers };
    this.observer = { ...observer };
    this.group.name = "SBQCOrbitalObservatory";
    this.globe.name = "LayeredEarth";
    this.trajectoryRoot.name = "ISSTrajectory";
    this.satelliteRoot.name = "ISSSatellite";
    this.observerRoot.name = "ObserverPassRadius";

    const day = this.loadTexture("/assets/sbqc/orbital/earth-day.jpg", true);
    const night = this.loadTexture("/assets/sbqc/orbital/earth-night.jpg", true);
    const mask = this.loadTexture("/assets/sbqc/orbital/earth-mask.jpg", false);
    const cloudMap = this.loadTexture("/assets/sbqc/orbital/earth-clouds.png", true);
    const issMap = this.loadTexture("/assets/sbqc/orbital/iss.png", true);

    this.earth = new Mesh(
      new SphereGeometry(EARTH_RADIUS, 72, 48),
      new MeshStandardMaterial({
        map: day,
        roughnessMap: mask,
        emissiveMap: night,
        emissive: new Color("#789dff"),
        emissiveIntensity: 0.62,
        roughness: 0.72,
        metalness: 0.04
      })
    );
    this.earth.name = "EarthDayNight";
    this.earth.castShadow = true;
    this.earth.receiveShadow = true;
    this.globe.add(this.earth);

    this.clouds = new Mesh(
      new SphereGeometry(EARTH_RADIUS * 1.018, 64, 40),
      new MeshStandardMaterial({
        map: cloudMap,
        transparent: true,
        opacity: 0.52,
        alphaTest: 0.025,
        depthWrite: false,
        roughness: 0.92,
        metalness: 0,
        side: DoubleSide
      })
    );
    this.clouds.name = "EarthCloudLayer";
    this.globe.add(this.clouds);

    const atmosphere = new Mesh(
      new SphereGeometry(EARTH_RADIUS * 1.055, 56, 36),
      new MeshPhysicalMaterial({
        color: new Color("#62bbff"),
        emissive: new Color("#1d68a8"),
        emissiveIntensity: 0.34,
        transparent: true,
        opacity: 0.09,
        roughness: 0.05,
        metalness: 0,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide
      })
    );
    atmosphere.name = "AtmosphereGlow";
    this.globe.add(atmosphere);

    this.addReferenceGrid();
    this.quakes = this.createQuakeMarkers(quakeCatalog.events);
    this.globe.add(this.quakes);

    const observerMarker = new Mesh(
      new IcosahedronGeometry(0.105, 1),
      new MeshBasicMaterial({ color: new Color("#fff06b") })
    );
    observerMarker.name = "ObserverMarker";
    this.observerRange = new Mesh(
      new TorusGeometry(0.92, 0.025, 8, 72),
      new MeshBasicMaterial({ color: new Color("#fff06b"), transparent: true, opacity: 0.74, depthWrite: false })
    );
    this.observerRange.name = "ObserverDetectionRadius";
    this.observerRoot.add(observerMarker, this.observerRange);
    this.globe.add(this.observerRoot);
    this.positionObserver();

    this.trajectory = this.createTrajectory();
    this.trajectoryRoot.add(this.trajectory);
    const orbitNodes = this.createOrbitNodes();
    this.trajectoryRoot.add(orbitNodes);

    this.satelliteGlow = new Mesh(
      new RingGeometry(0.22, 0.38, 32),
      new MeshBasicMaterial({
        color: new Color("#76f8ff"),
        transparent: true,
        opacity: 0.72,
        side: DoubleSide,
        blending: AdditiveBlending,
        depthWrite: false
      })
    );
    this.satelliteGlow.name = "ISSPassGlow";
    this.satellite = new Sprite(
      new SpriteMaterial({ map: issMap, color: new Color("#ffffff"), transparent: true, depthWrite: false })
    );
    this.satellite.name = "ISSImage";
    this.satellite.scale.set(3.05, 1.25, 1);
    this.satelliteRoot.add(this.satelliteGlow, this.satellite);

    this.group.add(this.globe, this.trajectoryRoot, this.satelliteRoot);
    this.state = this.createInitialState();
    this.applyLayerVisibility();
    this.update(0);
  }

  getState(): OrbitalObservatoryState {
    return structuredClone(this.state);
  }

  setSettings(settings: ObservatorySettings): void {
    this.settings = { ...settings };
    this.positionObserver();
    this.updateQuakeInstances();
    this.telemetryAccumulator = 1;
    this.update(0);
  }

  setLayers(layers: ObservatoryLayers): void {
    this.layers = { ...layers };
    this.applyLayerVisibility();
    this.state.earthquakes.visible = this.layers.quakes;
  }

  setObserver(observer: GraphysXWorldObserver): void {
    this.observer = { ...observer };
    this.positionObserver();
    this.state.observer.label = observer.label;
    this.state.observer.latitude = observer.latitude;
    this.state.observer.longitude = observer.longitude;
    this.telemetryAccumulator = 1;
    this.update(0);
  }

  reset(): void {
    this.elapsedSeconds = 0;
    this.telemetryAccumulator = 1;
    this.globe.rotation.y = 0;
    this.clouds.rotation.y = 0;
    this.update(0);
  }

  update(deltaSeconds: number): void {
    this.elapsedSeconds += Math.max(0, deltaSeconds);
    const period = this.getOrbitPeriod();
    const orbitAngle = ORBIT_PHASE + (this.elapsedSeconds / period) * Math.PI * 2;
    const earthAngle = this.elapsedSeconds * (Math.PI * 2 / 120) * this.settings.earthSpin;
    this.globe.rotation.y = earthAngle;
    this.clouds.rotation.y = this.elapsedSeconds * 0.012;

    const position = this.orbitPosition(orbitAngle, this.scratch.satellite);
    const next = this.orbitPosition(orbitAngle + 0.012, this.scratch.next);
    this.satelliteRoot.position.copy(position);
    this.satelliteRoot.lookAt(next);
    this.satelliteGlow.lookAt(0, 0, 0);
    const pulse = 1 + Math.sin(this.elapsedSeconds * 4.2) * 0.12;
    this.satelliteGlow.scale.setScalar(pulse);

    this.telemetryAccumulator += deltaSeconds;
    if (this.telemetryAccumulator >= 0.2 || deltaSeconds === 0) {
      this.telemetryAccumulator = 0;
      this.updateTelemetry(orbitAngle, earthAngle, period);
    }
  }

  dispose(): void {
    this.group.traverse((child) => {
      const candidate = child as Mesh;
      candidate.geometry?.dispose();
      const materials = Array.isArray(candidate.material) ? candidate.material : candidate.material ? [candidate.material] : [];
      materials.forEach((material) => material.dispose());
    });
    this.textures.forEach((texture) => texture.dispose());
    this.group.clear();
  }

  private loadTexture(path: string, colorTexture: boolean): Texture {
    const texture = this.textureLoader.load(path);
    if (colorTexture) {
      texture.colorSpace = SRGBColorSpace;
    }
    texture.anisotropy = 8;
    this.textures.push(texture);
    return texture;
  }

  private createInitialState(): OrbitalObservatoryState {
    return {
      satellite: {
        label: "ISS",
        latitude: 0,
        longitude: 0,
        altitudeKm: ISS_ALTITUDE_KM,
        position: { x: 0, y: 0, z: 0 },
        simulatedPeriodSeconds: this.getOrbitPeriod()
      },
      observer: {
        ...this.observer,
        detectionRadiusKm: this.settings.detectionRadiusKm,
        distanceToSatelliteKm: 0
      },
      pass: { insideDetectionRadius: false, entryInSeconds: null, exitInSeconds: null },
      earthquakes: {
        visible: this.layers.quakes,
        count: quakeCatalog.events.length,
        maximumMagnitude: Math.max(...quakeCatalog.events.map((event) => event.magnitude)),
        source: quakeCatalog.source,
        sourceCommit: quakeCatalog.sourceCommit
      },
      sources: [
        "SBQC/public/js/Globe.js",
        "SBQC/public/js/Trajectory.js",
        "SBQC/public/js/Starfield.js",
        "SBQC/public/js/earth3D.js",
        "SBQC/public/js/threeEarth.js"
      ]
    };
  }

  private getOrbitPeriod(): number {
    return 92 / Math.max(0.08, this.settings.orbitSpeed);
  }

  private orbitPosition(angle: number, target: Vector3): Vector3 {
    return target.set(
      Math.cos(angle) * ORBIT_RADIUS,
      Math.sin(angle) * Math.sin(ISS_INCLINATION) * ORBIT_RADIUS,
      Math.sin(angle) * Math.cos(ISS_INCLINATION) * ORBIT_RADIUS
    );
  }

  private updateTelemetry(orbitAngle: number, earthAngle: number, period: number): void {
    const satelliteDirection = this.orbitPosition(orbitAngle, this.scratch.satellite).normalize();
    const earthRelative = satelliteDirection.clone().applyAxisAngle(UP, -earthAngle);
    const latitude = Math.asin(earthRelative.y) * (180 / Math.PI);
    const longitude = normalizeLongitude(Math.atan2(earthRelative.z, earthRelative.x) * (180 / Math.PI));
    const observerDirection = latLonToVector(1, this.observer.latitude, this.observer.longitude, this.scratch.observer).applyAxisAngle(UP, earthAngle);
    const distanceKm = angularDistanceKm(satelliteDirection, observerDirection);
    const inside = distanceKm <= this.settings.detectionRadiusKm;
    const pass = this.predictPass(orbitAngle, earthAngle, period, inside);

    this.state.satellite.latitude = latitude;
    this.state.satellite.longitude = longitude;
    this.state.satellite.position = {
      x: Number(this.satelliteRoot.position.x.toFixed(3)),
      y: Number(this.satelliteRoot.position.y.toFixed(3)),
      z: Number(this.satelliteRoot.position.z.toFixed(3))
    };
    this.state.satellite.simulatedPeriodSeconds = period;
    this.state.observer = {
      ...this.observer,
      detectionRadiusKm: this.settings.detectionRadiusKm,
      distanceToSatelliteKm: distanceKm
    };
    this.state.pass = pass;
    const passColor = inside ? new Color("#fff06b") : new Color("#76f8ff");
    const glowMaterial = this.satelliteGlow.material;
    if (glowMaterial instanceof MeshBasicMaterial) {
      glowMaterial.color.copy(passColor);
    }
  }

  private predictPass(orbitAngle: number, earthAngle: number, period: number, currentlyInside: boolean): OrbitalObservatoryState["pass"] {
    const stepSeconds = 1;
    const maximumSeconds = Math.ceil(period * 9);
    let entryInSeconds: number | null = currentlyInside ? 0 : null;
    let exitInSeconds: number | null = null;
    let previousInside = currentlyInside;
    for (let seconds = stepSeconds; seconds <= maximumSeconds; seconds += stepSeconds) {
      const angle = orbitAngle + (seconds / period) * Math.PI * 2;
      const futureEarthAngle = earthAngle + seconds * (Math.PI * 2 / 120) * this.settings.earthSpin;
      const satellite = this.orbitPosition(angle, this.scratch.next).normalize();
      const observer = latLonToVector(1, this.observer.latitude, this.observer.longitude, this.scratch.normal).applyAxisAngle(UP, futureEarthAngle);
      const futureInside = angularDistanceKm(satellite, observer) <= this.settings.detectionRadiusKm;
      if (!previousInside && futureInside && entryInSeconds === null) {
        entryInSeconds = seconds;
      }
      if (previousInside && !futureInside && entryInSeconds !== null) {
        exitInSeconds = seconds;
        break;
      }
      previousInside = futureInside;
    }
    return { insideDetectionRadius: currentlyInside, entryInSeconds, exitInSeconds };
  }

  private createTrajectory(): Line {
    const points: number[] = [];
    for (let index = 0; index <= 256; index += 1) {
      const position = this.orbitPosition((index / 256) * Math.PI * 2, new Vector3());
      points.push(position.x, position.y, position.z);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(points, 3));
    const line = new Line(
      geometry,
      new LineBasicMaterial({ color: new Color("#67eaff"), transparent: true, opacity: 0.72, depthWrite: false })
    );
    line.name = "ISSOrbitLine";
    return line;
  }

  private createOrbitNodes(): InstancedMesh {
    const count = 48;
    const nodes = new InstancedMesh(
      new IcosahedronGeometry(0.035, 0),
      new MeshBasicMaterial({ color: new Color("#9ff7ff"), transparent: true, opacity: 0.86 }),
      count
    );
    for (let index = 0; index < count; index += 1) {
      this.dummy.position.copy(this.orbitPosition((index / count) * Math.PI * 2, new Vector3()));
      this.dummy.scale.setScalar(index % 6 === 0 ? 1.8 : 1);
      this.dummy.updateMatrix();
      nodes.setMatrixAt(index, this.dummy.matrix);
    }
    nodes.name = "TrajectorySamples";
    return nodes;
  }

  private createQuakeMarkers(events: readonly QuakeEvent[]): InstancedMesh {
    const mesh = new InstancedMesh(
      new ConeGeometry(0.045, 0.34, 7),
      new MeshStandardMaterial({ color: new Color("#ffffff"), emissive: new Color("#8b1f08"), emissiveIntensity: 0.35, roughness: 0.48 }),
      events.length
    );
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    events.forEach((event, index) => {
      const normalized = Math.max(0, Math.min(1, (event.magnitude - 4.8) / 2.4));
      mesh.setColorAt(index, new Color().setHSL(0.14 - normalized * 0.13, 0.94, 0.56));
    });
    mesh.name = "EarthquakeTelemetry";
    this.updateQuakeInstances(events, mesh);
    return mesh;
  }

  private updateQuakeInstances(events: readonly QuakeEvent[] = quakeCatalog.events, mesh: InstancedMesh = this.quakes): void {
    if (!mesh) {
      return;
    }
    events.forEach((event, index) => {
      const normalized = Math.max(0, Math.min(1, (event.magnitude - 4.8) / 2.4));
      const height = (0.16 + normalized * 0.48) * this.settings.quakeScale;
      const normal = latLonToVector(1, event.latitude, event.longitude, this.scratch.normal).normalize();
      this.dummy.position.copy(normal).multiplyScalar(EARTH_RADIUS + height * 0.5);
      this.dummy.quaternion.setFromUnitVectors(UP, normal);
      this.dummy.scale.set(0.7 + normalized * 0.65, Math.max(0.01, height / 0.34), 0.7 + normalized * 0.65);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(index, this.dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }

  private addReferenceGrid(): void {
    const material = new MeshBasicMaterial({ color: new Color("#6ed9ff"), transparent: true, opacity: 0.11, depthWrite: false });
    [-60, -30, 0, 30, 60].forEach((latitude) => {
      const latitudeRadians = (latitude * Math.PI) / 180;
      const ring = new Mesh(
        new TorusGeometry(Math.cos(latitudeRadians) * EARTH_RADIUS * 1.008, 0.008, 4, 128),
        material.clone()
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = Math.sin(latitudeRadians) * EARTH_RADIUS * 1.008;
      this.globe.add(ring);
    });
    for (let index = 0; index < 6; index += 1) {
      const meridian = new Mesh(new TorusGeometry(EARTH_RADIUS * 1.008, 0.008, 4, 128), material.clone());
      meridian.rotation.y = (index / 6) * Math.PI;
      this.globe.add(meridian);
    }
    material.dispose();
  }

  private positionObserver(): void {
    const normal = latLonToVector(1, this.observer.latitude, this.observer.longitude, this.scratch.normal).normalize();
    this.observerRoot.position.copy(normal).multiplyScalar(EARTH_RADIUS * 1.024);
    this.observerRoot.quaternion.setFromUnitVectors(FORWARD, normal);
    const angularRadius = this.settings.detectionRadiusKm / EARTH_RADIUS_KM;
    const projectedRadius = Math.max(0.18, Math.sin(angularRadius) * EARTH_RADIUS);
    this.observerRange.scale.setScalar(projectedRadius / 0.92);
  }

  private applyLayerVisibility(): void {
    this.clouds.visible = this.layers.clouds;
    this.trajectoryRoot.visible = this.layers.trajectory;
    this.quakes.visible = this.layers.quakes;
    this.observerRoot.visible = this.layers.observer;
  }
}

function latLonToVector(radius: number, latitude: number, longitude: number, target: Vector3): Vector3 {
  const latitudeRadians = (latitude * Math.PI) / 180;
  const longitudeRadians = (longitude * Math.PI) / 180;
  return target.set(
    Math.cos(latitudeRadians) * Math.cos(longitudeRadians) * radius,
    Math.sin(latitudeRadians) * radius,
    Math.cos(latitudeRadians) * Math.sin(longitudeRadians) * radius
  );
}

function angularDistanceKm(left: Vector3, right: Vector3): number {
  const dot = Math.max(-1, Math.min(1, left.dot(right)));
  return Math.acos(dot) * EARTH_RADIUS_KM;
}

function normalizeLongitude(longitude: number): number {
  return ((longitude + 540) % 360) - 180;
}
