#!/usr/bin/env node

/**
 * Deterministic Rapier heightfield seam probe.
 *
 * cannon-es can give a falling sphere a lateral kick when it lands close to a
 * heightfield cell edge. Rapier 0.19 exposes HeightFieldFlags.FIX_INTERNAL_EDGES
 * specifically to correct contact normals at those seams. This probe measures
 * both modes on the same flat 6x6-cell field and the same ordered drop matrix.
 *
 * Every sphere is simulated alone so sphere/sphere contacts cannot hide or
 * manufacture terrain drift. The matrix samples the two sides and exact centre
 * of every internal grid edge, plus both possible diagonals of every cell. The
 * flagged run is the gate; the unflagged run is reported as a control because a
 * Rapier release may improve its default heightfield narrowphase over time.
 *
 * Usage: node scripts/probe-rapier-heightfield.mjs
 */

import RAPIER from "@dimforge/rapier3d-compat";

const TIMESTEP = 1 / 60;
const STEPS = 600; // Ten simulated seconds: enough for every drop to sleep.
const CELLS = 6;
const FIELD_SIZE = 6;
const CELL_SIZE = FIELD_SIZE / CELLS;
const HALF_FIELD = FIELD_SIZE / 2;
const SPHERE_RADIUS = 0.34;
const DROP_HEIGHT = 6;
const SEAM_OFFSET = 0.02;

// Rapier's ordinary contact offset is around the millimetre scale in this
// metre-sized world. One millimetre is 0.1% of a cell and far below visible or
// gameplay-significant movement, so any larger lateral motion is a real kick.
const MAX_FLAGGED_LATERAL_DRIFT = 0.001;
// A resting sphere is kept slightly above the mathematical plane by contact
// stabilization. Three millimetres is still below 1% of this sphere's radius.
const MAX_FLAGGED_SETTLE_ERROR = 0.003;
const MAX_FLAGGED_FINAL_SPEED = 0.001;

function round(value, digits = 9) {
  return Number(value.toFixed(digits));
}

function addCase(cases, seen, label, x, z) {
  // Coordinates are generated from exact cell arithmetic plus a fixed offset,
  // but use a rounded key so the two edge passes cannot add the same point.
  const key = `${x.toFixed(8)},${z.toFixed(8)}`;
  if (seen.has(key)) return;
  seen.add(key);
  cases.push({ label, x, z });
}

function buildDropCases() {
  const cases = [];
  const seen = new Set();
  const offsets = [-SEAM_OFFSET, 0, SEAM_OFFSET];

  // Grid edges shared by adjacent cells. Sample their midpoint along the other
  // axis, avoiding the outer boundary where an edge-of-field fall is expected.
  for (let seam = 1; seam < CELLS; seam += 1) {
    const coordinate = -HALF_FIELD + seam * CELL_SIZE;
    for (let cell = 0; cell < CELLS; cell += 1) {
      const midpoint = -HALF_FIELD + (cell + 0.5) * CELL_SIZE;
      for (const offset of offsets) {
        addCase(cases, seen, `x-edge-${seam}-${cell}-${offset}`, coordinate + offset, midpoint);
        addCase(cases, seen, `z-edge-${seam}-${cell}-${offset}`, midpoint, coordinate + offset);
      }
    }
  }

  // Each heightfield cell is triangulated along one diagonal. Sampling both
  // diagonals keeps this probe independent of Rapier's diagonal convention.
  const diagonalOffset = SEAM_OFFSET / Math.SQRT2;
  for (let row = 0; row < CELLS; row += 1) {
    for (let column = 0; column < CELLS; column += 1) {
      const centerX = -HALF_FIELD + (column + 0.5) * CELL_SIZE;
      const centerZ = -HALF_FIELD + (row + 0.5) * CELL_SIZE;
      for (const offset of offsets) {
        const perpendicular = Math.sign(offset) * diagonalOffset;
        addCase(cases, seen, `diag-down-${row}-${column}-${offset}`, centerX + perpendicular, centerZ - perpendicular);
        addCase(cases, seen, `diag-up-${row}-${column}-${offset}`, centerX + perpendicular, centerZ + perpendicular);
      }
    }
  }

  return cases;
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

function runVariant(cases, flags) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = TIMESTEP;

  // nrows/ncols are subdivision counts; the height matrix therefore contains
  // (nrows + 1) * (ncols + 1) samples, stored column-major. All zeroes make
  // ordering irrelevant here and isolate the collider's internal edges.
  const heights = new Float32Array((CELLS + 1) * (CELLS + 1));
  world.createCollider(
    RAPIER.ColliderDesc.heightfield(
      CELLS,
      CELLS,
      heights,
      { x: FIELD_SIZE, y: 1, z: FIELD_SIZE },
      flags,
    ).setFriction(0.45).setRestitution(0),
  );

  const result = {
    samples: cases.length,
    finite: true,
    settled: 0,
    maxLateralDrift: 0,
    worstLateralCase: null,
    maxSettleError: 0,
    worstSettleCase: null,
    maxFinalSpeed: 0,
    worstSpeedCase: null,
  };

  try {
    for (const sample of cases) {
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(sample.x, DROP_HEIGHT, sample.z)
          .setLinearDamping(0.08)
          .setAngularDamping(0.08),
      );
      world.createCollider(
        RAPIER.ColliderDesc.ball(SPHERE_RADIUS)
          .setFriction(0.12)
          .setRestitution(0),
        body,
      );

      let sampleMaxDrift = 0;
      for (let step = 0; step < STEPS; step += 1) {
        world.step();
        if (!finiteBodyState(body)) result.finite = false;
        const position = body.translation();
        sampleMaxDrift = Math.max(sampleMaxDrift, Math.hypot(position.x - sample.x, position.z - sample.z));
      }

      const position = body.translation();
      const velocity = body.linvel();
      const settleError = Math.abs(position.y - SPHERE_RADIUS);
      const finalSpeed = Math.hypot(velocity.x, velocity.y, velocity.z);
      if (body.isSleeping() || finalSpeed <= MAX_FLAGGED_FINAL_SPEED) result.settled += 1;

      if (sampleMaxDrift > result.maxLateralDrift) {
        result.maxLateralDrift = sampleMaxDrift;
        result.worstLateralCase = sample.label;
      }
      if (settleError > result.maxSettleError) {
        result.maxSettleError = settleError;
        result.worstSettleCase = sample.label;
      }
      if (finalSpeed > result.maxFinalSpeed) {
        result.maxFinalSpeed = finalSpeed;
        result.worstSpeedCase = sample.label;
      }

      world.removeRigidBody(body);
    }
  } finally {
    world.free();
  }

  return result;
}

