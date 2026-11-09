// Pure Who's on First manual parser, fuzzy word matcher, and solving logic

export const DEFAULT_RULES = `Step 1. The display word tells you which button label to ask for:

    top left: NOTHING, READ, IDK, NOT, THEY'RE, YOU, YOUR
    top right: CEE, LEAD, OKAY, MIDDLE LEFT, WHAT, THEIR, YOU ARE
    middle left: LEED, REED, SAYS, TOP RIGHT, IT, YOU'RE
    middle right: NO, SEE, PRESS, DON'T, UR, YES
    bottom left: C, DISPLAY, HOLD ON, RED, THIS, THAT
    bottom right: (blank), BLANK, FIRST, LED, THERE, THEY ARE


Step 2. Find that label's list below. Tell the Defuser to press the first word in the list that appears on any button.

    THIS: PRESS, WAIT, WHAT, IT, HOLD, FIRST, THAT, READY, IDK, NOT, TOP RIGHT, THIS
    THAT: MIDDLE LEFT, FIRST, IT, PRESS, DON'T, READY, HOLD, NOT, IDK, THAT
    PRESS: TOP RIGHT, PRESS
    TOP RIGHT: FIRST, WHAT, TOP RIGHT
    MIDDLE LEFT: FIRST, TOP RIGHT, NOT, DON'T, IT, IDK, THAT, PRESS, HOLD, THIS, READY, WHAT, WAIT, MIDDLE LEFT
    DON'T: PRESS, IDK, THAT, MIDDLE LEFT, HOLD, WAIT, FIRST, DON'T
    IT: THIS, WAIT, HOLD, READY, PRESS, MIDDLE LEFT, TOP RIGHT, NOT, IT
    WHAT: NOT, FIRST, IDK, DON'T, IT, MIDDLE LEFT, TOP RIGHT, THIS, HOLD, READY, WHAT
    IDK: WHAT, WAIT, FIRST, THIS, MIDDLE LEFT, PRESS, IDK
    FIRST: WAIT, TOP RIGHT, WHAT, NOT, READY, HOLD, IT, DON'T, FIRST
    NOT: TOP RIGHT, DON'T, FIRST, THAT, WAIT, READY, PRESS, IDK, HOLD, NOT
    READY: FIRST, READY
    WAIT: IDK, NOT, THIS, FIRST, TOP RIGHT, THAT, HOLD, IT, READY, WHAT, WAIT
    HOLD: FIRST, NOT, HOLD
    C: UH UH, UHH, U, CEE, UH HUH, YOU ARE, UR, SEE, WHAT?, UHHH, YOU, YOU'RE, YOUR, C
    CEE: UH UH, UHHH, C, CEE
    SEE: YOUR, WHAT?, SEE
    UHH: YOU'RE, YOUR, U, UH HUH, UHHH, CEE, UHH
    UHHH: YOUR, UH UH, YOU, UHHH
    YOU: UR, YOU
    YOU ARE: UH HUH, WHAT?, U, YOUR, YOU'RE, C, CEE, YOU, YOU ARE
    YOUR: UR, YOUR
    YOU'RE: YOU ARE, WHAT?, YOUR, YOU, C, UH UH, SEE, U, UH HUH, YOU'RE
    UR: CEE, YOU, UH UH, UR
    U: YOU ARE, WHAT?, SEE, CEE, U
    UH HUH: WHAT?, YOU ARE, UH HUH
    UH UH: YOUR, YOU'RE, UH HUH, YOU ARE, C, UH UH
    WHAT?: YOU ARE, UH HUH, YOU, U, WHAT?`;

export const POS_NAMES = ['TOP LEFT', 'TOP RIGHT', 'MIDDLE LEFT', 'MIDDLE RIGHT', 'BOTTOM LEFT', 'BOTTOM RIGHT'];
export const BLANK = '(BLANK)';

export function parseRules(text) {
  const R = { posOfWord: {}, step2: {}, displayWords: [], buttonLabels: [] };
  let mode = 1, npos = 0;
  const seenPos = {};
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/[\u2018\u2019]/g, "'").replace(/[*`]/g, '').trim();
    if (/^step\s*1/i.test(line)) { mode = 1; continue; }
    if (/^step\s*2/i.test(line)) { mode = 2; continue; }
    const m = line.match(/^[-•]?\s*([^:]+?)\s*:\s*(.+)$/);
    if (!m) continue;
    const key = m[1].trim().toUpperCase();
    const words = m[2].split(',').map(w => w.trim().toUpperCase()).filter(Boolean);
    if (!words.length) continue;
    if (mode === 1 && npos === 6) mode = 2;
    const pi = POS_NAMES.indexOf(key);
    if (mode === 1) {
      if (pi < 0 || seenPos[pi]) continue;
      seenPos[pi] = true; npos++;
      for (const w of words) if (!(w in R.posOfWord)) { R.posOfWord[w] = pi; R.displayWords.push(w); }
    } else {
      R.step2[key] = words;
    }
  }
  R.buttonLabels = Object.keys(R.step2);
  R.positions = npos;
  return R;
}

export function solveCore(R, disp, btns) {
  if (!disp) return { ok: false, msg: 'SET THE DISPLAY WORD' };
  const look = R.posOfWord[disp];
  if (look === undefined) return { ok: false, msg: 'DISPLAY WORD NOT IN RULES' };
  if (btns.some(b => !b)) return { ok: false, look, msg: 'FILL IN ALL 6 BUTTONS' };
  const label = btns[look];
  const list = R.step2[label];
  if (!list) return { ok: false, look, label, msg: 'NO LIST FOR "' + label + '"' };
  const on = new Set(btns);
  const ans = list.find(w => on.has(w));
  if (!ans) return { ok: false, look, label, list, msg: 'NO LIST WORD IS ON A BUTTON' };
  return { ok: true, look, label, list, ans, hit: btns.indexOf(ans) };
}

export function lev(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

export function matchWord(text, vocab) {
  const t = String(text || '').toUpperCase().replace(/[^A-Z'?]/g, '');
  if (!t) return { w: '', d: 99, amb: false };
  let bw = '', bd = 99, second = 99;
  for (const w of vocab) {
    const d = lev(t, w.replace(/ /g, ''));
    if (d < bd) {
      second = bd; bd = d; bw = w;
    } else if (d < second) {
      second = d;
    }
  }
  return { w: bw, d: bd, amb: second === bd, len: t.length };
}
