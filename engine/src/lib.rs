//! TensorTailor engine: llmfit's fit and speed math, callable from WebAssembly.
//!
//! The browser cannot detect RAM or VRAM, so the page passes the hardware in as
//! JSON. Everything else (the model catalog, the fit rules, the speed formula,
//! the community measurements) is llmfit-core itself, unchanged.

use llmfit_core::analysis::build_model_fits_with_config;
use llmfit_core::fit::CalcConfig;
use llmfit_core::hardware::GpuInfo;
use llmfit_core::{GpuBackend, InstalledIndex, ModelDatabase, ModelFit, SystemSpecs};
use serde::Deserialize;
use serde_json::{Map, Value, json};
use std::sync::OnceLock;

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

fn database() -> &'static ModelDatabase {
    static DB: OnceLock<ModelDatabase> = OnceLock::new();
    DB.get_or_init(ModelDatabase::embedded)
}

/// Every catalog model analysed for this hardware, in catalog order (unsorted).
pub fn fit_all(hw: &HardwareInput, context_limit: Option<u32>) -> Vec<ModelFit> {
    let specs = specs_from(hw);
    build_model_fits_with_config(
        database(),
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
        "catalog_models": database().get_all_models().len()
    })
    .to_string()
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
}
