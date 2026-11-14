# Contributing to TensorTailor

Thank you for your interest in TensorTailor. It is a free project, made and kept up by one person in free time.
There is no fixed time for an answer, and not every idea will be built.

## Report a problem or an idea

1. Check that you have the newest release. The version is at the top left of the page; the newest one is on the
   [Releases](https://github.com/jan-stegeman/tensortailor/releases) page.
2. Search the [issues](https://github.com/jan-stegeman/tensortailor/issues) to see if someone already reported it.
3. Open a [new issue](https://github.com/jan-stegeman/tensortailor/issues/new/choose) and pick a form:
   **Bug report**, **Wrong fit, speed or memory**, or **Feature request**.

- A **security problem**: never in a public issue. See [SECURITY.md](SECURITY.md).
- A **wrong estimate** that the llmfit program itself also gives: report it at
  [llmfit](https://github.com/AlexsJones/llmfit/issues). TensorTailor uses llmfit's formulas as they are.
- Never paste your Hugging Face token. Screenshots can show your own model list and folder names.

## What TensorTailor stays

New work must keep these promises:

- **One HTML file** that works offline. No install, no server, no account.
- **No tracking.** The page talks only to Hugging Face and to LM Studio on `127.0.0.1:1234` (see Privacy in the
  [README](README.md#privacy)).
- **llmfit's answers.** The engine is llmfit, with a few small, listed changes for the browser. A change to the
  formulas belongs in [llmfit](https://github.com/AlexsJones/llmfit); TensorTailor then picks it up with the next
  llmfit release.

## Pull requests

- For a bigger change, open an issue first, so we can agree on the idea before you spend time on it.
- Keep one change per pull request.
- The page is `web/app.html`. Build the single file with `web/build.mjs` (see
  [Build the page](README.md#build-the-page)).
- **A change you can see in the page** needs:
  - a row in the built-in Help (the build stops when a filter, view, sort choice or label has no Help row);
  - new README pictures when the pictures show the change (see [Test it](README.md#test-it)).
- **Tests:** run the test in `tools/` that fits your change with `tools/cdp_test.mjs` in headless Chrome (see
  [Test it](README.md#test-it)), and add a test step for a fix when you can. `tools/run-all-tests.ps1` runs all
  tests, but it uses fixed folders of the maintainer's PC. Say in the pull request which tests you ran.
- **Text** in the page and the docs: plain, simple English with short sentences.
- **Commit messages** follow [Conventional Commits](https://www.conventionalcommits.org/): `feat: …`, `fix: …`,
  `docs: …`.
- Never commit a token, a password, or your own paths and model names. The README pictures use made-up demo data.
- The GitHub check `engine.yml` runs on changes to `engine/` and `web/`: it must be green.

By sending a pull request you agree that your work is released under the [MIT License](LICENSE) of this project.
