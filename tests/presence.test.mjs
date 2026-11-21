// Presence: GET /presence (cached 10 s), presence.update events pushed to the UI, the account's own online state.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { harness, load, rejects } from "./_more-harness.mjs";

let rt;
before(async () => { rt = await load(); });
after(() => rt.cleanup());
const owner403 = async (h, calls) => { for (const [m, p, b] of calls) await rejects(assert, m === "get" ? h.get(p, b ?? {}, "u2") : h.post(p, b ?? {}, "u2"), 403); };

const PN = "5534999990000@c.us", LID = "123456789012345@lid", GROUP = "120363041234567890@g.us", P1 = "5511911112222@c.us";
const mk = (extra = {}) => harness(rt, [], ({ method, path, body }) => {
  if (extra.fail) return { status: extra.fail, json: {} };
  if (method === "GET" && path === "/api/default/presence/" + encodeURIComponent(PN)) return { status: 200, json: { id: PN, presences: [{ participant: PN, lastKnownPresence: "online", lastSeen: null }] } };
  if (method === "GET" && path === "/api/default/presence/" + encodeURIComponent("5511000000000@c.us")) return { status: 200, json: { id: "5511000000000@c.us", presences: [{ participant: "5511000000000@c.us", lastKnownPresence: "offline", lastSeen: 1700000000 }] } };
  if (method === "GET" && path === "/api/default/presence/" + encodeURIComponent(GROUP)) return { status: 200, json: { id: GROUP, presences: [{ participant: P1, lastKnownPresence: "typing", lastSeen: null }, { participant: "5511933334444@c.us", lastKnownPresence: "online", lastSeen: null }] } };
  if (method === "GET" && path.startsWith("/api/default/presence/")) return { status: 404, json: {} };
  if (method === "POST" && path === "/api/default/presence") return { status: 201, json: {} };
});

test("1:1 chat: state and last seen as ISO, subscribed by the first read, cached for 10 seconds", async () => {
  const h = await mk();
  assert.deepEqual(await h.get("/presence", { chatId: PN }), { chatId: PN, state: "online", lastSeen: null });
  const off = await h.get("/presence", { chatId: "5511000000000@c.us" });
  assert.deepEqual(off, { chatId: "5511000000000@c.us", state: "offline", lastSeen: new Date(1700000000 * 1000).toISOString() });
  await h.get("/presence", { chatId: PN });
  assert.equal(h.reqs.filter((r) => r.path.endsWith(encodeURIComponent(PN))).length, 1);
});

test("a lid chat resolves to its canonical id and is asked under the route address", async () => {
  const h = await mk();
  await h.db.query("INSERT INTO lid_map (user_id, lid, pn) VALUES ('u1', $1, $2)", [LID, PN]);
  const r = await h.get("/presence", { chatId: LID });
  assert.equal(r.chatId, PN);
  assert.equal(r.state, "online");
});

test("group: who is typing, with names", async () => {
  const h = await mk();
  await h.db.query("INSERT INTO contacts (user_id, chat_id, name) VALUES ('u1', $1, 'Rafael Souza')", [P1]);
  assert.deepEqual(await h.get("/presence", { chatId: GROUP }), { chatId: GROUP, state: "typing", lastSeen: null, participants: [{ id: P1, name: "Rafael Souza", state: "typing" }] });
});

test("a chat WAHA knows nothing about is unknown, not an error", async () => {
  const h = await mk();
  assert.deepEqual(await h.get("/presence", { chatId: "5599999999999@c.us" }), { chatId: "5599999999999@c.us", state: "unknown", lastSeen: null });
});

test("presence.update is pushed to the UI with the canonical chat id; a group update names the participant; the cache is dropped", async () => {
  const h = await mk();
  await h.db.query("INSERT INTO lid_map (user_id, lid, pn) VALUES ('u1', $1, $2)", [LID, PN]);
  await h.get("/presence", { chatId: PN });
  await h.event("presence.update", { id: LID, presences: [{ participant: LID, lastKnownPresence: "typing", lastSeen: null }] });
  assert.deepEqual(h.events.find((e) => e.name === "presence"), { name: "presence", chatId: PN, state: "typing", lastSeen: null });
  await h.get("/presence", { chatId: PN });
  assert.equal(h.reqs.filter((r) => r.path.endsWith(encodeURIComponent(PN))).length, 2, "an update invalidates the cached answer");
  h.events.length = 0;
  await h.event("presence.update", { id: GROUP, presences: [{ participant: P1, lastKnownPresence: "recording", lastSeen: null }] });
  assert.deepEqual(h.events, [{ name: "presence", chatId: GROUP, state: "recording", lastSeen: null, participant: P1 }]);
  await h.event("presence.update", { id: "", presences: [] });
});

test("POST /presence/me sets the session online or offline", async () => {
  const h = await mk();
  assert.deepEqual(await h.post("/presence/me", { online: true }), { ok: true, online: true });
  assert.deepEqual(h.last("POST", "/presence").body, { presence: "online" });
  await h.post("/presence/me", { online: false });
  assert.deepEqual(h.last("POST", "/presence").body, { presence: "offline" });
});

test("bad input 400, non-owner 403, engine without it 501, WAHA down 502", async () => {
  const h = await mk();
  await rejects(assert, h.get("/presence", {}), 400, "invalid_chat");
  await rejects(assert, h.post("/presence/me", { online: "yes" }), 400, "invalid_online");
  await owner403(h, [["get", "/presence", { chatId: PN }], ["post", "/presence/me", { online: true }]]);
  const old = await mk({ fail: 501 });
  await rejects(assert, old.get("/presence", { chatId: PN }), 501, "unsupported");
  await rejects(assert, old.post("/presence/me", { online: true }), 501, "unsupported");
  old.setDown(true);
  await rejects(assert, old.get("/presence", { chatId: PN }), 502);
  await rejects(assert, old.post("/presence/me", { online: false }), 502);
});
