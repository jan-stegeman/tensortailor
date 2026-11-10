// Builds the single-file TensorTailor page: web/app.html with the engine inside.
//
// The engine (llmfit compiled to WebAssembly) is gzipped and stored as base64
// text in the page; the page unpacks it with the browser's DecompressionStream
// and runs it in a Web Worker. No server and no internet are needed.
//
// Usage (from the repo root):
//   node web/build.mjs [pkg-nomod dir] [output file]
//   defaults: engine/pkg-nomod  dist/tensortailor.html

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";

const [pkg = "engine/pkg-nomod", out = "dist/tensortailor.html"] = process.argv.slice(2);

const template = readFileSync(new URL("./app.html", import.meta.url), "utf8");
const glue = readFileSync(join(pkg, "tensortailor_engine.js"), "utf8");
const wasm = readFileSync(join(pkg, "tensortailor_engine_bg.wasm"));
const libRs = readFileSync(new URL("../engine/src/lib.rs", import.meta.url), "utf8");

const llmfitRef = (/LLMFIT_REF: &str = "([^"]+)"/.exec(libRs) || [])[1] || "unknown";
const gz = gzipSync(wasm, { level: 9 });
const b64 = gz.toString("base64");

for (const marker of ["/*__ENGINE_GLUE__*/", "__ENGINE_WASM_GZ_B64__", "__BUILD_INFO__"]) {
  if (!template.includes(marker)) throw new Error(`web/app.html misses the marker ${marker}`);
}
if (/<\/script/i.test(glue)) throw new Error("engine glue contains </script>; cannot inline it safely");

const buildInfo = {
  built: new Date().toISOString().slice(0, 10),
  llmfit: llmfitRef,
  commit: (process.env.GITHUB_SHA || "local").slice(0, 7),
  wasm_sha256: createHash("sha256").update(wasm).digest("hex"),
  wasm_mb: +(wasm.length / 1e6).toFixed(1),
  wasm_gz_mb: +(gz.length / 1e6).toFixed(2)
};

const html = template
  .replace("/*__ENGINE_GLUE__*/", () => glue)
  .replace("__ENGINE_WASM_GZ_B64__", () => b64)
  .replace("__BUILD_INFO__", () => JSON.stringify(buildInfo));

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`wrote ${out}: ${(html.length / 1e6).toFixed(2)} MB`, buildInfo);
