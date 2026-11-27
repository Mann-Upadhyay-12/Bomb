import React, { useRef, useState, useEffect } from 'react';
import { extractImageSource, extractImageFromPaste, loadImageSource, warmImageHosts, dragHasLink, isInternalDrag } from '../utils/image.js';
import { useInstance } from './InstanceContext.jsx';
import { useTouchScreen, phoneTitle } from '../utils/touch.js';
import { AIR_PASTE_EVENT, pasteInAir } from './airPaste.js';
import { noteInput } from './report.js';
import { attachCardZone, useCardPictures, useCardUpdatingKey, pictureUrl } from './room/roomCards.js';
import { nameOf } from './room/roomClient.js';


// Phones can't Ctrl+V or drag & drop. This is a real text box: long-press it → Paste works with no
// clipboard permission (a normal paste event). It takes a pasted image, or an image link (Discord
// "Copy Link" works — cdn.discordapp.com allows other sites to read its images).
const URL_RE = /https?:\/\/[^\s<>"']+/i;
export function PasteBox({ onSource, busy, placeholder = 'Long-press → Paste image / link', label = 'Paste an image or image link here' }) {
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
          aria-label={label}
          data-placeholder={busy ? 'Loading…' : placeholder}
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

/**
 * Phones: a box for this game's manual picture or its link (pasted "in air" on a computer). What is
 * pasted goes to the module's picture box, which tells the manual from a module picture as for a
 * Ctrl+V. `card`: this card's index in a group (null = the selected card, for a bar above the cards).
 * Hidden with a mouse (the same rule as the paste box in the picture box).
 */
export function ManualPasteBox({ what = 'manual', card = null }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const onSource = (src) => {
    setNote('');
    setBusy(true);
    const taken = pasteInAir(src, {
      card,
      done: (ok) => {
        setBusy(false);
        setNote(ok ? '' : 'Could not load that link — it may have expired. Copy the link again.');
      }
    });
    if (!taken) { setBusy(false); setNote('Open the module first, then paste here.'); }
  };
  return (
    <div className="manual-paste">
      <div className="manual-paste-label">📖 {what} — picture or link</div>
      <PasteBox onSource={onSource} busy={busy} placeholder="Long-press → Paste link here" label={`Paste the ${what} picture or its link here`} />
      {note && <div className="dz-paste-msg">{note}</div>}
    </div>
  );
}

// A module's onImage / onFiles may return a Promise (an OCR read): "read" is when it settles, plus a
// moment for React to show what it set
function whenRead(result, fn) {
  Promise.resolve(result).catch(() => {}).then(() => { setTimeout(fn, 60); });
}

/** A teammate's picture in a shared-reading card: shown last (after their reading is in), small; a tap
 *  shows it big. */
function RoomPicture({ entry, wait }) {
  const [url, setUrl] = useState('');
  const [big, setBig] = useState(false);
  useEffect(() => {
    if (wait) return undefined; // the reading first: the picture is the last thing that matters
    let gone = false;
    const t = setTimeout(() => { pictureUrl(entry).then((u) => { if (!gone) setUrl(u); }, () => {}); }, 250);
    return () => { gone = true; clearTimeout(t); };
  }, [entry.id, entry.pic, wait]);
  if (!url) return <span className="dz-room-pic waiting">{wait ? 'reading…' : 'picture…'}</span>;
  return (
    <img
      className={`dz-room-pic ${big ? 'big' : ''}`} src={url} alt={`picture from ${nameOf(entry.from)}`} referrerPolicy="no-referrer"
      title={big ? 'tap to make it small' : 'tap to see it big'}
      onClick={(e) => { e.stopPropagation(); setBig((b) => !b); }}
    />
  );
}

export function Dropzone({
  onImage,
  onFiles,
  multiple = false,
  // in a room: only the app that takes a picture reads it; the module keeps what it reads in
  // useCardState, and the teammates get that (room/roomCards.js) and see the picture last
  shareReading = false,
  icon = '💣 🚩 1 2 3',
  title = 'Click here or paste image',
  sub = null
}) {
  const fileInputRef = useRef(null);
  const containerRef = useRef(null);
  const touch = useTouchScreen();
  const [isDrag, setIsDrag] = useState(false);
  const [loading, setLoading] = useState(false);

  // every picture this box takes is noted for the ⚑ wrong-answer report (report.js), and in a room
  // it goes to the same card in every teammate's app (room/roomCards.js) — unless it came from there
  const roomZone = useRef(null);
  const [roomFrom, setRoomFrom] = useState(null);
  const [roomWhere, setRoomWhere] = useState(null);
  const roomPics = useCardPictures(shareReading ? roomWhere : null);
  const updating = useCardUpdatingKey(roomWhere ? roomWhere.key : '');
  const took = (src, origin, remote) => {
    noteInput(containerRef.current, src);
    if (remote) return;
    setRoomFrom(null);
    if (roomZone.current) roomZone.current.took(origin, src);
  };
  // the module's reading of a picture this app took is done: a shared reading goes to the room
  const readDone = (result) => whenRead(result, () => { if (roomZone.current) roomZone.current.readDone(); });
  const takeImage = (img, dataUri, fileBlob, origin, remote) => {
    took(fileBlob || dataUri, origin || (fileBlob ? { type: 'file', file: fileBlob } : null), remote);
    const result = onImage ? onImage(img, dataUri, fileBlob) : undefined;
    if (!remote) readDone(result);
    return result;
  };
  const takeFiles = (files, remote) => {
    for (const f of Array.from(files || []).slice(-3)) took(f, { type: 'file', file: f }, remote);
    const result = onFiles(files);
    if (!remote) readDone(result);
    return result;
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length) {
      if (multiple && onFiles) {
        takeFiles(e.target.files);
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
        takeImage(img, dataUri, fileBlob, { type: 'file', file });
      },
      () => setLoading(false)
    );
  };

  const [loadError, setLoadError] = useState('');
  // done(ok): told when the picture has loaded or failed (a manual link box waiting on it)
  // remote: it came from the room (a teammate pasted it), so it isn't sent back
  const loadFromSource = (srcObj, done = null, remote = false) => {
    // a pasted file goes through onFiles when the module takes several at once
    if (srcObj.type === 'file' && multiple && onFiles) {
      setLoadError('');
      const result = takeFiles([srcObj.file], remote);
      if (done) { if (remote) whenRead(result, () => done(true)); else done(true); }
      return;
    }
    setLoading(srcObj.type === 'url' ? 'url' : true);
    setLoadError('');
    loadImageSource(
      srcObj,
      (img, dataUri, fileBlob) => {
        setLoading(false);
        const result = takeImage(img, dataUri, fileBlob, srcObj, remote);
        // a teammate's picture: done once the module has read it (the card stops saying UPDATING)
        if (done) { if (remote) whenRead(result, () => done(true)); else done(true); }
      },
      () => {
        setLoading(false);
        if (srcObj.type === 'url') setLoadError('Could not load that link — it may have expired. Copy the image again.');
        if (done) done(false);
      }
    );
  };

  const handleDataTransfer = (dt) => {
    if (!dt) return;
    if (multiple && onFiles && dt.files && dt.files.length) {
      takeFiles(dt.files);
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
        takeFiles(files);
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
    if (src.type === 'file' && multiple && onFiles) takeFiles([src.file]);
    else loadFromSource(src);
  }, [injectNonce]);

  // The window listeners are registered once; they call the latest handlers through this ref
  // (re-registering on every render reset the drag counter mid-drag and made the highlight flicker).
  const latest = useRef({});
  // In a module group every card is visible: only the selected card takes Ctrl+V, and drops are
  // handled per card (the card you drop on), not window-wide.
  latest.current = { handleDataTransfer, loadFromSource, inst };

  // In a room: this box is one card's drop box (its module window + card number); the room's
  // pictures for it are loaded here, in order (room/roomCards.js)
  useEffect(() => {
    const zone = attachCardZone(
      containerRef.current,
      (src, done) => latest.current.loadFromSource(src, (ok) => done(ok), true),
      (who) => setRoomFrom(who),
      { shared: shareReading }
    );
    roomZone.current = zone;
    setRoomWhere(zone.where);
    return () => { zone.detach(); roomZone.current = null; };
  }, []);

  // Window-wide drag and drop & paste listeners
  // CRITICAL: Only process events if this specific dropzone is currently visible (not hidden in an inactive mission slot)
  useEffect(() => {
    let dragDepth = 0;

    const isVisible = () => {
      const el = containerRef.current;
      if (!el) return false;
      // If element or any ancestor is display: none, offsetParent is null
      if (el.offsetParent === null) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    // a drag that started on this page (selected text, a thumbnail) is not a new image
    const isDroppable = (dt) => {
      if (!dt) return false;
      const types = Array.from(dt.types || []);
      return types.includes('Files') || !isInternalDrag(dt);
    };

    const inGroup = () => Boolean(latest.current.inst && latest.current.inst.multi);
    const handleWindowDragEnter = (e) => {
      if (dragHasLink(e.dataTransfer)) warmImageHosts();
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
      setIsDrag(false);
    };

    const handleWindowDrop = (e) => {
      if (!isVisible() || inGroup()) return;
      // e.defaultPrevented: something on the page (a module card) already took this drop
      if (e.defaultPrevented || !isDroppable(e.dataTransfer)) {
        dragDepth = 0;
        setIsDrag(false);
        return;
      }
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

    // A manual pasted into a box instead of "in air" (airPaste.js): taken like a Ctrl+V with nothing
    // focused — by this card when it was pasted in this card, else by the selected card.
    const handleAirPaste = (e) => {
      const d = e.detail;
      if (!d || d.taken || !isVisible()) return;
      const inst = latest.current.inst;
      if (inGroup()) {
        if (d.card != null ? inst.index !== d.card : !inst.selected) return;
      }
      d.taken = true;
      e.stopImmediatePropagation();
      latest.current.loadFromSource(d.src, d.done);
    };

    // coming back to the page (from Discord) usually comes right before a Ctrl+V of a link
    const handleWindowFocus = () => { if (isVisible()) warmImageHosts(); };

    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('dragenter', handleWindowDragEnter);
    window.addEventListener('dragover', handleWindowDragOver);
    window.addEventListener('dragleave', handleWindowDragLeave);
    window.addEventListener('dragend', handleWindowDragEnd);
    window.addEventListener('drop', handleWindowDrop);
    window.addEventListener('paste', handleWindowPaste);
    window.addEventListener(AIR_PASTE_EVENT, handleAirPaste);

    return () => {
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('dragenter', handleWindowDragEnter);
      window.removeEventListener('dragover', handleWindowDragOver);
      window.removeEventListener('dragleave', handleWindowDragLeave);
      window.removeEventListener('dragend', handleWindowDragEnd);
      window.removeEventListener('drop', handleWindowDrop);
      window.removeEventListener('paste', handleWindowPaste);
      window.removeEventListener(AIR_PASTE_EVENT, handleAirPaste);
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
        <div className="dz-title">{loading === 'url' ? 'Downloading image…' : loading ? 'Processing image…' : touch ? phoneTitle(title) : title}</div>
        {touch && !loading && <div className="dz-touch">long-press the box → <b>Paste</b> · or tap here to pick a saved picture</div>}
        {loadError && <div className="dz-error">{loadError}</div>}
        {roomFrom && <div className="dz-room-from">👥 FROM {nameOf(roomFrom).toUpperCase()}</div>}
        {roomPics.length > 0 && (
          <div className="dz-room-pics" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            {roomPics.map((p) => <RoomPicture key={p.id} entry={p} wait={Boolean(updating && updating.id === p.id)} />)}
          </div>
        )}
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
