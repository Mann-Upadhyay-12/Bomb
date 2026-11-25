import React, { useState, useRef } from 'react';
import { decodeMorseBothWays } from './morseDecoder.js';
import { parseGIFFrames, framesToRLE, lightIsRed } from '../../utils/gif.js';
import { useAppState } from '../../core/AppStateContext.jsx';
import { useToast } from '../../core/ToastContext.jsx';
import { useClipboard } from '../../core/useClipboard.js';
import { useInstance } from '../../core/InstanceContext.jsx';
import { Dropzone } from '../../core/Dropzone.jsx';
import { ModuleLayout } from '../../core/components/ModuleLayout.jsx';
import { ModuleInput } from '../../core/components/ModuleInput.jsx';
import { AnswerPanel } from '../../core/components/AnswerPanel.jsx';
import { CopyLines } from '../../core/components/CopyLines.jsx';
import { WorkingPanel } from '../../core/components/WorkingPanel.jsx';
import { MorseWorking } from './working.jsx';

// which reading to auto-copy: one with a known frequency, else one made of real letters.
// A red light means swapped flashes, so the swapped reading is tried first.
function preferred(dec, red = false) {
  const order = red ? [dec.swapped, dec.forward, dec.backward] : [dec.forward, dec.backward, dec.swapped];
  return order.find(d => d.frequency) || order.find(d => d.valid) || order[0];
}

const DIRS = [['forward', '▶ FORWARD'], ['backward', '◀ BACKWARD'], ['swapped', '⇄ SWAPPED']];

