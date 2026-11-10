// Opens a page in headless Edge through the DevTools protocol, prints console
// messages and errors, waits for a JS condition, runs optional steps, and saves
// a screenshot. A step may have "js" (run it), "log", "wait" (ms) and "shot"
// (save a screenshot to that path after the wait). Usage:
//   node cdp_test.mjs <edge.exe> <url> <screenshot.png> [waitExpr] [stepsJson]
// With the environment variable CDP_SERVE_DIR set, the folder is served on
// http://127.0.0.1:<free port>/ and "{server}" in the url is replaced by it
// (a file:// page has no origin storage, so OPFS tests need http).
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { join, normalize, extname } from "node:path";

const [edge, rawUrl, shot, waitExpr = "true", stepsJson = "[]"] = process.argv.slice(2);
let url = rawUrl, server = null;
if (process.env.CDP_SERVE_DIR) {
  const root = normalize(process.env.CDP_SERVE_DIR);
  const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".png": "image/png" };
  server = createServer((req, res) => {
    const file = normalize(join(root, decodeURIComponent(new URL(req.url, "http://x").pathname)));
    if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream" });
    res.end(readFileSync(file));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  url = url.replace("{server}", `http://127.0.0.1:${server.address().port}`);
  console.log("serving", root, "at", url);
}
const port = 9333 + Math.floor(Math.random() * 300);
const profile = `D:\\AI\\temp\\tt-cdp-profile-${port}`;
mkdirSync(profile, { recursive: true });
const proc = spawn(edge, ["--headless=new", "--no-first-run", "--disable-extensions", `--user-data-dir=${profile}`,
  `--remote-debugging-port=${port}`, "--window-size=1600,900", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 60 && !target; i++) {
  try { const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); target = list.find((t) => t.type === "page"); } catch { /* not up yet */ }
  if (!target) await sleep(250);
}
if (!target) { console.log("FAIL: Edge did not start"); proc.kill(); if (server) server.close(); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let seq = 0; const waiters = new Map();
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && waiters.has(msg.id)) { waiters.get(msg.id)(msg); waiters.delete(msg.id); return; }
  if (msg.method === "Runtime.consoleAPICalled") console.log(`[console.${msg.params.type}]`, msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 400));
  if (msg.method === "Runtime.exceptionThrown") console.log("[exception]", (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text || "").slice(0, 600));
  if (msg.method === "Log.entryAdded") console.log(`[log.${msg.params.entry.level}]`, msg.params.entry.text.slice(0, 300));
});
const send = (method, params = {}) => new Promise((resolve) => { const id = ++seq; waiters.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); return r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description; };

await send("Runtime.enable"); await send("Log.enable"); await send("Page.enable");
const t0 = Date.now();
await send("Page.navigate", { url });
let ok = false;
for (let i = 0; i < 120; i++) { await sleep(500); if (await evaluate(`(() => { try { return !!(${waitExpr}); } catch (e) { return false; } })()`)) { ok = true; break; } }
console.log(ok ? `READY after ${((Date.now() - t0) / 1000).toFixed(1)} s` : "FAIL: condition not met in 60 s");
const steps = JSON.parse((stepsJson.endsWith(".json") ? readFileSync(stepsJson, "utf8") : stepsJson).replace(/^﻿/, ""));
for (const step of steps) {
  const out = step.js ? await evaluate(step.js) : undefined;
  if (step.log) console.log(`[step] ${step.log}:`, typeof out === "string" ? out.slice(0, 800) : JSON.stringify(out));
  await sleep(step.wait || 300);
  if (step.shot) {
    const res = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(step.shot, Buffer.from(res.result.data, "base64"));
    console.log("screenshot:", step.shot);
  }
}
const shotRes = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(shot, Buffer.from(shotRes.result.data, "base64"));
console.log("screenshot:", shot);
ws.close(); proc.kill(); if (server) server.close(); process.exit(ok ? 0 : 1);