function printable(result) {
  return {
    samples: result.samples,
    finite: result.finite,
    settled: `${result.settled}/${result.samples}`,
    maxLateralDrift: round(result.maxLateralDrift),
    worstLateralCase: result.worstLateralCase,
    maxVerticalSettleError: round(result.maxSettleError),
    worstSettleCase: result.worstSettleCase,
    maxFinalSpeed: round(result.maxFinalSpeed),
    worstSpeedCase: result.worstSpeedCase,
  };
}

async function main() {
  await RAPIER.init();
  const cases = buildDropCases();
  const unflagged = runVariant(cases, undefined);
  const flagged = runVariant(cases, RAPIER.HeightFieldFlags.FIX_INTERNAL_EDGES);

  console.log(`Rapier ${RAPIER.version()} flat-heightfield seam probe`);
  console.log(`dt=${TIMESTEP} steps=${STEPS} cells=${CELLS} radius=${SPHERE_RADIUS} drops=${cases.length}`);
  console.table({ unflagged: printable(unflagged), fixInternalEdges: printable(flagged) });

  const failures = [];
  if (!flagged.finite) failures.push("flagged simulation produced a non-finite position, rotation, or velocity");
  if (flagged.settled !== flagged.samples) failures.push(`only ${flagged.settled}/${flagged.samples} flagged drops settled`);
  if (flagged.maxLateralDrift > MAX_FLAGGED_LATERAL_DRIFT) {
    failures.push(`flagged lateral drift ${flagged.maxLateralDrift} exceeds ${MAX_FLAGGED_LATERAL_DRIFT}`);
  }
  if (flagged.maxSettleError > MAX_FLAGGED_SETTLE_ERROR) {
    failures.push(`flagged vertical settle error ${flagged.maxSettleError} exceeds ${MAX_FLAGGED_SETTLE_ERROR}`);
  }
  if (flagged.maxFinalSpeed > MAX_FLAGGED_FINAL_SPEED) {
    failures.push(`flagged final speed ${flagged.maxFinalSpeed} exceeds ${MAX_FLAGGED_FINAL_SPEED}`);
  }

  if (failures.length > 0) {
    for (const failure of failures) console.error(`FAIL: ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `PASS: FIX_INTERNAL_EDGES stayed within ${MAX_FLAGGED_LATERAL_DRIFT} lateral, `
      + `${MAX_FLAGGED_SETTLE_ERROR} vertical, and ${MAX_FLAGGED_FINAL_SPEED} final-speed bounds.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
