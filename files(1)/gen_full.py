"""Fake captchas imitating the game's style at FULL resolution (210 x 360/434/542), plus a clutter overlay used to
augment real images. Supports both native full-resolution (H=210) and model half-resolution (H=105).
"""
import os
import sys
import random
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFont

# Ensure directory is in sys.path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from common import (
    CHARSET, DECOY_SET, SIZES, SIZES_HALF, H, H_HALF,
    font_paths, font, dark_color, pale_color, bg_color, bezier, rand_text
)


def glyph_mask(ch, size, path):
    """Render a single character glyph to an alpha mask image array."""
    f = font(path, size)
    im = Image.new("L", (size * 2, size * 2), 0)
    d = ImageDraw.Draw(im)
    try:
        bb = d.textbbox((0, 0), ch, font=f)
        w, h = bb[2] - bb[0], bb[3] - bb[1]
        d.text(((size * 2 - w) // 2 - bb[0], (size * 2 - h) // 2 - bb[1]), ch, fill=255, font=f)
    except Exception:
        d.text((size // 2, size // 2), ch, fill=255, font=f)
    return np.array(im)


def draw_curve(img, rng, col, thick):
    """Draw a smooth random Bezier curve across the captcha."""
    h, w = img.shape[:2]
    p0 = np.array([rng.uniform(-20, 40), rng.uniform(40, h - 40)])
    p3 = np.array([rng.uniform(w - 40, w + 20), rng.uniform(40, h - 40)])
    p1 = np.array([rng.uniform(0.15 * w, 0.5 * w), rng.uniform(15, h - 15)])
    p2 = np.array([rng.uniform(0.5 * w, 0.85 * w), rng.uniform(15, h - 15)])
    pts = bezier(p0, p1, p2, p3).astype(np.int32).reshape(-1, 1, 2)
    cv2.polylines(img, [pts], False, tuple(float(c) for c in col), max(1, int(thick)), cv2.LINE_AA)


def blend_glyph(img, ch, rng, size, alpha, color):
    """Pale rotated decoy letter blended into img (in place)."""
    h, w = img.shape[:2]
    fp = font_paths()
    chosen_font = rng.choice(fp) if fp else "default"
    m = glyph_mask(ch, size, chosen_font)
    M = cv2.getRotationMatrix2D((size, size), rng.uniform(-60, 60), 1.0)
    m = cv2.warpAffine(m, M, (size * 2, size * 2))
    x0 = rng.randint(-size, w - size)
    y0 = rng.randint(-size, h - size)
    xs, ys = max(0, x0), max(0, y0)
    xe, ye = min(w, x0 + 2 * size), min(h, y0 + 2 * size)
    if xe > xs and ye > ys:
        sub = (m[ys - y0:ye - y0, xs - x0:xe - x0].astype(np.float32) / 255.0 * alpha)[..., None]
        img[ys:ye, xs:xe] = img[ys:ye, xs:xe] * (1.0 - sub) + np.array(color, np.float32) * sub


def render(text, rng=None, level=1.0, half_res=False):
    """
    Render a synthetic captcha image imitating the game's style.

    Args:
        text: Target text string (e.g. '22Gr') or length integer (4, 6, 8).
        rng: Random instance or seed (defaults to random.Random()).
        level: Clutter/distortion scale (0.0 to 1.0).
        half_res: If True, downsample to (W//2, 105) for CNN/CTC model input.

    Returns:
        RGB uint8 numpy array with shape (210, W, 3) or (105, W//2, 3).
    """
    if rng is None:
        rng = random.Random()
    elif isinstance(rng, (int, float)):
        rng = random.Random(int(rng))

    if isinstance(text, int):
        text = rand_text(text, rng)

    N = len(text)
    if N not in SIZES:
        raise ValueError(f"Invalid text length {N}. Expected 4, 6, or 8 characters.")

    W, sw = SIZES[N]
    fp = font_paths()

    c1 = np.array(bg_color(rng))
    c2 = np.array(bg_color(rng))
    ang = rng.uniform(0, np.pi)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    t = (xx - W / 2.0) * np.cos(ang) + (yy - H / 2.0) * np.sin(ang)
    t = (t - t.min()) / (t.max() - t.min() + 1e-6)
    img = (c1[None, None] * (1.0 - t[..., None]) + c2[None, None] * t[..., None]).astype(np.float32)

    # Background pale decoy letters
    for _ in range(int(rng.randint(9, 16) * level)):
        chosen_font = rng.choice(fp) if fp else "default"
        blend_glyph(img, rng.choice(DECOY_SET), rng, rng.randint(34, 80), rng.uniform(0.3, 0.6), pale_color(rng))

    layer = np.zeros((H, W, 3), np.float32)
    alpha = np.zeros((H, W), np.float32)
    x0c = (W - N * sw) / 2.0
    A = rng.uniform(4, 34) * (0.4 + 0.6 * level)
    lam = rng.uniform(260, 800)
    ph = rng.uniform(0, 6.28)
    tilt = rng.uniform(-0.12, 0.12) * level
    hollow_p = rng.choice([0.15, 0.3, 0.4]) * (0.3 + 0.7 * level)
    palette = [dark_color(rng) for _ in range(rng.randint(3, 6))]

    for i, ch in enumerate(text):
        size = rng.randint(62, 82)
        chosen_font = rng.choice(fp) if fp else "default"
        m = glyph_mask(ch, size, chosen_font)
        sc = rng.uniform(1 - 0.15 * level, 1 + 0.12 * level)
        if ch in ('4', 'A', 'a'):
            rot = rng.uniform(-20, 20) * level
            shear = rng.uniform(-0.10, 0.10) * level
        elif ch in ('r', 't', 'f'):
            rot = rng.uniform(-22, 22) * level
            shear = rng.uniform(-0.12, 0.12) * level
        else:
            rot = rng.uniform(-28, 28) * level
            shear = rng.uniform(-0.18, 0.18) * level
        M = cv2.getRotationMatrix2D((size, size), rot, sc)
        M[0, 1] += shear
        m = cv2.warpAffine(m, M, (size * 2, size * 2), flags=cv2.INTER_LINEAR)
        gy, gx = np.mgrid[0:size * 2, 0:size * 2].astype(np.float32)
        a1, a2 = rng.uniform(0.5, 3.0) * level, rng.uniform(0.5, 3.0) * level
        l1, l2 = rng.uniform(25, 60), rng.uniform(25, 60)
        m = cv2.remap(m, gx + a1 * np.sin(gy / l1 * 6.28 + rng.uniform(0, 6.28)), gy + a2 * np.sin(gx / l2 * 6.28 + rng.uniform(0, 6.28)), cv2.INTER_LINEAR)
        mb = (m > 127).astype(np.uint8)
        hollow = rng.random() < hollow_p
        if hollow:
            mb = mb - cv2.erode(mb, np.ones((3, 3), np.uint8), iterations=rng.choice([2, 3, 3, 4]))
        m = mb.astype(np.float32)
        if (not hollow) and rng.random() < 0.5 * level:
            # stippled edge (filled glyphs only)
            edge = cv2.morphologyEx(mb, cv2.MORPH_GRADIENT, np.ones((3, 3), np.uint8)).astype(np.float32)
            keep = (np.random.RandomState(rng.randint(0, 10 ** 6)).rand(*m.shape) > 0.3).astype(np.float32)
            m = m * (1.0 - edge * (1.0 - keep))
        m = cv2.GaussianBlur(m, (3, 3), 0.6)
        cx = x0c + sw * (i + 0.5) + rng.uniform(-6, 6)
        cy = H / 2.0 + A * np.sin(2.0 * np.pi * cx / lam + ph) + tilt * (cx - W / 2.0) + rng.uniform(-10, 10) * level
        col = rng.choice(palette)
        px, py = int(round(cx - size)), int(round(cy - size))
        xs, ys = max(0, px), max(0, py)
        xe, ye = min(W, px + 2 * size), min(H, py + 2 * size)
        if xe <= xs or ye <= ys:
            continue
        sub = m[ys - py:ye - py, xs - px:xe - px]
        for c in range(3):
            layer[ys:ye, xs:xe, c] = layer[ys:ye, xs:xe, c] * (1.0 - sub) + col[c] * sub
        alpha[ys:ye, xs:xe] = np.maximum(alpha[ys:ye, xs:xe], sub)

    gy, gx = np.mgrid[0:H, 0:W].astype(np.float32)
    ax, ay = rng.uniform(0.5, 3.0) * level, rng.uniform(1.0, 5.0) * level
    mx = gx + ax * np.sin(gy / rng.uniform(40, 120) * 6.28 + rng.uniform(0, 6.28))
    my = gy + ay * np.sin(gx / rng.uniform(60, 160) * 6.28 + rng.uniform(0, 6.28))
    layer = cv2.remap(layer, mx, my, cv2.INTER_LINEAR)
    alpha = cv2.remap(alpha, mx, my, cv2.INTER_LINEAR)

    for _ in range(int(rng.randint(4, 8) * level)):
        draw_curve(img, rng, pale_color(rng), rng.randint(1, 2))   # pale curves under text

    a3 = alpha[..., None]
    img[:] = img * (1.0 - a3) + layer * a3

    for _ in range(int(rng.randint(3, 5) * level + (1 if level > 0.1 else 0))):
        draw_curve(img, rng, dark_color(rng) if rng.random() < 0.8 else pale_color(rng), rng.choice([2, 2, 3]))

    for _ in range(int(rng.randint(200, 380) * level)):
        x, y = rng.randint(0, W - 2), rng.randint(0, H - 2)
        r = rng.choice([1, 1, 2])
        a = rng.uniform(0.5, 1.0)
        col = np.array(dark_color(rng) if rng.random() < 0.5 else pale_color(rng), np.float32)
        img[y:y + r, x:x + r] = img[y:y + r, x:x + r] * (1.0 - a) + col * a

    res = np.clip(img, 0, 255).astype(np.uint8)
    if half_res:
        res = cv2.resize(res, (W // 2, H_HALF), interpolation=cv2.INTER_AREA)
    return res


def clutter(im, rng=None):
    """
    Extra thin curves, dots and pale decoys on top of a REAL image (augmentation).

    Supports both full-resolution (H=210) and half-resolution (H=105) inputs.
    Returns uint8 RGB copy.
    """
    if rng is None:
        rng = random.Random()
    elif isinstance(rng, (int, float)):
        rng = random.Random(int(rng))

    img = im.astype(np.float32).copy()
    h, w = img.shape[:2]
    scale = h / float(H)

    # Thin curves
    for _ in range(rng.randint(1, 3)):
        col = dark_color(rng) if rng.random() < 0.6 else pale_color(rng)
        thick = max(1, int(round(rng.choice([1, 2]) * scale)))
        draw_curve(img, rng, col, thick)

    # Noise dots
    for _ in range(int(rng.randint(30, 120) * scale)):
        x, y = rng.randint(0, max(1, w - 2)), rng.randint(0, max(1, h - 2))
        a = rng.uniform(0.4, 1.0)
        col = np.array(dark_color(rng) if rng.random() < 0.5 else pale_color(rng), np.float32)
        img[y:y + 1, x:x + 1] = img[y:y + 1, x:x + 1] * (1.0 - a) + col * a

    # Pale decoy letters
    for _ in range(rng.randint(0, 2)):
        decoy_sz = max(12, int(round(rng.randint(34, 70) * scale)))
        blend_glyph(img, rng.choice(DECOY_SET), rng, decoy_sz, rng.uniform(0.2, 0.4), pale_color(rng))

    return np.clip(img, 0, 255).astype(np.uint8)


if __name__ == '__main__':
    print("Testing gen_full.py rendering and clutter augmentation...")
    rng = random.Random(42)
    for length in (4, 6, 8):
        txt = rand_text(length, rng)
        full_img = render(txt, rng, half_res=False)
        half_img = render(txt, rng, half_res=True)
        cluttered = clutter(full_img, rng)
        cluttered_half = clutter(half_img, rng)
        print(f"  Length {length} ('{txt}'): Full {full_img.shape}, Half {half_img.shape}, Cluttered {cluttered.shape}")
    print("All gen_full.py generation tests succeeded!")
