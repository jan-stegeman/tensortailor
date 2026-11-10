//! TensorTailor engine: llmfit's fit and speed math, callable from WebAssembly.
//!
//! The browser cannot detect RAM or VRAM, so the page passes the hardware in as
//! JSON. Everything else (the model catalog, the fit rules, the speed formula,
//! the community measurements) is llmfit-core itself, unchanged. The "live"
//! feature adds models from Hugging Face through llmfit's own conversion code,
//! made callable by tools/patch-llmfit.sh.

use llmfit_core::analysis::{analyze_with_optional_config, build_model_fits_with_config};
use llmfit_core::fit::CalcConfig;
use llmfit_core::hardware::GpuInfo;
use llmfit_core::models::{KvQuant, QUANT_HIERARCHY};
use llmfit_core::{
    GpuBackend, InstalledIndex, LlmModel, ModelDatabase, ModelFit, PlanRequest, SystemSpecs,
    estimate_model_plan_with_config,
};
use serde::Deserialize;
use serde_json::{Map, Value, json};
use std::sync::{Arc, RwLock};

/// The llmfit release this engine is built from. Must match the tag in Cargo.toml.
pub const LLMFIT_REF: &str = "v1.1.20";

/// Hardware as typed or imported on the page.
#[derive(Debug, Clone, Deserialize)]
pub struct HardwareInput {
    /// For example "NVIDIA GeForce RTX 3090". llmfit uses the name to look up
    /// the memory bandwidth.
    #[serde(default)]
    pub gpu_name: Option<String>,
    /// VRAM of one card in GB. 0 means no GPU.
    #[serde(default)]
    pub vram_gb: f64,
    /// Number of identical cards.
    #[serde(default = "default_gpu_count")]
    pub gpu_count: u32,
    /// Total system RAM in GB.
    pub ram_gb: f64,
    #[serde(default = "default_cpu_cores")]
    pub cpu_cores: usize,
    #[serde(default)]
    pub cpu_name: String,
    /// "cuda", "rocm", "vulkan", "metal", "sycl", "cpu_x86" or "cpu_arm".
    #[serde(default)]
    pub backend: Option<String>,
    /// System RAM speed in GB/s, used when part of a model runs from RAM.
    /// Native llmfit measures it with a threaded test; a browser cannot, so the
    /// page passes it in. None = llmfit's conservative fallback.
    #[serde(default)]
    pub ram_bandwidth_gbps: Option<f64>,
    /// GPU memory speed in GB/s for a card that llmfit's table does not know.
    /// None = llmfit's own lookup by GPU name.
    #[serde(default)]
    pub gpu_bandwidth_gbps: Option<f64>,
}

/// llmfit's own fallback when the RAM speed is unknown (DDR4-3200 dual channel).
pub const DEFAULT_RAM_BANDWIDTH_GBPS: f64 = 50.0;

/// llmfit's calculation settings for this hardware. Setting the RAM speed here
/// keeps llmfit from measuring the machine it runs on.
pub fn config_from(hw: &HardwareInput) -> CalcConfig {
    CalcConfig {
        ddr_bandwidth_gbps: Some(
            hw.ram_bandwidth_gbps
                .filter(|b| *b > 0.0)
                .unwrap_or(DEFAULT_RAM_BANDWIDTH_GBPS),
        ),
        gpu_bandwidth_gbps_override: hw.gpu_bandwidth_gbps.filter(|b| *b > 0.0),
        ..CalcConfig::default()
    }
}

fn default_gpu_count() -> u32 {
    1
}

fn default_cpu_cores() -> usize {
    8
}

fn parse_backend(name: Option<&str>, has_gpu: bool) -> GpuBackend {
    match name.map(|v| v.to_ascii_lowercase()).as_deref() {
        Some("cuda") => GpuBackend::Cuda,
        Some("rocm") => GpuBackend::Rocm,
        Some("vulkan") => GpuBackend::Vulkan,
        Some("metal") => GpuBackend::Metal,
        Some("sycl") => GpuBackend::Sycl,
        Some("cpu_arm") => GpuBackend::CpuArm,
        Some("cpu_x86") => GpuBackend::CpuX86,
        _ if has_gpu => GpuBackend::Cuda,
        _ => GpuBackend::CpuX86,
    }
}

