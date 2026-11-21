// Inbox data: webhook parsing (names, phones, group participants), the enriched /chats and /messages, /read, contacts upsert, migration 002.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";

let tmp, plugin, parseWebhook, migrations;
const bundle = async (name, src) => {
  const out = join(tmp, name);
  await build({ entryPoints: [new URL(src, import.meta.url).pathname], bundle: true, format: "esm", platform: "node", outfile: out, external: ["node:*"], logLevel: "silent" });
  return import(pathToFileURL(out).href);
};
before(async () => {
  tmp = mkdtempSync(join(tmpdir(), "waha-inbox-"));
  plugin = (await bundle("rt.mjs", "../runtime/index.ts")).default;
  ({ parseWebhook } = await bundle("client.mjs", "../runtime/client.ts"));
  ({ migrations } = await bundle("mig.mjs", "../runtime/migrations.ts"));
});
after(() => rmSync(tmp, { recursive: true, force: true }));

function harness(rowsFor = () => []) {
  const routes = {}, internal = {}, queries = [], toasts = [];
  let webhook;
  const ctx = {
    httpError: (status, code, message) => Object.assign(new Error(message), { status, code }),
    installOwner: async () => "u1",
    settings: { get: async () => ({ baseUrl: "https://waha.example.com" }) },
    kv: { get: async () => undefined, set: async () => {} },
    secrets: { getInstall: async () => "key" },
    fetchUserUrl: async () => ({ ok: true, status: 200, json: () => ({ id: "m1" }) }),
    db: { query: async (sql, params) => { queries.push({ sql, params }); return { rows: rowsFor(sql, params), rowCount: 1 }; } },
    events: { publish() {} }, toast: (_u, t) => toasts.push(t), log: { warn() {}, info() {}, debug() {}, error() {} },
    approvals: { request: async () => "approved" },
    routes: { get: (p, h) => (routes["GET " + p] = h), post: (p, h) => (routes["POST " + p] = h) },
    internalRoutes: { call: (p, h) => (internal[p] = h) },
    webhooks: { on: (_n, h) => { webhook = h; } },
  };
  plugin.start(ctx);
  return { routes, internal, queries, toasts, webhook: (json) => webhook({ json: () => json, rawBody: new Uint8Array(), headers: {} }) };
}
const ev = (payload, event = "message") => ({ event, session: "default", payload });
const base = { id: "m1", timestamp: 1700000000, body: "hi", hasMedia: false };

test("parseWebhook: display name from every supported location, trimmed and cleaned", () => {
  const places = [
    { _data: { notifyName: "  Ana  " } }, { _data: { pushName: "Ana" } }, { _data: { Info: { PushName: "Ana" } } }, { notifyName: "Ana" }, { pushName: "Ana\u0007" },
  ];
  for (const extra of places) assert.equal(parseWebhook(ev({ ...base, from: "5511999999999@c.us", fromMe: false, ...extra })).senderName, "Ana");
  assert.equal(parseWebhook(ev({ ...base, from: "5511999999999@c.us", fromMe: false, _data: { notifyName: " ", pushName: "Bia" } })).senderName, "Bia");
  assert.equal(parseWebhook(ev({ ...base, from: "5511999999999@c.us", fromMe: false, pushName: "x".repeat(200) })).senderName.length, 80);
  assert.equal(parseWebhook(ev({ ...base, from: "5511999999999@c.us", fromMe: false })).senderName, "");
});

test("parseWebhook: fromMe has no sender name or phone", () => {
  const m = parseWebhook(ev({ ...base, from: "me@c.us", to: "5511999999999@c.us", fromMe: true, pushName: "Me" }));
  assert.equal(m.senderName, ""); assert.equal(m.senderPhone, ""); assert.equal(m.sender, "me"); assert.equal(m.chatId, "5511999999999@c.us");
});

