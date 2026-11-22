import { PACKAGE_MAX_BYTES, PackageError } from "./package.js";

export const DEFAULT_CATALOG_URL = "https://raw.githubusercontent.com/victorl1m/floq-plugins/main/index.json";
export const PACKAGE_HOST = "github.com";
export const PACKAGE_PATH_PREFIX = "/victorl1m/floq-plugins/releases/download/";
/** A GitHub release download redirects to one of these CDN hosts and nowhere else. */
export const REDIRECT_HOSTS = ["objects.githubusercontent.com", "release-assets.githubusercontent.com"];
export const FETCH_TIMEOUT_MS = 30_000;
export const CATALOG_MAX_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 3;

export class CatalogError extends Error {
  constructor(message: string, readonly status = 502) { super(message); this.name = "CatalogError"; }
}

export interface CatalogEntry {
  id: string; name: string; version: string; apiVersion: number; description: string; icon?: string; scope: "user" | "install";
  secrets: string[]; network: string[]; contributes: string[]; minFloq?: string; package: string; sha256: string;
  /** Optional, from the catalog: a short grouping label for the explorer filter. */
  category?: string;
  /** `owner/repo` of the GitHub release the package comes from (derived from `package`, never trusted from the catalog). Used for the repo avatar. */
  repo?: string;
  /** Optional, from the catalog: the plugin is no longer developed (the text says what replaces it). It is not offered for new installs. */
  deprecated?: string;
}

/** `owner/repo` of a package release URL, or undefined. */
export function repoOfPackage(raw: string): string | undefined {
  try { const m = /^\/([^/]+)\/([^/]+)\/releases\/download\//.exec(new URL(raw).pathname); return m ? `${m[1]}/${m[2]}` : undefined; } catch { return undefined; }
}

type FetchLike = (url: string, init: { redirect: "manual"; signal: AbortSignal; headers?: Record<string, string> }) => Promise<Response>;

/** Same owner, one repo per plugin: `/victorl1m/floq-plugin-<id>/releases/download/`. The owner and repo-name shape are fixed here, not chosen by the catalog. */
const PLUGIN_REPO_PREFIX = /^\/victorl1m\/floq-plugin-[a-z0-9]+(?:-[a-z0-9]+)*\/releases\/download\//;

/** The package URL must be https on github.com under a release path of the floq-plugins catalog repo or of a `floq-plugin-<id>` repo of the same owner. */
export function packageUrlAllowed(raw: string, prefix = PACKAGE_PATH_PREFIX): boolean {
  try {
    const u = new URL(raw);
    const path = u.pathname;
    const location = path.startsWith(prefix) || PLUGIN_REPO_PREFIX.test(path);
    return u.protocol === "https:" && u.hostname === PACKAGE_HOST && !u.username && !u.password && !u.port && location && !path.includes("..");
  } catch { return false; }
}

async function readCapped(res: Response, max: number): Promise<Buffer> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) throw new CatalogError("The download is too large.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (res.body) {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) { await reader.cancel().catch(() => undefined); throw new CatalogError("The download is too large."); }
      chunks.push(value);
    }
  }
  return Buffer.concat(chunks);
}

/** GET with manual redirects: only https redirects to the pinned CDN hosts are followed. 30 s timeout, size cap. */
async function get(fetchImpl: FetchLike, url: string, max: number, allowedHosts: string[], redirectHosts = REDIRECT_HOSTS): Promise<Buffer> {
  let current = url;
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const u = new URL(current);
    if (u.protocol !== "https:" || !(hop === 0 ? allowedHosts : redirectHosts).includes(u.hostname)) throw new CatalogError("That address is not allowed.");
    let res: Response;
    try { res = await fetchImpl(current, { redirect: "manual", signal }); } catch { throw new CatalogError("Could not reach the plugin catalog."); }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new CatalogError("The server sent a bad redirect.");
      try { current = new URL(location, current).toString(); } catch { throw new CatalogError("The server sent a bad redirect."); }
      continue;
    }
    if (!res.ok) throw new CatalogError(`The server answered HTTP ${res.status}.`);
    return readCapped(res, max);
  }
  throw new CatalogError("Too many redirects.");
}

const ID = /^[a-z](?:[a-z0-9]|-(?=[a-z0-9])){1,31}$/;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const strs = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, n).map((x) => x.slice(0, max)) : []);

/** Validates the catalog and drops entries that are malformed or point outside the allowed package location. Never throws for one bad entry. */
export function parseCatalog(bytes: Buffer): CatalogEntry[] {
  let raw: { format?: unknown; plugins?: unknown };
  try { raw = JSON.parse(bytes.toString("utf8")); } catch { throw new CatalogError("The catalog is not valid JSON."); }
  if (!raw || raw.format !== 1 || !Array.isArray(raw.plugins)) throw new CatalogError("The catalog has an unsupported format.");
  const out: CatalogEntry[] = [];
  const seen = new Set<string>();
  for (const p of raw.plugins.slice(0, 200) as Record<string, unknown>[]) {
    if (!p || typeof p !== "object") continue;
    const id = str(p.id, 64), version = str(p.version, 64), sha = str(p.sha256, 64).toLowerCase(), pkg = str(p.package, 2048);
    if (!ID.test(id) || seen.has(id) || !SEMVER.test(version) || !/^[0-9a-f]{64}$/.test(sha) || !packageUrlAllowed(pkg) || p.apiVersion !== 1) continue;
    seen.add(id);
    out.push({ id, name: str(p.name, 80) || id, version, apiVersion: 1, description: str(p.description, 500), icon: str(p.icon, 64) || undefined, scope: p.scope === "install" ? "install" : "user",
      secrets: strs(p.secrets, 32, 64), network: strs(p.network, 32, 253), contributes: strs(p.contributes, 16, 32), minFloq: str(p.minFloq, 32) || undefined, package: pkg, sha256: sha,
      category: str(p.category, 32).trim() || undefined, repo: repoOfPackage(pkg),
      ...(p.deprecated === true ? { deprecated: "This plugin is deprecated." } : str(p.deprecated, 300).trim() ? { deprecated: str(p.deprecated, 300).trim() } : {}) });
  }
  return out;
}

