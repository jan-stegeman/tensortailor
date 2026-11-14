// Checks that the WebAssembly engine gives the same answers as the native
// build of the same code, for every test profile. Exit code 1 on any difference.
//
// Usage (run from engine/): node tools/compare.mjs golden-native.json [mapcheck-native.json]

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

// The detail of one model (fitDetail) must show the same speed as the list (fitAll): the same measured
// speed, calibration, basis and confidence (llmfit's annotate_measured runs on the whole list). The RTX 2080
// profile is the PC of llmfit's community results, so it must have rows with a measured speed.
for (const p of profiles) {
  for (const ctx of [undefined, 8192]) {
    const hwText = JSON.stringify(p.hardware);
    const all = JSON.parse(engine.fitAll(hwText, ctx));
    const measured = all.filter((f) => f.measured_tps);
    const step = Math.max(1, Math.floor(all.length / 40));
    const pick = measured.concat(all.filter((f, i) => i % step === 0 && !f.measured_tps));
    let diff = 0;
    for (const f of pick) {
      const d = JSON.parse(engine.fitDetail(hwText, ctx, f.name)).fit;
      const same = close(d.estimated_tps, f.estimated_tps) && d.estimate_confidence === f.estimate_confidence &&
        JSON.stringify(d.measured_tps ?? null) === JSON.stringify(f.measured_tps ?? null) &&
        JSON.stringify(d.estimate_basis) === JSON.stringify(f.estimate_basis);
      if (!same) {
        if (diff < 3) console.log(`  detail diff ${p.id} ${f.name}: list ${f.estimated_tps} ${f.estimate_confidence} ${JSON.stringify(f.measured_tps)} | detail ${d.estimated_tps} ${d.estimate_confidence} ${JSON.stringify(d.measured_tps)}`);
        diff++;
      }
    }
    const none = p.id === "rtx2080-community" && measured.length === 0;
    console.log(`${diff || none ? "FAIL" : "OK  "} detail = list ${p.id}@${ctx ?? "default"}: ${pick.length} models checked, ${measured.length} with a measured speed, ${diff} different`);
    problems += diff + (none ? 1 : 0);
  }
}

// The same, but the detail comes first (no list for this hardware and context remembered yet: the engine
// makes it itself). Context 4096 is not used above.
{
  const p = profiles.find((x) => x.id === "rtx2080-community") || profiles[0], hwText = JSON.stringify(p.hardware);
  // The list at 2048 only finds the measured models; the engine then remembers 2048, not 4096.
  const first = JSON.parse(engine.fitAll(hwText, 2048)).filter((f) => f.measured_tps).slice(0, 10).map((f) => f.name);
  const details = first.map((n) => JSON.parse(engine.fitDetail(hwText, 4096, n)).fit);
  const all = JSON.parse(engine.fitAll(hwText, 4096));
  let diff = 0;
  details.forEach((d, i) => {
    const f = all.find((x) => x.name === first[i]);
    const same = !!f && close(d.estimated_tps, f.estimated_tps) && d.estimate_confidence === f.estimate_confidence &&
      JSON.stringify(d.measured_tps ?? null) === JSON.stringify(f.measured_tps ?? null);
    if (!same) diff++;
  });
  const bad = diff || first.length === 0;
  console.log(`${bad ? "FAIL" : "OK  "} detail first (nothing remembered) ${p.id}@4096: ${first.length} measured models, ${diff} different`);
  problems += bad ? 1 : 0;
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
  // A target speed that no run path reaches is a normal llmfit answer (an error
  // text), so the page must show it instead of crashing.
  try { engine.plan(hwText, sample[0], 32768, "Q8_0", "fp16", 500); console.log("plan with target 500 tok/s: answered"); }
  catch (e) { console.log("plan with target 500 tok/s: error text as expected:", String(e.message || e)); }
  const plan = JSON.parse(engine.plan(hwText, sample[0], 32768, "Q4_K_M", "q8_0", undefined));
  console.log("plan minimum:", JSON.stringify(plan.minimum), "recommended:", JSON.stringify(plan.recommended));
  console.log("plan run_paths:", JSON.stringify(plan.run_paths).slice(0, 500));
  console.log("plan upgrades:", JSON.stringify(plan.upgrade_deltas).slice(0, 400));
  console.log("plan kv_alternatives:", JSON.stringify(plan.kv_alternatives).slice(0, 500));
} catch (e) {
  console.log("FAIL page functions:", e && e.stack ? e.stack : e);
  problems++;
}

