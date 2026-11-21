// Opens a page in headless Chrome or Edge through the DevTools protocol, prints console
// messages and errors, waits for a JS condition, runs optional steps, and saves
// a screenshot. A step may have "js" (run it), "log", "wait" (ms) and "shot"
// (save a screenshot to that path after the wait). Usage:
//   node cdp_test.mjs <edge.exe> <url> <screenshot.png> [waitExpr] [stepsJson]
// With the environment variable CDP_SERVE_DIR set, the folder is served on
// http://127.0.0.1:<free port>/ and "{server}" in the url is replaced by it
// (a file:// page has no origin storage, so OPFS tests need http).
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { join, normalize, extname } from "node:path";
import { tmpdir } from "node:os";

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
// Every run gets a NEW empty throw-away profile folder (in CDP_PROFILE_DIR when set, else in the system's temp
// folder) and port 0: the browser picks a free port itself and writes it to DevToolsActivePort in that folder. A
// chosen port could already be in use by another run (the sister apps' tests in another chat use the same kind of
// runner): this run would then drive THAT browser and its page, and get its errors (proven on 2026-11-21).
const profileBase = process.env.CDP_PROFILE_DIR || tmpdir();
mkdirSync(profileBase, { recursive: true });
const profile = mkdtempSync(join(profileBase, "tt-cdp-profile-"));
const extraFlags = process.platform === "linux" ? ["--no-sandbox", "--disable-dev-shm-usage"] : [];
const proc = spawn(edge, ["--headless=new", "--no-first-run", "--disable-extensions", ...extraFlags, `--user-data-dir=${profile}`,
  "--remote-debugging-port=0", "--window-size=1600,900", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// The end of every run: the browser is stopped and, once it has exited, its profile folder is removed (a Windows
// renderer can hold files for a moment, hence the retries; a folder that still cannot go is left behind).
async function stopBrowser() {
  const exited = new Promise((r) => (proc.exitCode !== null || proc.signalCode !== null ? r() : proc.once("exit", r)));
  proc.kill();
  await Promise.race([exited, sleep(5000)]);
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch { /* left behind */ }
}
let port = 0, target;
// Up to 60 s: a busy GitHub runner once needed more than the 15 s this used to wait. The port counts only when the
// file is complete (a number in range on the first line, and the second line there), so a half-written file is read
// again on the next pass.
for (let i = 0; i < 240 && !target; i++) {
  if (!port) {
    try {
      const [p, path] = readFileSync(join(profile, "DevToolsActivePort"), "utf8").split(/\r?\n/), n = Number(p);
      if (/^\d+$/.test(p) && n > 0 && n < 65536 && path) port = n;
    } catch { /* not written yet */ }
  }
  if (port) { try { const list = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2000) })).json(); target = list.find((t) => t.type === "page"); } catch { /* not up yet */ } }
  if (!target) await sleep(250);
}
if (!target) { console.log(`FAIL: the browser did not start (${port ? `no answer on port ${port}` : "no DevToolsActivePort"} within 60 s)`); await stopBrowser(); if (server) server.close(); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let seq = 0; const waiters = new Map();
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && waiters.has(msg.id)) { waiters.get(msg.id)(msg); waiters.delete(msg.id); return; }
  // The page's text is never the first argument, so a "%s" in it is not read as a format.
  if (msg.method === "Runtime.consoleAPICalled") console.log("[console.%s]", msg.params.type, msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 400));
  if (msg.method === "Runtime.exceptionThrown") console.log("[exception]", (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text || "").slice(0, 600));
  if (msg.method === "Log.entryAdded") console.log("[log.%s]", msg.params.entry.level, msg.params.entry.text.slice(0, 300), msg.params.entry.url ? `(${msg.params.entry.url.slice(0, 160)})` : "");
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
  if (Array.isArray(step.viewport) && step.viewport.length === 2) {
    await send("Emulation.setDeviceMetricsOverride", { width: step.viewport[0], height: step.viewport[1], deviceScaleFactor: 1, mobile: false });
  }
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
ws.close(); await stopBrowser(); if (server) server.close(); process.exit(ok ? 0 : 1);
