#!/usr/bin/env node

/**
 * Deterministic Rapier material-parity probe.
 *
 * GraphysX combines Cannon material pairs with a geometric mean. Rapier's
 * Multiply rule can preserve that contract by storing the square root of each
 * authored coefficient on every collider:
 *
 *   sqrt(a) * sqrt(b) = sqrt(a * b)
 *
 * This probe guards that mapping for all six public presets, then recreates the
 * two regression columns from smoke-physics: ball x ground must make a dead
 * thud while ball x ball must rebound. It is intentionally a standalone Node
 * probe so the Rapier backend can be checked before it becomes browser-active.
 *
 * Usage: node scripts/probe-rapier-material-parity.mjs
 */

import RAPIER from "@dimforge/rapier3d-compat";

const TIMESTEP = 1 / 60;
const DROP_STEPS = 240;
const SETTLE_STEPS = 600;
const SPHERE_RADIUS = 0.5;
const PLATFORM_TOP = 1;
const SURFACE_Y = PLATFORM_TOP + SPHERE_RADIUS;
const START_Y = 6;
const DROP_HEIGHT = START_Y - SURFACE_Y;
const EPSILON = 1e-9;

const MATERIALS = Object.freeze({
  default: Object.freeze({ friction: 0.18, restitution: 0.28 }),
  wall: Object.freeze({ friction: 0.32, restitution: 0.08 }),
  finish: Object.freeze({ friction: 0.16, restitution: 0.2 }),
  ground: Object.freeze({ friction: 0.45, restitution: 0.05 }),
  ball: Object.freeze({ friction: 0.12, restitution: 0.68 }),
  human: Object.freeze({ friction: 0.5, restitution: 0.02 }),
});

const failures = [];

function check(name, condition, detail) {
  const pass = Boolean(condition);
  if (!pass) failures.push(`${name}${detail === undefined ? "" : ` -- ${JSON.stringify(detail)}`}`);
  console.log(`${pass ? "  ok  " : "  FAIL"} ${name}${detail === undefined ? "" : ` ${JSON.stringify(detail)}`}`);
  return pass;
}

function round(value, digits = 9) {
  return Number(value.toFixed(digits));
}

function mappedMaterial(name) {
  const material = MATERIALS[name];
  if (!material) throw new Error(`Unknown GraphysX material preset: ${name}`);
  return {
    friction: Math.sqrt(material.friction),
    restitution: Math.sqrt(material.restitution),
  };
}

function effectivePair(leftName, rightName) {
  const left = mappedMaterial(leftName);
  const right = mappedMaterial(rightName);
  return {
    friction: left.friction * right.friction,
    restitution: left.restitution * right.restitution,
  };
}

function colliderMaterial(desc, name) {
  const mapped = mappedMaterial(name);
  return desc
    .setFriction(mapped.friction)
    .setRestitution(mapped.restitution)
    .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Multiply)
    .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Multiply);
}

function createWorld() {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = TIMESTEP;
  return world;
}

function createPlatform(world, materialName) {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, PLATFORM_TOP - 0.5, 0),
  );
  world.createCollider(
    colliderMaterial(RAPIER.ColliderDesc.cuboid(5, 0.5, 5), materialName),
    body,
  );
  return body;
}

function createSphere(world, materialName, y = START_Y) {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, y, 0)
      .setLinearDamping(0.01)
      .setAngularDamping(0.01),
  );
  world.createCollider(
    colliderMaterial(RAPIER.ColliderDesc.ball(SPHERE_RADIUS), materialName).setMass(1),
    body,
  );
  return body;
}

function finiteBodyState(body) {
  const position = body.translation();
  const rotation = body.rotation();
  const linear = body.linvel();
  const angular = body.angvel();
  return [
    position.x, position.y, position.z,
    rotation.x, rotation.y, rotation.z, rotation.w,
    linear.x, linear.y, linear.z,
    angular.x, angular.y, angular.z,
  ].every(Number.isFinite);
}

