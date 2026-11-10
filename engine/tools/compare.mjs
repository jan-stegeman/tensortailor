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

// The page's functions: they must run without errors, and the samples show
// the exact data shapes the page reads.
try {
  const hwText = JSON.stringify(p0.hardware);
  const counts = (arr) => arr.reduce((m, k) => ((m[String(k)] = (m[String(k)] || 0) + 1), m), {});
  t0 = performance.now();
  const liteText = engine.fitLite(hwText);
  const lite = JSON.parse(liteText);
  console.log(`\nfitLite: ${lite.rows.length} rows, ${(liteText.length / 1e6).toFixed(2)} MB, ${(performance.now() - t0).toFixed(0)} ms`);
  const sample = lite.rows.find((r) => /qwen3-14b$/i.test(r[0])) || lite.rows[0];
  console.log("lite sample:", JSON.stringify(Object.fromEntries(lite.fields.map((f, i) => [f, sample[i]]))));
  console.log("runtime:", JSON.stringify(counts(lite.rows.map((r) => r[11]))));
  console.log("use_case:", JSON.stringify(counts(lite.rows.map((r) => r[12]))));
  console.log("confidence:", JSON.stringify(counts(lite.rows.map((r) => r[10]))));
  console.log("run_mode:", JSON.stringify(counts(lite.rows.map((r) => r[2]))));
  console.log("catalog sample:", JSON.stringify(catalog.find((c) => c.name === sample[0])));
  console.log("catalog format:", JSON.stringify(counts(catalog.map((c) => c.format))),
    "| with gguf_sources:", catalog.filter((c) => c.gguf_sources && c.gguf_sources.length).length,
    "| catalog JSON MB:", (engine.catalog().length / 1e6).toFixed(2));
  t0 = performance.now();
  const detail = JSON.parse(engine.fitDetail(hwText, undefined, sample[0]));
  console.log(`fitDetail ${(performance.now() - t0).toFixed(0)} ms | fit keys: ${Object.keys(detail.fit).join(",")}`);
  console.log("model keys:", Object.keys(detail.model).join(","));
  console.log("notes:", JSON.stringify(detail.fit.notes).slice(0, 600));
  console.log("estimate_basis:", JSON.stringify(detail.fit.estimate_basis));
  t0 = performance.now();
  const lad = JSON.parse(engine.ladder(hwText, sample[0], 32768, "fp16"));
  console.log(`ladder ${(performance.now() - t0).toFixed(0)} ms`);
  for (const r of lad) {
    console.log("  ", r.quant, r.error ?? `${r.plan.disk_size_gb.toFixed(1)} GB file, ${r.plan.current.fit_level} ${r.plan.current.run_mode} ${r.plan.current.estimated_tps.toFixed(1)} tok/s`);
  }
  const plan = JSON.parse(engine.plan(hwText, sample[0], 32768, "Q4_K_M", "q8_0", 30));
  console.log("plan minimum:", JSON.stringify(plan.minimum), "recommended:", JSON.stringify(plan.recommended));
  console.log("plan run_paths:", JSON.stringify(plan.run_paths).slice(0, 500));
  console.log("plan upgrades:", JSON.stringify(plan.upgrade_deltas).slice(0, 400));
  console.log("plan kv_alternatives:", JSON.stringify(plan.kv_alternatives).slice(0, 500));
} catch (e) {
  console.log("FAIL page functions:", e && e.stack ? e.stack : e);
  problems++;
}

if (problems) { console.log(`\n${problems} problems.`); process.exit(1); }
console.log("\nWebAssembly matches native for every profile.");
