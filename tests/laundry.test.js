import test from 'node:test';
import assert from 'node:assert/strict';
import { readPng } from './pngDecode.js';
import { readLaundryModule, buildIconTemplates } from '../src/modules/laundry/laundryVision.js';
import { ICON_TEMPLATES } from '../src/modules/laundry/laundryIcons.js';
import { solveLaundry as solveWith, pressesFor, parseLaundryText, parseLaundryManual, pickSymbol, lastSerialDigit, sharedLetters, SAMPLE_MANUAL_TEXT } from '../src/modules/laundry/laundrySolver.js';

const LOAD1 = parseLaundryManual(SAMPLE_MANUAL_TEXT);
const solveLaundry = (counts, serial) => solveWith(LOAD1, counts, serial);

const MODULE = readPng(new URL('./fixtures/laundry_module.png', import.meta.url));
const PHONE = readPng(new URL('./fixtures/laundry_discord.png', import.meta.url));
const SHEET = readPng(new URL('./fixtures/laundry_manual.png', import.meta.url));
const START = { wash: '30°C', dry: 'High heat', iron: '150°C', care: 'Bleach' };

test('laundry: the bot message gives the counts, serial, load and check time', () => {
  const f = parseLaundryText('Load **1**. Set wash, dry, iron and special care using the helper manual.\nCaptured counts: **7** remaining, **0** solved, **1** needy, **8** total. Serial: **LROOXIWG**.\nCheck in 50 seconds.');
  assert.deepEqual(f, { load: 1, remaining: 7, solved: 0, needy: 1, total: 8, serial: 'LROOXIWG', checkIn: 50 });
});

test('laundry: 23 Nov load 1 → Corset / Nylon / Jade Cluster → 30°C, No tumble dry, 150°C, Low heat', () => {
  const r = solveLaundry({ remaining: 7, solved: 0, needy: 1, total: 8 }, 'LROOXIWG');
  assert.ok(r.ready);
  assert.equal(r.item.name, 'Corset'); // 7 + 5 = 12 → 0
  assert.equal(r.material.name, 'Nylon'); // 0 + 1 + 2 = 3
  assert.equal(r.color.name, 'Jade Cluster'); // no digit: 0 + 8 + 1 = 9 → 3
  assert.deepEqual(r.set, { wash: '30°C', dry: 'No tumble dry', iron: '150°C', care: 'Low heat' });
  assert.deepEqual(pressesFor(r.set, START), { wash: 0, dry: 3, iron: 0, care: 7 });
});

test('laundry: the override and special-care rules, in order', () => {
  // Leather → Wash 30°C; Wool → Dry High heat
  assert.equal(solveLaundry({ remaining: 0, solved: 3, needy: 0, total: 0 }, 'ZZZ').set.wash, '30°C'); // 3+0+2 = 5 Leather
  assert.equal(solveLaundry({ remaining: 0, solved: 0, needy: 0, total: 0 }, 'ZZZ').set.dry, 'High heat'); // 0+0+2 = 2 Wool
  // Star Lemon Quartz → Dry High heat: digit 0 + total 0 + 1 = 1
  assert.equal(solveLaundry({ remaining: 0, solved: 0, needy: 1, total: 0 }, 'ZZZ0').set.dry, 'High heat');
  // Clouded Pearl wins over Corset: color 4 = 0 + 3 + 1; item 0 = remaining 1
  assert.equal(solveLaundry({ remaining: 1, solved: 0, needy: 0, total: 3 }, 'ZZZ').set.care, 'Non-chlorine bleach');
  // remaining 2 → Shirt, solved 5 → Cotton, digit 9 + total 1 + 1 = 11 → Malinite
  const s2 = solveLaundry({ remaining: 2, solved: 5, needy: 0, total: 1 }, 'T9');
  assert.deepEqual([s2.item.name, s2.material.name, s2.color.name], ['Shirt', 'Cotton', 'Malinite']);
  assert.equal(s2.set.care, 'Non-chlorine bleach'); // Cotton shares T with the serial → color care
  const s3 = solveLaundry({ remaining: 2, solved: 5, needy: 0, total: 1 }, 'X9');
  assert.equal(s3.set.care, 'No tetra solvent'); // nothing shared → item care (Shirt)
  assert.equal(lastSerialDigit('A1B2C'), 2);
  assert.equal(lastSerialDigit('ABC'), 0);
  assert.deepEqual(sharedLetters('Nylon', 'LROOXIWG'), ['L', 'O']);
});