function runDrop(dynamicMaterial, platformMaterial) {
  const world = createWorld();
  const samples = [];
  let finite = true;

  try {
    createPlatform(world, platformMaterial);
    const sphere = createSphere(world, dynamicMaterial);

    for (let step = 0; step < DROP_STEPS; step += 1) {
      world.step();
      finite &&= finiteBodyState(sphere);
      samples.push(sphere.translation().y);
    }

    const contactIndex = samples.findIndex((y) => y <= SURFACE_Y + 0.1);
    const afterContact = contactIndex >= 0 ? samples.slice(contactIndex) : [];
    const apexY = afterContact.length ? Math.max(...afterContact) : Number.NaN;
    const minY = Math.min(...samples);
    const reboundRatio = Number.isFinite(apexY) ? (apexY - SURFACE_Y) / DROP_HEIGHT : Number.NaN;

    return {
      dynamicMaterial,
      platformMaterial,
      finite,
      contact: contactIndex >= 0,
      contactStep: contactIndex >= 0 ? contactIndex + 1 : null,
      minY,
      apexY,
      reboundRatio,
      finalY: sphere.translation().y,
      finalSpeed: Math.hypot(sphere.linvel().x, sphere.linvel().y, sphere.linvel().z),
    };
  } finally {
    world.free();
  }
}

function runSleepWakeImpulse() {
  const world = createWorld();

  try {
    createPlatform(world, "ground");
    const sphere = createSphere(world, "ground", SURFACE_Y + 0.02);
    let finite = true;

    for (let step = 0; step < SETTLE_STEPS; step += 1) {
      world.step();
      finite &&= finiteBodyState(sphere);
    }

    const settledY = sphere.translation().y;
    const sleepingBefore = sphere.isSleeping();
    sphere.applyImpulse({ x: 0, y: 2, z: 0 }, true);
    const sleepingAfterImpulse = sphere.isSleeping();
    const velocityAfterImpulse = sphere.linvel().y;
    world.step();
    finite &&= finiteBodyState(sphere);

    return {
      finite,
      settledY,
      sleepingBefore,
      sleepingAfterImpulse,
      velocityAfterImpulse,
      yAfterStep: sphere.translation().y,
      velocityAfterStep: sphere.linvel().y,
    };
  } finally {
    world.free();
  }
}

function runTeardownRecreate() {
  const first = runDrop("ball", "ground");
  const second = runDrop("ball", "ground");
  const fields = ["minY", "apexY", "reboundRatio", "finalY", "finalSpeed"];
  const maximumDelta = Math.max(...fields.map((field) => Math.abs(first[field] - second[field])));
  return { first, second, maximumDelta };
}

function printableDrop(result) {
  return {
    pair: `${result.dynamicMaterial} x ${result.platformMaterial}`,
    effectiveFriction: round(effectivePair(result.dynamicMaterial, result.platformMaterial).friction, 6),
    effectiveRestitution: round(effectivePair(result.dynamicMaterial, result.platformMaterial).restitution, 6),
    contactStep: result.contactStep,
    minY: round(result.minY, 6),
    apexY: round(result.apexY, 6),
    reboundRatio: round(result.reboundRatio, 6),
    finalY: round(result.finalY, 6),
    finalSpeed: round(result.finalSpeed, 6),
  };
}

