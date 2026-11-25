import test from 'node:test';
import assert from 'node:assert/strict';
import { readPng } from './pngDecode.js';
import { readTableLayout, readBatteryLayout, classifyPicture } from '../src/modules/batteries/batteriesVision.js';
import { solveBatteries, parseCondition, splitWords, matchModuleName, oddVolts } from '../src/modules/batteries/batteriesSolver.js';
import { inkMask } from '../src/modules/batteries/batteriesOCR.js';

const TABLE = readPng(new URL('./fixtures/batteries_table.png', import.meta.url));
const BOMB = readPng(new URL('./fixtures/batteries_bomb.png', import.meta.url));
const cell = (c) => (!c ? '.' : c.kind === 'digit' ? String(c.digit) : c.kind === 'any' ? 'ANY' : `${c.kind}:${c.pair}`);

test('batteries: the table picture reads every badge, pair colour and row icon', () => {
  const t = readTableLayout(TABLE);
  assert.ok(t.ok);
  assert.equal(t.columns.length, 7);
  assert.deepEqual(t.rows.map(r => r.cells.map(cell).join(' ')), [
    'first:blue 4 first:orange then:blue 1 then:orange .',
    '4 ANY ANY . . . .',
    '. 1 5 . 0 . ANY',
    'then:orange 0 first:blue . first:orange 4 then:blue',
    '. 2 . . ANY . .',
    '. first:orange . . then:orange . 3',
    '. then:orange . . . ANY first:orange',
    '0 then:orange then:blue first:blue . first:orange .',
    'ANY . 2 . . . .',
    '5 . ANY . . ANY .'
  ]);
  assert.deepEqual(t.rows.map(r => (r.icon ? r.icon.color : null)), [null, 'orange', 'yellow', null, null, 'blue', 'blue', 'red', null, 'blue']);
});

test('batteries: the bomb picture is orange + blue cylinders (blue bigger) and a 9V', () => {
  const b = readBatteryLayout(BOMB);
  assert.deepEqual(b.batteries.map(x => [x.color, x.round]), [['orange', true], ['blue', true], ['purple', false]]);
  assert.ok(b.batteries[1].size > b.batteries[0].size);
  assert.equal(classifyPicture(TABLE).type, 'table');
  assert.equal(classifyPicture(BOMB).type, 'batteries');
});

test('batteries: every true row applies — Symbols (3 on timer) → Search → Rubik\'s Cube', () => {
  const t = readTableLayout(TABLE);
  const texts = ['Under 9V total', 'Biggest round:', 'Has', 'Under 12V total', 'Exactly 2 batteries', 'Has', 'Biggest round:', 'Biggest round:', 'Under 4.5V total', 'No'];
  const table = { modules: ["Who's On First", 'Search', 'Logic', 'Chess', "Rubik's Cube", 'Diagram', 'Symbols'], rows: t.rows.map((r, i) => ({ text: texts[i], icon: r.icon && r.icon.color, cells: r.cells })) };
  const bats = readBatteryLayout(BOMB).batteries.map(x => ({ color: x.color, volts: x.round ? 1.5 : 9, round: x.round, size: x.size }));
  const s = solveBatteries(table, bats);
  assert.deepEqual(s.rows.map(r => r.truth), [false, false, false, false, false, true, true, false, false, false]);
  assert.equal(s.copy, "Symbols (3 on timer) → Search → Rubik's Cube · any time: Who's On First, Logic, Chess, Diagram");
  assert.equal(s.cycle, null);
});

test('batteries: condition words', () => {
  assert.deepEqual(parseCondition('Under 4.5V total'), { type: 'volts', op: '<', v: 4.5 });
  assert.deepEqual(parseCondition('Exactly 2 batteries'), { type: 'count', op: '=', n: 2, color: null });
  assert.deepEqual(parseCondition('No', 'blue'), { type: 'count', op: '=', n: 0, color: 'blue' });
  assert.deepEqual(parseCondition('Has', 'yellow'), { type: 'count', op: '>=', n: 1, color: 'yellow' });
  assert.deepEqual(parseCondition('Biggest round:', 'red'), { type: 'biggest', color: 'red', round: true });
});

