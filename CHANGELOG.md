# Changelog

All notable changes to TensorTailor are written down here, newest first. Each block is one day, labelled with its date;
a day with a release names it. The commits are in backticks at the end of each line.

## [2026.11.25] - 2026-11-25

### Added

- A What's new list: this changelog, linked from the top of the README; CONTRIBUTING.md and the pull request template
  ask for a line in it with every change.

## [2026.11.24] - 2026-11-24

Released as v2026.11.24, the first weekly release that started by itself.

### Changed

- The engine follows llmfit v1.1.21 (`ed4b775`).
- The README pictures were taken again for the release (`eea2a70`).

## [2026.11.23] - 2026-11-23

### Fixed

- Input fields, lists, number boxes and both search boxes now have a border you can see (a contrast of at least 3 to 1,
  WCAG 1.4.11); on focus the border takes the accent colour (`a37b470`).

## [2026.11.21] - 2026-11-21

### Changed

- The page uses British spellings: "licence" and "About and licences" for the noun, "favourite" and "maths"; "catalog"
  and "quantization" stay, as in llmfit and Hugging Face (`5b0ec2d`, `d12562b`).
- Each test run starts its own browser, with its own profile folder and a port the browser chooses itself, so two test
  runs at the same time can no longer drive each other's browser (`1230eae`).

## [2026.11.19] - 2026-11-19

### Security

- Commands copied from the Run tab can no longer run code hidden in a file, repo or model name when you paste them into
  PowerShell: an unusual name goes in single quotes, and a name that cannot be made safe gets no command (`8123e34`).

## [2026.11.18] - 2026-11-18

Released as v2026.11.18.

### Added

- Import has a **Paste from clipboard** button (`9e3dd18`).

### Changed

- The README pictures were taken again for the release (`6f4d87f`).

### Fixed

- Detect in browser recognises built-in graphics (such as Intel UHD, Iris Xe and Radeon Graphics) as having no video
  memory of their own, knows Arc laptop cards and the Linux (Mesa) names, and explains plainly when the browser hides
  the name of the graphics (`930416d`, `2f0066f`).
- The Import PowerShell line says when it has copied the hardware text (and prints it when it cannot), and a wrong paste
  shows a red message in the window and changes nothing; before, "null" caused an error and "{}" said "Hardware
  imported" (`857dde1`).

## [2026.11.15] - 2026-11-15

### Security

- Every GitHub Action in the workflows is pinned to the commit of its release, and the tests include the check that the
  repository is ready to be public (`f80fb26`).

## [2026.11.14] - 2026-11-14

Released as v2026.11.13-3 and v2026.11.14.

### Added

- Issue forms for bugs, wrong estimates, ideas and accessibility, a pull request template, CONTRIBUTING.md and
  ACCESSIBILITY.md (`f9f465c`, `325e706`, `8cc2023`, `2be736c`, `4d048f1`, `1c7f9f7`).

### Changed

- Filters respond faster, and the page asks Hugging Face less often (`f78aaf6`).
- The README pictures were taken again for the releases (`b6c72d8`, `15e9895`).

### Fixed

- The detail panel shows the same speed as the list, including llmfit's own measured or calibrated value, and filling
  in missing KV cache data is faster (`c313923`).
- One fetched model the engine cannot read no longer erases all fetched models, saved hardware is checked before it is
  used, and a full browser storage or a file that is in use is explained in plain words (`ebb0fb4`).
- Measured speeds are shown, one file is never downloaded twice at the same time, and screen readers can use the line
  that sets the width of the detail panel (`d2a3ea0`).
- The size in a list row is no longer cut off, the list fits small laptop screens (1180 to 1300 px wide), the list
  works better with the keyboard and screen readers, and search also matches the name that is shown (`beff682`).
- Remove, Check again and Download again wait for a download of the same file, measured rows use llmfit's own speed
  range, and saved data is checked after loading; these were the confirmed points of two reviews (`9caa9a5`).
- The three CodeQL alerts in the test and build helpers are fixed; the page itself is unchanged (`4521c4d`).

## [2026.11.13] - 2026-11-13

Released as v2026.11.13 and v2026.11.13-2.

### Added

- The page explains words in model names, such as abliterated, Heretic and uncensored (`a89b13f`).
- SECURITY.md, no-warranty lines, and Dependabot updates for the GitHub Actions (`239d637`).

### Changed

- The Help matches the page again: outdated rows are corrected, things on screen that had no row now have one, and the
  wording is clearer, in the README too (`61a8cbf`, `f055f5f`, `52b251d`).
