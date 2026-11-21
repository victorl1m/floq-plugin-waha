// Contacts: the picker list, number checks (incl. the Brazilian ninth digit), contact details and actions.
import test, { before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { LID, PN, GROUP, cleanup, harness, setup, teardown } from "./people-harness.mjs";

before(setup);
afterEach(teardown);
after(cleanup);

const E = encodeURIComponent(PN);
const ok = (json = { ok: true }) => ({ status: 200, json });
const status = (s) => () => ({ status: s, json: {} });
const ALL = [
  { id: PN, number: "5534999990000", name: "Ana Souza", pushname: "Aninha", isMyContact: true, isGroup: false },
  { id: "5511888887777@c.us", number: "5511888887777", name: "", pushname: "Bruno", isMyContact: false },
  { id: "5511000000000@c.us", number: "5511000000000", name: "Me", isMe: true },
  { id: GROUP, name: "Team", isGroup: true },
  { id: "5521977776666@c.us", number: "5521977776666", name: "5521977776666", pushname: "", isMyContact: false },
  { id: "status@broadcast", name: "x" },
];
const ctcs = (h) => h.calls.filter((c) => c.rawPath === "/api/contacts/all");

test("the picker list merges WAHA contacts with the inbox's own, by canonical id, and drops yourself and groups", async () => {
  const h = await harness({ waha: (c) => (c.rawPath === "/api/contacts/all" ? ok(ALL) : undefined) });
  // Ana also writes from a lid; Carla is known only from a message.
  await h.hook({ from: LID, body: "hi", pushName: "Ana P", _data: { key: { remoteJidAlt: PN } } });
  await h.hook({ from: "5531955554444@c.us", body: "oi", pushName: "Carla" });
  const { contacts } = await h.get("/contacts");
  assert.deepEqual(contacts.map((c) => [c.chatId, c.name, c.phone, c.isMyContact]), [
    [PN, "Ana Souza", "5534999990000", true],
    ["5511888887777@c.us", "Bruno", "5511888887777", false],
    ["5531955554444@c.us", "Carla", "5531955554444", false],
    ["5521977776666@c.us", null, "5521977776666", false],
  ]);
  assert.deepEqual(Object.keys(contacts[0]).sort(), ["avatar", "chatId", "isMyContact", "name", "phone"]);
  assert.deepEqual(ctcs(h).map((c) => [c.query.limit, c.query.session]), [["1000", "default"]]);
});

test("the list is searched by name (accents ignored) and number, limited, and cached for five minutes", async () => {
  const h = await harness({ waha: (c) => (c.rawPath === "/api/contacts/all" ? ok(ALL) : undefined) });
  assert.deepEqual((await h.get("/contacts", { q: "aninha" })).contacts.length, 0);
  assert.deepEqual((await h.get("/contacts", { q: "ANA sou" })).contacts.map((c) => c.chatId), [PN]);
  assert.deepEqual((await h.get("/contacts", { q: "99999" })).contacts.map((c) => c.chatId), [PN]);
  assert.deepEqual((await h.get("/contacts", { q: "+55 11 88888" })).contacts.map((c) => c.chatId), ["5511888887777@c.us"]);
  assert.equal((await h.get("/contacts", { limit: "2" })).contacts.length, 2);
  assert.equal((await h.get("/contacts", { limit: "nonsense" })).contacts.length, 3);
  assert.equal(ctcs(h).length, 1);
});

test("without WAHA's list the picker still shows the inbox's own contacts", async () => {
  const h = await harness({ waha: status(500) });
  await h.hook({ from: PN, body: "hi", pushName: "Ana" });
  assert.deepEqual((await h.get("/contacts")).contacts.map((c) => [c.chatId, c.name]), [[PN, "Ana"]]);
});

test("check: the typed number as WAHA knows it; identity learns the pair", async () => {
  const h = await harness({ waha: (c) => (c.rawPath === "/api/contacts/check-exists" ? ok({ numberExists: true, chatId: LID, pn: PN }) : undefined) });
  assert.deepEqual(await h.post("/contacts/check", { phone: "+55 34 99999-0000" }), { exists: true, chatId: PN, phone: "5534999990000" });
  const q = h.calls.find((c) => c.rawPath === "/api/contacts/check-exists");
  assert.deepEqual(q.query, { phone: "5534999990000", session: "default" });
  // The lid pair, and the other spelling of this Brazilian number folded into the same chat.
  assert.deepEqual((await h.db.query("SELECT lid, pn FROM lid_map ORDER BY lid")).rows, [{ lid: LID, pn: PN }, { lid: "553499990000@c.us", pn: PN }]);
  // Other engines answer with the phone id only.
  const g = await harness({ waha: (c) => (c.rawPath === "/api/contacts/check-exists" ? ok({ numberExists: true, chatId: "5511888887777@c.us" }) : undefined) });
  assert.deepEqual(await g.post("/contacts/check", { phone: "5511888887777" }), { exists: true, chatId: "5511888887777@c.us", phone: "5511888887777" });
});

test("check: a Brazilian number is tried with and without the ninth digit", async () => {
  const seen = [];
  const h = await harness({ waha: (c) => { if (c.rawPath !== "/api/contacts/check-exists") return undefined; seen.push(c.query.phone); return ok(c.query.phone === "553188887777" ? { numberExists: true, chatId: "553188887777@c.us" } : { numberExists: false }); } });
  assert.deepEqual(await h.post("/contacts/check", { phone: "+55 31 98888-7777" }), { exists: true, chatId: "553188887777@c.us", phone: "5531988887777" });
  assert.deepEqual(seen, ["5531988888777".replace("8888777", "988887777").slice(0, 0) || "5531988887777", "553188887777"]);
  // The two spellings are now one chat.
  assert.equal(await (async () => (await h.db.query("SELECT COUNT(*)::int AS n FROM lid_map")).rows[0].n)(), 1);
  // Typed without the digit, registered with it.
  const g = await harness({ waha: (c) => (c.rawPath === "/api/contacts/check-exists" ? ok(c.query.phone === "5531988887777" ? { numberExists: true, chatId: "5531988887777@c.us" } : { numberExists: false }) : undefined) });
  assert.deepEqual(await g.post("/contacts/check", { phone: "553188887777" }), { exists: true, chatId: "5531988887777@c.us", phone: "5531988887777" });
});

test("check: not on WhatsApp, and a non-Brazilian number is asked once", async () => {
  const h = await harness({ waha: (c) => (c.rawPath === "/api/contacts/check-exists" ? ok({ numberExists: false }) : undefined) });
  assert.deepEqual(await h.post("/contacts/check", { phone: "+44 7911 123456" }), { exists: false, chatId: null, phone: "447911123456" });
  assert.equal(h.calls.filter((c) => c.rawPath === "/api/contacts/check-exists").length, 1);
});

test("contact: details from the inbox, merged across both addresses, about from WEBJS, refreshed when stale", async () => {
  const h = await harness({ waha: (c) => {
    if (c.rawPath === "/api/sessions/default") return ok({ engine: { engine: "WEBJS" } });
    if (c.rawPath === "/api/contacts/about") return ok({ about: "Hey there" });
    if (c.rawPath === "/api/contacts") return ok({ id: PN, name: "Ana Souza", pushname: "Aninha", isBlocked: false, isBusiness: true });
    if (c.rawPath === "/api/contacts/profile-picture") return ok({ profilePictureURL: null });
  } });
  await h.hook({ from: LID, body: "hi", pushName: "Ana P", _data: { key: { remoteJidAlt: PN } } });
  const r = await h.get("/contact", { chatId: LID });
  assert.deepEqual(r, { chatId: PN, name: "Ana Souza", pushName: "Aninha", phone: "5534999990000", about: "Hey there", blocked: false, isBusiness: true, isSelf: false, avatar: null, aliases: 3, commonGroups: [] });
  assert.deepEqual(h.calls.find((c) => c.rawPath === "/api/contacts/about").query, { contactId: LID, session: "default" });
  // Fresh now: a second read does not ask WAHA again.
  const n = h.calls.length;
  await h.get("/contact", { chatId: PN });
  assert.equal(h.calls.length, n);
});

test("contact: no about call on engines without it; yourself is flagged; groups are refused", async () => {
  const h = await harness({ waha: (c) => (c.rawPath === "/api/sessions/default" ? ok({ engine: { engine: "NOWEB" } }) : undefined) });
  await h.hook({ from: "5511000000000@c.us", body: "note to self" });
  const r = await h.get("/contact", { chatId: "5511000000000@c.us" });
  assert.equal(r.isSelf, true);
  assert.equal(h.calls.some((c) => c.rawPath === "/api/contacts/about"), false);
  await assert.rejects(h.get("/contact", { chatId: GROUP }), { status: 400, code: "invalid_chat" });
});

test("block and unblock: WAHA call, flag on the chat list", async () => {
  const h = await harness({ waha: () => ok() });
  await h.hook({ from: PN, body: "hi" });
  h.last();
  assert.deepEqual(await h.post("/contact/block", { chatId: PN, blocked: true }), { ok: true, blocked: true });
  assert.deepEqual(h.calls.at(-1).body, { contactId: PN, session: "default" });
  assert.equal(h.calls.at(-1).rawPath, "/api/contacts/block");
  assert.equal((await h.chats())[0].blocked, true);
  await h.post("/contact/block", { chatId: PN, blocked: false });
  assert.equal(h.calls.filter((c) => c.method === "POST").at(-1).rawPath, "/api/contacts/unblock");
  assert.equal((await h.chats())[0].blocked, false);
  await assert.rejects(h.post("/contact/block", { chatId: PN, blocked: "yes" }), { status: 400 });
});

test("refresh picture: asks WAHA to refresh, stores the new picture", async () => {
  const h = await harness({ waha: (c) => {
    if (c.rawPath === "/api/contacts/profile-picture") return ok({ profilePictureURL: "https://waha.example.com/api/files/pic.jpg" });
    if (c.rawPath === "/api/files/pic.jpg") return ok();
    if (c.rawPath.endsWith("/picture")) return ok({ url: null });
  } });
  const r = await h.post("/contact/refresh-picture", { chatId: PN });
  const q = h.calls.find((c) => c.rawPath === "/api/contacts/profile-picture");
  assert.deepEqual(q.query, { contactId: PN, refresh: "true", session: "default" });
  assert.equal(r.ok, true);
  assert.equal((await h.db.query("SELECT COUNT(*)::int AS n FROM contacts WHERE chat_id = $1", [PN])).rows[0].n, 1);
  // Groups use the chat picture endpoint.
  await h.post("/contact/refresh-picture", { chatId: GROUP });
  assert.equal(h.calls.some((c) => c.rawPath === `/api/default/chats/${encodeURIComponent(GROUP)}/picture` && c.query.refresh === "true"), true);
});

test("save: address book upsert, name shows in the inbox", async () => {
  const h = await harness({ waha: () => ok() });
  await h.hook({ from: PN, body: "hi" });
  assert.deepEqual(await h.post("/contact/save", { chatId: PN, firstName: "Ana", lastName: "Souza" }), { ok: true, name: "Ana Souza" });
  const c = h.calls.find((x) => x.method === "PUT");
  assert.equal(c.rawPath, `/api/default/contacts/${E}`);
  assert.deepEqual(c.body, { firstName: "Ana", lastName: "Souza" });
  assert.equal((await h.chats())[0].name, "Ana Souza");
  await h.post("/contact/save", { chatId: PN, firstName: "Ana" });
  assert.deepEqual(h.calls.filter((x) => x.method === "PUT").at(-1).body, { firstName: "Ana", lastName: "" });
  for (const firstName of [undefined, "", "  ", "x".repeat(81)]) await assert.rejects(h.post("/contact/save", { chatId: PN, firstName }), { status: 400, code: "invalid_firstName" });
});

const routes = [
  ["GET", "/contacts", {}], ["POST", "/contacts/check", { phone: "+5511999990000" }], ["GET", "/contact", { chatId: PN }], ["POST", "/contact/block", { chatId: PN, blocked: true }],
  ["POST", "/contact/refresh-picture", { chatId: PN }], ["POST", "/contact/save", { chatId: PN, firstName: "A" }],
];
const call = (h, [m, p, b], userId = "u1") => (m === "GET" ? h.get(p, b, userId) : h.post(p, b, userId));

test("only the owner may use the routes (403)", async () => {
  const h = await harness({ waha: () => ok() });
  for (const r of routes) await assert.rejects(call(h, r, "someone-else"), { status: 403 });
  assert.deepEqual(h.calls, []);
});

test("bad input is a 400", async () => {
  const h = await harness({ waha: () => ok() });
  for (const phone of [undefined, "", "abc", "123", "+1 (555) 12", 5, "+" + "9".repeat(20)]) await assert.rejects(h.post("/contacts/check", { phone }), { status: 400, code: "invalid_phone" });
  for (const chatId of [undefined, "", "bad id"]) for (const r of routes.slice(2)) await assert.rejects(call(h, [r[0], r[1], { ...r[2], chatId }]), { status: 400, code: "invalid_chat" });
  assert.deepEqual(h.calls, []);
});

test("an engine without the feature answers 501 unsupported; WAHA down answers 502", async () => {
  const h = await harness({ waha: status(501) });
  for (const r of [routes[1], routes[3], routes[4], routes[5]]) await assert.rejects(call(h, r), { status: 501, code: "unsupported" });
  await teardown();
  const d = await harness({ waha: status(0) });
  for (const r of [routes[1], routes[3], routes[4], routes[5]]) await assert.rejects(call(d, r), { status: 502, code: "waha_unavailable" });
  const e = await d.post("/contacts/check", { phone: "+5511999990000" }).catch((x) => x);
  assert.doesNotMatch(String(e.message), /waha\.example|key/i);
});
