#!/usr/bin/env python3
"""Draws the site's material textures into texture/ (all procedural, nothing downloaded).

  grain.webp       paper fibre, tooth and recycled-paper flecks: a transparent overlay for any paper colour
  marble.webp      verde antico (green serpentine breccia with white calcite veins): the stone the brochure lies on
  medallion.webp   a mosaic roundel, lapis field and gold rim laid in rings, set behind the ombrellino emblem
  speckle.png      worn-ink mask for rubber stamps

Every tile is periodic, so it repeats without seams.   usage: build_textures.py OUTDIR
"""
import sys, math, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = sys.argv[1] if len(sys.argv) > 1 else "texture"
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(1926)          # the year the first two U.S. basilicas were named


def periodic_noise(h, w, lo, hi, beta=1.0, seed=None):
    """Band-limited, seamlessly tiling noise: wavelengths between lo and hi pixels, 1/f^beta falloff."""
    r = np.random.default_rng(seed)
    f = np.fft.fft2(r.standard_normal((h, w)))
    fy = np.fft.fftfreq(h)[:, None]; fx = np.fft.fftfreq(w)[None, :]
    k = np.sqrt(fx * fx + fy * fy) + 1e-9
    band = (k >= 1.0 / hi) & (k <= 1.0 / lo)
    n = np.real(np.fft.ifft2(f * band / k ** (beta / 2)))
    return (n - n.mean()) / (n.std() + 1e-9)


def save_webp(arr, path, q=82):
    Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).save(path, "WEBP", quality=q, method=6)


# ------------------------------------------------------------------ paper grain (overlay)
def grain(size=256):
    tooth = periodic_noise(size, size, 1.2, 4, beta=0.0, seed=11)
    mottle = periodic_noise(size, size, 10, 90, beta=1.6, seed=12)
    F = 0.55 * tooth + 0.18 * mottle
    # fibres: short curved strokes, drawn three times over so they wrap at the tile edge
    big = Image.new("L", (size * 3, size * 3), 128); d = ImageDraw.Draw(big)
    for _ in range(70):
        x0, y0 = rng.uniform(0, size, 2); L = rng.uniform(8, 42); a = rng.uniform(0, math.pi)
        bend = rng.uniform(-0.6, 0.6); tone = 128 + (rng.choice([-1, -1, 1]) * rng.uniform(18, 46))
        pts = []
        for t in np.linspace(0, 1, 9):
            ang = a + bend * (t - 0.5)
            pts.append((x0 + math.cos(ang) * L * t, y0 + math.sin(ang) * L * t))
        for ox in (0, size, 2 * size):
            for oy in (0, size, 2 * size):
                d.line([(px + ox, py + oy) for px, py in pts], fill=int(tone), width=1)
    fib = np.asarray(big.filter(ImageFilter.GaussianBlur(0.45)), dtype=np.float32)[size:2 * size, size:2 * size]
    F += (fib - 128) / 40.0
    # recycled-paper flecks
    for _ in range(7):
        y, x = rng.integers(0, size, 2); r = rng.uniform(0.6, 1.4)
        yy, xx = np.ogrid[:size, :size]
        dy = np.minimum(abs(yy - y), size - abs(yy - y)); dx = np.minimum(abs(xx - x), size - abs(xx - x))
        F -= 2.6 * np.exp(-(dx * dx + dy * dy) / (2 * r * r))
    F = np.clip(F, -3.5, 3.5)
    dark = np.clip(-F, 0, None) / 3.5; light = np.clip(F, 0, None) / 3.5
    rgba = np.zeros((size, size, 4), np.float32)
    rgba[..., :3] = np.where((dark > 0)[..., None], [70, 52, 26], [255, 253, 246])
    rgba[..., 3] = np.where(dark > 0, dark * 255 * 0.20, light * 255 * 0.30)
    Image.fromarray(np.clip(rgba, 0, 255).astype(np.uint8), "RGBA").save(f"{OUT}/grain.webp", "WEBP", quality=70, alpha_quality=60, method=6)


