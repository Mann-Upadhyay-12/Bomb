// Simon Says rules and vision analysis

export const SINAMES = { R: 'Red', B: 'Blue', Y: 'Yellow', G: 'Green' };

export const SIMON_DEFAULT_RULES = `Even number of non-needy modules disarmed

* If red flashes, press red.
* If blue flashes, press green.
* If yellow flashes, press yellow.
* If green flashes, press blue.

Odd number of non-needy modules disarmed

* If red flashes, press green.
* If blue flashes, press red.
* If yellow flashes, press blue.
* If green flashes, press yellow.`;

export const SIL1 = { red: 'R', blue: 'B', yellow: 'Y', green: 'G' };

export function parseSimonRules(txt) {
  const m = { even: {}, odd: {} };
  let cur = null;
  for (const line of txt.split(/\r?\n/)) {
    const l = line.toLowerCase();
    if (/\beven\b/.test(l) && /number|modules|disarmed/.test(l) && !/flash/.test(l)) { cur = 'even'; continue; }
    if (/\bodd\b/.test(l) && /number|modules|disarmed/.test(l) && !/flash/.test(l)) { cur = 'odd'; continue; }
    const r = l.match(/(red|blue|yellow|green)\s+flashes.*?press\s+(red|blue|yellow|green)/);
    if (r && cur) m[cur][SIL1[r[1]]] = SIL1[r[2]];
  }
  for (const s of ['even', 'odd']) {
    for (const c of 'RBYG') {
      if (!m[s][c]) return null;
    }
  }
  return m;
}

// Button positions as fraction of image width/height (KTANE layout: B=top, R=left, G=right, Y=bottom)
export const SIPos = { B: [0.50, 0.30], R: [0.28, 0.55], G: [0.72, 0.55], Y: [0.50, 0.78] };
export const SITHRESH = 28;

export function analyzeSimonFrame(ctx, w, h) {
  const r = Math.max(3, Math.round(Math.min(w, h) * 0.04));
  let best = null, bs = SITHRESH;
  for (const k in SIPos) {
    const x = Math.round(SIPos[k][0] * w), y = Math.round(SIPos[k][1] * h);
    const d = ctx.getImageData(Math.max(0, x - r), Math.max(0, y - r), 2 * r + 1, 2 * r + 1).data;
    let Rc = 0, Gc = 0, Bc = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      Rc += d[i]; Gc += d[i + 1]; Bc += d[i + 2]; n++;
    }
    Rc /= n; Gc /= n; Bc /= n;
    let score;
    if (k === 'R') score = Rc - Math.max(Gc, Bc);
    else if (k === 'B') score = Bc - Math.max(Rc, Gc);
    else if (k === 'G') score = Gc - Math.max(Rc, Bc);
    else score = (Rc + Gc) / 2 - Bc;

    if (score > bs) { bs = score; best = k; }
  }
  return best;
}
