// Memory: 5 stages. Each stage shows a display number (1–4) and four buttons labelled 1–4 in some
// order. The Helper's manual has one rule per stage and display; a rule names
//   - a position ("the button in the second position", counted left → right),
//   - a label ("the button labeled 4", wherever it is now),
//   - the position pressed in an earlier stage, or
//   - the label pressed in an earlier stage (found in the current arrangement).
// Every press is remembered (position and label) for the later stages. The rules change per game.

export const SAMPLE_MANUAL = `Stage 1:
If the display is 1, press the button labeled 4.
If the display is 2, press the button in the second position.
If the display is 3, press the button in the third position.
If the display is 4, press the button in the fourth position.

Stage 2:
If the display is 1, press the button labeled 4.
If the display is 2, press the button in the same position as you pressed in stage 1.
If the display is 3, press the button in the same position as you pressed in stage 1.
If the display is 4, press the button with the same label you pressed in stage 1.

Stage 3:
If the display is 1, press the button with the same label you pressed in stage 2.
If the display is 2, press the button with the same label you pressed in stage 1.
If the display is 3, press the button in the third position.
If the display is 4, press the button labeled 4.

Stage 4:
If the display is 1, press the button in the same position as you pressed in stage 1.
If the display is 2, press the button in the first position.
If the display is 3, press the button in the same position as you pressed in stage 2.
If the display is 4, press the button in the same position as you pressed in stage 2.

Stage 5:
If the display is 1, press the button with the same label you pressed in stage 1.
If the display is 2, press the button with the same label you pressed in stage 2.
If the display is 3, press the button with the same label you pressed in stage 4.
If the display is 4, press the button with the same label you pressed in stage 3.`;

const ORD = { first: 1, '1st': 1, one: 1, second: 2, '2nd': 2, two: 2, third: 3, '3rd': 3, three: 3, fourth: 4, '4th': 4, four: 4, last: 4, leftmost: 1, rightmost: 4 };
const ordinal = (n) => ['', 'first', 'second', 'third', 'fourth'][n] || String(n);
const n14 = (w) => (/^[1-4]$/.test(w) ? Number(w) : ORD[String(w).toLowerCase()] || null);

