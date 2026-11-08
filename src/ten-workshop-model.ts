/** Pure arithmetic state. Themes and geometry belong exclusively to presentation. */
export type Group = 'A' | 'B';
export interface MathToken { readonly id: number; readonly group: Group }
export type PracticeOperation = 'complement' | 'subtract' | 'add20' | 'subtract20';
export interface PracticeProgress {
  readonly index: number;
  readonly solved: readonly number[];
  readonly status: 'unanswered' | 'invalid' | 'incorrect' | 'correct';
  readonly hintVisible: boolean;
}
export interface MathLabState {
  readonly version: 3;
  readonly tokens: readonly MathToken[];
  readonly history: readonly (readonly Group[])[];
  readonly discovered: readonly number[];
  readonly practice: {
    readonly operation: PracticeOperation;
    readonly complement: PracticeProgress;
    readonly subtract: PracticeProgress;
    readonly family: number;
    readonly add20: readonly PracticeProgress[];
    readonly subtract20: readonly PracticeProgress[];
  };
}
const newProgress = (): PracticeProgress => ({ index: 0, solved: [], status: 'unanswered', hintVisible: false });
export function getPracticeProgress(state: MathLabState): PracticeProgress {
  const p = state.practice;
  return p.operation === 'add20' || p.operation === 'subtract20' ? p[p.operation][p.family] : p[p.operation];
}
function updatePractice(state: MathLabState, progress: PracticeProgress): MathLabState {
  const p = state.practice;
  const value = p.operation === 'add20' || p.operation === 'subtract20'
    ? p[p.operation].map((item, i) => i === p.family ? progress : item) : progress;
  return { ...state, practice: { ...p, [p.operation]: value } };
}
export function setPracticeOperation(state: MathLabState, operation: PracticeOperation): MathLabState {
  if (!['complement', 'subtract', 'add20', 'subtract20'].includes(operation) || operation === state.practice.operation) return state;
  return { ...state, practice: { ...state.practice, operation } };
}
export function setPracticeFamily(state: MathLabState, family: number): MathLabState {
  if (!integer(family, 20) || state.practice.family === family) return state;
  return { ...state, practice: { ...state.practice, family } };
}
export function getPracticeLength(state: MathLabState): number {
  return state.practice.operation === 'add20' ? 21 - state.practice.family : state.practice.operation === 'subtract20' ? state.practice.family + 1 : 11;
}
const newFamilies = () => Array.from({ length: 21 }, newProgress);
export const PRACTICE_ORDER: readonly number[] = Object.freeze([4, 7, 2, 9, 5, 0, 8, 3, 10, 1, 6]);
export const ADDITION_PAIRS = Object.freeze(Array.from({ length: 11 }, (_, a) => Object.freeze({ a, b: 10 - a })));

