import React, { useEffect, useRef } from 'react';
import { useAppState } from '../../core/AppStateContext.jsx';
import { PasteBox } from '../../core/Dropzone.jsx';
import { mountChess63 } from './chess63Core.js';

// Markup of public/chess63.html (the original script fills and updates it)
const MARKUP = `
<div class="page">
  <div class="header-nav">
    <div class="eyebrow">HEIST BOMB SOLVER — CHESS BATCH</div>
    <div class="toggle">
      <span class="tbtn active">♔♚ CHESS BATCH (5-IN-1)</span>
    </div>
  </div>

  <h1 class="c63-h1">Chess Solver (5-Bomb Batch)</h1>
  <div class="intro">
    <b>Step 1:</b> Upload the 2 batch photos — <b>White Boards</b> (2×3 photo containing 5 White boards + Knobs) and <b>Black Boards</b> (1×5 vertical strip containing 5 Black boards).<br>
    <b>Step 2:</b> Stockfish solves all 5 bomb positions automatically. Click any bomb card or board square to tweak FENs if needed. <b>Amber dashed</b> squares = low-confidence reads, <b>red</b> = white/black overlap.
  </div>

  <!-- Step 1: Batch Upload Section -->
  <div class="card">
    <div class="title">
      <span>1. BATCH SCREENSHOTS (2 PHOTOS FOR ALL 5 BOMBS)</span>
      <span class="stat" id="batchStatus">Paste (Ctrl+V), drop, or upload below</span>
    </div>

    <div class="zones">
      <!-- White Photo Dropzone -->
      <div class="zone" id="zoneWhite" tabindex="0">
        <b>♔ White Boards Photo (2×3 Grid)</b>
        <span class="subtext">5 White piece boards + Knobs (Knobs automatically ignored)</span>
        <div class="zone-preview" id="previewWhite">
          <span class="stat">No White photo loaded</span>
        </div>
        <div class="row">
          <label class="ghost" for="fileWhite">UPLOAD WHITE BATCH</label>
          <input type="file" id="fileWhite" accept="image/*">
        </div>
      </div>

      <!-- Black Photo Dropzone -->
      <div class="zone" id="zoneBlack" tabindex="0">
        <b>♚ Black Boards Photo (1×5 Vertical Strip)</b>
        <span class="subtext">5 Black piece boards stacked top to bottom</span>
        <div class="zone-preview" id="previewBlack">
          <span class="stat">No Black photo loaded</span>
        </div>
        <div class="row">
          <label class="ghost" for="fileBlack">UPLOAD BLACK BATCH</label>
          <input type="file" id="fileBlack" accept="image/*">
        </div>
      </div>
    </div>
    <div class="stat" style="margin-top: 12px; text-align: center;">
      💡 Tip: Ctrl+V anywhere pastes images! Tall images (H/W ≥ 2.5) auto-route to Black Strip; wide images auto-route to White Grid.
    </div>
  </div>

  <!-- Step 2: 5 Bomb Cards Grid -->
  <div class="card">
    <div class="title">
      <span>2. BOMB CARDS (BOMBS 1 TO 5)</span>
      <span class="stat">Click a card to inspect & edit its board position below</span>
    </div>
    <div class="bgrid" id="bGrid"></div>
  </div>

  <!-- Step 3: Interactive Merged Board Editor -->
  <div class="card">
    <div class="title">
      <span>3. MERGED BOARD EDITOR & MANUAL CORRECTION</span>
      <span class="stat">Click any square to cycle pieces (Empty → P → N → B → R → Q → K → p → n → b → r → q → k)</span>
    </div>

    <div class="tabs" id="bombTabs"></div>

    <div class="board-container">
      <div class="board" id="board"></div>

      <div class="row" style="width: 100%; max-width: 500px;">
        <input type="text" id="fen" spellcheck="false" placeholder="FEN position">
        <button class="ghost" id="loadFen">LOAD FEN</button>
        <button class="ghost" id="clearBoard">CLEAR</button>
      </div>
    </div>
  </div>

  <!-- Step 4: Batch Answers Summary -->
  <div class="ans">
    <div class="title" style="margin-bottom: 8px;">
      <span>♔♚ FINAL CHESS ANSWERS (ALL 5 BOMBS)</span>
      <span>
        <button class="btn" id="analyzeAll">▶ ANALYZE ALL 5 BOMBS</button>
        <select id="thinkTime" style="margin-left: 6px;">
          <option value="1500">1.5 s</option>
          <option value="4000" selected>4 s</option>
          <option value="10000">10 s</option>
        </select>
        <button class="btn" id="copyAll" style="margin-left: 8px;">📋 COPY ALL</button>
        <span class="toast" id="toast"></span>
      </span>
    </div>
    <div class="stat" id="engineStatus" style="margin-bottom: 12px;">Engine initializing…</div>
    <div id="aList"></div>
  </div>
</div>
`;

/**
 * Level 6.4 (5 Chess): the batch solver — one White 2×3 photo + one Black 1×5 strip solve all 5 bombs.
 * The markup is set once and never re-rendered by React; chess63Core drives it like the original page.
 */
export const Chess63Module = React.memo(function Chess63Module() {
  const ref = useRef(null);
  const api = useRef(null);
  const { setLastCopyString } = useAppState();
  const onSolved = useRef(null);
  onSolved.current = lines => setLastCopyString(lines.join('\n'));

  useEffect(() => {
    api.current = mountChess63(ref.current, { onSolved: a => onSolved.current && onSolved.current(a) });
    return () => { api.current && api.current.destroy(); api.current = null; };
  }, []);

  return (
    <div className="c63-wrap">
      <div className="c63-phone">
        <PasteBox onSource={src => api.current && api.current.loadSource(src)} />
      </div>
      <div className="c63" ref={ref} dangerouslySetInnerHTML={{ __html: MARKUP }} />
    </div>
  );
});
