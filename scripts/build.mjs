#!/usr/bin/env node
// Builds one `<id>-<version>.floqpkg.json` per plugin into dist/ and regenerates the catalog (index.json).
//   node scripts/build.mjs           build, write dist/*.floqpkg.json, dist/index.json and ./index.json
//   node scripts/build.mjs --check   build, write dist/, and fail if ./index.json differs from what the build produces (CI uses this)
// Format and catalog: Floq's runtime/src/plugins/{package,catalog}.ts (vendored under vendor/floq/ and used by tests/).
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const PACKAGE_MAX_BYTES = 5 * 1024 * 1024;
const SKILL_FILE_BYTES_MAX = 64 * 1024;

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1)).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));

/** Names the UI sources import from each shared specifier, so the shim can re-export exactly those from the host's global. */
function importedNames(uiDir, specifier) {
  const names = new Set();
  const re = new RegExp(`import\\s+(type\\s+)?\\{([^}]*)\\}\\s+from\\s+["']${specifier.replace(/[/@.]/g, "\\$&")}["']`, "g");
  for (const file of walk(uiDir).filter((f) => /\.tsx?$/.test(f))) {
    for (const m of readFileSync(file, "utf8").matchAll(re)) {
      if (m[1]) continue;
      for (const part of m[2].split(",")) {
        const p = part.trim();
        if (!p || p.startsWith("type ")) continue;
        names.add(p.split(/\s+as\s+/)[0].trim());
      }
    }
  }
  return [...names].sort();
}

/**
 * The app owns React, the kit and the SDK and exposes them as `globalThis.__FLOQ_PLUGIN_RT__ = { react, jsx, kit, sdk }`
 * (src/plugins/shared-runtime.ts in Floq). A plugin bundle must not carry its own copy: two Reacts break hooks.
 */
