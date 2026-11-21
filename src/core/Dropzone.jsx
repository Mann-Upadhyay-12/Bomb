import React, { useRef, useState, useEffect } from 'react';
import { extractImageSource, extractImageFromPaste, loadImageSource, warmImageHosts, dragHasLink } from '../utils/image.js';
import { useInstance } from './InstanceContext.jsx';

// Phones can't Ctrl+V or drag & drop. This is a real text box: long-press it → Paste works with no
// clipboard permission (a normal paste event). It takes a pasted image, or an image link (Discord
// "Copy Link" works — cdn.discordapp.com allows other sites to read its images).
const URL_RE = /https?:\/\/[^\s<>"']+/i;
export function PasteBox({ onSource, busy }) {
  const ref = useRef(null);
  const [msg, setMsg] = useState('');
  const clear = () => { if (ref.current) ref.current.innerHTML = ''; };
  // the "Loading…" note goes away once the image has loaded
  useEffect(() => { if (!busy) setMsg(m => (m.startsWith('Loading') ? '' : m)); }, [busy]);

  const takeUrl = (text) => {
    const m = String(text || '').match(URL_RE);
    if (!m) return false;
    let url = m[0].replace(/&amp;/g, '&');
    if (/discord(app)?\.com\/channels\//i.test(url)) {
      setMsg('That is a message link — long-press the image itself → Copy Link (or Copy Image)');
      return true;
    }
    setMsg('Loading image link…');
    onSource({ type: 'url', url });
    return true;
  };

  const onPaste = (e) => {
    e.stopPropagation(); // handled here, not by the page-wide Ctrl+V listener
    const cd = e.clipboardData;
    const src = cd ? extractImageFromPaste(cd) : null;
    e.preventDefault();
    clear();
    if (src && src.type === 'file') { setMsg(''); onSource(src); return; }
    const text = cd ? (cd.getData('text/plain') || cd.getData('text') || '') : '';
    const html = cd ? cd.getData('text/html') || '' : '';
    const img = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (img && takeUrl(img[1])) return;
    if (!takeUrl(text)) setMsg('No image or image link in the clipboard');
  };

  // keyboards' clipboard bars insert text / images without a paste event
  const onInput = () => {
    const el = ref.current;
    if (!el) return;
    const img = el.querySelector('img');
    const text = img ? img.getAttribute('src') : el.textContent;
    clear();
    if (img && /^data:image\//.test(text || '')) {
      fetch(text).then(r => r.blob()).then(blob => onSource({ type: 'file', file: blob }));
      return;
    }
    takeUrl(text);
  };

  // The 📋 button: the clipboard API needs permission and is blocked on many phones —
  // then the long-press box is the way.
  const fromClipboard = async (e) => {
    e.stopPropagation();
    try {
      if (navigator.clipboard && navigator.clipboard.read) {
        const items = await navigator.clipboard.read();
        for (const it of items) {
          const type = it.types.find(t => t.startsWith('image/'));
          if (type) { setMsg(''); onSource({ type: 'file', file: await it.getType(type) }); return; }
        }
      }
      if (navigator.clipboard && navigator.clipboard.readText) {
        if (takeUrl(await navigator.clipboard.readText())) return;
      }
      setMsg('No image or image link in the clipboard');
    } catch (err) {
      setMsg('The browser blocked the clipboard — long-press the box → Paste instead');
      if (ref.current) ref.current.focus();
    }
  };

  return (
    <div className="dz-paste" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
      <div className="dz-paste-row">
        <div
          ref={ref}
          className="dz-paste-box"
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-label="Paste an image or image link here"
          data-placeholder={busy ? 'Loading…' : 'Long-press → Paste image / link'}
          onPaste={onPaste}
          onInput={onInput}
          onFocus={() => { setMsg(''); warmImageHosts(); }}
        />
        <button type="button" className="dz-paste-btn" onClick={fromClipboard} title="Paste from clipboard">📋</button>
      </div>
      {msg && <div className="dz-paste-msg">{msg}</div>}
    </div>
  );
}

export function Dropzone({
  onImage,
  onFiles,
  multiple = false,
  icon = '💣 🚩 1 2 3',
  title = 'Click here or paste image',
  sub = null
}) {
  const fileInputRef = useRef(null);
  const containerRef = useRef(null);
  const [isDrag, setIsDrag] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length) {
      if (multiple && onFiles) {
        onFiles(e.target.files);
        e.target.value = '';
        return;
      }
      loadFile(e.target.files[0]);
      e.target.value = '';
    }
  };

  const loadFile = (file) => {
    setLoading(true);
    loadImageSource(
      { type: 'file', file },
      (img, dataUri, fileBlob) => {
        setLoading(false);
        if (onImage) onImage(img, dataUri, fileBlob);
      },
      () => setLoading(false)
    );
  };

  const [loadError, setLoadError] = useState('');
  const loadFromSource = (srcObj) => {
    // a pasted file goes through onFiles when the module takes several at once
    if (srcObj.type === 'file' && multiple && onFiles) { setLoadError(''); onFiles([srcObj.file]); return; }
    setLoading(srcObj.type === 'url' ? 'url' : true);
    setLoadError('');
    loadImageSource(
      srcObj,
      (img, dataUri, fileBlob) => {
        setLoading(false);
        if (onImage) onImage(img, dataUri, fileBlob);
      },
      () => {
        setLoading(false);
        if (srcObj.type === 'url') setLoadError('Could not load that link — it may have expired. Copy the image again.');
      }
    );
  };

  const handleDataTransfer = (dt) => {
    if (!dt) return;
    if (multiple && onFiles && dt.files && dt.files.length) {
      onFiles(dt.files);
      return;
    }
    const src = extractImageSource(dt);
    if (src) {
      loadFromSource(src);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDrag(false);
    handleDataTransfer(e.dataTransfer);
  };

  const handlePaste = (e) => {
    const cd = e.clipboardData;
    if (!cd) return;

    if (multiple && onFiles && cd.items) {
      const files = [];
      for (const it of cd.items) {
        if (it.type && it.type.startsWith('image/')) {
          const f = it.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length) {
        e.preventDefault();
        onFiles(files);
        return;
      }
    }

    const src = extractImageFromPaste(cd);
    if (src) {
      e.preventDefault();
      loadFromSource(src);
    }
  };

  // A screenshot (file or image link) dropped on this copy's box in a module group is loaded here
  const inst = useInstance();
  const injectNonce = inst && inst.inject ? inst.inject.nonce : 0;
  useEffect(() => {
    if (!injectNonce) return;
    const src = inst.inject.src || (inst.inject.file ? { type: 'file', file: inst.inject.file } : null);
    if (!src) return;
    if (src.type === 'file' && multiple && onFiles) onFiles([src.file]);
    else loadFromSource(src);
  }, [injectNonce]);

  // The window listeners are registered once; they call the latest handlers through this ref
  // (re-registering on every render reset the drag counter mid-drag and made the highlight flicker).
  const latest = useRef({});
  // In a module group every card is visible: only the selected card takes Ctrl+V, and drops are
  // handled per card (the card you drop on), not window-wide.
  latest.current = { handleDataTransfer, loadFromSource, inst };

  // Window-wide drag and drop & paste listeners
  // CRITICAL: Only process events if this specific dropzone is currently visible (not hidden in an inactive mission slot)
  useEffect(() => {
    let dragDepth = 0;
    let internalDrag = false;

    const isVisible = () => {
      const el = containerRef.current;
      if (!el) return false;
      // If element or any ancestor is display: none, offsetParent is null
      if (el.offsetParent === null) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const handleDragStart = () => {
      internalDrag = true;
    };

    const isDroppable = (dt) => {
      if (!dt) return false;
      const types = Array.from(dt.types || []);
      return types.includes('Files') || !internalDrag;
    };

    const inGroup = () => Boolean(latest.current.inst && latest.current.inst.multi);
    const handleWindowDragEnter = (e) => {
      if (dragHasLink(e.dataTransfer) && !internalDrag) warmImageHosts();
      if (!isVisible() || inGroup()) return;
      if (!isDroppable(e.dataTransfer)) return;
      e.preventDefault();
      dragDepth++;
      setIsDrag(true);
    };

    const handleWindowDragOver = (e) => {
      if (!isVisible() || inGroup()) return;
      if (!isDroppable(e.dataTransfer)) return;
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
      setIsDrag(true);
    };

    const handleWindowDragLeave = () => {
      if (!isVisible() || inGroup()) return;
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) {
        setIsDrag(false);
      }
    };

    const handleWindowDragEnd = () => {
      dragDepth = 0;
      internalDrag = false;
      setIsDrag(false);
    };

    const handleWindowDrop = (e) => {
      if (!isVisible() || inGroup()) return;
      if (!isDroppable(e.dataTransfer)) {
        dragDepth = 0;
        internalDrag = false;
        setIsDrag(false);
        return;
      }
      internalDrag = false;
      e.preventDefault();
      e.stopImmediatePropagation();
      dragDepth = 0;
      setIsDrag(false);
      latest.current.handleDataTransfer(e.dataTransfer);
    };

    const handleWindowPaste = (e) => {
      if (!isVisible()) return;
      if (inGroup() && !latest.current.inst.selected) return;

      const active = document.activeElement;
      const cd = e.clipboardData;
      if (!cd) return;

      const src = extractImageFromPaste(cd);
      if (src) {
        // If in text field, only take over if actual image file/blob was pasted
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') && active.type !== 'file') {
          if (src.type === 'file') {
            e.preventDefault();
            e.stopImmediatePropagation();
            latest.current.loadFromSource(src);
          }
          return;
        }
        e.preventDefault();
        e.stopImmediatePropagation();
        latest.current.loadFromSource(src);
      }
    };

    // coming back to the page (from Discord) usually comes right before a Ctrl+V of a link
    const handleWindowFocus = () => { if (isVisible()) warmImageHosts(); };

    document.addEventListener('dragstart', handleDragStart);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('dragenter', handleWindowDragEnter);
    window.addEventListener('dragover', handleWindowDragOver);
    window.addEventListener('dragleave', handleWindowDragLeave);
    window.addEventListener('dragend', handleWindowDragEnd);
    window.addEventListener('drop', handleWindowDrop);
    window.addEventListener('paste', handleWindowPaste);

    return () => {
      document.removeEventListener('dragstart', handleDragStart);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('dragenter', handleWindowDragEnter);
      window.removeEventListener('dragover', handleWindowDragOver);
      window.removeEventListener('dragleave', handleWindowDragLeave);
      window.removeEventListener('dragend', handleWindowDragEnd);
      window.removeEventListener('drop', handleWindowDrop);
      window.removeEventListener('paste', handleWindowPaste);
    };
  }, []);

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept="image/*"
        multiple={multiple}
        onChange={handleFileChange}
      />
      <div
        ref={containerRef}
        className={`dropzone ${isDrag ? 'drag' : ''} ${loading ? 'loading' : ''} ${inst && inst.multi ? 'compact' : ''}`}
        tabIndex={0}
        role="button"
        aria-label="Upload or paste image"
        onClick={() => {
          fileInputRef.current?.click();
        }}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && fileInputRef.current) {
            e.preventDefault();
            fileInputRef.current.click();
          }
        }}
        onDrop={handleDrop}
      >
        <div className="dz-icon">{loading ? '⏳' : icon}</div>
        <div className="dz-title">{loading === 'url' ? 'Downloading image…' : loading ? 'Processing image…' : title}</div>
        {loadError && <div className="dz-error">{loadError}</div>}
        <div className="dz-sub">
          {sub || (
            <>
              press <kbd>Ctrl</kbd>+<kbd>V</kbd> (or <kbd>⌘</kbd>+<kbd>V</kbd>) anywhere — drag &amp; drop or click to browse
            </>
          )}
        </div>
        <PasteBox onSource={loadFromSource} busy={loading} />
      </div>
    </>
  );
}