export function createMathLabState(): MathLabState {
  return { version: 3, tokens: Array.from({ length: 10 }, (_, id) => ({ id, group: 'B' })),
    history: [], discovered: [0], practice: { operation: 'complement', complement: newProgress(), subtract: newProgress(), family: 10, add20: newFamilies(), subtract20: newFamilies() } };
}
export function getCounts(state: MathLabState): { a: number; b: number; total: number } {
  const a = state.tokens.filter(token => token.group === 'A').length;
  return { a, b: state.tokens.length - a, total: state.tokens.length };
}
export function moveToken(state: MathLabState, id: number, target: Group): MathLabState {
  if (target !== 'A' && target !== 'B') return state;
  const token = state.tokens.find(item => item.id === id);
  if (!token || token.group === target) return state;
  const tokens = state.tokens.map(item => item.id === id ? { ...item, group: target } : item);
  const a = tokens.filter(item => item.group === 'A').length;
  return { ...state, tokens, history: [...state.history.slice(-999), state.tokens.map(item => item.group)],
    discovered: state.discovered.includes(a) ? state.discovered : [...state.discovered, a] };
}
export function undoMove(state: MathLabState): MathLabState {
  const previous = state.history.at(-1);
  if (!previous) return state;
  return { ...state, tokens: state.tokens.map((token, index) => ({ ...token, group: previous[index] })),
    history: state.history.slice(0, -1) };
}
export function getPracticeQuestion(state: MathLabState): { id: number; operation: PracticeOperation; a: number; expected: number; total: number } | null {
  const progress = getPracticeProgress(state);
  if (state.practice.operation === 'add20' || state.practice.operation === 'subtract20') {
    const addition = state.practice.operation === 'add20';
    const total = addition ? state.practice.family + progress.index : state.practice.family;
    if (progress.index >= getPracticeLength(state)) return null;
    return { id: progress.index, operation: state.practice.operation, a: addition ? state.practice.family : progress.index,
      expected: addition ? total : total - progress.index, total };
  }
  const a = PRACTICE_ORDER[progress.index];
  return a === undefined ? null : { id: progress.index, operation: state.practice.operation, a, expected: 10 - a, total: 10 };
}
export function submitPracticeAnswer(state: MathLabState, raw: string): MathLabState {
  const question = getPracticeQuestion(state), progress = getPracticeProgress(state);
  if (!question || progress.status === 'correct') return state;
  // Bound before trimming; reject exponent notation, decimals, signs and partial parses.
  const valid = typeof raw === 'string' && raw.length <= 64 && /^(?:[0-9]|1[0-9]|20)$/.test(raw.trim()) && Number(raw.trim()) <= (state.practice.operation === 'add20' || state.practice.operation === 'subtract20' ? 20 : 10);
  const status = !valid ? 'invalid' : Number(raw.trim()) === question.expected ? 'correct' : 'incorrect';
  return updatePractice(state, { ...progress, status,
    solved: status === 'correct' ? [...progress.solved, question.id] : progress.solved });
}
export function nextPracticeQuestion(state: MathLabState): MathLabState {
  const progress = getPracticeProgress(state);
  if (progress.status !== 'correct') return state;
  return updatePractice(state, { ...progress, index: progress.index + 1, status: 'unanswered', hintVisible: false });
}
export function revealPracticeHint(state: MathLabState): MathLabState {
  const progress = getPracticeProgress(state);
  if (!getPracticeQuestion(state) || progress.hintVisible) return state;
  return updatePractice(state, { ...progress, hintVisible: true });
}
export function serializeMathLabState(state: MathLabState): string { return JSON.stringify(state); }

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, expected: string[]): boolean {
  return Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
}
function integer(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max;
}
function groups(value: unknown): value is Group[] {
  return Array.isArray(value) && value.length === 10 && value.every(item => item === 'A' || item === 'B');
}
function validProgress(p: unknown, length = 11): p is PracticeProgress {
  if (!record(p) || !keys(p, ['index', 'solved', 'status', 'hintVisible']) || !integer(p.index, length) ||
    typeof p.hintVisible !== 'boolean' || !['unanswered', 'invalid', 'incorrect', 'correct'].includes(p.status as string) || !Array.isArray(p.solved)) return false;
  const solvedCount = p.index + (p.status === 'correct' ? 1 : 0);
  if (solvedCount > length || p.solved.length !== solvedCount || !p.solved.every((id, index) => id === index)) return false;
  return p.index !== length || (p.status === 'unanswered' && !p.hintVisible);
}
/** Reject corrupted, future-version and presentation-contaminated saves rather than guessing. */
export function restoreMathLabState(json: string): MathLabState | null {
  try {
    if (typeof json !== 'string' || json.length > 100000) return null;
    const value: unknown = JSON.parse(json);
    if (!record(value) || !keys(value, ['version', 'tokens', 'history', 'discovered', 'practice']) || (value.version !== 1 && value.version !== 2 && value.version !== 3)) return null;
    if (!Array.isArray(value.tokens) || value.tokens.length !== 10 || !value.tokens.every((token: unknown, index: number) =>
      record(token) && keys(token, ['id', 'group']) && token.id === index && (token.group === 'A' || token.group === 'B'))) return null;
    if (!Array.isArray(value.history) || value.history.length > 1000 || !value.history.every(groups)) return null;
    if (!Array.isArray(value.discovered) || !value.discovered.length || !value.discovered.every(item => integer(item, 10)) ||
      new Set(value.discovered).size !== value.discovered.length || !value.discovered.includes(0)) return null;
    let practice: MathLabState['practice'];
    if (value.version === 1) {
      if (!validProgress(value.practice)) return null;
      practice = { operation: 'complement', complement: value.practice, subtract: newProgress(), family: 10, add20: newFamilies(), subtract20: newFamilies() };
    } else {
      const p = value.practice;
      const fields = value.version === 2 ? ['operation', 'complement', 'subtract'] : ['operation', 'complement', 'subtract', 'family', 'add20', 'subtract20'];
      if (!record(p) || !keys(p, fields) ||
        !(value.version === 2 ? ['complement', 'subtract'] : ['complement', 'subtract', 'add20', 'subtract20']).includes(p.operation as string) ||
        !validProgress(p.complement) || !validProgress(p.subtract)) return null;
      if (value.version === 3 && (!integer(p.family, 20) ||
        !Array.isArray(p.add20) || p.add20.length !== 21 || !p.add20.every((v, i) => validProgress(v, 21 - i)) ||
        !Array.isArray(p.subtract20) || p.subtract20.length !== 21 || !p.subtract20.every((v, i) => validProgress(v, i + 1)))) return null;
      practice = { operation: p.operation as PracticeOperation, complement: p.complement, subtract: p.subtract,
        family: value.version === 3 ? p.family as number : 10,
        add20: value.version === 3 ? p.add20 as PracticeProgress[] : newFamilies(),
        subtract20: value.version === 3 ? p.subtract20 as PracticeProgress[] : newFamilies() };
    }
    const state = { ...value, version: 3, practice } as unknown as MathLabState;
    if (!state.discovered.includes(getCounts(state).a)) return null;
    const snapshots = [...state.history, state.tokens.map(token => token.group)];
    if (snapshots.some(snapshot => !state.discovered.includes(snapshot.filter(group => group === 'A').length))) return null;
    if (snapshots.some((snapshot, index) => index > 0 && snapshot.filter((group, token) => group !== snapshots[index - 1][token]).length !== 1)) return null;
    return state;
  } catch { return null; }
}

/** Replay only the selected operation; preserve the other session and discovery work. */
export function resetPractice(state: MathLabState): MathLabState {
  return updatePractice(state, newProgress());
}
