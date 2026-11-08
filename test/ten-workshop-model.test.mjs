import assert from 'node:assert/strict';
import test from 'node:test';
import { importBrowserModule } from './support/import-browser-module.mjs';
const model = await importBrowserModule(new URL('../src/ten-workshop-model.ts', import.meta.url));
const { createMathLabState, getCounts, moveToken, undoMove, getPracticeQuestion, submitPracticeAnswer,
  nextPracticeQuestion, revealPracticeHint, serializeMathLabState, restoreMathLabState, ADDITION_PAIRS } = model;
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
test('eleven ordered pairs include both explicit zero terms', () => {
  assert.equal(ADDITION_PAIRS.length, 11);
  assert.deepEqual(ADDITION_PAIRS[0], { a: 0, b: 10 });
  assert.deepEqual(ADDITION_PAIRS[10], { a: 10, b: 0 });
  assert.ok(ADDITION_PAIRS.every(pair => pair.a + pair.b === 10));
});
test('moves are immutable, conserve all ten stable units and discover all pairs', () => {
  let state = freeze(createMathLabState());
  assert.deepEqual(getCounts(state), { a: 0, b: 10, total: 10 });
  for (let id = 0; id < 10; id++) {
    const before = state;
    const snapshot = JSON.stringify(before);
    state = freeze(moveToken(before, id, 'A'));
    assert.equal(JSON.stringify(before), snapshot);
    assert.deepEqual(state.tokens.map(token => token.id), [0,1,2,3,4,5,6,7,8,9]);
    assert.deepEqual(getCounts(state), { a: id + 1, b: 9 - id, total: 10 });
    assert.equal(moveToken(state, id, 'A'), state);
    assert.equal(moveToken(state, 999, 'B'), state);
    assert.equal(moveToken(state, id, 'C'), state);
  }
  assert.deepEqual(state.discovered, Array.from({ length: 11 }, (_, i) => i));
  assert.equal(restoreMathLabState(serializeMathLabState(state)).tokens.length, 10);
});
test('undo restores assignment but keeps learned discoveries without mutating snapshots', () => {
  const start = freeze(createMathLabState());
  const moved = freeze(moveToken(moveToken(start, 3, 'A'), 8, 'A'));
  const undone = undoMove(moved);
  assert.equal(getCounts(moved).a, 2);
  assert.equal(getCounts(undone).a, 1);
  assert.equal(undone.tokens[3].group, 'A');
  assert.equal(undone.tokens[8].group, 'B');
  assert.deepEqual(undoMove(undone).tokens, start.tokens);
  assert.equal(undoMove(start), start);
  assert.deepEqual(undone.discovered, [0, 1, 2]);
  assert.ok(restoreMathLabState(serializeMathLabState(undone)));
});
test('practice validates empty and invalid input, and prevents skipping or duplicate successes', () => {
  const initial = freeze(createMathLabState());
  assert.equal(nextPracticeQuestion(initial), initial);
  for (const input of ['', ' ', '-1', '11', '1.0', '1e1', '2junk', 'NaN', '01', null]) {
    const result = submitPracticeAnswer(initial, input);
    assert.equal(result.practice.complement.status, 'invalid', String(input));
    assert.equal(result.practice.complement.solved.length, 0);
  }
  assert.equal(submitPracticeAnswer(initial, '10').practice.complement.status, 'incorrect');
  const answer = String(getPracticeQuestion(initial).expected);
  const solved = freeze(submitPracticeAnswer(initial, answer));
  assert.equal(submitPracticeAnswer(solved, answer), solved);
  assert.equal(submitPracticeAnswer(solved, 'wrong'), solved);
  assert.deepEqual(solved.practice.complement.solved, [0]);
  const next = nextPracticeQuestion(solved);
  assert.equal(next.practice.complement.index, 1);
  assert.equal(nextPracticeQuestion(next), next);
  assert.equal(initial.practice.complement.status, 'unanswered');
});
test('practice covers every missing term including zero, with optional hint and terminal state', () => {
  let state = createMathLabState();
  const answers = [];
  for (let i = 0; i < 11; i++) {
    const question = getPracticeQuestion(state);
    assert.equal(question.id, i);
    answers.push(question.expected);
    const hinted = revealPracticeHint(freeze(state));
    assert.equal(hinted.practice.complement.hintVisible, true);
    assert.equal(state.practice.complement.hintVisible, false);
    state = submitPracticeAnswer(hinted, String(question.expected));
    assert.equal(state.practice.complement.status, 'correct');
    assert.ok(restoreMathLabState(serializeMathLabState(state)));
    state = nextPracticeQuestion(state);
    assert.equal(state.practice.complement.hintVisible, false);
  }
  assert.equal(new Set(answers).size, 11);
  assert.ok(answers.includes(0));
  assert.notEqual(answers[0], 10);
  assert.equal(getPracticeQuestion(state), null);
  assert.equal(submitPracticeAnswer(state, '0'), state);
  assert.equal(nextPracticeQuestion(state), state);
  assert.equal(revealPracticeHint(state), state);
  assert.deepEqual(restoreMathLabState(serializeMathLabState(state)), state);
});
test('strict JSON recovery rejects damaged, impossible and presentation-contaminated state', () => {
  const base = createMathLabState();
  assert.deepEqual(restoreMathLabState(serializeMathLabState(base)), base);
  for (const input of ['', '{', 'null', '[]', '{}']) assert.equal(restoreMathLabState(input), null);
  const corruptions = [
    state => { state.version = 4; }, state => { state.theme = 'forest'; },
    state => { state.tokens.pop(); }, state => { state.tokens[1].id = 0; },
    state => { state.tokens[0].group = 'C'; }, state => { state.tokens[0].shape = 'box'; },
    state => { state.tokens[0].group = 'A'; }, state => { state.discovered = [0, 0]; },
    state => { state.discovered = [0, 11]; }, state => { state.practice.complement.index = -1; },
    state => { state.practice.complement.solved = [0, 0]; }, state => { state.practice.complement.status = 'correct'; },
    state => { state.practice.complement.hintVisible = 1; }, state => { state.practice.extra = true; },
    state => { state.history = [Array(10).fill('A')]; state.discovered = [0, 10]; },
    state => { state.practice.complement.index = 11; state.practice.complement.solved = Array.from({length:11}, (_,i)=>i); state.practice.complement.hintVisible = true; }
  ];
  for (const corrupt of corruptions) {
    const state = structuredClone(base); corrupt(state);
    assert.equal(restoreMathLabState(JSON.stringify(state)), null, corrupt.toString());
  }
});

