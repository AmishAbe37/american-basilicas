# texture/ — the site's material layer

Everything that gives the pages their physical character lives here. `texture.css` loads after each page's own
styles (map page, member pages, and the member features on the map), so removing its `<link>` returns the flat design.

| File | What it is | Made by |
|---|---|---|
| `texture.css` | The material layer: lacquered band, silk valance, paper, marble desk, gilt, enamel, stamps, prints | by hand |
| `relief.webp` | Shaded relief printed over the map's state tints (same projection as the map) | `tools/build_relief_grid.mjs` then `tools/build_relief.py`, from Tom Patterson's Natural Earth shaded relief (public domain) |
| `grain.webp` | Paper fibre and tooth, a transparent overlay | `tools/build_textures.py` |
| `marble.webp` | Verde antico marble, the desk on large screens (phones never load it) | `tools/build_textures.py` |
| `medallion.webp` | Mosaic roundel behind the ombrellino: lapis field, gold rim, laid in rings | `tools/build_textures.py` |
| `speckle.png` | Worn-ink mask for the rubber stamps | `tools/build_textures.py` |
| `seal.webp` | Red wax seal struck with the ombrellino | `tools/seal.svg`, rendered at 240 px |
| `valance.svg` | The ombrellino's red-and-gold scalloped valance | by hand |
| `cosmati.svg` | A strip of Cosmatesque pavement for footers | by hand |
| `check.svg` | A stamp-pad check mark for the checklist | by hand |

Rebuild the textures with `python3 tools/build_textures.py texture`. Rebuild the relief only if the map's projection
or outlines change (see the notes at the top of `tools/build_relief.py`).
