import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseGIFFrames, framesToRLE, lightIsRed } from '../src/utils/gif.js';
import { decodeMorseBothWays } from '../src/modules/morse/morseDecoder.js';

const FIX = new URL('./fixtures/', import.meta.url).pathname;

test('morse: a game GIF that plays CARGO backwards is read both ways', async () => {
  const buf = fs.readFileSync(FIX + 'morse_cargo_reversed.gif');
  const frames = await parseGIFFrames(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
  const { forward, backward } = decodeMorseBothWays(framesToRLE(frames));
  assert.equal(forward.word, 'OWRN[.-.-]');
  assert.equal(forward.valid, false);
  assert.equal(backward.word, 'CARGO');
  assert.equal(backward.valid, true);
});

test('morse: a normal word still reads forward, its reverse is the mirror', () => {
  const dot = { is_on: true, duration: 100 }, dash = { is_on: true, duration: 300 };
  const gap = { is_on: false, duration: 100 }, letter = { is_on: false, duration: 300 }, word = { is_on: false, duration: 700 };
  // B E A T S
  const rle = [dash, gap, dot, gap, dot, gap, dot, letter, dot, letter, dot, gap, dash, letter, dash, letter, dot, gap, dot, gap, dot, word];
  const { forward, backward } = decodeMorseBothWays(rle);
  assert.equal(forward.word, 'BEATS');
  assert.equal(forward.frequency, '3.600 MHz');
  assert.equal(backward.word, 'STNEV'); // S T N E V: each letter's pulses mirrored too
});

test('morse: red light swaps long and short flashes', () => {
  const short = { is_on: true, duration: 100 }, long = { is_on: true, duration: 300 };
  const gap = { is_on: false, duration: 100 }, letter = { is_on: false, duration: 300 }, word = { is_on: false, duration: 700 };
  // BEATS sent with swapped flashes: every dash is short, every dot long
  const rle = [short, gap, long, gap, long, gap, long, letter, long, letter, long, gap, short, letter, short, letter, long, gap, long, gap, long, word];
  assert.notEqual(decodeMorseBothWays(rle).forward.word, 'BEATS');
  const { forward } = decodeMorseBothWays(rle, { swap: true });
  assert.equal(forward.word, 'BEATS');
  assert.equal(forward.frequency, '3.600 MHz');
  assert.equal(forward.swapped, true);
  // the third reading is always there: dots ⇄ dashes, next to forward and backward
  const three = decodeMorseBothWays(rle);
  assert.equal(three.swapped.word, 'BEATS');
  assert.equal(three.swapped.frequency, '3.600 MHz');
  assert.equal(three.swapped.swapped, true);
  assert.equal(three.forward.swapped, false);
});

test('morse: light colour — the blue game light is not red, a red one is', async () => {
  const buf = fs.readFileSync(FIX + 'morse_cargo_reversed.gif');
  const frames = await parseGIFFrames(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
  assert.equal(lightIsRed(frames), false);
  const off = { brightness: 47, rgb: [43, 47, 53], delay: 100 };
  const on = { brightness: 115, rgb: [235, 55, 50], delay: 100 };
  assert.equal(lightIsRed([off, on, off, on, on, off]), true);
});
