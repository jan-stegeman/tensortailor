//! Native run of the engine for every test profile. The WebAssembly build must
//! give exactly the same answers (see tools/compare.mjs).
//!
//! Usage: cargo run --release --example golden -- <output.json>

use std::{env, fs};
use tensortailor_engine::{HardwareInput, fit_all, fit_key};

fn main() {
    let out = env::args()
        .nth(1)
        .unwrap_or_else(|| "golden-native.json".to_string());
    let text = fs::read_to_string("tools/profiles.json").expect("read tools/profiles.json");
    let profiles: Vec<serde_json::Value> = serde_json::from_str(&text).expect("parse profiles");

    let mut result = serde_json::Map::new();
    for profile in &profiles {
        let id = profile["id"].as_str().expect("profile id");
        let hw: HardwareInput =
            serde_json::from_value(profile["hardware"].clone()).expect("profile hardware");
        for ctx in [None, Some(8192u32)] {
            let key = format!("{id}@{}", ctx.map_or("default".to_string(), |c| c.to_string()));
            let keys: Vec<serde_json::Value> = fit_all(&hw, ctx).iter().map(fit_key).collect();
            println!("{key}: {} models", keys.len());
            result.insert(key, serde_json::Value::Array(keys));
        }
    }
    fs::write(&out, serde_json::to_string(&result).expect("serialize")).expect("write output");
    println!("wrote {out}");
}
