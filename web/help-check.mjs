// Checks that the built-in Help (the dialog dlgHelp in web/app.html) explains everything the page shows:
// every filter box, every view, every sort choice and every fixed label ("chip") in the page's code.
// build.mjs runs it before each build, so a new filter or label without a Help row stops the build
// (also on GitHub). Usage on its own: node web/help-check.mjs [web/app.html]

import { readFileSync } from "node:fs";

const strip = (s) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

export function helpCheck(html) {
  const help = (/<dialog id="dlgHelp"[\s\S]*?<\/dialog>/.exec(html) || [""])[0];
  if (!help) return ["the Help dialog (dlgHelp) is missing"];
  const helpText = strip(help).toLowerCase();
  const dts = [...help.matchAll(/<dt>([\s\S]*?)<\/dt>/g)].map((m) => strip(m[1]).toLowerCase());
  // A row explains t when its title is t, starts with "t ", or has t as one part ("A · B", "My models: …").
  const inRow = (t) => { const x = t.toLowerCase(); return dts.some((d) => d === x || d.startsWith(x + " ") || d.split(/ · |: /).includes(x)); };
  const problems = [];

  // Filter boxes on the left: each needs its own Help row.
  for (const m of html.matchAll(/<label[^>]*>\s*<input type="checkbox" id="f[A-Z]\w*"[^>]*>\s*([^<]+)<\/label>/g)) {
    const label = m[1].trim();
    if (!inRow(label)) problems.push(`filter "${label}" has no Help row`);
  }
  // Views in the top bar.
  for (const m of html.matchAll(/<button data-view="\w+"[^>]*>([^<]+)</g)) {
    const view = m[1].trim();
    if (!inRow(view)) problems.push(`view "${view}" has no Help row`);
  }
  // Sort choices: named somewhere in the Help.
  const sort = (/<select id="sort">([\s\S]*?)<\/select>/.exec(html) || [, ""])[1];
  for (const m of sort.matchAll(/<option value="\w+">([^<]+)<\/option>/g)) {
    if (!helpText.includes(m[1].trim().toLowerCase())) problems.push(`sort choice "${m[1].trim()}" is not in the Help`);
  }
  // Fixed labels in the page's code: <span class="chip x" ...>text</span> with a plain text.
  const code = html.replace(help, "");
  const chips = new Set();
  for (const m of code.matchAll(/<span class="chip(?: [\w-]+)?"[^>]*>([A-Za-z][A-Za-z ]{1,30})<\/span>/g)) chips.add(m[1].trim());
  for (const c of chips) if (!inRow(c)) problems.push(`label "${c}" has no Help row`);
  return problems;
}

// Run on its own (not when build.mjs imports it).
if ((process.argv[1] || "").replace(/\\/g, "/").endsWith("web/help-check.mjs")) {
  const file = process.argv[2] || new URL("./app.html", import.meta.url);
  const problems = helpCheck(readFileSync(file, "utf8"));
  if (problems.length) { console.error("Help check failed:\n  - " + problems.join("\n  - ")); process.exit(1); }
  console.log("Help check: every filter, view, sort choice and label has its Help row.");
}
