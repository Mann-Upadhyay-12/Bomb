"""Shared pieces: character set, fonts, colours, real-image loader, stable train/val split.

Designed to integrate seamlessly with both the CTC Transformer and old slot model pipelines,
as well as the project's root dataset directory (captcja).
"""
import os
import sys
import zlib
import colorsys
import numpy as np
import cv2
from PIL import ImageFont

# Ensure this directory is in sys.path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

# The only characters that can be a captcha ANSWER. (Decoy letters in the background use the wider DECOY_SET.)
CHARSET = "234579ADEGHMNQRTabdefhimnrt"
DECOY_SET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz"

# Full resolution dimensions (original game resolution)
H = 210
SIZES = {4: (360, 58), 6: (434, 56), 8: (542, 54)}        # N characters -> (image width, slot width) at full resolution

# Half resolution dimensions (used by CNN/Transformer models)
H_HALF = 105
SIZES_HALF = {4: (180, 29), 6: (217, 28), 8: (271, 27)}  # N characters -> (image width, slot width) at half resolution

WIDTH_TO_N = {
    360: 4, 434: 6, 542: 8,
    180: 4, 217: 6, 271: 8
}
DIFF = {4: 'EASY', 6: 'MID', 8: 'HARD'}


def find_captcha_dir():
    """Locate the dataset directory (checking environment variable and project structures)."""
    if os.environ.get('CAPTCHA_DIR'):
        return os.path.abspath(os.environ['CAPTCHA_DIR'])
    candidates = [
        os.path.join(SCRIPT_DIR, "..", "captcja"),
        os.path.join(SCRIPT_DIR, "..", "captchas"),
        os.path.join(SCRIPT_DIR, "captcja"),
        os.path.join(SCRIPT_DIR, "captchas"),
        os.path.abspath("captcja"),
        os.path.abspath("captchas"),
        os.path.abspath("../captcja"),
        os.path.abspath("../captchas"),
    ]
    for cand in candidates:
        if os.path.isdir(cand):
            return os.path.abspath(cand)
    return os.path.abspath(os.path.join(SCRIPT_DIR, "..", "captcja"))


DATA_DIR = find_captcha_dir()


# ---------- fonts (only used by the fake-captcha generator) ----------
_FONT_NAMES = [
    ("DejaVuSans-Bold.ttf", 5), ("DejaVuSansCondensed-Bold.ttf", 2), ("FreeSansBold.ttf", 2),
    ("FreeSansBold.otf", 2), ("LiberationSans-Bold.ttf", 2), ("Carlito-Bold.ttf", 1),
    ("arialbd.ttf", 2), ("verdanab.ttf", 3), ("NotoSans-Bold.ttf", 2)
]
_FONT_DIRS = [
    "/usr/share/fonts", "/usr/local/share/fonts", os.path.expanduser("~/.local/share/fonts"),
    os.path.expanduser("~/.fonts"), "C:\\Windows\\Fonts", "/Library/Fonts", "/System/Library/Fonts"
]


def find_fonts():
    """Discover available sans-bold TrueType/OpenType fonts on the operating system."""
    want = {n.lower(): w for n, w in _FONT_NAMES}
    found = []
    for d in _FONT_DIRS:
        if not os.path.isdir(d):
            continue
        for root, _, files in os.walk(d):
            for f in files:
                if f.lower() in want:
                    found += [os.path.join(root, f)] * want[f.lower()]
    if not found:
        # Fallback search for any sans bold font
        for d in _FONT_DIRS:
            if not os.path.isdir(d):
                continue
            for root, _, files in os.walk(d):
                for f in files:
                    fl = f.lower()
                    if fl.endswith(('.ttf', '.otf')) and 'sans' in fl and 'bold' in fl and 'italic' not in fl:
                        found.append(os.path.join(root, f))
    if not found:
        found = ["default"]
    return found


_FP = None


def font_paths():
    """Return cached list of available font file paths."""
    global _FP
    if _FP is None:
        _FP = find_fonts()
    return _FP


_fc = {}


def font(path, size):
    """Load and cache ImageFont instance with graceful fallback."""
    k = (path, size)
    if k not in _fc:
        try:
            if path == "default" or not os.path.exists(path):
                _fc[k] = ImageFont.load_default()
            else:
                _fc[k] = ImageFont.truetype(path, size)
        except Exception:
            _fc[k] = ImageFont.load_default()
    return _fc[k]


# ---------- colours & geometry ----------
def dark_color(rng):
    r, g, b = colorsys.hsv_to_rgb(rng.random(), rng.uniform(0.55, 1.0), rng.uniform(0.28, 0.62))
    return (float(r * 255.0), float(g * 255.0), float(b * 255.0))


def pale_color(rng):
    r, g, b = colorsys.hsv_to_rgb(rng.random(), rng.uniform(0.15, 0.45), rng.uniform(0.8, 0.95))
    return (float(r * 255.0), float(g * 255.0), float(b * 255.0))


def bg_color(rng):
    r, g, b = colorsys.hsv_to_rgb(rng.random(), rng.uniform(0.04, 0.2), rng.uniform(0.9, 0.97))
    return (float(r * 255.0), float(g * 255.0), float(b * 255.0))


