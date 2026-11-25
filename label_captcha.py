#!/usr/bin/env python3
"""
label_captcha.py — add captchas to the training set (captcja/) by drag-and-drop.

Drop (or Ctrl+V) captcha images on the page — files, or images dragged straight from Discord (the link is
downloaded, from cdn.discordapp.com so it is the original, not a resized preview). Your CTC model reads each one exactly like the app does
(5 shifted reads averaged, score = confidence × agreement, threshold from spec_ctc.json):
  - confident  → the label box is pre-filled with the model's answer; check it, fix it, Save
  - not sure   → the label box is left empty and the model's guess is shown; type the label, Save
Saved as captcja/<label>.png (or <label>-2.png … if that name exists), the format load_real() reads.

Run with the venv that has TensorFlow:
    .venv/bin/python label_captcha.py
then open http://127.0.0.1:8765
"""
import os, sys, json, hashlib, argparse
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, urlencode, parse_qsl
from urllib.request import Request, urlopen

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)
import train_captcha as tc  # read_one() = the same TTA read + score the app uses

ap = argparse.ArgumentParser()
ap.add_argument('--captcha-dir', default=os.path.join(SCRIPT_DIR, 'captcja'))
ap.add_argument('--files1', default=None, help="folder with model_ctc.py + ctc_final.weights.h5")
ap.add_argument('--weights', default=None, help='default: <files1>/ctc_final.weights.h5')
ap.add_argument('--port', type=int, default=8765)
args = ap.parse_args()

files1 = args.files1 or next((p for p in tc.FILES1_CANDIDATES if os.path.isfile(os.path.join(p, 'model_ctc.py'))), None)
if not files1:
    sys.exit('Could not find files(1) with model_ctc.py — pass --files1')
sys.path.insert(0, files1)

import numpy as np, cv2
from common import CHARSET, WIDTH_TO_N, SIZES, H, H_HALF
import model_ctc

spec = json.load(open(os.path.join(SCRIPT_DIR, 'spec_ctc.json')))
THRESH = float(spec.get('thresh', 0.5))
SCORE = (spec.get('tta') or {}).get('score', 'prod')
cfg = json.load(open(os.path.join(files1, 'ctc_cfg.json')))
weights = args.weights or os.path.join(files1, 'ctc_final.weights.h5')
print(f'Loading model {weights} …', flush=True)
model = model_ctc.build(**cfg)
model.load_weights(weights)
CAP = os.path.abspath(args.captcha_dir)
os.makedirs(CAP, exist_ok=True)


def pixel_hash(rgb):
    return hashlib.md5(rgb.tobytes()).hexdigest()


def decode(data):
    raw = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if raw is None:
        return None, None, 'not an image'
    rgb = cv2.cvtColor(raw, cv2.COLOR_BGR2RGB)
    h, w = rgb.shape[:2]
    if h != H or w not in WIDTH_TO_N:
        sizes = ' / '.join(f'{SIZES[n][0]}×{H}' for n in sorted(SIZES))
        return rgb, None, f'size {w}×{h} is not a captcha size ({sizes}) — training would skip it'
    return rgb, WIDTH_TO_N[w], None


# pixel hashes of everything already in captcja/, so the same captcha isn't added twice
print(f'Indexing {CAP} …', flush=True)
known = {}
for f in sorted(os.listdir(CAP)):
    if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
        im = cv2.imread(os.path.join(CAP, f), cv2.IMREAD_COLOR)
        if im is not None:
            known[pixel_hash(cv2.cvtColor(im, cv2.COLOR_BGR2RGB))] = f
print(f'{len(known)} images in the dataset. Threshold {THRESH} (score: {SCORE})', flush=True)


