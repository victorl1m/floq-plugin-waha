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
}

type FetchLike = (url: string, init: { redirect: "manual"; signal: AbortSignal; headers?: Record<string, string> }) => Promise<Response>;

/** The package URL must be https on github.com under the floq-plugins release path (a fixed prefix, not a pattern the catalog controls). */
export function packageUrlAllowed(raw: string, prefix = PACKAGE_PATH_PREFIX): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && u.hostname === PACKAGE_HOST && !u.username && !u.password && !u.port && u.pathname.startsWith(prefix) && !u.pathname.includes("..");
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
      secrets: strs(p.secrets, 32, 64), network: strs(p.network, 32, 253), contributes: strs(p.contributes, 16, 32), minFloq: str(p.minFloq, 32) || undefined, package: pkg, sha256: sha });
  }
  return out;
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

  /** The raw bytes of a package (verification against the catalog sha256 happens in `parsePackage`). */
  async download(entry: Pick<CatalogEntry, "package">): Promise<Buffer> {
    if (!packageUrlAllowed(entry.package)) throw new PackageError("the package address is not allowed");
    return get(this.fetchImpl, entry.package, PACKAGE_MAX_BYTES, [PACKAGE_HOST]);
  }
}
