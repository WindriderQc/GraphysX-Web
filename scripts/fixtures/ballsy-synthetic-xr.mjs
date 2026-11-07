/** Synthetic native WebXR binding/poses only. No game actions, launch, velocity or race writes.
 * Not a headset emulator: no XR framebuffer, stereo, optics or device performance is tested.
 * Inject before navigation with page.addInitScript(installBallsySyntheticXr).
 */
export function installBallsySyntheticXr() {
  const nativeRAF = window.requestAnimationFrame.bind(window);
  const fixture = window.__ballsyXR = {
    reject: true, localOnly: false, requests: [], spaces: [], session: null,
    reference: null, xr: null, viewer: [0, 1.6, 0], viewerYaw: 0, path: null,
    poseFrames: [], afterFrame: null, referenceType: "local-floor", emulated: false,
  };
  const transform = (position, quaternion = [0, 0, 0, 1]) => ({
    position: { x: position[0], y: position[1], z: position[2], w: 1 },
    orientation: { x: quaternion[0], y: quaternion[1], z: quaternion[2], w: quaternion[3] },
  });
  fixture.frame = {
    get session() { return fixture.session; },
    getViewerPose() { return { transform: transform(fixture.viewer, [0, Math.sin(fixture.viewerYaw / 2), 0, Math.cos(fixture.viewerYaw / 2)]), views: [] }; },
    getJointPose(space) {
      const joint = fixture.xr?.input.slots[space?.slot]?.hand.joints[space?.name];
      return joint?.visible ? { transform: transform(joint.position.toArray(), joint.quaternion.toArray()), radius: joint.jointRadius, emulatedPosition: fixture.emulated } : null;
    },
    getPose(space) {
      const slot = fixture.xr?.input.slots[space?.slot];
      const object = space?.kind === "grip" ? slot?.grip : slot?.ray;
      return object?.visible ? { transform: transform(object.position.toArray(), object.quaternion.toArray()), emulatedPosition: fixture.emulated } : null;
    },
  };
  Object.defineProperty(navigator, "xr", { configurable: true, value: {
    isSessionSupported: async () => true,
    requestSession(mode, options) {
      fixture.requests.push({ mode, options, activation: navigator.userActivation.isActive });
      if (fixture.reject) return Promise.reject(new DOMException("Synthetic entry denied", "NotAllowedError"));
      const session = new EventTarget();
      session.visibilityState = "visible"; session.inputSources = [];
      session.requestReferenceSpace = async type => {
        fixture.spaces.push(type);
        if (fixture.localOnly && type === "local-floor") throw new Error("Synthetic runtime has local only");
        return fixture.reference;
      };
      session.end = async () => { session.dispatchEvent(new Event("end")); };
      fixture.session = session;
      return Promise.resolve(session);
    },
  } });
  // Reuse the app's one existing renderer loop; only native frames/poses are substituted.
  // No deterministic advanceTime on the giant, and no fabricated throw velocity.
  window.requestAnimationFrame = callback => nativeRAF(time => {
    const active = fixture.xr?.session.snapshot.phase === "active";
    if (active) {
      const camera = fixture.xr.camera;
      camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
      if (fixture.captureView) {
        camera.position.set(...fixture.captureView.eye);
        camera.lookAt(...fixture.captureView.target);
      } else {
        camera.position.set(...fixture.viewer);
        camera.rotation.set(-.5, fixture.viewerYaw, 0, "YXZ");
      }
      camera.updateMatrixWorld(true);
    }
    if (active && fixture.path) {
      const path = fixture.path;
      path.started ??= performance.now();
      const fraction = Math.min(1, (performance.now() - path.started) / path.duration);
      fixture.move(path.slot, path.from.map((value, axis) => value + (path.to[axis] - value) * fraction));
      fixture.poseFrames.push({ at: performance.now(), point: path.from.map((value, axis) => value + (path.to[axis] - value) * fraction) });
      if (fraction === 1) {
        fixture.path = null;
        fixture.afterFrame = () => {
          if (path.release) fixture.action(path.slot, path.release);
          path.resolve({ samples: fixture.poseFrames, duration: performance.now() - path.started });
        };
      }
    }
    callback(time, active ? fixture.frame : undefined);
    const after = fixture.afterFrame; fixture.afterFrame = null; after?.();
  });
}

