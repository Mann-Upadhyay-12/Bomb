import React, { useState, useEffect, useId } from 'react';
import { solveWordSearch } from './searchSolver.js';
import {
  ensureOCRWorker,
  getSearchGrid,
  preprocessCellCanvas,
  recognizeCell
} from './searchOCR.js';
import { useAppState } from '../../core/AppStateContext.jsx';
import { useToast } from '../../core/ToastContext.jsx';
import { useClipboard } from '../../core/useClipboard.js';
import { Dropzone } from '../../core/Dropzone.jsx';
import { ModuleLayout } from '../../core/components/ModuleLayout.jsx';
import { ModuleInput } from '../../core/components/ModuleInput.jsx';
import { AnswerPanel } from '../../core/components/AnswerPanel.jsx';
import { CopyLines } from '../../core/components/CopyLines.jsx';
import { WorkingPanel } from '../../core/components/WorkingPanel.jsx';
import { SearchWorking } from './working.jsx';

export const MASTER_SEARCH_WORDS = "PALM SINK WITH SEND OKAY USER LOSS RAID DIRT LEAF WIFE YELL TELL FLAT PARK SOUP VAST BEST TORN CLAY STEM SLIP RIDE ICON CORN DOVE BIRD PLOT FOOT DESK CAPE POET LAVA JOKE MOVE JOIN FINE VEIL GAME PINE TOLD COLD BOLD GOLD HOLD SOLD FOLD MOLD";

const MASTER_WORD_COUNT = MASTER_SEARCH_WORDS.split(/\s+/).length;

export const SAMPLE_SEARCH_GRIDS = [
  [['W','F','P','N','B'],['C','U','Y','I','E'],['Y','M','R','Y','S'],['E','D','A','S','T'],['E','M','J','T','M']],
  [['O','A','I','A','G'],['U','R','B','H','A'],['M','O','I','A','Y'],['C','N','I','O','J'],['Q','O','U','A','R']]
];

export const SEARCH_WORDS_KEY = 'bombvision_search_words';