test("parseWebhook: phone from c.us / s.whatsapp.net ids and from a lid alternate", () => {
  assert.equal(parseWebhook(ev({ ...base, from: "5511999999999@c.us", fromMe: false })).senderPhone, "5511999999999");
  assert.equal(parseWebhook(ev({ ...base, from: "5511999999999@s.whatsapp.net", fromMe: false })).senderPhone, "5511999999999");
  const lid = (_data) => parseWebhook(ev({ ...base, from: "123456789012345@lid", fromMe: false, _data })).senderPhone;
  assert.equal(lid({ key: { remoteJidAlt: "5511988887777@s.whatsapp.net" } }), "5511988887777");
  assert.equal(lid({ key: { senderPn: "5511988887777:12@c.us" } }), "5511988887777");
  assert.equal(lid({ Info: { SenderAlt: "5511988887777@s.whatsapp.net" } }), "5511988887777");
  assert.equal(lid({ senderPn: "5511988887777@c.us" }), "5511988887777");
  assert.equal(lid({ key: { remoteJidAlt: "999@lid" } }), "");
  assert.equal(lid(undefined), "");
});

test("parseWebhook: group message takes the participant as sender", () => {
  const g = (extra) => parseWebhook(ev({ ...base, from: "1203630@g.us", fromMe: false, ...extra }));
  assert.equal(g({ participant: "5511999999999@c.us" }).sender, "5511999999999@c.us");
  assert.equal(g({ _data: { key: { participant: "5511888888888@c.us" } } }).sender, "5511888888888@c.us");
  assert.equal(g({ author: "5511777777777@c.us" }).sender, "5511777777777@c.us");
  assert.equal(g({}).sender, "1203630@g.us");
  assert.equal(g({ participant: 5 }).sender, "1203630@g.us");
  assert.equal(g({}).chatId, "1203630@g.us");
});

test("parseWebhook: malformed _data never throws; existing fields unchanged", () => {
  for (const _data of [null, 5, "x", [], { key: 3, Info: "x" }, { key: null }]) {
    const m = parseWebhook(ev({ ...base, from: "123456789012345@lid", fromMe: false, _data }));
    assert.equal(m.senderPhone, ""); assert.equal(m.senderName, "");
  }
  const m = parseWebhook(ev({ ...base, from: "5511999999999@c.us", fromMe: false, source: "APP", hasMedia: true }));
  assert.deepEqual({ ...m, sentAt: m.sentAt.toISOString() }, {
    source: "app", session: "default", chatId: "5511999999999@c.us", msgId: "m1", fromMe: false, sender: "5511999999999@c.us", senderName: "", senderPhone: "5511999999999",
    body: "hi", hasMedia: true, sentAt: new Date(1700000000000).toISOString(), reply: null, links: [],
  });
  assert.equal(parseWebhook(ev({ ...base, from: "a@c.us" }, "other")), null);
});

test("GET /chats maps rows to the contract", async () => {
  const at = "2026-01-02T03:04:05.000Z";
  const rows = [
    { chat_id: "5511999999999@c.us", last_at: at, total: 3, last_body: "x".repeat(300), last_from_me: true, last_has_media: false, name: "Maria", phone: "", unread: 0 },
    { chat_id: "1203630@g.us", last_at: at, total: 1, last_body: "g", last_from_me: false, last_has_media: true, name: "", phone: "", unread: 2 },
    { chat_id: "123456789012345@lid", last_at: at, total: 1, last_body: "l", last_from_me: false, last_has_media: false, name: null, phone: "5511988887777", unread: "4" },
    { chat_id: "status@broadcast", last_at: at, total: 1, last_body: null, last_from_me: false, last_has_media: false, name: null, phone: null, unread: 0 },
  ];
  const h = harness(() => rows);
  const { chats } = await h.routes["GET /chats"]({ userId: "u1", query: {} });
  assert.deepEqual(chats.map((c) => [c.kind, c.name, c.phone, c.unread]), [["user", "Maria", "5511999999999", 0], ["group", null, null, 2], ["user", null, "5511988887777", 4], ["other", null, null, 0]]);
  assert.equal(chats[0].lastBody.length, 200); assert.equal(chats[0].lastFromMe, true); assert.equal(chats[1].lastHasMedia, true);
  assert.equal(chats[0].lastAt, at); assert.equal(chats[0].total, 3); assert.equal(chats[3].lastBody, "");
  assert.match(h.queries[0].sql, /LIMIT 100/); assert.equal(h.queries[0].params[0], "u1");
  assert.deepEqual((await h.internal["/chats"]({ userId: "u1" })).chats.length, 4);
});