test('batteries: OCR text without spaces still parses ("Under9Vtotal")', () => {
  assert.equal(splitWords('Under9Vtotal'), 'under 9v total');
  assert.equal(splitWords('Biggestround:'), 'biggest round');
  assert.equal(splitWords('Atleast3batteries'), 'at least 3 batteries');
  assert.deepEqual(parseCondition('Under4.5Vtotal'), { type: 'volts', op: '<', v: 4.5 });
  assert.deepEqual(parseCondition('Exactly2batteries'), { type: 'count', op: '=', n: 2, color: null });
});

test('batteries: header text → module names', () => {
  assert.equal(matchModuleName("Who's on First").name, "Who's On First");
  assert.equal(matchModuleName("Rubik's Cube").name, "Rubik's Cube");
  assert.equal(matchModuleName('Svmbols').name, 'Symbols');
});

test('batteries: timer windows on a countdown from 8:00', async () => {
  const { timerWindows, describeWindows, showsDigits } = await import('../src/modules/batteries/batteriesSolver.js');
  const three = timerWindows([3]);
  assert.ok(three.some(w => w.start === 3 * 60 + 59 && w.end === 3 * 60 && w.len === 60)); // 3:59 → 3:00
  assert.ok(three.some(w => w.start === 7 * 60 + 39 && w.len === 10)); // 7:39 → 7:30
  assert.equal(three[0].start, 7 * 60 + 53); // the first 3 after 8:00 is 7:53 (1 s), then 7:39 → 7:30
  // seconds stop at 59: no x:6x, so a 6 shows in 6:xx and in the last digit only
  assert.ok(!timerWindows([6]).some(w => w.len === 10));
  assert.deepEqual(timerWindows([9]).map(w => w.len), Array(48).fill(1));
  assert.deepEqual(timerWindows([8]).slice(0, 2).map(w => w.start), [480, 478]); // 8:00, then 7:58
  // two digits at once: 5:3x and 3:5x are the 10-second chances
  const both = timerWindows([3, 5]).filter(w => w.len === 10).map(w => w.start);
  assert.deepEqual(both, [5 * 60 + 39, 3 * 60 + 59]);
  assert.ok(showsDigits(3 * 60 + 5, [3, 5]) && !showsDigits(4 * 60 + 5, [3, 5]));
  assert.match(describeWindows([6]), /^6:59→6:00 \(a whole minute\) · x:x6 every 10 s/);
  assert.match(describeWindows([3, 5]), /5:39→5:30 \(10 s\) · 3:59→3:50 \(10 s\)/);
});

test('batteries: a 20-module table with arrows across most of a row (23 Nov) — all 10 rows, every badge', () => {
  const T2 = readPng(new URL('./fixtures/batteries_table2.png', import.meta.url));
  const B2 = readPng(new URL('./fixtures/batteries_bomb2.png', import.meta.url));
  const t = readTableLayout(T2);
  assert.ok(t.ok);
  assert.equal(t.columns.length, 20);
  // the long orange arrows in rows 2 and 8 used to pass for grid lines and drop those rows
  assert.equal(t.rows.length, 10);
  const row = i => t.rows[i].cells.map(cell).filter(x => x !== '.').join(' ');
  assert.equal(row(1), 'first:orange 0 ANY then:orange 5');
  // the blue arrow out of Switches' FIRST runs into its badge: still FIRST, not ANY
  assert.equal(row(4), 'then:orange 3 then:blue first:blue 4 first:orange');
  assert.equal(row(7), 'then:orange ANY first:orange');
  assert.deepEqual(t.rows.map(r => (r.icon ? r.icon.color : null)), [null, null, 'red', 'yellow', 'purple', null, 'purple', 'blue', null, 'red']);
  const modules = ["Who's On First", 'Password', 'Logic', 'Circuit', 'Search', 'Chess', 'Morse Code', 'Switches', 'Balance', "Rubik's Cube",
    'Wire Sequences', 'Simon Says', 'Memory', 'Symbols', 'Maze', 'Pipes', 'The Button', 'Piano', 'Wires', 'Diagram'];
  const texts = ['Exactly 2 batteries', 'Exactly 1 battery', 'Has', 'Has', 'No', 'Under 3V total', 'Has', 'Biggest round:', '4.5V or more total', 'No'];
  const table = { modules, rows: t.rows.map((r, i) => ({ text: texts[i], icon: r.icon && r.icon.color, cells: r.cells })) };
  const bats = readBatteryLayout(B2).batteries.map(x => ({ color: x.color, volts: x.round ? 1.5 : 9, round: x.round, size: x.size }));
  assert.deepEqual(bats.map(b => b.color), ['orange', 'red', 'blue']);
  const s = solveBatteries(table, bats);
  // has red, no 9V, biggest round is blue, 4.5V in all
  assert.deepEqual(s.rows.map(r => r.truth), [false, false, true, false, true, false, false, true, true, false]);
  assert.deepEqual(s.timer, [{ name: 'Search', digits: [3] }, { name: 'Chess', digits: [3] }, { name: 'Wire Sequences', digits: [1] }, { name: 'Symbols', digits: [4] }]);
  assert.equal(s.cycle, null);
});

