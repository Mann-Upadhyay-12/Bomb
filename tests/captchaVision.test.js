// The captcha reader as the app runs it (src/heist/captcha/captchaVision.js + captchaSpec.js), on the
// labelled captchas in captcja/ (not in git — those tests skip without it).
// CAPTCHA_SPEC=path/to/spec.json tests another model (e.g. files(1)/study/spec_final.json) before it ships.
// Note: the shipped model trained on these images, so this checks the ENGINE (same answers as Python,
// wasm = JS, weight formats decode right), not the model's accuracy — compress_study.py measures that.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCaptchaVision } from '../src/heist/captcha/captchaVision.js';
import { SPEC as APP_SPEC } from '../src/heist/captcha/captchaSpec.js';
import { readPng } from './pngDecode.js';

const SPEC = process.env.CAPTCHA_SPEC ? JSON.parse(fs.readFileSync(process.env.CAPTCHA_SPEC, 'utf8')) : APP_SPEC;
const DIR = new URL('../captcja/', import.meta.url).pathname;
const HAVE = fs.existsSync(DIR);
const NATIVE = { 360: 4, 434: 6, 542: 8 };

function labelled(every) {
  return fs.readdirSync(DIR).filter(f => f.endsWith('.png')).sort().filter((_, i) => i % every === 0)
    .map(f => ({ f, truth: f.replace(/\.png$/, '').split('-')[0] }))
    .filter(({ truth }) => [...truth].every(c => SPEC.charset.includes(c)));
}
function prepared(cv, f) {
  const { data, width, height } = readPng(DIR + f);
  if (height !== 210 || NATIVE[width] == null) return null;
  return cv.prepRGBA(data, width, NATIVE[width]);
}

// encoded by files(1)/spec_io.py quantize() — the JS decoder must give back the same numbers
const PY = {"nout": 12, "int8_channel": {"field": {"q8": "gYGBgYGBgYuVnaWttLa3uby+wcjP1tzh5+ruHfb7AAUKDhIWGR8kKjE4P0JER0lKTFNbY2t1f39/f39/", "s": "1hhhIpgl0SfuKN0ptSoOLM0sly1tLk8v"}, "expect": [-0.299885, -1.582268, -2.775024, -3.87767, -4.891174, -5.817474, -6.654633, -7.412476, -8.026306, -8.64679, -9.136658, -9.478333, -0.179459, -0.921951, -1.595093, -2.167831, -2.618896, -3.023254, -3.301117, -3.547852, -3.675598, -3.668335, -3.614502, -3.5401, -0.059032, -0.274094, -0.393311, 0.885452, -0.385132, -0.229034, 0.0, 0.316772, 0.750122, 1.222778, 1.807251, 2.512329, 0.059032, 0.386223, 0.786621, 1.282379, 1.887146, 2.565186, 3.301117, 4.181396, 5.10083, 6.201233, 7.329407, 8.450562, 0.179459, 1.034081, 1.988403, 3.022751, 4.120911, 5.359406, 6.654633, 8.046021, 9.52655, 11.092346, 12.75116, 14.502991]}, "int4_g2": {"field": {"q4": "mZmZmZmZzMzM3d3duVz/EBEid3d3d3d3d3d3d3d3", "s": "fCk7M1g2bziXOaY6mzs7PJs87jw1PW49YyD7Kj8v6TFNNNo1mzfION05CzsqPNs8lSa9MIg05Ta7OB46mzuZPHE9Vz5KPyVA", "g": 2, "n": 60}, "expect": [-0.299927, -1.581665, -2.775391, -3.879395, -4.891113, -5.817383, -6.654785, -7.40332, -8.05957, -8.626953, -9.112305, -9.501953, -0.171387, -0.903809, -1.585938, -2.216797, -2.794922, -3.324219, -2.852051, -3.172852, -3.454102, -3.697266, -3.905273, -4.072266, -0.059975, -0.272675, -0.452881, 0.923462, -0.268799, -0.365723, 0.0, 0.597656, 0.73291, 0.880371, 2.082031, 2.427734, 0.059975, 0.381744, 0.792542, 1.292847, 1.881592, 2.560059, 3.327393, 4.183594, 5.130371, 6.162598, 7.287109, 8.49707, 0.179977, 1.036499, 1.982422, 3.016357, 4.13916, 5.352539, 6.654785, 8.045898, 9.522461, 11.094727, 12.755859, 14.505859]}};

test('captcha weights: int8 and int4 fields decode to what the Python exporter encoded', () => {
  const cv = createCaptchaVision(SPEC, { wasm: false });
  for (const k of ['int8_channel', 'int4_g2']) {
    const got = cv.decodeWeight(PY[k].field, PY.nout);
    assert.equal(got.length, PY[k].expect.length);
    PY[k].expect.forEach((v, i) => assert.ok(Math.abs(got[i] - v) < 1e-5, `${k}[${i}] ${got[i]} vs ${v}`));
  }
});

test('captcha reader: labelled captchas are read right (wasm engine, as shipped incl. adaptive TTA)', { skip: !HAVE && 'no captcja/' }, async () => {
  const cv = createCaptchaVision(SPEC);
  await cv.ready;
  assert.equal(cv.engine(), 'wasm');
  let ok = 0, n = 0, reads = 0, trusted = 0, trustedWrong = 0;
  for (const { f, truth } of labelled(5)) {
    const p = prepared(cv, f); if (!p) continue;
    const r = cv.recognizePrepared(p);
    n++; ok += r.text === truth; reads += r.reads;
    if (r.confidence >= cv.THRESH) { trusted++; trustedWrong += r.text !== truth; }
  }
  const tta = SPEC.tta && SPEC.tta.shifts.length;
  console.log(`  ${ok}/${n} right, ${(reads / n).toFixed(2)} reads per captcha (max ${tta || 1}), ` +
    `${trusted} trusted (${trustedWrong} of them wrong)`);
  assert.ok(n > 80);
  assert.ok(ok / n >= 0.97, `only ${ok}/${n} right`);
  if (SPEC.tta && SPEC.tta.stop != null) assert.ok(reads / n < tta, 'adaptive TTA never stopped early');
});

test('captcha reader: the JS engine gives the same answers as the wasm engine', { skip: !HAVE && 'no captcja/' }, async () => {
  const wasm = createCaptchaVision(SPEC), js = createCaptchaVision(SPEC, { wasm: false });
  await wasm.ready;
  for (const { f } of labelled(97)) {
    const p = prepared(js, f); if (!p) continue;
    const a = wasm.recognizePrepared(p), b = js.recognizePrepared(p);
    assert.equal(a.text, b.text, f);
    assert.equal(a.reads, b.reads, f);
    assert.ok(Math.abs(a.confidence - b.confidence) < 1e-3, `${f}: ${a.confidence} vs ${b.confidence}`);
  }
  assert.equal(js.engine(), 'js');
});

test('captcha reader: shapes the SIMD kernel cannot run fall back to the JS engine', async () => {
  const odd = { ...SPEC, head: { ...SPEC.head, nout: 27 } };    // 27 outputs: not a multiple of 4
  const cv = createCaptchaVision(odd);
  await cv.ready;
  assert.equal(cv.engine(), 'js');
});
