import type { AgentWorldSteerInput } from "./agent-world-runtime";

export type KidxSensor = "distance" | "touch" | "color" | "angle";
export type KidxReadings = Record<KidxSensor, number>;
export type KidxCondition = { sensor: KidxSensor; operator: "lt" | "gt" | "eq"; value: number };
export type KidxInstruction =
  | { kind: "motors"; left: number; right: number; seconds: number }
  | { kind: "wait"; seconds: number }
  | { kind: "until"; left: number; right: number; seconds: number; condition: KidxCondition }
  | { kind: "repeat"; count: number; body: KidxInstruction[] }
  | { kind: "if"; condition: KidxCondition; body: KidxInstruction[]; otherwise: KidxInstruction[] };

const numberIn = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const conditionValid = (v: unknown): v is KidxCondition => {
  if (!v || typeof v !== "object") return false;
  const c = v as KidxCondition;
  return ["distance", "touch", "color", "angle"].includes(c.sensor) && ["lt", "gt", "eq"].includes(c.operator) && numberIn(c.value, -360, 1000);
};
export function validateKidxCode(value: unknown): value is KidxInstruction[] {
  let total = 0;
  const list = (v: unknown, depth: number): boolean => Array.isArray(v) && v.length <= 32 && depth <= 4 && v.every((node: unknown) => {
    if (++total > 64 || !node || typeof node !== "object") return false;
    const n = node as KidxInstruction;
    switch (n.kind) {
      case "motors": case "until": return numberIn(n.left, -100, 100) && numberIn(n.right, -100, 100) && numberIn(n.seconds, .05, 30) && (n.kind !== "until" || conditionValid(n.condition));
      case "wait": return numberIn(n.seconds, .05, 30);
      case "repeat": return Number.isInteger(n.count) && numberIn(n.count, 1, 20) && n.body.length > 0 && list(n.body, depth + 1);
      case "if": return conditionValid(n.condition) && list(n.body, depth + 1) && list(n.otherwise, depth + 1);
      default: return false;
    }
  });
  try { return list(value, 0); } catch { return false; }
}
export function kidxConditionMatches(condition: KidxCondition, sensors: KidxReadings) {
  const value = sensors[condition.sensor];
  return Number.isFinite(value) && (condition.operator === "lt" ? value < condition.value : condition.operator === "gt" ? value > condition.value : Math.abs(value - condition.value) < .01);
}
export function kidxMotorInput(left: number, right: number): AgentWorldSteerInput {
  return { thrust: (left + right) / 200, turn: (left - right) / 200 };
}

/** Bounded tree interpreter; conditions read live sensors at execution time. */
export function createKidxCodeRunner(apply: (input: AgentWorldSteerInput) => void, sensors: () => KidxReadings, notify: (message: string) => void) {
  type Frame = { list: KidxInstruction[]; index: number; remaining: number; path: string };
  let stack: Frame[] = [];
  let active: Extract<KidxInstruction, { kind: "motors" | "wait" | "until" }> | null = null;
  let running = false, paused = false, single = false, elapsed = 0, total = 0, path = "", error: string | null = null;
  let lastCondition: { sensor: KidxSensor; value: number; target: number; matched: boolean } | null = null;
  const evaluate = (condition: KidxCondition) => {
    const readings = sensors(), matched = kidxConditionMatches(condition, readings);
    lastCondition = { sensor: condition.sensor, value: readings[condition.sensor], target: condition.value, matched };
    return matched;
  };
  const halt = () => apply({ thrust: 0, turn: 0 });
  const input = () => active && active.kind !== "wait" ? kidxMotorInput(active.left, active.right) : { thrust: 0, turn: 0 };
  const stop = () => { running = false; paused = false; active = null; stack = []; halt(); };
  const next = () => {
    active = null; elapsed = 0;
    for (let budget = 0; stack.length && budget < 4096; budget++) {
      const frame = stack[stack.length - 1];
      if (frame.index >= frame.list.length) { if (--frame.remaining > 0) frame.index = 0; else stack.pop(); continue; }
      const index = frame.index++;
      const node = frame.list[index]; path = `${frame.path}${index}`;
      if (node.kind === "repeat") stack.push({ list: node.body, index: 0, remaining: node.count, path: `${path}.body.` });
      else if (node.kind === "if") { const branch = evaluate(node.condition) ? "body" : "otherwise"; stack.push({ list: node[branch], index: 0, remaining: 1, path: `${path}.${branch}.` }); }
      else { active = node; apply(input()); return; }
    }
    if (stack.length) { error = "Trop d’étapes sans mouvement."; notify(error); }
    else notify("Programme terminé. Observe le résultat et ajuste tes blocs.");
    stop();
  };
  return {
    start(code: KidxInstruction[], step = false) {
      if (!validateKidxCode(code) || !code.length) return false;
      stop(); error = null; lastCondition = null; total = 0; running = true; single = step;
      stack = [{ list: structuredClone(code), index: 0, remaining: 1, path: "" }]; next(); return true;
    },
    stop,
    pause() { if (running) { paused = true; halt(); } },
    resume(step = false) { if (running) { paused = false; single = step; if (active) apply(input()); else next(); } },
    advance(delta: number) {
      if (!running || paused || !Number.isFinite(delta) || delta <= 0) return;
      const dt = Math.min(.1, delta); total += dt; elapsed += dt;
      if (total > 180) { error = "La limite de trois minutes est atteinte. Raccourcis ton programme."; stop(); notify(error); return; }
      if (!active) return;
      const matched = active.kind === "until" && evaluate(active.condition);
      if (active.kind === "until" && elapsed >= active.seconds && !matched) {
        error = "Le capteur n’a pas atteint la valeur demandée avant le délai. Vérifie sa position et le seuil.";
        stop(); notify(error); return;
      }
      if (matched || elapsed >= active.seconds) {
        halt(); active = null;
        if (single) { paused = true; elapsed = 0; }
        else next();
      }
    },
    state: () => ({ running, paused, activePath: active ? path : null, elapsed, total, error, lastCondition: lastCondition ? { ...lastCondition } : null }),
  };
}

export const KIDX_CODE_STORAGE = "graphysx:kidx:code:v1";
export function saveKidxCode(storage: Pick<Storage, "getItem" | "setItem">, code: KidxInstruction[]): string | null {
  if (!validateKidxCode(code)) return "Programme invalide.";
  try {
    const existing = storage.getItem(KIDX_CODE_STORAGE);
    if (existing !== null) { const parsed = JSON.parse(existing); if (parsed.version !== 1 || !validateKidxCode(parsed.code)) return "La sauvegarde existante est illisible ou plus récente. Elle est conservée."; }
    storage.setItem(KIDX_CODE_STORAGE, JSON.stringify({ version: 1, code })); return null;
  } catch { return "Enregistrement impossible. Ton programme reste ouvert."; }
}
export function readKidxCode(storage: Pick<Storage, "getItem">): KidxInstruction[] | null {
  const raw = storage.getItem(KIDX_CODE_STORAGE); if (raw === null) return null;
  const parsed = JSON.parse(raw);
  if (parsed.version !== 1 || !validateKidxCode(parsed.code)) throw new Error("Sauvegarde illisible ou plus récente.");
  return parsed.code;
}
