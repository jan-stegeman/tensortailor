//! Native run of the live-model functions on a fixed set of real Hugging Face
//! entries (tools/hf-fixtures.json). The WebAssembly build must give exactly
//! the same models and fits (see tools/compare.mjs).
//!
//! Needs the patched llmfit-core (tools/patch-llmfit.sh) and the "live" feature:
//!   cargo run --release --features live --example mapcheck \
//!     --config 'patch."https://github.com/AlexsJones/llmfit".llmfit-core.path="<patched>/llmfit-core"' \
//!     -- tools/hf-fixtures.json mapcheck-native.json

use serde_json::{Value, json};
use std::{env, fs};
use tensortailor_engine::{HardwareInput, fit_all, fit_key, live};

fn main() {
    let args: Vec<String> = env::args().collect();
    let fixtures_path = args.get(1).map_or("tools/hf-fixtures.json", String::as_str);
    let out = args.get(2).map_or("mapcheck-native.json", String::as_str);

    let fixtures: Vec<Value> =
        serde_json::from_str(&fs::read_to_string(fixtures_path).expect("read fixtures"))
            .expect("parse fixtures");

    let mut mapped = Vec::new();
    let mut models = Vec::new();
    for f in &fixtures {
        let entry = f["entry"].to_string();
        let config = f["config"].as_str();
        let text = live::map_hf_json(&entry, config).expect("map entry");
        let model: Value = serde_json::from_str(&text).expect("model JSON");
        println!("{}: {}", f["entry"]["id"], if model.is_null() { "not listed by llmfit" } else { "mapped" });
        if !model.is_null() {
            models.push(model.clone());
        }
        mapped.push(json!({ "id": f["entry"]["id"], "model": model }));
    }

    let ids: Vec<Value> = fixtures.iter().map(|f| f["entry"]["id"].clone()).collect();
    let unknown: Value =
        serde_json::from_str(&live::unknown_ids_json(&Value::Array(ids).to_string()).expect("unknown ids"))
            .expect("unknown JSON");
    let size = live::set_extra_models_json(&Value::Array(models).to_string()).expect("extra models");

    let profiles: Vec<Value> =
        serde_json::from_str(&fs::read_to_string("tools/profiles.json").expect("read profiles"))
            .expect("parse profiles");
    let hw: HardwareInput =
        serde_json::from_value(profiles[0]["hardware"].clone()).expect("profile hardware");
    let fits: Vec<Value> = fit_all(&hw, None).iter().map(fit_key).collect();
    let urls: Value = serde_json::from_str(&live::update_urls_json()).expect("urls JSON");

    println!("unknown before adding: {unknown}");
    println!("list with extras: {size} models; fits for {}: {}", profiles[0]["id"], fits.len());
    let result = json!({ "mapped": mapped, "unknown": unknown, "size": size, "fits": fits, "urls": urls });
    fs::write(out, serde_json::to_string(&result).expect("serialize")).expect("write output");
    println!("wrote {out}");
}
