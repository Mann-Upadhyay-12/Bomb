// Morse code lookup table and RLE timing decoder

export const MORSE_TABLE = {
  '.-': 'A', '-...': 'B', '-.-.': 'C', '-..': 'D', '.': 'E', '..-.': 'F', '--.': 'G', '....': 'H', '..': 'I',
  '.---': 'J', '-.-': 'K', '.-..': 'L', '--': 'M', '-.': 'N', '---': 'O', '.--.': 'P', '--.-': 'Q', '.-.': 'R',
  '...': 'S', '-': 'T', '..-': 'U', '...-': 'V', '.--': 'W', '-..-': 'X', '-.--': 'Y', '--..': 'Z',
  '.----': '1', '..---': '2', '...--': '3', '....-': '4', '.....': '5',
  '-....': '6', '--...': '7', '---..': '8', '----.': '9', '-----': '0',
  '.-.-.-': '.', '--..--': ',', '..--..': '?', '-.-.--': '!', '-..-.': '/',
  '...---...': 'SOS'
};

export const MORSE_FREQUENCIES = {
  SHELL: '3.505 MHz',
  HALLS: '3.515 MHz',
  SLICK: '3.522 MHz',
  TRICK: '3.532 MHz',
  BOXES: '3.535 MHz',
  LEAKS: '3.542 MHz',
  STROBE: '3.545 MHz',
  BISTRO: '3.552 MHz',
  FLICK: '3.555 MHz',
  BOMBS: '3.565 MHz',
  BREAK: '3.572 MHz',
  BRICK: '3.575 MHz',
  STEAK: '3.582 MHz',
  STING: '3.592 MHz',
  VECTOR: '3.595 MHz',
  BEATS: '3.600 MHz'
};

// Split durations into a short and a long group (1-D Otsu on a log scale, so a single odd
// value can't claim a group of its own). Returns null when there is no clear second group.
function splitShortLong(durs) {
  const v = [...durs].sort((a, b) => a - b);
  if (v.length < 2) return null;
  const lg = v.map(d => Math.log(Math.max(d, 1)));
  const total = lg.reduce((s, x) => s + x, 0);
  let best = null, left = 0;
  for (let k = 1; k < v.length; k++) {
    left += lg[k - 1];
    if (v[k] === v[k - 1]) continue;
    const mL = left / k, mR = (total - left) / (v.length - k);
    const score = k * (v.length - k) * (mR - mL) ** 2; // between-group spread
    if (!best || score > best.score) best = { score, k };
  }
  if (!best) return null;
  const lo = v.slice(0, best.k), hi = v.slice(best.k);
  const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
  const loMean = mean(lo), hiMean = mean(hi);
  if (hiMean / loMean < 1.7) return null; // dot vs dash is ~3×; jitter alone stays well under 1.7×
  return { cut: (lo[lo.length - 1] + hi[0]) / 2, loMean, hiMean };
}

/**
 * The dot/dash and gap cut-offs for one signal, learnt from the signal itself.
 * GIF captures are quantized to whole frames (100 ms), so a 1-unit flash can read 300 ms and a
 * 3-unit one 600 ms — a fixed "2 × the shortest flash" cut-off put such dashes on the dot side.
 *   on  > dashAt   → dash (else dot)
 *   off > wordAt   → word gap; off > letterAt → letter gap; else a gap inside a letter
 */
export function morseTiming(rle) {
  const ons = rle.filter(x => x.is_on).map(x => x.duration);
  const offs = rle.filter(x => !x.is_on).map(x => x.duration);
  if (!ons.length) return null;
  let unit, dashAt;
  const on = splitShortLong(ons);
  if (on) {
    unit = (on.loMean + on.hiMean / 3) / 2;
    dashAt = on.cut;
  } else {
    // every flash the same length: dots, or dashes when they are much longer than the shortest gap
    const m = ons.reduce((s, x) => s + x, 0) / ons.length;
    const allDashes = offs.length > 0 && m >= 2 * Math.min(...offs);
    unit = allDashes ? m / 3 : m;
    dashAt = 2 * unit;
  }
  const wordAt = 5 * unit;
  const gaps = splitShortLong(offs.filter(d => d <= wordAt));
  return { unit: Math.round(unit), dashAt, letterAt: gaps ? gaps.cut : dashAt, wordAt };
}

/**
 * swap: true for a red light, where long and short flashes are swapped (a short flash is a dash).
 */
export function decodeMorseRLE(rle, { swap = false } = {}) {
  const timing = morseTiming(rle);
  if (!timing) return { letters: [], unit: 100 };
  const { unit, dashAt, letterAt, wordAt } = timing;
  const letters = [];
  let cur = [];

  for (const { is_on, duration } of rle) {
    if (is_on) {
      cur.push((duration > dashAt) !== swap ? '-' : '.');
    } else {
      if (duration > wordAt) {
        if (cur.length) {
          const code = cur.join('');
          letters.push({ code, char: MORSE_TABLE[code] || `[${code}]` });
          cur = [];
        }
        letters.push({ code: ' ', char: ' ' });
      } else if (duration > letterAt) {
        if (cur.length) {
          const code = cur.join('');
          letters.push({ code, char: MORSE_TABLE[code] || `[${code}]` });
          cur = [];
        }
      }
    }
  }

  if (cur.length) {
    const code = cur.join('');
    letters.push({ code, char: MORSE_TABLE[code] || `[${code}]` });
  }

  const rawWord = letters.map(l => l.char).join('').trim();
  const cleanWord = rawWord.replace(/[^A-Z]/g, '');
  let word = rawWord;
  let frequency = MORSE_FREQUENCIES[cleanWord] || '';

  // The transmitter GIF loops, so the capture can begin mid-word
  // (e.g. "LLSHE" for SHELL). Try every rotation against the known words.
  if (!frequency && cleanWord.length > 1) {
    for (let i = 1; i < cleanWord.length; i++) {
      const rotated = cleanWord.slice(i) + cleanWord.slice(0, i);
      if (MORSE_FREQUENCIES[rotated]) {
        word = rotated;
        frequency = MORSE_FREQUENCIES[rotated];
        break;
      }
    }
  }

  // every pulse group is a real letter (no "[.-.-]")
  const valid = letters.every(l => l.char === ' ' || MORSE_TABLE[l.code]);
  return { letters, unit, dashAt, letterAt, wordAt, word, frequency, valid, swapped: swap };
}

/**
 * Three readings of one signal, and the player picks the one that makes sense:
 *  forward  — as sent;
 *  backward — some games play the word backwards (CARGO came through as "OWRN[.-.-]");
 *  swapped  — forward with dots and dashes swapped (a red light: a short flash is a dash).
 * opts.swap flips the base: forward / backward swapped, and "swapped" back to normal.
 */
export function decodeMorseBothWays(rle, opts = {}) {
  const swap = Boolean(opts.swap);
  return {
    forward: decodeMorseRLE(rle, { swap }),
    backward: decodeMorseRLE([...rle].reverse(), { swap }),
    swapped: decodeMorseRLE(rle, { swap: !swap })
  };
}
