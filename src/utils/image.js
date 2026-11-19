// Image source extraction and async loading utilities

// A dropped or pasted Discord link has to open a connection to Discord's CDN before the download
// starts (DNS + TCP + TLS + first response: ~0.7 s median on a slow line, measured). Sending a tiny
// request while the drag is still in the air, or when the page gets focus just before a Ctrl+V,
// leaves a warm connection for the real fetch: ~0.25 s median. A <link rel=preconnect> did not
// help in the same test, so this is a real HEAD request (no-cors, no cookies, nothing read back).
const IMAGE_HOSTS = ['https://cdn.discordapp.com/', 'https://media.discordapp.net/'];
let warmedAt = -Infinity;
export function warmImageHosts() {
  if (typeof fetch !== 'function') return;
  const now = Date.now();
  if (now - warmedAt < 20000) return; // an open connection stays usable for a while
  warmedAt = now;
  for (const url of IMAGE_HOSTS) {
    fetch(url, { method: 'HEAD', mode: 'no-cors', credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' }).catch(() => {});
  }
}
// A drag that carries a link (not a file from disk) is about to need the network.
export const dragHasLink = dt => {
  const types = Array.from((dt && dt.types) || []);
  return !types.includes('Files') && types.some(t => t === 'text/uri-list' || t === 'text/html' || t === 'text/plain');
};

// fetch with a time limit: a stalled download must not leave "Downloading image…" up forever
async function fetchImageBlob(url, ms = 15000) {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), ms) : null;
  try {
    const res = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctl ? ctl.signal : undefined });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.blob();
  } finally { clearTimeout(timer); }
}

export function extractImageSource(dt) {
  if (!dt) return null;
  // 1. Local file or blob
  if (dt.files && dt.files.length > 0) {
    for (const f of dt.files) {
      if (!f.type || f.type.startsWith('image/')) return { type: 'file', file: f };
    }
    return { type: 'file', file: dt.files[0] };
  }
  if (dt.items && dt.items.length > 0) {
    for (const it of dt.items) {
      if (it.kind === 'file') {
        const f = it.getAsFile();
        if (f) return { type: 'file', file: f };
      }
    }
  }
  // 2. URL from uri-list or text
  const uriList = dt.getData('text/uri-list');
  if (uriList) {
    const urls = uriList.split(/[\r\n]+/).map(s => s.trim()).filter(s => s && !s.startsWith('#'));
    if (urls.length > 0) return { type: 'url', url: urls[0] };
  }
  const text = dt.getData('text/plain') || dt.getData('text');
  if (text) {
    const trimmed = text.trim();
    if (/^https?:\/\//i.test(trimmed)) return { type: 'url', url: trimmed };
  }
  // 3. HTML img tag or link
  const html = dt.getData('text/html');
  if (html) {
    const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch && imgMatch[1]) return { type: 'url', url: imgMatch[1] };
    const aMatch = html.match(/<a[^>]+href=["']([^"']+)["']/i);
    if (aMatch && aMatch[1] && /^https?:\/\//i.test(aMatch[1])) return { type: 'url', url: aMatch[1] };
  }
  return null;
}

export function extractImageFromPaste(cd) {
  if (!cd) return null;
  if (cd.items) {
    for (const item of cd.items) {
      if (item.type && item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        if (blob) return { type: 'file', file: blob };
      }
    }
  }
  if (cd.files && cd.files.length > 0) return { type: 'file', file: cd.files[0] };
  const text = cd.getData('text/plain') || cd.getData('text');
  if (text) {
    const trimmed = text.trim();
    if (/^https?:\/\//i.test(trimmed)) return { type: 'url', url: trimmed };
  }
  return null;
}

export function loadImageSource(srcObj, onLoaded, onError) {
  if (!srcObj) return;
  const hint = typeof document !== 'undefined' ? document.getElementById('hint') : null;

  if (srcObj.type === 'file') {
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => onLoaded(img, ev.target.result, srcObj.file);
      img.onerror = () => {
        const msg = "That file doesn't look like a readable image.";
        if (hint) hint.textContent = msg;
        if (onError) onError(msg);
      };
      img.src = ev.target.result;
    };
    reader.onerror = () => {
      const msg = "Could not read image file.";
      if (hint) hint.textContent = msg;
      if (onError) onError(msg);
    };
    reader.readAsDataURL(srcObj.file);
  } else if (srcObj.type === 'url') {
    if (hint) hint.textContent = 'Fetching image from URL…';
    fetchImageBlob(srcObj.url)
      .then(blob => {
        const reader = new FileReader();
        reader.onload = ev => {
          const img = new Image();
          img.onload = () => {
            if (hint) hint.textContent = '';
            onLoaded(img, ev.target.result, blob);
          };
          img.onerror = () => {
            const msg = "Could not parse image from URL.";
            if (hint) hint.textContent = msg;
            if (onError) onError(msg);
          };
          img.src = ev.target.result;
        };
        reader.readAsDataURL(blob);
      })
      .catch(() => {
        // Fallback: crossOrigin anonymous Image loading
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          if (hint) hint.textContent = '';
          onLoaded(img, srcObj.url, null);
        };
        img.onerror = () => {
          const msg = '⚠️ Could not load image from URL (blocked by CORS or link expired). Tip: In Discord, right-click image → Copy Image → Ctrl+V here.';
          if (hint) hint.textContent = msg;
          if (onError) onError(msg);
        };
        img.src = srcObj.url;
      });
  }
}