// Live models (feature "live"): the same Hugging Face entries must give the
// same llmfit models, the same "unknown" ids, and the same fits as the native
// run (examples/mapcheck.rs). Last, because it adds models to the list.
if (process.argv[3]) {
  const want = JSON.parse(readFileSync(process.argv[3], "utf8"));
  const fixtures = JSON.parse(readFileSync(new URL("./hf-fixtures.json", import.meta.url), "utf8"));
  const same = (a, b) => {
    if (typeof a === "number" && typeof b === "number") return close(a, b);
    if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return a === b;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && same(a[k], b[k]));
  };
  const check = (label, ok, detail = "") => { console.log(`${ok ? "OK  " : "FAIL"} live: ${label}${detail}`); if (!ok) problems++; };
  try {
    check("engine built with the live feature", JSON.parse(engine.engineInfo()).live === true);
    const mapped = [], models = [];
    for (const f of fixtures) {
      const m = JSON.parse(engine.mapHf(JSON.stringify(f.entry), f.config ?? undefined));
      mapped.push({ id: f.entry.id, model: m });
      if (m !== null) models.push(m);
    }
    for (let i = 0; i < mapped.length; i++) {
      const w = want.mapped[i];
      check(`map ${mapped[i].id}`, !!w && w.id === mapped[i].id && same(mapped[i].model, w.model),
        mapped[i].model === null ? " (not listed by llmfit)" : ` -> ${mapped[i].model.parameter_count}, ${mapped[i].model.context_length} ctx, ${mapped[i].model.use_case}`);
    }
    check("same number of entries", mapped.length === want.mapped.length);
    const unknown = JSON.parse(engine.unknownIds(JSON.stringify(fixtures.map((f) => f.entry.id))));
    check("unknown ids", same(unknown, want.unknown), ` (${unknown.length} not in the list: ${unknown.join(", ")})`);
    const size = engine.setExtraModels(JSON.stringify(models));
    check("list size with extras", size === want.size, ` (${size})`);
    const fits = JSON.parse(engine.fitKeys(JSON.stringify(profiles[0].hardware)));
    let diff = 0;
    if (fits.length !== want.fits.length) diff = Math.abs(fits.length - want.fits.length) || 1;
    else for (let i = 0; i < fits.length; i++) if (!same(fits[i], want.fits[i])) { if (diff < 5) console.log(`  diff #${i}: wasm=${JSON.stringify(fits[i])} native=${JSON.stringify(want.fits[i])}`); diff++; }
    check("fits with extras", diff === 0, ` (${fits.length} models, ${diff} different)`);
    check("update URLs", same(JSON.parse(engine.updateUrls()), want.urls), ` (${want.urls.length} URLs)`);
    const again = JSON.parse(engine.unknownIds(JSON.stringify(fixtures.map((f) => f.entry.id))));
    check("added models are known afterwards", again.length === 0 || again.every((id) => !models.some((m) => m.name === id)), ` (${again.length} still unknown)`);
    // KV fields from a GGUF header for rows of llmfit's own list (the cases chosen by mapcheck.rs).
    if (want.fill) {
      const res = JSON.parse(engine.setExtraModelsAndFills(JSON.stringify(models), JSON.stringify(want.fill.fills)));
      check("KV fills: same rows filled", same(res, want.fill.result), ` (${JSON.stringify(res.filled)}, ${res.count} models)`);
      const ffits = JSON.parse(engine.fitKeys(JSON.stringify(profiles[0].hardware)));
      let fdiff = 0;
      if (ffits.length !== want.fill.fits.length) fdiff = Math.abs(ffits.length - want.fill.fits.length) || 1;
      else for (let i = 0; i < ffits.length; i++) if (!same(ffits[i], want.fill.fits[i])) { if (fdiff < 5) console.log(`  diff #${i}: wasm=${JSON.stringify(ffits[i])} native=${JSON.stringify(want.fill.fits[i])}`); fdiff++; }
      check("fits with KV fills", fdiff === 0, ` (${ffits.length} models, ${fdiff} different)`);
      const name = want.fill.result.filled[0], before = fits.find((f) => f[0] === name), after = ffits.find((f) => f[0] === name);
      check("the filled row changed", !!before && !!after && !same(before, after), ` (${name}: ${JSON.stringify(before)} -> ${JSON.stringify(after)})`);
    }
  } catch (e) {
    console.log("FAIL live functions:", e && e.stack ? e.stack : e);
    problems++;
  }
}

if (problems) { console.log(`\n${problems} problems.`); process.exit(1); }
console.log("\nWebAssembly matches native for every profile.");
