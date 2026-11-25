import React, { useEffect } from 'react';

// Which game this page plays: #play=bomb / #play=heist (old ?play= links still work), nothing = ask.
// Choosing never reloads the page: main.jsx swaps the game in place when the hash changes. On phones a
// local file opens as a content:// URI that can't always be read again, so neither a reload nor a
// ?play=... query (a different "file" to the provider) may be used. A hash never leaves the page.
export function currentGame() {
  const p = new URLSearchParams(location.hash.slice(1)).get('play') || new URLSearchParams(location.search).get('play');
  return p === 'bomb' || p === 'heist' ? p : null;
}

const gameHref = (g) => (g ? '#play=' + g : '#');

// Set the hash; main.jsx switches the game on 'hashchange' (no reload, so the back button works too).
const goTo = (g) => (e) => {
  e.preventDefault();
  const u = new URL(location.href);
  if (u.searchParams.has('play')) { // an old ?play= link: drop the query (that one load is unavoidable)
    u.searchParams.delete('play');
    u.hash = g ? 'play=' + g : '';
    location.href = u.href;
    return;
  }
  location.hash = g ? 'play=' + g : '';
};

// On the website, the page's unlock step leaves who is logged in here (scripts/lock-site.mjs).
const account = () => (typeof window !== 'undefined' && window.__BB_ACCOUNT__) || null;

export function GameChooser() {
  const me = account();
  useEffect(() => {
    document.body.style.margin = '0';
    document.body.style.background = '#14161b';
    // the game chosen next is shown in this same page: give it the body back as it was
    return () => { document.body.style.margin = ''; document.body.style.background = ''; };
  }, []);
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
      {me && (
        <div className="gc-account">
          Logged in as <b>{me.name}</b>
          {me.admin && <span className="gc-owner" title="The site's owner">OWNER</span>}
          {me.og && <span className="gc-og" title="One of the first two players: always let in, with the ⚑ wrong-answer button">OG</span>}
          {me.admin ? <> · <a href="/admin">Admin</a></> : me.og ? <> · <a href="/admin">Who uses the site</a></> : null}
          {' · '}<a href="/api/auth/logout">Log out</a>
        </div>
      )}
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
.gc-account{font-size:13px;color:#9aa0ab}
.gc-account b{color:#e8e6e1;font-weight:600}
.gc-account a{color:#d9a35b}
.gc-owner{display:inline-block;margin-left:7px;padding:1px 10px 1px 9px;font:700 11px 'IBM Plex Mono',monospace;letter-spacing:.16em;
  color:#0F0A0F;background:linear-gradient(225deg,#FD0130 0 7px,#FCEE0A 7px);box-shadow:inset 3px 0 0 #00F0FF;text-shadow:1px 0 rgba(253,1,48,.55),-1px 0 rgba(0,240,255,.55);vertical-align:1px}
.gc-og{display:inline-block;margin-left:7px;padding:1px 8px;border-radius:99px;font:700 11px 'IBM Plex Mono',monospace;letter-spacing:.1em;
  color:#14161b;background:linear-gradient(90deg,#8EC5FF,#C4B1F2);vertical-align:1px}
.gc-switch{position:fixed;right:10px;bottom:10px;z-index:99999;padding:6px 10px;border-radius:8px;background:rgba(20,22,27,.88);
  border:1px solid #3a3f4b;color:#cfd3da;font:600 11px 'IBM Plex Mono',monospace;letter-spacing:.06em;text-decoration:none}
.gc-switch:hover{border-color:#d9a35b;color:#fff}
`;
