import {
  Group,
  Mesh,
  MeshPhongMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3
} from "three";

export type MilkyWayProfile = "ballz2015" | "graphysx2017";

export const MILKY_WAY_EVIDENCE = {
  classification: "implemented-planetary-vignette-not-starfield" as const,
  sources: {
    ballz2015: [
      "Archive/bckup/VoieLactee.cpp",
      "Archive/bckup/VoieLactee.h",
      "Archive/bckup/BallZ2015.bckup/VoieLactee.cpp",
      "Archive/bckup/BallZ2015.bckup/3DScenes.cpp"
    ],
    graphysx2017: [
      "GraphysX_1/Scene.cpp::CLScene::CreateVoieLactee",
      "Scene3D/GamePlayScreen.cpp",
      "Scene3D/EditorScreen.cpp"
    ]
  },
  exactFacts: {
    objects: ["Earth", "EarthClouds", "Moon", "Mars", "Venus"],
    containsGeneratedStars: false,
    ballz2015: {
      earth: { position: [-10, 15, 0], radius: 6 },
      clouds: { position: [-10, 15, 0], radius: 6.1 },
      moon: { position: [-8, 14, -10], radius: 2 },
      mars: { position: [-25, 15, 0], radius: 12 },
      venus: { position: [-35, 15, 0], radius: 4 },
      earthRotationPerUpdateDegrees: 0.02,
      cloudRotationPerUpdateDegrees: 0.06,
      moonOrbitDegreesPerElapsedMillisecond: -0.003,
      moonOrbitRadius: 8,
      earthNightTextureLoadedButUnused: true,
      venusPointerAssignedToMarsMemberBug: true
    },
    graphysx2017: {
      earth: { position: [-10, 15, 10], radius: 6, zTiltDegrees: 23 },
      clouds: { position: [-10, 15, 10], radius: 6.1 },
      moon: { position: [-8, 14, 12], radius: 2 },
      mars: { position: [-40, 15, 10], radius: 12 },
      venus: { position: [-70, 15, 10], radius: 4 },
      updateRoutinePresent: false
    }
  },
  assetEvidence: {
    graphysx2017AllExact: true,
    ballz2015MissingExactCloudAlphaMap: "media/Galaxy/EarthCloudsMapHigh.png",
    ballz2015EarthCandidateOnly: "Yanik C++ BCKUP/Media/textures n else/Earth.jpg"
  },
  renderingUnknowns: [
    "TV3D cTV_BLEND_COLOR has no exact Three.js-equivalent binding in the archive.",
    "The older RotateAround helper's phase and smoothing semantics are engine-specific.",
    "No Voie Lactée-specific camera, sky, lighting rig, or standalone menu is defined."
  ]
} as const;

interface PlanetDefinition {
  id: "earth" | "clouds" | "moon" | "mars" | "venus";
  name: string;
  radius: number;
  position: readonly [number, number, number];
  textureUrl: string;
}

const exact2017Definitions: PlanetDefinition[] = [
  {
    id: "earth",
    name: "earth",
    radius: 6,
    position: [-10, 15, 10],
    textureUrl: "/assets/archives/milky-way/earthgood.jpg"
  },
  {
    id: "clouds",
    name: "clouds",
    radius: 6.1,
    position: [-10, 15, 10],
    textureUrl: "/assets/archives/milky-way/earth-clouds.jpg"
  },
  {
    id: "moon",
    name: "Moon",
    radius: 2,
    position: [-8, 14, 12],
    textureUrl: "/assets/archives/milky-way/moon.jpg"
  },
  {
    id: "mars",
    name: "Mars",
    radius: 12,
    position: [-40, 15, 10],
    textureUrl: "/assets/archives/milky-way/mars.jpg"
  },
  {
    id: "venus",
    name: "Venus",
    radius: 4,
    position: [-70, 15, 10],
    textureUrl: "/assets/archives/milky-way/venus.jpg"
  }
];

const legacy2015Definitions: PlanetDefinition[] = exact2017Definitions.map((definition) => {
  const positions: Record<PlanetDefinition["id"], readonly [number, number, number]> = {
    earth: [-10, 15, 0],
    clouds: [-10, 15, 0],
    moon: [-8, 14, -10],
    mars: [-25, 15, 0],
    venus: [-35, 15, 0]
  };
  return { ...definition, position: positions[definition.id] };
});

export interface MilkyWayState {
  kind: "voie-lactee-planetary-vignette";
  profile: MilkyWayProfile;
  loadStatus: "loading" | "ready" | "error";
  exactAssetBinding: boolean;
  elapsedSeconds: number;
  earthRotationDegrees: number;
  cloudRotationDegrees: number;
  moonOrbitDegrees: number;
  planets: Array<{
    id: PlanetDefinition["id"];
    radius: number;
    position: [number, number, number];
  }>;
  generatedStars: 0;
}

