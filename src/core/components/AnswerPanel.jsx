import React from 'react';
import { useClipboard } from '../useClipboard.js';
import { useToastFlash } from '../ToastContext.jsx';
import { useInstance } from '../InstanceContext.jsx';
import { useClip } from '../AppStateContext.jsx';
import { useTouchScreen, tapWord } from '../../utils/touch.js';

const DEFAULT_HINT = 'CLICK TO COPY';

export function AnswerPanel({
  label = 'GUARANTEED SAFE SQUARES',
  stats = null,
  hint = DEFAULT_HINT, // the default also says whether the answer is on the clipboard
  answers = [],
  placeholder = '— — —',
  copyValue = null,
  report = true, // false: the module reports its own summary (e.g. two panels side by side)
  tones = null // optional, one per answer: null or 'bad' (a red chip: Logic's false results)
}) {
  const { copy, formatClipboardText } = useClipboard();
  const flash = useToastFlash();
  const clip = useClip();
  const touch = useTouchScreen();

  // Inside a module group, tell this copy's box what the current answer is
  const inst = useInstance();
  const summary = copyValue || (Array.isArray(answers) ? answers.join(' ') : (answers || ''));
  React.useEffect(() => {
    if (report && inst && inst.report) inst.report(summary);
  }, [summary]);

  // Is this answer what the page last copied, and did that work? (auto-copy can fail on a phone)
  const mine = summary ? formatClipboardText(summary) : '';
  const copyState = mine && clip && clip.text === mine ? (clip.ok ? 'copied' : 'failed') : null;
  const shownHint = hint !== DEFAULT_HINT ? hint
    : copyState === 'copied' ? 'COPIED ✓'
    : copyState === 'failed' ? `⚠ NOT COPIED — ${tapWord(touch, true)} HERE`
    : `${tapWord(touch, true)} TO COPY`;

  const handleCopy = () => {
    if (copyValue) {
      copy(copyValue);
    } else if (Array.isArray(answers) && answers.length > 0) {
      copy(answers.join(' '));
    } else if (typeof answers === 'string' && answers) {
      copy(answers);
    }
  };

  return (
    <div
      className={`stamp ${flash ? 'flash' : ''}`}
      role="button"
      tabIndex={0}
      title={`${tapWord(touch)} to copy the answer`}
      onClick={handleCopy}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCopy();
        }
      }}
    >
      <div className="stamp-label-row">
        <div className="stamp-label">{label}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {stats && <span className="stamp-stats">{stats}</span>}
          <span className={`stamp-hint ${copyState || ''}`}>{shownHint}</span>
        </div>
      </div>
      <div className="stamp-word">
        {(!answers || (Array.isArray(answers) && answers.length === 0)) ? (
          <span className="ph">{placeholder}</span>
        ) : Array.isArray(answers) ? (
          answers.map((ans, idx) => (
            <span key={idx} className={`safe-tag${tones && tones[idx] ? ` ${tones[idx]}` : ''}`}>{ans}</span>
          ))
        ) : (
          <span className="safe-tag">{answers}</span>
        )}
      </div>
    </div>
  );
}