test('laundry: missing counts or serial are reported, not guessed', () => {
  const r = solveLaundry({ remaining: 7, solved: '', needy: 1, total: 8 }, '');
  assert.equal(r.ready, false);
  assert.deepEqual(r.missing, ['solved', 'serial']);
});

test('laundry: the module picture and the phone screenshot show 30°C / High heat / 150°C / Bleach', () => {
  for (const img of [MODULE, PHONE]) {
    const r = readLaundryModule(img);
    assert.ok(r.ok, r.reason);
    assert.deepEqual(r.current, START);
  }
});

test('laundry: the built-in symbol templates match the symbol sheet', () => {
  assert.deepEqual(buildIconTemplates(SHEET), ICON_TEMPLATES);
});

// The second manual seen (tests/fixtures/laundry_rules_p1.png + p2.png): new formulas, same tables
const LOAD2_P1 = `On the subject of Laundry
Load 2 • Check every 60s. Wrong settings explode. Reopen for each new load.
Top: Wash | Dry. Bottom: Iron | Special care.

Find the load

Use the module's captured counts. Subtract 6 until each result is 0 to 5.
Item = remaining + 3
Material = solved + needy + 5
Color = last serial digit + total + 3 (no digit: use 0)

${SAMPLE_MANUAL_TEXT.slice(SAMPLE_MANUAL_TEXT.indexOf('Item → Iron'), SAMPLE_MANUAL_TEXT.indexOf('Set the controls')).trim()}`;
const LOAD2_P2 = SAMPLE_MANUAL_TEXT.slice(SAMPLE_MANUAL_TEXT.indexOf('Set the controls'));

test('laundry manual: formulas, tables, exceptions and care rules are read from the text', () => {
  const m = parseLaundryManual(`${LOAD2_P1}\n\n${LOAD2_P2}`);
  assert.equal(m.load, 2);
  assert.equal(m.modulus, 6);
  assert.deepEqual(m.formulas.item.terms, [{ sign: 1, kind: 'count', key: 'remaining' }, { sign: 1, kind: 'num', n: 3 }]);
  assert.deepEqual(m.formulas.color.terms.map(t => t.kind), ['digit', 'count', 'num']);
  assert.deepEqual(m.tables.material.map(r => r.name), ['Polyester', 'Cotton', 'Wool', 'Nylon', 'Corduroy', 'Leather']);
  assert.deepEqual(m.tables.color[4].values, { dry: 'Low heat', care: 'Low heat' });
  assert.deepEqual(m.controlFrom, { wash: 'material', dry: 'color', iron: 'item' });
  assert.deepEqual(m.overrides.map(o => [o.who, o.control, o.value]), [[['Leather', 'Jade Cluster'], 'wash', '30°C'], [['Wool', 'Star Lemon Quartz'], 'dry', 'High heat']]);
  assert.deepEqual(m.care.map(r => r.when.kind), ['names', 'names', 'shares', 'always']);
  assert.deepEqual(m.unread, []);
});

test('laundry manual: the same counts give a different load under Load 2\'s formulas', () => {
  const m = parseLaundryManual(`${LOAD2_P1}\n\n${LOAD2_P2}`);
  const r = solveWith(m, { remaining: 7, solved: 0, needy: 1, total: 8 }, 'LROOXIWG');
  assert.ok(r.ready, r.reason);
  // 7 + 3 = 10 → 4 Shorts; 0 + 1 + 5 = 6 → 0 Polyester; 0 + 8 + 3 = 11 → 5 Malinite
  assert.deepEqual([r.item.name, r.material.name, r.color.name], ['Shorts', 'Polyester', 'Malinite']);
  // Polyester shares O, L with LROOXIWG → color care (Malinite)
  assert.deepEqual(r.set, { wash: '50°C', dry: 'Medium heat', iron: '150°C', care: 'Non-chlorine bleach' });
  assert.deepEqual(r.borrowed, []);
});

