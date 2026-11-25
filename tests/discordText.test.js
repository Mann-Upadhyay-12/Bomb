// Manuals copied from Discord on a phone keep the markdown (**20**: Hydra, > quotes, - bullets…); on a
// computer only the visible text is copied. Every pasted-manual reader must read both the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discordPlain } from '../src/utils/discordText.js';
import { parseStarList, looksLikeStarList, ASTRO_DEFAULT_STARS } from '../src/modules/astrology/astrologySolver.js';
import { parseCircuitManual, CIRCUIT_DEFAULT_MANUAL } from '../src/modules/circuit/circuitSolver.js';
import { parseChecklist, SAMPLE_CHECKLIST } from '../src/modules/button/buttonSolver.js';
import { parseRules, DEFAULT_RULES } from '../src/modules/wof/wofSolver.js';
import { wsParseManual, WS_DEFAULT_MANUAL } from '../src/modules/wireseq/wireseqRules.js';
import { pnParseCodes, PN_DEFAULT_CODES } from '../src/modules/piano/pianoSolver.js';
import { parseManualText } from '../src/modules/logic/logicSolver.js';
import { parseHangmanWords, HANGMAN_DEFAULT_WORDS } from '../src/modules/hangman/hangmanSolver.js';
import { parseLaundryText, SAMPLE_MANUAL_TEXT } from '../src/modules/laundry/laundrySolver.js';
import { parseBattleshipText, SAMPLE_MANUAL as BATTLESHIP_SAMPLE } from '../src/modules/battleship/battleshipSolver.js';
import { parseKnobRules } from '../src/modules/knob/knobSolver.js';

test('Discord markup comes off the way Discord shows it', () => {
  const cases = [
    ['**20**: Hydra, Piscis Austrinus', '20: Hydra, Piscis Austrinus'],
    ['> **3**: Libra, Lupus', '3: Libra, Lupus'],
    ['>>> 4: Cetus', '4: Cetus'],
    ['- __Red__ = 2 Ω', 'Red = 2 Ω'],
    ['* **Step 1**: read the display', 'Step 1: read the display'],
    ['# Constellations by number of stars', 'Constellations by number of stars'],
    ['-# small print', 'small print'],
    ['***22***: Andromeda', '22: Andromeda'],
    ['**__21__**: Aquila', '21: Aquila'],
    ['*21*: Aquila, _Cetus_', '21: Aquila, Cetus'],
    ['~~old~~ ||spoiler|| `code`', 'old spoiler code'],
    ['[the manual](https://example.com/m)', 'the manual'],
    ['\\*not bold\\* and \\_x\\_', '*not bold* and _x_'],
  ];
  for (const [phone, shown] of cases) assert.equal(discordPlain(phone), shown, phone);
  assert.equal(discordPlain('```\nRed = 2\n```'), 'Red = 2', 'a code block');
});

test('plain text, formulas and snake_case are left alone', () => {
  for (const t of ['2*x*3', 'a * b * c = 9', '5 * 3', 'my_var_name', 'x -> y', 'Minor 2nd 5.68  Major 2nd 6.99',
    'Red = 2 Ω\nOrange = 3 Ω', '>3 batteries', '#1 rule', 'A - B', ASTRO_DEFAULT_STARS, CIRCUIT_DEFAULT_MANUAL, SAMPLE_CHECKLIST,
    DEFAULT_RULES, PN_DEFAULT_CODES, HANGMAN_DEFAULT_WORDS]) { // (the wire sample has "* " bullets: its reader test covers it)
    assert.equal(discordPlain(t), t, t.slice(0, 40));
  }
});

test("the star list as a phone copies it (players' screenshot) loads", () => {
  const plain = parseStarList(ASTRO_DEFAULT_STARS);
  const phone = '**Constellations by number of stars**\n' + ASTRO_DEFAULT_STARS.split('\n').slice(1)
    .map((l) => l.replace(/^(\d+):/, '**$1**:')).join('\n');
  assert.match(phone, /^\*\*20\*\*: /m);
  assert.deepEqual(parseStarList(phone), plain);
  assert.ok(plain.count >= 40, 'enough names for step 2 to tick');
  assert.equal(looksLikeStarList(phone), true, 'pasting it anywhere is recognised too');
  const quoted = phone.split('\n').map((l) => '> ' + l).join('\n');
  assert.deepEqual(parseStarList(quoted), plain);
});

// each reader, fed its own sample the ways a phone copies Discord markdown
const label = (t) => t.split('\n').map((l) => (/^(\s*)([^:=\n]{1,40}?)(\s*[:=])/.test(l)
  ? l.replace(/^(\s*)([^:=\n]{1,40}?)(\s*[:=])/, '$1**$2**$3') : l.replace(/^(\s*)(\d+)/, '$1**$2**'))).join('\n');
const PHONE = {
  'bold labels': label,
  'bold numbers': (t) => t.replace(/\d+(?:\.\d+)?/g, '**$&**'),
  'bold lines': (t) => t.split('\n').map((l) => (l.trim() ? `**${l.trim()}**` : l)).join('\n'),
  'quotes': (t) => t.split('\n').map((l) => '> ' + l).join('\n'),
  'bullets': (t) => t.split('\n').map((l) => (l.trim() ? '- ' + l : l)).join('\n'),
  'heading': (t) => '# ' + t,
  'underlined labels': (t) => label(t).replace(/\*\*/g, '__'),
};
const READERS = [
  ['Astrology star list', parseStarList, ASTRO_DEFAULT_STARS],
  ['Circuit colours', parseCircuitManual, CIRCUIT_DEFAULT_MANUAL],
  ['Button checklist', parseChecklist, SAMPLE_CHECKLIST],
  ["Who's on First", parseRules, DEFAULT_RULES],
  ['Wire sequence', wsParseManual, WS_DEFAULT_MANUAL],
  ['Piano codes', pnParseCodes, PN_DEFAULT_CODES],
  ['Logic values', parseManualText, 'P = TRUE, q: false\nR=1 S = F  T:T'],
  ['Hangman words', parseHangmanWords, HANGMAN_DEFAULT_WORDS],
  ['Laundry manual', parseLaundryText, SAMPLE_MANUAL_TEXT],
  ['Battleship fleet', parseBattleshipText, BATTLESHIP_SAMPLE],
  ['Knob rules', parseKnobRules, 'UP:\n101010 011011\nDOWN:\n110110\nLEFT:\n000111\nRIGHT:\n111000'],
];
for (const [name, read, sample] of READERS) {
  test(`${name} reads a phone copy the same as a computer copy`, () => {
    const want = JSON.stringify(read(sample));
    for (const [how, phone] of Object.entries(PHONE)) assert.equal(JSON.stringify(read(phone(sample))), want, how);
  });
}