export function SearchModule({ isActive = true }) {
  const { copyOnDecode, setLastCopyString, setLastImage } = useAppState();
  const { showToast } = useToast();
  const { copy } = useClipboard();
  const uid = useId(); // per-instance ids: missions can show the same module several times

  const [gridData, setGridData] = useState(() => Array.from({ length: 5 }, () => Array(5).fill('')));
  const [confidence, setConfidence] = useState(() => Array.from({ length: 5 }, () => Array(5).fill(100)));
  const [wordsText, setWordsText] = useState(() => {
    try {
      return localStorage.getItem(SEARCH_WORDS_KEY) || MASTER_SEARCH_WORDS;
    } catch (e) {
      return MASTER_SEARCH_WORDS;
    }
  });

  const [sampleIndex, setSampleIndex] = useState(0);
  const [previewUri, setPreviewUri] = useState('');
  const [previewMeta, setPreviewMeta] = useState('');
  const [ocrProgress, setOcrProgress] = useState(null); // percentage or null
  const [ocrStatus, setOcrStatus] = useState('');

  // Solve word search
  const { foundMatches, uniqueWords, hitCells, totalWords } = solveWordSearch(gridData, wordsText);

  useEffect(() => {
    if (!isActive) return;
    const copyString = uniqueWords.join(' ');
    setLastCopyString(copyString);
    // Only auto-copy once the board is fully filled, so partial typing / live OCR
    // progress doesn't spam the clipboard.
    const isFull = gridData.every(row => row.every(ch => ch && ch !== '?'));
    if (copyOnDecode && isFull && uniqueWords.length > 0) {
      copy(copyString);
    }
  }, [gridData, isActive]);

  // Handle cell input
  const handleCellChange = (r, c, val) => {
    const char = val.toUpperCase().replace(/[^A-Z]/g, '').slice(-1);
    const newGrid = gridData.map(row => [...row]);
    newGrid[r][c] = char;
    setGridData(newGrid);

    const newConf = confidence.map(row => [...row]);
    newConf[r][c] = 100;
    setConfidence(newConf);

    if (char) {
      if (c < 4) {
        document.getElementById(`${uid}-sc_${r}_${c + 1}`)?.focus();
      } else if (r < 4 && c === 4) {
        document.getElementById(`${uid}-sc_${r + 1}_0`)?.focus();
      }
    }
  };

  const handleCellKeyDown = (r, c, e) => {
    if (e.key === 'Backspace' && !gridData[r][c]) {
      if (c > 0) document.getElementById(`${uid}-sc_${r}_${c - 1}`)?.focus();
      else if (r > 0) document.getElementById(`${uid}-sc_${r - 1}_4`)?.focus();
    } else if (e.key === 'ArrowRight' && c < 4) {
      document.getElementById(`${uid}-sc_${r}_${c + 1}`)?.focus();
    } else if (e.key === 'ArrowLeft' && c > 0) {
      document.getElementById(`${uid}-sc_${r}_${c - 1}`)?.focus();
    } else if (e.key === 'ArrowDown' && r < 4) {
      document.getElementById(`${uid}-sc_${r + 1}_${c}`)?.focus();
    } else if (e.key === 'ArrowUp' && r > 0) {
      document.getElementById(`${uid}-sc_${r - 1}_${c}`)?.focus();
    }
  };

  const handleCellPaste = (r, c, e) => {
    e.preventDefault();
    const pt = (e.clipboardData || window.clipboardData).getData('text');
    const ct = pt.toUpperCase().replace(/[^A-Z]/g, '');
    if (!ct) return;

    const newGrid = gridData.map(row => [...row]);
    let idx = 0;
    for (let pr = r; pr < 5; pr++) {
      const sc = pr === r ? c : 0;
      for (let pc = sc; pc < 5; pc++) {
        if (idx < ct.length) newGrid[pr][pc] = ct[idx++];
      }
    }
    setGridData(newGrid);
    setConfidence(Array.from({ length: 5 }, () => Array(5).fill(100)));
  };

  const handleClear = () => {
    setGridData(Array.from({ length: 5 }, () => Array(5).fill('')));
    setConfidence(Array.from({ length: 5 }, () => Array(5).fill(100)));
    setPreviewUri('');
    setPreviewMeta('');
    setOcrStatus('');
    setOcrProgress(null);
    setLastImage(null, null);
    setLastCopyString('');
    showToast('GRID CLEARED ✓');
  };

  const handleSample = () => {
    const nextIdx = (sampleIndex + 1) % SAMPLE_SEARCH_GRIDS.length;
    setSampleIndex(nextIdx);
    setGridData(SAMPLE_SEARCH_GRIDS[sampleIndex].map(row => [...row]));
    setConfidence(Array.from({ length: 5 }, () => Array(5).fill(100)));
    showToast(`SAMPLE GRID #${sampleIndex + 1} LOADED ✓`);
  };

  const handleRestoreWords = () => {
    setWordsText(MASTER_SEARCH_WORDS);
    try {
      localStorage.setItem(SEARCH_WORDS_KEY, MASTER_SEARCH_WORDS);
    } catch (e) {}
    showToast(`RESTORED ALL ${MASTER_WORD_COUNT} WORDS ✓`);
  };

  const handleImage = async (img, dataUri, fileBlob) => {
    setPreviewUri(dataUri);
    setPreviewMeta(`${img.naturalWidth}×${img.naturalHeight} px source`);
    setLastImage(img, fileBlob);

    setOcrStatus('Starting OCR engine…');
    setOcrProgress(5);

    let worker;
    try {
      worker = await ensureOCRWorker(m => {
        if (m && m.status === 'loading language traineddata') {
          const pct = Math.round((m.progress || 0) * 100);
          setOcrStatus(`📡 Downloading OCR model… ${pct}%`);
          setOcrProgress(Math.round(pct * 0.15));
        } else if (m && m.status) {
          setOcrStatus(`OCR: ${m.status}…`);
        }
      });
    } catch (err) {
      setOcrStatus(`⚠️ OCR unavailable: ${err.message}. You can type or paste letters manually.`);
      setOcrProgress(null);
      showToast('OCR UNAVAILABLE — ENTER LETTERS MANUALLY');
      return;
    }

    setOcrStatus('Reading 25 letter cells…');
    setOcrProgress(15);

    const MAXDIM = 880;
    let iw = img.naturalWidth, ih = img.naturalHeight;
    const scl = Math.min(1, MAXDIM / Math.max(iw, ih));
    iw = Math.round(iw * scl);
    ih = Math.round(ih * scl);

    const workCanvas = document.createElement('canvas');
    workCanvas.width = iw;
    workCanvas.height = ih;
    const ctx = workCanvas.getContext('2d');
    ctx.drawImage(img, 0, 0, iw, ih);

    const { rowCenters, colCenters, cellW, cellH } = getSearchGrid(iw, ih);
    const UPSCALE = 2; // Optimal letter height ~60-80px for fast, accurate Tesseract recognition
    const CROP = 0.88;
    const PAD_PX = 12;

    const newGrid = Array.from({ length: 5 }, () => Array(5).fill(''));
    const newConf = Array.from({ length: 5 }, () => Array(5).fill(100));
    let done = 0;

    const cellCanvas = document.createElement('canvas');
    const cellCtx = cellCanvas.getContext('2d');
    const padCanvas = document.createElement('canvas');
    const padCtx = padCanvas.getContext('2d');

    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const cy = rowCenters[r];
        const cx = colCenters[c];
        const cW = Math.round(cellW * CROP);
        const cH = Math.round(cellH * CROP);
        const sx2 = Math.max(0, Math.round(cx - cW / 2));
        const sy2 = Math.max(0, Math.round(cy - cH / 2));
        const sw2 = Math.min(iw - sx2, cW);
        const sh2 = Math.min(ih - sy2, cH);

        if (sw2 < 4 || sh2 < 4) {
          newGrid[r][c] = '?';
          newConf[r][c] = 0;
          done++;
          continue;
        }

        cellCanvas.width = sw2 * UPSCALE;
        cellCanvas.height = sh2 * UPSCALE;
        cellCtx.imageSmoothingEnabled = true;
        cellCtx.imageSmoothingQuality = 'medium';
        cellCtx.drawImage(workCanvas, sx2, sy2, sw2, sh2, 0, 0, cellCanvas.width, cellCanvas.height);

        preprocessCellCanvas(cellCtx, cellCanvas.width, cellCanvas.height, 'otsu', 0);

        padCanvas.width = cellCanvas.width + PAD_PX * 2;
        padCanvas.height = cellCanvas.height + PAD_PX * 2;
        padCtx.fillStyle = '#FFFFFF';
        padCtx.fillRect(0, 0, padCanvas.width, padCanvas.height);
        padCtx.drawImage(cellCanvas, PAD_PX, PAD_PX);

        const rec = await recognizeCell(worker, padCanvas);
        newGrid[r][c] = rec.letter;
        newConf[r][c] = rec.confidence;
        done++;

        // Live progressive update of grid cells so user sees results in real time
        setGridData(newGrid.map(row => [...row]));
        setConfidence(newConf.map(row => [...row]));
        setOcrProgress(Math.round(15 + (done / 25) * 85));
        setOcrStatus(`Reading cell ${done}/25: [${rec.letter || '?'}]`);
      }
    }

    setOcrStatus('✅ OCR complete!');
    setOcrProgress(null);
    showToast('WORD SEARCH OCR COMPLETE ✓');
  };

  // Build copy lines
  const copyItems = [];
  if (uniqueWords.length > 0) {
    copyItems.push({
      label: `COPY ALL WORDS (${uniqueWords.length})`,
      value: uniqueWords.join(' ')
    });
    foundMatches.forEach(m => {
      const isReversed = m.isRev && m.revBoardStr !== m.word;
      copyItems.push({
        label: isReversed ? `🔍 ${m.word} (${m.revBoardStr})` : `🔍 ${m.word}`,
        value: m.word
      });
    });
  }

  const answersList = foundMatches.map(m => {
    if (m.isRev && m.revBoardStr !== m.word) {
      return `🔍 ${m.word} (${m.revBoardStr})`;
    }
    return `🔍 ${m.word}`;
  });

  const stampStats = `FOUND: ${uniqueWords.length} / ${totalWords}`;

  return (
    <ModuleLayout
      input={
        <ModuleInput
          dropzone={
            <Dropzone
              onImage={handleImage}
              icon="🔍 S E A R C H"
              title="Click here, then paste a 5×5 Word Search screenshot"
            />
          }
          preview={
            previewUri ? (
              <div className="preview-row show">
                <img src={previewUri} alt="uploaded preview" />
                <span>{previewMeta}</span>
                <button type="button" className="preview-clear-btn" onClick={() => { setPreviewUri(''); setPreviewMeta(''); }}>✕</button>
              </div>
            ) : null
          }
          controls={
            <>
              <button className="reset-btn" type="button" onClick={handleClear}>
                clear
              </button>
              <button
                className="reset-btn"
                type="button"
                style={{ borderColor: 'var(--brass)', color: 'var(--brass)' }}
                onClick={handleSample}
              >
                ⚡ LOAD SAMPLE GRID
              </button>
              <button
                className="reset-btn"
                type="button"
                onClick={handleRestoreWords}
              >
                🔄 RESTORE {MASTER_WORD_COUNT} WORDS
              </button>
            </>
          }
        >
          <div className="search-config" style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '16px' }}>
            <div className="search-config-row">
              <label className="search-config-label" htmlFor={`${uid}-words`}>
                TARGET WORDS (AUTO-SAVED &amp; EDITABLE):
              </label>
              <textarea
                id={`${uid}-words`}
                className="search-words-field"
                style={{ height: '70px', resize: 'vertical', fontSize: '12px', lineHeight: 1.45, fontFamily: 'monospace' }}
                value={wordsText}
                onChange={(e) => {
                  setWordsText(e.target.value);
                  try { localStorage.setItem(SEARCH_WORDS_KEY, e.target.value); } catch(err) {}
                }}
                spellCheck="false"
                autoComplete="off"
                placeholder="Paste search target words from manual..."
              />
            </div>

            <div className="search-btn-row">
              <button type="button" className="bg-btn" onClick={handleSample}>
                ⚡ LOAD SAMPLE GRID
              </button>
              <button type="button" className="bg-btn" onClick={handleRestoreWords}>
                🔄 RESTORE ALL {MASTER_WORD_COUNT} WORDS
              </button>
              <button type="button" className="bg-btn" onClick={handleClear}>
                🗑️ CLEAR GRID
              </button>
            </div>

            {ocrProgress !== null && (
              <div className="ocr-progress-wrap show">
                <div className="ocr-progress-bar" style={{ width: `${ocrProgress}%` }} />
              </div>
            )}
            {ocrStatus && (
              <div style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--brass)' }}>
                {ocrStatus}
              </div>
            )}
          </div>
        </ModuleInput>
      }
      answers={
        <AnswerPanel
          label="FOUND WORDS"
          stats={stampStats}
          answers={answersList}
          copyValue={uniqueWords.join(' ')}
          placeholder="NO WORDS FOUND"
        />
      }
      copylines={<CopyLines items={copyItems} />}
      working={
        <WorkingPanel
          title="SEARCH BOARD (5×5) — Type letters, paste 25 letters, or upload screenshot"
        >
          <SearchWorking
            gridData={gridData}
            confidence={confidence}
            hitCells={hitCells}
            onCellChange={handleCellChange}
            onCellKeyDown={handleCellKeyDown}
            onCellPaste={handleCellPaste}
            idPrefix={uid}
          />
        </WorkingPanel>
      }
    />
  );
}

export const searchModule = {
  id: 'search',
  tabId: 'tabSearch',
  tabLabel: '🔍 SEARCH (5×5)',
  eyebrow: 'WORD SEARCH SOLVER',
  title: 'Word Search Vision',
  sub: 'Upload or paste an image of the 5×5 Word Search puzzle. It OCRs the letters, searches in all 8 directions, highlights matched words, and automatically copies them to your clipboard!',
  Component: SearchModule
};
