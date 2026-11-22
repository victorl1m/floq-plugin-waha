// Shared test harness: the bundled runtime on an in-memory Postgres (PGlite) with a fake PluginContext and a fake WAHA.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";

let tmp, n = 0;
export async function bundle(src) {
  tmp ??= mkdtempSync(join(tmpdir(), "waha-test-"));
  const out = join(tmp, `b${++n}.mjs`);
  await build({ entryPoints: [new URL(src, import.meta.url).pathname], bundle: true, format: "esm", platform: "node", outfile: out, external: ["node:*"], logLevel: "silent" });
  return import(pathToFileURL(out).href);
}
export const cleanup = () => { if (tmp) rmSync(tmp, { recursive: true, force: true }); tmp = undefined; };

const open = [];
/** Call in afterEach: lets background work finish, then closes every database a test opened. */
export async function closeAll() { for (const h of open.splice(0)) { await h.plugin.stop?.(); await h.db.close(); } }

/**
 * opts.waha(method, path, { query, body, url, headers }) -> { status?, json?, bytes?, headers? } | undefined (undefined = 404).
 * opts.seed runs before `opts.seedBefore` (a migration id; default: after all migrations). opts.settings / opts.phone / opts.owner / opts.approval.
 */
export async function harness(plugin, migrations, opts = {}) {
  const db = new PGlite();
  for (const m of migrations) { if (opts.seed && opts.seedBefore === m.id) await db.exec(opts.seed); await db.exec(m.sql.replaceAll("{{p}}", "")); }
  if (opts.seed && !opts.seedBefore) await db.exec(opts.seed);
  const routes = {}, internal = {}, events = [], toasts = [], requests = [], approvals = [], kv = new Map(Object.entries(opts.kv ?? {}));
  if (opts.phone) kv.set("phone", opts.phone);
  let webhook;
  const respond = (r) => {
    const status = r?.status ?? (r ? 200 : 404), bytes = r?.bytes ?? Buffer.from(JSON.stringify(r?.json ?? {}));
    return { ok: status >= 200 && status < 300, status, headers: r?.headers ?? { "content-type": r?.bytes ? "application/octet-stream" : "application/json" }, bytes, text: () => Buffer.from(bytes).toString("utf8"), json: () => JSON.parse(Buffer.from(bytes).toString("utf8")) };
  };
  const ctx = {
    pluginId: "waha",
    httpError: (status, code, message) => Object.assign(new Error(message), { status, code }),
    installOwner: async () => opts.owner ?? "u1",
    settings: { get: async () => ({ baseUrl: "https://waha.example.com", ...(opts.settings ?? {}) }) },
    kv: { get: async (_u, k) => kv.get(k), set: async (_u, k, v) => { kv.set(k, v); } },
    secrets: { getInstall: async (name) => (name === "WAHA_API_KEY" ? "key" : opts.hmac) },
    fetchUserUrl: async (_u, url, init = {}) => {
      const u = new URL(url), method = init.method ?? "GET";
      const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
      const req = { method, path: decodeURIComponent(u.pathname), query: Object.fromEntries(u.searchParams), body, url, headers: init.headers ?? {} };
      requests.push(req);
      if (opts.down) throw new Error("ECONNREFUSED");
      const answer = opts.waha ? await opts.waha(method, req.path, req) : undefined;
      // Sends succeed by default, with a WEBJS-style id.
      if (answer === undefined && method === "POST" && /^\/api\/(send[A-Z]\w*|forwardMessage)$/.test(req.path)) return respond({ json: { id: `true_${body?.chatId}_OUT${requests.length}` } });
      return respond(answer);
    },
    fetch: async (url) => respond(opts.web ? await opts.web(url) : undefined),
    db: { query: async (sql, params) => { const r = await db.query(sql.replaceAll("{{p}}", ""), params); return { rows: r.rows, rowCount: r.rows.length || r.affectedRows || 0 }; } },
    events: { publish: (_u, name, data) => events.push({ name, ...(data ?? {}) }) },
    toast: (_u, t) => toasts.push(t),
    log: { warn(...a) { if (process.env.WAHA_TEST_LOG) console.log("WARN", ...a); }, info() {}, debug() {}, error(...a) { if (process.env.WAHA_TEST_LOG) console.log("ERROR", ...a); } },
    approvals: { request: async (a) => { approvals.push(a); return opts.approval ?? "approved"; } },
    routes: { get: (p, h) => (routes["GET " + p] = h), post: (p, h) => (routes["POST " + p] = h), put: (p, h) => (routes["PUT " + p] = h), delete: (p, h) => (routes["DELETE " + p] = h) },
    internalRoutes: { call: (p, h) => (internal[p] = h) },
    webhooks: { on: (_n, h) => { webhook = h; } },
    schedule: () => () => undefined,
  };
  plugin.start(ctx);
  let seq = 0;
  const h = {
    plugin, db, ctx, routes, internal, events, toasts, requests, approvals, kv,
    get: (path, query = {}, userId = "u1") => routes["GET " + path]({ userId, query, params: {}, body: undefined }),
    post: (path, body = {}, userId = "u1") => routes["POST " + path]({ userId, query: {}, params: {}, body }),
    call: (path, body = {}, userId = "u1") => internal[path]({ userId, query: {}, params: {}, body }),
    /** Delivers a raw WAHA event. */
    event: (event, payload, extra = {}) => webhook({ json: () => ({ event, session: "default", payload, ...extra }), rawBody: new Uint8Array(), headers: {} }),
    /** Delivers a message event; ids and timestamps count up. */
    message: (payload, extra = {}) => { seq++; return h.event("message.any", { id: `${payload.fromMe ? "true" : "false"}_${payload.fromMe ? payload.to : payload.from}_M${seq}`, timestamp: 1700000000 + seq, body: "hi", hasMedia: false, fromMe: false, ...payload }, extra); },
    chats: async () => (await h.get("/chats")).chats,
    messages: async (chatId, query = {}) => (await h.get("/messages", { chatId, ...query })).messages,
    idle: () => plugin.stop?.(),
    sql: async (q, params) => (await db.query(q, params)).rows,
  };
  open.push(h);
  return h;
}
