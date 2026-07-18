import {
  Body,
  Box,
  Constraint,
  ContactMaterial,
  Material,
  Plane,
  Quaternion,
  Sphere,
  Trimesh,
  Vec3,
  World
} from "cannon-es";
import { Mesh, Quaternion as ThreeQuaternion, Vector3 } from "three";

export class PhysicsWorld {
  readonly world: World;
  private readonly defaultMaterial = new Material("graphysx-default");

  constructor() {
    this.world = new World({
      gravity: new Vec3(0, -18, 0)
    });
    this.world.allowSleep = true;

    this.world.defaultContactMaterial = new ContactMaterial(
      this.defaultMaterial,
      this.defaultMaterial,
      {
        friction: 0.18,
        restitution: 0.28
      }
    );
  }

  addGround(): Body {
    const ground = new Body({
      mass: 0,
      material: this.defaultMaterial,
      shape: new Plane()
    });
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(ground);
    return ground;
  }

  addStaticBox(position: Vector3, halfExtents: Vector3): Body {
    const body = new Body({
      mass: 0,
      material: this.defaultMaterial,
      position: toCannonVec3(position),
      shape: new Box(toCannonVec3(halfExtents))
    });
    this.world.addBody(body);
    return body;
  }

  addKinematicBox(position: Vector3, halfExtents: Vector3): Body {
    const body = new Body({
      mass: 0,
      material: this.defaultMaterial,
      position: toCannonVec3(position),
      shape: new Box(toCannonVec3(halfExtents))
    });
    body.type = Body.KINEMATIC;
    body.collisionResponse = true;
    this.world.addBody(body);
    return body;
  }

  addStaticTrimesh(position: Vector3, vertices: number[], indices: number[]): Body {
    const body = new Body({
      mass: 0,
      material: this.defaultMaterial,
      position: toCannonVec3(position),
      shape: new Trimesh(vertices, indices)
    });
    this.world.addBody(body);
    return body;
  }

  addKinematicTrimesh(position: Vector3, vertices: number[], indices: number[]): Body {
    const body = new Body({
      mass: 0,
      material: this.defaultMaterial,
      position: toCannonVec3(position),
      shape: new Trimesh(vertices, indices)
    });
    body.type = Body.KINEMATIC;
    body.collisionResponse = true;
    this.world.addBody(body);
    return body;
  }

  removeBody(body: Body): void {
    this.world.removeBody(body);
  }

  addDynamicBox(position: Vector3, halfExtents: Vector3, mass: number): Body {
    const body = new Body({
      mass,
      material: this.defaultMaterial,
      position: toCannonVec3(position),
      shape: new Box(toCannonVec3(halfExtents)),
      linearDamping: 0.08,
      angularDamping: 0.08
    });
    this.world.addBody(body);
    return body;
  }

  addConstraint(constraint: Constraint): void {
    this.world.addConstraint(constraint);
  }

  removeConstraint(constraint: Constraint): void {
    this.world.removeConstraint(constraint);
  }

  addDynamicSphere(position: Vector3, radius: number, mass: number): Body {
    const body = new Body({
      mass,
      material: this.defaultMaterial,
      position: toCannonVec3(position),
      shape: new Sphere(radius),
      linearDamping: 0.58,
      angularDamping: 0.35
    });
    this.world.addBody(body);
    return body;
  }

  step(deltaSeconds: number): void {
    this.world.step(1 / 60, deltaSeconds, 4);
  }
}

export function syncBodyToMesh(body: Body, mesh: Mesh): void {
  mesh.position.copy(toThreeVector3(body.position));
  mesh.quaternion.copy(toThreeQuaternion(body.quaternion));
}

export function setBodyTransform(body: Body, position: Vector3): void {
  body.position.copy(toCannonVec3(position));
  body.velocity.set(0, 0, 0);
  body.angularVelocity.set(0, 0, 0);
  body.quaternion.set(0, 0, 0, 1);
}

function toCannonVec3(vector: Vector3): Vec3 {
  return new Vec3(vector.x, vector.y, vector.z);
}

function toThreeVector3(vector: Vec3): Vector3 {
  return new Vector3(vector.x, vector.y, vector.z);
}

function toThreeQuaternion(quaternion: Quaternion): ThreeQuaternion {
  return new ThreeQuaternion(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
}