async function main() {
  await RAPIER.init();
  console.log(`Rapier ${RAPIER.version()} GraphysX material-parity probe`);
  console.log(`dt=${TIMESTEP} dropSteps=${DROP_STEPS} settleSteps=${SETTLE_STEPS}`);

  console.log("\n# six public presets: sqrt collider coefficients and self-pair result");
  const selfDrops = {};
  for (const name of Object.keys(MATERIALS)) selfDrops[name] = runDrop(name, name);
  console.table(Object.fromEntries(Object.entries(MATERIALS).map(([name, preset]) => {
    const mapped = mappedMaterial(name);
    return [name, {
      authoredFriction: preset.friction,
      colliderFriction: round(mapped.friction, 6),
      effectiveFriction: round(effectivePair(name, name).friction, 6),
      authoredRestitution: preset.restitution,
      colliderRestitution: round(mapped.restitution, 6),
      effectiveRestitution: round(effectivePair(name, name).restitution, 6),
      reboundRatio: round(selfDrops[name].reboundRatio, 6),
    }];
  })));

  for (const [leftName, left] of Object.entries(MATERIALS)) {
    for (const [rightName, right] of Object.entries(MATERIALS)) {
      const pair = effectivePair(leftName, rightName);
      check(
        `${leftName} x ${rightName} Multiply mapping preserves geometric means`,
        Math.abs(pair.friction - Math.sqrt(left.friction * right.friction)) <= EPSILON
          && Math.abs(pair.restitution - Math.sqrt(left.restitution * right.restitution)) <= EPSILON,
        pair,
      );
    }
  }

  for (const [name, result] of Object.entries(selfDrops)) {
    check(`${name} self-pair remained finite`, result.finite, printableDrop(result));
    check(`${name} self-pair made contact`, result.contact, printableDrop(result));
    check(`${name} self-pair did not tunnel`, result.minY >= SURFACE_Y - 0.35, printableDrop(result));
  }

  console.log("\n# smoke-physics restitution columns");
  const deadColumn = runDrop("ball", "ground");
  const bouncyColumn = runDrop("ball", "ball");
  console.table({ deadColumn: printableDrop(deadColumn), bouncyColumn: printableDrop(bouncyColumn) });
  check("both smoke columns remained finite", deadColumn.finite && bouncyColumn.finite);
  check("both smoke columns made contact", deadColumn.contact && bouncyColumn.contact);
  check(
    "both smoke columns avoided tunnelling",
    deadColumn.minY >= SURFACE_Y - 0.35 && bouncyColumn.minY >= SURFACE_Y - 0.35,
    { deadMinY: deadColumn.minY, bouncyMinY: bouncyColumn.minY },
  );
  check(
    "ball x ground rebound stayed <= 12% of drop height",
    deadColumn.reboundRatio <= 0.12,
    printableDrop(deadColumn),
  );
  check(
    "ball x ball rebound reached >= 25% of drop height",
    bouncyColumn.reboundRatio >= 0.25,
    printableDrop(bouncyColumn),
  );
  check(
    "ball x ball cleared ball x ground rebound by more than 2x",
    bouncyColumn.reboundRatio > deadColumn.reboundRatio * 2,
    { deadRatio: deadColumn.reboundRatio, bouncyRatio: bouncyColumn.reboundRatio },
  );

  console.log("\n# sleep, wake, and impulse");
  const sleepWake = runSleepWakeImpulse();
  console.table({ sleepWake: Object.fromEntries(Object.entries(sleepWake).map(([key, value]) => [key, typeof value === "number" ? round(value) : value])) });
  check("resting body remained finite", sleepWake.finite, sleepWake);
  check("resting body entered sleep", sleepWake.sleepingBefore, sleepWake);
  check("wake-up impulse woke the body", !sleepWake.sleepingAfterImpulse, sleepWake);
  check("wake-up impulse produced upward velocity", sleepWake.velocityAfterImpulse > 0, sleepWake);
  check("woken body moved on the next step", sleepWake.yAfterStep > sleepWake.settledY + 0.01, sleepWake);

  console.log("\n# teardown and recreate determinism");
  const recreate = runTeardownRecreate();
  console.table({ first: printableDrop(recreate.first), second: printableDrop(recreate.second) });
  check("fresh worlds reproduced the same ball x ground outcome", recreate.maximumDelta <= EPSILON, {
    maximumDelta: recreate.maximumDelta,
  });

  if (failures.length) {
    console.error(`\n${failures.length} failure(s):`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log(`\nPASS: all ${Object.keys(MATERIALS).length} presets preserve GraphysX geometric-mean material behavior.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
