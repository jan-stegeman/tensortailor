// Builds the single-file TensorTailor page: web/app.html with the engine inside.
//
// The engine (llmfit compiled to WebAssembly) is gzipped and stored as base64
// text in the page; the page unpacks it with the browser's DecompressionStream
// and runs it in a Web Worker. No server and no internet are needed.
//
// Usage (from the repo root):
//   node web/build.mjs [pkg-nomod dir] [output file] [llmfit hf_models.json]
//   defaults: engine/pkg-nomod  dist/tensortailor.html  vendor/llmfit/llmfit-core/data/hf_models.json
//
// llmfit's engine keeps no download counts or languages once its catalog is
// loaded, so this script copies them from llmfit's own hf_models.json (same
// tag as the engine) into a small table in the page.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { helpCheck } from "./help-check.mjs";

const [pkg = "engine/pkg-nomod", out = "dist/tensortailor.html", hfModels = "vendor/llmfit/llmfit-core/data/hf_models.json"] = process.argv.slice(2);

// name -> [downloads, likes, "en,nl,..."] for every model that has any of them.
let meta = [];
if (existsSync(hfModels)) {
  for (const e of JSON.parse(readFileSync(hfModels, "utf8"))) {
    const langs = Array.isArray(e.languages) ? e.languages.join(",") : "";
    if (e.hf_downloads || e.hf_likes || langs) meta.push([e.name, e.hf_downloads || 0, e.hf_likes || 0, langs]);
  }
} else {
  console.warn(`warning: ${hfModels} not found; the page will have no download counts or languages`);
}
const metaGz = gzipSync(Buffer.from(JSON.stringify(meta)), { level: 9 });

// The licenses of the Rust crates in the engine, made by cargo-about in the build action
// (TT_NOTICES, default dist/THIRD-PARTY-NOTICES.txt). A local build without it says so in About.
const noticesFile = process.env.TT_NOTICES || "dist/THIRD-PARTY-NOTICES.txt";
const notices = existsSync(noticesFile) ? readFileSync(noticesFile, "utf8") : "";
if (!notices) console.warn(`note: ${noticesFile} not found; About will point to the release's THIRD-PARTY-NOTICES.txt`);
const noticesGz = notices ? gzipSync(Buffer.from(notices), { level: 9 }).toString("base64") : "";

// Hugging Face's list of gated catalog models (tools/fetch-gated.mjs; TT_GATED, default dist/gated.json).
// Without it the page guesses from the license name, as before.
const gatedFile = process.env.TT_GATED || "dist/gated.json";
let gated = null;
if (existsSync(gatedFile)) {
  gated = JSON.parse(readFileSync(gatedFile, "utf8"));
  if (!gated || typeof gated.models !== "object" || !gated.built) throw new Error(`${gatedFile} is not a gated list`);
} else {
  console.warn(`note: ${gatedFile} not found; the page guesses "gated" from the license name`);
}
const gatedJson = JSON.stringify(gated).replace(/</g, "\\u003c");

const template = readFileSync(new URL("./app.html", import.meta.url), "utf8");
// The built-in Help must explain every filter, view, sort choice and label (web/help-check.mjs).
const helpProblems = helpCheck(template);
if (helpProblems.length) throw new Error("the Help is not up to date:\n  - " + helpProblems.join("\n  - ") + "\nAdd a row to the Help (dlgHelp in web/app.html).");
const glue = readFileSync(join(pkg, "tensortailor_engine.js"), "utf8");
const wasm = readFileSync(join(pkg, "tensortailor_engine_bg.wasm"));
const libRs = readFileSync(new URL("../engine/src/lib.rs", import.meta.url), "utf8");

const llmfitRef = (/LLMFIT_REF: &str = "([^"]+)"/.exec(libRs) || [])[1] || "unknown";
const gz = gzipSync(wasm, { level: 9 });
const b64 = gz.toString("base64");

for (const marker of ["/*__ENGINE_GLUE__*/", "__ENGINE_WASM_GZ_B64__", "__BUILD_INFO__", "__CATALOG_META_GZ_B64__", "__NOTICES_GZ_B64__", "__GATED_JSON__"]) {
  if (!template.includes(marker)) throw new Error(`web/app.html misses the marker ${marker}`);
}
if (/<\/script/i.test(glue)) throw new Error("engine glue contains </script>; cannot inline it safely");

const buildInfo = {
  built: new Date().toISOString().slice(0, 10),
  llmfit: llmfitRef,
  // TT_COMMIT: set by the build action (the weekly run may add a commit after GITHUB_SHA).
  commit: (process.env.TT_COMMIT || process.env.GITHUB_SHA || "local").slice(0, 7),
  wasm_sha256: createHash("sha256").update(wasm).digest("hex"),
  wasm_mb: +(wasm.length / 1e6).toFixed(1),
  wasm_gz_mb: +(gz.length / 1e6).toFixed(2),
  meta_models: meta.length,
  notices: notices.length > 0,
  gated: gated ? { built: gated.built, models: Object.keys(gated.models).length } : null
};

const html = template
  .replace("/*__ENGINE_GLUE__*/", () => glue)
  .replace("__ENGINE_WASM_GZ_B64__", () => b64)
  .replace("__BUILD_INFO__", () => JSON.stringify(buildInfo))
  .replace("__CATALOG_META_GZ_B64__", () => metaGz.toString("base64"))
  .replace("__NOTICES_GZ_B64__", () => noticesGz)
  .replace("__GATED_JSON__", () => gatedJson);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`wrote ${out}: ${(html.length / 1e6).toFixed(2)} MB`, buildInfo);
