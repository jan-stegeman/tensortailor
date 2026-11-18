# Builds the page and runs every regression test in headless Chrome, one log per test in D:\AI\temp.
# Usage (from any folder): powershell -NoProfile -File D:\AI\tools\llmfit-studio\tools\run-all-tests.ps1 [-Readme]
param([switch]$Readme)
# "Continue": Windows PowerShell 5.1 turns a native program's stderr note into an error under "Stop".
$ErrorActionPreference = "Continue"
Set-Location (Split-Path $PSScriptRoot -Parent)
# A new, empty folder for the browser profiles of this run (an old profile can hold old settings and make a test
# fail by chance); removed again at the end.
$profiles = Join-Path "D:\AI\temp" ("tt-profiles-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
New-Item -ItemType Directory -Force $profiles | Out-Null
$env:CDP_PROFILE_DIR = $profiles
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$page = "file:///" + ((Resolve-Path "dist\tensortailor.html").Path -replace '\\', '/')
node web/build.mjs engine/pkg-nomod dist/tensortailor.html D:\AI\temp\hf_models_v1.1.20.json *> D:\AI\temp\build.log
if ($LASTEXITCODE -ne 0) { "BUILD FAILED"; Get-Content D:\AI\temp\build.log; exit 1 }
"build OK"
$bad = 0
# Ready to go public at any time (skill html-app-house-style, rule 11): no-reply e-mails in every commit, no private
# text, keys, tokens or own paths in the files, their history, the commit messages or the built page; work notes out
# of git; the public files there; every workflow action pinned to a commit SHA. Python: $env:TT_PYTHON, else the
# maintainer's uv Python (the check needs only the standard library).
$python = if ($env:TT_PYTHON) { $env:TT_PYTHON } else { "D:\AI\uv\python\cpython-3.13.18-windows-x86_64-none\python.exe" }
$publicCheck = Join-Path $HOME ".agents\skills\html-app-house-style\scripts\check_public_ready.py"
if (-not (Test-Path $python) -or -not (Test-Path $publicCheck)) {
  "public-ready: FAIL (missing $python or $publicCheck)"; $bad++
} else {
  $out = & $python -I -X utf8 $publicCheck "." --built "dist\tensortailor.html" 2>&1 | Out-String
  $code = $LASTEXITCODE
  Set-Content -Path "D:\AI\temp\reg-public-ready.log" -Value $out -Encoding utf8
  if ($code -ne 0 -or $out -notmatch "OK public ready") { $bad++; "public-ready: exit $code FAIL"; $out.Trim() } else { "public-ready: exit 0, OK public ready" }
}
$plain = "steps-example", "test-mine-planner", "test-gguf-kv", "test-gated", "test-gated-list", "test-highlight", "test-help", "test-lms-load", "test-lms-missing", "test-prefs", "test-measure", "test-kv-fill", "test-key", "test-plan-reach", "test-mine-speed", "test-packed", "test-narrow", "test-small-fixes", "test-calm", "test-review-fixes", "test-review2", "test-name-words", "test-help-audit", "test-review3", "test-screen-review", "test-store-safety", "test-review3-w", "test-detect"
$served = "test-local-gguf", "test-downloads", "test-vision-download", "test-updates", "test-groups", "test-review3-dl"
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
Start-Sleep -Seconds 2
Remove-Item -Recurse -Force $profiles -ErrorAction SilentlyContinue
