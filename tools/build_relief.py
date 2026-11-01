#!/usr/bin/env python3
"""Step 2 of building texture/relief.webp, the shaded relief printed over the map's state tints.

Source: Tom Patterson's Natural Earth shaded relief (public domain, shadedrelief.com / naturalearthdata.com),
the 10800 x 5400 copy bundled in the `basemap-data` Python package (mpl_toolkits/basemap_data/shadedrelief.jpg):
    pip download --no-deps basemap-data   # then unzip shadedrelief.jpg out of the wheel

That image also carries hypsometric colour (green lowlands, tan uplands). Only the hill shading is wanted, so the
broad colour is removed with a high-pass filter: what's left is the light and shadow of the terrain. The result is
resampled into the map's projection (grid from tools/build_relief_grid.mjs), masked to U.S. land and stored as a
grey image centred on mid-grey, which the page blends with `soft-light` (mid-grey changes nothing).

usage: build_relief.py SHADEDRELIEF.JPG WORKDIR OUT.webp
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

src, work, out = sys.argv[1], sys.argv[2], sys.argv[3]
Image.MAX_IMAGE_PIXELS = None
GW, GH = 3840, 2400            # supersampled grid (4x the 960x600 map)
OW, OH = 1920, 1200            # stored image (2x the map)

rgb = np.asarray(Image.open(src).convert("RGB"), dtype=np.float32) / 255.0
L = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
H, W = L.shape
# water in the source is blue; leave it out so coastlines and lakes don't print as ridges
r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
water = (b - r > 0.10) & (b > g - 0.01)
water = ndimage.binary_opening(water, iterations=1)
landsrc = (~ndimage.binary_dilation(water, iterations=2)).astype(np.float32)
# hill shading = luminance minus its local average over land only (normalised convolution),
# which removes the hypsometric tints without inventing an edge at the shore
blur = lambda a: ndimage.gaussian_filter(a, 9.0, mode=("nearest", "wrap"))
avg = blur(L * landsrc) / np.maximum(blur(landsrc), 1e-3)
hp = (L - avg) * landsrc

ll = np.fromfile(f"{work}/lonlat_{GW}x{GH}.f32", dtype=np.float32).reshape(GH, GW, 2)
lon, lat = ll[..., 0], ll[..., 1]
ok = np.isfinite(lon)
x = np.where(ok, (lon + 180.0) / 360.0 * W - 0.5, 0)
y = np.where(ok, (90.0 - lat) / 180.0 * H - 0.5, 0)
# Alaska is drawn at about a third of the scale of the lower 48, so it samples a softened copy (no moire)
v = ndimage.map_coordinates(hp, [y, x], order=1, mode="grid-wrap")
v_soft = 0.75 * ndimage.map_coordinates(ndimage.gaussian_filter(hp, 2.4), [y, x], order=1, mode="grid-wrap")
v = np.where(ok & (lat > 51), v_soft, v)
# fade the shading out close to the shore, where the source mixes land and water
cover = ndimage.map_coordinates(ndimage.gaussian_filter(landsrc, 2.5), [y, x], order=1, mode="grid-wrap")
v = v * np.clip((cover - 0.55) / 0.4, 0, 1)
v = np.where(ok, v, 0).astype(np.float32)

land = np.asarray(Image.open(f"{work}/landmask.png").convert("L"), dtype=np.float32) / 255.0
assert land.shape == (GH, GW), land.shape

def down(a):                                   # 2x2 area average: 3840x2400 -> 1920x1200
    return a.reshape(OH, 2, OW, 2).mean(axis=(1, 3))

v, land = down(v), down(land)
# soften the very edge of the land so the shading fades out at the coast instead of stopping hard
land = np.clip(ndimage.gaussian_filter(land, 0.8), 0, 1) * land

s = np.percentile(np.abs(v[land > 0.5]), 99.0)
shade = np.tanh(v / s * 1.15)                  # -1 .. 1, gently compressed
grey = 128 + 92 * shade * land
img = Image.fromarray(np.clip(grey, 0, 255).astype(np.uint8), "L")
img.save(out, "WEBP", quality=72, method=6)
img.save(f"{work}/relief-preview.png")
print("saved", out, "scale", float(s))
