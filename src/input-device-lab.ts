export type DeviceProfileId = "physx-robot" | "ballz18-comok" | "scene3d" | "mearm" | "atmel-cubx";
export type RobotCommand = 2 | 4 | 6 | 8;
export type ServoId = "middle" | "left" | "right" | "claw";

export type DeviceLogEntry = {
  at: string;
  direction: "TX" | "RX" | "INFO" | "BLOCKED";
  text: string;
  hex: string;
};

export type DeviceLabState = {
  transport: "simulation";
  hardwareAvailable: boolean;
  profile: DeviceProfileId;
  baud: 9600;
  armed: boolean;
  robotCommand: RobotCommand;
  pin: number;
  pinOn: boolean;
  sonarDistanceCm: number;
  radar: Array<{ angle: number; radius: number; pass: "forward" | "reverse" }>;
  io: boolean[];
  schedules: Array<{ label: string; start: string; stop: string; enabled: boolean }>;
  meArm: { middle: number; left: number; right: number; claw: number; started: boolean };
  log: DeviceLogEntry[];
};

export const DEVICE_PROFILES: ReadonlyArray<{ id: DeviceProfileId; label: string; wire: string }> = [
  { id: "physx-robot", label: "PhysX Robot", wire: "4-byte [10 cmd pin value]" },
  { id: "ballz18-comok", label: "BallZ18 COMOK", wire: "4-byte + -COMOK-- / CSV" },
  { id: "scene3d", label: "Scene3D", wire: "5-byte [10 cmd pin value 04]" },
  { id: "mearm", label: "MeArm", wire: "H/A/a/z/x/c/v text" },
  { id: "atmel-cubx", label: "AtmelCubx", wire: "D/E/S/C ASCII + raw IO" }
];

const clampByte = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));
const hex = (bytes: number[]): string => bytes.map((value) => clampByte(value).toString(16).padStart(2, "0").toUpperCase()).join(" ");
const asciiHex = (value: string): string => hex(Array.from(value, (character) => character.charCodeAt(0)));

export class InputDeviceLab {
  private state: DeviceLabState = {
    transport: "simulation",
    hardwareAvailable: typeof navigator !== "undefined" && "serial" in navigator && window.isSecureContext,
    profile: "physx-robot",
    baud: 9600,
    armed: false,
    robotCommand: 2,
    pin: 8,
    pinOn: false,
    sonarDistanceCm: 64,
    radar: [],
    io: Array.from({ length: 8 }, () => false),
    schedules: [
      { label: "Light On", start: "0700", stop: "0730", enabled: false },
      { label: "Light Off", start: "1900", stop: "1930", enabled: false },
      { label: "Fan On", start: "0800", stop: "0830", enabled: false },
      { label: "Fan Off", start: "1800", stop: "1830", enabled: false }
    ],
    meArm: { middle: 90, left: 90, right: 90, claw: 25, started: false },
    log: []
  };

  constructor() {
    this.info("Simulation ready · no port opened or scanned");
  }

  getState(): DeviceLabState {
    return {
      ...this.state,
      radar: this.state.radar.map((point) => ({ ...point })),
      io: [...this.state.io],
      schedules: this.state.schedules.map((schedule) => ({ ...schedule })),
      meArm: { ...this.state.meArm },
      log: this.state.log.map((entry) => ({ ...entry }))
    };
  }

  setProfile(profile: DeviceProfileId): void {
    if (!DEVICE_PROFILES.some((candidate) => candidate.id === profile)) return;
    this.state.profile = profile;
    this.info(`${DEVICE_PROFILES.find((candidate) => candidate.id === profile)?.label ?? profile} selected · 9600 baud simulation`);
  }

  setArmed(armed: boolean): void {
    this.state.armed = armed;
    if (!armed) this.state.robotCommand = 2;
    this.info(armed ? "Actuator simulation armed" : "STOP · actuator simulation disarmed");
  }

  sendRobot(command: RobotCommand): boolean {
    if (command !== 2 && !this.state.armed) {
      this.addLog("BLOCKED", `command ${command} requires ARM`, []);
      return false;
    }
    this.state.robotCommand = command;
    this.transact(this.robotFrame(command, 0, 0), `robot command ${command}`, command === 2 ? "STOP-Ok" : `${command}-Ok`);
    return true;
  }

