// Heist auto-send — background script.
//
// Watches the images the browser downloads from Discord's CDN (it does not read or change Discord pages).
// When a NEW attachment with a Heist file name shows up:
//   1. screenshots the Discord tab (pixels only, like Print Screen),
//   2. downloads the original image and hands it to the open Heist app tab (content.js → heistCore.js),
//   3. for Glass / Guard (digits → words), Caesar and Sort, reads the instruction above the picture with OCR
//      (rules.js) to pick the right answer: odd/even digits, direction, shift amount, sort order,
//   4. copies the answer (whoever the puzzle is for — carrying others is fine), or only notifies when unsure.

// ---- settings --------------------------------------------------------------------------------------
// File names the Heist game posts, without the extension (.png, .webp … all match). Ignored Discord
// attachments are logged in this extension's console (about:debugging → Inspect), so a missing name is
// easy to spot and add here.
const HEIST_NAMES = ['locksmith-captcha', 'locksmith-morse', 'locksmith-binary', 'locksmith-a1z26', 'vanguard-braille', 'vanguard-sort', 'gunner-shoot'];
// Map screenshots: only sent when "Blackout" is ticked in the extension's toolbar popup.
const MAP_NAMES = ['heist-map'];
// The app reads these in their own mode instead of guessing in All (fewer "check the app").
// Names not listed (gunner-shoot …) are auto-detected.
const NAME_MODE = {
  'locksmith-morse': 'morse', 'locksmith-binary': 'binary', 'locksmith-a1z26': 'a1z26', 'vanguard-braille': 'braille',
  'vanguard-sort': 'sort', 'locksmith-captcha': 'captcha'
};
// Only attachments posted in the last 2 minutes count. Discord also downloads OLD images when you scroll
// up or switch channels; the attachment id contains its creation time, so those are skipped.
const MAX_AGE_MS = 2 * 60 * 1000;
const SHOW_NOTIFICATIONS = true;
// -----------------------------------------------------------------------------------------------------

const DISCORD_EPOCH = 1420070400000n;
const seen = new Set();         // attachment ids already handled
const appTabs = new Map();      // tabId → time the Heist app said it is open
let chain = Promise.resolve();  // one image at a time, so answers reach the clipboard in order

// popup settings
const settings = { enabled: true, blackout: false };
// OFF: nothing is watched, screenshotted or read; the toolbar icon shows "OFF"
const showState = () => {
  browser.browserAction.setBadgeText({ text: settings.enabled ? '' : 'OFF' });
  browser.browserAction.setBadgeBackgroundColor({ color: '#777' });
  browser.browserAction.setTitle({ title: `Heist auto-send — ${settings.enabled ? 'ON' : 'OFF'}` });
};
browser.storage.local.get(['enabled', 'blackout']).then(v => {
  settings.enabled = v.enabled !== false;   // on unless switched off
  settings.blackout = !!v.blackout;
  showState();
  if (settings.enabled) ocr().catch(e => console.log('OCR start failed:', e));
});
browser.storage.onChanged.addListener(ch => {
  if (ch.blackout) settings.blackout = !!ch.blackout.newValue;
  if (ch.enabled) {
    settings.enabled = ch.enabled.newValue !== false;
    showState();
    if (settings.enabled) ocr().catch(e => console.log('OCR start failed:', e));
  }
});

function parseAttachment(url) {
  // https://cdn.discordapp.com/attachments/<channel>/<attachment id>/<file name>?ex=…&is=…&hm=…
  const u = new URL(url);
  const m = u.pathname.match(/^\/attachments\/(\d+)\/(\d+)\/([^/]+)$/);
  if (!m) return null;
  const id = m[2];
  const name = decodeURIComponent(m[3]).toLowerCase();
  const created = Number((BigInt(id) >> 22n) + DISCORD_EPOCH);
  // The original file: cdn.discordapp.com without the preview's resize / re-encode parameters
  const orig = new URL(url);
  orig.hostname = 'cdn.discordapp.com';
  for (const k of ['width', 'height', 'format', 'quality']) orig.searchParams.delete(k);
  return { id, name, created, original: orig.toString() };
}

