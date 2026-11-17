import type { DynamicRayCastVehicleController, RigidBody, World } from "@dimforge/rapier3d-compat";
import RAPIER from "./rapier-runtime";
import { validateVehicleDefinition } from "../../server/vehicle-definition.mjs";
import type { PhysicsBodyHandle, PhysicsVehicleDefinition, PhysicsVehicleInput, PhysicsVehicleReadout, PhysicsVehicleState } from "./physics-engine";

type Vehicle = { controller: DynamicRayCastVehicleController; definition: PhysicsVehicleDefinition; input: PhysicsVehicleInput; readout: PhysicsVehicleReadout };
const clone = <T>(value: T): T => structuredClone(value);
const vector = ([x, y, z]: number[]) => ({ x, y, z });

/** Controllers share the engine's fixed substep and body lifetime; there is no extra world/loop. */
export class RapierVehicleFleet {
  private readonly vehicles = new Map<PhysicsBodyHandle, Vehicle>();
  constructor(private readonly world: () => World, private readonly body: (handle: PhysicsBodyHandle) => RigidBody) {}

  configure(handle: PhysicsBodyHandle, definition: PhysicsVehicleDefinition | null, restoring = false): void {
    const body = this.body(handle);
    if (definition) {
      validateVehicleDefinition(definition);
      if (!body.isDynamic() && !(restoring && body.isKinematic())) throw new Error("Vehicles require a dynamic chassis");
    }
    this.remove(handle);
    if (!definition) return;
    const config = clone(definition), controller = this.world().createVehicleController(body);
    controller.indexUpAxis = 1;
    controller.setIndexForwardAxis = 2;
    for (const [index, wheel] of config.wheels.entries()) {
      controller.addWheel(vector(wheel.connection), { x: 0, y: -1, z: 0 }, { x: 1, y: 0, z: 0 }, config.suspensionRestLength, config.radius);
      controller.setWheelSuspensionStiffness(index, config.suspensionStiffness);
      controller.setWheelSuspensionCompression(index, config.suspensionCompression);
      controller.setWheelSuspensionRelaxation(index, config.suspensionRelaxation);
      controller.setWheelMaxSuspensionTravel(index, config.maxSuspensionTravel);
      controller.setWheelMaxSuspensionForce(index, config.maxSuspensionForce);
      controller.setWheelFrictionSlip(index, config.frictionSlip);
    }
    this.vehicles.set(handle, { controller, definition: config, input: { thrust: 0, turn: 0, brake: 0 }, readout: { speed: 0, steering: 0, wheels: config.wheels.map(() => ({ suspensionLength: config.suspensionRestLength, rotation: 0, contact: false })) } });
  }

  remove(handle: PhysicsBodyHandle): void {
    const record = this.vehicles.get(handle);
    if (!record) return;
    this.world().removeVehicleController(record.controller);
    this.vehicles.delete(handle);
  }

  drive(handle: PhysicsBodyHandle, input: PhysicsVehicleInput): void {
    const record = this.vehicles.get(handle);
    if (!record) throw new Error("Body has no vehicle controller");
    for (const key of ["thrust", "turn", "brake"] as const) if (!Number.isFinite(input[key])) throw new Error(`Vehicle ${key} must be finite`);
    record.input = { thrust: Math.max(-1, Math.min(1, input.thrust)), turn: Math.max(-1, Math.min(1, input.turn)), brake: Math.max(0, Math.min(1, input.brake)) };
    if (input.thrust || input.turn || input.brake) this.body(handle).wakeUp();
  }

  read(handle: PhysicsBodyHandle): PhysicsVehicleReadout | null {
    const record = this.vehicles.get(handle);
    return record ? clone(record.readout) : null;
  }

  step(dt: number): void {
    for (const [handle, { controller, definition: config, input, readout }] of this.vehicles) {
      const body = this.body(handle);
      if (!body.isDynamic()) continue;
      const target = -input.turn * config.maxSteerDegrees * Math.PI / 180 / (1 + (config.steeringSpeedFactor ?? 0) * readout.speed ** 2);
      const change = config.steerRateDegrees * Math.PI / 180 * dt;
      // The source menu releases the front steering immediately when the key is released.
      readout.steering = input.turn === 0 ? 0 : readout.steering + Math.max(-change, Math.min(change, target - readout.steering));
      const velocity = body.linvel(), rotation = body.rotation();
      const forward = { x: -2 * (rotation.x * rotation.z + rotation.w * rotation.y), y: -2 * (rotation.y * rotation.z - rotation.w * rotation.x), z: -(1 - 2 * (rotation.x ** 2 + rotation.y ** 2)) };
      readout.speed = velocity.x * forward.x + velocity.y * forward.y + velocity.z * forward.z;
      const thrust = readout.speed * Math.sign(input.thrust) >= config.maxSpeed ? 0 : input.thrust;
      for (const [index, wheel] of config.wheels.entries()) {
        controller.setWheelSteering(index, wheel.steer ? readout.steering : 0);
        controller.setWheelEngineForce(index, wheel.driven ? thrust * config.engineForce : 0);
        controller.setWheelBrake(index, wheel.brake ? input.brake * config.brakeForce : 0);
      }
      controller.updateVehicle(dt, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, collider => collider.parent()?.handle !== body.handle);
      for (const [index, wheel] of readout.wheels.entries()) {
        wheel.suspensionLength = controller.wheelSuspensionLength(index) ?? config.suspensionRestLength;
        wheel.contact = controller.wheelIsInContact(index);
        // Integrating our own phase makes a solver snapshot independent of opaque visual wheel caches.
        wheel.rotation += readout.speed * dt / config.radius;
      }
    }
  }

  save(): PhysicsVehicleState[] {
    return [...this.vehicles].map(([handle, record]) => ({ bodyId: this.body(handle).handle, definition: clone(record.definition), input: clone(record.input), readout: clone(record.readout) }));
  }

  restore(states: PhysicsVehicleState[], bindings: Map<PhysicsBodyHandle, number>): void {
    this.clear();
    for (const [handle, id] of bindings) {
      const state = states.find(record => record.bodyId === id);
      if (!state) continue;
      this.configure(handle, state.definition, true);
      const record = this.vehicles.get(handle)!;
      record.input = clone(state.input);
      record.readout = clone(state.readout);
    }
  }

  clear(): void { for (const handle of [...this.vehicles.keys()]) this.remove(handle); }
}