- Design fixes from a deep review, and a full screen review before going public: layout, words and search, colours and
  contrast, and final polish (`4c33f9f`, `a4b59ca`, `8af4ece`, `631118f`, `53c2b36`, `d0e441e`).
- The README download text is up to date, the Battle pictures use the full width, and the pictures were taken again for
  the releases (`46325aa`, `eaacab9`, `16f09b0`).

### Fixed

- The memory bar of CPU+GPU rows is drawn to scale, with visible orange stripes (`9bb8a56`).
- A model that won't fit shows no speed, the hardware fields keep what you type, a damaged joined download is joined
  again or removed so it never stays in LM Studio's folder, and C and W do nothing when no model is chosen (`e0cb8bb`).
- The Load window asks LM Studio first and never unloads a model it did not show, "What if I upgrade?" is named where
  it changes the answer, Show finds a model the filters hide, and Battle names a tie (`81dbf44`).
- A download remembers its folder, Download again asks Hugging Face for the newest size and SHA-256, the Tools menu
  works with the arrow keys, and the build stops when llmfit's tag has moved (`962cc8d`).
- Column heads sit exactly above their columns, and nothing runs over the edge of a cell (`701a0bd`).

### Security

- In the workflows, only the steps that need the write token get it, third-party actions are pinned to a commit, and a
  release points at exactly the commit it was built from (`b6b726d`).

## [2026.11.12] - 2026-11-12

Released as v2026.11.12, v2026.11.12-2 and v2026.11.12-3.

### Added

- A "size uncertain" label for compressed repos that are not GGUF (`167bd6c`).
- The page shows its version, and release titles follow the tag (`977fe8a`).
- The weekly release takes new README pictures, waits longer for Chrome and tries the pictures twice (`197568a`,
  `3041074`).

### Changed

- Top picks starts closed, so more model rows are in view, and My models shows numbered steps and a **Try again**
  button when LM Studio is off (`b2356b5`).
- The style code was tidied up into one set of tokens (the page looks the same), the page is calmer without ALL-CAPS
  labels, and it fits a 1366 px screen (`6369007`, `916d4cd`, `14aa749`).
- The README covers downloads, Detect and Import, privacy, release dates and the Files tab, with new pictures
  (`242f76f`, `648bcde`, `3b9be12`, `68fbe41`).

### Fixed

- Fixes from a review: the KV cache maths is corrected, text is no longer clipped in a narrow list, and the page stays
  in step with LM Studio (`2543a2c`).
- The target speed comes from the route speeds, and LM Studio rows get no made-up Hugging Face links (`39acf1b`).
- My models shows the speed of your own file, and Similar finds LM Studio rows named after their repo (`85d109d`).
- The release date is that of the exact repo, not of its newest re-upload (`bdf0d9d`).
- Downloads offer Download again after a SHA-256 mismatch and check the parts first (`fb16395`).
- Memory labels keep their numbers in a narrow list and say VRAM again (`52f885e`).
- No config.json requests for GGUF-only repos, and a busy Hugging Face is tried again (`5514962`).
- Hardware Import reads the real VRAM and LM Studio's drive, and Detect keeps the CPU cores (`eb2c835`).
- The Run tab commands follow the settings card, and the Load button in the header works from any engine (`50571b6`).
- With another KV cache choice, the Overview numbers and the verdict agree (`61e705d`).
- A context of 1,048,576 shows as 1M, short names such as phi-4 match their LM Studio model, and a failed gated check
  waits 10 minutes before it is tried again (`7ba1193`).
- My models matches files by name first, keeps its links right, and Measure never loads a model (`523fb53`).
- Clearer texts for privacy, the catalog count, the upgrade lines and Llama 3.2 Vision (`9ea5fec`).

### Security

- Values from a GGUF header are always treated as data, never as HTML (`f9baf7c`).

## [2026.11.11] - 2026-11-11

### Added

- A Tools menu in the header, and a slightly larger type scale (`c63959a`).
- My models takes its best setting from llmfit's planner, as the Run tab does (`73ddd7c`).
- Run it on this PC names your own LM Studio file first (`b7981bc`).
- The exact KV cache from your GGUF headers, also for llmfit rows without layer data (`ca704df`, `653e78a`, `387d5e2`).
- The chosen model stands out in the list (`fc618f9`).
- TensorTailor asks Hugging Face whether a model is really gated; every build carries Hugging Face's list of gated
  models, and the **No token needed** filter hides them (`b4b1a9c`, `e3c6a68`).
- My models shows when a model file has a newer version on Hugging Face, groups similar models with their disk space,
  and measures the real speed next to the estimate (`ad76b6c`, `01b4003`, `4139f60`).
- A key button in the header opens the Hugging Face token window, and the Plan tab is written in plain words
  (`88ef8b8`).

