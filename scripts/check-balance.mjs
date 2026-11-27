#!/usr/bin/env node
// Reads every Balance picture in tests/fixtures/balance_truth.json with the app's own reader, in a
// headless Chrome (the reader needs a canvas, and Tesseract for glyphs with no sample), and prints ✓ / ✗.
//
//   node scripts/check-balance.mjs          read each picture with every glyph sample
//   node scripts/check-balance.mjs --loo    each picture with its own samples left out: how the reader
//                                           does on a picture it hasn't learnt from (the honest number)
//   node scripts/check-balance.mjs --bank   rebuild src/modules/balance/balanceGlyphBank.js from the
//                                           pictures: every glyph of a side whose cut-up glyphs line up
//                                           one-to-one with the right equation becomes a sample
//
// A new picture that reads wrong: save it as tests/fixtures/balance_<name>.png (as sent, not
// re-screenshotted), add its right equation to balance_truth.json, run --bank, then the plain check.
//
// Chrome: Playwright's cached headless shell (~/.cache/ms-playwright), or CHROME=/path/to/chrome.
// Starts its own Vite dev server.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TRUTH = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/balance_truth.json'), 'utf8'));
const BANK_FILE = path.join(ROOT, 'src/modules/balance/balanceGlyphBank.js');
const mode = process.argv.includes('--bank') ? 'bank' : process.argv.includes('--loo') ? 'loo' : 'read';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const base = path.join(os.homedir(), '.cache/ms-playwright');
  const dirs = fs.existsSync(base) ? fs.readdirSync(base).filter(d => /^chromium/.test(d)).sort().reverse() : [];
  for (const d of dirs) {
    for (const sub of fs.readdirSync(path.join(base, d))) {
      for (const exe of ['chrome-headless-shell', 'chrome']) {
        const p = path.join(base, d, sub, exe);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  throw new Error('No Chrome found: set CHROME=/path/to/chrome (or install one with `npx playwright install chromium`)');
}

// ── in the page ──
const PAGE_SRC = `async (truth, mode) => {
  const V = await import('/src/modules/balance/balanceVision.js');
  // Tesseract loaded before the first picture (its first download can take a while)
  if (mode !== 'bank') await (await import('/src/modules/search/searchOCR.js')).ensureOCRWorker();
  const short = (f) => f.replace(/^balance_|\\.png$/g, '');
  const load = async (f) => { const img = new Image(); img.src = '/tests/fixtures/' + f; await img.decode(); return img; };
  if (mode === 'bank') {
    const samples = [], report = [];
    const toks = (side) => [...side.replace(/\\s+/g, '')].map(ch => ({ ch, sub: /[0-9]/.test(ch) }));
    for (const [f, eq] of Object.entries(truth)) {
      const loc = V.locateEquation(await load(f));
      const [L, R] = eq.split('→').map(s => s.trim());
      for (const [name, n, side] of [['left', loc.leftN, L], ['right', loc.rightN, R]]) {
        const t = toks(side), gs = n ? n.glyphs : [];
        const ok = gs.length === t.length && gs.every((g, i) => g.sub === t[i].sub);
        report.push((ok ? '  ✓ ' : '  · ') + short(f) + ' ' + name + (ok ? '' : ' (its glyphs don\\'t line up with "' + side + '": skipped)'));
        if (!ok) continue;
        gs.forEach((g, i) => { if (g.feat) samples.push({ ch: t[i].ch, sub: g.sub, f: { aspect: g.feat.aspect, relH: g.feat.relH, relTop: g.feat.relTop, relBot: g.feat.relBot, v: Array.from(g.feat.v, x => Math.round(x * 9)).join('') }, src: short(f) }); });
      }
    }
    return { samples, report };
  }
  const lines = []; let right = 0;
  for (const [f, eq] of Object.entries(truth)) {
    const img = await load(f);
    const exclude = mode === 'loo' ? short(f) : null;
    const loc = V.locateEquation(img, { exclude });
    const gl = [...(loc.leftN ? loc.leftN.glyphs : []), ...(loc.rightN ? loc.rightN.glyphs : [])];
    const tess = gl.filter(g => !(g.shape && g.shape.sure)).length;
    let r; try { r = await V.readEquationImage(img, () => {}, { exclude }); } catch (e) { r = { equation: 'error: ' + e.message }; }
    const ok = r.equation === eq && r.parsed; if (ok) right++;
    lines.push((ok ? '  ✓ ' : '  ✗ ') + short(f).padEnd(24) + ' ' + r.equation + (ok ? '' : '   (right: ' + eq + ')') + '   [' + tess + '/' + gl.length + ' glyphs by Tesseract]');
  }
  return { right, lines };
}`;

async function main() {
  const port = 5300 + Math.floor(Math.random() * 400);
  const vite = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  // kept between runs, so Tesseract's language file is downloaded once
  const prof = path.join(os.tmpdir(), 'check-balance-chrome');
  const cdpPort = 9400 + Math.floor(Math.random() * 400);
  const chrome = spawn(findChrome(), [`--remote-debugging-port=${cdpPort}`, '--no-sandbox', `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
  const stop = () => { try { chrome.kill(); } catch (e) {} try { vite.kill(); } catch (e) {} };
  try {
    for (let i = 0; ; i++) { try { await fetch(`http://localhost:${port}/`); break; } catch (e) { if (i > 100) throw new Error('Vite did not start'); await sleep(200); } }
    let targets;
    for (let i = 0; ; i++) { try { targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json(); break; } catch (e) { if (i > 100) throw new Error('Chrome did not start'); await sleep(200); } }
    const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0; const pending = new Map();
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
    const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    await send('Page.enable');
    await send('Page.navigate', { url: `http://localhost:${port}/#play=bomb` });
    await sleep(3000);
    const r = await send('Runtime.evaluate', { expression: `(${PAGE_SRC})(${JSON.stringify(TRUTH)}, ${JSON.stringify(mode)})`, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'page error');
    const out = r.result.result.value;
    ws.close();
    if (mode === 'bank') {
      writeBank(out.samples);
      console.log(out.report.join('\n'));
    } else {
      console.log(out.lines.join('\n'));
      console.log(`\n${out.right}/${Object.keys(TRUTH).length} right${mode === 'loo' ? ' (each picture read without its own glyph samples)' : ''}`);
      process.exitCode = out.right === Object.keys(TRUTH).length ? 0 : 1;
    }
  } finally { stop(); }
}

// samples → balanceGlyphBank.js, leaving out near-copies of one character from one picture
function writeBank(samples) {
  const vec = (s) => Array.from(s.f.v, c => Number(c) / 9);
  const corr = (a, b) => {
    const ma = a.reduce((x, y) => x + y, 0) / a.length, mb = b.reduce((x, y) => x + y, 0) / b.length;
    let sab = 0, saa = 0, sbb = 0;
    for (let i = 0; i < a.length; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
    return saa && sbb ? sab / Math.sqrt(saa * sbb) : 0;
  };
  const kept = [];
  for (const s of samples) {
    const dup = kept.some(k => k.ch === s.ch && k.sub === s.sub && k.src === s.src && corr(vec(k), vec(s)) > 0.97 && Math.abs(Math.log(k.f.aspect / s.f.aspect)) < 0.05);
    if (!dup) kept.push(s);
  }
  const r3 = (x) => Math.round(x * 1000) / 1000;
  const rows = kept.map(s => `  [${JSON.stringify(s.ch)},${s.sub ? 1 : 0},${r3(s.f.aspect)},${r3(s.f.relH)},${r3(s.f.relTop)},${r3(s.f.relBot)},"${s.f.v}","${s.src}"],`);
  fs.writeFileSync(BANK_FILE, `// Real glyphs cut from the game's Balance pictures (tests/fixtures/balance_*.png): [character,
// subscript?, width/height, height/cap height, top below the cap line, bottom below the baseline,
// 12×12 ink coverage 0–9, picture]. Rebuilt by scripts/check-balance.mjs --bank.
export const BALANCE_GLYPH_BANK = [
${rows.join('\n')}
];
`);
  const chars = [...new Set(kept.map(s => s.ch + (s.sub ? '₍sub₎' : '')))].sort().join(' ');
  console.log(`${samples.length} glyphs → ${kept.length} samples written to ${path.relative(ROOT, BANK_FILE)}\ncharacters: ${chars}\n`);
}

main().catch((e) => { console.error(e.message || e); process.exitCode = 2; });