/// Build llmfit's `SystemSpecs` from the page's hardware, the same way
/// llmfit's own `--memory` / `--ram` overrides describe simulated hardware.
pub fn specs_from(hw: &HardwareInput) -> SystemSpecs {
    let has_gpu = hw.vram_gb > 0.0 && hw.gpu_count > 0;
    let backend = parse_backend(hw.backend.as_deref(), has_gpu);
    let gpu_name = hw
        .gpu_name
        .clone()
        .unwrap_or_else(|| "User-specified GPU".to_string());
    let gpus = if has_gpu {
        vec![GpuInfo {
            name: gpu_name.clone(),
            vram_gb: Some(hw.vram_gb),
            backend,
            count: hw.gpu_count,
            unified_memory: false,
            free_vram_gb: None,
            free_vram_per_card_gb: Vec::new(),
            pcie_links: Vec::new(),
        }]
    } else {
        Vec::new()
    };
    SystemSpecs {
        total_ram_gb: hw.ram_gb,
        // llmfit's RAM override keeps 10% for the system.
        available_ram_gb: hw.ram_gb * 0.9,
        total_cpu_cores: hw.cpu_cores,
        cpu_name: hw.cpu_name.clone(),
        has_gpu,
        gpu_vram_gb: has_gpu.then_some(hw.vram_gb),
        total_gpu_vram_gb: has_gpu.then_some(hw.vram_gb * f64::from(hw.gpu_count)),
        gpu_available_gb: None,
        gpu_name: has_gpu.then_some(gpu_name),
        gpu_count: if has_gpu { hw.gpu_count } else { 0 },
        unified_memory: false,
        backend,
        gpus,
        cluster_mode: false,
        cluster_node_count: 0,
    }
}

/// The model list: llmfit's embedded catalog, plus the models the page fetched
/// live from Hugging Face (feature "live", see `live::set_extra_models_json`).
static DB: RwLock<Option<Arc<ModelDatabase>>> = RwLock::new(None);

fn database() -> Arc<ModelDatabase> {
    if let Some(db) = DB.read().unwrap_or_else(|e| e.into_inner()).as_ref() {
        return Arc::clone(db);
    }
    let db = Arc::new(ModelDatabase::embedded());
    *DB.write().unwrap_or_else(|e| e.into_inner()) = Some(Arc::clone(&db));
    db
}

/// Every catalog model analysed for this hardware, in catalog order (unsorted).
pub fn fit_all(hw: &HardwareInput, context_limit: Option<u32>) -> Vec<ModelFit> {
    let specs = specs_from(hw);
    build_model_fits_with_config(
        &database(),
        &specs,
        &InstalledIndex::empty(),
        context_limit,
        config_from(hw),
    )
}

/// One fit as JSON, without the full model record (the page has the catalog).
pub fn fit_summary(fit: &ModelFit) -> Value {
    let mut value = serde_json::to_value(fit).unwrap_or(Value::Null);
    if let Value::Object(map) = &mut value {
        map.remove("model");
        map.insert("name".to_string(), json!(fit.model.name));
    }
    value
}

/// The fields the WebAssembly-versus-native test compares, as a small array.
pub fn fit_key(fit: &ModelFit) -> Value {
    json!([
        fit.model.name,
        serde_json::to_value(fit.fit_level).unwrap_or(Value::Null),
        serde_json::to_value(fit.run_mode).unwrap_or(Value::Null),
        fit.best_quant,
        fit.memory_required_gb,
        fit.estimated_tps,
        fit.score,
        fit.usable_context
    ])
}

fn round(value: f64, digits: i32) -> f64 {
    let f = 10f64.powi(digits);
    (value * f).round() / f
}

fn enum_text<T: serde::Serialize>(value: &T) -> Value {
    serde_json::to_value(value).unwrap_or(Value::Null)
}

