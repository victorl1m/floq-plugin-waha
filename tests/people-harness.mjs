// Shared by tests/{chats,contacts,groups}.test.mjs: the people routes on an in-memory Postgres (PGlite) with a fake PluginContext and a fake WAHA.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";

export const PN = "5534999990000@c.us", LID = "123456789012345@lid", GROUP = "120363041234567890@g.us";
export const ME = "5511000000000@c.us", MELID = "999999999999@lid";
let tmp, plugin, migrations, shared;
const open = [];
const bundle = async (name, src) => {
  const out = join(tmp, name);
  await build({ entryPoints: [new URL(src, import.meta.url).pathname], bundle: true, format: "esm", platform: "node", outfile: out, external: ["node:*"], logLevel: "silent" });
  return import(pathToFileURL(out).href);
};
export async function setup() {
  tmp = mkdtempSync(join(tmpdir(), "waha-people-"));
  plugin = (await bundle("entry.mjs", "./people-entry.ts")).default;
  ({ migrations } = await bundle("mig.mjs", "../runtime/migrations.ts"));
}
export async function teardown() { await plugin.stop(); }
export async function cleanup() { await shared?.close(); rmSync(tmp, { recursive: true, force: true }); }

/** waha(method, path, body, query) answers a WAHA request: { status, json } or undefined (404). Every request is recorded in `calls`. */
export async function harness({ waha, owner = "u1" } = {}) {
  // One database per test file (creating one is slow): every table is emptied for each harness.
  if (!shared) { shared = new PGlite(); for (const m of migrations) await shared.exec(m.sql.replaceAll("{{p}}", "")); }
  const db = shared;
  const tables = (await db.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")).rows.map((r) => r.tablename);
  await db.exec("TRUNCATE " + tables.join(", "));
  const routes = {}, events = [], calls = [], kv = new Map([["phone", "+" + ME.split("@")[0]]]), toasts = [];
  let webhook;
  const ctx = {
    httpError: (status, code, message) => Object.assign(new Error(message), { status, code }),
    installOwner: async () => owner,
    settings: { get: async () => ({ baseUrl: "https://waha.example.com" }) },
    kv: { get: async (_u, k) => kv.get(k), set: async (_u, k, v) => { kv.set(k, v); } },
    secrets: { getInstall: async () => "key" },
    fetchUserUrl: async (_u, url, init) => {
      const u = new URL(url), body = init?.body ? JSON.parse(init.body) : undefined;
      const call = { method: init?.method ?? "GET", path: u.pathname + (u.search ? "?" + decodeURIComponent(u.search.slice(1)) : ""), rawPath: u.pathname, query: Object.fromEntries(u.searchParams), body };
      calls.push(call);
      const r = (waha ? await waha(call) : undefined) ?? { status: 404, json: {} };
      if (r.status === 0) throw new Error("network");
      return { ok: r.status >= 200 && r.status < 300, status: r.status, json: () => r.json, bytes: new Uint8Array(), headers: {} };
    },
    fetch: async () => ({ ok: false, status: 404, bytes: new Uint8Array(), headers: {} }),
    db: { query: async (sql, params) => { const r = await db.query(sql.replaceAll("{{p}}", ""), params); return { rows: r.rows, rowCount: r.rows.length || r.affectedRows || 0 }; } },
    events: { publish: (_u, name, data) => events.push({ name, ...data }) }, toast: (_u, t) => toasts.push(t), log: { warn() {}, info() {}, debug() {}, error() {} },
    approvals: { request: async () => "approved" },
    routes: { get: (p, h) => (routes["GET " + p] = h), post: (p, h) => (routes["POST " + p] = h) },
    internalRoutes: { call() {} },
    webhooks: { on: (_n, h) => { webhook = h; } },
  };
  plugin.start(ctx);
  let n = 0;
  const h = {
    db, routes, events, calls, kv, toasts,
    /** Calls a route as the owner (or as userId). */
    post: (path, body, userId = "u1") => routes["POST " + path]({ userId, body }),
    get: (path, query = {}, userId = "u1") => routes["GET " + path]({ userId, query }),
    /** Delivers a message webhook; each one is a second after the one before. */
    hook: (payload, extra) => webhook({ json: () => ({ event: "message", session: "default", payload: { timestamp: 1700000000 + ++n, body: "hi", hasMedia: false, fromMe: false, id: `false_${payload.from ?? payload.to}_M${n}`, ...payload }, ...extra }), rawBody: new Uint8Array(), headers: {} }),
    event: (event, payload) => webhook({ json: () => ({ event, session: "default", payload }), rawBody: new Uint8Array(), headers: {} }),
    chats: async () => (await routes["GET /chats"]?.({ userId: "u1", query: {} }))?.chats,
    state: async (chatId) => (await db.query("SELECT * FROM chat_state WHERE chat_id = $1", [chatId])).rows[0],
    /** The WAHA write requests (not GET: those include the inbox's own background lookups) since the last call, as "METHOD path". */
    last: () => calls.splice(0).filter((c) => c.method !== "GET").map((c) => c.method + " " + c.rawPath),
  };
  return h;
}
