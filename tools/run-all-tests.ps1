# Builds the page and runs every regression test in headless Chrome, one log per test in D:\AI\temp.
# Usage (from any folder): powershell -NoProfile -File D:\AI\tools\llmfit-studio\tools\run-all-tests.ps1 [-Readme]
param([switch]$Readme)
# "Continue": Windows PowerShell 5.1 turns a native program's stderr note into an error under "Stop".
$ErrorActionPreference = "Continue"
Set-Location (Split-Path $PSScriptRoot -Parent)
$env:CDP_PROFILE_DIR = "D:\AI\temp"
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$page = "file:///" + ((Resolve-Path "dist\tensortailor.html").Path -replace '\\', '/')
node web/build.mjs engine/pkg-nomod dist/tensortailor.html D:\AI\temp\hf_models_v1.1.20.json *> D:\AI\temp\build.log
if ($LASTEXITCODE -ne 0) { "BUILD FAILED"; Get-Content D:\AI\temp\build.log; exit 1 }
"build OK"
$plain = "steps-example", "test-mine-planner", "test-gguf-kv", "test-gated", "test-gated-list", "test-highlight", "test-help", "test-lms-load", "test-lms-missing", "test-prefs", "test-measure", "test-kv-fill", "test-key", "test-plan-reach", "test-mine-speed", "test-packed", "test-narrow", "test-small-fixes", "test-calm", "test-review-fixes", "test-review2", "test-name-words"
$served = "test-local-gguf", "test-downloads", "test-vision-download", "test-updates", "test-groups"
$bad = 0
foreach ($t in $plain + $served) {
  if ($served -contains $t) { $env:CDP_SERVE_DIR = "dist"; $u = "{server}/tensortailor.html" } else { Remove-Item Env:CDP_SERVE_DIR -ErrorAction SilentlyContinue; $u = $page }
  $out = node tools\cdp_test.mjs $chrome $u "dist\reg-$t.png" "state.ready" "tools\$t.json" 2>&1 | Out-String
  $code = $LASTEXITCODE
  Set-Content -Path "D:\AI\temp\reg-$t.log" -Value $out -Encoding utf8
  $steps = ([regex]::Matches($out, "\[step\]")).Count
  $fails = [regex]::Matches($out, "\[step\][^\r\n]*FAIL[^\r\n]*") | ForEach-Object { $_.Value.Substring(0, [Math]::Min(300, $_.Value.Length)) }
  if ($code -ne 0 -or $fails) { $bad++ }
  "{0}: exit {1}, {2} steps{3}" -f $t, $code, $steps, $(if ($fails) { " FAIL" } else { "" })
  $fails
}
if ($Readme) {
  Remove-Item Env:CDP_SERVE_DIR -ErrorAction SilentlyContinue
  $out = node tools/cdp_test.mjs $chrome $page "D:\AI\temp\tt-last.png" "state.ready && state.results.length > 0" tools/readme-screenshots.json 2>&1 | Out-String
  "README pictures: exit $LASTEXITCODE, " + ([regex]::Matches($out, "screenshot: docs")).Count + " pictures"
}
"tests with a problem: $bad"
