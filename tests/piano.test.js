// Piano: the interval between the two notes as drawn, and the key signature from the bot's message
import test from 'node:test';
import assert from 'node:assert/strict';
import { readPng } from './pngDecode.js';
import { pnAnalyze } from '../src/modules/piano/pianoVision.js';
import { pnNote, pnDrawnName, PN_NATURAL, pnInterval, pnParseKey, pnParseKeyField, pnKeyAccidentals, pnEffectiveAcc, PN_KEYS } from '../src/modules/piano/pianoSolver.js';

test('piano: C♯3 then E2 (bass clef) → Major 6th', () => {
  const img = readPng(new URL('./fixtures/piano_decreasing_csharp3_e2.png', import.meta.url));
  const r = pnAnalyze(img.data, img.width, img.height);
  assert.equal(r.clef, 'bass');
  assert.equal(r.notes.length, 2);
  const [a, b] = r.notes.map(n => pnNote(r.clef, n.pos, n.acc));
  assert.deepEqual([a.name, b.name], ['C♯3', 'E2']);
  assert.equal(pnInterval(a.semi, b.semi).name, 'Major 6th');
});

// two answers seen in a game (23 Nov): the distance as drawn, whichever way the notes go
for (const [file, key, names, answer] of [
  ['piano_gflat2_e2_cmajor.png', 'C Major', ['G♭2', 'E2'], 'Major 2nd'],
  ['piano_bflat2_aflat3_gmajor.png', 'G Major', ['B♭2', 'A♭3'], 'Minor 7th']
]) {
  test(`piano: ${names.join(' then ')} in ${key} → ${answer} (seen in a game)`, () => {
    const img = readPng(new URL(`./fixtures/${file}`, import.meta.url));
    const r = pnAnalyze(img.data, img.width, img.height);
    assert.equal(r.clef, 'bass');
    assert.equal(r.notes.length, 2);
    const ns = r.notes.map(n => pnNote(r.clef, n.pos, pnEffectiveAcc(r.clef, n.pos, n.acc, key)));
    assert.deepEqual(ns.map(n => n.name), names);
    assert.equal(pnInterval(ns[0].semi, ns[1].semi).name, answer);
  });
}

test('piano: a drawn ♮ cancels the key — G♯4 then A♮4 in A♭ major is a Minor 2nd, not Unison', () => {
  const img = readPng(new URL('./fixtures/piano_gsharp4_anatural4_aflatmajor.png', import.meta.url));
  const r = pnAnalyze(img.data, img.width, img.height);
  assert.equal(r.clef, 'treble');
  assert.deepEqual(r.notes.map(n => n.acc), [1, PN_NATURAL]);
  assert.equal(r.stray, 0);
  assert.deepEqual(r.notes.map(n => pnDrawnName(r.clef, n.pos, n.acc)), ['G♯4', 'A♮4']);
  const semi = n => pnNote(r.clef, n.pos, pnEffectiveAcc(r.clef, n.pos, n.acc, 'A♭ Major')).semi;
  assert.equal(pnInterval(semi(r.notes[0]), semi(r.notes[1])).name, 'Minor 2nd');
  // without the ♮ the key makes it A♭4 — the same pitch as G♯4 (the "Unison" the app gave before)
  const plainA = pnNote(r.clef, r.notes[1].pos, pnEffectiveAcc(r.clef, r.notes[1].pos, 0, 'A♭ Major')).semi;
  assert.equal(pnInterval(semi(r.notes[0]), plainA).name, 'Unison');
});

test('piano: the interval is the same either way round; over an octave drops the octave', () => {
  const n = (clef, pos, acc = 0) => pnNote(clef, pos, acc).semi;
  assert.equal(pnInterval(n('treble', 0), n('treble', 4)).name, 'Perfect 5th'); // E4 → B4
  assert.equal(pnInterval(n('treble', 4), n('treble', 0)).name, 'Perfect 5th'); // B4 → E4
  assert.equal(pnInterval(60, 66).name, 'Tritone');
  assert.equal(pnInterval(60, 72).name, 'Octave');
  assert.equal(pnInterval(60, 48).name, 'Octave');
  assert.deepEqual(pnInterval(60, 75), { st: 3, name: 'Minor 3rd', distance: 15, octaveDropped: true });
  assert.equal(pnInterval(60, 60).name, 'Unison');
});

test('piano: key signature from the bot message', () => {
  assert.equal(pnParseKey('Read both note names to Helpers and enter the code they give you. Key Signature: F Major.'), 'F Major');
  assert.equal(pnParseKey('Key Signature: Bb Minor'), 'B♭ Minor');
  assert.equal(pnParseKey('key signature: F# major'), 'F♯ Major');
  assert.equal(pnParseKey('Key: E♭ major'), 'E♭ Major');
  assert.equal(pnParseKey('Stage 1/3'), null);
  // the key words copied on their own (the key changes every stage)
  assert.equal(pnParseKey('E Major'), 'E Major');
  assert.equal(pnParseKey(' B Major. '), 'B Major');
  assert.equal(pnParseKey('e minor'), 'E Minor');
  assert.equal(pnParseKey('Bb major'), 'B♭ Major');
  assert.equal(pnParseKey('F# Minor'), 'F♯ Minor');
  // …but not inside other text, so a pasted sentence can't set a key by accident
  assert.equal(pnParseKey('play it in E Major please'), null);
  assert.equal(pnParseKey('E'), null);
  // the key field also takes just the key note (major)
  assert.equal(pnParseKeyField('E'), 'E Major');
  assert.equal(pnParseKeyField('Bb'), 'B♭ Major');
  assert.equal(pnParseKeyField('f#'), 'F♯ Major');
  assert.equal(pnParseKeyField('E minor'), 'E Minor');
  assert.equal(pnParseKeyField('Key Signature: B Major.'), 'B Major');
  assert.equal(pnParseKeyField('H'), null);
  assert.equal(pnParseKeyField(''), null);
  assert.deepEqual(pnKeyAccidentals('F Major'), { B: -1 });
  assert.deepEqual(pnKeyAccidentals('D Major'), { F: 1, C: 1 });
  assert.deepEqual(pnKeyAccidentals('D Minor'), { B: -1 });
  assert.deepEqual(pnKeyAccidentals('C Major'), {});
  assert.deepEqual(pnKeyAccidentals(''), {});
  assert.equal(PN_KEYS.length, 30);
  // in F major a plain B is B♭; a drawn ♯ wins over the key; other letters are untouched
  const bPos = 4; // treble middle line = B4
  assert.equal(pnNote('treble', bPos, pnEffectiveAcc('treble', bPos, 0, 'F Major')).name, 'B♭4');
  assert.equal(pnNote('treble', bPos, pnEffectiveAcc('treble', bPos, 1, 'F Major')).name, 'B♯4');
  assert.equal(pnNote('treble', 0, pnEffectiveAcc('treble', 0, 0, 'F Major')).name, 'E4');
  // E4 → B♭4 in F major is a Tritone up, not a Perfect 5th
  const e = pnNote('treble', 0, 0).semi, bb = pnNote('treble', bPos, pnEffectiveAcc('treble', bPos, 0, 'F Major')).semi;
  assert.equal(pnInterval(e, bb).name, 'Tritone');
});
