import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Object3D, SphereGeometry, Vector3 } from "three";

/**
 * The default look of an `agent` entity without an `appearance`: a small robot made of blocks,
 * so it belongs in block worlds like the islands. Owner's pick on 2026-11-04 over the earlier
 * capsule-and-cone.
 *
 * Material roles, read by the runtime's material pass:
 * - plain meshes (head, body, arms) take the entity's `material`, so each agent keeps its colour;
 * - `graphysxAgentAccent` meshes (eyes, chest light, perception ring) glow in that colour;
 * - `graphysxMaterialLocked` meshes (visor, legs, antenna) keep their own fixed material.
 *
 * Forward is −Z, as for the cone of the old avatar. The origin is at the feet.
 */
export type AgentRobotSize = { height: number; radius: number; perceptionRadius?: number };

export class AgentRobotRig {
  readonly object = new Group();
  private readonly head = new Group();
  private readonly legs: Object3D[] = [];
  private readonly arms: Object3D[] = [];
  private readonly eyes: Mesh[] = [];
  private readonly antennaTip: Mesh;
  private readonly antennaRestY: number;
  private readonly lastPosition = new Vector3();
  private readonly scratch = new Vector3();
  private hasLastPosition = false;
  private time = 0;
  private stride = 0;
  private walk = 0;

  constructor(size: AgentRobotSize) {
    const h = Math.max(0.8, size.height);
    // Width follows height so a tall thin capsule still reads as a robot, not a pole.
    const u = Math.min(h * 0.5, Math.max(size.radius * 2, h * 0.35));
    const box = (w: number, height: number, d: number) => new BoxGeometry(w, height, d);
    const tinted = () => new MeshStandardMaterial();
    const locked = (color: string, roughness = 0.55, emissive = "#000000", emissiveIntensity = 0) => {
      const material = new MeshStandardMaterial({ color, roughness, metalness: 0.15, emissive, emissiveIntensity });
      return material;
    };
    const mesh = (geometry: BoxGeometry | SphereGeometry, material: MeshStandardMaterial, role: "tint" | "accent" | "locked") => {
      const part = new Mesh(geometry, material);
      if (role === "accent") part.userData.graphysxAgentAccent = true;
      if (role === "locked") part.userData.graphysxMaterialLocked = true;
      return part;
    };

    const legHeight = h * 0.24;
    for (const side of [-1, 1]) {
      const hip = new Group();
      hip.position.set(side * u * 0.2, legHeight, 0);
      const leg = mesh(box(u * 0.26, legHeight, u * 0.3), locked("#1d2b33"), "locked");
      leg.position.y = -legHeight / 2;
      hip.add(leg);
      hip.userData.graphysxRobotPart = "leg";
      this.legs.push(hip);
    }

    const bodyHeight = h * 0.32;
    const body = mesh(box(u * 0.86, bodyHeight, u * 0.6), tinted(), "tint");
    body.position.y = legHeight + bodyHeight / 2;
    body.userData.graphysxRobotPart = "body";
    const chest = mesh(box(u * 0.36, h * 0.045, u * 0.03), tinted(), "accent");
    chest.position.set(0, legHeight + bodyHeight * 0.6, -u * 0.31);
    chest.userData.graphysxRobotPart = "chest";

    const shoulderY = legHeight + bodyHeight * 0.92;
    const armLength = bodyHeight * 0.9;
    for (const side of [-1, 1]) {
      const shoulder = new Group();
      shoulder.position.set(side * u * 0.55, shoulderY, 0);
      const arm = mesh(box(u * 0.2, armLength, u * 0.24), tinted(), "tint");
      arm.position.y = -armLength / 2;
      shoulder.add(arm);
      shoulder.userData.graphysxRobotPart = "arm";
      this.arms.push(shoulder);
    }

    const headHeight = h * 0.36;
    this.head.position.y = legHeight + bodyHeight + headHeight / 2 + h * 0.01;
    this.head.userData.graphysxRobotPart = "head";
    const skull = mesh(box(u, headHeight, u * 0.82), tinted(), "tint");
    const visor = mesh(box(u * 0.78, headHeight * 0.5, u * 0.04), locked("#14202a", 0.2), "locked");
    visor.position.set(0, headHeight * 0.04, -u * 0.41);
    visor.userData.graphysxRobotPart = "visor";
    for (const side of [-1, 1]) {
      const eye = mesh(box(u * 0.15, headHeight * 0.2, u * 0.03), tinted(), "accent");
      eye.position.set(side * u * 0.17, headHeight * 0.06, -u * 0.44);
      eye.userData.graphysxRobotPart = "eye";
      this.eyes.push(eye);
    }
    const stalkHeight = h * 0.13;
    const stalk = mesh(box(u * 0.05, stalkHeight, u * 0.05), locked("#1d2b33"), "locked");
    stalk.position.y = headHeight / 2 + stalkHeight / 2;
    this.antennaTip = mesh(new SphereGeometry(u * 0.1, 16, 12), locked("#ffb347", 0.4, "#ff8a00", 0.6), "locked");
    this.antennaRestY = headHeight / 2 + stalkHeight + u * 0.06;
    this.antennaTip.position.y = this.antennaRestY;
    this.antennaTip.userData.graphysxRobotPart = "antenna";
    this.head.add(skull, visor, ...this.eyes, stalk, this.antennaTip);

    this.object.add(...this.legs, body, chest, ...this.arms, this.head);
    this.object.userData.graphysxAgentRobot = this;
  }

