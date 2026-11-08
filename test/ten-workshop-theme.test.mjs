import assert from 'node:assert/strict';
import test from 'node:test';
import { importBrowserModule } from './support/import-browser-module.mjs';
const { MATH_THEMES, readMathTheme } = await importBrowserModule(new URL('../src/ten-workshop-theme.ts', import.meta.url));
const { composeMathLab } = await importBrowserModule(new URL('../src/ten-workshop-scene.ts', import.meta.url));
const { createMathLabState, moveToken } = await importBrowserModule(new URL('../src/ten-workshop-model.ts', import.meta.url));
const picture = (overrides = {}) => ({ tokens: createMathLabState().tokens, practice: false, hint: false, a: 4,
  equation: '0+10=10', answer: '', reference: false, selected: null, shape: 'box', ...overrides });
const units = scene => scene.entities.filter(entity => entity.tags?.includes('math:unit'));
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }

test('theme parser accepts only bounded versioned appearance values', () => {
  for (const theme of MATH_THEMES) assert.deepEqual(readMathTheme(theme), theme);
  for (const value of [null, undefined, true, 2, 'summer', {}, []]) assert.equal(readMathTheme(value), null);
  const corruptions = [
    theme => { theme.schema = 'graphysx.theme/v2'; }, theme => { theme.id = '../evil'; },
    theme => { theme.id = 'https://evil.example/theme'; }, theme => { theme.label = ' '; },
    theme => { theme.label = 'a'.repeat(65); }, theme => { theme.season = 'autumn'; },
    theme => { theme.season = ['summer']; }, theme => { theme.roughness = NaN; },
    theme => { theme.roughness = 0; }, theme => { theme.roughness = 1.01; },
    theme => { theme.light = Infinity; }, theme => { theme.light = 0.49; },
    theme => { theme.light = 3.01; }, theme => { theme.light = '2'; },
    theme => { theme.palette = null; }, theme => { delete theme.palette.sky; },
    theme => { theme.palette.sky = 'url(https://evil.example/asset)'; },
    theme => { theme.palette.foliage = 'javascript:alert(1)'; },
    theme => { theme.palette.ground = '#fff'; }
  ];
  for (const corrupt of corruptions) { const theme = structuredClone(MATH_THEMES[0]); corrupt(theme); assert.equal(readMathTheme(theme), null, corrupt.toString()); }
});

test('theme whitelist strips URLs, code, physics and unknown properties without executing them', () => {
  const raw = structuredClone(MATH_THEMES[0]);
  Object.assign(raw, { url: 'https://evil.example/theme', script: 'throw new Error("executed")', physics: { mass: 100 }, tokens: [99] });
  raw.palette.texture = 'javascript:alert(1)';
  const clean = readMathTheme(freeze(raw));
  assert.deepEqual(clean, MATH_THEMES[0]);
  assert.equal(JSON.stringify(clean).includes('evil.example'), false);
  clean.palette.sky = '#112233';
  assert.notEqual(clean.palette.sky, raw.palette.sky);
});

test('season changes preserve pine identity and geometry while changing dress and light', () => {
  const scenes = MATH_THEMES.map(theme => composeMathLab(theme, picture()));
  const pines = scene => scene.entities.filter(entity => entity.id.startsWith('pine-'));
  const geometry = entity => ({ id: entity.id, type: entity.type, transform: entity.transform });
  assert.deepEqual(pines(scenes[0]).map(geometry), pines(scenes[1]).map(geometry));
  assert.equal(pines(scenes[0]).length, 28);
  const snow = scene => pines(scene).filter(entity => entity.tags?.includes('theme:snow'));
  assert.equal(snow(scenes[0]).length, 12);
  assert.ok(snow(scenes[0]).every(entity => entity.visible === false));
  assert.ok(snow(scenes[1]).every(entity => entity.visible === true));
  assert.notDeepEqual(pines(scenes[0]).find(entity => entity.id === 'pine-0-tier-0').material,
    pines(scenes[1]).find(entity => entity.id === 'pine-0-tier-0').material);
  assert.notDeepEqual(scenes[0].environment.background, scenes[1].environment.background);
  assert.notEqual(scenes[0].entities.find(entity => entity.id === 'lab-sun').intensity,
    scenes[1].entities.find(entity => entity.id === 'lab-sun').intensity);
});

test('discovery retains ten stable units for every shape without mutating math or theme input', () => {
  const state = freeze(moveToken(moveToken(createMathLabState(), 2, 'A'), 7, 'A'));
  const theme = freeze(structuredClone(MATH_THEMES[0]));
  const before = JSON.stringify({ state, theme });
  for (const shape of ['box', 'sphere', 'cylinder']) {
    const p = freeze(picture({ tokens: state.tokens, shape, selected: 2 }));
    const scene = composeMathLab(theme, p);
    assert.equal(units(scene).length, 10);
    assert.deepEqual(units(scene).map(entity => entity.id).sort(), Array.from({ length: 10 }, (_, id) => `lab-token-${id}`).sort());
    assert.ok(units(scene).every(entity => entity.type === shape));
    assert.equal(units(scene).filter(entity => entity.tags.includes('math:group:A')).length, 2);
    assert.equal(scene.entities.filter(entity => entity.id === 'lab-selection').length, 1);
    assert.ok(scene.entities.every(entity => !entity.physics && !entity.rigidBody && !entity.behaviors));
    assert.equal(new Set(scene.entities.map(entity => entity.id)).size, scene.entities.length);
  }
  assert.equal(JSON.stringify({ state, theme }), before);
});