export function MorseModule({ isActive = true }) {
  const { copyOnDecode, setLastCopyString, setLastImage } = useAppState();
  const { showToast } = useToast();
  const { copy } = useClipboard();
  const inst = useInstance();

  const [rle, setRle] = useState([]);
  const [decoded, setDecoded] = useState(null);
  const [frameCount, setFrameCount] = useState(0);
  const [previewUri, setPreviewUri] = useState('');
  const [previewMeta, setPreviewMeta] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // red light: long and short flashes are swapped, so the SWAPPED reading is the one auto-copied
  const [redLight, setRedLight] = useState(false);
  // async results read the live tab state, not the one captured when the work started
  const activeRef = useRef(isActive);
  activeRef.current = isActive;

  const handleImage = async (img, dataUri, fileBlob) => {
    setPreviewUri(dataUri);
    setPreviewMeta(`${img.naturalWidth}×${img.naturalHeight} px source`);
    setLastImage(img, fileBlob);
    setError('');

    if (!fileBlob) {
      setError('Please upload or drag an actual .gif file to extract blinking frames.');
      return;
    }

    try {
      setLoading(true);
      const frames = await parseGIFFrames(fileBlob);
      if (!frames || frames.length === 0) {
        throw new Error('Could not parse frames from GIF');
      }

      const generatedRle = framesToRLE(frames);
      const red = lightIsRed(frames);
      setRedLight(red);
      setFrameCount(frames.length);
      applyDecode(generatedRle, red);
    } catch (err) {
      console.error('Morse GIF processing error:', err);
      setError(`Failed to process GIF: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // decode all three readings, show them, and auto-copy the preferred one
  const applyDecode = (pulses, red) => {
    const dec = decodeMorseBothWays(pulses);
    setRle(pulses);
    setDecoded(dec);
    const word = preferred(dec, red).word || '';
    if (activeRef.current) {
      setLastCopyString(word);
      if (copyOnDecode && word) copy(word);
    }
  };

  const handleSample = () => {
    const unit = 100;
    const dot = { is_on: true, duration: unit };
    const dash = { is_on: true, duration: unit * 3 };
    const intra = { is_on: false, duration: unit };
    const interLetter = { is_on: false, duration: unit * 3 };
    const interWord = { is_on: false, duration: unit * 7 };

    const sampleRle = [
      dot, intra, dot, intra, dot, interLetter,
      dot, intra, dot, intra, dot, intra, dot, interLetter,
      dot, interLetter,
      dot, intra, dash, intra, dot, intra, dot, interLetter,
      dot, intra, dash, intra, dot, intra, dot, interWord
    ];

    const dec = decodeMorseBothWays(sampleRle);
    setRle(sampleRle);
    setDecoded(dec);
    setRedLight(false);
    setFrameCount(30);
    const w = preferred(dec).word || 'SHELL';
    if (isActive) {
      setLastCopyString(w);
      if (copyOnDecode && w) copy(w);
    }
    showToast('SAMPLE MORSE ("SHELL") LOADED ✓');
  };

  const handleReset = () => {
    setRle([]);
    setDecoded(null);
    setFrameCount(0);
    setPreviewUri('');
    setPreviewMeta('');
    setError('');
    setRedLight(false);
    if (isActive) {
      setLastCopyString('');
    }
    setLastImage(null, null);
    showToast('MORSE CLEARED ✓');
  };

  const copyItems = [];
  if (decoded) {
    for (const [k, name] of DIRS) {
      const { word, frequency: freq } = decoded[k];
      const side = name.split(' ')[1];
      if (word) copyItems.push({ label: `COPY ${side} WORD (${word})`, value: word });
      if (word && freq) copyItems.push({ label: `COPY ${side} BOTH (${word} - ${freq})`, value: `${word} ${freq}` });
    }
  }
  // one line for this card's box when several Morse modules are grouped
  const summary = decoded ? DIRS.map(([k, n]) => `${n[0]} ${decoded[k].word || '—'}`).join('  ') : '';
  React.useEffect(() => { if (inst && inst.report) inst.report(summary); }, [summary]);

  const dirPanel = ([k, name]) => {
    const d = decoded && decoded[k];
    const n = d ? d.letters.filter(l => l.char !== ' ').length : 0;
    return (
      <AnswerPanel
        key={k}
        report={false}
        label={name}
        stats={d ? `${n} LETTERS · ${d.frequency ? 'IN WORD LIST' : d.valid ? 'NOT IN WORD LIST' : 'UNKNOWN LETTERS'}${k === 'swapped' && redLight ? ' · 🔴 RED LIGHT' : ''}` : (k === 'forward' ? `FRAMES: ${frameCount}` : null)}
        answers={d && d.word ? [d.word, d.frequency].filter(Boolean) : []}
        copyValue={(d && d.word) || null}
        placeholder="WAITING FOR MORSE GIF"
      />
    );
  };

  const legend = (
    <div className="legend" style={{ display: 'flex' }}>
      <div className="legend-item"><div className="legend-box dot"></div> Dot</div>
      <div className="legend-item"><div className="legend-box dash"></div> Dash</div>
    </div>
  );

  return (
    <ModuleLayout
      input={
        <ModuleInput
          dropzone={
            <Dropzone
              onImage={handleImage}
              icon="📡 •• — ••"
              title="Click here, then paste an animated Morse GIF"
              sub="Drag & drop or paste an animated GIF of the blinking light"
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
              <button className="reset-btn" type="button" onClick={handleReset}>
                clear
              </button>
              <button
                className="reset-btn"
                type="button"
                style={{ borderColor: 'var(--brass)', color: 'var(--brass)' }}
                onClick={handleSample}
              >
                ⚡ SAMPLE ("SHELL")
              </button>
            </>
          }
        >
          {loading && (
            <div className="shared-empty-state">
              <span className="shared-empty-text">⏳ Extracting GIF frames and analyzing Morse pulses…</span>
            </div>
          )}
          {error && (
            <div className="shared-error-state">
              <span>{error}</span>
            </div>
          )}
        </ModuleInput>
      }
      answers={
        <div className="morse-stamps">{DIRS.map(dirPanel)}</div>
      }
      copylines={<CopyLines items={copyItems} />}
      working={
        <WorkingPanel
          title="SIGNAL WAVEFORM — dot/dash breakdown and timing"
          legend={legend}
        >
          <MorseWorking rle={rle} decoded={decoded} frameCount={frameCount} />
        </WorkingPanel>
      }
    />
  );
}

export const morseModule = {
  id: 'morse',
  tabId: 'tabMorse',
  tabLabel: '📡 MORSE (GIF)',
  eyebrow: 'MORSE CODE SOLVER',
  title: 'Morse Vision',
  sub: 'Upload or paste an animated GIF of the blinking Morse transmitter light. Automatically extracts pulses and decodes the <b>word & radio frequency</b> three ways — <b>forward</b>, <b>backward</b> (some games play the word in reverse) and <b>swapped</b> (dots and dashes swapped) — click the one that makes sense to copy it. A <b>red light</b> means swapped flashes, so that reading is the one auto-copied.',
  Component: MorseModule
};