test('laundry manual: page 1 alone works (usual rules filled in and named); no manual = no answer', () => {
  const r = solveWith(parseLaundryManual(LOAD2_P1), { remaining: 7, solved: 0, needy: 1, total: 8 }, 'LROOXIWG');
  assert.ok(r.ready);
  assert.deepEqual(r.borrowed, ['the wash / dry exceptions', 'the special-care rules']);
  assert.equal(solveWith(parseLaundryManual(''), { remaining: 7, solved: 0, needy: 1, total: 8 }, 'X').ready, false);
  assert.equal(solveWith(parseLaundryManual(LOAD2_P2), { remaining: 7, solved: 0, needy: 1, total: 8 }, 'X').ready, false);
});

test('laundry manual: OCR slips — lost arrows and slashes, misread degree signs', () => {
  const ocr = `Load 2 Check every 60s.
Item = remaining + 3
Material = solved + needy + 5
Color = last serial digit + total + 3 (no digit: use 0)
Item Iron / Special care
Corset: 150*C / Bleach
Shirt: No steam l No tetra solvent
Skirt: Iron / Reduced moisture
Skort: 2000C / Short cycle
Shorts: 150°C / Do not bleach
Scarf: 110 C / No dry cleaning
Wash — material. Dry — color. Iron — item.
e Leather or Jade Cluster: Wash 30°C.
Special care: first match wins
Clouded Pearl Non-chlorine bleach
Corset or Corduroy > material care
Otherwise item care`;
  const m = parseLaundryManual(ocr);
  assert.deepEqual(m.tables.item.map(r => r.values.iron), ['150°C', 'No steam', 'Iron', '200°C', '150°C', '110°C']);
  assert.equal(m.tables.item[1].values.care, 'No tetra solvent');
  assert.deepEqual(m.controlFrom, { wash: 'material', dry: 'color', iron: 'item' });
  assert.deepEqual(m.care.map(r => [r.when.kind, r.then && (r.then.value || r.then.table)]), [['names', 'Non-chlorine bleach'], ['names', 'material'], ['always', 'item']]);
  assert.equal(pickSymbol('wash', '950C'), '95°C');
  assert.equal(pickSymbol('care', 'Non-chiorine bleach'), 'Non-chlorine bleach');
  assert.equal(pickSymbol('dry', 'Low heat'), 'Low heat');
});

test('laundry manual: a table with a row lost is reported, not wrapped round', () => {
  const short = SAMPLE_MANUAL_TEXT.replace('Skort: 200°C / Short cycle\n', '');
  const r = solveWith(parseLaundryManual(short), { remaining: 7, solved: 0, needy: 1, total: 8 }, 'LROOXIWG');
  assert.equal(r.ready, false);
  assert.match(r.reason, /item table has 5 rows/);
});

// A real walkthrough from players (Discord, 17 Sep): the method, the answer and the presses
test('laundry: players\' worked example → Skirt / Corduroy / Clouded Pearl → 40°C, Low heat, Iron, Non-chlorine bleach; 1, 4, 2, 11 presses', () => {
  const m = parseLaundryManual(SAMPLE_MANUAL_TEXT
    .replace(/Item = remaining \+ \d+/, 'Item = remaining + 1')
    .replace(/Material = solved \+ needy \+ \d+/, 'Material = solved + needy + 2')
    .replace(/Color = last serial digit \+ total \+ \d+/, 'Color = last serial digit + total + 4'));
  // the serial's last digit is 9: 7 + 1 = 8 → 2, 1 + 1 + 2 = 4, 9 + 9 + 4 = 22 → 4
  const r = solveWith(m, { remaining: 7, solved: 1, needy: 1, total: 9 }, 'AB1CD9');
  assert.deepEqual([r.item.name, r.material.name, r.color.name], ['Skirt', 'Corduroy', 'Clouded Pearl']);
  // Clouded Pearl is the first special-care rule, so it wins over Corduroy's material care
  assert.deepEqual(r.set, { wash: '40°C', dry: 'Low heat', iron: 'Iron', care: 'Non-chlorine bleach' });
  // load 1 always starts on 30°C, High heat, 150°C, Bleach
  assert.deepEqual(pressesFor(r.set, START), { wash: 1, dry: 4, iron: 2, care: 11 });
});
