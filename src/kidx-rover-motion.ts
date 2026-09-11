import type { GraphysXAgentWorldApi } from "./agent-world-runtime";

/** Wheel odometry follows measured translation and heading, including turns in place. */
export function kidxWheelTravel(previous: readonly number[], current: readonly number[], heading: number, previousHeading: number) {
  const yaw = ((heading - previousHeading + 540) % 360 - 180) * Math.PI / 180;
  const middle = (previousHeading * Math.PI / 180) + yaw / 2;
  const distance = (current[0] - previous[0]) * Math.sin(middle) - (current[2] - previous[2]) * Math.cos(middle);
  return { left: (distance + yaw * 2.02) / .91, right: (distance - yaw * 2.02) / .91 };
}

export function createKidxRoverMotion(api: GraphysXAgentWorldApi, id: string) {
  let previous: number[] | null = null;
  let heading = 0;
  let left = 0, right = 0;
  let pitch = 0, roll = 0;
  let frames = 0;
  let lcd = [0, 0];
  let audio: AudioContext | null = null;
  let oscillator: OscillatorNode | null = null;
  let gain: GainNode | null = null;
  let soundEnabled = false;
  const reset = () => { previous = null; left = right = 0; };
  return {
    reset,
    async sound(enabled: boolean) {
      soundEnabled = enabled;
      if (enabled && !audio) {
        audio = new AudioContext(); oscillator = audio.createOscillator(); gain = audio.createGain();
        oscillator.type = "triangle"; gain.gain.value = 0;
        oscillator.connect(gain); gain.connect(audio.destination); oscillator.start();
      }
      if (enabled) await audio?.resume();
      else if (gain && audio) gain.gain.setTargetAtTime(0, audio.currentTime, .04);
    },
    advance(deltaSeconds: number) {
      const rover = api.query({ ids: [id] })[0];
      if (!rover?.steering) return;
      const nextHeading = rover.steering.headingDegrees;
      if (Math.abs(rover.rotationDegrees[0] - pitch) + Math.abs(rover.rotationDegrees[2] - roll) > .08) {
        pitch = rover.rotationDegrees[0]; roll = rover.rotationDegrees[2];
        api.update(`${id}:heading`, { transform: { rotationDegrees: [pitch, -nextHeading, roll] } });
      }
      // Resets and scene teleports must not masquerade as kilometres of wheel travel.
      let activity = [0, 0];
      if (previous && Math.hypot(rover.position[0] - previous[0], rover.position[2] - previous[2]) < 2) {
        const travel = kidxWheelTravel(previous, rover.position, nextHeading, heading);
        if (deltaSeconds > 0) activity = [travel.left, travel.right].map(value => Math.min(8, Math.round(Math.abs(value) * .91 / deltaSeconds / 5.4 * 8)));
        left = (left + travel.left * 180 / Math.PI) % 360;
        right = (right + travel.right * 180 / Math.PI) % 360;
        if (Math.abs(travel.left) + Math.abs(travel.right) > .00001 && ++frames % 2 === 0) {
          api.transaction(([ ["left", left], ["right", right] ] as const).map(([side, rotation]) => ({ op: "update", id: `${id}:wheel-${side}`, patch: { transform: { rotationDegrees: [-rotation, 0, 0] } } })));
        }
      }
      if (activity.some((level, index) => level !== lcd[index])) {
        lcd = activity;
        api.transaction((["left", "right"] as const).map((side, index) => ({ op: "update", id: `${id}:lcd-${side}`,
          patch: { visible: lcd[index] > 0, transform: { position: [-.375 + .425 * lcd[index] / 8, 2.26, -.833 + index * .157], scale: [Math.max(.01, lcd[index] / 8), 1, 1] } } })));
      }
      previous = [...rover.position]; heading = nextHeading;
      if (audio && oscillator && gain) {
        const velocity = rover.physics?.linearVelocity ?? [0, 0, 0];
        const speed = Math.hypot(velocity[0], velocity[2]);
        const activity = Math.min(1, speed / 5 + Math.abs(rover.steering.turn) * .25);
        oscillator.frequency.setTargetAtTime(75 + activity * 150, audio.currentTime, .08);
        gain.gain.setTargetAtTime(soundEnabled ? activity * .035 : 0, audio.currentTime, .05);
      }
    },
    state: () => ({ leftDegrees: left, rightDegrees: right, soundEnabled, lcdMotors: [...lcd] }),
    dispose() { oscillator?.stop(); void audio?.close(); },
  };
}