/** Run once after __BALLSY_GIANT__.xr exists, before clicking the native entry button. */
export function bindBallsySyntheticXr() {
  const fixture = window.__ballsyXR, xr = fixture.xr = window.__BALLSY_GIANT__.xr;
  if (!xr?.renderer || !xr.input || !xr.session) throw new Error("Missing shared VR diagnostic objects");
  const manager = xr.renderer.xr;
  manager.setReferenceSpaceType = type => { fixture.referenceType = type; };
  manager.getReferenceSpace = () => fixture.reference;
  manager.getFrame = () => fixture.xr.session.snapshot.phase === "active" ? fixture.frame : null;
  manager.getSession = () => fixture.session && xr.session.session === fixture.session ? fixture.session : null;
  manager.setSession = async session => {
    fixture.reference = new EventTarget();
    session.addEventListener("end", () => {
      for (const slot of xr.input.slots) {
        if (slot.source) slot.ray.dispatchEvent({ type: "disconnected", data: slot.source });
      }
    }, { once: true });
  };
  fixture.action = (index, type) => {
    const slot = xr.input.slots[index];
    slot.ray.dispatchEvent({ type, data: slot.source });
  };
  fixture.anchor = index => {
    const slot = xr.input.slots[index], point = slot.anchor.position.clone();
    slot.anchor.getWorldPosition(point);
    if (!slot.source?.hand) point.add(point.clone().set(0, 0, -.085).applyQuaternion(slot.anchor.getWorldQuaternion(slot.anchor.quaternion.clone())));
    return point.toArray();
  };
  fixture.move = (index, point) => {
    const slot = xr.input.slots[index];
    if (slot.source?.hand) {
      const vector = slot.anchor.position.clone().set(...point);
      slot.hand.worldToLocal(vector);
      slot.hand.joints["index-finger-tip"].position.copy(vector);
      slot.hand.joints["thumb-tip"].position.copy(vector);
      for (const [name, joint] of Object.entries(slot.hand.joints)) {
        if (name === "index-finger-tip" || name === "thumb-tip") continue;
        const offset = joint.userData.fixtureOffset;
        joint.position.copy(vector).add(slot.anchor.position.clone().set(...offset));
      }
    } else {
      const vector = slot.anchor.position.clone().set(...point);
      vector.sub(vector.clone().set(0, 0, -.085).applyQuaternion(slot.grip.getWorldQuaternion(slot.grip.quaternion.clone())));
      xr.input.group.worldToLocal(vector); slot.grip.position.copy(vector);
    }
    slot.grip.updateMatrixWorld(true); slot.hand.updateMatrixWorld(true);
  };
  fixture.connect = (index, handedness, kind = "controller") => {
    const slot = xr.input.slots[index];
    if (slot.source) fixture.action(index, "disconnected");
    slot.grip.matrixAutoUpdate = slot.ray.matrixAutoUpdate = slot.hand.matrixAutoUpdate = true;
    slot.grip.visible = slot.ray.visible = slot.hand.visible = true;
    slot.ray.position.set(index ? -.4 : .4, 1.25, 0); slot.ray.quaternion.identity();
    slot.grip.quaternion.identity();
    const source = { handedness, targetRayMode: "tracked-pointer", profiles: ["unknown-xr-standard"],
      targetRaySpace: { kind: "ray", slot: index }, gripSpace: { kind: "grip", slot: index },
      gamepad: { mapping: "xr-standard", axes: [0, 0, 0, 0], buttons: Array.from({ length: 6 }, () => ({ value: 0, pressed: false, touched: false })) } };
    if (kind === "hand") {
      delete source.gripSpace; delete source.gamepad; source.profiles = []; source.hand = new Map();
      const names = ["wrist", "thumb-metacarpal", "thumb-phalanx-proximal", "thumb-phalanx-distal", "thumb-tip"];
      for (const finger of ["index", "middle", "ring", "pinky"]) {
        for (const part of ["metacarpal", "phalanx-proximal", "phalanx-intermediate", "phalanx-distal", "tip"]) names.push(`${finger}-finger-${part}`);
      }
      names.forEach((name, i) => {
        const joint = slot.hand.joints[name] ?? new slot.anchor.constructor();
        joint.visible = true; joint.jointRadius = .009;
        joint.userData.fixtureOffset = [Math.floor(i / 5) * .024 - .048, 0, .08 - i % 5 * .018];
        slot.hand.joints[name] = joint; slot.hand.add(joint); source.hand.set(name, { name, slot: index });
      });
    }
    slot.ray.dispatchEvent({ type: "connected", data: source });
    fixture.session.inputSources = xr.input.slots.map(slot => slot.source).filter(Boolean);
    fixture.move(index, [index ? -.3 : .3, 1.12, -.48]);
  };
  fixture.travel = (slot, to, duration, release = null) => new Promise(resolve => {
    fixture.poseFrames = [];
    fixture.path = { slot, from: fixture.anchor(slot), to, duration, release, resolve };
  });
  fixture.aim = (index, target) => {
    const ray = xr.input.slots[index].ray;
    const local = ray.position.clone().set(...target); xr.input.group.worldToLocal(local);
    ray.position.copy(local).add(ray.position.clone().set(0, 0, .55)); ray.quaternion.identity(); ray.visible = true;
    ray.updateMatrixWorld(true);
  };
}