/** A release download of exactly this repository (case as GitHub reports it, compared case-insensitively). */
export function repoDownloadAllowed(raw: string, ref: RepoRef): boolean {
  try {
    const u = new URL(raw);
    const prefix = `/${ref.owner}/${ref.repo}/releases/download/`.toLowerCase();
    return u.protocol === "https:" && u.hostname === PACKAGE_HOST && !u.username && !u.password && !u.port && u.pathname.toLowerCase().startsWith(prefix) && !u.pathname.includes("..");
  } catch { return false; }
}

export const GITHUB_API_HOST = "api.github.com";
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const REPO = /^(?!\.)[A-Za-z0-9._-]{1,100}$/;

export interface RepoRef { owner: string; repo: string }
export interface ReleaseAsset { tag: string; name: string; url: string }

/** `https://github.com/<owner>/<repo>` (optionally with `.git` or a trailing slash). Nothing else is a repository address. */
export function parseRepoUrl(raw: unknown): RepoRef | null {
  if (typeof raw !== "string" || raw.length > 300) return null;
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  if (u.protocol !== "https:" || u.hostname !== PACKAGE_HOST || u.username || u.password || u.port || u.search || u.hash) return null;
  const m = /^\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(u.pathname);
  if (!m || !OWNER.test(m[1]) || !REPO.test(m[2]) || m[2].includes("..")) return null;
  return { owner: m[1], repo: m[2] };
}

export interface CatalogClientOptions { fetchImpl?: FetchLike; catalogUrl?: string }

export class CatalogClient {
  private readonly fetchImpl: FetchLike;
  readonly catalogUrl: string;
  constructor(options: CatalogClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));
    this.catalogUrl = options.catalogUrl ?? process.env.FLOQ_PLUGIN_CATALOG ?? DEFAULT_CATALOG_URL;
  }

  async list(): Promise<CatalogEntry[]> {
    const u = new URL(this.catalogUrl);
    return parseCatalog(await get(this.fetchImpl, this.catalogUrl, CATALOG_MAX_BYTES, [u.hostname]));
  }

  /**
   * The newest published release of a repository and its package asset (`*.floqpkg.json`). Only the release API is asked; a branch or a
   * file in the tree is never fetched. The asset must be a download of that same repository.
   */
  async latestRelease(ref: RepoRef): Promise<ReleaseAsset> {
    const api = `https://${GITHUB_API_HOST}/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/releases/latest`;
    let body: { tag_name?: unknown; assets?: unknown };
    try { body = JSON.parse((await get(this.fetchImpl, api, CATALOG_MAX_BYTES, [GITHUB_API_HOST])).toString("utf8")); }
    catch (error) { if (error instanceof CatalogError && /HTTP 404/.test(error.message)) throw new CatalogError("That repository has no published release.", 404); throw error instanceof CatalogError ? error : new CatalogError("The release information could not be read."); }
    const assets = (Array.isArray(body.assets) ? body.assets : []) as { name?: unknown; browser_download_url?: unknown }[];
    const pkgs = assets.filter((a) => typeof a?.name === "string" && a.name.endsWith(".floqpkg.json"));
    if (pkgs.length !== 1) throw new CatalogError(pkgs.length ? "The release has more than one package file." : "The latest release has no .floqpkg.json package.", 422);
    const url = String(pkgs[0].browser_download_url ?? "");
    if (!repoDownloadAllowed(url, ref)) throw new CatalogError("The package is not hosted in that repository's releases.", 422);
    return { tag: typeof body.tag_name === "string" ? body.tag_name.slice(0, 64) : "", name: String(pkgs[0].name), url };
  }

  /** The raw bytes of a release asset of `ref` (same download rules as catalog packages: https, github.com, pinned CDN redirects, 5 MiB). */
  async downloadAsset(asset: ReleaseAsset, ref: RepoRef): Promise<Buffer> {
    if (!repoDownloadAllowed(asset.url, ref)) throw new PackageError("the package address is not allowed");
    return get(this.fetchImpl, asset.url, PACKAGE_MAX_BYTES, [PACKAGE_HOST]);
  }

  /** The raw bytes of a package (verification against the catalog sha256 happens in `parsePackage`). */
  async download(entry: Pick<CatalogEntry, "package">): Promise<Buffer> {
    if (!packageUrlAllowed(entry.package)) throw new PackageError("the package address is not allowed");
    return get(this.fetchImpl, entry.package, PACKAGE_MAX_BYTES, [PACKAGE_HOST]);
  }
}
