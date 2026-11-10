#!/usr/bin/env bash
# Makes a browser-ready copy of llmfit-core for the WebAssembly build.
#
# llmfit-core reads the clock in exactly one place on the fit path:
# fit.rs current_year_month() (the "recent model" bonus). std::time::SystemTime
# has no clock on wasm32-unknown-unknown and panics there. web_time is the same
# std type on native and reads JavaScript's Date in the browser.
#
# The native golden run uses the original, unpatched llmfit-core, so
# tools/compare.mjs proves this copy gives the same answers.
#
# Usage (from engine/): bash tools/patch-llmfit.sh <target-dir>
set -euo pipefail

DEST="${1:?target dir}"
TAG=$(grep -oP 'tag = "\K[^"]+' Cargo.toml)

rm -rf "$DEST"
git clone --quiet --depth 1 --branch "$TAG" https://github.com/AlexsJones/llmfit "$DEST"

FIT="$DEST/llmfit-core/src/fit.rs"
CARGO="$DEST/llmfit-core/Cargo.toml"

sed -i 's/std::time::SystemTime::now()/web_time::SystemTime::now()/g; s/std::time::UNIX_EPOCH/web_time::UNIX_EPOCH/g' "$FIT"
sed -i '0,/^\[dependencies\]$/s//[dependencies]\nweb-time = "1"/' "$CARGO"

# Stop if llmfit changed and the patch no longer applies the way we expect.
test "$(grep -c 'web_time::SystemTime::now()' "$FIT")" -eq 1
test "$(grep -c 'std::time::SystemTime' "$FIT")" -eq 0
grep -q '^web-time = "1"$' "$CARGO"
echo "Patched llmfit-core $TAG in $DEST"
