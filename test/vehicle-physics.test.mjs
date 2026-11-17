import assert from "node:assert/strict";
import { test } from "node:test";
import { importBrowserModule } from "./support/import-browser-module.mjs";
import { validateVehicleDefinition } from "../server/vehicle-definition.mjs";

const { RapierPhysicsEngine } = await importBrowserModule(new URL("../src/physics/rapier-physics-engine.ts", import.meta.url));
const carDefinition = () => ({ radius: .372, suspensionRestLength: .25, suspensionStiffness: 30, suspensionCompression: 4.4, suspensionRelaxation: 2.3, maxSuspensionTravel: .3, maxSuspensionForce: 9000, frictionSlip: 1.2, engineForce: 3000, brakeForce: 2000, maxSteerDegrees: 45, steerRateDegrees: 600, maxSpeed: 24,
  wheels: [-1, 1].flatMap(x => [-1.25, 1.425].map(z => ({ entityId: `wheel-${x + 1}-${z < 0 ? "front" : "rear"}`, connection: [x * .8, -.5, z], steer: z < 0, driven: z > 0, brake: z > 0 }))) });
const pose = (x, y, z) => ({ position: { x, y, z }, rotation: { x: 0, y: 0, z: 0, w: 1 } });
function fixture() {
  const engine = new RapierPhysicsEngine();
  const ground = engine.createBody({ mode: "static", transform: pose(0, -.2, 0), shapes: [{ kind: "box", halfExtents: { x: 500, y: .2, z: 500 } }] });
  const car = engine.createBody({ mode: "dynamic", mass: 1500, transform: pose(0, 1.2, 0), shapes: [{ kind: "box", halfExtents: { x: .9, y: .35, z: 2.2 } }], linearDamping: .04, angularDamping: .3 });
  engine.configureVehicle(car, carDefinition());
  const advance = frames => { for (let i = 0; i < frames; i++) engine.step(1 / 60); };
  const transform = () => { const out = pose(0, 0, 0); engine.readTransform(car, out); return out; };
  advance(180);
  return { engine, ground, car, advance, transform };
}
test("raycast wheels support the chassis and rear-wheel drive moves forward -Z, turns right and brakes", () => {
  const { engine, car, advance, transform } = fixture();
  try {
    const resting = transform();
    assert.ok(resting.position.y > .7 && resting.position.y < 1.2, JSON.stringify(resting));
    assert.equal(engine.readVehicle(car).wheels.filter(w => w.contact).length, 4);
    engine.driveVehicle(car, { thrust: 1, turn: 0, brake: 0 }); advance(180);
    const forward = transform();
    assert.ok(forward.position.z < -10, JSON.stringify(forward));
    assert.ok(engine.readVehicle(car).speed > 5);
    engine.driveVehicle(car, { thrust: .4, turn: .25, brake: 0 }); advance(60);
    assert.ok(transform().position.x > forward.position.x + .2, "Positive turn must go right, not left");
    const speed = Math.abs(engine.readVehicle(car).speed);
    engine.driveVehicle(car, { thrust: 0, turn: 0, brake: 1 }); advance(120);
    assert.ok(Math.abs(engine.readVehicle(car).speed) < speed * .5, JSON.stringify({ beforeBrake: speed, afterBrake: engine.readVehicle(car), pose: transform() }));
    assert.equal(engine.readVehicle(car).steering, 0, "Source steering snaps back on release");
  } finally { engine.dispose(); }
});
test("mid-drive solver restore preserves chassis trajectory, steering, inputs and wheel phases", () => {
  const { engine, car, ground, advance, transform } = fixture();
  try {
    engine.driveVehicle(car, { thrust: .8, turn: .13, brake: 0 }); advance(60);
    const state = engine.saveState(), bindings = [car, ground].map(body => [body, engine.stateId(body)]);
    advance(90); const expected = { pose: transform(), vehicle: engine.readVehicle(car) };
    engine.restoreState(state, bindings); advance(90);
    assert.deepEqual({ pose: transform(), vehicle: engine.readVehicle(car) }, expected);
    const before = transform();
    const invalid = structuredClone(state); invalid.vehicles[0].definition.radius = NaN;
    assert.throws(() => engine.restoreState(invalid, bindings)); assert.deepEqual(transform(), before);
  } finally { engine.dispose(); }
});
test("vehicle lifetimes follow chassis bodies and invalid input/configuration stays atomic", () => {
  const { engine, car, ground, advance } = fixture();
  try {
    const before = engine.readVehicle(car), invalid = carDefinition(); invalid.wheels[1].entityId = invalid.wheels[0].entityId;
    assert.throws(() => engine.configureVehicle(car, invalid)); assert.deepEqual(engine.readVehicle(car), before);
    assert.throws(() => engine.driveVehicle(car, { thrust: 1, turn: NaN, brake: 0 })); assert.deepEqual(engine.readVehicle(car), before);
    assert.throws(() => engine.configureVehicle(ground, carDefinition()));
    engine.configureVehicle(car, null); assert.equal(engine.readVehicle(car), null);
    engine.configureVehicle(car, carDefinition()); engine.removeBody(car); advance(10);
    assert.throws(() => engine.readVehicle(car)); assert.equal(engine.saveState().vehicles, undefined);
  } finally { engine.dispose(); }
});
test("vehicle schema rejects unknown fields, unbounded forces and incomplete attachments", () => {
  for (const edit of [v => v.bogus = true, v => v.engineForce = Infinity, v => v.radius = 0, v => v.wheels[0].connection = [0, 0, NaN], v => delete v.wheels[0].driven]) {
    const value = carDefinition(); edit(value); assert.throws(() => validateVehicleDefinition(value));
  }
});

test("host-owned kinematic suspension survives save/restore and resumes driving", () => {
  const { engine, car, ground, advance, transform } = fixture();
  try {
    engine.setBodyMotion(car, "kinematic");
    const saved = engine.saveState(), bindings = [car, ground].map(body => [body, engine.stateId(body)]);
    engine.restoreState(saved, bindings); advance(20);
    const before = transform();
    engine.setBodyMotion(car, "dynamic"); engine.driveVehicle(car, { thrust: 1, turn: 0, brake: 0 }); advance(120);
    assert.ok(transform().position.z < before.position.z - 3);
  } finally { engine.dispose(); }
});

test("optional steering aid retains the parked limit and reduces it at speed", () => {
  const { engine, car, advance } = fixture();
  try {
    const config = carDefinition(); config.steeringSpeedFactor = .035; engine.configureVehicle(car, config);
    engine.driveVehicle(car, { thrust: 0, turn: 1, brake: 0 }); advance(10);
    assert.ok(Math.abs(engine.readVehicle(car).steering) > .78);
    engine.driveVehicle(car, { thrust: 1, turn: 0, brake: 0 }); advance(180);
    engine.driveVehicle(car, { thrust: 0, turn: 1, brake: 0 }); advance(10);
    assert.ok(Math.abs(engine.readVehicle(car).steering) < .3);
  } finally { engine.dispose(); }
});