function sharedRuntimePlugin(uiDir) {
  const shims = {
    "react": (names) => `const rt = globalThis.__FLOQ_PLUGIN_RT__.react;\nexport default rt;\n${names.map((n) => `export const ${n} = rt.${n};`).join("\n")}\n`,
    "react/jsx-runtime": () => `const rt = globalThis.__FLOQ_PLUGIN_RT__.jsx;\nexport const jsx = rt.jsx;\nexport const jsxs = rt.jsxs;\nexport const Fragment = rt.Fragment;\n`,
    "@/plugins/kit": (names) => `const rt = globalThis.__FLOQ_PLUGIN_RT__.kit;\n${names.map((n) => `export const ${n} = rt.${n};`).join("\n")}\n`,
    "@/plugins/sdk": (names) => `const rt = globalThis.__FLOQ_PLUGIN_RT__.sdk;\n${names.map((n) => `export const ${n} = rt.${n};`).join("\n")}\n`,
  };
  return {
    name: "floq-shared-runtime",
    setup(b) {
      b.onResolve({ filter: /^(react|react\/jsx-runtime|@\/plugins\/kit|@\/plugins\/sdk)$/ }, (args) => ({ path: args.path, namespace: "floq-shared" }));
      b.onResolve({ filter: /^@tabler\// }, (args) => ({ errors: [{ text: `${args.path} is not shared with plugin bundles: use kit.resolvePluginIcon("IconName")` }] }));
      b.onLoad({ filter: /.*/, namespace: "floq-shared" }, (args) => ({ contents: shims[args.path](importedNames(uiDir, args.path)), loader: "js" }));
    },
  };
}

async function bundleRuntime(entry) {
  const result = await build({
    entryPoints: [entry], bundle: true, write: false, format: "esm", platform: "node", target: "node22", external: ["node:*"], legalComments: "none", metafile: true, logLevel: "silent",
  });
  // Standalone means: no import left except node built-ins.
  for (const out of Object.values(result.metafile.outputs)) {
    const bad = out.imports.filter((i) => !i.path.startsWith("node:"));
    if (bad.length) throw new Error(`${entry}: the runtime bundle imports ${bad.map((i) => i.path).join(", ")}; only node: built-ins may stay external`);
  }
  return result.outputFiles[0].text;
}

async function bundleUi(entry, uiDir) {
  const result = await build({
    entryPoints: [entry], bundle: true, write: false, format: "esm", platform: "browser", target: "es2022", jsx: "automatic", legalComments: "none", metafile: true, logLevel: "silent",
    plugins: [sharedRuntimePlugin(uiDir)],
  });
  for (const out of Object.values(result.metafile.outputs)) if (out.imports.length) throw new Error(`${entry}: the UI bundle has imports left (${out.imports.map((i) => i.path).join(", ")})`);
  return result.outputFiles[0].text;
}

function readSkills(pluginDir) {
  const root = join(pluginDir, "skills");
  const skills = {};
  if (!existsSync(root)) return skills;
  for (const name of readdirSync(root).sort()) {
    const dir = join(root, name);
    if (!statSync(dir).isDirectory()) continue;
    skills[name] = {};
    for (const file of walk(dir)) {
      const text = readFileSync(file, "utf8");
      if (Buffer.byteLength(text) > SKILL_FILE_BYTES_MAX) throw new Error(`${file}: larger than 64 KiB`);
      skills[name][relative(dir, file).split("\\").join("/")] = text;
    }
  }
  return skills;
}

const wantsUi = (manifest) => (manifest.contributes?.views?.length ?? 0) + (manifest.contributes?.rightSidebarTabs?.length ?? 0) > 0;

/** One plugin -> { file, bytes, sha256, entry } */
export async function buildPlugin() {
  const dir = ROOT;
  const manifest = JSON.parse(readFileSync(join(dir, "plugin.json"), "utf8"));
  const id = manifest.id;
  const runtime = await bundleRuntime(join(dir, "runtime", "index.ts"));
  const uiEntry = join(dir, "ui", "index.tsx");
  let ui = null;
  if (wantsUi(manifest)) {
    if (!existsSync(uiEntry)) throw new Error(`${id}: the manifest contributes views but ui/index.tsx is missing`);
    ui = await bundleUi(uiEntry, join(dir, "ui"));
  }
  const pkg = { format: 1, manifest, runtime, ui, skills: readSkills(dir) };
  const bytes = Buffer.from(JSON.stringify(pkg) + "\n");
  if (bytes.length > PACKAGE_MAX_BYTES) throw new Error(`${id}: the package is ${bytes.length} bytes (cap 5 MiB)`);
  const file = `${manifest.id}-${manifest.version}.floqpkg.json`;
  const digest = sha256(bytes);
  const contributes = Object.entries(manifest.contributes ?? {}).filter(([, v]) => (Array.isArray(v) ? v.length > 0 : Boolean(v))).map(([k]) => k);
  const entry = {
    id: manifest.id, name: manifest.name, version: manifest.version, apiVersion: manifest.apiVersion, description: manifest.description, icon: manifest.icon, scope: manifest.scope,
    secrets: (manifest.secrets ?? []).map((s) => s.name), network: manifest.network?.allow ?? [], contributes,
    ...(manifest.minFloq ? { minFloq: manifest.minFloq } : {}),
    package: `https://github.com/victorl1m/floq-plugin-${manifest.id}/releases/download/v${manifest.version}/${file}`, sha256: digest,
  };
  return { file, bytes, sha256: digest, entry };
}

export async function buildAll(outDir = join(ROOT, "dist")) {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const r = await buildPlugin();
  writeFileSync(join(outDir, r.file), r.bytes);
  const entry = JSON.stringify(r.entry, null, 2) + "\n";
  writeFileSync(join(outDir, "catalog-entry.json"), entry);
  return { built: [r], entry };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { built, entry } = await buildAll();
  for (const b of built) console.log(`${b.file}  ${b.bytes.length} bytes  sha256 ${b.sha256}`);
  const target = join(ROOT, "catalog-entry.json");
  if (process.argv.includes("--check")) {
    const committed = existsSync(target) ? readFileSync(target, "utf8") : "";
    if (committed !== entry) { console.error("catalog-entry.json is out of date: run `npm run build` and commit it."); process.exit(1); }
    console.log("catalog-entry.json is up to date");
  } else { writeFileSync(target, entry); console.log("wrote catalog-entry.json"); }
}
