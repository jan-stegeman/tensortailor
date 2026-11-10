// Saves a fixed set of real Hugging Face model entries (plus config.json) to
// tools/hf-fixtures.json. The CI check maps them with llmfit's own conversion
// natively and in WebAssembly; both must give the same models and fits.
// Public data only, no token. Run again only to refresh the test set.
//
// Usage (from engine/): node tools/fetch-hf-fixtures.mjs

import { writeFileSync } from "node:fs";

// The same expand[] fields llmfit's updater asks for (update.rs HF_LIST_EXPAND).
const EXPAND = ["pipeline_tag", "tags", "author", "createdAt", "safetensors", "gguf"];
const q = EXPAND.map((f) => `expand[]=${f}`).join("&");

// One list call, to keep a list-shaped entry in the set.
const lists = [["text-generation", "downloads", 1]];
// Fixed cases: catalog models, MoE models, a vision model, an any-to-any and a
// text-to-speech model, a GGUF repo, a gated model (config.json needs a token),
// and an embedding model llmfit rejects.
const single = ["Qwen/Qwen3-14B", "Qwen/Qwen3-30B-A3B", "LiquidAI/LFM3-1.7B", "baidu/ERNIE-5.5-Flash-Base",
  "NousResearch/Arete-27B", "google/gemma-4-E4B-it", "moonshotai/Kimi-K3.1-Pro", "LiquidAI/LFM3-Omni-2B",
  "ConwayResearch/Underdog-Woof", "unsloth/Qwen3-14B-GGUF", "meta-llama/Llama-3.1-8B-Instruct", "BAAI/bge-m3"];

const getJson = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
};
const getConfig = async (id) => {
  const res = await fetch(`https://huggingface.co/${id}/resolve/main/config.json`);
  return res.ok ? res.text() : null;
};

const entries = [];
for (const [pipeline, sort, limit] of lists) {
  entries.push(...(await getJson(`https://huggingface.co/api/models?pipeline_tag=${pipeline}&sort=${sort}&limit=${limit}&${q}`)));
}
for (const id of single) entries.push(await getJson(`https://huggingface.co/api/models/${id}?${q}`));

const seen = new Set();
const out = [];
for (const e of entries) {
  if (seen.has(e.id)) continue;
  seen.add(e.id);
  const keep = { id: e.id };
  for (const f of ["author", "pipeline_tag", "tags", "createdAt", "safetensors", "gguf"]) if (e[f] !== undefined) keep[f] = e[f];
  const config = await getConfig(e.id);
  // config.json stays the exact text Hugging Face sent (what the page gets too).
  out.push({ entry: keep, config });
  console.log(`${e.id}: pipeline ${e.pipeline_tag ?? "-"}, config ${config === null ? "none" : "yes"}`);
}
writeFileSync(new URL("./hf-fixtures.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
console.log(`wrote tools/hf-fixtures.json: ${out.length} entries`);