/** An instruction → { type: 'pos' | 'label' | 'samePos' | 'sameLabel', n?, stage?, desc } or null */
export function parseMemoryAction(raw) {
  const t = String(raw).toLowerCase().replace(/[“”"'*]/g, '');
  let m;
  // an earlier stage's label / position (checked first: "same label" also says "label")
  if ((m = t.match(/same\s+label\s+(?:as\s+(?:the\s+one\s+)?(?:you\s+)?|that\s+(?:you\s+)?|you\s+|which\s+)?(?:pressed|used|chose|was\s+pressed)?\s*(?:in|on|during|at|from)?\s*(?:the\s+)?stage\s*(\d)/))
    || (m = t.match(/label\s+(?:you\s+|that\s+was\s+|that\s+you\s+)?(?:pressed|used)\s+(?:in|on|during)\s+(?:the\s+)?stage\s*(\d)/))
    || (m = t.match(/stage\s*(\d)(?:'s|\s+)\s*label/))) {
    return { type: 'sameLabel', stage: Number(m[1]), desc: `label pressed in stage ${m[1]}` };
  }
  if ((m = t.match(/same\s+position\s+(?:as\s+(?:the\s+one\s+)?(?:you\s+)?|that\s+(?:you\s+)?|you\s+|which\s+)?(?:pressed|used|chose|was\s+pressed)?\s*(?:in|on|during|at|from)?\s*(?:the\s+)?stage\s*(\d)/))
    || (m = t.match(/position\s+(?:you\s+|that\s+was\s+|that\s+you\s+)?(?:pressed|used)\s+(?:in|on|during)\s+(?:the\s+)?stage\s*(\d)/))
    || (m = t.match(/stage\s*(\d)(?:'s|\s+)\s*position/))) {
    return { type: 'samePos', stage: Number(m[1]), desc: `position pressed in stage ${m[1]}` };
  }
  if ((m = t.match(/label(?:l)?ed\s*(?:with\s+)?(?:a\s+|the\s+number\s+)?([1-4]|one|two|three|four)\b/)) || (m = t.match(/label\s*(?:is|=|:|of)?\s*([1-4])\b/)) || (m = t.match(/(?:shows|says|with)\s+(?:a\s+|the\s+number\s+)?([1-4])\b/))) {
    const n = n14(m[1]);
    return n ? { type: 'label', n, desc: `label ${n}` } : null;
  }
  if ((m = t.match(/(first|second|third|fourth|1st|2nd|3rd|4th|leftmost|rightmost|last)\s+(?:button|position|place|one)/)) || (m = t.match(/position\s*(?:#|number\s*)?([1-4])\b/)) || (m = t.match(/(?:button|place)\s+in\s+(?:position\s+)?([1-4])\b/))) {
    const n = n14(m[1]);
    return n ? { type: 'pos', n, desc: `position ${n} (${ordinal(n)})` } : null;
  }
  return null;
}

/**
 * The pasted manual → { rules: { [stage]: { [display]: action } }, unclear: [line], count }.
 * The stage comes from a "Stage N" header or the line itself; the display from "display is N",
 * "display 3", "shows 2" or a leading "1:" / "1 →".
 */
export function parseMemoryManual(text) {
  const rules = {};
  const unclear = [];
  let stage = null, count = 0;
  for (const raw of String(text || '').replace(/\r/g, '').split('\n')) {
    let line = raw.replace(/[*_`#>]/g, '').replace(/^\s*[-•–]\s+/, '').trim();
    if (!line) continue;
    const head = line.match(/^stage\s*([1-5])\b\s*[:.)\-–—]?\s*(.*)$/i);
    if (head) { stage = Number(head[1]); line = head[2].replace(/^[,;:\s]+/, '').trim(); if (!line) continue; }
    const inline = line.match(/\bstage\s*([1-5])\b(?![^,:]*\b(?:pressed|used))/i);
    let st = stage;
    if (inline && /^(?:in\s+|for\s+|on\s+)?stage/i.test(line.replace(/^(?:if\s+)?(?:it\s+is\s+|we\s+are\s+(?:in|on)\s+)?/i, ''))) st = Number(inline[1]);
    const d = line.match(/display(?:ed)?\s*(?:number\s*)?(?:is|shows|reads|says|=|:)?\s*(?:a\s+)?([1-4])\b/i)
      || line.match(/(?:shows|reads)\s+(?:a\s+)?([1-4])\b/i)
      || line.match(/^(?:if\s+)?([1-4])\s*(?:[:)→=-]|->)\s*/);
    if (!st || !d) { if (/press|push|button|label|position/i.test(line)) unclear.push(raw.trim()); continue; }
    // the instruction: what comes after the display part
    const rest = line.slice(line.indexOf(d[0]) + d[0].length);
    const action = parseMemoryAction(rest);
    if (!action) { unclear.push(raw.trim()); continue; }
    rules[st] = rules[st] || {};
    rules[st][Number(d[1])] = { ...action, text: line };
    count++;
  }
  return { rules, unclear, count };
}

/**
 * One stage: labels = the four labels left → right (numbers 1–4), history = [{ pos, label }] for the
 * stages before. → { pos, label, rule, need } (pos 1-based) or { error }.
 */
export function solveMemoryStage(parsed, stage, display, labels, history) {
  const rule = parsed && parsed.rules[stage] && parsed.rules[stage][display];
  if (!rule) return { error: `No rule for stage ${stage}, display ${display} in the manual.` };
  const full = Array.isArray(labels) && labels.length === 4 && labels.every(l => /^[1-4]$/.test(String(l)));
  const at = (label) => (full ? labels.map(String).indexOf(String(label)) + 1 : 0);
  if (rule.type === 'pos') return { pos: rule.n, label: full ? Number(labels[rule.n - 1]) : null, rule, needLabels: !full };
  if (rule.type === 'label') return full ? { pos: at(rule.n), label: rule.n, rule } : { label: rule.n, rule, needLabels: true };
  const past = history[rule.stage - 1];
  if (!past || rule.stage >= stage) return { error: `This rule needs what was pressed in stage ${rule.stage}${rule.stage >= stage ? ', which comes later' : ' — enter that stage first'}.`, rule };
  if (rule.type === 'samePos') return { pos: past.pos, label: full ? Number(labels[past.pos - 1]) : null, rule, needLabels: !full };
  return full ? { pos: at(past.label), label: past.label, rule } : { label: past.label, rule, needLabels: true };
}

/**
 * The saved presses after a new picture. h = the saved presses; shown = the answered stage that was
 * on screen ({ pos, label, display, key: 'display|labels' }) or null; key = the new picture's
 * 'display|labels'; lit = its lit stage lights (stages done), null when they weren't read.
 * The lights decide: one more done = the answered stage was pressed, fewer = back to that stage
 * (a stage saved twice). Without them a different picture means the answered stage was pressed.
 */
export function stageAfterPicture(h, shown, key, lit) {
  const press = shown ? { pos: shown.pos, label: shown.label, display: shown.display } : null;
  if (lit !== null && lit !== undefined) {
    if (lit === h.length + 1 && press) return [...h, press];
    if (lit < h.length) return h.slice(0, lit);
    return h;
  }
  return press && key !== shown.key ? [...h, press] : h;
}