def bezier(p0, p1, p2, p3, n=120):
    t = np.linspace(0, 1, n)[:, None]
    return (((1.0 - t) ** 3) * p0 + 3.0 * ((1.0 - t) ** 2) * t * p1 + 3.0 * (1.0 - t) * (t ** 2) * p2 + (t ** 3) * p3).astype(np.float32)


def rand_text(N, rng):
    return "".join(rng.choice(CHARSET) for _ in range(N))


def enc(ts):
    """Encode text strings to integer class index arrays."""
    return np.array([[CHARSET.index(c) for c in t] for t in ts], np.int32)


def dec(indices):
    """Decode integer class index sequence to string."""
    return "".join(CHARSET[i] for i in indices)


# ---------- real data loading & splits ----------
class CaptchaSample(tuple):
    """
    Hybrid data container:
    - Behaves as a 2-tuple (img, text) so `im, t = sample`, `sample[0]`, `sample[1]`, `len(sample[1])` all work.
    - Behaves as a dict: `sample['name']`, `sample['text']`, `sample['img']`, `sample['full_img']`.
    - Behaves as an object: `sample.name`, `sample.text`, `sample.img`, `sample.full_img`.
    """
    def __new__(cls, img, text, name='', full_img=None):
        return super().__new__(cls, (img, text))

    def __init__(self, img, text, name='', full_img=None):
        self.name = name
        self._full_img = full_img if full_img is not None else img

    @property
    def img(self):
        return self[0]

    @property
    def text(self):
        return self[1]

    @property
    def full_img(self):
        return self._full_img

    def __getitem__(self, key):
        if key == 'img' or key == 0:
            return super().__getitem__(0)
        if key == 'text' or key == 1:
            return super().__getitem__(1)
        if key == 'name':
            return self.name
        if key == 'full_img':
            return self._full_img
        return super().__getitem__(key)

    def get(self, key, default=None):
        if key == 'img' or key == 0:
            return super().__getitem__(0)
        if key == 'text' or key == 1:
            return super().__getitem__(1)
        if key == 'name':
            return self.name
        if key == 'full_img':
            return self._full_img
        return default

    def keys(self):
        return ['name', 'text', 'img', 'full_img']

    def __repr__(self):
        return f"CaptchaSample(name='{self.name}', text='{self.text}', shape={self[0].shape})"


def load_real(d=None, verbose=True, half_res=True, as_dict=False):
    """
    Load captcha images from dataset directory.

    Args:
        d: Dataset folder (defaults to auto-detected DATA_DIR, e.g. captcja).
        verbose: Print warnings for skipped or malformed files.
        half_res: If True (default), resizes images to (W//2, 105) for CNN/CTC input.
                  Full-resolution images (H=210) remain accessible via sample.full_img.
        as_dict: If True, returns standard Python dicts instead of CaptchaSample tuples.

    Returns:
        List of CaptchaSample instances (compatible with (im, t) tuples and dicts).
    """
    d = d or DATA_DIR
    if not os.path.isdir(d):
        raise FileNotFoundError(f"Captcha dataset directory not found: '{d}'")

    out = []
    for f in sorted(os.listdir(d)):
        if not f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
            continue
        t = os.path.splitext(f)[0].split('-')[0]
        bad = [c for c in t if c not in CHARSET]
        if bad:
            if verbose:
                print('SKIPPED (not a possible answer character %s):' % ''.join(bad), f)
            continue

        filepath = os.path.join(d, f)
        raw = cv2.imread(filepath, cv2.IMREAD_COLOR)
        if raw is None:
            if verbose:
                print('SKIPPED (unreadable):', f)
            continue

        im_full = cv2.cvtColor(raw, cv2.COLOR_BGR2RGB)
        expected_len = WIDTH_TO_N.get(im_full.shape[1])
        if expected_len != len(t) or im_full.shape[0] != H:
            if verbose:
                print('SKIPPED (size %dx%d does not match %d characters):' % (im_full.shape[1], im_full.shape[0], len(t)), f)
            continue

        if half_res:
            im = cv2.resize(im_full, (im_full.shape[1] // 2, H_HALF), interpolation=cv2.INTER_AREA)
        else:
            im = im_full

        if as_dict:
            out.append(dict(name=f, text=t, img=im, full_img=im_full))
        else:
            out.append(CaptchaSample(im, t, name=f, full_img=im_full))
    return out


def is_val(name_or_sample, pct):
    """Stable split by filename/text hash: adding new images later never moves old images between train and val."""
    if isinstance(name_or_sample, CaptchaSample):
        key = name_or_sample.name or name_or_sample.text
    elif isinstance(name_or_sample, dict):
        key = name_or_sample.get('name', name_or_sample.get('text', ''))
    elif isinstance(name_or_sample, (tuple, list)) and len(name_or_sample) > 1:
        key = name_or_sample[1]
    else:
        key = str(name_or_sample)
    return (zlib.crc32(key.encode('utf-8')) % 100) < pct


def split(real, pct):
    """Split dataset into (train, val) partitions using stable hash."""
    va = [r for r in real if is_val(r, pct)] if pct > 0 else []
    tr = [r for r in real if not (pct > 0 and is_val(r, pct))]
    return tr, va
