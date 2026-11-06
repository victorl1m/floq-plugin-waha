import { createHash } from "node:crypto";
import { ManifestError, parseManifest } from "./manifest.js";
import { PLUGIN_API_VERSION, type PluginManifest } from "./sdk.js";

export const PACKAGE_FORMAT = 1;
export const PACKAGE_MAX_BYTES = 5 * 1024 * 1024;
const SKILL_FILES_MAX = 120;
const SKILL_BYTES_MAX = 512 * 1024;
const SKILL_FILE_BYTES_MAX = 64 * 1024;
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FILE_PART = /^[A-Za-z0-9._ -]{1,100}$/;
const SHA256 = /^[0-9a-f]{64}$/;

/** Any problem with a plugin package. Messages name what is wrong, never echo package content. */
export class PackageError extends Error {
  constructor(message: string) { super(message); this.name = "PackageError"; }
}

export interface CatalogRef { id: string; version: string; sha256: string }

export interface PluginPackage {
  manifest: PluginManifest;
  /** Bundled ESM source of the runtime half (a single file; host services come through `ctx`). */
  runtime: string;
  /** Bundled ESM source of the UI half, or null for plugins that only use the host's generic views. */
  ui: string | null;
  /** skill name -> relative file path -> text */
  skills: Record<string, Record<string, string>>;
  /** sha256 of the exact bytes that were verified. */
  sha256: string;
  size: number;
}

export const sha256Hex = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** Same path rules as `addSkillPackage`: relative, no traversal, no odd characters. */
export function safeSkillPath(path: unknown): path is string {
  if (typeof path !== "string" || !path || path.length > 240 || path.startsWith("/") || path.includes("\\") || path.includes(":") || /[\u0000-\u001f\u007f]/.test(path)) return false;
  return path.split("/").every((p) => FILE_PART.test(p) && p !== "." && p !== ".." && !/[. ]$/.test(p));
}

function parseSkills(raw: unknown, manifest: PluginManifest): Record<string, Record<string, string>> {
  if (raw === undefined || raw === null) raw = {};
  if (typeof raw !== "object" || Array.isArray(raw)) throw new PackageError("skills must be an object");
  const out: Record<string, Record<string, string>> = {};
  for (const [name, files] of Object.entries(raw as Record<string, unknown>)) {
    if (!SKILL_NAME.test(name)) throw new PackageError("a skill name is invalid");
    if (typeof files !== "object" || files === null || Array.isArray(files)) throw new PackageError("a skill must be an object of files");
    const entries = Object.entries(files as Record<string, unknown>);
    if (entries.length < 1 || entries.length > SKILL_FILES_MAX) throw new PackageError(`a skill must have 1-${SKILL_FILES_MAX} files`);
    let total = 0;
    const clean: Record<string, string> = {};
    for (const [path, text] of entries) {
      if (!safeSkillPath(path)) throw new PackageError("a skill file path is unsafe");
      if (typeof text !== "string" || text.includes("\u0000")) throw new PackageError("skill files must be text");
      const size = Buffer.byteLength(text);
      if (size > SKILL_FILE_BYTES_MAX) throw new PackageError("a skill file is larger than 64 KiB");
      total += size;
      clean[path] = text;
    }
    if (total > SKILL_BYTES_MAX) throw new PackageError("a skill is larger than 512 KiB");
    if (!("SKILL.md" in clean)) throw new PackageError("a skill needs a SKILL.md");
    out[name] = clean;
  }
  for (const name of manifest.contributes.skills) if (!(name in out)) throw new PackageError("the manifest declares a skill the package does not contain");
  return out;
}

/**
 * Verifies a downloaded package against its catalog entry, before anything is stored or run:
 * size, sha256 of the exact bytes, JSON shape, manifest validity, id/version/apiVersion, built-in id clash and skill paths.
 */
export function parsePackage(bytes: Uint8Array | string, expected: CatalogRef, options: { builtinIds: ReadonlySet<string> | string[] }): PluginPackage {
  const buf = typeof bytes === "string" ? Buffer.from(bytes) : Buffer.from(bytes);
  if (buf.length > PACKAGE_MAX_BYTES) throw new PackageError("the package is larger than 5 MiB");
  if (!SHA256.test(expected.sha256)) throw new PackageError("the catalog entry has no valid sha256");
  const digest = sha256Hex(buf);
  if (digest !== expected.sha256.toLowerCase()) throw new PackageError("the package does not match the catalog sha256");
  let raw: Record<string, unknown>;
  try { raw = JSON.parse(buf.toString("utf8")) as Record<string, unknown>; } catch { throw new PackageError("the package is not valid JSON"); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new PackageError("the package must be a JSON object");
  const unknown = Object.keys(raw).find((k) => !["format", "manifest", "runtime", "ui", "skills"].includes(k));
  if (unknown !== undefined) throw new PackageError("the package has an unknown key");
  if (raw.format !== PACKAGE_FORMAT) throw new PackageError(`the package format must be ${PACKAGE_FORMAT}`);
  let manifest: PluginManifest;
  try { manifest = parseManifest(raw.manifest); } catch (error) { throw new PackageError("the manifest is invalid: " + (error instanceof ManifestError ? error.message : "unreadable")); }
  if (manifest.apiVersion !== PLUGIN_API_VERSION) throw new PackageError("unsupported plugin apiVersion");
  if (manifest.id !== expected.id) throw new PackageError("the package id does not match the catalog entry");
  if (manifest.version !== expected.version) throw new PackageError("the package version does not match the catalog entry");
  const builtin = options.builtinIds instanceof Set ? options.builtinIds : new Set(options.builtinIds);
  if (builtin.has(manifest.id)) throw new PackageError("this id belongs to a built-in plugin");
  if (typeof raw.runtime !== "string" || !raw.runtime.trim()) throw new PackageError("runtime must be a non-empty string");
  if (raw.ui !== null && raw.ui !== undefined && typeof raw.ui !== "string") throw new PackageError("ui must be a string or null");
  return { manifest, runtime: raw.runtime, ui: typeof raw.ui === "string" && raw.ui.trim() ? raw.ui : null, skills: parseSkills(raw.skills, manifest), sha256: digest, size: buf.length };
}

/** `a` > `b` by semver precedence of the numeric core (pre-release tags sort below the release). */
export function compareVersions(a: string, b: string): number {
  const core = (v: string) => v.split(/[-+]/)[0].split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pa = core(a), pb = core(b);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0) ? 1 : -1;
  const pre = (v: string) => (v.includes("-") ? v.split("-")[1].split("+")[0] : "");
  const x = pre(a), y = pre(b);
  if (x === y) return 0;
  if (!x) return 1;
  if (!y) return -1;
  return x > y ? 1 : -1;
}