function tuple(position: Vector3): [number, number, number] {
  return [
    Number(position.x.toFixed(4)),
    Number(position.y.toFixed(4)),
    Number(position.z.toFixed(4))
  ];
}

export class MilkyWayEnvironment {
  readonly group = new Group();
  readonly meshes = new Map<PlanetDefinition["id"], Mesh<SphereGeometry, MeshPhongMaterial>>();
  readonly ready: Promise<void>;

  private readonly profile: MilkyWayProfile;
  private readonly ownedTextures: Texture[] = [];
  private loadStatus: MilkyWayState["loadStatus"] = "loading";
  private elapsedSeconds = 0;
  private moonOrbitDegrees = 0;

  constructor(options: { profile?: MilkyWayProfile } = {}) {
    this.profile = options.profile ?? "graphysx2017";
    this.group.name = `VoieLactee.${this.profile}`;
    this.group.userData.evidence = MILKY_WAY_EVIDENCE;

    const definitions = this.profile === "graphysx2017" ? exact2017Definitions : legacy2015Definitions;
    const loader = new TextureLoader();
    const loads = definitions.map(async (definition) => {
      const material = new MeshPhongMaterial({ color: 0xffffff });
      if (definition.id === "clouds") {
        material.transparent = true;
        material.opacity = 0.72;
        material.depthWrite = false;
      }
      const mesh = new Mesh(new SphereGeometry(definition.radius, 48, 32), material);
      mesh.name = definition.name;
      mesh.position.set(...definition.position);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.archiveRadius = definition.radius;
      this.meshes.set(definition.id, mesh);
      this.group.add(mesh);

      const texture = await loader.loadAsync(definition.textureUrl);
      texture.colorSpace = SRGBColorSpace;
      material.map = texture;
      material.needsUpdate = true;
      this.ownedTextures.push(texture);
    });

    if (this.profile === "graphysx2017") {
      const earth = this.meshes.get("earth");
      if (earth) earth.rotation.z = (23 * Math.PI) / 180;
    }

    this.ready = Promise.all(loads)
      .then(() => {
        this.loadStatus = "ready";
      })
      .catch((error: unknown) => {
        this.loadStatus = "error";
        throw error;
      });
  }

  update(deltaSeconds: number): void {
    const delta = Math.max(0, Math.min(1, deltaSeconds));
    this.elapsedSeconds += delta;
    if (this.profile !== "ballz2015") return;

    const earth = this.meshes.get("earth");
    const clouds = this.meshes.get("clouds");
    const moon = this.meshes.get("moon");
    if (!earth || !clouds || !moon) return;

    earth.rotation.y += ((0.02 * 60 * delta) * Math.PI) / 180;
    clouds.rotation.y += ((0.06 * 60 * delta) * Math.PI) / 180;
    this.moonOrbitDegrees += -0.003 * delta * 1000;
    const orbitRadians = (this.moonOrbitDegrees * Math.PI) / 180;
    moon.position.set(
      earth.position.x + Math.cos(orbitRadians) * 8,
      14,
      earth.position.z + Math.sin(orbitRadians) * 8
    );
  }

  reset(): void {
    this.elapsedSeconds = 0;
    this.moonOrbitDegrees = 0;
    const definitions = this.profile === "graphysx2017" ? exact2017Definitions : legacy2015Definitions;
    for (const definition of definitions) {
      const mesh = this.meshes.get(definition.id);
      if (!mesh) continue;
      mesh.position.set(...definition.position);
      mesh.rotation.set(0, 0, 0);
    }
    if (this.profile === "graphysx2017") {
      const earth = this.meshes.get("earth");
      if (earth) earth.rotation.z = (23 * Math.PI) / 180;
    }
  }

  getState(): MilkyWayState {
    const definitions = this.profile === "graphysx2017" ? exact2017Definitions : legacy2015Definitions;
    const earth = this.meshes.get("earth");
    const clouds = this.meshes.get("clouds");
    return {
      kind: "voie-lactee-planetary-vignette",
      profile: this.profile,
      loadStatus: this.loadStatus,
      exactAssetBinding: this.profile === "graphysx2017",
      elapsedSeconds: Number(this.elapsedSeconds.toFixed(3)),
      earthRotationDegrees: Number((((earth?.rotation.y ?? 0) * 180) / Math.PI).toFixed(4)),
      cloudRotationDegrees: Number((((clouds?.rotation.y ?? 0) * 180) / Math.PI).toFixed(4)),
      moonOrbitDegrees: Number(this.moonOrbitDegrees.toFixed(4)),
      planets: definitions.map((definition) => ({
        id: definition.id,
        radius: definition.radius,
        position: tuple(this.meshes.get(definition.id)?.position ?? new Vector3(...definition.position))
      })),
      generatedStars: 0
    };
  }

  dispose(): void {
    for (const mesh of this.meshes.values()) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.ownedTextures.forEach((texture) => texture.dispose());
    this.meshes.clear();
    this.group.clear();
  }
}
