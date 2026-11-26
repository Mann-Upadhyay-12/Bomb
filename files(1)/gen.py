import os, numpy as np, cv2, random, colorsys
from PIL import Image, ImageDraw, ImageFont

# the only characters that can be a captcha ANSWER (decoy letters in the background use the wider DECOY_SET below)
CHARSET = "234579ADEGHMNQRTabdefhimnrt"
DECOY_SET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz"
POSSIBLE_FONTS = [
    ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 5),
    ("/usr/share/fonts/TTF/DejaVuSans-Bold.ttf", 5),
    ("/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf", 5),
    ("/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf", 2),
    ("/usr/share/fonts/TTF/DejaVuSansCondensed-Bold.ttf", 2),
    ("/usr/share/fonts/truetype/freefont/FreeSansBold.ttf", 2),
    ("/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf", 2),
    ("/usr/share/fonts/liberation/LiberationSans-Bold.ttf", 2),
    ("/usr/share/fonts/truetype/crosextra/Carlito-Bold.ttf", 1),
]
FONTS = [(p, w) for p, w in POSSIBLE_FONTS if os.path.exists(p)]
if not FONTS:
    import glob
    found = glob.glob("/usr/share/fonts/**/*.ttf", recursive=True)
    sans_bold = [f for f in found if 'sans' in f.lower() and 'bold' in f.lower() and not ('italic' in f.lower() or 'oblique' in f.lower())]
    if sans_bold:
        FONTS = [(f, 2) for f in sans_bold[:5]]
    elif found:
        FONTS = [(found[0], 1)]
    else:
        FONTS = []

_fc = {}
def font(path, size):
    k = (path, size)
    if k not in _fc:
        try:
            _fc[k] = ImageFont.truetype(path, size)
        except Exception:
            _fc[k] = ImageFont.load_default()
    return _fc[k]
FONT_PATHS = [p for p, w in FONTS for _ in range(w)] if FONTS else ["default"]

SIZES = {4: (360, 58), 6: (434, 56), 8: (542, 54)}   # N -> (width, slot width)
H = 210

def dark_color(rng):
    h = rng.random(); s = rng.uniform(0.55, 1.0); v = rng.uniform(0.28, 0.62)
    r, g, b = colorsys.hsv_to_rgb(h, s, v)
    return (r * 255, g * 255, b * 255)

def pale_color(rng):
    h = rng.random(); s = rng.uniform(0.15, 0.45); v = rng.uniform(0.8, 0.95)
    r, g, b = colorsys.hsv_to_rgb(h, s, v)
    return (r * 255, g * 255, b * 255)

def bg_color(rng):
    h = rng.random(); sat = rng.uniform(0.04, 0.2); v = rng.uniform(0.9, 0.97)
    r, g, b = colorsys.hsv_to_rgb(h, sat, v)
    return (r * 255, g * 255, b * 255)

def bezier(p0, p1, p2, p3, n=120):
    t = np.linspace(0, 1, n)[:, None]
    pts = ((1 - t) ** 3) * p0 + 3 * ((1 - t) ** 2) * t * p1 + 3 * (1 - t) * (t ** 2) * p2 + (t ** 3) * p3
    return pts.astype(np.float32)

