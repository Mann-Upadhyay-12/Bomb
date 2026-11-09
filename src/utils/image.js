// Image source extraction and async loading utilities

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
    fetch(srcObj.url)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
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