test('practice hides missing group until optional hint, including zero and ten boundaries', () => {
  for (let a = 0; a <= 10; a++) {
    const hidden = composeMathLab(MATH_THEMES[0], picture({ practice: true, a, equation: `${a}+?=10` }));
    assert.equal(units(hidden).length, a);
    assert.equal(units(hidden).filter(entity => entity.tags.includes('math:group:B')).length, 0);
    const hinted = composeMathLab(MATH_THEMES[0], picture({ practice: true, a, hint: true, equation: `${a}+?=10` }));
    assert.equal(units(hinted).length, 10);
    assert.equal(units(hinted).filter(entity => entity.tags.includes('math:group:B')).length, 10 - a);
    assert.equal(new Set(units(hinted).map(entity => entity.id)).size, 10);
  }
});

test('reference scene includes the three primitives without arithmetic units', () => {
  const scene = composeMathLab(MATH_THEMES[0], picture({ reference: true }));
  assert.deepEqual(scene.entities.filter(entity => entity.tags?.includes('theme:sample')).map(entity => entity.type), ['box', 'sphere', 'cylinder']);
  assert.equal(units(scene).length, 0);
});

test('scene clones share no mutable output or input state', () => {
  const theme = structuredClone(MATH_THEMES[0]);
  const input = picture();
  const first = composeMathLab(theme, input), second = composeMathLab(theme, input);
  const before = JSON.stringify({ second, theme, input });
  first.entities[0].transform.position[0] = 900;
  first.entities[0].material.color = '#000000';
  first.entities[0].tags.push('changed');
  first.environment.physics.gravity[1] = 0;
  first.entities.pop();
  assert.equal(JSON.stringify({ second, theme, input }), before);
});

test('every composed variant passes canonical stored-scene validation', async () => {
  const { validateStoredSceneDefinition } = await import('../server/scene-commands.mjs');
  let checked = 0;
  for (const theme of MATH_THEMES) for (const shape of ['box', 'sphere', 'cylinder']) {
    for (const reference of [false, true]) {
      const scene = composeMathLab(theme, picture({ shape, reference, selected: reference ? null : 0 }));
      assert.doesNotThrow(() => validateStoredSceneDefinition(JSON.parse(JSON.stringify(scene))), `${theme.id}/${shape}/reference:${reference}`);
      checked++;
    }
    for (const operation of ["complement", "subtract"]) for (let a = 0; a <= 10; a++) for (const hint of [false, true]) {
      const scene = composeMathLab(theme, picture({ shape, operation, practice: true, hint, a, equation: `${a}+?=10`, answer: String(10-a) }));
      assert.doesNotThrow(() => validateStoredSceneDefinition(JSON.parse(JSON.stringify(scene))), `${theme.id}/${shape}/a:${a}/hint:${hint}`);
      checked++;
    }
  }
  assert.equal(checked, 276);
});

test('subtraction marks the removed units without revealing remainder before hint', () => {
  for(const shape of ['box','sphere','cylinder']) for(let a=0;a<=10;a++) {
    const hidden=composeMathLab(MATH_THEMES[0],picture({shape,practice:true,operation:'subtract',a,equation: '10-'+a+'=?'}));
    assert.equal(units(hidden).length,a);
    assert.equal(hidden.entities.filter(e=>e.tags?.includes('math:removed')).length,a);
    assert.equal(units(hidden).filter(e=>e.tags.includes('math:group:B')).length,0);
    const hint=composeMathLab(MATH_THEMES[0],picture({shape,practice:true,operation:'subtract',a,hint:true,equation:'10-'+a+'=?'}));
    assert.equal(units(hint).length,10);
    assert.equal(units(hint).filter(e=>e.tags.includes('math:group:B')).length,10-a);
  }
});


test('0–20 visual hints conserve exact quantities, fit table, and mark every removed unit', () => {
  for (const operation of ['add20', 'subtract20']) for (let total=0;total<=20;total++) for (let a=0;a<=total;a++) {
    const scene=composeMathLab(MATH_THEMES[0], picture({practice:true,operation,total,a,hint:true}));
    const objects=units(scene);
    assert.equal(objects.length,total);
    assert.equal(objects.filter(e=>e.tags.includes('math:group:A')).length,a);
    assert.equal(objects.filter(e=>e.tags.includes('math:group:B')).length,total-a);
    assert.equal(scene.entities.filter(e=>e.tags?.includes('math:removed')).length,operation==='subtract20'?a:0);
    assert.equal(new Set(objects.map(e=>e.id)).size,total);
    assert.ok(objects.every(e=>Math.abs(e.transform.position[0])<3 && e.transform.position[2]>=-1 && e.transform.position[2]<1));
  }
});
