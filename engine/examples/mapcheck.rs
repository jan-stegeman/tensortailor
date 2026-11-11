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
    let size = live::set_extra_models_json(&Value::Array(models.clone()).to_string()).expect("extra models");

    let profiles: Vec<Value> =
        serde_json::from_str(&fs::read_to_string("tools/profiles.json").expect("read profiles"))
            .expect("parse profiles");
    let hw: HardwareInput =
        serde_json::from_value(profiles[0]["hardware"].clone()).expect("profile hardware");
    let fits: Vec<Value> = fit_all(&hw, None).iter().map(fit_key).collect();
    let urls: Value = serde_json::from_str(&live::update_urls_json()).expect("urls JSON");

    println!("unknown before adding: {unknown}");
    println!("list with extras: {size} models; fits for {}: {}", profiles[0]["id"], fits.len());

    // KV fields from a GGUF header (set_extra_models_and_fills_json), three cases from llmfit's own list:
    // a row without any KV fields (must be filled), a row whose heads contradict the file (must be left
    // alone), and a row that already has llmfit's precise inputs (must be left alone).
    let base = llmfit_core::ModelDatabase::embedded();
    let rows = base.get_all_models();
    let empty = rows.iter().find(|m| {
        m.num_hidden_layers.is_none() && m.head_dim.is_none() && m.num_attention_heads.is_none()
            && m.num_key_value_heads.is_none() && m.hidden_size.is_none() && !m.is_moe
    }).expect("a row without KV fields");
    let precise = rows.iter().find(|m| m.num_hidden_layers.is_some() && m.head_dim.is_some()).expect("a precise row");
    let layout = json!({ "full": 6, "linear": 24 });
    let mut fills = vec![
        json!({ "name": empty.name, "num_hidden_layers": 30, "num_attention_heads": 8, "num_key_value_heads": 2,
          "head_dim": 256, "hidden_size": 2048, "attention_layout": layout }),
        json!({ "name": precise.name, "num_hidden_layers": 7, "head_dim": 64 }),
    ];
    if let Some(clash) = rows.iter().find(|m| {
        m.num_hidden_layers.is_none() && m.num_attention_heads.is_some() && m.name != empty.name
    }) {
        fills.push(json!({ "name": clash.name, "num_hidden_layers": 40,
            "num_attention_heads": clash.num_attention_heads.unwrap_or(0) + 1, "num_key_value_heads": 8, "head_dim": 128 }));
    }
    let fills = Value::Array(fills);
    let fill_result: Value = serde_json::from_str(
        &live::set_extra_models_and_fills_json(&Value::Array(models.clone()).to_string(), &fills.to_string())
            .expect("fills"),
    )
    .expect("fill JSON");
    let fill_fits: Vec<Value> = fit_all(&hw, None).iter().map(fit_key).collect();
    println!("KV fills: {fill_result}");
    assert_eq!(fill_result["filled"], json!([empty.name]), "only the row without KV fields is filled");

    let result = json!({ "mapped": mapped, "unknown": unknown, "size": size, "fits": fits, "urls": urls,
        "fill": { "fills": fills, "result": fill_result, "fits": fill_fits } });
    fs::write(out, serde_json::to_string(&result).expect("serialize")).expect("write output");
    println!("wrote {out}");
}
