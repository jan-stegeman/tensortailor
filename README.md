# TensorTailor

Find out which open AI models (LLMs) fit your PC, before you download them.

TensorTailor will be **one HTML file**. You open it in Edge or Chrome. It needs no install and works
offline. It checks about 19,000 models from Hugging Face against your GPU, VRAM, RAM and CPU, and it
tells you which file to download and how fast it will run.

> **Status:** design stage. Nothing is built yet. The private repository holds the design and the plan.

## What is here now

| Path | What it is |
| --- | --- |
| `design/mockup.html` | Clickable design with example data (open it in Edge or Chrome) |
| `design/mockup-dark.png` | Screenshot of the design: model list (dark) |
| `design/mockup-battle-light.png` | Screenshot of the design: Battle view (light) |
| `research/similar-tools.md` | Study of similar tools and the features we take over |
| `PROGRESS.md` | Decisions, what is done, and the next steps |
| `engine/` | Rust crate that wraps llmfit-core and builds it to WebAssembly (trial) |
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
