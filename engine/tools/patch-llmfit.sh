#!/usr/bin/env bash
# Makes a browser-ready copy of llmfit-core for the WebAssembly build.
#
# 1. Clock: llmfit-core reads the clock in exactly one place on the fit path:
#    fit.rs current_year_month() (the "recent model" bonus). std::time::SystemTime
#    has no clock on wasm32-unknown-unknown and panics there. web_time is the same
#    std type on native and reads JavaScript's Date in the browser.
# 2. Live models ("Fetch new models" and pasted links in the page): the browser
#    fetches the Hugging Face data itself, so update.rs map_to_llm_model() is split
#    into the network part (unchanged wrapper) and the conversion part, and three
#    small public functions are added (marked "TensorTailor patch"):
#      update::tt_update_urls       llmfit's own Hub list URLs
#      update::tt_map_hf_json       llmfit's own conversion of one Hub entry
#      ModelDatabase::embedded_with_extra  embedded list + extra models, merged
#                                   the way ModelDatabase::new() merges the cache
#      ModelDatabase::tt_models_mut  the rows, so the engine can fill KV fields
#                                   a row lacks from a real GGUF header
#      models::tt_canonical_slug    llmfit's "same model" key
#    No llmfit logic is changed or copied.
#
# The native golden run uses the original, unpatched llmfit-core, so
# tools/compare.mjs proves this copy gives the same fit answers. llmfit's own
# unit tests run on this copy too (see the build action).
#
# Usage (from engine/): bash tools/patch-llmfit.sh <target-dir>
set -euo pipefail

DEST="${1:?target dir}"
TAG=$(grep -oP 'tag = "\K[^"]+' Cargo.toml)

rm -rf "$DEST"
git clone --quiet --depth 1 --branch "$TAG" https://github.com/AlexsJones/llmfit "$DEST"

FIT="$DEST/llmfit-core/src/fit.rs"
CARGO="$DEST/llmfit-core/Cargo.toml"

sed -i 's/std::time::SystemTime::now()/web_time::SystemTime::now()/g; s/std::time::UNIX_EPOCH/web_time::UNIX_EPOCH/g' "$FIT"
sed -i '0,/^\[dependencies\]$/s//[dependencies]\nweb-time = "1"/' "$CARGO"

# Stop if llmfit changed and the patch no longer applies the way we expect.
test "$(grep -c 'web_time::SystemTime::now()' "$FIT")" -eq 1
test "$(grep -c 'std::time::SystemTime' "$FIT")" -eq 0
grep -q '^web-time = "1"$' "$CARGO"

python3 - "$DEST/llmfit-core/src" <<'PY'
import pathlib
import sys

src = pathlib.Path(sys.argv[1])

# --- update.rs: split the network fetch out of map_to_llm_model ---------------
up = src / "update.rs"
text = up.read_text()
sig = "fn map_to_llm_model(hf: HfApiModel, token: Option<&str>) -> Option<LlmModel> {\n"
fetch = "    let cfg = fetch_hf_config(&hf.id, token);\n"
if text.count(sig) != 1 or text.count(fetch) != 1:
    sys.exit("llmfit changed: the map_to_llm_model patch no longer applies")
text = text.replace(fetch, "")
text = text.replace(sig, """fn map_to_llm_model(hf: HfApiModel, token: Option<&str>) -> Option<LlmModel> {
    if !is_accepted_pipeline(&hf) {
        return None;
    }
    let cfg = fetch_hf_config(&hf.id, token);
    map_to_llm_model_with_config(hf, cfg)
}

// TensorTailor patch: the old body of map_to_llm_model, with the config passed in.
fn map_to_llm_model_with_config(hf: HfApiModel, cfg: Option<HfConfig>) -> Option<LlmModel> {
""")
text += """
// ── TensorTailor patch (browser build) ──────────────────────────────────────
// The browser fetches the Hub list and config.json itself. These functions give
// it llmfit's own URLs and llmfit's own conversion, without network code.

/// llmfit's Hub list URLs for an update with these limits: the same pipelines,
/// sorts, per-pipeline limits and expand[] fields as `update_model_cache`.
pub fn tt_update_urls(trending_limit: usize, downloads_limit: usize) -> Vec<String> {
    let mut urls = Vec::new();
    for (sort, limit) in [("trendingScore", trending_limit), ("downloads", downloads_limit)] {
        if limit == 0 {
            continue;
        }
        for pipeline in ACCEPTED_PIPELINES {
            urls.push(hf_list_url(pipeline, sort, pipeline_query_limit(limit, pipeline)));
        }
    }
    urls
}

/// llmfit's conversion of one Hub model entry plus the text of its config.json.
/// A config that does not parse counts as missing, like a failed fetch.
pub fn tt_map_hf_json(entry_json: &str, config_json: Option<&str>) -> Result<Option<LlmModel>, String> {
    let hf: HfApiModel = serde_json::from_str(entry_json)
        .map_err(|e| format!("not a Hugging Face model entry: {e}"))?;
    let cfg = config_json.and_then(|c| serde_json::from_str::<HfConfig>(c).ok());
    Ok(map_to_llm_model_with_config(hf, cfg))
}
"""
up.write_text(text)

# --- models.rs: a database with extra models, merged like the update cache ----
mo = src / "models.rs"
text = mo.read_text()
for needle in ("fn load_embedded() -> Vec<LlmModel> {", "fn apply_published_moe_active(models: &mut [LlmModel]) {",
               "pub(crate) fn canonical_slug(name: &str) -> String {",
               "        for cached in crate::update::load_cache() {\n            if !existing_keys.contains(&canonical_slug(&cached.name)) {\n                models.push(cached);\n            }\n        }\n"):
    if text.count(needle) != 1:
        sys.exit("llmfit changed: the ModelDatabase patch no longer applies (" + needle.strip().splitlines()[0] + ")")
text += """
// ── TensorTailor patch (browser build) ──────────────────────────────────────
impl ModelDatabase {
    /// The embedded list plus extra models (fetched from Hugging Face by the
    /// page), merged exactly the way `new()` merges the `llmfit update` cache:
    /// an extra model is added only when its canonical slug is new.
    pub fn embedded_with_extra(extra: Vec<LlmModel>) -> Self {
        let mut models = load_embedded();
        let existing_keys: std::collections::HashSet<String> =
            models.iter().map(|m| canonical_slug(&m.name)).collect();
        for cached in extra {
            if !existing_keys.contains(&canonical_slug(&cached.name)) {
                models.push(cached);
            }
        }
        apply_published_moe_active(&mut models);
        ModelDatabase { models }
    }

    /// The rows themselves, so TensorTailor can fill KV cache fields that a row
    /// lacks from a real GGUF header (see the engine's set_extra_models_and_fills_json).
    pub fn tt_models_mut(&mut self) -> &mut Vec<LlmModel> {
        &mut self.models
    }
}

/// llmfit's "same model" key (lower case, no org, same separators).
pub fn tt_canonical_slug(name: &str) -> String {
    canonical_slug(name)
}
"""
mo.write_text(text)
print("TensorTailor live-model patch applied")
PY

# 3. Data: no localmaxxing.com benchmark cache (their terms give no data license).
bash "$(dirname "$0")/strip-benchmark-cache.sh" "$DEST"

echo "Patched llmfit-core $TAG in $DEST"
