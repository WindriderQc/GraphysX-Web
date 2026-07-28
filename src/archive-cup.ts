import { MEDAL_POINTS, LevelRecordStore, formatRaceTime, type Medal } from "./scoreboard";

export type ArchiveCupCourse = {
  id: string;
  recordId: string;
  label: string;
  meta: string;
  referenceMs: number | null;
  play: () => void | Promise<void>;
};

export type ArchiveCupSnapshot = {
  visible: boolean;
  playingCourseId: string | null;
  completed: number;
  total: number;
  medalPoints: number;
  nextCourseId: string | null;
};

let runtimeSnapshot: ArchiveCupSnapshot | null = null;

export function getArchiveCupRuntimeState(): ArchiveCupSnapshot | null {
  return runtimeSnapshot ? { ...runtimeSnapshot } : null;
}

export function archiveCupSnapshot(courses: ArchiveCupCourse[]): ArchiveCupSnapshot {
  const store = new LevelRecordStore();
  const records = courses.map((course) => store.getRecord(course.recordId));
  const completed = records.filter(Boolean).length;
  const medalPoints = records.reduce((score, record) => score + (record?.medal ? MEDAL_POINTS[record.medal] : 0), 0);
  const nextIndex = records.findIndex((record) => !record);
  return {
    visible: false,
    playingCourseId: null,
    completed,
    total: courses.length,
    medalPoints,
    nextCourseId: nextIndex >= 0 ? courses[nextIndex]?.id ?? null : null,
  };
}

export function mountArchiveCup(
  container: HTMLElement,
  options: {
    courses: ArchiveCupCourse[];
    onPlay: (course: ArchiveCupCourse) => void;
    onBack?: () => void;
  },
): () => void {
  injectStyleOnce();
  const { courses, onPlay, onBack } = options;
  const snapshot = archiveCupSnapshot(courses);
  runtimeSnapshot = { ...snapshot, visible: true };
  const store = new LevelRecordStore();

  const overlay = document.createElement("div");
  overlay.className = "gx-cup";
  const card = document.createElement("section");
  card.className = "gx-cup-card";
  card.setAttribute("aria-label", "Archive Cup campaign");

  const head = document.createElement("header");
  head.className = "gx-cup-head";
  const heading = document.createElement("div");
  const eyebrow = document.createElement("div");
  eyebrow.className = "gx-cup-eyebrow";
  eyebrow.textContent = "GRAPHYSX REVIVAL TOUR";
  const title = document.createElement("h2");
  title.textContent = "Archive Cup";
  const blurb = document.createElement("p");
  blurb.textContent = "Nine recovered courses. Clear each round to unlock the next; your best run returns as a personal ghost.";
  heading.append(eyebrow, title, blurb);
  const back = document.createElement("button");
  back.type = "button";
  back.className = "gx-cup-back";
  back.textContent = "← Games";
  head.append(heading, back);

  const tally = document.createElement("div");
  tally.className = "gx-cup-tally";
  tally.append(tallyItem("CLEARED", `${snapshot.completed}/${snapshot.total}`), tallyItem("MEDAL POINTS", String(snapshot.medalPoints)));

  const list = document.createElement("div");
  list.className = "gx-cup-list";
  courses.forEach((course, index) => {
    const previousCleared = index === 0 || Boolean(store.getRecord(courses[index - 1].recordId));
    const record = store.getRecord(course.recordId);
    const row = document.createElement("button");
    row.type = "button";
    row.className = "gx-cup-round";
    row.dataset.courseId = course.id;
    row.disabled = !previousCleared;
    const number = document.createElement("span");
    number.className = "gx-cup-number";
    number.textContent = String(index + 1).padStart(2, "0");
    const copy = document.createElement("span");
    copy.className = "gx-cup-copy";
    const name = document.createElement("strong");
    name.textContent = course.label;
    const meta = document.createElement("small");
    meta.textContent = previousCleared ? course.meta : "Locked — clear the previous round";
    copy.append(name, meta);
    const result = document.createElement("span");
    result.className = "gx-cup-result";
    result.textContent = record
      ? `${medalMark(record.medal)} ${formatRaceTime(record.bestMs)}`.trim()
      : previousCleared ? "▶ RACE" : "🔒";
    row.append(number, copy, result);
    row.addEventListener("click", async () => {
      if (row.disabled) return;
      row.disabled = true;
      const previous = result.textContent;
      result.textContent = "LOADING…";
      try {
        runtimeSnapshot = { ...archiveCupSnapshot(courses), visible: false, playingCourseId: course.id };
        await course.play();
        dispose(false);
        onPlay(course);
      } catch (error) {
        runtimeSnapshot = { ...archiveCupSnapshot(courses), visible: true, playingCourseId: null };
        result.textContent = error instanceof Error ? error.message : String(error);
        row.classList.add("gx-cup-round--error");
        row.disabled = false;
        return;
      }
      result.textContent = previous;
    });
    list.append(row);
  });

  const action = document.createElement("button");
  action.type = "button";
  action.className = "gx-cup-continue";
  const next = courses.find((course) => course.id === snapshot.nextCourseId) ?? courses[0];
  action.textContent = snapshot.completed === snapshot.total ? "↻ Replay the Cup" : snapshot.completed > 0 ? `Continue · Round ${snapshot.completed + 1}` : "Start the Cup";
  action.addEventListener("click", () => {
    list.querySelector<HTMLButtonElement>(`.gx-cup-round[data-course-id="${next.id}"]`)?.click();
  });

  card.append(head, tally, list, action);
  overlay.append(card);
  container.append(overlay);

  const dispose = (clearState = true): void => {
    overlay.remove();
    if (clearState && runtimeSnapshot?.visible) runtimeSnapshot = null;
  };
  back.addEventListener("click", () => {
    dispose();
    onBack?.();
  });
  return () => dispose();
}

