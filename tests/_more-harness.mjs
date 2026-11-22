// Shared harness of the labels / status / channels / calls / presence tests: the plugin on PGlite with a fake PluginContext and a fake WAHA.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { newDb } from "./_db.mjs";

const bundle = async (tmp, name, src) => {
  const out = join(tmp, name);
  await build({ entryPoints: [new URL(src, import.meta.url).pathname], bundle: true, format: "esm", platform: "node", outfile: out, external: ["node:*"], logLevel: "silent" });
  return import(pathToFileURL(out).href);
};

export async function load() {
  const tmp = mkdtempSync(join(tmpdir(), "waha-more-"));
  const plugin = (await bundle(tmp, "rt.mjs", "../runtime/index.ts")).default;
  const { migrations } = await bundle(tmp, "mig.mjs", "../runtime/migrations.ts");
  // One database per test file (PGlite starts slowly); every harness() empties its tables.
  const db = await newDb();
  for (const m of migrations) await db.exec(m.sql.replaceAll("{{p}}", ""));
  const tables = (await db.query("SELECT tablename FROM pg_tables WHERE schemaname = current_schema()")).rows.map((r) => r.tablename);
  return { plugin, migrations, db, tables, cleanup: async () => { await plugin.stop(); await db.close(); rmSync(tmp, { recursive: true, force: true }); } };
}

export const BASE = "https://waha.example.com";
/**
 * `waha({method, path, query, body})` answers WAHA requests: { status, json } or { status, bytes, mime }; no answer = 404.
 * `path` has the session "default" kept ("/api/default/labels"), query is an object.
 */
export async function harness({ plugin, db, tables }, _open, waha) {
  await plugin.stop();
  await db.exec("TRUNCATE " + tables.join(", "));
  const routes = {}, events = [], raw = [], toasts = [], reqs = [], kv = new Map();
  let webhook, down = false;
  const ctx = {
    httpError: (status, code, message) => Object.assign(new Error(message), { status, code }),
    installOwner: async () => "u1",
    settings: { get: async () => ({ baseUrl: BASE }) },
    kv: { get: async (_u, k) => kv.get(k), set: async (_u, k, v) => { kv.set(k, v); } },
    secrets: { getInstall: async () => "key" },
    fetchUserUrl: async (_u, url, init) => {
      if (down) throw new Error("offline");
      const u = new URL(url);
      const req = { method: init?.method ?? "GET", path: u.pathname, query: Object.fromEntries(u.searchParams), body: init?.body ? JSON.parse(init.body) : undefined };
      reqs.push(req);
      const r = (await waha?.(req)) ?? { status: 404, json: {} };
      return { ok: r.status >= 200 && r.status < 300, status: r.status, json: () => r.json ?? null, bytes: r.bytes ?? new Uint8Array(), headers: { "content-type": r.mime ?? "application/json" } };
    },
    fetch: async () => { throw new Error("no fetch"); },
    db: { query: async (sql, params) => { const r = await db.query(sql.replaceAll("{{p}}", ""), params); return { rows: r.rows, rowCount: r.rows.length || r.affectedRows || 0 }; } },
    events: { publish: (_u, name, data) => { events.push({ name, ...data }); raw.push({ name, data }); } },
    toast: (_u, t) => toasts.push(t), log: { warn() {}, info() {}, debug() {}, error() {} },
    approvals: { request: async () => "approved" },
    routes: { get: (p, h) => (routes["GET " + p] = h), post: (p, h) => (routes["POST " + p] = h) },
    internalRoutes: { call() {} },
    webhooks: { on: (_n, h) => { webhook = h; } },
  };
  plugin.start(ctx);
  let n = 0;
  const h = {
    db, routes, events, raw, toasts, reqs, kv,
    setDown: (v) => { down = v; },
    /** Calls a route as a user (default: the owner). */
    get: (path, query = {}, userId = "u1") => routes["GET " + path]({ userId, query }),
    post: (path, body = {}, userId = "u1") => routes["POST " + path]({ userId, body, query: {} }),
    /** Delivers a WAHA event to the webhook. */
    event: (event, payload, extra = {}) => webhook({ json: () => ({ event, session: "default", me: { id: "5511900000000@c.us", pushName: "Me" }, payload, engine: "NOWEB", ...extra }), rawBody: new Uint8Array(), headers: {} }),
    /** Waits for background work (media downloads) to finish. */
    idle: () => plugin.stop(),
    seq: () => ++n,
    last: (method, pathEnd) => [...reqs].reverse().find((r) => r.method === method && r.path.endsWith(pathEnd)),
  };
  return h;
}

/** Asserts a promise rejects with { status, code? }. */
export async function rejects(assert, p, status, code) {
  await assert.rejects(p, (e) => { assert.equal(e.status, status); if (code) assert.equal(e.code, code); return true; });
}
