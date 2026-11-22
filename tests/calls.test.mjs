// Calls: events become a chat entry, a toast and a "call" UI event; the UI can decline.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { harness, load, rejects } from "./_more-harness.mjs";

let rt;
before(async () => { rt = await load(); });
after(() => rt.cleanup());
const owner403 = async (h, calls) => { for (const [m, p, b] of calls) await rejects(assert, m === "get" ? h.get(p, b ?? {}, "u2") : h.post(p, b ?? {}, "u2"), 403); };

const PN = "5534999990000@c.us", LID = "123456789012345@lid";
const call = (o = {}) => ({ id: "CALL1", from: PN, timestamp: Math.floor(Date.now() / 1000), isVideo: false, isGroup: false, _data: {}, ...o });
const mk = (extra = {}) => harness(rt, [], ({ method, path }) => {
  if (method === "POST" && path === "/api/default/calls/reject") return { status: extra.fail ?? 201, json: {} };
});
const entry = async (h, id = "CALL1") => (await h.db.query("SELECT chat_id, type, extra FROM messages WHERE stanza = $1", [id])).rows[0];

test("call.received: a row, a ringing chat entry, a toast and a call event with the canonical chat id and the saved name", async () => {
  const h = await mk();
  await h.db.query("INSERT INTO lid_map (user_id, lid, pn) VALUES ('u1', $1, $2)", [LID, PN]);
  await h.db.query("INSERT INTO contacts (user_id, chat_id, name) VALUES ('u1', $1, 'Marina Costa')", [PN]);
  await h.event("call.received", call({ from: LID, isVideo: true }));
  const e = await entry(h);
  assert.equal(e.chat_id, PN);
  assert.equal(e.type, "call");
  assert.deepEqual(e.extra, { call: { video: true, status: "ringing" } });
  assert.deepEqual(h.toasts.map((t) => [t.title, t.description]), [["Incoming video call", "Marina Costa"]]);
  assert.deepEqual(h.raw.find((x) => x.name === "call").data, { id: "CALL1", chatId: PN, name: "Marina Costa", video: true, status: "ringing", session: "default" });
  // a repeated event changes nothing
  await h.event("call.received", call({ from: LID, isVideo: true }));
  assert.equal(h.toasts.length, 1);
  // the conversation shows it as a call message
  const msgs = (await h.get("/messages", { chatId: PN })).messages;
  assert.deepEqual(msgs.map((m) => [m.type, m.call]), [["call", { video: true, status: "ringing" }]]);
});

test("GOWS: the real caller is _data.CallCreator", async () => {
  const h = await mk();
  await h.event("call.received", call({ from: "999@lid", _data: { CallCreator: PN } }));
  assert.equal((await entry(h)).chat_id, PN);
});

test("call.rejected by the caller is missed; accepted stays accepted; a late rejected does not overwrite it", async () => {
  const h = await mk();
  await h.event("call.received", call({ id: "A" }));
  await h.event("call.rejected", { id: "A", from: PN });
  assert.equal((await entry(h, "A")).extra.call.status, "missed");
  assert.equal(h.raw.filter((x) => x.name === "call").at(-1).data.status, "missed");
  await h.event("call.received", call({ id: "B", isVideo: false }));
  await h.event("call.accepted", { id: "B", from: PN });
  await h.event("call.rejected", { id: "B", from: PN });
  assert.equal((await entry(h, "B")).extra.call.status, "accepted");
  const list = (await h.get("/calls")).calls;
  assert.deepEqual(list.map((c) => [c.id, c.status, c.video, c.chatId]).sort(), [["A", "missed", false, PN], ["B", "accepted", false, PN]]);
});

test("POST /call/reject sends from + id to WAHA, marks the call declined and tells the UI", async () => {
  const h = await mk();
  await h.event("call.received", call({ id: "C" }));
  h.events.length = 0; h.raw.length = 0;
  assert.deepEqual(await h.post("/call/reject", { id: "C", chatId: PN }), { ok: true });
  assert.deepEqual(h.last("POST", "/calls/reject").body, { from: PN, id: "C" });
  assert.equal((await entry(h, "C")).extra.call.status, "declined");
  assert.equal(h.raw.find((x) => x.name === "call").data.status, "declined");
  await h.event("call.rejected", { id: "C", from: PN });
  assert.equal((await h.get("/calls")).calls[0].status, "declined");
});

test("GET /calls lists recent calls newest first with a limit; a call that rang for a minute counts as missed", async () => {
  const h = await mk();
  await h.event("call.received", call({ id: "OLD", timestamp: Math.floor(Date.now() / 1000) - 600 }));
  await h.event("call.received", call({ id: "NEW" }));
  const all = (await h.get("/calls")).calls;
  assert.deepEqual(all.map((c) => [c.id, c.status]), [["NEW", "ringing"], ["OLD", "missed"]]);
  assert.equal((await h.get("/calls", { limit: "1" })).calls.length, 1);
});

test("bad input 400, non-owner 403, WAHA 501 -> unsupported, WAHA down 502", async () => {
  const h = await mk();
  await rejects(assert, h.post("/call/reject", { id: "", chatId: PN }), 400, "invalid_call");
  await rejects(assert, h.post("/call/reject", { id: "x", chatId: "x!" }), 400, "invalid_chat");
  await owner403(h, [["post", "/call/reject", { id: "x", chatId: PN }], ["get", "/calls"]]);
  await rejects(assert, (await mk({ fail: 501 })).post("/call/reject", { id: "x", chatId: PN }), 501, "unsupported");
  const down = await mk(); down.setDown(true);
  await rejects(assert, down.post("/call/reject", { id: "x", chatId: PN }), 502);
});