test('resetPractice starts a fresh session and preserves all discovery work immutably', () => {
  const discovery = moveToken(moveToken(createMathLabState(), 2, 'A'), 8, 'A');
  let state = discovery;
  for (let i = 0; i < 11; i++) {
    state = nextPracticeQuestion(submitPracticeAnswer(revealPracticeHint(state), String(getPracticeQuestion(state).expected)));
  }
  const before = JSON.stringify(state);
  freeze(state);
  const reset = model.resetPractice(state);
  assert.notEqual(reset, state);
  assert.deepEqual(reset.practice, createMathLabState().practice);
  assert.equal(reset.tokens, state.tokens);
  assert.equal(reset.history, state.history);
  assert.equal(reset.discovered, state.discovered);
  assert.equal(JSON.stringify(state), before);
  assert.deepEqual(restoreMathLabState(serializeMathLabState(reset)), reset);
  assert.equal(getPracticeQuestion(reset).id, 0);
  const answered = submitPracticeAnswer(reset, String(getPracticeQuestion(reset).expected));
  assert.deepEqual(answered.practice.complement.solved, [0]);
  assert.equal(getCounts(undoMove(reset)).a, 1);
  assert.deepEqual(model.resetPractice(revealPracticeHint(discovery)).practice, createMathLabState().practice);
});

test('operations have independent immutable progress and restore the selected session', () => {
  const { setPracticeOperation, getPracticeProgress } = model;
  let state = moveToken(createMathLabState(), 4, 'A');
  state = revealPracticeHint(nextPracticeQuestion(submitPracticeAnswer(state, '6')));
  const complement = state.practice.complement;
  const previous = freeze(state);
  state = setPracticeOperation(state, 'subtract');
  assert.equal(state.version, 3);
  assert.deepEqual(getPracticeQuestion(state), { id: 0, operation: 'subtract', a: 4, expected: 6, total: 10 });
  assert.equal(state.practice.complement, complement);
  assert.equal(state.tokens, previous.tokens);
  assert.equal(state.history, previous.history);
  assert.equal(state.discovered, previous.discovered);
  assert.equal(previous.practice.operation, 'complement');
  assert.equal(setPracticeOperation(state, 'subtract'), state);
  assert.equal(setPracticeOperation(state, 'divide'), state);
  state = submitPracticeAnswer(state, '6');
  const subtract = state.practice.subtract;
  assert.equal(getPracticeProgress(state), subtract);
  state = setPracticeOperation(state, 'complement');
  assert.equal(getPracticeProgress(state), complement);
  assert.equal(getPracticeQuestion(state).id, 1);
  assert.equal(state.practice.subtract, subtract);
  assert.deepEqual(restoreMathLabState(serializeMathLabState(state)), state);
  state = model.resetPractice(freeze(state));
  assert.equal(state.practice.subtract, subtract);
  assert.deepEqual(state.practice.complement, createMathLabState().practice.complement);
});