  setPin(on: boolean): void {
    this.state.pinOn = on;
    this.transact(this.robotFrame(127, this.state.pin, on ? 1 : 0), `pin ${this.state.pin} ${on ? "ON" : "OFF"}`, "-Ok");
  }

  identify(): void {
    const response = this.state.profile === "ballz18-comok"
      ? "-COMOK--"
      : this.state.profile === "scene3d"
        ? "HELLO FROM ARDUINO"
        : this.state.profile === "mearm"
          ? "Hello"
          : "HELLO FROM ARDUINO-Ok";
    const frame = this.state.profile === "mearm" ? "H" : this.robotFrame(128, 0, 0);
    this.transact(frame, "identify", response);
  }

  readSonar(): void {
    this.state.sonarDistanceCm = 42 + ((this.state.sonarDistanceCm * 7) % 71);
    this.transact(this.robotFrame(129, 0, 0), "single sonar", `${this.state.sonarDistanceCm}-Ok`);
  }

  sweepSonar(): void {
    const forward = Array.from({ length: 91 }, (_, index) => {
      const angle = index * 2;
      return { angle, radius: this.radarRadius(angle, 0), pass: "forward" as const };
    });
    const reverse = Array.from({ length: 91 }, (_, index) => {
      const angle = 180 - index * 2;
      return { angle, radius: this.radarRadius(angle, 1), pass: "reverse" as const };
    });
    this.state.radar = [...forward, ...reverse];
    const response = `${this.state.radar.map((point) => `${point.angle}:${point.radius};`).join("")}-Ok`;
    this.transact(this.robotFrame(130, 0, 0), "sonar sweep · 182 source points", response);
  }

  toggleIo(index: number): void {
    if (index < 0 || index >= 8) return;
    this.state.io[index] = !this.state.io[index];
    const prefix = this.state.io[index] ? "D" : "E";
    this.transact([prefix.charCodeAt(0), index], `IO ${index} ${this.state.io[index] ? "ON" : "OFF"}`, "-Ok");
  }

  toggleSchedule(index: number): void {
    const schedule = this.state.schedules[index];
    if (!schedule) return;
    schedule.enabled = !schedule.enabled;
    const alarmId = String(index * 2);
    const frame = `C${alarmId}${schedule.start}${schedule.stop}${schedule.enabled ? "1" : "0"}`;
    this.transact(frame, `${schedule.label} schedule ${schedule.enabled ? "ON" : "OFF"}`, "-Ok");
  }

  setServo(id: ServoId, value: number): void {
    const clamped = Math.max(0, Math.min(180, Math.round(value)));
    this.state.meArm[id] = clamped;
    const prefix: Record<ServoId, string> = { middle: "z", left: "x", right: "c", claw: "v" };
    this.transact(`${prefix[id]}${String(clamped).padStart(3, "0")}`, `${id} servo ${clamped}°`, "-Ok");
  }

  setMeArmStarted(started: boolean): boolean {
    if (started && !this.state.armed) {
      this.addLog("BLOCKED", "MeArm start requires ARM", []);
      return false;
    }
    this.state.meArm.started = started;
    this.transact(started ? "A" : "a", `MeArm LED ${started ? "ON" : "OFF"}`, started ? "started" : "stopped");
    return true;
  }

  private robotFrame(command: number, pin: number, value: number): number[] | string {
    if (this.state.profile === "mearm") return "H";
    const bytes = [0x10, command, pin, value];
    return this.state.profile === "scene3d" ? [...bytes, 0x04] : bytes;
  }

  private transact(frame: number[] | string, label: string, response: string): void {
    this.addLog("TX", label, frame);
    this.addLog("RX", response, response);
  }

  private info(text: string): void {
    this.addLog("INFO", text, []);
  }

  private addLog(direction: DeviceLogEntry["direction"], text: string, frame: number[] | string): void {
    const frameHex = typeof frame === "string" ? asciiHex(frame) : hex(frame);
    this.state.log.unshift({ at: new Date().toISOString().slice(11, 19), direction, text, hex: frameHex || "—" });
    this.state.log = this.state.log.slice(0, 20);
  }

  private radarRadius(angle: number, reverse: number): number {
    return Math.round(28 + Math.abs(Math.sin((angle + reverse * 7) * Math.PI / 37)) * 82);
  }
}
