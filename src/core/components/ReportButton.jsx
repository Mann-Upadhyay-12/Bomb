import React, { useRef, useState } from 'react';
import { canReport, sendReport } from '../report.js';

/**
 * ⚑ WRONG ANSWER? under a module's answer, for everyone on the site (logged in or not). It sends the
 * answer, the module's pictures, its text on screen, the text pasted on the page and the game's data,
 * with an optional note, to the owner's Discord
 * (src/core/report.js → api/report.js). The status shows here: the bomb app has no toasts.
 */
export function ReportButton() {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [state, setState] = useState({ kind: '', text: '' }); // sending | sent | bad
  if (!canReport()) return null;

  const send = async () => {
    setState({ kind: 'sending', text: '' });
    try {
      const sent = await sendReport(ref.current, note.trim());
      const { images, pastes, room } = sent;
      const parts = [images && `${images} picture${images > 1 ? 's' : ''}`, pastes && `${pastes} paste${pastes > 1 ? 's' : ''}`, room && "+ the room's copy"].filter(Boolean);
      setState({ kind: 'sent', text: `SENT ✓ ${parts.length ? `(${parts.join(', ')})` : ''}`.trim() });
      setOpen(false);
      setNote('');
    } catch (e) {
      setState({ kind: 'bad', text: `⚠ ${e.message}` });
    }
  };

  return (
    <div className="report-row" ref={ref}>
      {!open ? (
        <>
          {state.kind === 'sent' && <span className="report-status ok">{state.text}</span>}
          <button type="button" className="report-btn" onClick={() => { setOpen(true); setState({ kind: '', text: '' }); }}
            title="Send this answer, the module's pictures, what it read and the text pasted on the page to the owner's Discord">
            ⚑ WRONG ANSWER?
          </button>
        </>
      ) : (
        <div className="report-box">
          <textarea className="report-note-input" rows={2} maxLength={1000} value={note} autoFocus
            placeholder="What's wrong? The right answer, if you know it (optional)"
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && state.kind !== 'sending') send();
            }} />
          <div className="report-actions">
            <button type="button" className="report-send" onClick={send} disabled={state.kind === 'sending'}>
              {state.kind === 'sending' ? 'SENDING…' : '⚑ SEND'}
            </button>
            <button type="button" className="report-cancel" onClick={() => setOpen(false)} disabled={state.kind === 'sending'}>CANCEL</button>
            <span className="report-what">Sends this answer, the module's pictures and what it read, every text pasted on the page (manuals, serial, links) and this game's manuals and serial to the owner's Discord.</span>
          </div>
          {state.kind === 'bad' && <div className="report-status bad">{state.text}</div>}
        </div>
      )}
    </div>
  );
}