def predict(data):
    rgb, n, err = decode(data)
    if err:
        return dict(ok=False, error=err)
    half = cv2.resize(rgb, (rgb.shape[1] // 2, H_HALF), interpolation=cv2.INTER_AREA)
    r = tc.read_one(model, half, n, True)
    score = r['tta_prod'] * r['agree'] if SCORE == 'prod_agree' else r['tta_prod']
    return dict(ok=True, n=n, guess=r['tta_pred'], score=round(score, 4), thresh=THRESH,
                confident=score >= THRESH, agree=r['agree'], duplicate=known.get(pixel_hash(rgb)))


def save(data, label):
    rgb, n, err = decode(data)
    if err:
        return dict(ok=False, error=err)
    bad = sorted(set(c for c in label if c not in CHARSET))
    if bad:
        return dict(ok=False, error=f'not answer characters: {"".join(bad)} (allowed: {CHARSET})')
    if len(label) != n:
        return dict(ok=False, error=f'this captcha has {n} characters, the label has {len(label)}')
    h = pixel_hash(rgb)
    if h in known:
        return dict(ok=False, error=f'already in the dataset as {known[h]}')
    name, k = f'{label}.png', 1
    while os.path.exists(os.path.join(CAP, name)):
        k += 1
        name = f'{label}-{k}.png'
    path = os.path.join(CAP, name)
    if data[:8] == b'\x89PNG\r\n\x1a\n':
        open(path, 'wb').write(data)  # keep the original bytes
    else:
        cv2.imwrite(path, cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR))
    known[h] = name
    return dict(ok=True, saved=name, total=len(known))


def original_url(url):
    """Discord's media.discordapp.net preview links can be resized / re-encoded (width=, height=, format=).
    The same attachment on cdn.discordapp.com without those parameters is the original file."""
    u = urlparse(url)
    if u.netloc == 'media.discordapp.net' and u.path.startswith('/attachments/'):
        keep = [(k, v) for k, v in parse_qsl(u.query) if k not in ('width', 'height', 'format', 'quality')]
        return u._replace(netloc='cdn.discordapp.com', query=urlencode(keep)).geturl()
    return url


def fetch(url):
    """Download a dragged image link (the browser can't read most hosts itself)."""
    if urlparse(url).scheme not in ('http', 'https'):
        raise ValueError('not a web link: ' + url[:80])
    tried = []
    for u in dict.fromkeys([original_url(url), url]):  # original first, the link as dropped second
        try:
            with urlopen(Request(u, headers={'User-Agent': 'Mozilla/5.0'}), timeout=15) as r:
                data = r.read(20_000_000)
            if cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR) is not None:
                return data
            tried.append(f'{u[:60]}…: not an image')
        except Exception as e:
            tried.append(f'{u[:60]}…: {e}')
    raise ValueError('could not download the image (' + '; '.join(tried) + ')')


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype='application/json'):
        if not isinstance(body, bytes):
            body = json.dumps(body).encode()
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if urlparse(self.path).path in ('/', '/index.html'):
            html = open(os.path.join(SCRIPT_DIR, 'label_captcha.html'), 'rb').read()
            html = html.replace(b'__CHARSET__', CHARSET.encode()).replace(b'__TOTAL__', str(len(known)).encode())
            return self._send(200, html, 'text/html; charset=utf-8')
        self._send(404, {'error': 'not found'})

    def do_POST(self):
        u = urlparse(self.path)
        data = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        try:
            if u.path == '/predict':
                return self._send(200, predict(data))
            if u.path == '/fetch':
                return self._send(200, fetch(data.decode('utf-8').strip()), 'application/octet-stream')
            if u.path == '/save':
                label = parse_qs(u.query).get('label', [''])[0].strip()
                return self._send(200, save(data, label))
        except Exception as e:  # show the error on the page instead of a dead request
            return self._send(500, dict(ok=False, error=f'{type(e).__name__}: {e}'))
        self._send(404, {'error': 'not found'})

    def log_message(self, *a):
        pass


if __name__ == '__main__':
    print(f'Open http://127.0.0.1:{args.port}  (Ctrl+C to stop)', flush=True)
    HTTPServer(('127.0.0.1', args.port), Handler).serve_forever()