def glyph_mask(ch, rng, size, path):
    f = font(path, size)
    im = Image.new("L", (size * 2, size * 2), 0)
    d = ImageDraw.Draw(im)
    bb = d.textbbox((0, 0), ch, font=f)
    w, h = bb[2] - bb[0], bb[3] - bb[1]
    d.text(((size * 2 - w) // 2 - bb[0], (size * 2 - h) // 2 - bb[1]), ch, fill=255, font=f)
    return np.array(im)

def render(text, rng=None, seed=None):
    rng = rng or random.Random(seed)
    N = len(text)
    W, sw = SIZES[N]
    # background gradient
    c1 = np.array(bg_color(rng)); c2 = np.array(bg_color(rng))
    ang = rng.uniform(0, np.pi)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    t = ((xx - W / 2) * np.cos(ang) + (yy - H / 2) * np.sin(ang))
    t = (t - t.min()) / (t.max() - t.min() + 1e-6)
    img = (c1[None, None] * (1 - t[..., None]) + c2[None, None] * t[..., None]).astype(np.float32)

    def blend(mask, color, alpha=1.0):
        a = (mask.astype(np.float32) / 255.0 * alpha)[..., None]
        img[:] = img * (1 - a) + np.array(color, np.float32)[None, None] * a

    # decoy letters (pale, big)
    for _ in range(rng.randint(9, 16)):
        ch = rng.choice(DECOY_SET)
        size = rng.randint(34, 80)
        m = glyph_mask(ch, rng, size, rng.choice(FONT_PATHS))
        ang_d = rng.uniform(-60, 60)
        M = cv2.getRotationMatrix2D((size, size), ang_d, 1.0)
        m = cv2.warpAffine(m, M, (size * 2, size * 2))
        x0 = rng.randint(-size, W - size); y0 = rng.randint(-size, H - size)
        xs, ys = max(0, x0), max(0, y0)
        xe, ye = min(W, x0 + 2 * size), min(H, y0 + 2 * size)
        if xe > xs and ye > ys:
            sub = (m[ys - y0:ye - y0, xs - x0:xe - x0].astype(np.float32) / 255.0 * rng.uniform(0.3, 0.6))[..., None]
            img[ys:ye, xs:xe] = img[ys:ye, xs:xe] * (1 - sub) + np.array(pale_color(rng), np.float32) * sub

    # text layer
    layer = np.zeros((H, W, 3), np.float32)
    alpha = np.zeros((H, W), np.float32)
    x0c = (W - N * sw) / 2.0
    A = rng.uniform(4, 34); lam = rng.uniform(260, 800); ph = rng.uniform(0, 2 * np.pi)
    tilt = rng.uniform(-0.12, 0.12)
    hollow_p = rng.choice([0.15, 0.3, 0.4])
    palette = [dark_color(rng) for _ in range(rng.randint(3, 6))]
    for i, ch in enumerate(text):
        size = rng.randint(62, 82)
        path = rng.choice(FONT_PATHS)
        m = glyph_mask(ch, rng, size, path)
        sc = rng.uniform(0.85, 1.12)
        rot = rng.uniform(-32, 32)
        shear = rng.uniform(-0.25, 0.25)
        M = cv2.getRotationMatrix2D((size, size), rot, sc)
        M[0, 1] += shear
        m = cv2.warpAffine(m, M, (size * 2, size * 2), flags=cv2.INTER_LINEAR)
        # per-glyph elastic wobble
        gy, gx = np.mgrid[0:size * 2, 0:size * 2].astype(np.float32)
        a1, a2 = rng.uniform(0.5, 3.0), rng.uniform(0.5, 3.0)
        l1, l2 = rng.uniform(25, 60), rng.uniform(25, 60)
        p1, p2 = rng.uniform(0, 6.28), rng.uniform(0, 6.28)
        mx = gx + a1 * np.sin(gy / l1 * 6.28 + p1)
        my = gy + a2 * np.sin(gx / l2 * 6.28 + p2)
        m = cv2.remap(m, mx, my, cv2.INTER_LINEAR)
        hollow = rng.random() < hollow_p
        mb = (m > 127).astype(np.uint8)
        if hollow:
            th = rng.choice([2, 3, 3, 4])
            er = cv2.erode(mb, np.ones((3, 3), np.uint8), iterations=th)
            mb = mb - er
        m = mb.astype(np.float32)
        if rng.random() < 0.5:   # stipple edge
            edge = cv2.morphologyEx(mb, cv2.MORPH_GRADIENT, np.ones((3, 3), np.uint8)).astype(np.float32)
            keep = (np.random.RandomState(rng.randint(0, 10 ** 6)).rand(*m.shape) > 0.3).astype(np.float32)
            m = m * (1 - edge * (1 - keep))
        m = cv2.GaussianBlur(m, (3, 3), 0.6)
        cx = x0c + sw * (i + 0.5) + rng.uniform(-6, 6)
        cy = H / 2 + A * np.sin(2 * np.pi * cx / lam + ph) + tilt * (cx - W / 2) + rng.uniform(-10, 10)
        col = rng.choice(palette)
        px, py = int(round(cx - size)), int(round(cy - size))
        xs, ys = max(0, px), max(0, py)
        xe, ye = min(W, px + 2 * size), min(H, py + 2 * size)
        if xe <= xs or ye <= ys:
            continue
        sub = m[ys - py:ye - py, xs - px:xe - px]
        a_old = alpha[ys:ye, xs:xe]
        for c in range(3):
            layer[ys:ye, xs:xe, c] = layer[ys:ye, xs:xe, c] * (1 - sub) + col[c] * sub
        alpha[ys:ye, xs:xe] = np.maximum(a_old, sub)
    # global warp of text layer
    ax, ay = rng.uniform(0.5, 3), rng.uniform(1, 5)
    lx, ly = rng.uniform(40, 120), rng.uniform(60, 160)
    gy, gx = np.mgrid[0:H, 0:W].astype(np.float32)
    mx = gx + ax * np.sin(gy / lx * 6.28 + rng.uniform(0, 6.28))
    my = gy + ay * np.sin(gx / ly * 6.28 + rng.uniform(0, 6.28))
    layer = cv2.remap(layer, mx, my, cv2.INTER_LINEAR)
    alpha = cv2.remap(alpha, mx, my, cv2.INTER_LINEAR)

    def curve(col, thick):
        p0 = np.array([rng.uniform(-20, 40), rng.uniform(40, H - 40)])
        p3 = np.array([rng.uniform(W - 40, W + 20), rng.uniform(40, H - 40)])
        p1 = np.array([rng.uniform(0.15 * W, 0.5 * W), rng.uniform(15, H - 15)])
        p2 = np.array([rng.uniform(0.5 * W, 0.85 * W), rng.uniform(15, H - 15)])
        pts = bezier(p0, p1, p2, p3).astype(np.int32).reshape(-1, 1, 2)
        cv2.polylines(img, [pts], False, tuple(float(c) for c in col), thick, cv2.LINE_AA)

    for _ in range(rng.randint(4, 8)):   # pale curves under text
        curve(pale_color(rng), rng.randint(1, 2))
    a3 = alpha[..., None]
    img[:] = img * (1 - a3) + layer * a3
    for _ in range(rng.randint(3, 5)):   # dark / coloured curves over text
        col = dark_color(rng) if rng.random() < 0.8 else pale_color(rng)
        curve(col, rng.randint(2, 3))
    # dots
    for _ in range(rng.randint(200, 380)):
        x, y = rng.randint(0, W - 1), rng.randint(0, H - 1)
        col = dark_color(rng) if rng.random() < 0.5 else pale_color(rng)
        r = rng.choice([1, 1, 2])
        img[y:y + r, x:x + r] = col
    out = np.clip(img, 0, 255).astype(np.uint8)
    return out  # RGB

def rand_text(N, rng):
    return "".join(rng.choice(CHARSET) for _ in range(N))

if __name__ == "__main__":
    import sys
    rng = random.Random(1)
    rows = []
    for N in (4, 6, 8, 4, 6, 8):
        t = rand_text(N, rng)
        im = render(t, rng)
        pad = np.full((H, 542, 3), 255, np.uint8); pad[:, :im.shape[1]] = im
        rows.append(pad)
    sheet = np.vstack([np.hstack(rows[i:i + 2]) for i in (0, 2, 4)])
    Image.fromarray(sheet).save("synth_sheet.png")
