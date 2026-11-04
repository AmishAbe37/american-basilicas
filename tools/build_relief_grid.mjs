// Step 1 of building texture/relief.webp (see tools/build_relief.py).
// Uses the map's own projection from index.html (d3.geoAlbersUsa, scale 1180, 960×600) to work out the
// longitude/latitude under every pixel of a 4× render, and writes the state outlines as an SVG for the
// land mask. Run from the repo root:   node tools/build_relief_grid.mjs /path/to/workdir
import fs from "node:fs";
import vm from "node:vm";

const out = process.argv[2] || ".";
const lines = fs.readFileSync("index.html", "utf8").split("\n");
const find = (re) => { const i = lines.findIndex((l) => re.test(l)); if (i < 0) throw new Error("not found: " + re); return i; };
const ctx = vm.createContext({});
vm.runInContext(lines[find(/^!function\(t,n\)\{"object"==typeof exports/)], ctx);
vm.runInContext(lines.slice(find(/^const GEO_TOPO = /), find(/^\}\)\(GEO_TOPO\);/) + 1).join("\n"), ctx);
vm.runInContext(lines[find(/^const LAKES = /)], ctx);
const { d3, GEO, LAKES } = vm.runInContext("({ d3, GEO, LAKES })", ctx);

const W = 960, H = 600, S = 4;                       // 4× supersampled grid: 3840 × 2400
const projection = d3.geoAlbersUsa().scale(1180).translate([W / 2, H / 2]);
const buf = new Float32Array(W * S * H * S * 2);
let k = 0;
for (let y = 0; y < H * S; y++) for (let x = 0; x < W * S; x++) {
  const p = projection.invert([(x + 0.5) / S, (y + 0.5) / S]);
  buf[k++] = p ? p[0] : NaN; buf[k++] = p ? p[1] : NaN;
}
fs.writeFileSync(`${out}/lonlat_${W * S}x${H * S}.f32`, Buffer.from(buf.buffer));

// land mask: same clean-up as index.html (zero-area rings would fill the whole canvas)
const EPS = 1e-7;
const ringArea = (r) => { let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return Math.abs(a / 2); };
const clean = (g) => {
  if (g.type === "Polygon") { g.coordinates = g.coordinates.filter((r, i) => i === 0 || ringArea(r) > EPS); return ringArea(g.coordinates[0]) > EPS ? g : null; }
  g.coordinates = g.coordinates.map((p) => p.filter((r, i) => i === 0 || ringArea(r) > EPS)).filter((p) => p.length && ringArea(p[0]) > EPS);
  return g.coordinates.length ? g : null;
};
const states = GEO.features.map((f) => { const g = clean(f.geometry); return g ? { ...f, geometry: g } : null; })
  .filter((f) => f && f.properties.name !== "Puerto Rico");
const path = d3.geoPath(projection);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
  `<rect width="${W}" height="${H}" fill="#000"/>` +
  states.map((f) => `<path d="${path(f)}" fill="#fff"/>`).join("") +
  LAKES.features.map((f) => `<path d="${path(f)}" fill="#000"/>`).join("") + `</svg>`;
fs.writeFileSync(`${out}/landmask.svg`, svg);
console.log("grid", W * S, "x", H * S, "· states", states.length, "· lakes", LAKES.features.length);
