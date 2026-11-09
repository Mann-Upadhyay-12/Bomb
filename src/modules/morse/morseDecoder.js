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

export function decodeMorseRLE(rle) {
  const onDurs = rle.filter(x => x.is_on).map(x => x.duration).sort((a, b) => a - b);
  if (!onDurs.length) return { letters: [], unit: 100 };
  const unit = onDurs[0];
  const letters = [];
  let cur = [];

  for (const { is_on, duration } of rle) {
    if (is_on) {
      cur.push(duration > unit * 2 ? '-' : '.');
    } else {
      if (duration > unit * 5) {
        if (cur.length) {
          const code = cur.join('');
          letters.push({ code, char: MORSE_TABLE[code] || `[${code}]` });
          cur = [];
        }
        letters.push({ code: ' ', char: ' ' });
      } else if (duration > unit * 2) {
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

  return { letters, unit, word, frequency };
}
