// Builds members/zip/<first 3 digits>.json — the centre of every U.S. ZIP code, so "Basilicas near you"
// on the account page can work from a ZIP code typed in, without asking for the device's location.
// Lookups happen in the browser from these files only; the ZIP is never sent anywhere or stored.
//
// Data: the npm package us-zips (MIT), generated from the U.S. Census Bureau's 2022 Gazetteer file of
// ZIP Code Tabulation Areas (public domain): https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html
// Run from the repo root:   npm i --no-save us-zips@2022.9.1 && node tools/build_zip.mjs
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(path.resolve("package.json"));
const zips = require("us-zips/object.js");
const out = "members/zip";
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const chunks = {};
for (const [zip, { latitude, longitude }] of Object.entries(zips)) {
  if (!/^\d{5}$/.test(zip)) continue;
  (chunks[zip.slice(0, 3)] ||= {})[zip.slice(3)] = [+latitude.toFixed(3), +longitude.toFixed(3)];
}
let bytes = 0;
for (const [p, m] of Object.entries(chunks)) {
  const s = JSON.stringify(m);
  fs.writeFileSync(path.join(out, p + ".json"), s);
  bytes += s.length;
}
console.log(`${out}: ${Object.keys(zips).length} ZIP codes in ${Object.keys(chunks).length} files, ${Math.round(bytes / 1024)} KB`);
