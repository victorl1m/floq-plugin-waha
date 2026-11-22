// Replies (quoted messages) and linking a contact's @lid and phone ids into one chat. The SQL runs on a real Postgres (PGlite, in memory).
import test, { before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { newDb } from "./_db.mjs";

let tmp, plugin, client, migrations, chat;
const bundle = async (name, src) => {
  const out = join(tmp, name);
  await build({ entryPoints: [new URL(src, import.meta.url).pathname], bundle: true, format: "esm", platform: "node", outfile: out, external: ["node:*"], logLevel: "silent" });
  return import(pathToFileURL(out).href);
};
before(async () => {
  tmp = mkdtempSync(join(tmpdir(), "waha-replies-"));
  plugin = (await bundle("rt.mjs", "../runtime/index.ts")).default;
  client = await bundle("client.mjs", "../runtime/client.ts");
  ({ migrations } = await bundle("mig.mjs", "../runtime/migrations.ts"));
  chat = await bundle("chat.mjs", "../shared/chat.ts");
});
after(() => rmSync(tmp, { recursive: true, force: true }));
const open = [];
afterEach(async () => { await plugin.stop(); for (const db of open.splice(0)) await db.close(); });

const PN = "5534999990000@c.us", LID = "123456789012345@lid", GROUP = "120363041234567890@g.us";
const ev = (payload, extra = {}) => ({ event: "message", session: "default", payload: { timestamp: 1700000000, body: "hi", hasMedia: false, fromMe: false, ...payload }, ...extra });

/** The plugin on an in-memory Postgres. `waha(url, init)` answers WAHA requests; `seed` runs between migration 002 and 003. */
async function harness({ waha, seed } = {}) {
  const db = await newDb();
  open.push(db);
  for (const m of migrations) { if (m.id === "003_replies_lids" && seed) await db.exec(seed); await db.exec(m.sql.replaceAll("{{p}}", "")); }
  const routes = {}, internal = {}, events = [], sent = [], kv = new Map();
  let webhook;
  const ctx = {
    httpError: (status, code, message) => Object.assign(new Error(message), { status, code }),
    installOwner: async () => "u1",
    settings: { get: async () => ({ baseUrl: "https://waha.example.com" }) },
    kv: { get: async (_u, k) => kv.get(k), set: async (_u, k, v) => { kv.set(k, v); } },
    secrets: { getInstall: async () => "key" },
    fetchUserUrl: async (_u, url, init) => {
      const body = init?.body ? JSON.parse(init.body) : undefined;
      if (url.endsWith("/api/sendText")) sent.push(body);
      const r = waha ? await waha(url, body) : undefined;
      const res = r ?? (url.endsWith("/api/sendText") ? { status: 200, json: { id: `true_${body.chatId}_OUT${sent.length}` } } : { status: 404, json: {} });
      return { ok: res.status >= 200 && res.status < 300, status: res.status, json: () => res.json };
    },
    db: { query: async (sql, params) => { const r = await db.query(sql.replaceAll("{{p}}", ""), params); return { rows: r.rows, rowCount: r.rows.length || r.affectedRows || 0 }; } },
    events: { publish: (_u, name, data) => events.push({ name, ...data }) }, toast() {}, log: { warn() {}, info() {}, debug() {}, error() {} },
    approvals: { request: async () => "approved" },
    routes: { get: (p, h) => (routes["GET " + p] = h), post: (p, h) => (routes["POST " + p] = h) },
    internalRoutes: { call: (p, h) => (internal[p] = h) },
    webhooks: { on: (_n, h) => { webhook = h; } },
  };
  plugin.start(ctx);
  let n = 0;
  return {
    db, routes, internal, events, sent, kv,
    /** Delivers a webhook; each message is a second later than the one before. */
    hook: (payload, extra) => webhook({ json: () => ev({ id: `false_${payload.from ?? payload.to}_M${++n}`, timestamp: 1700000000 + n, ...payload }, extra), rawBody: new Uint8Array(), headers: {} }),
    chats: async () => (await routes["GET /chats"]({ userId: "u1", query: {} })).chats,
    messages: async (chatId) => (await routes["GET /messages"]({ userId: "u1", query: { chatId } })).messages,
  };
}

// ---- pure parsing ----

test("pnOf / lidOf / stanzaOf normalize the id variants", () => {
  assert.equal(client.pnOf("5534999990000:12@s.whatsapp.net"), PN);
  assert.equal(client.pnOf("5534999990000@c.us"), PN);
  assert.equal(client.pnOf(LID), null); assert.equal(client.pnOf(5), null); assert.equal(client.pnOf("x@c.us"), null);
  assert.equal(client.lidOf("123456789012345:3@lid"), LID);
  assert.equal(client.lidOf(PN), null); assert.equal(client.lidOf(undefined), null);
  assert.equal(client.stanzaOf("false_5534999990000@c.us_3EB0AA"), "3EB0AA");
  assert.equal(client.stanzaOf("true_120363@g.us_3EB0AA_5534999990000@c.us"), "3EB0AA");
  assert.equal(client.stanzaOf("3EB0AA"), "3EB0AA"); assert.equal(client.stanzaOf(null), "");
});

test("parseWebhook: lid <-> phone pairs from every engine shape", () => {
  const links = (payload) => client.parseWebhook(ev({ id: "m", ...payload })).links;
  const pair = [{ lid: LID, pn: PN }];
  // NOWEB: the chat is the lid, the phone is the alternate (and the other way round).
  assert.deepEqual(links({ from: LID, _data: { key: { remoteJid: LID, remoteJidAlt: "5534999990000@s.whatsapp.net" } } }), pair);
  assert.deepEqual(links({ from: PN, _data: { key: { remoteJidAlt: "123456789012345@lid" } } }), pair);
  assert.deepEqual(links({ from: LID, _data: { key: { senderPn: "5534999990000:7@s.whatsapp.net" } } }), pair);
  assert.deepEqual(links({ from: PN, _data: { senderLid: LID } }), pair);
  // GOWS: Info.Sender / SenderAlt for inbound, RecipientAlt for our own messages.
  assert.deepEqual(links({ from: LID, _data: { Info: { Sender: "123456789012345:2@lid", SenderAlt: "5534999990000@s.whatsapp.net" } } }), pair);
  assert.deepEqual(links({ fromMe: true, from: "me@c.us", to: LID, _data: { Info: { RecipientAlt: "5534999990000@s.whatsapp.net", SenderAlt: "999999999999@lid" } } }), pair);
  // Our own lid is never linked to the chat.
  assert.deepEqual(links({ fromMe: true, from: "me@c.us", to: PN, _data: { Info: { SenderAlt: "999999999999@lid" }, key: { senderLid: "999999999999@lid" } } }), []);
  // Groups: the participant and its alternate.
  assert.deepEqual(links({ from: GROUP, participant: LID, _data: { key: { participantAlt: "5534999990000@s.whatsapp.net" } } }), pair);
  assert.deepEqual(links({ from: GROUP, participant: PN, _data: { key: { participantLid: LID } } }), pair);
  assert.deepEqual(links({ from: GROUP, participant: LID, _data: { Info: { Sender: LID, SenderAlt: PN } } }), pair);
  // Nothing to learn, or junk.
  assert.deepEqual(links({ from: LID }), []);
  assert.deepEqual(links({ from: LID, _data: { key: { remoteJidAlt: "777777777777@lid" } } }), []);
  for (const _data of [null, 5, "x", [], { key: 3, Info: "x" }]) assert.deepEqual(links({ from: LID, _data }), []);
});

test("parseWebhook: the quoted message of a reply, from every engine shape", () => {
  const reply = (payload, extra) => client.parseWebhook(ev({ id: "m", from: PN, ...payload }, extra)).reply;
  assert.equal(reply({}), null);
  // WAHA's normalized field.
  assert.deepEqual(reply({ replyTo: { id: "false_5534999990000@c.us_AAA", participant: PN, body: "Original" } }), { id: "AAA", body: "Original", sender: PN, hasMedia: false });
  // In a 1:1 chat a quote that is not theirs is mine; the account id of the event says so too.
  assert.equal(reply({ replyTo: { id: "AAA", participant: "5511000000000@c.us", body: "Mine" } }).sender, "me");
  assert.equal(reply({ from: GROUP, replyTo: { id: "AAA", participant: "5511000000000@c.us", body: "Mine" } }, { me: { id: "5511000000000@c.us" } }).sender, "me");
  assert.equal(reply({ from: GROUP, replyTo: { id: "AAA", participant: "5511777777777@c.us", body: "x" } }, { me: { id: "5511000000000@c.us" } }).sender, "5511777777777@c.us");
  // Their other address is still theirs.
  assert.equal(reply({ from: LID, replyTo: { id: "AAA", participant: "5534999990000@s.whatsapp.net", body: "x" }, _data: { key: { remoteJidAlt: PN } } }).sender, LID);
  assert.equal(reply({ replyTo: { id: "AAA", body: "x" } }).sender, "");
  // WEBJS raw fields.
  assert.deepEqual(reply({ _data: { quotedStanzaID: "BBB", quotedParticipant: PN, quotedMsg: { type: "chat", body: "From webjs" } } }), { id: "BBB", body: "From webjs", sender: PN, hasMedia: false });
  assert.deepEqual(reply({ _data: { quotedStanzaID: "BBB", quotedParticipant: { _serialized: PN }, quotedMsg: { type: "image", caption: "A photo" } } }), { id: "BBB", body: "A photo", sender: PN, hasMedia: true });
  // NOWEB / GOWS raw contextInfo.
  assert.deepEqual(reply({ _data: { message: { extendedTextMessage: { text: "re", contextInfo: { stanzaId: "CCC", participant: "5534999990000@s.whatsapp.net", quotedMessage: { conversation: "From noweb" } } } } } }), { id: "CCC", body: "From noweb", sender: PN, hasMedia: false });
  assert.deepEqual(reply({ _data: { Message: { extendedTextMessage: { contextInfo: { stanzaID: "DDD", participant: PN, quotedMessage: { imageMessage: { caption: "" } } } } } } }), { id: "DDD", body: "", sender: PN, hasMedia: true });
  assert.equal(reply({ replyTo: { id: "AAA", body: "x".repeat(900) } }).body.length, 400);
  for (const junk of [{ replyTo: 5 }, { replyTo: { id: 7 } }, { _data: { quotedMsg: 3 } }, { _data: { message: { a: { contextInfo: "x" } } } }]) assert.equal(reply(junk), null);
});

test("quote helpers never show a raw id", () => {
  const one = { chatId: LID, kind: "user", name: "Ana" }, group = { chatId: GROUP, kind: "group", name: "Team" };
  assert.equal(chat.quoteAuthor({ fromMe: true, sender: "" }, one), "You");
  assert.equal(chat.quoteAuthor({ fromMe: false, sender: LID }, one), "Ana");
  assert.equal(chat.quoteAuthor({ fromMe: false, sender: PN, senderName: "Bia" }, group), "Bia");
  assert.equal(chat.quoteAuthor({ fromMe: false, sender: PN }, group), "+55 34 99999-0000");
  assert.equal(chat.quoteAuthor({ fromMe: false, sender: LID }, group), "Unknown contact");
  assert.equal(chat.quoteAuthor({ fromMe: false, sender: LID, senderName: "x@lid" }, { chatId: LID }), "Unknown contact");
  assert.equal(chat.quoteText({ body: " a\n b " }), "a b");
  assert.equal(chat.quoteText({ body: "", hasMedia: true }), "Photo or file");
  assert.equal(chat.quoteText({ body: "" }), "Message");
  assert.deepEqual(chat.quoteOf({ id: "i", fromMe: false, sender: PN, senderName: "Bia", body: "b", hasMedia: false, sentAt: "" }), { id: "i", body: "b", hasMedia: false, fromMe: false, sender: PN, senderName: "Bia" });
});

// ---- one chat for the two addresses of a contact ----

test("a contact seen as @c.us and as @lid becomes one chat once the pair is known", async () => {
  const h = await harness();
  await h.hook({ from: PN, body: "one", pushName: "Ana" });
  await h.hook({ from: LID, body: "two" });
  await h.hook({ fromMe: true, from: "me@c.us", to: PN, body: "three" });
  assert.deepEqual((await h.chats()).map((c) => [c.chatId, c.total, c.unread]), [[PN, 2, 1], [LID, 1, 1]]);

  await h.hook({ from: LID, body: "four", _data: { key: { remoteJidAlt: "5534999990000@s.whatsapp.net" } } });
  const chats = await h.chats();
  assert.deepEqual(chats.map((c) => [c.chatId, c.kind, c.name, c.phone, c.total, c.unread, c.lastBody]), [[PN, "user", "Ana", "5534999990000", 4, 3, "four"]]);
  // The live event names the chat the UI has open.
  assert.equal(h.events.at(-1).chatId, PN);
  // Both ids open the same conversation, in time order.
  for (const id of [PN, LID]) assert.deepEqual((await h.messages(id)).map((m) => m.body), ["one", "two", "three", "four"]);
  // Rows keep the address they arrived on.
  assert.deepEqual((await h.db.query("SELECT DISTINCT chat_id FROM messages ORDER BY 1")).rows.map((r) => r.chat_id), [LID, PN]);
});

test("unread counts and read marks cover both addresses", async () => {
  const h = await harness();
  await h.hook({ from: PN, body: "a" });
  await h.hook({ from: LID, body: "b", _data: { key: { remoteJidAlt: PN } } });
  await h.hook({ from: LID, body: "c" });
  assert.equal((await h.chats())[0].unread, 3);
  await h.routes["POST /read"]({ userId: "u1", body: { chatId: PN } });
  assert.equal((await h.chats())[0].unread, 0);
  assert.deepEqual((await h.db.query("SELECT chat_id FROM chat_reads ORDER BY 1")).rows.map((r) => r.chat_id), [LID, "553499990000@c.us", PN], "every address of the chat is marked, the other spelling of the number included");
  await new Promise((r) => setTimeout(r, 15));
  await h.hook({ from: LID, body: "d" });
  await h.hook({ fromMe: true, from: "me@c.us", to: LID, body: "mine" });
  assert.equal((await h.chats())[0].unread, 1);
  // Marking the lid id read works just as well.
  await h.routes["POST /read"]({ userId: "u1", body: { chatId: LID } });
  assert.equal((await h.chats())[0].unread, 0);
  // Another contact is untouched.
  await h.hook({ from: "5511888887777@c.us", body: "other" });
  assert.deepEqual((await h.chats()).map((c) => [c.chatId, c.unread]), [["5511888887777@c.us", 1], [PN, 0]]);
});

test("an unlinked @lid chat asks the WAHA lids API, caches the answer and merges", async () => {
  const asked = [];
  const h = await harness({ waha: (url) => {
    if (!url.includes("/lids")) return undefined;
    asked.push(url.replace("https://waha.example.com", ""));
    if (url.includes("/lids?")) return { status: 200, json: [{ lid: "555555555555555@lid", pn: "5511777776666@c.us" }, { lid: "bad", pn: null }] };
    return url.endsWith(encodeURIComponent(LID)) ? { status: 200, json: { lid: LID, pn: "5534999990000@c.us" } } : { status: 200, json: { lid: "x", pn: null } };
  } });
  await h.hook({ from: PN, body: "one" });
  await h.hook({ from: LID, body: "two" });
  await h.hook({ from: "777777777777777@lid", body: "nobody knows" });
  const chats = await h.chats();
  assert.deepEqual(chats.map((c) => [c.chatId, c.total]), [["777777777777777@lid", 1], [PN, 2]]);
  assert.equal(asked[0], "/api/default/lids?limit=1000&offset=0");
  assert.equal(asked.filter((u) => u.includes("%40lid")).length, 2);
  assert.equal((await h.db.query("SELECT COUNT(*)::int AS n FROM lid_map")).rows[0].n, 2);
  // Known pairs are not asked for again, and an unknown lid is not asked for on every refresh.
  const before = asked.length;
  await h.chats();
  assert.equal(asked.length, before);
  // The unknown contact still has no raw id as a phone.
  assert.equal(chats[0].phone, null);
});

test("a WAHA that has no lids API changes nothing", async () => {
  const h = await harness({ waha: (url) => (url.includes("/lids") ? { status: 500, json: { error: "x" } } : undefined) });
  await h.hook({ from: LID, body: "two" });
  assert.deepEqual((await h.chats()).map((c) => c.chatId), [LID]);
});

test("migration 003 links the lid chats whose phone was already saved", async () => {
  const h = await harness({ seed: `
    INSERT INTO contacts (user_id, chat_id, name, phone) VALUES ('u1', '${LID}', 'Ana', '5534999990000'), ('u1', '888888888888888@lid', 'No phone', ''), ('u1', '5511888887777@c.us', 'Bia', '5511888887777');
    INSERT INTO messages (user_id, session, chat_id, msg_id, sender, body, sent_at) VALUES ('u1', 'default', '${LID}', 'a', '${LID}', 'old lid', now() - interval '2 hours'), ('u1', 'default', '${PN}', 'b', '${PN}', 'old pn', now() - interval '1 hour');` });
  assert.deepEqual((await h.db.query("SELECT lid, pn FROM lid_map")).rows, [{ lid: LID, pn: PN }]);
  assert.deepEqual((await h.chats()).map((c) => [c.chatId, c.name, c.total]), [[PN, "Ana", 2]]);
  assert.deepEqual((await h.messages(PN)).map((m) => [m.body, m.replyTo]), [["old lid", null], ["old pn", null]]);
});

test("group messages show the phone of a sender known only by lid", async () => {
  const h = await harness();
  await h.hook({ from: GROUP, participant: LID, body: "before" });
  assert.equal((await h.messages(GROUP))[0].sender, LID);
  await h.hook({ from: GROUP, participant: LID, body: "after", _data: { key: { participantAlt: PN } } });
  assert.deepEqual((await h.messages(GROUP)).map((m) => m.sender), [PN, PN]);
  assert.deepEqual((await h.chats()).map((c) => [c.chatId, c.kind, c.total]), [[GROUP, "group", 2]]);
});

test("sending to a merged chat goes where the contact last wrote from, and falls back to its other address", async () => {
  let refuse = "";
  const h = await harness({ waha: (url, body) => (url.endsWith("/api/sendText") && body.chatId === refuse ? { status: 500, json: {} } : undefined) });
  await h.hook({ from: PN, body: "a" });
  await h.hook({ from: LID, body: "b", _data: { key: { remoteJidAlt: PN } } });
  await h.routes["POST /send"]({ userId: "u1", body: { chatId: PN, text: "first" } });
  assert.deepEqual(h.sent.map((s) => s.chatId), [LID], "they last wrote from the lid");
  // When that address stops working the canonical one is tried.
  refuse = LID;
  await h.routes["POST /send"]({ userId: "u1", body: { chatId: LID, text: "second" } });
  assert.deepEqual(h.sent.slice(1).map((s) => s.chatId), [LID, PN]);
  assert.equal(h.kv.get("s:default:route:" + PN), PN);
  // A new message from the phone id moves the route back there.
  refuse = "";
  await h.hook({ from: PN, body: "c" });
  await h.routes["POST /send"]({ userId: "u1", body: { chatId: LID, text: "third" } });
  assert.deepEqual(h.sent.slice(3).map((s) => s.chatId), [PN]);
  // Everything landed in the one chat, and the live event names it.
  assert.deepEqual((await h.messages(PN)).map((m) => m.body).sort(), ["a", "b", "c", "first", "second", "third"]);
  assert.deepEqual((await h.chats()).map((c) => [c.chatId, c.total, c.unread, c.lastFromMe]), [[PN, 6, 0, true]]);
  assert.equal(h.events.at(-1).chatId, PN);
});

test("an auth or network failure is not retried on the other address", async () => {
  for (const status of [401, 403, 429]) {
    const h = await harness({ waha: (url) => (url.endsWith("/api/sendText") ? { status, json: {} } : undefined) });
    await h.hook({ from: LID, body: "b", _data: { key: { remoteJidAlt: PN } } });
    await assert.rejects(h.routes["POST /send"]({ userId: "u1", body: { chatId: PN, text: "x" } }), { status: 502, code: status === 429 ? "waha_unavailable" : "waha_unauthorized" });
    assert.equal(h.sent.length, 1);
    assert.equal((await h.messages(PN)).length, 1);
  }
  // Both addresses refused: still one generic error, nothing stored.
  const h = await harness({ waha: (url) => (url.endsWith("/api/sendText") ? { status: 500, json: {} } : undefined) });
  await h.hook({ from: LID, body: "b", _data: { key: { remoteJidAlt: PN } } });
  await assert.rejects(h.routes["POST /send"]({ userId: "u1", body: { chatId: PN, text: "x" } }), { status: 502 });
  assert.equal(h.sent.length, 2);
});

// ---- replies ----

test("an incoming reply carries its quote; a loaded original can be jumped to", async () => {
  const h = await harness();
  await h.hook({ id: "false_" + PN + "_AAA", from: PN, body: "Can you do 40 units?", pushName: "Ana" });
  await h.hook({ id: "true_" + PN + "_BBB", fromMe: true, from: "me@c.us", to: PN, body: "Yes, by Thursday" });
  await h.hook({ id: "false_" + PN + "_CCC", from: PN, body: "Great", replyTo: { id: "true_" + PN + "_BBB", participant: "5511000000000@c.us", body: "Yes, by Thursday" } });
  await h.hook({ id: "false_" + PN + "_DDD", from: PN, body: "About the old one", replyTo: { id: "ZZZ", participant: PN, body: "A message from last year" } });
  await h.hook({ id: "false_" + PN + "_EEE", from: PN, body: "and this", _data: { quotedStanzaID: "AAA", quotedParticipant: PN, quotedMsg: { type: "chat", body: "stale copy" } } });
  const m = await h.messages(PN);
  assert.deepEqual(m.map((x) => x.replyTo && [x.replyTo.id, x.replyTo.fromMe, x.replyTo.body, x.replyTo.sender, x.replyTo.senderName]), [
    null, null,
    ["true_" + PN + "_BBB", true, "Yes, by Thursday", "", ""],
    ["", false, "A message from last year", PN, ""],
    ["false_" + PN + "_AAA", false, "Can you do 40 units?", PN, "Ana"],
  ]);
  // Agents read the same shape.
  assert.deepEqual((await h.internal["/messages"]({ userId: "u1", body: { chatId: PN } })).messages[2].replyTo.body, "Yes, by Thursday");
});

test("replying from the inbox sends reply_to to WAHA and stores the quote", async () => {
  const h = await harness();
  await h.hook({ id: "false_" + PN + "_AAA", from: PN, body: "Can you do 40 units?", pushName: "Ana" });
  const r = await h.routes["POST /send"]({ userId: "u1", body: { chatId: PN, text: "Yes", replyTo: "false_" + PN + "_AAA" } });
  assert.equal(r.status, "sent");
  assert.deepEqual(h.sent[0], { session: "default", chatId: PN, text: "Yes", reply_to: "false_" + PN + "_AAA" });
  const last = (await h.messages(PN)).at(-1);
  assert.deepEqual(last.replyTo, { id: "false_" + PN + "_AAA", body: "Can you do 40 units?", hasMedia: false, fromMe: false, sender: PN, senderName: "Ana" });
  // Without replyTo the request to WAHA is exactly what it was before.
  await h.routes["POST /send"]({ userId: "u1", body: { chatId: PN, text: "Plain" } });
  assert.deepEqual(h.sent[1], { session: "default", chatId: PN, text: "Plain" });
  assert.equal((await h.messages(PN)).at(-1).replyTo, null);
  // Replying to my own message.
  await h.routes["POST /send"]({ userId: "u1", body: { chatId: PN, text: "PS", replyTo: r.id } });
  assert.equal((await h.messages(PN)).at(-1).replyTo.fromMe, true);
});

test("replyTo must be a message of that chat", async () => {
  const h = await harness();
  await h.hook({ id: "false_" + PN + "_AAA", from: PN, body: "a" });
  await h.hook({ id: "false_5511888887777@c.us_QQQ", from: "5511888887777@c.us", body: "other chat" });
  for (const replyTo of ["nope", "false_5511888887777@c.us_QQQ", 7, {}, "x".repeat(300)]) {
    await assert.rejects(h.routes["POST /send"]({ userId: "u1", body: { chatId: PN, text: "x", replyTo } }), { status: 400, code: "invalid_reply" });
  }
  assert.equal(h.sent.length, 0);
  // A reply across the two addresses of one contact is fine.
  await h.hook({ id: "false_" + LID + "_LLL", from: LID, body: "from lid", _data: { key: { remoteJidAlt: PN } } });
  await h.routes["POST /send"]({ userId: "u1", body: { chatId: PN, text: "ok", replyTo: "false_" + LID + "_LLL" } });
  assert.equal(h.sent[0].reply_to, "false_" + LID + "_LLL");
});

test("an agent reply still waits for approval and passes reply_to", async () => {
  const h = await harness();
  await h.hook({ id: "false_" + PN + "_AAA", from: PN, body: "a" });
  const r = await h.internal["/send"]({ userId: "u1", body: { chatId: PN, text: "Hello", replyTo: "false_" + PN + "_AAA" } });
  assert.equal(r.status, "sent");
  assert.equal(h.sent[0].reply_to, "false_" + PN + "_AAA");
  await assert.rejects(h.internal["/send"]({ userId: "u1", body: { chatId: PN, text: "Hello", replyTo: "nope" } }), { status: 400 });
});

test("migrations: 003 is appended and additive", () => {
  assert.deepEqual(migrations.map((m) => m.id), ["001_messages", "002_contacts_reads", "003_replies_lids", "004_full_inbox", "005_status", "006_accounts", "007_history_contacts"]);
  const sql = migrations[2].sql;
  assert.doesNotMatch(sql, /DROP|DELETE|UPDATE /i);
  for (const s of ["reply_to", "reply_body", "reply_sender", "{{p}}lid_map"]) assert.ok(sql.includes(s), s);
});
