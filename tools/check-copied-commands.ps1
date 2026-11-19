# Audit lead 3: checks the commands that test-copy-commands.json copies from the Run tab, with PowerShell's own
# parser. Nothing is run. Every expected case must be there. Each command must parse without errors and be one
# statement: one command (no pipe, no redirection) that calls its own program, with the odd name as ONE literal in
# its own place (the 3rd element: after "-m", "get", "load" or "run"). The only other command allowed is a
# Join-Path inside that place, built from $env:USERPROFILE and the literal. No $( ), no other variable.
# Usage: powershell -NoProfile -File tools\check-copied-commands.ps1 -Log D:\AI\temp\reg-test-copy-commands.log
# Prints one line per command ("[copied] ... OK" or "[copied] ... FAIL ...") and a last line with the count.
param([Parameter(Mandatory = $true)][string]$Log)
$ErrorActionPreference = "Stop"
$expected = 'llama $()', 'llama quotes', 'llama space', 'llama plain', 'lms get', 'lms load', 'ollama run'
$joinCases = 'llama $()', 'llama quotes', 'llama space'
$text = [IO.File]::ReadAllText($Log, [Text.Encoding]::UTF8)
$m = [regex]::Match($text, "(?m)^\[step\] COPIED[^\r\n]*?: (\{[^\r\n]*\})\s*$")
if (-not $m.Success) { "[copied] FAIL: no COPIED step in $Log"; exit 1 }
$data = $m.Groups[1].Value | ConvertFrom-Json
$bad = 0
$got = @($data.copied | ForEach-Object { $_.case })
$missing = @($expected | Where-Object { $got -notcontains $_ })
$extra = @($got | Where-Object { $expected -notcontains $_ })
if ($missing.Count -or $extra.Count -or $got.Count -ne $expected.Count) {
  $bad++; "[copied] FAIL cases: missing " + ($missing -join ", ") + "; extra " + ($extra -join ", ") + "; got $($got.Count) of $($expected.Count)"
}
# The texts come as base64 of UTF-8, so curly quotes survive the console code page of Windows PowerShell 5.1.
$fromB64 = { param($b) if ($null -eq $b) { $null } else { [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b)) } }
foreach ($raw in $data.copied) {
  $c = [pscustomobject]@{ case = $raw.case; prog = $raw.prog; text = (& $fromB64 $raw.text64); lit = (& $fromB64 $raw.lit64) }
  $why = @()
  $tokens = $null; $errors = $null
  $ast = [System.Management.Automation.Language.Parser]::ParseInput([string]$c.text, [ref]$tokens, [ref]$errors)
  if ($errors.Count) { $why += "parse errors: " + (($errors | ForEach-Object { $_.Message }) -join "; ") }
  $st = @($ast.EndBlock.Statements)
  $cmd = $null
  if ($st.Count -ne 1) { $why += "$($st.Count) statements" }
  elseif ($st[0] -isnot [System.Management.Automation.Language.PipelineAst] -or $st[0].PipelineElements.Count -ne 1) { $why += "not one plain command (pipe or other statement)" }
  else {
    $cmd = $st[0].PipelineElements[0]
    if ($cmd -isnot [System.Management.Automation.Language.CommandAst]) { $why += "not a command"; $cmd = $null }
    elseif ($cmd.Redirections.Count) { $why += "has a redirection" }
  }
  if ($cmd) {
    if ($cmd.GetCommandName() -ne $c.prog) { $why += "calls '$($cmd.GetCommandName())', not $($c.prog)" }
    $el = $cmd.CommandElements
    if ($el.Count -lt 3) { $why += "only $($el.Count) elements" }
    elseif ($null -ne $c.lit) {
      $slot = $el[2]
      if ($joinCases -contains $c.case) {
        $inner = if ($slot -is [System.Management.Automation.Language.ParenExpressionAst] -and $slot.Pipeline.PipelineElements.Count -eq 1) { $slot.Pipeline.PipelineElements[0] } else { $null }
        $ok = $inner -is [System.Management.Automation.Language.CommandAst] -and $inner.GetCommandName() -eq "Join-Path" -and $inner.CommandElements.Count -eq 3 -and
          $inner.CommandElements[1] -is [System.Management.Automation.Language.VariableExpressionAst] -and $inner.CommandElements[1].VariablePath.UserPath -eq "env:USERPROFILE" -and
          $inner.CommandElements[2] -is [System.Management.Automation.Language.StringConstantExpressionAst] -and $inner.CommandElements[2].StringConstantType -eq "SingleQuoted" -and
          $inner.CommandElements[2].Value -ceq [string]$c.lit
        if (-not $ok) { $why += "the path is not (Join-Path `$env:USERPROFILE '<the name>'): " + $slot.Extent.Text }
      } elseif (-not ($slot -is [System.Management.Automation.Language.StringConstantExpressionAst] -and $slot.StringConstantType -eq "SingleQuoted" -and $slot.Value -ceq [string]$c.lit)) {
        $why += "the name is not one single-quoted literal in its place: " + $slot.Extent.Text
      }
    }
  }
  $all = @($ast.FindAll({ param($a) $true }, $true))
  $names = @($all | Where-Object { $_ -is [System.Management.Automation.Language.CommandAst] } | ForEach-Object { $_.GetCommandName() })
  $allowed = if ($joinCases -contains $c.case) { 2 } else { 1 }
  if ($names.Count -gt $allowed -or @($names | Where-Object { $_ -ne $c.prog -and $_ -ne "Join-Path" }).Count) { $why += "commands: " + ($names -join ", ") }
  if (@($all | Where-Object { $_ -is [System.Management.Automation.Language.SubExpressionAst] -or $_ -is [System.Management.Automation.Language.ScriptBlockExpressionAst] }).Count) { $why += "has a `$( ) or { } part" }
  $wrongVars = @($all | Where-Object { $_ -is [System.Management.Automation.Language.VariableExpressionAst] } | ForEach-Object { $_.VariablePath.UserPath } | Where-Object { $_ -ne "env:USERPROFILE" })
  if ($wrongVars.Count) { $why += "variables: " + ($wrongVars -join ", ") }
  if ($why.Count) { $bad++; "[copied] $($c.case): FAIL " + ($why -join "; ") + " <<" + $c.text + ">>" } else { "[copied] $($c.case): OK" }
}
"[copied] $(@($data.copied).Count) commands parsed, $bad with a problem"
if ($bad) { exit 1 }
