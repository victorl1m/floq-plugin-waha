// ui/qr.ts against the reference `qrcode` package (devDependency) for every mask, and decoded back with jsQR.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import QRCode from "qrcode";
import jsQR from "jsqr";

let tmp, qr;
before(async () => {
  tmp = mkdtempSync(join(tmpdir(), "waha-qr-"));
  const out = join(tmp, "qr.mjs");
  await build({ entryPoints: [new URL("../ui/qr.ts", import.meta.url).pathname], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent" });
  qr = await import(pathToFileURL(out).href);
});
after(() => rmSync(tmp, { recursive: true, force: true }));

const ref = (text, mask) => {
  const q = QRCode.create([{ data: Buffer.from(text, "utf8"), mode: "byte" }], { errorCorrectionLevel: "M", maskPattern: mask });
  const n = q.modules.size;
  return { version: q.version, rows: Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => q.modules.get(y, x) === 1)) };
};
const rand = (n, seed) => { let s = seed; let o = ""; for (let i = 0; i < n; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; o += String.fromCharCode(33 + (s >> 8) % 90); } return o; };
// WAHA's raw value looks like "2@<base64>,<base64>,<base64>,1": about 150 to 250 characters.
const SAMPLES = ["A", "https://wa.me/5511999999999", "héllo wörld ✓ 你好", rand(40, 1), rand(120, 2), rand(180, 3), rand(213, 4), rand(214, 5), rand(251, 6), rand(287, 7), rand(330, 8), rand(500, 9), rand(600, 10)];

test("matrix equals the qrcode package for every mask and sample (versions 1-20)", () => {
  const versions = new Set();
  for (const text of SAMPLES) {
    for (let mask = 0; mask < 8; mask++) {
      const want = ref(text, mask);
      versions.add(want.version);
      assert.deepEqual(qr.qrMatrix(text, { mask }), want.rows, `version ${want.version}, mask ${mask}, ${text.length} chars`);
    }
  }
  assert.ok(versions.has(1) && versions.has(10) && versions.has(12) && [...versions].some((v) => v >= 15), [...versions].join());
});

test("version selection follows the byte capacity of level M", () => {
  assert.equal(qr.qrVersionFor(14), 1); assert.equal(qr.qrVersionFor(15), 2);
  assert.equal(qr.qrVersionFor(213), 10); assert.equal(qr.qrVersionFor(214), 11);
  assert.equal(qr.qrVersionFor(287), 12);
  assert.equal(qr.qrVersionFor(2000), 0);
  assert.throws(() => qr.qrMatrix("x".repeat(2000)), /too long/);
});

test("the automatic mask renders a code that decodes back to the text", () => {
  for (const text of SAMPLES) {
    const m = qr.qrMatrix(text), quiet = 4, scale = 4, side = (m.length + quiet * 2) * scale;
    const px = new Uint8ClampedArray(side * side * 4).fill(255);
    m.forEach((row, y) => row.forEach((dark, x) => {
      if (!dark) return;
      for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) { const i = (((y + quiet) * scale + dy) * side + (x + quiet) * scale + dx) * 4; px[i] = px[i + 1] = px[i + 2] = 0; }
    }));
    const got = jsQR(px, side, side);
    assert.ok(got, `not decodable: ${text.length} chars`);
    assert.equal(got.data, text);
  }
});

test("qrPath draws exactly the dark modules inside the quiet zone", () => {
  const m = qr.qrMatrix("hello");
  const d = qr.qrPath(m, 4);
  let area = 0;
  for (const r of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) { area += Number(r[3]); assert.ok(Number(r[1]) >= 4 && Number(r[2]) >= 4); }
  assert.equal(area, m.flat().filter(Boolean).length);
});