test('both operations cover all eleven results, bounded parsing, double validation, completion and replay', () => {
  for (const operation of ['complement', 'subtract']) {
    let state = model.setPracticeOperation(createMathLabState(), operation);
    const inactive = operation === 'complement' ? 'subtract' : 'complement';
    const other = state.practice[inactive];
    const results = [];
    for (let i = 0; i < 11; i++) {
      const q = getPracticeQuestion(state);
      assert.equal(q.operation, operation);
      assert.equal(q.expected, 10 - q.a);
      results.push(q.expected);
      for (const raw of ['', ' ', '0x0', '1e1', '-0', '2.0', '11', '  '.repeat(100), null, 0]) {
        const invalid = submitPracticeAnswer(freeze(state), raw);
        assert.equal(model.getPracticeProgress(invalid).status, 'invalid');
        assert.equal(model.getPracticeProgress(invalid).solved.length, i);
      }
      const wrong = submitPracticeAnswer(state, String((q.expected + 1) % 11));
      assert.equal(model.getPracticeProgress(wrong).status, 'incorrect');
      state = submitPracticeAnswer(revealPracticeHint(state), ` ${q.expected} `);
      assert.equal(model.getPracticeProgress(state).status, 'correct');
      assert.equal(submitPracticeAnswer(state, String(q.expected)), state);
      assert.equal(submitPracticeAnswer(state, ''), state);
      assert.deepEqual(restoreMathLabState(serializeMathLabState(state)), state);
      state = nextPracticeQuestion(state);
      assert.equal(nextPracticeQuestion(state), state);
      assert.equal(state.practice[inactive], other);
    }
    assert.deepEqual([...results].sort((a,b)=>a-b), Array.from({length:11},(_,i)=>i));
    assert.equal(getPracticeQuestion(state), null);
    assert.equal(model.getPracticeProgress(state).solved.length, 11);
    assert.equal(revealPracticeHint(state), state);
    assert.equal(submitPracticeAnswer(state, '0'), state);
    assert.deepEqual(restoreMathLabState(serializeMathLabState(state)), state);
    const replay = model.resetPractice(freeze(state));
    assert.equal(replay.practice.operation, operation);
    assert.equal(model.getPracticeProgress(replay).solved.length, 0);
    assert.equal(getPracticeQuestion(replay).id, 0);
    assert.equal(replay.practice[inactive], other);
  }
});

test('strict v1 migration preserves every complement stage and discovery without inventing subtraction progress', () => {
  let state = moveToken(createMathLabState(), 7, 'A');
  const check = current => {
    const legacy = { ...current, version: 1, practice: current.practice.complement };
    const restored = restoreMathLabState(JSON.stringify(legacy));
    assert.ok(restored);
    assert.equal(restored.version, 3);
    assert.equal(restored.practice.operation, 'complement');
    assert.deepEqual(restored.practice.complement, legacy.practice);
    assert.deepEqual(restored.practice.subtract, createMathLabState().practice.subtract);
    assert.deepEqual(restored.tokens, legacy.tokens);
    assert.deepEqual(restored.history, legacy.history);
    assert.deepEqual(restored.discovered, legacy.discovered);
    assert.deepEqual(restoreMathLabState(serializeMathLabState(restored)), restored);
  };
  check(state);
  check(submitPracticeAnswer(state, ''));
  check(submitPracticeAnswer(state, '10'));
  for (let i=0;i<11;i++) {
    state = revealPracticeHint(state); check(state);
    state = submitPracticeAnswer(state, String(getPracticeQuestion(state).expected)); check(state);
    state = nextPracticeQuestion(state); check(state);
  }
});

test('recovery rejects malformed inactive sessions, hybrid versions, oversized saves and poisoned legacy progress', () => {
  const base = createMathLabState();
  const invalid = [
    state => { state.practice.operation = 'divide'; },
    state => { state.practice.operation = ['complement']; },
    state => { delete state.practice.subtract; },
    state => { state.practice.subtract.status = 'correct'; },
    state => { state.practice.subtract.index = 0.5; },
    state => { state.practice.subtract.solved = [0]; },
    state => { state.practice.subtract.hintVisible = 'false'; },
    state => { state.practice.subtract.extra = true; },
    state => { state.practice.complement = null; },
    state => { state.version = 1; },
    state => { state.practice = state.practice.complement; }
  ];
  for (const change of invalid) {
    const state = structuredClone(base); change(state);
    assert.equal(restoreMathLabState(JSON.stringify(state)), null, change.toString());
  }
  const legacy = { ...base, version: 1, practice: { ...base.practice.complement, status: 'correct' } };
  assert.equal(restoreMathLabState(JSON.stringify(legacy)), null);
  assert.equal(restoreMathLabState(' '.repeat(100001)), null);
  assert.equal(restoreMathLabState(null), null);
});


