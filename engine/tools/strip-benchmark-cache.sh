#!/usr/bin/env bash
# Builds TensorTailor without the localmaxxing.com benchmark cache that llmfit embeds.
#
# llmfit-core embeds data/benchmark_cache.json (results scraped from localmaxxing.com's API) with
# include_str! in benchmarks.rs. localmaxxing's terms give no license for that data, so TensorTailor
# ships an empty cache instead: {"scraped_at": null, "presets": {}} is a valid BenchmarkCache.
# llmfit's own community results (data/community, MIT) stay in. On an RTX 3090 profile this turns 4 of
# 14,508 results from "measured" into "estimated".
#
# The build action runs it on BOTH copies of llmfit-core: the browser copy (patch-llmfit.sh) and the
# original copy for the native golden answers, so the two still differ only by the browser patch.
#
# Usage: bash tools/strip-benchmark-cache.sh <llmfit checkout>
set -euo pipefail

DIR="${1:?llmfit checkout}"
CACHE="$DIR/llmfit-core/data/benchmark_cache.json"
RS="$DIR/llmfit-core/src/benchmarks.rs"

# Stop if llmfit changed and the cache is no longer embedded this way.
test -f "$CACHE"
grep -q 'include_str!("../data/benchmark_cache.json")' "$RS"

printf '{"scraped_at": null, "presets": {}}\n' > "$CACHE"
test "$(wc -c < "$CACHE")" -lt 100
echo "localmaxxing.com benchmark cache left out (empty cache in $CACHE)"
