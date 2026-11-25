// Heist auto-send — content script. Loaded in every tab, but only active in the Heist app page:
// it tells the background script the app is open, and passes images to the app's message bridge
// (heistCore.js) and the answers back.

const isApp = () => !!(document.getElementById('modeSub') && document.getElementById('rawInput'));
let open = false;

function check() {
  const now = isApp();
  if (now !== open) {
    open = now;
    browser.runtime.sendMessage({ type: now ? 'app-ready' : 'app-gone' }).catch(() => {});
  }
}
check();
setInterval(check, 2000); // the React app switches to Heist via #play=heist without reloading

browser.runtime.onMessage.addListener(msg => {
  if (msg.type !== 'image' || !isApp()) return; // undefined → the background script tries another tab
  return new Promise(resolve => {
    const timer = setTimeout(() => { window.removeEventListener('message', onAnswer); resolve({ ok: false, error: 'the app took longer than 30 s' }); }, 30000);
    function onAnswer(event) {
      const d = event.data;
      if (event.source !== window || !d || d.source !== 'heist-app' || d.type !== 'answer' || d.id !== msg.id) return;
      clearTimeout(timer);
      window.removeEventListener('message', onAnswer);
      resolve({ ok: !!d.ok, text: d.text || '', needsReview: !!d.needsReview, map: !!d.map, kind: d.kind || '', error: d.error || '',
        words: d.words ? { ...d.words } : null, sorted: d.sorted ? { ...d.sorted } : null, letters: d.letters || '' });
    }
    window.addEventListener('message', onAnswer);
    const data = { source: 'heist-ext', type: 'image', id: msg.id, name: msg.name, mode: msg.mode || '', mime: msg.mime, buf: msg.buf };
    // Firefox: objects made in the content script must be cloned into the page before the page can read them
    window.postMessage(typeof cloneInto === 'function' ? cloneInto(data, window) : data, '*');
  });
});
