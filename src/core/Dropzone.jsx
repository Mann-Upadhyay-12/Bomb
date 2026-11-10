import React, { useRef, useState, useEffect } from 'react';
import { extractImageSource, extractImageFromPaste, loadImageSource } from '../utils/image.js';
import { useInstance } from './InstanceContext.jsx';

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

  const loadFromSource = (srcObj) => {
    setLoading(true);
    loadImageSource(
      srcObj,
      (img, dataUri, fileBlob) => {
        setLoading(false);
        if (onImage) onImage(img, dataUri, fileBlob);
      },
      () => setLoading(false)
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

  // A screenshot dropped on this copy's box in a module group is loaded here
  const inst = useInstance();
  const injectNonce = inst && inst.inject ? inst.inject.nonce : 0;
  useEffect(() => {
    if (!injectNonce || !inst.inject.file) return;
    if (multiple && onFiles) onFiles([inst.inject.file]);
    else loadFromSource({ type: 'file', file: inst.inject.file });
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

    document.addEventListener('dragstart', handleDragStart);
    window.addEventListener('dragenter', handleWindowDragEnter);
    window.addEventListener('dragover', handleWindowDragOver);
    window.addEventListener('dragleave', handleWindowDragLeave);
    window.addEventListener('dragend', handleWindowDragEnd);
    window.addEventListener('drop', handleWindowDrop);
    window.addEventListener('paste', handleWindowPaste);

    return () => {
      document.removeEventListener('dragstart', handleDragStart);
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
        <div className="dz-title">{loading ? 'Processing image…' : title}</div>
        <div className="dz-sub">
          {sub || (
            <>
              press <kbd>Ctrl</kbd>+<kbd>V</kbd> (or <kbd>⌘</kbd>+<kbd>V</kbd>) anywhere — drag &amp; drop or click to browse
            </>
          )}
        </div>
      </div>
    </>
  );
}
