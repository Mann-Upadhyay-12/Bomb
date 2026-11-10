import React, { useState, useRef } from 'react';
import { decodeMorseRLE } from './morseDecoder.js';
import { parseGIFFrames, framesToRLE } from '../../utils/gif.js';
import { useAppState } from '../../core/AppStateContext.jsx';
import { useToast } from '../../core/ToastContext.jsx';
import { useClipboard } from '../../core/useClipboard.js';
import { Dropzone } from '../../core/Dropzone.jsx';
import { ModuleLayout } from '../../core/components/ModuleLayout.jsx';
import { ModuleInput } from '../../core/components/ModuleInput.jsx';
import { AnswerPanel } from '../../core/components/AnswerPanel.jsx';
import { CopyLines } from '../../core/components/CopyLines.jsx';
import { WorkingPanel } from '../../core/components/WorkingPanel.jsx';
import { MorseWorking } from './working.jsx';

export function MorseModule({ isActive = true }) {
  const { copyOnDecode, setLastCopyString, setLastImage } = useAppState();
  const { showToast } = useToast();
  const { copy } = useClipboard();

  const [rle, setRle] = useState([]);
  const [decoded, setDecoded] = useState(null);
  const [frameCount, setFrameCount] = useState(0);
  const [previewUri, setPreviewUri] = useState('');
  const [previewMeta, setPreviewMeta] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
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
      const dec = decodeMorseRLE(generatedRle);

      setRle(generatedRle);
      setDecoded(dec);
      setFrameCount(frames.length);

      const word = (dec && dec.word) || '';
      if (activeRef.current) {
        setLastCopyString(word);
        if (copyOnDecode && word) {
          copy(word);
        }
      }
    } catch (err) {
      console.error('Morse GIF processing error:', err);
      setError(`Failed to process GIF: ${err.message}`);
    } finally {
      setLoading(false);
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

    const dec = decodeMorseRLE(sampleRle);
    setRle(sampleRle);
    setDecoded(dec);
    setFrameCount(30);
    const w = (dec && dec.word) || 'SHELL';
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
    if (isActive) {
      setLastCopyString('');
    }
    setLastImage(null, null);
    showToast('MORSE CLEARED ✓');
  };

  const word = (decoded && decoded.word) || '';
  const freq = (decoded && decoded.frequency) || '';
  const letters = (decoded && decoded.letters) || [];

  const copyItems = [];
  if (word) {
    copyItems.push({ label: `COPY WORD (${word})`, value: word });
  }
  if (freq) {
    copyItems.push({ label: `COPY FREQ (${freq})`, value: freq });
  }
  if (word && freq) {
    copyItems.push({ label: `COPY BOTH (${word} - ${freq})`, value: `${word} ${freq}` });
  }

  const legend = (
    <div className="legend" style={{ display: 'flex' }}>
      <div className="legend-item"><div className="legend-box dot"></div> Dot</div>
      <div className="legend-item"><div className="legend-box dash"></div> Dash</div>
    </div>
  );

  const stampStats = decoded
    ? `FRAMES: ${frameCount} | LETTERS: ${letters.filter(l => l.char !== ' ').length} | FREQ: ${freq || 'N/A'}`
    : 'FRAMES: 0 | WAITING FOR GIF';

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
        <AnswerPanel
          label="DECODED MORSE WORD & FREQUENCY"
          stats={stampStats}
          answers={word ? [word, freq].filter(Boolean) : []}
          copyValue={word}
          placeholder="WAITING FOR MORSE GIF"
        />
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
  sub: 'Upload or paste an animated GIF of the blinking Morse transmitter light. Automatically extracts pulses, decodes the <b>word & radio frequency</b>, and copies to your clipboard!',
  Component: MorseModule
};
