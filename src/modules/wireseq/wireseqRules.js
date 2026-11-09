export const WS_DEFAULT_MANUAL = `Red
* first red occurrence: cut if connected to C.
* second red occurrence: cut if connected to C.
* third red occurrence: cut if connected to C.
* fourth red occurrence: cut if connected to B or C.
* fifth red occurrence: cut if connected to A.
* sixth red occurrence: cut if connected to B.
* seventh red occurrence: cut if connected to B or C.
* eighth red occurrence: cut if connected to A, B or C.
* ninth red occurrence: cut if connected to A, B or C.

Blue
* first blue occurrence: cut if connected to B or C.
* second blue occurrence: cut if connected to A.
* third blue occurrence: cut if connected to C.
* fourth blue occurrence: cut if connected to A, B or C.
* fifth blue occurrence: cut if connected to A or C.
* sixth blue occurrence: cut if connected to B or C.
* seventh blue occurrence: cut if connected to B.
* eighth blue occurrence: cut if connected to A, B or C.
* ninth blue occurrence: cut if connected to A.

Black
* first black occurrence: cut if connected to A, B or C.
* second black occurrence: cut if connected to A or C.
* third black occurrence: cut if connected to C.
* fourth black occurrence: cut if connected to A or B.
* fifth black occurrence: cut if connected to A or C.
* sixth black occurrence: cut if connected to A, B or C.
* seventh black occurrence: cut if connected to B or C.
* eighth black occurrence: cut if connected to B.
* ninth black occurrence: cut if connected to C.`;

const WS_ORD = {first:1,second:2,third:3,fourth:4,fifth:5,sixth:6,seventh:7,eighth:8,ninth:9};

export function wsParseManual(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/^[*\u2022\-]+/, '').trim().toLowerCase();
    const m = line.match(/^(\w+)\s+(red|blue|black)\s+occurrence:.*connected to\s+(.+?)\.?$/);
    if (!m || !(m[1] in WS_ORD)) continue;
    const letters = new Set((m[3].match(/\b[abc]\b/g) || []).map(s => s.toUpperCase()));
    (out[m[2]] = out[m[2]] || {})[WS_ORD[m[1]]] = letters;
  }
  return out;
}