// 24 Nov: "Under 3V total" was read as "Under 8V total" on this 880-px table
test('batteries: the 24 Nov table (7 modules) — every badge and row icon', () => {
  const t = readTableLayout(readPng(new URL('./fixtures/batteries_table3.png', import.meta.url)));
  assert.ok(t.ok);
  assert.equal(t.columns.length, 7);
  assert.deepEqual(t.rows.map(r => r.cells.map(cell).join(' ')), [
    'first:orange 5 then:blue . ANY then:orange first:blue',
    '. . . ANY 0 . .',
    '. . ANY . . . 1',
    'first:orange then:blue . ANY 4 then:orange first:blue',
    'first:blue first:orange ANY . then:orange . then:blue',
    '1 . ANY then:orange first:orange ANY .',
    'first:orange . . . ANY then:orange .',
    '. ANY then:orange . first:orange . .',
    '. first:blue then:orange first:orange . then:blue ANY',
    '. ANY first:orange . 2 then:orange .'
  ]);
  assert.deepEqual(t.rows.map(r => (r.icon ? r.icon.color : null)), [null, 'blue', null, null, null, 'yellow', 'red', null, 'purple', 'red']);
});

test('batteries: condition text is inked halfway to the brightest text near it, not at one cut-off', () => {
  // one row of pixels: background, a soft edge, bold white text, a soft edge … then grey text with its edges
  const px = [32, 32, 32, 110, 222, 222, 110, 32, 32, 32, 32, 32, 32, 95, 146, 95, 32, 32, 32, 32];
  const p = new Uint8ClampedArray(px.flatMap(v => [v, v, v, 255]));
  const ink = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b > 92;
  const fixed = [...inkMask(p, px.length, 1, ink)].join('');
  const local = [...inkMask(p, px.length, 1, ink, { local: true })].join('');
  assert.equal(fixed, '00011110000001110000'); // the white text's soft edges count as ink: a bold 3 fills in
  assert.equal(local, '00001100000001110000'); // white text keeps its shape; the grey text is all still there
});

test('batteries: one-letter slips in the short icon rows; voltages no batteries add up to are flagged', () => {
  assert.deepEqual(parseCondition('Hag', 'yellow'), { type: 'count', op: '>=', n: 1, color: 'yellow' });
  assert.deepEqual(parseCondition('Ha', 'blue'), { type: 'count', op: '>=', n: 1, color: 'blue' });
  assert.deepEqual(parseCondition('N0', 'red'), { type: 'count', op: '=', n: 0, color: 'red' });
  assert.equal(parseCondition('Hag', null).type, 'unknown', 'no icon: no guess');
  assert.equal(parseCondition('Bag', 'red').type, 'unknown', 'a different first letter: no guess');
  // totals are made of 1.5V and 9V batteries: 1.5, 3, 4.5, 6, …
  assert.equal(oddVolts(parseCondition('Under8Vtotal')), true);
  assert.equal(oddVolts(parseCondition('Under4.6Vtotal')), true);
  for (const ok of ['Under3Vtotal', 'Under4.5Vtotal', '9Vormoretotal', 'Under12Vtotal']) assert.equal(oddVolts(parseCondition(ok)), false, ok);
  assert.equal(oddVolts(parseCondition('Exactly1battery', null)), false);
});
