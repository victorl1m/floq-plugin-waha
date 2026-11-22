// Several WhatsApp accounts (WAHA sessions) in one inbox: the migration, per-account routing of webhooks and sends, attach / create / remove.
import test, { before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { bundle, cleanup, closeAll, harness } from "./helpers.mjs";

let plugin, migrations;
before(async () => { plugin = (await bundle("../runtime/index.ts")).default; ({ migrations } = await bundle("../runtime/migrations.ts")); });
afterEach(closeAll);
after(cleanup);

const ANA = "5511911112222@c.us", BIA = "5521933334444@c.us";
const acct = (session, extra = {}) => ({ session, label: "", name: "", phone: "", addedAt: "2026-01-01T00:00:00.000Z", ...extra });
const HOOK = { url: "https://floq.example.com/v1/plugins/waha/hooks/events/tok123", events: ["message.any", "session.status"], hmac: null, retries: null, customHeaders: null };
/** A fake WAHA with these sessions: { name: { status, me?, webhooks? } }. Records nothing itself (h.requests has every call). */
const waha = (sessions) => (method, path, req) => {
  const info = (name) => ({ name, status: sessions[name].status, engine: { engine: "NOWEB" }, me: sessions[name].me ?? null, config: { webhooks: sessions[name].webhooks ?? [] } });
  if (method === "GET" && path === "/api/sessions") return { json: Object.keys(sessions).map(info) };
  const one = /^\/api\/sessions\/([^/]+)$/.exec(path);
  if (one && method === "GET") return sessions[one[1]] ? { json: info(one[1]) } : { status: 404, json: {} };
  if (one && method === "PUT") { sessions[one[1]].webhooks = req.body.config.webhooks; return { json: {} }; }
  if (one && method === "DELETE") { delete sessions[one[1]]; return { json: {} }; }
  if (method === "POST" && path === "/api/sessions") { sessions[req.body.name] = { status: "SCAN_QR_CODE", webhooks: req.body.config?.webhooks ?? [] }; return { json: { name: req.body.name } }; }
  if (method === "POST" && /^\/api\/sessions\/[^/]+\/start$/.test(path)) return { json: {} };
  return undefined;
};
const two = (opts = {}) => harness(plugin, migrations, { kv: { accounts: [acct("a"), acct("b")] }, waha: waha({ a: { status: "WORKING", me: { id: "5511900000001@c.us", pushName: "Shop" }, webhooks: [HOOK] }, b: { status: "WORKING", me: { id: "5511900000002@c.us", pushName: "Lucy" } } }), ...opts });
const fail = async (p) => { try { await p; } catch (e) { return e; } assert.fail("expected an error"); };

test("migration 006: rows stored by 3.0.x move to the session the install was using, keys become per account, and the inbox reads the same", async () => {
  const h = await harness(plugin, migrations, {
    seedBefore: "006_accounts", kv: { session: "lucy", me: { id: "5511900000001@c.us", lid: "", name: "Lucy" } },
    seed: `
      INSERT INTO messages (user_id, session, chat_id, msg_id, stanza, sender, body, sent_at) VALUES ('u1', 'default', '${ANA}', 'false_${ANA}_OLD1', 'OLD1', '${ANA}', 'from before', '2026-01-02T03:04:05Z'),
        ('u1', 'lucy', '${ANA}', 'false_${ANA}_OLD2', 'OLD2', '${ANA}', 'after the switch', '2026-01-03T03:04:05Z');
      INSERT INTO contacts (user_id, chat_id, name) VALUES ('u1', '${ANA}', 'Ana Lima');
      INSERT INTO lid_map (user_id, lid, pn) VALUES ('u1', '777777777777@lid', '${ANA}');
      INSERT INTO chat_state (user_id, chat_id, pinned) VALUES ('u1', '${ANA}', TRUE);
      INSERT INTO chat_reads (user_id, chat_id, read_at) VALUES ('u1', '${ANA}', now());
      INSERT INTO known_ids (user_id, id) VALUES ('u1', '${ANA}');
      INSERT INTO reactions (user_id, stanza, sender, emoji) VALUES ('u1', 'OLD1', 'me', '👍');`,
  });
  // The migration alone: everything is "default" until the plugin runs.
  assert.deepEqual((await h.sql("SELECT DISTINCT session FROM contacts")).map((r) => r.session), ["default"]);
  const chats = await h.chats();
  assert.deepEqual(chats.map((c) => [c.chatId, c.name, c.pinned, c.total, c.unread]), [[ANA, "Ana Lima", true, 2, 0]]);
  assert.deepEqual((await h.messages(ANA)).map((m) => [m.body, m.reactions.length]), [["from before", 1], ["after the switch", 0]]);
  for (const t of ["messages", "contacts", "lid_map", "chat_state", "chat_reads", "known_ids", "reactions"]) assert.deepEqual((await h.sql(`SELECT DISTINCT session FROM ${t}`)).map((r) => r.session), ["lucy"], t);
  assert.deepEqual(h.kv.get("accounts").map((a) => [a.session, a.name, a.phone]), [["lucy", "Lucy", "5511900000001"]]);
  assert.equal(h.kv.get("s:lucy:me").name, "Lucy");
  // Per account keys: the same contact, alias and state can exist once per session.
  await h.sql(`INSERT INTO contacts (user_id, session, chat_id, name) VALUES ('u1', 'other', '${ANA}', 'Ana at work')`);
  await h.sql(`INSERT INTO lid_map (user_id, session, lid, pn) VALUES ('u1', 'other', '777777777777@lid', '${BIA}')`);
  await h.sql(`INSERT INTO chat_state (user_id, session, chat_id) VALUES ('u1', 'other', '${ANA}')`);
  await assert.rejects(h.sql(`INSERT INTO contacts (user_id, session, chat_id) VALUES ('u1', 'other', '${ANA}')`));
  assert.deepEqual((await h.chats()).map((c) => c.name), ["Ana Lima"]);
});

test("a single-session install keeps working unchanged: the old setting names the only account, webhooks and requests use it, no session parameter is needed", async () => {
  const h = await harness(plugin, migrations, { settings: { session: "shop" }, waha: waha({ shop: { status: "WORKING", me: { id: "5511900000001@c.us", pushName: "Shop" } } }) });
  await h.message({ from: ANA, body: "oi" }, { session: "shop" });
  await h.message({ from: BIA, body: "not mine" }, { session: "someone-else" });
  assert.deepEqual((await h.chats()).map((c) => [c.chatId, c.lastBody]), [[ANA, "oi"]]);
  assert.deepEqual((await h.sql("SELECT session FROM messages")).map((r) => r.session), ["shop"]);
  await h.post("/send", { chatId: ANA, text: "ola" });
  assert.equal(h.requests.find((r) => r.path === "/api/sendText").body.session, "shop");
  assert.equal((await h.get("/status")).session, "shop");
  assert.equal((await h.get("/status")).accounts, 1);
  const list = (await h.get("/accounts")).accounts;
  assert.deepEqual(list.map((a) => [a.session, a.name, a.phone, a.status, a.engine, a.primary, a.unread]), [["shop", "Shop", "5511900000001", "WORKING", "NOWEB", true, 0]]);
  assert.deepEqual((await h.call("/chats")).chats.map((c) => c.chatId), [ANA]);
  assert.equal((await h.call("/me")).accounts.length, 1);
});

test("one webhook serves every account: an event is stored and announced for the session it names, and for no other", async () => {
  const h = await two();
  // The same person, even the same message id, in both accounts.
  await h.event("message.any", { id: `false_${ANA}_SAME`, timestamp: 1700000001, from: ANA, body: "to the shop", fromMe: false, hasMedia: false }, { session: "a" });
  await h.event("message.any", { id: `false_${ANA}_SAME`, timestamp: 1700000002, from: ANA, body: "to Lucy", fromMe: false, hasMedia: false }, { session: "b" });
  await h.message({ from: BIA, body: "only Lucy" }, { session: "b" });
  await h.message({ from: BIA, body: "nobody" }, { session: "c" });
  const chatsOf = async (session) => (await h.get("/chats", { session })).chats.map((c) => [c.chatId, c.lastBody, c.unread]);
  assert.deepEqual(await chatsOf("a"), [[ANA, "to the shop", 1]]);
  assert.deepEqual((await chatsOf("b")).sort(), [[ANA, "to Lucy", 1], [BIA, "only Lucy", 1]]);
  assert.deepEqual((await h.sql("SELECT session, COUNT(*)::int AS n FROM messages GROUP BY session ORDER BY session")), [{ session: "a", n: 1 }, { session: "b", n: 2 }]);
  assert.deepEqual(h.events.filter((e) => e.name === "message").map((e) => [e.session, e.chatId]), [["a", ANA], ["b", ANA], ["b", BIA]]);
  assert.deepEqual((await h.messages(ANA, { session: "b" })).map((m) => m.body), ["to Lucy"]);
  // Reading in one account leaves the other unread; the switcher shows a count per account.
  await h.post("/read", { session: "b", chatId: ANA });
  assert.deepEqual((await h.get("/accounts")).accounts.map((a) => [a.session, a.name, a.unread]), [["a", "Shop", 1], ["b", "Lucy", 1]]);
  // An ack and a reaction land on the message of their own session only.
  await h.event("message.reaction", { from: ANA, fromMe: false, reaction: { messageId: `false_${ANA}_SAME`, text: "❤️" } }, { session: "b" });
  assert.equal((await h.messages(ANA, { session: "b" }))[0].reactions.length, 1);
  assert.equal((await h.messages(ANA, { session: "a" }))[0].reactions.length, 0);
  // With two accounts the toast says which one.
  assert.ok(h.toasts.every((t) => /^WhatsApp \((Shop|Lucy|a|b)\)/.test(t.title)), JSON.stringify(h.toasts.map((t) => t.title)));
});

test("who is who is kept per account: a lid link learned in one account does not merge chats in the other", async () => {
  const h = await two();
  const LID = "123456789012345@lid";
  await h.message({ from: LID, body: "linked", _data: { key: { remoteJidAlt: ANA } } }, { session: "a" });
  await h.message({ from: LID, body: "unlinked" }, { session: "b" });
  assert.deepEqual((await h.get("/chats", { session: "a" })).chats.map((c) => c.chatId), [ANA]);
  assert.deepEqual((await h.get("/chats", { session: "b" })).chats.map((c) => c.chatId), [LID]);
  assert.deepEqual(await h.sql("SELECT session, lid, pn FROM lid_map WHERE lid = $1", [LID]), [{ session: "a", lid: LID, pn: ANA }]);
});

test("a send leaves from the account it names, the primary one when it names none, and an unknown account is refused", async () => {
  const h = await two();
  const sent = () => h.requests.filter((r) => r.path === "/api/sendText").map((r) => [r.body.session, r.body.chatId, r.body.text]);
  await h.post("/send", { session: "b", chatId: ANA, text: "from Lucy" });
  await h.post("/send", { chatId: ANA, text: "from the shop" });
  assert.deepEqual(sent(), [["b", ANA, "from Lucy"], ["a", ANA, "from the shop"]]);
  assert.deepEqual((await h.sql("SELECT session, body FROM messages ORDER BY id")), [{ session: "b", body: "from Lucy" }, { session: "a", body: "from the shop" }]);
  // Per-chat WAHA paths carry the account's session too.
  await h.post("/typing", { session: "b", chatId: ANA, state: "composing" });
  assert.ok(h.requests.some((r) => r.path === "/api/b/presence"));
  const e = await fail(h.post("/send", { session: "nope", chatId: ANA, text: "x" }));
  assert.equal(e.status, 404); assert.equal(e.code, "unknown_account");
  assert.equal(sent().length, 2);
  // A reply can only quote a message of the same account.
  await h.message({ from: ANA, body: "question" }, { session: "a" });
  const q = (await h.messages(ANA, { session: "a" })).find((m) => m.body === "question");
  assert.equal((await fail(h.post("/send", { session: "b", chatId: ANA, text: "answer", replyTo: q.id }))).code, "invalid_reply");
});

test("agents: session is optional (the primary account), approvals name the account, /me lists every account", async () => {
  const h = await two();
  await h.get("/accounts"); // learns names and numbers from WAHA
  await h.message({ from: ANA, body: "hello shop" }, { session: "a" });
  await h.message({ from: BIA, body: "hello lucy" }, { session: "b" });
  assert.deepEqual((await h.call("/chats")).chats.map((c) => c.chatId), [ANA]);
  assert.deepEqual((await h.call("/chats", { session: "b" })).chats.map((c) => c.chatId), [BIA]);
  assert.deepEqual((await h.call("/messages", { session: "b", chatId: BIA })).messages.map((m) => m.body), ["hello lucy"]);
  assert.deepEqual(await h.call("/send", { session: "b", chatId: BIA, text: "hi" }).then((r) => r.status), "sent");
  assert.deepEqual(await h.call("/send", { chatId: ANA, text: "hi" }).then((r) => r.status), "sent");
  assert.deepEqual(h.approvals.map((a) => [a.userId, a.action]), [["u1", `Send WhatsApp message to ${BIA} from Lucy`], ["u1", `Send WhatsApp message to ${ANA} from Shop`]]);
  assert.deepEqual(h.requests.filter((r) => r.path === "/api/sendText").map((r) => r.body.session), ["b", "a"]);
  const me = await h.call("/me", { session: "b" });
  assert.equal(me.session, "b"); assert.deepEqual(me.account, { name: "Lucy", phone: "5511900000002" });
  assert.deepEqual(me.accounts.map((a) => [a.session, a.name, a.phone, a.primary]), [["a", "Shop", "5511900000001", true], ["b", "Lucy", "5511900000002", false]]);
  assert.deepEqual((await h.call("/diagnostics")).accounts.map((a) => a.session), ["a", "b"]);
  assert.equal((await fail(h.call("/chats", { session: "zzz" }))).code, "unknown_account");
  // message-me: the saved number is one for the whole inbox; the account it leaves from can be named.
  const h2 = await two({ phone: "+5511955556666" });
  await h2.call("/message-me", { text: "ping", session: "b" });
  await h2.call("/message-me", { text: "pong" });
  assert.deepEqual(h2.requests.filter((r) => r.path === "/api/sendText").map((r) => r.body.session), ["b", "a"]);
  assert.equal(h2.approvals.length, 0);
});

test("attach: lists the WAHA sessions that are not accounts yet, attaches one in a call, gives it Floq's webhook, and is idempotent", async () => {
  const sessions = { a: { status: "WORKING", me: { id: "5511900000001@c.us", pushName: "Shop" }, webhooks: [HOOK] }, lucy: { status: "WORKING", me: { id: "5534988110779@c.us", pushName: "SolutionsLucy" }, webhooks: [{ url: "https://other.example.com/x", events: ["*"] }] }, idle: { status: "STOPPED" } };
  const h = await harness(plugin, migrations, { kv: { accounts: [acct("a")] }, waha: waha(sessions), hmac: "s3cret" });
  assert.deepEqual((await h.get("/accounts/available")).sessions, [
    { name: "lucy", status: "WORKING", engine: "NOWEB", account: { name: "SolutionsLucy", phone: "5534988110779" } },
    { name: "idle", status: "STOPPED", engine: "NOWEB", account: null },
  ]);
  const r = await h.post("/accounts/attach", { name: "lucy" });
  assert.deepEqual(r, { ok: true, session: "lucy", status: "WORKING", webhook: "added" });
  // The other webhook of that session is kept; Floq's is added with every wanted event and the saved HMAC key.
  const put = h.requests.find((x) => x.method === "PUT" && x.path === "/api/sessions/lucy").body.config.webhooks;
  assert.equal(put.length, 2); assert.equal(put[0].url, "https://other.example.com/x");
  assert.equal(put[1].url, HOOK.url); assert.deepEqual(put[1].hmac, { key: "s3cret" });
  assert.ok(["message.any", "message.ack", "message.reaction", "session.status"].every((e) => put[1].events.includes(e)));
  assert.deepEqual(h.events.filter((e) => e.name === "accounts").length, 1);
  assert.deepEqual((await h.get("/accounts")).accounts.map((a) => [a.session, a.name, a.phone, a.primary]), [["a", "Shop", "5511900000001", true], ["lucy", "SolutionsLucy", "5534988110779", false]]);
  assert.deepEqual((await h.get("/accounts/available")).sessions.map((s) => s.name), ["idle"]);
  // Again: nothing changes, WAHA is not reconfigured twice.
  assert.equal((await h.post("/accounts/attach", { name: "lucy" })).webhook, "ok");
  assert.equal(h.requests.filter((x) => x.method === "PUT").length, 1);
  // A stopped session is started; one that already posts to Floq is left alone.
  sessions.idle.webhooks = [HOOK];
  assert.equal((await h.post("/accounts/attach", { name: "idle" })).webhook, "ok");
  assert.ok(h.requests.some((x) => x.method === "POST" && x.path === "/api/sessions/idle/start"));
  assert.equal((await fail(h.post("/accounts/attach", { name: "ghost" }))).code, "unknown_session");
  assert.equal((await fail(h.post("/accounts/attach", { name: "bad name!" }))).status, 400);
  assert.equal((await fail(h.post("/accounts/attach", { name: "lucy" }, "u2"))).status, 403);
});

test("link a new WhatsApp: creates a WAHA session with Floq's webhook, attaches it, and its QR and state are read by session", async () => {
  const sessions = { default: { status: "WORKING", me: { id: "5511900000001@c.us", pushName: "Shop" }, webhooks: [HOOK] } };
  const base = waha(sessions);
  const h = await harness(plugin, migrations, { waha: (m, p, req) => (p === "/api/floq-2/auth/qr" ? { json: { value: "QR-OF-FLOQ-2" } } : base(m, p, req)) });
  const r = await h.post("/accounts/create", { label: "Support" });
  assert.deepEqual(r, { ok: true, session: "floq-2", webhook: "added" });
  const created = h.requests.find((x) => x.method === "POST" && x.path === "/api/sessions").body;
  assert.equal(created.name, "floq-2"); assert.equal(created.start, true); assert.equal(created.config.webhooks[0].url, HOOK.url);
  assert.deepEqual((await h.get("/accounts")).accounts.map((a) => [a.session, a.label, a.status]), [["default", "", "WORKING"], ["floq-2", "Support", "SCAN_QR_CODE"]]);
  assert.equal((await h.get("/session", { session: "floq-2" })).status, "SCAN_QR_CODE");
  assert.deepEqual(await h.get("/session/qr", { session: "floq-2" }), { value: "QR-OF-FLOQ-2" });
  assert.equal((await fail(h.post("/accounts/create", { name: "default" }))).code, "session_exists");
  // The scan is announced for that account only.
  h.events.length = 0;
  await h.event("session.status", { status: "WORKING" }, { session: "floq-2", me: { id: "5521977776666@c.us", pushName: "Support" } });
  assert.deepEqual(h.events.filter((e) => e.name === "session"), [{ name: "session", status: "WORKING", session: "floq-2" }]);
  // Cancelled before the scan: the account goes and so does the never-linked WAHA session.
  await h.post("/accounts/create", { name: "tmp" });
  assert.deepEqual(await h.post("/accounts/remove", { session: "tmp", discard: true }), { ok: true, discarded: true, deletedData: true });
  assert.ok(h.requests.some((x) => x.method === "DELETE" && x.path === "/api/sessions/tmp"));
  assert.deepEqual(h.kv.get("accounts").map((a) => a.session), ["default", "floq-2"]);
});

test("remove from Floq: the account leaves the list, WAHA is not touched, stored chats stay unless asked, and the next account becomes primary", async () => {
  const h = await two();
  await h.message({ from: ANA, body: "shop chat" }, { session: "a" });
  await h.message({ from: BIA, body: "lucy chat" }, { session: "b" });
  const before = h.requests.length;
  assert.equal((await fail(h.post("/accounts/remove", {}))).code, "invalid_session"); // never the primary by default
  assert.deepEqual(await h.post("/accounts/remove", { session: "a" }), { ok: true, discarded: false, deletedData: false });
  assert.equal(h.requests.slice(before).filter((r) => r.method !== "GET").length, 0, "no logout, stop or delete in WAHA");
  assert.deepEqual((await h.get("/accounts")).accounts.map((a) => [a.session, a.primary]), [["b", true]]);
  assert.deepEqual((await h.chats()).map((c) => c.chatId), [BIA], "no session named: the new primary");
  assert.equal((await fail(h.get("/chats", { session: "a" }))).code, "unknown_account");
  // Its events are ignored from now on.
  await h.message({ from: ANA, body: "late" }, { session: "a" });
  assert.equal((await h.sql("SELECT COUNT(*)::int AS n FROM messages WHERE session = 'a'"))[0].n, 1);
  // Attached again: the chats are back.
  await h.post("/accounts/attach", { name: "a" });
  assert.deepEqual((await h.get("/chats", { session: "a" })).chats.map((c) => c.lastBody), ["shop chat"]);
  await h.idle();
  // Removed with its data: only that account's rows go.
  assert.deepEqual(await h.post("/accounts/remove", { session: "a", deleteData: true }), { ok: true, discarded: false, deletedData: true });
  assert.deepEqual(await h.sql("SELECT DISTINCT session FROM messages"), [{ session: "b" }]);
  assert.deepEqual(await h.sql("SELECT DISTINCT session FROM contacts"), [{ session: "b" }]);
  // The last account can be removed too: the inbox is then empty and says why a send cannot work.
  await h.post("/accounts/remove", { session: "b" });
  assert.deepEqual((await h.get("/accounts")).accounts, []);
  assert.deepEqual(await h.chats(), []);
  assert.equal((await fail(h.post("/send", { chatId: ANA, text: "x" }))).code, "no_account");
});

test("label and order: a label names the account everywhere, and the primary account is the one moved to the front", async () => {
  const h = await two();
  await h.post("/accounts/update", { session: "b", label: "  Personal  ", primary: true });
  assert.deepEqual((await h.get("/accounts")).accounts.map((a) => [a.session, a.label, a.primary]), [["b", "Personal", true], ["a", "", false]]);
  await h.post("/send", { chatId: ANA, text: "hi" });
  assert.equal(h.requests.find((r) => r.path === "/api/sendText").body.session, "b");
  await h.call("/send", { chatId: ANA, text: "hi", session: "b" });
  assert.match(h.approvals[0].action, / from Personal$/);
  assert.equal((await fail(h.post("/accounts/update", { label: "x" }))).code, "invalid_session");
});

test("WAHA down: the accounts are still listed, with why", async () => {
  const h = await harness(plugin, migrations, { kv: { accounts: [acct("a", { name: "Shop", phone: "5511900000001" }), acct("b")] }, down: true });
  assert.deepEqual((await h.get("/accounts")).accounts.map((a) => [a.session, a.name, a.status]), [["a", "Shop", "UNREACHABLE"], ["b", "", "UNREACHABLE"]]);
  assert.equal((await fail(h.get("/accounts/available"))).status, 502);
});