/// One compact row for the page's model list. Field order is fixed (see
/// LITE_FIELDS) so 15,000 rows stay small and fast to send to the page.
pub fn fit_lite(fit: &ModelFit) -> Value {
    let c = &fit.score_components;
    json!([
        fit.model.name,
        enum_text(&fit.fit_level),
        enum_text(&fit.run_mode),
        fit.best_quant,
        round(fit.memory_required_gb, 2),
        round(fit.memory_available_gb, 2),
        round(fit.estimated_tps, 2),
        round(fit.score, 1),
        fit.usable_context,
        fit.effective_context_length,
        enum_text(&fit.estimate_confidence),
        enum_text(&fit.runtime),
        enum_text(&fit.use_case),
        round(fit.utilization_pct, 1),
        [round(c.quality, 1), round(c.speed, 1), round(c.fit, 1), round(c.context, 1)],
        fit.moe_offloaded_gb.map(|g| round(g, 2)),
        fit.measured_tps.as_ref().map(|m| serde_json::to_value(m).unwrap_or(Value::Null))
    ])
}

/// Names of the fit_lite columns, sent once so the page reads rows by name.
pub const LITE_FIELDS: &[&str] = &[
    "name",
    "fit_level",
    "run_mode",
    "best_quant",
    "memory_required_gb",
    "memory_available_gb",
    "estimated_tps",
    "score",
    "usable_context",
    "effective_context_length",
    "estimate_confidence",
    "runtime",
    "use_case",
    "utilization_pct",
    "score_components",
    "moe_offloaded_gb",
    "measured_tps",
];

fn find_model<'a>(db: &'a ModelDatabase, name: &str) -> Result<&'a LlmModel, String> {
    db.get_all_models()
        .iter()
        .find(|m| m.name == name)
        .ok_or_else(|| format!("model not in the catalog: {name}"))
}

pub fn fit_lite_json(hardware_json: &str, context_limit: Option<u32>) -> Result<String, String> {
    let hw = parse_hardware(hardware_json)?;
    let rows: Vec<Value> = fit_all(&hw, context_limit).iter().map(fit_lite).collect();
    serde_json::to_string(&json!({ "fields": LITE_FIELDS, "rows": rows }))
        .map_err(|e| e.to_string())
}

/// Full analysis of one model: the fit (notes, estimate basis) plus the whole
/// catalog record (architecture, GGUF sources) for the detail panel.
pub fn fit_detail_json(
    hardware_json: &str,
    context_limit: Option<u32>,
    name: &str,
) -> Result<String, String> {
    let hw = parse_hardware(hardware_json)?;
    let db = database();
    let model = find_model(&db, name)?;
    let specs = specs_from(&hw);
    let config = config_from(&hw);
    let fit = analyze_with_optional_config(model, &specs, context_limit, Some(&config));
    let out = json!({ "fit": fit_summary(&fit), "model": serde_json::to_value(model).unwrap_or(Value::Null) });
    serde_json::to_string(&out).map_err(|e| e.to_string())
}

fn plan_for(
    hw: &HardwareInput,
    model: &LlmModel,
    context: u32,
    quant: Option<String>,
    kv_quant: Option<KvQuant>,
    target_tps: Option<f64>,
) -> Result<Value, String> {
    let request = PlanRequest {
        context,
        quant,
        target_tps,
        kv_quant,
    };
    let plan =
        estimate_model_plan_with_config(model, &request, &specs_from(hw), &config_from(hw))?;
    serde_json::to_value(plan).map_err(|e| e.to_string())
}

/// llmfit's planner for one model: hardware needed, run paths, upgrades.
pub fn plan_json(
    hardware_json: &str,
    name: &str,
    context: u32,
    quant: Option<String>,
    kv_quant: Option<String>,
    target_tps: Option<f64>,
) -> Result<String, String> {
    let hw = parse_hardware(hardware_json)?;
    let db = database();
    let model = find_model(&db, name)?;
    let kv = kv_quant.as_deref().and_then(KvQuant::parse);
    let plan = plan_for(&hw, model, context, quant, kv, target_tps)?;
    serde_json::to_string(&plan).map_err(|e| e.to_string())
}

/// The plan for every GGUF quant from Q8_0 down to Q2_K, for the
/// "Which file fits?" table. A quant llmfit cannot plan gets an error text.
pub fn ladder_json(
    hardware_json: &str,
    name: &str,
    context: u32,
    kv_quant: Option<String>,
) -> Result<String, String> {
    let hw = parse_hardware(hardware_json)?;
    let db = database();
    let model = find_model(&db, name)?;
    let kv = kv_quant.as_deref().and_then(KvQuant::parse);
    let rows: Vec<Value> = QUANT_HIERARCHY
        .iter()
        .map(|q| match plan_for(&hw, model, context, Some((*q).to_string()), kv, None) {
            Ok(plan) => json!({ "quant": q, "plan": plan }),
            Err(e) => json!({ "quant": q, "error": e }),
        })
        .collect();
    serde_json::to_string(&rows).map_err(|e| e.to_string())
}