### Changed

- A new design for the whole page, from the basic colours and shapes to the header, sidebar, model list, detail panel,
  My models, Battle, Downloads, the empty and loading states, the Tools menu and Help (`b5e79fa`, `ab65ec4`,
  `6fadb7e`, `ae58ec3`, `0e80120`).
- A calmer Files tab, and an Overview without a second verdict, with a short introduction to Run (`149c333`,
  `802ff18`).
- The Help has one row per label, icon and filter; the tests were repaired, with new README pictures (`6cabbc7`,
  `90372c2`, `ba50abf`).

### Removed

- llmfit's benchmark cache from localmaxxing.com is left out of the build, because its terms give no licence for the
  data (`06f352b`).

## [2026.11.10] - 2026-11-10

The first version: the design, llmfit's engine in the browser, and the page with its first tools.

### Added

- The design mock-ups, research and plan (`b8cb039`, `5e82856`, `47cdea1`, `8adf352`).
- llmfit's engine as WebAssembly, checked against the native program, with the browser's clock and randomness, and with
  RAM and GPU speed passed in instead of measured (`c50736f`, `41c0ede`, `4dd521b`, `2e1567f`, `763fd92`).
- Fast list rows, model details, the planner and the quant ladder from the engine, and a build script for the single
  page (`10ef70a`, `fbee52f`).
- The TensorTailor page, with the engine in a Web Worker (`dc82e3a`).
- Icons and filters for vision, tool use and reasoning, file sizes in MB, and Ollama's helper files hidden (`61592ad`).
- New models fetched live from Hugging Face through llmfit's own conversion, and a live check of any pasted link
  (`b2478ec`, `2ddd3de`).
- A real Download button with crash-safe resume, checked with a SHA-256 read back from disk; a vision model brings its
  vision projector along (`ee1e28f`, `55a849b`, `33b7488`, `5834b7e`).
- Hover explanations, a Help window and a Legend, and the right memory for MoE offload (`995ac13`).
- Search by publisher, a line that shows what the filters hide, and a search on Hugging Face (`254c18d`).
- MTP support from the GGUF header, config.json or the name, with MTP on or off in My models (`dc8a2f4`).
- Hover texts for every label in the list, with the licence name (`764a972`).
- LM Studio load settings for this PC in the Run tab, and a button that loads the model in LM Studio with them
  (`d9c6609`, `8b54366`).
- Arch and Params columns in My models, with LM Studio's bundled embedding model marked (`a480586`).
- My models reads the GGUF headers of your own model files, with the same favourite stars (`7a1a110`).
- Every LM Studio model shows up in Models, also the ones llmfit's list lacks (`2b8f8c4`).
- The choices on the left are kept after a reload (`b086fb1`).
- Top picks for this PC, and keyboard and screen-reader improvements (`403c2fc`, `1d0ff02`).
- The MIT licence, and third-party notices made by cargo-about at every build (`ad00e6a`).
- A weekly release that follows new llmfit tags, and a weekly model catalog made with llmfit's own scraper, which the
  release uses when it is fresh (`0818403`, `3031635`, `1b590d4`).

### Changed

- Polish from a review of the screens: contrast, scrollbars, aligned columns, clearer tiles, one clear answer in the
  detail panel, and a calmer left panel with visible active filters (`c844a34`, `054f1d7`, `9434b16`).
- A README for users first, with pictures in light and dark; neutral examples instead of personal paths; the page test
  kept in the repo and the work notes kept out of it (`7849d0a`, `5037589`, `89c1a27`, `4707100`, `8d8ce72`,
  `1d8dc02`).
- Notes on the progress and on the first weekly runs (`c8ed708`, `6dce283`, `ad2ab14`, `fdaab67`, `daa2577`).
- The GitHub Actions moved to their v7 versions on Node 24 (`f47fe07`).

### Fixed

- A GGUF repo is its own file source, and the Files tab loads the file list by itself (`1a908ab`).
- Only fetched models that llmfit analyses can be opened; the page explains the others (`f145cc2`).
- The catalog run takes out rows llmfit cannot read before its checks (`ca41cfd`).
- No config.json request for gated models without a token (`9e9f3a5`).
- A download whose rename fails no longer says plain Done, parts are joined under their real name, and an old .tt-tmp
  file is copied when the browser refuses the rename (`4dd1cd8`, `78b3a6e`).
- LM Studio quants that llmfit does not know (Q4_K_S, IQ4_XS) count as the nearest one, and your own model files match
  within a small size difference (`a84e58a`, `4284fe9`).
- Plain names in the third-party notices, and where the crate sources are (`1988bc2`).
