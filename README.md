# TensorTailor

Find out which open AI models (LLMs) fit your PC, before you download them.

TensorTailor will be **one HTML file**. You open it in Edge or Chrome. It needs no install and works
offline. It checks about 19,000 models from Hugging Face against your GPU, VRAM, RAM and CPU, and it
tells you which file to download and how fast it will run.

> **Status:** first working version. `dist/tensortailor.html` is one offline file (about 3 MB) with the llmfit
> engine inside as WebAssembly. Every build checks that the engine gives exactly the same answers as native
> llmfit. Direct downloads and the weekly release are not done yet.

## Screenshots

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/models-dark.png">
  <img alt="The model list for an RTX 3090 with 24 GB VRAM, with the details of Qwen3-14B on the right" src="docs/screenshots/models-light.png">
</picture>

| | |
| --- | --- |
| ![Files tab: the GGUF files of the model on Hugging Face, with size and SHA-256](docs/screenshots/files-dark.png) | ![Plan tab: what the model needs and which route works on this PC](docs/screenshots/plan-light.png) |
| **Files:** the real file list from Hugging Face, with SHA-256 | **Plan:** llmfit's planner for this PC |
| ![My models: the models in LM Studio with a verdict and the best setting](docs/screenshots/my-models-dark.png) | ![Battle: three models compete on this PC and one wins](docs/screenshots/battle-light.png) |
| **My models:** your LM Studio models (demo data in this picture) | **Battle:** 2 to 4 models compete, one wins |

All pictures are 1600 × 900 and show the page in light and dark mode. The "My models" pictures use
made-up demo models, not a real LM Studio list. Make them again after a change:

```powershell
node tools/cdp_test.mjs "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" "file:///D:/AI/tools/llmfit-studio/dist/tensortailor.html" D:\AI\temp\tt-last.png "state.ready && state.results.length > 0" tools/readme-screenshots.json
```

## Build the page

```powershell
node web/build.mjs engine/pkg-nomod dist/tensortailor.html <path to llmfit hf_models.json>
```

GitHub Actions builds it on every push (artifact `tensortailor-html`).

## What is here now

| Path | What it is |
| --- | --- |
| `design/mockup.html` | Clickable design with example data (open it in Edge or Chrome) |
| `design/mockup-dark.png` | Screenshot of the design: model list (dark) |
| `design/mockup-battle-light.png` | Screenshot of the design: Battle view (light) |
| `research/similar-tools.md` | Study of similar tools and the features we take over |
| `PROGRESS.md` | Decisions, what is done, and the next steps |
| `engine/` | Rust crate that wraps llmfit-core and builds it to WebAssembly |
| `web/app.html` | The real page (filled with the engine by `web/build.mjs`) |
| `web/build.mjs` | Makes the single file `dist/tensortailor.html` |
| `tools/cdp_test.mjs` | Tests the built page in headless Edge (DevTools protocol) and takes screenshots |
| `tools/readme-screenshots.json` | The steps that make the README pictures (with demo data for My models) |
| `docs/screenshots/` | The README pictures, light and dark |
| `.github/workflows/engine.yml` | GitHub build: native and WebAssembly runs must give the same answers |

## How it will work

- **Engine:** the fit and speed calculation of [llmfit](https://github.com/AlexsJones/llmfit) by Alex Jones,
  compiled to WebAssembly so it runs inside the browser. The results match llmfit.
- **Model list:** llmfit's catalog, refreshed every week by a GitHub Actions build.
- **Your hardware:** the browser sees the GPU name and CPU threads; you type or import RAM and VRAM.
- **Downloads:** copy a ready command, or download inside the page with a SHA-256 check afterwards.
- **LM Studio:** reads your local models and can measure real speed through LM Studio's local server.

## Credits and license

TensorTailor is based on **llmfit**, Copyright (c) 2026 Alex Jones, released under the MIT License.
The license of TensorTailor itself is chosen before the first public release.
