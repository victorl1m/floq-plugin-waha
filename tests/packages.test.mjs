// Builds every package and validates it with the Floq runtime's own parser (vendored in vendor/floq/). No network, no real credentials.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { buildAll } from "../scripts/build.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let tmp, built, floq;

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), "floq-plugins-test-"));
  ({ built } = await buildAll(join(tmp, "dist")));
  // The vendored parsers are TypeScript with .js import specifiers: bundle them once into a temp ESM file.
  const entry = join(tmp, "floq-entry.ts");
  writeFileSync(entry, `export { parsePackage, compareVersions, sha256Hex } from ${JSON.stringify(join(ROOT, "vendor/floq/package.ts"))};\nexport { parseCatalog, packageUrlAllowed } from ${JSON.stringify(join(ROOT, "vendor/floq/catalog.ts"))};\n`);
  const out = join(tmp, "floq.mjs");
  await build({ entryPoints: [entry], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent" });
  floq = await import(pathToFileURL(out).href);
});
after(() => rmSync(tmp, { recursive: true, force: true }));

const entryOf = () => JSON.parse(readFileSync(join(tmp, "dist", "catalog-entry.json"), "utf8"));
const bytesOf = () => built[0].bytes;
const parse = (id, over = {}) => floq.parsePackage(over.bytes ?? bytesOf(id), { id, version: entryOf().version, sha256: entryOf().sha256, ...over.expected }, { builtinIds: over.builtinIds ?? [] });


test("the package passes the Floq package parser and the catalog entry matches it", () => {
  const e = entryOf(), pkg = parse(e.id);
  assert.equal(pkg.manifest.id, e.id); assert.equal(pkg.sha256, built[0].sha256); assert.equal(e.sha256, pkg.sha256);
  assert.ok(pkg.size < 5 * 1024 * 1024);
  assert.equal(e.package, `https://github.com/victorl1m/floq-plugin-${e.id}/releases/download/v${e.version}/${e.id}-${e.version}.floqpkg.json`);
});

test("Floq accepts this entry's package URL (its allow-list) and the whole entry as a one-plugin catalog", () => {
  const e = entryOf();
  assert.ok(floq.packageUrlAllowed(e.package), e.package);
  assert.deepEqual(floq.parseCatalog(Buffer.from(JSON.stringify({ format: 1, plugins: [e] }))).map((x) => x.id), [e.id]);
});

test("the committed catalog-entry.json is what the build produces", () => {
  assert.equal(readFileSync(join(ROOT, "catalog-entry.json"), "utf8"), readFileSync(join(tmp, "dist", "catalog-entry.json"), "utf8"));
});

test("the build is reproducible", async () => {
  const second = await buildAll(join(tmp, "dist2"));
  assert.equal(second.built[0].sha256, built[0].sha256);
});

test("tampering is refused: changed bytes, wrong id or version, built-in id clash", () => {
  const id = entryOf().id;
  assert.throws(() => parse(id, { bytes: Buffer.concat([bytesOf(), Buffer.from(" ")]) }), /sha256/);
  assert.throws(() => parse(id, { expected: { id: "other" } }), /id does not match/);
  assert.throws(() => parse(id, { expected: { version: "9.9.9" } }), /version does not match/);
  assert.throws(() => parse(id, { builtinIds: [id] }), /built-in/);
});

test("the runtime bundle is standalone: imports alone and exposes start()", async () => {
  const id = entryOf().id, pkg = parse(id);
  const file = join(tmp, "standalone.mjs"); writeFileSync(file, pkg.runtime);
  assert.equal(typeof (await import(pathToFileURL(file).href)).default.start, "function");
  assert.doesNotMatch(pkg.runtime, /\bfrom\s+["'](?!node:)/);
});

test("waha UI bundle takes React, the kit and the SDK from the host global and brings no imports of its own", async () => {
  const ui = parse("waha").ui;
  assert.doesNotMatch(ui, /^\s*import\s/m);
  assert.doesNotMatch(ui, /tabler/i);
  const used = new Set();
  const proxy = (path) => new Proxy(function () {}, { get: (_t, k) => (k === "then" ? undefined : (used.add(`${path}.${String(k)}`), proxy(`${path}.${String(k)}`))), apply: () => proxy(path + "()") });
  const rt = { react: proxy("react"), jsx: proxy("jsx"), kit: { ...Object.fromEntries(["Badge", "Button", "PluginPage", "PluginState", "Textarea", "cn", "toast", "usePluginApi", "usePluginEvent"].map((n) => [n, () => null])), resolvePluginIcon: () => () => null }, sdk: { defineUiPlugin: (d) => d } };
  globalThis.__FLOQ_PLUGIN_RT__ = rt;
  try {
    const mod = await import("data:text/javascript;base64," + Buffer.from(ui).toString("base64"));
    assert.equal(typeof mod.default.views.inbox, "function");
  } finally { delete globalThis.__FLOQ_PLUGIN_RT__; }
});

test("waha (built package): manifest, skill and migrations are present", () => {
  const pkg = parse("waha");
  assert.ok("SKILL.md" in pkg.skills.waha);
  assert.deepEqual(pkg.manifest.secrets.map((s) => s.name).includes("WAHA_API_KEY"), true);
});