# ------------------------------------------------------------------ verde antico marble
def marble(size=768):
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    def warp(seed, amp, lo=60, hi=500):
        return periodic_noise(size, size, lo, hi, beta=2.2, seed=seed) * amp
    def sample(field, dx, dy):                      # periodic bilinear lookup of field at warped coordinates
        X = (xx + dx) % size; Y = (yy + dy) % size
        x0 = np.floor(X).astype(int); y0 = np.floor(Y).astype(int); fx = X - x0; fy = Y - y0
        x1 = (x0 + 1) % size; y1 = (y0 + 1) % size
        return (field[y0, x0] * (1 - fx) * (1 - fy) + field[y0, x1] * fx * (1 - fy) +
                field[y1, x0] * (1 - fx) * fy + field[y1, x1] * fx * fy)
    # cloudy serpentine ground: deep green with smoky lighter drifts and near-black pockets
    cloud = sample(periodic_noise(size, size, 50, 700, beta=2.2, seed=31), warp(32, 14), warp(33, 14))
    fine = periodic_noise(size, size, 2, 14, beta=0.8, seed=34)
    t = np.clip(0.5 + 0.22 * cloud + 0.05 * fine, 0, 1)[..., None]
    dark = np.array([12, 31, 23], np.float32); mid = np.array([30, 66, 50], np.float32); light = np.array([62, 104, 84], np.float32)
    base = np.where(t < 0.5, dark + (mid - dark) * (t / 0.5), mid + (light - mid) * ((t - 0.5) / 0.5))
    # calcite veins: long fractures that sweep diagonally and wander (level lines of a turbulent ramp),
    # with a fainter crossing set; whole-number cycles across the tile keep it seamless
    turb1 = periodic_noise(size, size, 110, 900, beta=2.4, seed=41) + 0.045 * periodic_noise(size, size, 6, 40, beta=1.0, seed=141)
    turb2 = periodic_noise(size, size, 90, 700, beta=2.4, seed=42) + 0.045 * periodic_noise(size, size, 6, 40, beta=1.0, seed=142)
    def vein_set(kx, ky, turb, amp, width, seed):
        f = kx * xx / size + ky * yy / size + amp * turb
        w = width * (0.55 + 0.9 * np.clip(0.5 + 0.35 * periodic_noise(size, size, 40, 400, beta=2.0, seed=seed), 0, 1))
        return np.exp(-(np.abs(np.sin(np.pi * f)) / w) ** 2)
    v_main = vein_set(2, 3, turb1, 0.42, 0.05, 43)
    v_cross = vein_set(-4, 3, turb2, 0.38, 0.03, 44) * 0.5
    v_hair = vein_set(7, 6, turb1 * 0.7 + turb2 * 0.5, 0.45, 0.016, 45) * 0.3
    strength = np.clip(0.6 + 0.5 * periodic_noise(size, size, 60, 500, beta=2.0, seed=50), 0.08, 1.15)
    v = np.clip((v_main + v_cross + v_hair) * strength, 0, 1)[..., None]
    veincol = np.array([178, 202, 186], np.float32)
    img = base * (1 - 0.62 * v) + veincol * 0.62 * v
    # serpentine crystals: faint pale flecks
    fleck = periodic_noise(size, size, 1.5, 5, beta=0.2, seed=52)
    img = np.where((fleck > 2.6)[..., None], img * 0.55 + np.array([150, 185, 162]) * 0.45, img)
    img = np.asarray(Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7)), np.float32)
    save_webp(img, f"{OUT}/marble.webp", q=80)