const baseName = name => name.replace(/\.[a-z0-9]+$/, '');
function isHeistName(name) {
  const base = baseName(name);
  return HEIST_NAMES.includes(base) || (settings.blackout && MAP_NAMES.includes(base));
}

function notify(title, message) {
  if (!SHOW_NOTIFICATIONS) return;
  browser.notifications.create({ type: 'basic', title, message: message || '' }).catch(() => {});
}

async function sendToApp(att, buf, mime) {
  const tabs = [...appTabs.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  for (const tabId of tabs) {
    try {
      const res = await browser.tabs.sendMessage(tabId, { type: 'image', id: att.id, name: att.name, mode: NAME_MODE[baseName(att.name)] || '', buf, mime });
      if (res) return res;
    } catch (e) {
      appTabs.delete(tabId); // tab closed or navigated away
    }
  }
  return null;
}

// ---- screenshot + OCR of the instruction ----------------------------------------------------------
let ocrWorker = null;
function ocr() {
  if (!ocrWorker) {
    ocrWorker = Tesseract.createWorker('eng', 1, {
      workerPath: browser.runtime.getURL('ocr/worker.min.js'),
      corePath: browser.runtime.getURL('ocr/core'),
      langPath: browser.runtime.getURL('ocr/lang'),
      workerBlobURL: false,
      cacheMethod: 'none'
    }).catch(e => { ocrWorker = null; throw e; });
  }
  return ocrWorker;
}

/** Screenshot of the Discord tab as a canvas, or null if that tab isn't the one on screen. */
async function screenshot(tabId) {
  const tab = await browser.tabs.get(tabId);
  if (!tab.active) { console.log('Discord tab is not the one on screen — no screenshot'); return null; }
  const url = await browser.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  c.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0);
  c.scale = img.naturalWidth / (tab.width || img.naturalWidth); // device pixels per CSS pixel
  return c;
}

