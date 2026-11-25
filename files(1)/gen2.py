import numpy as np, cv2, random, colorsys
from PIL import Image, ImageDraw, ImageFont
from gen import CHARSET, DECOY_SET, FONT_PATHS, dark_color, pale_color, bg_color, bezier
H = 105
SIZES = {4: (180, 29), 6: (217, 28), 8: (271, 27)}   # half-res width, slot width
_fc = {}
def font(path, size):
    k = (path, size)
    if k not in _fc:
        try:
            _fc[k] = ImageFont.truetype(path, size)
        except Exception:
            _fc[k] = ImageFont.load_default()
    return _fc[k]
def glyph_mask(ch, size, path):
    f = font(path, size)
    im = Image.new("L", (size * 2, size * 2), 0)
    d = ImageDraw.Draw(im)
    bb = d.textbbox((0, 0), ch, font=f)
    w, h = bb[2] - bb[0], bb[3] - bb[1]
    d.text(((size * 2 - w) // 2 - bb[0], (size * 2 - h) // 2 - bb[1]), ch, fill=255, font=f)
    return np.array(im)

def render(text, rng, level=1.0):
    N = len(text); W, sw = SIZES[N]
    c1 = np.array(bg_color(rng)); c2 = np.array(bg_color(rng))
    ang = rng.uniform(0, np.pi)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    t = ((xx - W / 2) * np.cos(ang) + (yy - H / 2) * np.sin(ang))
    t = (t - t.min()) / (t.max() - t.min() + 1e-6)
    img = (c1[None, None] * (1 - t[..., None]) + c2[None, None] * t[..., None]).astype(np.float32)
    # decoys
    for _ in range(int(rng.randint(9, 16) * level)):
        ch = rng.choice(DECOY_SET); size = rng.randint(17, 40)
        m = glyph_mask(ch, size, rng.choice(FONT_PATHS))
        M = cv2.getRotationMatrix2D((size, size), rng.uniform(-60, 60), 1.0)
        m = cv2.warpAffine(m, M, (size * 2, size * 2))
        x0 = rng.randint(-size, W - size); y0 = rng.randint(-size, H - size)
        xs, ys = max(0, x0), max(0, y0); xe, ye = min(W, x0 + 2 * size), min(H, y0 + 2 * size)
        if xe > xs and ye > ys:
            sub = (m[ys - y0:ye - y0, xs - x0:xe - x0].astype(np.float32) / 255.0 * rng.uniform(0.3, 0.6))[..., None]
            img[ys:ye, xs:xe] = img[ys:ye, xs:xe] * (1 - sub) + np.array(pale_color(rng), np.float32) * sub
    layer = np.zeros((H, W, 3), np.float32); alpha = np.zeros((H, W), np.float32)
    x0c = (W - N * sw) / 2.0
    A = rng.uniform(2, 17) * (0.4 + 0.6 * level); lam = rng.uniform(130, 400); ph = rng.uniform(0, 6.28)
    tilt = rng.uniform(-0.12, 0.12) * level
    hollow_p = rng.choice([0.15, 0.3, 0.4]) * (0.3 + 0.7 * level)
    palette = [dark_color(rng) for _ in range(rng.randint(3, 6))]
    for i, ch in enumerate(text):
        size = rng.randint(31, 41); path = rng.choice(FONT_PATHS)
        m = glyph_mask(ch, size, path)
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
        a1, a2 = rng.uniform(0.3, 1.5) * level, rng.uniform(0.3, 1.5) * level
        l1, l2 = rng.uniform(13, 30), rng.uniform(13, 30)
        mx = gx + a1 * np.sin(gy / l1 * 6.28 + rng.uniform(0, 6.28)); my = gy + a2 * np.sin(gx / l2 * 6.28 + rng.uniform(0, 6.28))
        m = cv2.remap(m, mx, my, cv2.INTER_LINEAR)
        mb = (m > 127).astype(np.uint8)
        is_hollow = rng.random() < hollow_p
        if is_hollow:
            er = cv2.erode(mb, np.ones((3, 3), np.uint8), iterations=rng.choice([1, 1, 2]))
            mb = mb - er
        m = mb.astype(np.float32)
        if (not is_hollow) and rng.random() < 0.5 * level:
            edge = cv2.morphologyEx(mb, cv2.MORPH_GRADIENT, np.ones((3, 3), np.uint8)).astype(np.float32)
            keep = (np.random.RandomState(rng.randint(0, 10 ** 6)).rand(*m.shape) > 0.3).astype(np.float32)
            m = m * (1 - edge * (1 - keep))
        m = cv2.GaussianBlur(m, (3, 3), 0.5)
        cx = x0c + sw * (i + 0.5) + rng.uniform(-3, 3)
        cy = H / 2 + A * np.sin(2 * np.pi * cx / lam + ph) + tilt * (cx - W / 2) + rng.uniform(-5, 5) * level
        col = rng.choice(palette)
        px, py = int(round(cx - size)), int(round(cy - size))
        xs, ys = max(0, px), max(0, py); xe, ye = min(W, px + 2 * size), min(H, py + 2 * size)
        if xe <= xs or ye <= ys: continue
        sub = m[ys - py:ye - py, xs - px:xe - px]
        for c in range(3):
            layer[ys:ye, xs:xe, c] = layer[ys:ye, xs:xe, c] * (1 - sub) + col[c] * sub
        alpha[ys:ye, xs:xe] = np.maximum(alpha[ys:ye, xs:xe], sub)
    ax, ay = rng.uniform(0.3, 1.5) * level, rng.uniform(0.5, 2.5) * level
    lx, ly = rng.uniform(20, 60), rng.uniform(30, 80)
    gy, gx = np.mgrid[0:H, 0:W].astype(np.float32)
    mx = gx + ax * np.sin(gy / lx * 6.28 + rng.uniform(0, 6.28)); my = gy + ay * np.sin(gx / ly * 6.28 + rng.uniform(0, 6.28))
    layer = cv2.remap(layer, mx, my, cv2.INTER_LINEAR); alpha = cv2.remap(alpha, mx, my, cv2.INTER_LINEAR)
    def curve(col, thick):
        p0 = np.array([rng.uniform(-10, 20), rng.uniform(20, H - 20)]); p3 = np.array([rng.uniform(W - 20, W + 10), rng.uniform(20, H - 20)])
        p1 = np.array([rng.uniform(0.15 * W, 0.5 * W), rng.uniform(8, H - 8)]); p2 = np.array([rng.uniform(0.5 * W, 0.85 * W), rng.uniform(8, H - 8)])
        pts = (bezier(p0, p1, p2, p3) * 8).astype(np.int32).reshape(-1, 1, 2)
        cv2.polylines(img, [pts], False, tuple(float(c) for c in col), thick, cv2.LINE_AA, shift=3)
    for _ in range(int(rng.randint(4, 8) * level)):
        curve(pale_color(rng), 1)
    a3 = alpha[..., None]; img[:] = img * (1 - a3) + layer * a3
    for _ in range(int(rng.randint(3, 5) * level + (1 if level > 0.1 else 0))):
        curve(dark_color(rng) if rng.random() < 0.8 else pale_color(rng), rng.choice([1, 1, 1, 2]))
    for _ in range(int(rng.randint(200, 380) * 0.5 * level)):
        x, y = rng.randint(0, W - 1), rng.randint(0, H - 1)
        col = np.array(dark_color(rng) if rng.random() < 0.5 else pale_color(rng), np.float32)
        a = rng.uniform(0.35, 1.0)
        img[y, x] = img[y, x] * (1 - a) + col * a
    return np.clip(img, 0, 255).astype(np.uint8)
