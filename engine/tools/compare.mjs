// Checks that the WebAssembly engine gives the same answers as the native
// build of the same code, for every test profile. Exit code 1 on any difference.
//
// Usage: node tools/compare.mjs golden-native.json   (run from engine/)

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const engine = require("../pkg-node/tensortailor_engine.js");
const golden = JSON.parse(readFileSync(process.argv[2], "utf8"));
const profiles = JSON.parse(readFileSync(new URL("./profiles.json", import.meta.url), "utf8"));

const close = (a, b) => a === b || Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

console.log("engine info:", engine.engineInfo());
let t0 = performance.now();
const catalog = JSON.parse(engine.catalog());
console.log(`catalog: ${catalog.length} models, read in ${(performance.now() - t0).toFixed(0)} ms`);

let problems = 0;
for (const p of profiles) {
  for (const ctx of [undefined, 8192]) {
    const key = `${p.id}@${ctx ?? "default"}`;
    t0 = performance.now();
    const got = JSON.parse(engine.fitKeys(JSON.stringify(p.hardware), ctx));
    const ms = performance.now() - t0;
    const want = golden[key];
    if (!want) { console.log(`FAIL ${key}: missing in golden file`); problems++; continue; }
    let diff = 0;
    if (got.length !== want.length) {
      console.log(`FAIL ${key}: ${got.length} results, native has ${want.length}`);
      problems++;
      continue;
    }
    for (let i = 0; i < got.length; i++) {
      const g = got[i], w = want[i];
      const same = g[0] === w[0] && g[1] === w[1] && g[2] === w[2] && g[3] === w[3] && g[7] === w[7] &&
        close(g[4], w[4]) && close(g[5], w[5]) && close(g[6], w[6]);
      if (!same) {
        if (diff < 5) console.log(`  diff ${key} #${i}: wasm=${JSON.stringify(g)} native=${JSON.stringify(w)}`);
        diff++;
      }
    }
    console.log(`${diff ? "FAIL" : "OK  "} ${key}: ${got.length} models, ${diff} different, ${ms.toFixed(0)} ms in WebAssembly`);
    problems += diff;
  }
}

// What the page will see: the best picks for the RTX 3090 profile.
const p0 = profiles[0];
t0 = performance.now();
const fits = JSON.parse(engine.fitAll(JSON.stringify(p0.hardware)));
console.log(`\nfitAll (full summaries) for ${p0.id}: ${fits.length} models in ${(performance.now() - t0).toFixed(0)} ms`);
const top = fits.filter((f) => f.fit_level !== "TooTight").sort((a, b) => b.score - a.score).slice(0, 12);
for (const f of top) {
  console.log(`  ${f.score.toFixed(1).padStart(5)}  ${f.fit_level.padEnd(8)} ${f.run_mode.padEnd(10)} ${String(f.best_quant).padEnd(8)} ` +
    `${f.memory_required_gb.toFixed(1).padStart(5)} GB  ${f.estimated_tps.toFixed(1).padStart(6)} tok/s  ${f.name}`);
}

if (problems) { console.log(`\n${problems} differences between WebAssembly and native.`); process.exit(1); }
console.log("\nWebAssembly matches native for every profile.");