function tallyItem(label: string, value: string): HTMLElement {
  const item = document.createElement("div");
  const figure = document.createElement("strong");
  figure.textContent = value;
  const name = document.createElement("span");
  name.textContent = label;
  item.append(figure, name);
  return item;
}

function medalMark(medal: Medal | null): string {
  if (medal === "gold") return "● GOLD ·";
  if (medal === "silver") return "● SILVER ·";
  if (medal === "bronze") return "● BRONZE ·";
  return "✓";
}

const STYLE_ID = "gx-archive-cup-css";
function injectStyleOnce(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
.gx-cup{position:fixed;inset:0;z-index:42;display:flex;align-items:center;justify-content:center;padding:20px;
  background:radial-gradient(circle at 50% 0,rgba(43,129,143,.22),transparent 50%),rgba(3,11,17,.92);font-family:var(--gx-font)}
.gx-cup-card{width:min(820px,100%);max-height:92vh;display:flex;flex-direction:column;gap:14px;padding:22px;
  color:var(--gx-ink);background:linear-gradient(145deg,rgba(8,27,37,.98),rgba(8,18,27,.98));border:1px solid rgba(98,226,222,.38);
  border-radius:18px;box-shadow:0 28px 90px rgba(0,0,0,.62)}
.gx-cup-head{display:flex;gap:18px;align-items:flex-start}.gx-cup-head>div{flex:1}.gx-cup-eyebrow{font-size:9px;font-weight:800;letter-spacing:.24em;color:#70efff}
.gx-cup-head h2{margin:3px 0 2px;font-size:30px;letter-spacing:.02em}.gx-cup-head p{margin:0;color:var(--gx-ink-faint);font-size:12px;line-height:1.45}
.gx-cup-back{color:var(--gx-ink-soft);background:rgba(11,31,42,.8);border:1px solid rgba(112,239,255,.25);border-radius:8px;padding:8px 11px;cursor:pointer}
.gx-cup-tally{display:flex;gap:10px}.gx-cup-tally>div{min-width:110px;padding:9px 12px;border-radius:9px;background:rgba(56,176,179,.09);border:1px solid rgba(112,239,255,.14)}
.gx-cup-tally strong,.gx-cup-tally span{display:block}.gx-cup-tally strong{font-size:18px;color:#86f3de}.gx-cup-tally span{font-size:8px;letter-spacing:.16em;color:var(--gx-ink-faint)}
.gx-cup-list{display:flex;flex-direction:column;gap:6px;overflow:auto;padding-right:4px}.gx-cup-round{display:grid;grid-template-columns:42px 1fr auto;gap:12px;align-items:center;text-align:left;
  padding:10px 12px;color:inherit;background:rgba(17,43,55,.72);border:1px solid rgba(112,239,255,.13);border-radius:10px;cursor:pointer}
.gx-cup-round:hover:not(:disabled){background:rgba(26,61,73,.92);border-color:rgba(112,239,255,.42)}.gx-cup-round:disabled{opacity:.42;cursor:not-allowed}
.gx-cup-number{font:800 18px/1 var(--gx-font);color:#70efff}.gx-cup-copy{display:flex;flex-direction:column;gap:2px;min-width:0}.gx-cup-copy strong{font-size:13px}.gx-cup-copy small{color:var(--gx-ink-faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gx-cup-result{font-size:10px;font-weight:800;letter-spacing:.08em;color:#86f3de}.gx-cup-round--error{border-color:#f95f4c}.gx-cup-round--error .gx-cup-result{color:#ff8d7f}
.gx-cup-continue{padding:12px;border:0;border-radius:10px;cursor:pointer;color:#031216;font:800 13px var(--gx-font);letter-spacing:.06em;background:linear-gradient(180deg,#8af5d7,#48c7c4);box-shadow:0 8px 26px rgba(72,199,196,.22)}
@media(max-width:640px){.gx-cup{padding:10px}.gx-cup-card{padding:15px;max-height:96vh}.gx-cup-head h2{font-size:24px}.gx-cup-round{grid-template-columns:34px 1fr}.gx-cup-result{grid-column:2}.gx-cup-copy small{white-space:normal}}
`;
  document.head.append(style);
}
