// Pure Knobs solver: 12-LED truth table parsing and direction resolver

export const KEY = 'bombvision_knob_rules';

export const DEFAULT_RULES = `UP:
XOXOXX
XXOOXX
OOXOXO
XXXOXX
OXOOXX
XXXOOX
XOOXXO
XXOXOO

DOWN:
OOOXXX
XXOOXO
OXXOOX
OXXXXX
OOOOXX
XOXOXO
OXOOOO
OXOXOX

LEFT:
XXXXXX
OXXXXO
OXXXOX
XOXOOX
XXOOOX
OOOXOX
OXOXXX
XOXXXX

RIGHT:
OXXOOO
OOXOXX
XOOXOX
OXXOXX
OOOOOO
XXXOXO
XOXXOO
XXXXXO`;

export function parseKnobRules(text) {
  const rules = { UP: [], DOWN: [], LEFT: [], RIGHT: [] };
  let curDir = null;
  const lines = String(text || '').split(/\r?\n/);
  for (const raw of lines) {
    const l = raw.trim().toUpperCase();
    if (l.startsWith('UP')) { curDir = 'UP'; continue; }
    if (l.startsWith('DOWN')) { curDir = 'DOWN'; continue; }
    if (l.startsWith('LEFT')) { curDir = 'LEFT'; continue; }
    if (l.startsWith('RIGHT')) { curDir = 'RIGHT'; continue; }
    const match = l.match(/[XO01]{6}/);
    if (match && curDir && rules[curDir]) {
      const pat = match[0].replace(/1/g, 'X').replace(/0/g, 'O');
      if (!rules[curDir].includes(pat)) rules[curDir].push(pat);
    }
  }
  return rules;
}

export function countLit(pat) {
  return (pat.match(/X/g) || []).length;
}

export function findPatternDir(pat, rules) {
  if (!pat || pat.length !== 6) return null;
  for (const dir of ['UP', 'DOWN', 'LEFT', 'RIGHT']) {
    if (rules[dir] && rules[dir].includes(pat)) {
      return dir;
    }
  }
  return null;
}

export function solveKnob(topPat, botPat, disarmed, rules) {
  const dirTop = findPatternDir(topPat, rules);
  const dirBot = findPatternDir(botPat, rules);
  const litTop = countLit(topPat);
  const litBot = countLit(botPat);

  if (!dirTop && !dirBot) {
    return { ok: false, msg: 'No matching pattern found for top or bottom row' };
  }

  const isOdd = disarmed % 2 !== 0;
  let chosenDir = null;
  let reason = '';

  if (dirTop && !dirBot) {
    chosenDir = dirTop;
    reason = `Only Top Row matched (${topPat} → ${dirTop})`;
  } else if (!dirTop && dirBot) {
    chosenDir = dirBot;
    reason = `Only Bottom Row matched (${botPat} → ${dirBot})`;
  } else {
    if (isOdd) {
      if (litTop > litBot) { chosenDir = dirTop; }
      else if (litBot > litTop) { chosenDir = dirBot; }
      else { chosenDir = dirTop; }
      reason = `Disarmed count (${disarmed}) is ODD → pick row with MOST lit lights (${litTop} vs ${litBot})`;
    } else {
      if (litTop < litBot) { chosenDir = dirTop; }
      else if (litBot < litTop) { chosenDir = dirBot; }
      else { chosenDir = dirTop; }
      reason = `Disarmed count (${disarmed}) is EVEN → pick row with FEWEST lit lights (${litTop} vs ${litBot})`;
    }
  }

  const arrowMap = { 'UP': '⬆️', 'DOWN': '⬇️', 'LEFT': '⬅️', 'RIGHT': '➡️' };

  return {
    ok: true,
    direction: chosenDir,
    arrow: arrowMap[chosenDir] || '',
    topPat,
    dirTop,
    litTop,
    botPat,
    dirBot,
    litBot,
    disarmed,
    isOdd,
    reason
  };
}