fn parse_hardware(hardware_json: &str) -> Result<HardwareInput, String> {
    serde_json::from_str(hardware_json).map_err(|e| format!("hardware JSON is not valid: {e}"))
}

pub fn fit_all_json(hardware_json: &str, context_limit: Option<u32>) -> Result<String, String> {
    let hw = parse_hardware(hardware_json)?;
    let fits: Vec<Value> = fit_all(&hw, context_limit).iter().map(fit_summary).collect();
    serde_json::to_string(&fits).map_err(|e| e.to_string())
}

pub fn fit_keys_json(hardware_json: &str, context_limit: Option<u32>) -> Result<String, String> {
    let hw = parse_hardware(hardware_json)?;
    let keys: Vec<Value> = fit_all(&hw, context_limit).iter().map(fit_key).collect();
    serde_json::to_string(&keys).map_err(|e| e.to_string())
}

/// The catalog fields the page shows (name, size, license, GGUF sources, ...).
pub fn catalog_json() -> String {
    const KEEP: &[&str] = &[
        "name",
        "provider",
        "parameter_count",
        "parameters_raw",
        "active_parameters",
        "num_experts",
        "architecture",
        "context_length",
        "use_case",
        "capabilities",
        "license",
        "release_date",
        "hf_downloads",
        "hf_likes",
        "languages",
        "gguf_sources",
        "is_moe",
        "format",
        "quantization",
        "pipeline_tag",
    ];
    let models: Vec<Value> = database()
        .get_all_models()
        .iter()
        .map(|m| match serde_json::to_value(m) {
            Ok(Value::Object(map)) => Value::Object(
                map.into_iter()
                    .filter(|(k, _)| KEEP.contains(&k.as_str()))
                    .collect::<Map<String, Value>>(),
            ),
            _ => Value::Null,
        })
        .collect();
    serde_json::to_string(&models).unwrap_or_else(|_| "[]".to_string())
}

pub fn engine_info_json() -> String {
    json!({
        "engine": env!("CARGO_PKG_VERSION"),
        "llmfit_ref": LLMFIT_REF,
        "catalog_models": database().get_all_models().len(),
        "live": cfg!(feature = "live")
    })
    .to_string()
}

/// Live models from Hugging Face, the way `llmfit update` adds them, but the
/// page does the fetching (a browser engine has no network code). Every step
/// is llmfit's own code (patched in by tools/patch-llmfit.sh).
#[cfg(feature = "live")]
pub mod live {
    use super::{Arc, DB, LlmModel, ModelDatabase, database};
    use llmfit_core::UpdateOptions;
    use llmfit_core::models::tt_canonical_slug;
    use llmfit_core::update::{tt_map_hf_json, tt_update_urls};
    use std::collections::HashSet;

    /// llmfit's Hub list URLs for its default update (100 trending, 50 most
    /// downloaded, spread over the model kinds llmfit lists).
    pub fn update_urls_json() -> String {
        let o = UpdateOptions::default();
        serde_json::to_string(&tt_update_urls(o.trending_limit, o.downloads_limit))
            .unwrap_or_else(|_| "[]".to_string())
    }

    /// The Hub ids the list does not have yet (llmfit's "same model" key), in
    /// order and without repeats. llmfit skips the others before it fetches
    /// config.json, so the page does too.
    pub fn unknown_ids_json(ids_json: &str) -> Result<String, String> {
        let ids: Vec<String> =
            serde_json::from_str(ids_json).map_err(|e| format!("ids: {e}"))?;
        let db = database();
        let mut known: HashSet<String> = db
            .get_all_models()
            .iter()
            .map(|m| tt_canonical_slug(&m.name))
            .collect();
        let fresh: Vec<String> = ids
            .into_iter()
            .filter(|id| known.insert(tt_canonical_slug(id)))
            .collect();
        serde_json::to_string(&fresh).map_err(|e| e.to_string())
    }