test("GET /messages includes senderName", async () => {
  const h = harness(() => [{ msg_id: "a", from_me: false, sender: "x@c.us", sender_name: "Maria", body: "hi", has_media: false, sent_at: "2026-01-02T03:04:05Z" }]);
  const { messages } = await h.routes["GET /messages"]({ userId: "u1", query: { chatId: "x@c.us" } });
  assert.equal(messages[0].senderName, "Maria"); assert.equal(messages[0].id, "a");
  assert.deepEqual(h.queries[0].params.slice(0, 2), ["u1", "x@c.us"]);
  await assert.rejects(h.routes["GET /messages"]({ userId: "u1", query: { chatId: "bad id" } }), { status: 400 });
});

test("POST /read validates, is owner-only and writes for the right user and chat", async () => {
  const h = harness();
  assert.deepEqual(await h.routes["POST /read"]({ userId: "u1", body: { chatId: "5511999999999@c.us" } }), { ok: true });
  const reads = () => h.queries.filter((q) => /chat_reads/.test(q.sql));
  assert.equal(reads().length, 1); assert.deepEqual(reads()[0].params, ["u1", "5511999999999@c.us"]);
  await assert.rejects(h.routes["POST /read"]({ userId: "u1", body: { chatId: "bad id!" } }), { status: 400 });
  await assert.rejects(h.routes["POST /read"]({ userId: "u1", body: {} }), { status: 400 });
  await assert.rejects(h.routes["POST /read"]({ userId: "u2", body: { chatId: "5511999999999@c.us" } }), { status: 403 });
  assert.equal(reads().length, 1);
  assert.equal(h.internal["/read"], undefined);
});

test("webhook upserts a contact for inbound 1:1 only; toast shows the name", async () => {
  const h = harness();
  await h.webhook(ev({ ...base, from: "5511999999999@c.us", fromMe: false, pushName: "Maria" }));
  const contact = h.queries.filter((q) => /INSERT INTO\s+\S*contacts/.test(q.sql));
  assert.equal(contact.length, 1); assert.deepEqual(contact[0].params, ["u1", "5511999999999@c.us", "Maria", "5511999999999"]);
  assert.equal(h.toasts[0].title, "WhatsApp: Maria");
  const before = h.queries.length;
  await h.webhook(ev({ ...base, id: "m2", from: "1203630@g.us", fromMe: false, participant: "5511999999999@c.us", pushName: "Maria" }));
  await h.webhook(ev({ ...base, id: "m3", from: "me@c.us", to: "5511999999999@c.us", fromMe: true }));
  assert.equal(h.queries.slice(before).filter((q) => /contacts/.test(q.sql)).length, 0);
  await h.webhook(ev({ ...base, id: "m4", from: "5511999999999@c.us", fromMe: false }));
  assert.match(h.toasts.at(-1).title, /^WhatsApp: \+?55/);
  await h.webhook(ev({ ...base, id: "m5", from: "123456789012345@lid", fromMe: false }));
  assert.equal(h.toasts.at(-1).title, "WhatsApp: new message");
});

test("every query is filtered by the user id", async () => {
  const h = harness();
  await h.routes["GET /chats"]({ userId: "u1" });
  await h.routes["GET /messages"]({ userId: "u1", query: { chatId: "x@c.us" } });
  await h.routes["POST /read"]({ userId: "u1", body: { chatId: "x@c.us" } });
  await h.webhook(ev({ ...base, from: "5511999999999@c.us", fromMe: false, pushName: "M" }));
  await h.routes["POST /send"]({ userId: "u1", body: { chatId: "x@c.us", text: "hi" } });
  assert.ok(h.queries.length >= 6);
  for (const q of h.queries) { assert.match(q.sql, /user_id/); assert.equal(q.params[0], "u1"); }
});

test("migrations: 002 appended, ids unique, 001 untouched", () => {
  const ids = migrations.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids.slice(0, 2), ["001_messages", "002_contacts_reads"]);
  const m2 = migrations[1].sql;
  for (const s of ["sender_name", "{{p}}contacts", "{{p}}chat_reads", "now()"]) assert.ok(m2.includes(s), s);
  let old;
  try { old = execFileSync("git", ["show", "HEAD:runtime/migrations.ts"], { cwd: new URL("..", import.meta.url).pathname, encoding: "utf8" }); } catch { return; }
  const sql001 = /id: "001_messages",\s*sql: `([\s\S]*?)`/.exec(old)[1];
  assert.equal(migrations[0].sql, sql001);
});
