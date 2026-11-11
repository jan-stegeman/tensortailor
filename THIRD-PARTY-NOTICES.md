# Third-party notices

TensorTailor itself is under the MIT License (see `LICENSE`). It contains or uses the parts below.

## llmfit (the engine)

TensorTailor's fit and speed engine is [llmfit](https://github.com/AlexsJones/llmfit) by Alex Jones,
compiled to WebAssembly and placed inside the page. TensorTailor changes it for the browser only: the clock
(web_time) in the recency bonus, and llmfit's update code split so the page can fetch from Hugging Face
itself and then use llmfit's own conversion (`engine/tools/patch-llmfit.sh`). llmfit's name and logo are not
used as the name of this tool.

```
MIT License

Copyright (c) 2026 Alex Jones

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Rust crates inside the engine

The engine contains Rust crates (for example serde, serde_json, wasm-bindgen) under MIT, Apache-2.0 and
similar licenses. The exact list with every license text is made at build time by
[cargo-about](https://github.com/EmbarkStudios/cargo-about) for the WebAssembly target (`engine/about.toml`,
`engine/about.hbs`). It is:

- inside every page: **About → Show the licenses**;
- attached to every GitHub Release as `THIRD-PARTY-NOTICES.txt`;
- kept with every GitHub Actions build (artifact `tensortailor-html`).

## Data inside the page

- **Model catalog:** llmfit's `hf_models.json` (or our weekly copy made with llmfit's own scraper): names,
  sizes and other facts read from the public Hugging Face API. The models themselves are never included;
  each model keeps its own license.
- **Measured speeds:** only llmfit's own community results (`data/community`, MIT). llmfit also embeds a
  cache of results from [localmaxxing.com](https://localmaxxing.com); TensorTailor leaves that cache out
  (`engine/tools/strip-benchmark-cache.sh`), because localmaxxing's terms give no license for the data.
- **Your own measurements:** **Measure** in My models stores LM Studio's speed for your models in your
  browser only (localStorage); nothing is sent anywhere.
