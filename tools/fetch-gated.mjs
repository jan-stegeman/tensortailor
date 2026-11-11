// Which models in the catalog are "gated" on Hugging Face (you accept the terms first, then a token is
// needed for the files). Hugging Face lists all gated models in pages of 1,000 (about 60 pages, under a
// minute); only the names that are in the catalog are kept. The page uses the list for its "gated" and
// "license" labels and the "No token needed" filter; a model you open is still checked live.
//
// Usage (from the repo root):
//   node tools/fetch-gated.mjs <hf_models.json> <out gated.json>
// HF_TOKEN (optional) raises Hugging Face's rate limits. Exit code 1 on failure: the build then goes on
// without the list (the page falls back to the guess from the license name).

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const [catalogFile, out] = process.argv.slice(2);
if (!catalogFile || !out) { console.error("usage: node tools/fetch-gated.mjs <hf_models.json> <out gated.json>"); process.exit(2); }

const names = new Map(JSON.parse(readFileSync(catalogFile, "utf8")).map((e) => [String(e.name).toLowerCase(), e.name]));
const headers = { "User-Agent": "tensortailor-build" };
if (process.env.HF_TOKEN) headers.Authorization = "Bearer " + process.env.HF_TOKEN;

const models = {};
let url = "https://huggingface.co/api/models?gated=true&limit=1000&expand[]=gated", pages = 0, total = 0;
while (url) {
  if (++pages > 200) throw new Error("more than 200 pages: stopped (Hugging Face's list looks different than expected)");
  let res;
  for (let attempt = 1; ; attempt++) {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(60000) });
    if (res.ok || attempt >= 3 || !(res.status === 429 || res.status >= 500)) break;
    await new Promise((r) => setTimeout(r, 5000 * attempt));
  }
  if (!res.ok) throw new Error(`Hugging Face answered ${res.status} on page ${pages}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error(`page ${pages} is not a list`);
  for (const m of rows) {
    total++;
    const name = names.get(String(m.id).toLowerCase());
    if (name && (m.gated === "auto" || m.gated === "manual")) models[name] = m.gated;
  }
  const next = /<([^>]+)>;\s*rel="next"/.exec(res.headers.get("link") || "");
  url = next ? next[1] : null;
}
if (total < 1000) throw new Error(`only ${total} gated models listed: looks wrong, not used`);

const result = { built: new Date().toISOString().slice(0, 10), gated_on_hf: total, catalog: names.size, models };
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(result));
console.log(`gated list: ${Object.keys(models).length} of ${names.size} catalog models are gated (${total} gated on Hugging Face, ${pages} pages)`);