/** OCR a part of the screenshot; dark-theme text is inverted to dark-on-white first. */
async function readRect(shot, r) {
  const o = document.createElement('canvas');
  o.width = r.w; o.height = r.h;
  const g = o.getContext('2d', { willReadFrequently: true });
  g.drawImage(shot, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  const id = g.getImageData(0, 0, r.w, r.h), d = id.data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  const dark = sum / (d.length / 4) < 128;
  for (let i = 0; i < d.length; i += 4) {
    const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = dark ? 255 - v : v;
  }
  g.putImageData(id, 0, 0);
  const w = await ocr();
  return (await w.recognize(o)).data.text;
}

/** The instruction of the newest puzzle on screen: { text, rule, mention, how } or null. */
async function readInstruction(shot) {
  if (!shot) return null;
  const g = shot.getContext('2d', { willReadFrequently: true });
  const px = g.getImageData(0, 0, shot.width, shot.height).data;
  const panel = findPanel(px, shot.width, shot.height, Math.round(250 * shot.scale));
  let text, how;
  if (panel) {
    text = await readRect(shot, instructionRect(panel, shot.width, shot.scale));
    how = 'text above the puzzle picture';
  }
  if (!panel || !parseInstruction(text) && !mentionOf(text)) {
    // no white panel (or nothing readable above it): read the lower half of the screen, newest text wins
    const y = Math.round(shot.height * 0.45);
    text = await readRect(shot, { x: 0, y, w: shot.width, h: shot.height - y });
    how = 'lower half of the screen';
  }
  return { text, rule: parseInstruction(text), mention: mentionOf(text), how };
}

// ---- one image --------------------------------------------------------------------------------------
async function handle(att, shotP) {
  const t0 = performance.now();

  const res = await fetch(att.original, { credentials: 'omit' });
  if (!res.ok) throw new Error(`download failed (HTTP ${res.status})`);
  const blob = await res.blob();
  const answer = await sendToApp(att, await blob.arrayBuffer(), blob.type || 'image/png');
  const t1 = performance.now();
  if (!answer) return notify('Heist: app not open', `Open the Heist page to solve ${att.name}`);
  if (!answer.ok) return notify(`Heist: could not solve ${att.name}`, answer.error);
  if (answer.map) return notify('Heist: map screenshot added', 'Check the map in the app');

  const needsText = answer.kind === 'words' || answer.kind === 'caesar' || answer.kind === 'sort';
  let ins = null;
  if (needsText) {
    try { ins = await readInstruction(await shotP); }
    catch (e) { console.log('instruction OCR failed:', e); }
  }
  const t2 = performance.now();
  console.log(`${att.name}: app ${Math.round(t1 - t0)} ms, instruction ${Math.round(t2 - t1)} ms`, answer, ins);

  let text = answer.text, why = '';
  if (answer.kind === 'words') {
    if (!ins || !ins.rule || ins.rule.kind !== 'words') {
      return notify('Heist: check the app', 'Could not read the Glass instruction (odd / even, direction) — not copied');
    }
    text = (answer.words || {})[ins.rule.key] || '';
    why = ` (${ins.rule.key.replace('LR', ', left → right').replace('RL', ', right → left')})`;
  } else if (answer.kind === 'sort') {
    if (!ins || !ins.rule || ins.rule.kind !== 'sort') {
      return notify('Heist: check the app', 'Could not read the Sort order (ascending / descending) — not copied');
    }
    // both orders from the app, or (an app page opened before that was added) sort its numbers here
    const nums = String(answer.text || '').trim().split(/\s+/).map(Number);
    const sorted = answer.sorted || (nums.length && nums.every(Number.isFinite)
      ? { asc: [...nums].sort((a, b) => a - b).join(' '), desc: [...nums].sort((a, b) => b - a).join(' ') } : {});
    text = sorted[ins.rule.order] || '';
    why = ins.rule.order === 'desc' ? ' (descending)' : ' (ascending)';
  } else if (answer.kind === 'caesar') {
    if (!ins || !ins.rule || ins.rule.kind !== 'caesar' || !answer.letters) {
      return notify('Heist: check the app', 'Could not read the Caesar shift — not copied');
    }
    text = shiftLetters(answer.letters, ins.rule.shift);
    why = ` (${answer.letters} shifted ${ins.rule.shift > 0 ? '+' : ''}${ins.rule.shift})`;
  }
  if (ins && ins.mention) why += ` · for @${ins.mention}`;
  if (answer.needsReview || !text) return notify('Heist: check the app', `Unsure reading: ${text || '?'} — not copied`);
  await navigator.clipboard.writeText(text);
  notify('Heist: copied ✓', text + why);
}

browser.webRequest.onCompleted.addListener(details => {
  if (!settings.enabled) return;     // switched off in the popup
  if (details.tabId === -1) return; // our own download of the original
  let att;
  try { att = parseAttachment(details.url); } catch (e) { return; }
  if (!att || seen.has(att.id)) return;
  if (!isHeistName(att.name)) {
    console.log(MAP_NAMES.includes(baseName(att.name)) ? `map ${att.name} ignored (Blackout is off)` : `ignored attachment: ${att.name}`);
    return;
  }
  seen.add(att.id);
  const age = Date.now() - att.created;
  if (age > MAX_AGE_MS) { console.log(`old ${att.name} (${Math.round(age / 1000)} s) — skipped`); return; }
  console.log('heist image:', att.name, att.original);
  // the screenshot right away, while the new message is surely on screen (even if an earlier image is
  // still being solved); a short wait lets Discord paint it
  const shotP = new Promise(r => setTimeout(r, 120)).then(() => screenshot(details.tabId))
    .catch(e => { console.log('screenshot failed:', e); return null; });
  chain = chain.then(() => handle(att, shotP)).catch(e => notify('Heist: error', String(e.message || e)));
}, { urls: ['*://cdn.discordapp.com/attachments/*', '*://media.discordapp.net/attachments/*'] });

browser.runtime.onMessage.addListener((msg, sender) => {
  if (!sender.tab) return;
  if (msg.type === 'app-ready') appTabs.set(sender.tab.id, Date.now());
  if (msg.type === 'app-gone') appTabs.delete(sender.tab.id);
});
browser.tabs.onRemoved.addListener(id => appTabs.delete(id));
