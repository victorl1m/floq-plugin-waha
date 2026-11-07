// Drives the built runtime bundle with a fake PluginContext: send approval toggle, own-number validation, test message, message-me.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

let tmp, plugin, phoneToChatId;
before(async () => {
  tmp = mkdtempSync(join(tmpdir(), "waha-features-"));
  const out = join(tmp, "rt.mjs");
  await build({ entryPoints: [new URL("../runtime/index.ts", import.meta.url).pathname], bundle: true, format: "esm", platform: "node", outfile: out, external: ["node:*"], logLevel: "silent" });
  plugin = (await import(pathToFileURL(out).href)).default;
  const c = join(tmp, "client.mjs");
  await build({ entryPoints: [new URL("../runtime/client.ts", import.meta.url).pathname], bundle: true, format: "esm", platform: "node", outfile: c, external: ["node:*"], logLevel: "silent" });
  ({ phoneToChatId } = await import(pathToFileURL(c).href));
});
after(() => rmSync(tmp, { recursive: true, force: true }));

function harness(settings, decision = "approved", fetchStatus = 200) {
  const routes = {}, internal = {}, sent = [], approvals = [];
  const ctx = {
    httpError: (status, code, message) => Object.assign(new Error(message), { status, code }),
    installOwner: async () => "u1",
    settings: { get: async () => settings },
    secrets: { getInstall: async () => "key" },
    fetchUserUrl: async (_u, url, init) => { sent.push(JSON.parse(init.body)); return { ok: fetchStatus < 400, status: fetchStatus, json: () => ({ id: "m" + sent.length }) }; },
    db: { query: async () => ({ rows: [], rowCount: 1 }) },
    events: { publish() {} }, toast() {}, log: { warn() {}, info() {}, debug() {}, error() {} },
    approvals: { request: async (a) => { approvals.push(a); return decision; } },
    routes: { get: (p, h) => (routes["GET " + p] = h), post: (p, h) => (routes["POST " + p] = h) },
    internalRoutes: { call: (p, h) => (internal[p] = h) },
    webhooks: { on() {} },
  };
  plugin.start(ctx);
  return { routes, internal, sent, approvals };
}
const base = { baseUrl: "https://waha.example.com" };
const call = (h, body) => h({ userId: "u1", body, query: {} });

test("phone validation: E.164 only", () => {
  assert.equal(phoneToChatId("+5511999999999"), "5511999999999@c.us");
  assert.equal(phoneToChatId(" +55 (11) 99999-9999 "), "5511999999999@c.us");
  for (const bad of ["5511999999999", "+0123456789", "+12", "+1234567890123456", "+55abc", "", null, "+55 11 9999; DROP"]) assert.equal(phoneToChatId(bad), null, String(bad));
});

test("default: agent send waits for approval; denied sends nothing", async () => {
  const h = harness(base, "denied");
  assert.deepEqual(await call(h.internal["/send"], { chatId: "551100000000@c.us", text: "hi" }), { status: "denied" });
  assert.equal(h.approvals.length, 1); assert.equal(h.sent.length, 0);
});

test("alwaysAllowSend=true skips approval; false/absent does not", async () => {
  const on = harness({ ...base, alwaysAllowSend: true });
  assert.equal((await call(on.internal["/send"], { chatId: "551100000000@c.us", text: "hi" })).status, "sent");
  assert.equal(on.approvals.length, 0); assert.equal(on.sent.length, 1);
  const off = harness({ ...base, alwaysAllowSend: false });
  await call(off.internal["/send"], { chatId: "551100000000@c.us", text: "hi" });
  assert.equal(off.approvals.length, 1);
});

test("test message goes to the saved number; invalid or missing number is a 400", async () => {
  const h = harness({ ...base, assistantPhone: "+5511999999999" });
  assert.equal((await call(h.routes["POST /test-message"], {})).status, "sent");
  assert.equal(h.sent[0].chatId, "5511999999999@c.us");
  await assert.rejects(call(h.routes["POST /test-message"], { phone: "123" }), { status: 400, code: "invalid_phone" });
  await assert.rejects(call(harness(base).routes["POST /test-message"], {}), { status: 400, code: "no_phone" });
});

test("test message surfaces a WAHA failure as 502", async () => {
  const h = harness({ ...base, assistantPhone: "+5511999999999" }, "approved", 500);
  await assert.rejects(call(h.routes["POST /test-message"], {}), { status: 502 });
});

test("message-me needs a number, sends without approval, and is rate limited", async () => {
  await assert.rejects(call(harness(base).internal["/message-me"], { text: "x" }), { status: 409 });
  const h = harness({ ...base, assistantPhone: "+5511999999999" });
  for (let i = 0; i < 10; i++) assert.equal((await call(h.internal["/message-me"], { text: "x" })).status, "sent");
  assert.equal(h.approvals.length, 0);
  await assert.rejects(call(h.internal["/message-me"], { text: "x" }), { status: 429 });
  assert.deepEqual(await call(h.internal["/me"], {}), { canMessageMe: true, sendNeedsApproval: true });
});