test('0–20 curriculum covers every bounded pair once with independent short selectable series', () => {
  for (const operation of ['add20', 'subtract20']) {
    let state = model.setPracticeOperation(createMathLabState(), operation);
    const pairs = new Set();
    for (let family = 0; family <= 20; family++) {
      state = model.setPracticeFamily(state, family);
      const length = operation === 'add20' ? 21 - family : family + 1;
      assert.equal(model.getPracticeLength(state), length);
      for (let index = 0; index < length; index++) {
        const q = getPracticeQuestion(state);
        const first = operation === 'add20' ? q.a : q.total;
        const second = operation === 'add20' ? q.total - q.a : q.a;
        assert.equal(first, family);
        assert.equal(second, index);
        assert.equal(q.expected, operation === 'add20' ? first + second : first - second);
        assert.ok(q.expected >= 0 && q.expected <= 20);
        pairs.add(`${first},${second}`);
        assert.equal(nextPracticeQuestion(state), state);
        for (const raw of ['', '-1', '21', '1e1', '01', '1.0', null]) {
          assert.equal(model.getPracticeProgress(submitPracticeAnswer(state, raw)).status, 'invalid');
        }
        const wrong = submitPracticeAnswer(state, String((q.expected + 1) % 21));
        assert.equal(model.getPracticeProgress(wrong).status, 'incorrect');
        const before = JSON.stringify(state);
        freeze(state);
        const hinted = revealPracticeHint(state);
        const solved = submitPracticeAnswer(hinted, String(q.expected));
        assert.equal(JSON.stringify(state), before);
        assert.equal(model.getPracticeProgress(solved).status, 'correct');
        assert.equal(submitPracticeAnswer(solved, String(q.expected)), solved);
        assert.deepEqual(restoreMathLabState(serializeMathLabState(solved)), solved);
        state = nextPracticeQuestion(solved);
      }
      assert.equal(getPracticeQuestion(state), null);
      assert.equal(submitPracticeAnswer(state, '0'), state);
      assert.equal(model.getPracticeProgress(state).solved.length, length);
    }
    assert.equal(pairs.size, 231);
    assert.equal(state.practice[operation].reduce((n, p) => n + p.solved.length, 0), 231);
    assert.equal(state.practice.complement.solved.length, 0);
    assert.equal(state.practice.subtract.solved.length, 0);
    const other = operation === 'add20' ? 'subtract20' : 'add20';
    assert.equal(state.practice[other].reduce((n, p) => n + p.solved.length, 0), 0);
    const replay = model.resetPractice(model.setPracticeFamily(state, 7));
    assert.equal(replay.practice[operation][7].solved.length, 0);
    assert.deepEqual(replay.practice[operation][6], state.practice[operation][6]);
    assert.deepEqual(restoreMathLabState(serializeMathLabState(replay)), replay);
  }
});

test('v2 migrates without losing prior answers and v3 rejects corrupt inactive family progress', () => {
  let state = nextPracticeQuestion(submitPracticeAnswer(createMathLabState(), '6'));
  state = model.setPracticeOperation(state, 'subtract');
  state = submitPracticeAnswer(state, '6');
  const v2 = { ...state, version: 2, practice: { operation: 'subtract', complement: state.practice.complement, subtract: state.practice.subtract } };
  assert.deepEqual(restoreMathLabState(JSON.stringify(v2)), state);
  for (const corrupt of [
    s => { s.practice.family = 21; }, s => { s.practice.family = 0.5; },
    s => { s.practice.add20.pop(); }, s => { s.practice.subtract20 = null; },
    s => { s.practice.add20[20].index = 2; },
    s => { s.practice.subtract20[0].solved = [0]; },
    s => { s.practice.add20[4].extra = true; }
  ]) {
    const bad = structuredClone(state); corrupt(bad);
    assert.equal(restoreMathLabState(JSON.stringify(bad)), null);
  }
  for (const family of [-1, 21, 1.2, NaN, '10']) assert.equal(model.setPracticeFamily(state, family), state);
});
