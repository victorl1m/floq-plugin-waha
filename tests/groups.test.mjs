// Groups: details with a portable participant list (WEBJS, NOWEB and GOWS shapes), create, members, subject, description, invite link, settings, leave, webhooks.
import test, { before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { GROUP, LID, ME, MELID, PN, cleanup, harness, setup, teardown } from "./people-harness.mjs";

before(setup);
afterEach(teardown);
after(cleanup);

const G = encodeURIComponent(GROUP), BASE = "/api/default/groups/" + G;
const ANA = PN, BRUNO = "5511888887777@c.us", CARLA = "5531955554444@c.us";
const ok = (json = { ok: true }) => ({ status: 200, json });
const status = (s) => () => ({ status: s, json: {} });
const V2 = [
  { id: ME, role: "superadmin" }, { id: LID, pn: ANA, role: "admin" }, { id: BRUNO, role: "participant" }, { id: "777000777000777@lid", role: "participant" }, { id: CARLA, role: "left" },
];
/** A WAHA with one group; `raw` is the engine's own group object. */
const server = (raw, v2 = V2, extra) => (c) => {
  if (c.method === "GET" && c.rawPath === BASE) return ok(raw);
  if (c.method === "GET" && c.rawPath === BASE + "/participants/v2") return v2 === null ? { status: 500, json: {} } : ok(v2);
  return extra?.(c);
};
const NOWEB = { id: GROUP, subject: "Equipe Zoe", desc: "Produção e entregas", owner: ME, creation: 1700000000, announce: true, restrict: false };

test("details: normalised from the portable list; lid participants are mapped and linked; the subject names the chat", async () => {
  const h = await harness({ waha: server(NOWEB) });
  await h.hook({ from: BRUNO, body: "hi", pushName: "Bruno" });
  await h.hook({ from: GROUP, participant: BRUNO, body: "oi", pushName: "Bruno" });
  const g = await h.get("/group", { chatId: GROUP });
  assert.deepEqual(g, {
    chatId: GROUP, subject: "Equipe Zoe", description: "Produção e entregas", owner: ME, createdAt: "2023-11-14T22:13:20.000Z", size: 4, iAmAdmin: true, announce: true, restrict: false, avatar: null,
    participants: [
      { id: ME, name: "", phone: "5511000000000", role: "superadmin", isMe: true },
      { id: ANA, name: "", phone: "5534999990000", role: "admin", isMe: false },
      { id: BRUNO, name: "Bruno", phone: "5511888887777", role: "member", isMe: false },
      { id: "777000777000777@lid", name: "", phone: null, role: "member", isMe: false },
    ],
  });
  // pn + lid together teach the link; ids are canonical.
  assert.equal((await h.db.query("SELECT pn FROM lid_map WHERE lid = $1", [LID])).rows[0].pn, ANA);
  // The subject is stored so the chat list can show it.
  assert.equal((await h.chats()).find((c) => c.chatId === GROUP).name, "Equipe Zoe");
  assert.deepEqual(h.calls.filter((c) => c.rawPath.startsWith(BASE)).map((c) => c.rawPath), [BASE, BASE + "/participants/v2"]);
  // Cached: a second read is free, ?fresh=1 asks again.
  const n = h.calls.length;
  await h.get("/group", { chatId: GROUP });
  assert.equal(h.calls.length, n);
  await h.get("/group", { chatId: GROUP, fresh: "1" });
  assert.ok(h.calls.length > n);
});

test("details: lid participants learned earlier show their saved name and phone; I am recognised by my lid", async () => {
  const h = await harness({ waha: server(NOWEB, [{ id: MELID, role: "admin" }, { id: LID, role: "participant" }]) });
  await h.hook({ from: "5511000000000@c.us", body: "x", fromMe: true, to: PN }, { me: { id: ME, lid: MELID, pushName: "Me" } });
  await h.hook({ from: LID, body: "hi", pushName: "Ana", _data: { key: { remoteJidAlt: ANA } } });
  const g = await h.get("/group", { chatId: GROUP });
  assert.deepEqual(g.participants.map((p) => [p.id, p.name, p.isMe, p.role]), [[ME, "", true, "admin"], [ANA, "Ana", false, "member"]]);
  assert.equal(g.iAmAdmin, true);
});

test("details: WEBJS raw group when the v2 list is not available", async () => {
  const webjs = { id: { _serialized: GROUP }, subject: "Old school", desc: "d", owner: { _serialized: ME }, creation: 1700000000, restrict: true, announce: false,
    participants: [{ id: { _serialized: ME }, isAdmin: true, isSuperAdmin: true }, { id: { _serialized: BRUNO }, isAdmin: false, isSuperAdmin: false }, { id: { _serialized: ANA }, isAdmin: true, isSuperAdmin: false }] };
  const h = await harness({ waha: server(webjs, null) });
  const g = await h.get("/group", { chatId: GROUP });
  assert.deepEqual(g.participants.map((p) => [p.id, p.role, p.isMe]), [[ME, "superadmin", true], [ANA, "admin", false], [BRUNO, "member", false]]);
  assert.deepEqual([g.subject, g.description, g.restrict, g.announce, g.iAmAdmin, g.size], ["Old school", "d", true, false, true, 3]);
});

test("details: GOWS raw group (JID, Name, Topic, IsAnnounce, IsLocked, PhoneNumber) when there is no v2 list", async () => {
  const gows = { JID: GROUP, Name: "Gows group", Topic: "topic", OwnerJID: LID, GroupCreated: "2024-01-02T03:04:05Z", IsAnnounce: true, IsLocked: true,
    Participants: [{ JID: LID, PhoneNumber: ANA, IsAdmin: true, IsSuperAdmin: true }, { JID: BRUNO, IsAdmin: false }] };
  const h = await harness({ waha: server({ ...gows, participants: gows.Participants }, null) });
  const g = await h.get("/group", { chatId: GROUP });
  assert.deepEqual([g.subject, g.description, g.announce, g.restrict, g.createdAt, g.owner], ["Gows group", "topic", true, true, "2024-01-02T03:04:05.000Z", ANA]);
  assert.deepEqual(g.participants.map((p) => [p.id, p.role]), [[ANA, "superadmin"], [BRUNO, "member"]]);
  assert.equal((await h.db.query("SELECT pn FROM lid_map WHERE lid = $1", [LID])).rows[0].pn, ANA);
});

test("details: a group WAHA cannot describe is a 502, and a 1:1 chat id is a 400", async () => {
  const h = await harness({ waha: status(500) });
  await assert.rejects(h.get("/group", { chatId: GROUP }), { status: 502 });
  await assert.rejects(h.get("/group", { chatId: PN }), { status: 400, code: "invalid_chat" });
  await assert.rejects(h.get("/group", {}), { status: 400, code: "invalid_chat" });
});

test("create: WAHA group with phone ids, the new chat id comes back and the name is stored", async () => {
  const h = await harness({ waha: (c) => (c.method === "POST" && c.rawPath === "/api/default/groups" ? ok({ id: { _serialized: GROUP }, subject: "New one" }) : undefined) });
  await h.hook({ from: LID, body: "b", _data: { key: { remoteJidAlt: ANA } } });
  h.calls.length = 0;
  assert.deepEqual(await h.post("/group/create", { name: " Team ", participants: [LID, BRUNO, BRUNO] }), { chatId: GROUP });
  assert.deepEqual(h.calls[0].body, { session: undefined, name: "Team", participants: [{ id: ANA }, { id: BRUNO }] }.session === undefined ? { name: "Team", participants: [{ id: ANA }, { id: BRUNO }] } : null);
  assert.equal((await h.db.query("SELECT name FROM contacts WHERE chat_id = $1", [GROUP])).rows[0].name, "Team");
  assert.equal(h.events.some((e) => e.name === "chats"), true);
  // Engines that answer with other shapes.
  for (const raw of [{ gid: GROUP }, { JID: GROUP }, { groupMetadata: { id: GROUP } }]) {
    const g = await harness({ waha: (c) => (c.method === "POST" ? ok(raw) : undefined) });
    assert.deepEqual(await g.post("/group/create", { name: "x", participants: [] }), { chatId: GROUP });
    await teardown();
  }
  const none = await harness({ waha: () => ok({}) });
  await assert.rejects(none.post("/group/create", { name: "x", participants: [] }), { status: 502 });
});

test("participants: add, remove, promote, demote hit the right WAHA endpoint with phone ids", async () => {
  const h = await harness({ waha: () => ok() });
  await h.hook({ from: LID, body: "b", _data: { key: { remoteJidAlt: ANA } } });
  for (const [action, path] of [["add", "/participants/add"], ["remove", "/participants/remove"], ["promote", "/admin/promote"], ["demote", "/admin/demote"]]) {
    h.calls.length = 0;
    assert.deepEqual(await h.post("/group/participants", { chatId: GROUP, action, participants: [LID, BRUNO] }), { ok: true });
    assert.equal(h.calls[0].method + " " + h.calls[0].rawPath, "POST " + BASE + path);
    assert.deepEqual(h.calls[0].body, { participants: [{ id: ANA }, { id: BRUNO }] });
  }
  // A person known only by lid is addressed by it.
  h.calls.length = 0;
  await h.post("/group/participants", { chatId: GROUP, action: "add", participants: ["777000777000777@lid"] });
  assert.deepEqual(h.calls[0].body, { participants: [{ id: "777000777000777@lid" }] });
  assert.equal(h.events.some((e) => e.name === "group" && e.chatId === GROUP), true);
});

test("participants: a change drops the cache so the next read is fresh", async () => {
  let members = [{ id: ME, role: "superadmin" }];
  const h = await harness({ waha: (c) => (c.method === "GET" && c.rawPath === BASE ? ok(NOWEB) : c.rawPath === BASE + "/participants/v2" ? ok(members) : ok()) });
  assert.equal((await h.get("/group", { chatId: GROUP })).size, 1);
  members = [...members, { id: BRUNO, role: "participant" }];
  await h.post("/group/participants", { chatId: GROUP, action: "add", participants: [BRUNO] });
  assert.equal((await h.get("/group", { chatId: GROUP })).size, 2);
});

test("subject and description", async () => {
  const h = await harness({ waha: () => ok() });
  assert.deepEqual(await h.post("/group/subject", { chatId: GROUP, subject: " Novo nome " }), { ok: true, subject: "Novo nome" });
  assert.equal(h.calls[0].method + " " + h.calls[0].rawPath, "PUT " + BASE + "/subject");
  assert.deepEqual(h.calls[0].body, { subject: "Novo nome" });
  assert.equal((await h.db.query("SELECT name FROM contacts WHERE chat_id = $1", [GROUP])).rows[0].name, "Novo nome");
  assert.deepEqual(await h.post("/group/description", { chatId: GROUP, description: " Regras\ndo grupo " }), { ok: true, description: "Regras\ndo grupo" });
  assert.equal(h.calls[1].method + " " + h.calls[1].rawPath, "PUT " + BASE + "/description");
  assert.deepEqual(h.calls[1].body, { description: "Regras\ndo grupo" });
  // An empty description clears it.
  await h.post("/group/description", { chatId: GROUP, description: "" });
  assert.deepEqual(h.calls[2].body, { description: "" });
});

test("invite link: from a bare code, an object or a full link; revoke returns the new one", async () => {
  for (const [answer, code] of [["AbCdEfGhIjK123", "AbCdEfGhIjK123"], [{ code: "ZzZzZzZzZz99" }, "ZzZzZzZzZz99"], [{ inviteCode: "QqQqQqQqQq77" }, "QqQqQqQqQq77"], ["https://chat.whatsapp.com/LlLlLlLlLl55", "LlLlLlLlLl55"]]) {
    const h = await harness({ waha: (c) => (c.rawPath === BASE + "/invite-code" ? ok(answer) : undefined) });
    assert.deepEqual(await h.get("/group/invite", { chatId: GROUP }), { link: "https://chat.whatsapp.com/" + code });
    await teardown();
  }
  const h = await harness({ waha: (c) => (c.method === "POST" && c.rawPath === BASE + "/invite-code/revoke" ? ok({ code: "NewCodeNewCode1" }) : undefined) });
  assert.deepEqual(await h.post("/group/invite/revoke", { chatId: GROUP }), { link: "https://chat.whatsapp.com/NewCodeNewCode1" });
  await teardown();
  // Revoke that answers nothing: ask for the new code.
  const g = await harness({ waha: (c) => (c.method === "POST" ? ok(null) : c.rawPath === BASE + "/invite-code" ? ok("AfterRevoke123") : undefined) });
  assert.deepEqual(await g.post("/group/invite/revoke", { chatId: GROUP }), { link: "https://chat.whatsapp.com/AfterRevoke123" });
  await teardown();
  const bad = await harness({ waha: () => ok({ nothing: true }) });
  await assert.rejects(bad.get("/group/invite", { chatId: GROUP }), { status: 502 });
});

test("leave", async () => {
  const h = await harness({ waha: () => ok() });
  assert.deepEqual(await h.post("/group/leave", { chatId: GROUP }), { ok: true });
  assert.equal(h.calls[0].method + " " + h.calls[0].rawPath, "POST " + BASE + "/leave");
});

test("settings: announce and restrict map to the admins-only endpoints", async () => {
  const h = await harness({ waha: () => ok() });
  await h.post("/group/settings", { chatId: GROUP, announce: true, restrict: false });
  assert.deepEqual(h.calls.map((c) => [c.method, c.rawPath, c.body]), [
    ["PUT", BASE + "/settings/security/messages-admin-only", { adminsOnly: true }],
    ["PUT", BASE + "/settings/security/info-admin-only", { adminsOnly: false }],
  ]);
  h.calls.length = 0;
  await h.post("/group/settings", { chatId: GROUP, restrict: true });
  assert.deepEqual(h.calls.map((c) => c.rawPath), [BASE + "/settings/security/info-admin-only"]);
  for (const body of [{}, { announce: "yes" }, { restrict: 1 }]) await assert.rejects(h.post("/group/settings", { chatId: GROUP, ...body }), { status: 400, code: "invalid_settings" });
});

test("webhooks: join, leave, update and participants refresh the cache, learn the subject and tell the UI", async () => {
  let subject = "Before";
  const h = await harness({ waha: (c) => (c.method === "GET" && c.rawPath === BASE ? ok({ ...NOWEB, subject }) : c.rawPath === BASE + "/participants/v2" ? ok(V2) : undefined) });
  assert.equal((await h.get("/group", { chatId: GROUP })).subject, "Before");
  subject = "After";
  h.events.length = 0;
  await h.event("group.v2.update", { group: { id: GROUP, subject: "After" }, timestamp: 1 });
  assert.equal((await h.db.query("SELECT name FROM contacts WHERE chat_id = $1", [GROUP])).rows[0].name, "After");
  assert.equal((await h.get("/group", { chatId: GROUP })).subject, "After");
  assert.equal(h.events.some((e) => e.name === "chats"), true);
  for (const ev of ["group.v2.join", "group.v2.leave", "group.v2.participants"]) {
    h.events.length = 0;
    await h.event(ev, { group: { id: GROUP }, timestamp: 2 });
    assert.equal(h.events.some((e) => e.name === "chats"), true, ev);
  }
  // Junk is ignored.
  h.events.length = 0;
  await h.event("group.v2.update", { group: { id: "not-a-group" } });
  await h.event("group.v2.update", {});
  assert.deepEqual(h.events, []);
});

const routes = [
  ["GET", "/group", { chatId: GROUP }], ["POST", "/group/create", { name: "x", participants: [] }], ["POST", "/group/participants", { chatId: GROUP, action: "add", participants: [BRUNO] }],
  ["POST", "/group/subject", { chatId: GROUP, subject: "x" }], ["POST", "/group/description", { chatId: GROUP, description: "x" }], ["GET", "/group/invite", { chatId: GROUP }],
  ["POST", "/group/invite/revoke", { chatId: GROUP }], ["POST", "/group/leave", { chatId: GROUP }], ["POST", "/group/settings", { chatId: GROUP, announce: true }],
];
const call = (h, [m, p, b], userId = "u1") => (m === "GET" ? h.get(p, b, userId) : h.post(p, b, userId));

test("only the owner may use the routes (403) and WAHA is not called", async () => {
  const h = await harness({ waha: () => ok() });
  for (const r of routes) await assert.rejects(call(h, r, "someone-else"), { status: 403 });
  assert.deepEqual(h.calls, []);
});

test("bad input is a 400", async () => {
  const h = await harness({ waha: () => ok() });
  for (const r of routes.filter((r) => r[2].chatId)) for (const chatId of [undefined, "", "bad id", PN]) await assert.rejects(call(h, [r[0], r[1], { ...r[2], chatId }]), { status: 400, code: "invalid_chat" });
  for (const name of [undefined, "", "  ", "x".repeat(101), 5]) await assert.rejects(h.post("/group/create", { name, participants: [] }), { status: 400, code: "invalid_name" });
  await assert.rejects(h.post("/group/create", { name: "x", participants: [GROUP] }), { status: 400, code: "invalid_chat" });
  await assert.rejects(h.post("/group/create", { name: "x", participants: ["bad id"] }), { status: 400, code: "invalid_chat" });
  for (const action of [undefined, "ban", "", "constructor"]) await assert.rejects(h.post("/group/participants", { chatId: GROUP, action, participants: [BRUNO] }), { status: 400, code: "invalid_action" });
  for (const participants of [undefined, [], "x", Array.from({ length: 51 }, (_, i) => `55119000${String(i).padStart(5, "0")}@c.us`)]) await assert.rejects(h.post("/group/participants", { chatId: GROUP, action: "add", participants }), { status: 400, code: "invalid_participants" });
  for (const subject of [undefined, "", "x".repeat(101)]) await assert.rejects(h.post("/group/subject", { chatId: GROUP, subject }), { status: 400, code: "invalid_subject" });
  for (const description of [undefined, 5, "x".repeat(2049)]) await assert.rejects(h.post("/group/description", { chatId: GROUP, description }), { status: 400, code: "invalid_description" });
  assert.deepEqual(h.calls, []);
});

test("an engine without it answers 501 unsupported; WAHA down answers 502; a disconnected session 409", async () => {
  const h = await harness({ waha: status(501) });
  for (const r of routes) await assert.rejects(call(h, r), { status: 501, code: "unsupported" });
  await teardown();
  const d = await harness({ waha: status(0) });
  for (const r of routes) await assert.rejects(call(d, r), { status: 502, code: "waha_unavailable" });
  const e = await d.post("/group/leave", { chatId: GROUP }).catch((x) => x);
  assert.doesNotMatch(String(e.message), /waha\.example|key/i);
  await teardown();
  const s = await harness({ waha: status(422) });
  for (const r of routes) await assert.rejects(call(s, r), { status: 409, code: "session_not_ready" });
});
