// runtime/session.ts: session state, start/stop/restart/logout, QR and pairing code, webhook events, screenshot. The SQL runs on PGlite; WAHA is a fake.
import test, { before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";

let tmp, plugin, migrations, session, shared;
const bundle = async (name, src) => {
  const out = join(tmp, name);
  await build({ entryPoints: [new URL(src, import.meta.url).pathname], bundle: true, format: "esm", platform: "node", outfile: out, external: ["node:*"], logLevel: "silent" });
  return import(pathToFileURL(out).href);
};
before(async () => {
  tmp = mkdtempSync(join(tmpdir(), "waha-session-"));
  plugin = (await bundle("rt.mjs", "../runtime/index.ts")).default;
  ({ migrations } = await bundle("mig.mjs", "../runtime/migrations.ts"));
  session = await bundle("session.mjs", "../runtime/session.ts");
  // One database for the file (creating one per test is slow); the routes under test keep their state in kv, which is per harness.
  shared = new PGlite();
  for (const m of migrations) await shared.exec(m.sql.replaceAll("{{p}}", ""));
});
after(async () => { await shared.close(); rmSync(tmp, { recursive: true, force: true }); });
afterEach(async () => { await plugin.stop(); });

const ME = { id: "5511987654321@c.us", pushName: "Zoe Shop" };
const WANTED = [];
/** `waha(req)` gets { method, path, query, body, headers } and answers { status, json } (or throws for a network error). Records every request in `calls`. */
async function harness(waha) {
  const db = shared;
  const routes = {}, events = [], calls = [], kv = new Map();
  let webhook;
  const ctx = {
    httpError: (status, code, message) => Object.assign(new Error(message), { status, code }),
    installOwner: async () => "u1",
    settings: { get: async () => ({ baseUrl: "https://waha.example.com", session: "default" }) },
    kv: { get: async (_u, k) => kv.get(k), set: async (_u, k, v) => { kv.set(k, v); } },
    secrets: { getInstall: async () => "key" },
    fetchUserUrl: async (_u, url, init) => {
      const u = new URL(url);
      const req = { method: init?.method ?? "GET", path: u.pathname, query: Object.fromEntries(u.searchParams), body: init?.body ? JSON.parse(init.body) : undefined, headers: init?.headers ?? {} };
      calls.push(req);
      const res = (await waha(req)) ?? { status: 404, json: {} };
      return { ok: res.status >= 200 && res.status < 300, status: res.status, json: () => res.json, bytes: new Uint8Array(), headers: {} };
    },
    fetch: async () => ({ ok: false, status: 404, bytes: new Uint8Array(), headers: {} }),
    db: { query: async (sql, params) => { const r = await db.query(sql.replaceAll("{{p}}", ""), params); return { rows: r.rows, rowCount: r.rows.length || r.affectedRows || 0 }; } },
    events: { publish: (_u, name, data) => events.push({ name, ...data }) }, toast() {}, log: { warn() {}, info() {}, debug() {}, error() {} },
    approvals: { request: async () => "approved" },
    routes: { get: (p, h) => (routes["GET " + p] = h), post: (p, h) => (routes["POST " + p] = h) },
    internalRoutes: { call() {} },
    webhooks: { on: (_n, h) => { webhook = h; } },
  };
  plugin.start(ctx);
  const call = (route, { userId = "u1", query = {}, body } = {}) => routes[route]({ userId, query, body });
  return { routes, events, calls, kv, call, hook: (event, payload, extra = {}) => webhook({ json: () => ({ event, session: "default", payload, ...extra }), rawBody: new Uint8Array(), headers: {} }) };
}
const fail = async (p) => { try { await p; } catch (e) { return e; } assert.fail("expected an error"); };
const find = (h, method, path) => h.calls.filter((c) => c.method === method && c.path === path);
const ok = (json = {}) => ({ status: 200, json });

const FULL = (events) => ({ name: "default", status: "WORKING", me: ME, engine: { engine: "GOWS" }, config: { proxy: null, debug: false, webhooks: [{ url: "https://hook.example/a", events, hmac: "secret", retries: { delaySeconds: 2 } }, { url: "https://other.example/x", events: ["message"] }] } });

const ROUTES = [["GET /session"], ["POST /session/start"], ["POST /session/stop"], ["POST /session/restart"], ["POST /session/logout"], ["GET /session/qr"], ["POST /session/pair-code", { phone: "+5511987654321" }], ["GET /session/screenshot"], ["POST /session/webhook-events"]];

test("every route: a non-owner gets 403 and WAHA is never called", async () => {
  const h = await harness(async () => ok());
  for (const [route, body] of ROUTES) { const e = await fail(h.call(route, { userId: "u2", body })); assert.equal(e.status, 403, route); }
  assert.equal(h.calls.length, 0);
});

test("GET /session: WORKING, engine, account, webhook events that are missing", async () => {
  const h = await harness(async () => ok(FULL(["message.any", "session.status"])));
  const r = await h.call("GET /session");
  assert.equal(r.status, "WORKING"); assert.equal(r.engine, "GOWS");
  assert.deepEqual(r.me, { name: "Zoe Shop", phone: "5511987654321" });
  assert.equal(r.webhook.configured, true);
  assert.deepEqual(r.webhook.events, ["message.any", "session.status"]);
  assert.deepEqual(r.webhook.missingEvents, session.WANTED_EVENTS.filter((e) => e !== "message.any" && e !== "session.status"));
  assert.equal(find(h, "GET", "/api/sessions/default").length, 1);
  assert.deepEqual((await h.kv.get("me")).id, "5511987654321@c.us");
  assert.ok(!JSON.stringify(r).includes("hook.example") && !JSON.stringify(r).includes("secret"), "webhook url and hmac never leave the runtime");
});

test("GET /session: '*' covers every event; no webhook entry gives null (env webhooks are invisible)", async () => {
  const h = await harness(async () => ok(FULL(["*"])));
  assert.deepEqual((await h.call("GET /session")).webhook.missingEvents, []);
  const s = { name: "default", status: "SCAN_QR_CODE", engine: { engine: "NOWEB" }, config: { webhooks: [] } };
  const h2 = await harness(async () => ok(s));
  const r = await h2.call("GET /session");
  assert.equal(r.webhook, null); assert.equal(r.status, "SCAN_QR_CODE"); assert.equal(r.engine, "NOWEB"); assert.equal(r.me, null);
  assert.deepEqual(r.wantedEvents, session.WANTED_EVENTS);
});

test("GET /session: 404 MISSING, 401 UNAUTHORIZED, network error and 500 UNREACHABLE, unknown status STOPPED", async () => {
  let mode = 404;
  const h = await harness(async () => { if (mode === "net") throw new Error("ECONNREFUSED"); return mode === "weird" ? ok({ status: "SOMETHING" }) : { status: mode, json: {} }; });
  assert.equal((await h.call("GET /session")).status, "MISSING");
  mode = 401; assert.equal((await h.call("GET /session")).status, "UNAUTHORIZED");
  mode = "net"; assert.equal((await h.call("GET /session")).status, "UNREACHABLE");
  mode = 500; assert.equal((await h.call("GET /session")).status, "UNREACHABLE");
  mode = "weird"; assert.equal((await h.call("GET /session")).status, "STOPPED");
  for (const s of ["PASSKEY_REQUIRED", "PASSKEY_CONFIRMATION_REQUIRED", "FAILED", "STARTING"]) { mode = "x"; const h2 = await harness(async () => ok({ status: s })); assert.equal((await h2.call("GET /session")).status, s); }
});

test("POST /session/start: creates a missing session, starts an existing one", async () => {
  let exists = false;
  const h = await harness(async (r) => (r.method === "GET" ? (exists ? ok({ status: "STOPPED" }) : { status: 404, json: {} }) : ok({})));
  assert.deepEqual(await h.call("POST /session/start"), { ok: true });
  const created = find(h, "POST", "/api/sessions");
  assert.equal(created.length, 1); assert.deepEqual(created[0].body, { name: "default", start: true });
  assert.equal(created[0].headers["X-Api-Key"], "key");
  exists = true; h.calls.length = 0;
  await h.call("POST /session/start");
  assert.equal(find(h, "POST", "/api/sessions/default/start").length, 1); assert.equal(find(h, "POST", "/api/sessions").length, 0);
});

test("POST /session/stop, restart, logout hit the right endpoint; stop is announced", async () => {
  const h = await harness(async () => ok({}));
  for (const a of ["stop", "restart", "logout"]) { assert.deepEqual(await h.call("POST /session/" + a), { ok: true }); assert.equal(find(h, "POST", `/api/sessions/default/${a}`).length, 1, a); }
  assert.deepEqual(h.events, [{ name: "session", status: "STOPPED" }]);
});

test("GET /session/qr: raw value; 422 is 409 not_scanning; image fallback when raw is not available", async () => {
  let mode = "raw";
  const h = await harness(async (r) => {
    if (mode === "raw") return ok({ value: "2@abc,def,ghi" });
    if (mode === "idle") return { status: 422, json: {} };
    return r.query.format === "raw" ? { status: 400, json: {} } : ok({ mimetype: "image/png", data: "iVBORw0KGgo=" });
  });
  assert.deepEqual(await h.call("GET /session/qr"), { value: "2@abc,def,ghi" });
  assert.deepEqual(h.calls[0].query, { format: "raw" }); assert.equal(h.calls[0].path, "/api/default/auth/qr");
  mode = "image"; h.calls.length = 0;
  assert.deepEqual(await h.call("GET /session/qr"), { image: "data:image/png;base64,iVBORw0KGgo=" });
  assert.equal(h.calls.length, 2); assert.equal(h.calls[1].headers.Accept, "application/json"); assert.equal(h.calls[1].query.format, undefined);
  mode = "idle";
  const e = await fail(h.call("GET /session/qr"));
  assert.equal(e.status, 409); assert.equal(e.code, "not_scanning");
});

test("POST /session/pair-code: digits go to WAHA, the code comes back as ABCD-ABCD", async () => {
  const h = await harness(async () => ok({ code: "wxyz1234" }));
  assert.deepEqual(await h.call("POST /session/pair-code", { body: { phone: "+55 (11) 98765-4321" } }), { code: "WXYZ-1234" });
  const c = find(h, "POST", "/api/default/auth/request-code");
  assert.equal(c.length, 1); assert.deepEqual(c[0].body, { phoneNumber: "5511987654321" });
  for (const phone of ["", "abc", "123", undefined, 5]) assert.equal((await fail(h.call("POST /session/pair-code", { body: { phone } }))).status, 400, String(phone));
  assert.equal(h.calls.length, 1);
  const bad = await harness(async () => ok({ code: "x" }));
  assert.equal((await fail(bad.call("POST /session/pair-code", { body: { phone: "+5511987654321" } }))).status, 502);
});

test("GET /session/screenshot: WEBJS only", async () => {
  let engine = "WEBJS";
  const h = await harness(async (r) => (r.path === "/api/screenshot" ? ok({ mimetype: "image/png", data: "AAAA" }) : ok({ status: "WORKING", engine: { engine } })));
  assert.deepEqual(await h.call("GET /session/screenshot"), { image: "data:image/png;base64,AAAA" });
  assert.equal(find(h, "GET", "/api/screenshot")[0].query.session, "default");
  const h2 = await harness(async (r) => (r.path === "/api/screenshot" ? ok({ mimetype: "image/png", data: "AAAA" }) : ok({ status: "WORKING", engine: { engine: "NOWEB" } })));
  const e = await fail(h2.call("GET /session/screenshot"));
  assert.equal(e.status, 501); assert.equal(e.code, "unsupported");
  assert.equal(find(h2, "GET", "/api/screenshot").length, 0);
  void engine;
});

test("POST /session/webhook-events: PUTs the same config with only that entry's events extended", async () => {
  const have = ["message.any", "session.status", "message"];
  const h = await harness(async (r) => (r.method === "GET" ? ok(FULL(have)) : ok({})));
  const r = await h.call("POST /session/webhook-events");
  assert.deepEqual(r.added, session.WANTED_EVENTS.filter((e) => e !== "message.any" && e !== "session.status"));
  const put = find(h, "PUT", "/api/sessions/default");
  assert.equal(put.length, 1);
  const want = FULL(have).config;
  want.webhooks[0].events = [...have, ...r.added];
  assert.deepEqual(put[0].body, { config: want });
  assert.deepEqual(h.events, [{ name: "session", status: "STARTING" }]);
});

test("POST /session/webhook-events: nothing to add sends nothing; no webhook entry is 409 no_webhook", async () => {
  const h = await harness(async () => ok(FULL(["*"])));
  assert.deepEqual(await h.call("POST /session/webhook-events"), { ok: true, added: [] });
  assert.equal(find(h, "PUT", "/api/sessions/default").length, 0);
  const none = await harness(async () => ok({ status: "WORKING", config: {} }));
  const e = await fail(none.call("POST /session/webhook-events"));
  assert.equal(e.status, 409); assert.equal(e.code, "no_webhook");
});

test("WAHA 501 is 501 unsupported; WAHA down is 502; a 422 is session_not_ready", async () => {
  const unsupported = await harness(async (r) => (r.method === "GET" && r.path === "/api/sessions/default" ? ok({ status: "WORKING", engine: { engine: "WEBJS" } }) : { status: 501, json: {} }));
  for (const [route, body] of ROUTES.filter(([r]) => r !== "GET /session" && !/webhook-events/.test(r))) { const e = await fail(unsupported.call(route, { body })); assert.equal(e.status, 501, route); assert.equal(e.code, "unsupported", route); }
  const down = await harness(async () => { throw new Error("ECONNREFUSED"); });
  for (const [route, body] of ROUTES.filter(([r]) => r !== "GET /session")) { const e = await fail(down.call(route, { body })); assert.equal(e.status, 502, route); assert.ok(!/waha\.example|ECONNREFUSED|key/.test(e.message), route); }
  const notReady = await harness(async () => ({ status: 422, json: {} }));
  const e = await fail(notReady.call("POST /session/pair-code", { body: { phone: "+5511987654321" } }));
  assert.equal(e.status, 409); assert.equal(e.code, "session_not_ready");
});

test("webhook session.status is pushed to the UI; WORKING refreshes the account in the background", async () => {
  const h = await harness(async (r) => (r.path === "/api/sessions/default" ? ok({ status: "WORKING", me: ME }) : ok({})));
  await h.hook("session.status", { name: "default", status: "SCAN_QR_CODE" });
  assert.deepEqual(h.events, [{ name: "session", status: "SCAN_QR_CODE" }]);
  await h.hook("session.status", { name: "default", status: "WORKING" }, { me: ME });
  assert.deepEqual(h.events.at(-1), { name: "session", status: "WORKING" });
  await plugin.stop();
  assert.ok(find(h, "GET", "/api/sessions/default").length >= 1, "identity.ensure asked WAHA about the account");
  await h.hook("session.status", { name: "default" });
  assert.equal(h.events.filter((e) => e.name === "session").length, 2, "a status-less event is ignored");
});
