import type { Ev3FirstProgramBlockId } from "./ev3-first-program";

export type KidxTracePose = { x: number; z: number; heading: number };
export type KidxTraceOutcome = "complete" | "finished" | "stopped" | "expired";
export type KidxTraceSegment = {
  block: Ev3FirstProgramBlockId; points: KidxTracePose[];
  distance: number; turn: number; seconds: number; red: boolean; completed: boolean;
};
export type KidxMissionTrace = {
  blocks: Ev3FirstProgramBlockId[]; segments: KidxTraceSegment[];
  start: KidxTracePose; end: KidxTracePose; outcome: KidxTraceOutcome;
};

/** Observe the executed program, never infer its path from the authored instructions. */
export function createKidxMissionTrace() {
  let blocks: Ev3FirstProgramBlockId[] = [], segments: KidxTraceSegment[] = [];
  let start: KidxTracePose | null = null, previous: KidxTracePose | null = null;
  let result: KidxMissionTrace | null = null, active = false, sampleSeconds = 0;
  const valid = (pose: KidxTracePose) => [pose.x, pose.z, pose.heading].every(Number.isFinite);
  const clear = () => { blocks = []; segments = []; start = previous = null; result = null; active = false; sampleSeconds = 0; };
  return {
    clear,
    start(program: readonly Ev3FirstProgramBlockId[], pose: KidxTracePose) {
      clear();
      if (!program.length || program.length > 6 || !valid(pose)) return;
      blocks = [...program]; start = previous = { ...pose }; active = true;
    },
    sample(index: number, pose: KidxTracePose, seconds: number) {
      if (!active || !previous || !valid(pose) || !Number.isFinite(seconds) || seconds <= 0
        || !Number.isInteger(index) || index < Math.max(0, segments.length - 1) || index >= blocks.length || index > segments.length) return;
      let segment = segments[index];
      if (!segment) {
        const prior = segments.at(-1);
        if (prior) { prior.completed = true; prior.points.push({ ...previous }); }
        segment = { block: blocks[index], points: [{ ...previous }], distance: 0, turn: 0, seconds: 0, red: false, completed: false };
        segments.push(segment); sampleSeconds = 0;
      }
      segment.distance += Math.hypot(pose.x - previous.x, pose.z - previous.z);
      segment.turn += (((pose.heading - previous.heading + 180) % 360) + 360) % 360 - 180;
      segment.seconds += seconds;
      sampleSeconds += seconds;
      // Bounded drawing data; measurements still account for every observed physics frame.
      if (sampleSeconds >= .05 && segment.points.length < 120) { segment.points.push({ ...pose }); sampleSeconds = 0; }
      previous = { ...pose };
    },
    red(index: number) { if (active && segments[index]) segments[index].red = true; },
    finish(outcome: KidxTraceOutcome) {
      if (!active || !start || !previous) return null;
      active = false;
      const last = segments.at(-1);
      if (last) { last.points.push({ ...previous }); last.completed = outcome === "finished"; }
      result = { blocks: [...blocks], segments: structuredClone(segments), start: { ...start }, end: { ...previous }, outcome };
      return structuredClone(result);
    },
    state: () => result ? structuredClone(result) : null,
  };
}

/** Suggestions describe observations or propose an experiment, never claim an unmeasured cause. */
export function kidxTraceCoaching(trace: KidxMissionTrace, mission: { id: string; finish: readonly number[]; hint: string }) {
  const redIndex = trace.segments.findIndex(segment => segment.red);
  const turnIndex = trace.segments.findIndex(segment => segment.block === "left" || segment.block === "right");
  const distanceToBlue = (pose: KidxTracePose) => Math.hypot(pose.x - mission.finish[0], pose.z - mission.finish[1]);
  if (trace.outcome === "complete") return { summary: "Réussi ! Ton robot a atteint la zone bleue.", focus: trace.segments.length - 1,
    hints: ["Quel bloc a amené le robot jusqu’au bleu ?", "Choisis les blocs pour retrouver chaque morceau du trajet.", "Prévois ce qui changerait avec un bloc en moins, puis essaie ton idée."] };
  if (trace.outcome === "stopped") return { summary: "Tu as arrêté le robot avant la fin du programme.", focus: trace.segments.length - 1,
    hints: ["Jusqu’à quel bloc le robot est-il allé ?", "Les blocs marqués « Pas encore joué » n’ont pas fait bouger le robot.", "Reviens au robot et appuie sur Démarrer pour essayer le programme depuis le départ."] };
  if (trace.outcome === "expired") return { summary: "Le temps de la mission est terminé.", focus: trace.segments.length - 1,
    hints: ["Quelle partie du trajet pourrais-tu raccourcir ?", "Regarde les blocs de virage et d’arrêt.", "Change un seul bloc, puis compare ton prochain trajet."] };
  if (redIndex >= 0) return { summary: `Le robot est entré dans le rouge pendant le bloc ${redIndex + 1}.`, focus: redIndex,
    hints: ["À quel endroit le robot quitte-t-il le chemin vers le bleu ?", `Regarde le trajet du bloc ${redIndex + 1}, puis le bloc juste avant.`, "Essaie de changer un virage ou sa place dans le programme."] };
  if (trace.blocks.every(block => block === "stop") && trace.segments.every(segment => segment.distance < .01)) return {
    summary: "Le robot est resté au départ. Les blocs Arrêt ne le font pas bouger.", focus: 0,
    hints: ["Quel bloc pourrait faire bouger ton robot ?", "Arrêt dit au robot de s’arrêter. Avancer et Reculer demandent un déplacement.",
      mission.id === "reverse-parking" ? "Essaie de remplacer un bloc Arrêt par Reculer, puis observe le trajet." : "Essaie de remplacer un bloc Arrêt par Avancer, puis observe le trajet."] };
  if (mission.id === "first-drive" && trace.blocks.every(block => block === "forward")
    && trace.end.z > mission.finish[1] && distanceToBlue(trace.end) < distanceToBlue(trace.start)) return {
    summary: "Ton robot s’est arrêté avant l’arrivée. Ses blocs Avancer sont terminés.", focus: trace.segments.length - 1,
    hints: ["Faut-il avancer encore ou changer de direction ?", "Chaque bloc Avancer ajoute un déplacement dans la même direction.", "Essaie d’ajouter un bloc Avancer, puis compare le trajet."] };
  if (mission.id === "first-drive" && turnIndex >= 0) return {
    summary: "Le programme est terminé. Le robot n’a pas atteint le bleu.", focus: turnIndex,
    hints: ["Y a-t-il besoin de tourner pour rejoindre le bleu ?", `Le bloc ${turnIndex + 1} change la direction. Observe la flèche du robot.`, "Essaie de garder les blocs Avancer et de changer un seul virage."] };
  return { summary: distanceToBlue(trace.end) > distanceToBlue(trace.start) + .3
    ? "À la fin de cet essai, le robot est plus loin du bleu qu’au départ."
    : "Le programme est terminé. Le défi n’est pas encore réussi.", focus: trace.segments.length - 1,
    hints: ["Compare l’arrivée bleue, les repères et le bout de ton trajet.", "Choisis un bloc : la flèche montre dans quel sens le robot regarde après cet ordre.", mission.hint] };
}