  /**
   * Idle life and walking. The rig reads how far its agent moved since the last update, so
   * legs swing whether the move came from physics, steering or a world-stream pose.
   */
  update(deltaSeconds: number): void {
    if (!(deltaSeconds > 0)) return;
    this.time += deltaSeconds;
    const anchor = this.object.parent ?? this.object;
    anchor.getWorldPosition(this.scratch);
    let speed = 0;
    if (this.hasLastPosition) {
      const dx = this.scratch.x - this.lastPosition.x;
      const dz = this.scratch.z - this.lastPosition.z;
      speed = Math.hypot(dx, dz) / deltaSeconds;
    }
    this.lastPosition.copy(this.scratch);
    this.hasLastPosition = true;
    // A teleport (reset, respawn) is not a sprint.
    if (speed > 40) speed = 0;

    const target = Math.min(1, speed / 1.5);
    this.walk += (target - this.walk) * Math.min(1, deltaSeconds * 8);
    this.stride += deltaSeconds * (2 + Math.min(speed, 6) * 2.2);
    const swing = Math.sin(this.stride) * 0.6 * this.walk;
    this.legs[0].rotation.x = swing;
    this.legs[1].rotation.x = -swing;
    this.arms[0].rotation.x = -swing * 0.8;
    this.arms[1].rotation.x = swing * 0.8;

    const idle = 1 - this.walk;
    this.head.rotation.y = Math.sin(this.time * 0.9) * 0.3 * idle;
    this.antennaTip.position.y = this.antennaRestY + Math.sin(this.time * 3.1) * 0.015 + Math.abs(swing) * 0.02;
    const blink = (this.time % 3.4) < 0.12 ? 0.15 : 1;
    for (const eye of this.eyes) eye.scale.y = blink;
  }
}

export function createAgentRobot(size: AgentRobotSize): Group {
  return new AgentRobotRig(size).object;
}

/** Reach the rig from the agent's scene object, the way `findVoxelFace` reaches a face. */
export function findAgentRobot(object: Object3D): AgentRobotRig | null {
  const visual = object.userData.graphysxAgentVisual;
  const rig = visual instanceof Object3D ? visual.userData.graphysxAgentRobot : undefined;
  return rig instanceof AgentRobotRig ? rig : null;
}