# ------------------------------------------------------------------ mosaic medallion
def medallion(px=312, ss=3):
    S = px * ss; c = S / 2
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    R = S / 2 - 2 * ss
    d.ellipse([c - R, c - R, c + R, c + R], fill=(40, 33, 24, 255))          # grout
    golds = [(240, 205, 112), (217, 165, 33), (196, 143, 26), (233, 196, 90), (250, 228, 150), (178, 128, 22)]
    lapis = [(29, 58, 122), (35, 71, 143), (44, 86, 163), (24, 50, 102), (31, 64, 128), (20, 42, 88)]
    reds = [(143, 29, 29), (122, 24, 24), (160, 40, 34)]
    t = 9.4 * ss                                                              # tessera size
    rings = [("gold", t * 1.0), ("gold", t * 0.95), ("red", t * 0.8), ("gold", t * 0.8)]
    r = R
    def ring(r_out, w, palette, star=0.0, starpal=None):
        r_in = r_out - w; rm = (r_out + r_in) / 2
        n = max(6, int(round(2 * math.pi * rm / (w * 1.02))))
        g = 0.9 * ss
        a0 = rng.uniform(0, 2 * math.pi)
        for i in range(n):
            a = a0 + 2 * math.pi * i / n; b = a0 + 2 * math.pi * (i + 1) / n
            ja, jb = rng.normal(0, 0.06, 2) * (b - a)
            ri, ro = r_in + g + rng.normal(0, 0.12) * ss, r_out - g + rng.normal(0, 0.12) * ss
            pa = a + ja + g / rm; pb = b + jb - g / rm
            pts = [(c + math.cos(pa) * ro, c + math.sin(pa) * ro), (c + math.cos(pb) * ro, c + math.sin(pb) * ro),
                   (c + math.cos(pb) * ri, c + math.sin(pb) * ri), (c + math.cos(pa) * ri, c + math.sin(pa) * ri)]
            col = np.array(palette[rng.integers(len(palette))], np.float32)
            if star and rng.random() < star: col = np.array(starpal[rng.integers(len(starpal))], np.float32)
            col *= rng.uniform(0.86, 1.14)
            # gold smalti catch the light unevenly: the occasional bright tessera
            if palette is golds and rng.random() < 0.12: col = col * 0.5 + 255 * 0.5
            d.polygon(pts, fill=tuple(int(v) for v in np.clip(col, 0, 255)) + (255,))
    for kind, w in rings:
        ring(r, w, golds if kind == "gold" else reds); r -= w
    # lapis field in rings down to the centre (the andamento of a real mosaic roundel)
    while r > t * 1.2:
        ring(r, t * 0.92, lapis, star=0.035, starpal=golds); r -= t * 0.92
    d.ellipse([c - r + ss, c - r + ss, c + r - ss, c + r - ss], fill=lapis[1] + (255,))
    im = im.resize((px, px), Image.LANCZOS)
    a = np.asarray(im, np.float32)
    # light from the top left: a gentle dome
    yy, xx = np.mgrid[0:px, 0:px].astype(np.float32); u = (xx - px / 2) / (px / 2); v = (yy - px / 2) / (px / 2)
    shade = 1.0 + 0.16 * (-(u + v) / 1.4) - 0.12 * np.clip(u * u + v * v - 0.55, 0, None)
    a[..., :3] *= shade[..., None]
    Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA").save(f"{OUT}/medallion.webp", "WEBP", quality=86, method=6)


# ------------------------------------------------------------------ worn-ink mask for rubber stamps
def speckle(size=256):
    n = periodic_noise(size, size, 1.5, 6, beta=0.3, seed=41) + 0.5 * periodic_noise(size, size, 8, 60, beta=1.5, seed=42)
    alpha = np.clip(1.0 - np.clip(n - 1.15, 0, None) * 1.6, 0.15, 1.0)
    alpha = np.where(n > 2.4, 0.0, alpha)
    rgba = np.zeros((size, size, 4), np.uint8); rgba[..., 3] = (alpha * 255).astype(np.uint8)
    Image.fromarray(rgba, "RGBA").save(f"{OUT}/speckle.png", optimize=True)


grain(); marble(); medallion(); speckle()
for f in sorted(os.listdir(OUT)):
    print(f, os.path.getsize(os.path.join(OUT, f)))