    /// llmfit's conversion of one Hub entry plus the text of its config.json.
    /// "null" means llmfit does not list this kind of model.
    pub fn map_hf_json(entry_json: &str, config_json: Option<&str>) -> Result<String, String> {
        let model = tt_map_hf_json(entry_json, config_json)?;
        serde_json::to_string(&model).map_err(|e| e.to_string())
    }

    /// Replace the extra models (a JSON list of llmfit models) and rebuild the
    /// list. Returns the new number of models.
    pub fn set_extra_models_json(models_json: &str) -> Result<usize, String> {
        let extra: Vec<LlmModel> =
            serde_json::from_str(models_json).map_err(|e| format!("extra models: {e}"))?;
        let db = Arc::new(ModelDatabase::embedded_with_extra(extra));
        let count = db.get_all_models().len();
        *DB.write().unwrap_or_else(|e| e.into_inner()) = Some(db);
        Ok(count)
    }
}

/// The functions the web page calls.
#[cfg(target_arch = "wasm32")]
mod web {
    use wasm_bindgen::prelude::*;

    #[wasm_bindgen(start)]
    pub fn start() {
        console_error_panic_hook::set_once();
    }

    #[wasm_bindgen(js_name = engineInfo)]
    pub fn engine_info() -> String {
        super::engine_info_json()
    }

    #[wasm_bindgen]
    pub fn catalog() -> String {
        super::catalog_json()
    }

    #[wasm_bindgen(js_name = fitAll)]
    pub fn fit_all(hardware_json: &str, context_limit: Option<u32>) -> Result<String, JsError> {
        super::fit_all_json(hardware_json, context_limit).map_err(|e| JsError::new(&e))
    }

    #[wasm_bindgen(js_name = fitKeys)]
    pub fn fit_keys(hardware_json: &str, context_limit: Option<u32>) -> Result<String, JsError> {
        super::fit_keys_json(hardware_json, context_limit).map_err(|e| JsError::new(&e))
    }

    #[wasm_bindgen(js_name = fitLite)]
    pub fn fit_lite(hardware_json: &str, context_limit: Option<u32>) -> Result<String, JsError> {
        super::fit_lite_json(hardware_json, context_limit).map_err(|e| JsError::new(&e))
    }

    #[wasm_bindgen(js_name = fitDetail)]
    pub fn fit_detail(
        hardware_json: &str,
        context_limit: Option<u32>,
        name: &str,
    ) -> Result<String, JsError> {
        super::fit_detail_json(hardware_json, context_limit, name).map_err(|e| JsError::new(&e))
    }

    #[wasm_bindgen]
    pub fn plan(
        hardware_json: &str,
        name: &str,
        context: u32,
        quant: Option<String>,
        kv_quant: Option<String>,
        target_tps: Option<f64>,
    ) -> Result<String, JsError> {
        super::plan_json(hardware_json, name, context, quant, kv_quant, target_tps)
            .map_err(|e| JsError::new(&e))
    }

    #[wasm_bindgen]
    pub fn ladder(
        hardware_json: &str,
        name: &str,
        context: u32,
        kv_quant: Option<String>,
    ) -> Result<String, JsError> {
        super::ladder_json(hardware_json, name, context, kv_quant).map_err(|e| JsError::new(&e))
    }

    #[cfg(feature = "live")]
    #[wasm_bindgen(js_name = updateUrls)]
    pub fn update_urls() -> String {
        super::live::update_urls_json()
    }

    #[cfg(feature = "live")]
    #[wasm_bindgen(js_name = unknownIds)]
    pub fn unknown_ids(ids_json: &str) -> Result<String, JsError> {
        super::live::unknown_ids_json(ids_json).map_err(|e| JsError::new(&e))
    }

    #[cfg(feature = "live")]
    #[wasm_bindgen(js_name = mapHf)]
    pub fn map_hf(entry_json: &str, config_json: Option<String>) -> Result<String, JsError> {
        super::live::map_hf_json(entry_json, config_json.as_deref()).map_err(|e| JsError::new(&e))
    }

    #[cfg(feature = "live")]
    #[wasm_bindgen(js_name = setExtraModels)]
    pub fn set_extra_models(models_json: &str) -> Result<u32, JsError> {
        super::live::set_extra_models_json(models_json)
            .map(|n| u32::try_from(n).unwrap_or(u32::MAX))
            .map_err(|e| JsError::new(&e))
    }
}
