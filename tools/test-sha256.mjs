// Checks the page's streaming SHA-256 (script#hash-worker in web/app.html)
// against Node's crypto: many lengths around the 64-byte block edges, random
// piece sizes, the worker message path with a real Blob, and the speed.
// Exit code 1 on any difference.
//
// Usage: node tools/test-sha256.mjs [MB for the speed test, default 512]

import { readFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import vm from "node:vm";

const html = readFileSync(new URL("../web/app.html", import.meta.url), "utf8");
const m = /<script type="text\/plain" id="hash-worker">([\s\S]*?)<\/script>/.exec(html);
if (!m) { console.log("FAIL: script#hash-worker not found"); process.exit(1); }

const posted = [];
const ctx = { self: { postMessage: (x) => posted.push(x) }, Uint8Array, Int32Array, Math, Array, Map, Date, String };
vm.createContext(ctx);
vm.runInContext(m[1] + "\n;self.Sha256 = Sha256;", ctx);
const Sha256 = ctx.self.Sha256;

const nodeHex = (buf) => createHash("sha256").update(buf).digest("hex");
const ourHex = (buf, pieces) => {
  const h = new Sha256();
  let pos = 0;
  for (const len of pieces) { h.update(new Uint8Array(buf.buffer, buf.byteOffset + pos, len)); pos += len; }
  return h.hex();
};
let problems = 0;
const check = (label, got, want) => { if (got !== want) { problems++; console.log(`FAIL ${label}: got ${got}, want ${want}`); } };

check("abc", ourHex(Buffer.from("abc"), [3]), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
check("empty", ourHex(Buffer.alloc(0), []), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");

let cases = 0;
const lengths = [];
for (let n = 0; n <= 300; n++) lengths.push(n);
lengths.push(1000, 4095, 4096, 4097, 65535, 65536, 65537, 1_000_003, 3 * 1024 * 1024 + 17);
for (const n of lengths) {
  const buf = randomBytes(n), want = nodeHex(buf);
  check(`len ${n}, one piece`, ourHex(buf, n ? [n] : []), want);
  for (let r = 0; r < 3; r++) {
    const pieces = []; let left = n;
    while (left > 0) { const p = Math.min(left, 1 + Math.floor(Math.random() * (r === 0 ? 7 : r === 1 ? 130 : 70000))); pieces.push(p); left -= p; }
    check(`len ${n}, ${pieces.length} pieces`, ourHex(buf, pieces), want);
    cases++;
  }
  cases++;
}
console.log(`${cases} length/piece cases checked`);

// The worker path: a Blob read in 16 MB slices, as the page reads a file from disk.
const big = randomBytes(40 * 1024 * 1024 + 123);
await ctx.self.onmessage({ data: { id: 7, file: new Blob([big]) } });
const end = posted.find((x) => x.id === 7 && (x.hex || x.error));
check("worker with a 40 MB Blob", end && end.hex, nodeHex(big));
console.log(`worker: ${posted.filter((x) => x.done).length} progress messages, result ${end && (end.hex || end.error)}`);

// Speed: how long a big model file would take (the disk read comes on top).
const mb = Number(process.argv[2] || 512), chunk = randomBytes(16 * 1024 * 1024);
const h = new Sha256(), t0 = performance.now();
for (let done = 0; done < mb; done += 16) h.update(chunk);
h.hex();
const s = (performance.now() - t0) / 1000;
console.log(`speed: ${mb} MB in ${s.toFixed(2)} s = ${(mb / s).toFixed(0)} MB/s (a 15 GB file: about ${(15360 / (mb / s)).toFixed(0)} s)`);

if (problems) { console.log(`\n${problems} problems.`); process.exit(1); }
console.log("\nSHA-256 matches Node's crypto in every case.");
