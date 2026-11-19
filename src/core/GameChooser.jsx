import React, { useEffect } from 'react';

// Which game this page plays: #play=bomb / #play=heist (old ?play= links still work), nothing = ask.
// Each choice is a fresh page load, so only one app's CSS and listeners are ever active.
// The choice lives in the hash, not the query: on phones a local file opens as a content:// URI,
// and adding ?play=... makes it a different "file" the provider can't open. A hash never leaves the page.
export function currentGame() {
  const p = new URLSearchParams(location.hash.slice(1)).get('play') || new URLSearchParams(location.search).get('play');
  return p === 'bomb' || p === 'heist' ? p : null;
}

const gameHref = (g) => (g ? '#play=' + g : '#');

// Set the hash, then reload the same document (same URI, so it works from file:// and content://).
const goTo = (g) => (e) => {
  e.preventDefault();
  const u = new URL(location.href);
  u.hash = g ? 'play=' + g : '';
  if (!g) u.searchParams.delete('play');
  if (u.search !== location.search) { location.href = u.href; return; } // only old ?play= links reach here
  history.replaceState(null, '', u.href);
  location.reload();
};

export function GameChooser() {
  useEffect(() => { document.body.style.margin = '0'; document.body.style.background = '#14161b'; }, []);
  return (
    <div className="gc-page">
      <div className="gc-title">WHAT ARE YOU PLAYING?</div>
      <div className="gc-cards">
        <a className="gc-card" href={gameHref('heist')} onClick={goTo('heist')}>
          <span className="gc-icon" aria-hidden="true">🗝️</span>
          <span className="gc-name">HEIST</span>
          <span className="gc-sub">Morse, A1Z26, Binary, Braille, Caesar, Captcha, scout maps…</span>
        </a>
        <a className="gc-card" href={gameHref('bomb')} onClick={goTo('bomb')}>
          <span className="gc-icon" aria-hidden="true">💣</span>
          <span className="gc-name">BOMBS</span>
          <span className="gc-sub">Defuse modules — wires, mazes, chess, symbols, balance…</span>
        </a>
      </div>
    </div>
  );
}

/** Small corner link back to the chooser. */
export function SwitchGameLink() {
  return <a className="gc-switch" href={gameHref(null)} onClick={goTo(null)} title="Switch between Heist and Bombs">⇄ HEIST / BOMBS</a>;
}

export const chooserCss = `
.gc-page{min-height:100vh;margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px;
  padding:24px 16px;box-sizing:border-box;background:#14161b;color:#e8e6e1;font-family:'IBM Plex Sans',system-ui,sans-serif}
.gc-title{font-family:'IBM Plex Mono',monospace;font-weight:700;letter-spacing:.14em;font-size:15px;color:#d9a35b}
.gc-cards{display:flex;gap:18px;flex-wrap:wrap;justify-content:center;width:100%;max-width:640px}
.gc-card{flex:1 1 240px;display:flex;flex-direction:column;align-items:center;gap:10px;padding:30px 20px;border-radius:14px;
  background:#1d2027;border:1px solid #333845;color:inherit;text-decoration:none;text-align:center;transition:transform .12s,border-color .12s}
.gc-card:hover,.gc-card:focus-visible{border-color:#d9a35b;transform:translateY(-2px);outline:none}
.gc-icon{font-size:40px}
.gc-name{font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:24px;letter-spacing:.1em}
.gc-sub{font-size:13px;color:#9aa0ab;line-height:1.45}
.gc-switch{position:fixed;right:10px;bottom:10px;z-index:99999;padding:6px 10px;border-radius:8px;background:rgba(20,22,27,.88);
  border:1px solid #3a3f4b;color:#cfd3da;font:600 11px 'IBM Plex Mono',monospace;letter-spacing:.06em;text-decoration:none}
.gc-switch:hover{border-color:#d9a35b;color:#fff}
`;
