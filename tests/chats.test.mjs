// Chat actions: archive, pin, mute, mark unread, delete, clear. The SQL runs on a real Postgres (PGlite).
import test, { before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { GROUP, LID, PN, cleanup, harness, setup, teardown } from "./people-harness.mjs";

before(setup);
afterEach(teardown);
after(cleanup);

const E = encodeURIComponent(PN);
const ok = { status: 200, json: { ok: true } };
const status = (s) => () => ({ status: s, json: {} });
const FUTURE = () => new Date(Date.now() + 8 * 3600_000).toISOString();

test("archive: WAHA archive/unarchive, then the inbox state; the chat moves between the two lists", async () => {
  const h = await harness({ waha: () => ok });
  await h.hook({ from: PN, body: "hi" });
  assert.deepEqual(await h.post("/chat/archive", { chatId: PN, archived: true }), { ok: true });
  assert.deepEqual(h.last(), [`POST /api/default/chats/${E}/archive`]);
  assert.equal((await h.state(PN)).archived, true);
  assert.deepEqual((await h.chats()).map((c) => c.chatId), []);
  assert.equal(h.events.at(-1).name, "chats");
  assert.deepEqual((await h.routes["GET /chats"]({ userId: "u1", query: { archived: "1" } })).chats.map((c) => c.chatId), [PN]);
  await h.post("/chat/archive", { chatId: PN, archived: false });
  assert.deepEqual(h.last(), [`POST /api/default/chats/${E}/unarchive`]);
  assert.deepEqual((await h.chats()).map((c) => [c.chatId, c.archived]), [[PN, false]]);
});

test("archive on an engine without it keeps the local state and says so", async () => {
  const h = await harness({ waha: status(501) });
  await h.hook({ from: PN, body: "hi" });
  assert.deepEqual(await h.post("/chat/archive", { chatId: PN, archived: true }), { ok: true, localOnly: true });
  assert.equal((await h.state(PN)).archived, true);
});

test("archive addresses WAHA with the id the contact writes from, and stores state under the canonical id", async () => {
  const h = await harness({ waha: () => ok });
  await h.hook({ from: LID, body: "b", _data: { key: { remoteJidAlt: PN } } });
  await h.post("/chat/archive", { chatId: PN, archived: true });
  assert.deepEqual(h.last(), [`POST /api/default/chats/${encodeURIComponent(LID)}/archive`]);
  assert.equal((await h.state(PN)).archived, true);
  assert.equal(await h.state(LID), undefined);
});

test("pin is local only (no WAHA call) and sorts the chat first", async () => {
  const h = await harness({ waha: () => ok });
  await h.hook({ from: PN, body: "old" });
  await h.hook({ from: "5511888887777@c.us", body: "new" });
  assert.deepEqual((await h.chats()).map((c) => c.chatId), ["5511888887777@c.us", PN]);
  assert.deepEqual(await h.post("/chat/pin", { chatId: PN, pinned: true }), { ok: true });
  assert.deepEqual(h.calls.filter((c) => c.rawPath.includes("pin")), []);
  assert.deepEqual((await h.chats()).map((c) => [c.chatId, c.pinned]), [[PN, true], ["5511888887777@c.us", false]]);
  await h.post("/chat/pin", { chatId: PN, pinned: false });
  assert.equal((await h.chats())[0].chatId, "5511888887777@c.us");
});

test("mute stores the end time, unmute clears it, and a muted chat raises no toast", async () => {
  const h = await harness({ waha: () => ok });
  await h.hook({ from: PN, body: "one" });
  assert.equal(h.toasts.length, 1);
  const until = FUTURE();
  await h.post("/chat/mute", { chatId: PN, until });
  assert.equal(new Date((await h.state(PN)).muted_until).toISOString(), until);
  assert.equal((await h.chats())[0].muted, true);
  await h.hook({ from: PN, body: "two" });
  assert.equal(h.toasts.length, 1);
  await h.post("/chat/mute", { chatId: PN, until: null });
  assert.equal((await h.state(PN)).muted_until, null);
  assert.equal((await h.chats())[0].muted, false);
  await h.hook({ from: PN, body: "three" });
  assert.equal(h.toasts.length, 2);
  assert.deepEqual(h.last(), []);
});

test("unread: WAHA unread, then the chat counts as unread until it is read", async () => {
  const h = await harness({ waha: () => ok });
  await h.hook({ fromMe: true, from: "me@c.us", to: PN, body: "mine" });
  assert.equal((await h.chats())[0].unread, 0);
  h.last();
  assert.deepEqual(await h.post("/chat/unread", { chatId: PN }), { ok: true });
  assert.deepEqual(h.last(), [`POST /api/default/chats/${E}/unread`]);
  assert.deepEqual((await h.chats()).map((c) => [c.unread, c.markedUnread]), [[1, true]]);
  await h.post("/read", { chatId: PN });
  assert.deepEqual((await h.chats()).map((c) => [c.unread, c.markedUnread]), [[0, false]]);
});

test("delete: WAHA DELETE chat, hidden locally, and a newer message brings it back", async () => {
  const h = await harness({ waha: () => ok });
  await h.hook({ from: PN, body: "old 1" });
  await h.hook({ from: PN, body: "old 2" });
  await h.hook({ from: "5511888887777@c.us", body: "other" });
  assert.deepEqual(await h.post("/chat/delete", { chatId: PN }), { ok: true });
  assert.deepEqual(h.last(), [`DELETE /api/default/chats/${E}`]);
  const st = await h.state(PN);
  assert.equal(st.hidden, true); assert.ok(st.cleared_at);
  assert.deepEqual((await h.chats()).map((c) => c.chatId), ["5511888887777@c.us"]);
  // History that WAHA syncs again is older than cleared_at: still gone.
  await h.hook({ from: PN, body: "replayed", timestamp: 1600000000, id: "false_" + PN + "_OLD" });
  assert.deepEqual((await h.chats()).map((c) => c.chatId), ["5511888887777@c.us"]);
  await new Promise((r) => setTimeout(r, 20));
  await h.hook({ from: PN, body: "back again", timestamp: Math.floor(Date.now() / 1000) + 5 });
  assert.deepEqual((await h.chats()).map((c) => [c.chatId, c.total, c.lastBody]), [[PN, 1, "back again"], ["5511888887777@c.us", 1, "other"]]);
  const msgs = await h.routes["GET /messages"]({ userId: "u1", query: { chatId: PN } });
  assert.deepEqual(msgs.messages.map((m) => m.body), ["back again"]);
});

test("delete on an engine without it still hides the chat locally", async () => {
  for (const s of [501, 404]) {
    const h = await harness({ waha: status(s) });
    await h.hook({ from: PN, body: "x" });
    assert.deepEqual(await h.post("/chat/delete", { chatId: PN }), { ok: true, localOnly: true });
    assert.deepEqual(await h.chats(), []);
    await teardown();
  }
});

test("clear: WAHA DELETE messages, history hidden locally, the chat keeps its state", async () => {
  const h = await harness({ waha: () => ok });
  await h.hook({ from: PN, body: "one" });
  await h.post("/chat/pin", { chatId: PN, pinned: true });
  assert.deepEqual(await h.post("/chat/clear", { chatId: PN }), { ok: true });
  assert.deepEqual(h.last().filter((l) => l.startsWith("DELETE")), [`DELETE /api/default/chats/${E}/messages`]);
  const st = await h.state(PN);
  assert.ok(st.cleared_at); assert.equal(st.pinned, true); assert.equal(st.hidden, false);
  assert.deepEqual((await h.routes["GET /messages"]({ userId: "u1", query: { chatId: PN, limit: 10 } })).messages, []);
  assert.deepEqual(await h.chats(), []);
  // Engines that cannot clear: still cleared in the inbox.
  const g = await harness({ waha: status(501) });
  await g.hook({ from: PN, body: "one" });
  assert.deepEqual(await g.post("/chat/clear", { chatId: PN }), { ok: true, localOnly: true });
  assert.ok((await g.state(PN)).cleared_at);
});

test("groups work like chats: the group id is used as it is", async () => {
  const h = await harness({ waha: () => ok });
  await h.hook({ from: GROUP, participant: PN, body: "hello" });
  await h.post("/chat/archive", { chatId: GROUP, archived: true });
  assert.deepEqual(h.last(), [`POST /api/default/chats/${encodeURIComponent(GROUP)}/archive`]);
  assert.equal((await h.state(GROUP)).archived, true);
});

const routes = [
  ["/chat/archive", { archived: true }], ["/chat/pin", { pinned: true }], ["/chat/mute", { until: null }], ["/chat/unread", {}], ["/chat/delete", {}], ["/chat/clear", {}],
];
test("only the owner may use the routes (403) and WAHA is not called", async () => {
  const h = await harness({ waha: () => ok });
  for (const [path, extra] of routes) await assert.rejects(h.post(path, { chatId: PN, ...extra }, "someone-else"), { status: 403 });
  assert.deepEqual(h.calls, []);
});

test("bad input is a 400", async () => {
  const h = await harness({ waha: () => ok });
  for (const [path, extra] of routes) for (const chatId of [undefined, "", "not a chat", 5, "a".repeat(200)]) await assert.rejects(h.post(path, { chatId, ...extra }), { status: 400, code: "invalid_chat" });
  await assert.rejects(h.post("/chat/archive", { chatId: PN, archived: "yes" }), { status: 400, code: "invalid_archived" });
  await assert.rejects(h.post("/chat/pin", { chatId: PN }), { status: 400, code: "invalid_pinned" });
  for (const until of ["", "soon", "2001-01-01T00:00:00Z", 12345, true]) await assert.rejects(h.post("/chat/mute", { chatId: PN, until }), { status: 400, code: "invalid_until" });
  assert.equal(await h.state(PN), undefined);
  assert.deepEqual(h.calls, []);
});

test("unread needs WAHA: 501 -> unsupported, WAHA down -> 502, WAHA not ready -> 409; nothing changes", async () => {
  const unsupported = await harness({ waha: status(501) });
  await assert.rejects(unsupported.post("/chat/unread", { chatId: PN }), { status: 501, code: "unsupported" });
  assert.equal(await unsupported.state(PN), undefined);
  await teardown();
  const down = await harness({ waha: status(0) });
  await assert.rejects(down.post("/chat/unread", { chatId: PN }), { status: 502, code: "waha_unavailable" });
  await teardown();
  const notReady = await harness({ waha: status(422) });
  await assert.rejects(notReady.post("/chat/unread", { chatId: PN }), { status: 409, code: "session_not_ready" });
});

test("when WAHA is down or refuses, archive, delete and clear fail (502) and change nothing", async () => {
  for (const s of [0, 500, 401]) {
    const h = await harness({ waha: status(s) });
    await h.hook({ from: PN, body: "x" });
    for (const [path, extra] of [["/chat/archive", { archived: true }], ["/chat/delete", {}], ["/chat/clear", {}]]) await assert.rejects(h.post(path, { chatId: PN, ...extra }), { status: 502 });
    assert.equal(await h.state(PN), undefined);
    assert.equal((await h.chats()).length, 1);
    await teardown();
  }
});

test("errors never carry the WAHA address or key", async () => {
  const h = await harness({ waha: status(500) });
  const e = await h.post("/chat/archive", { chatId: PN, archived: true }).catch((x) => x);
  assert.doesNotMatch(String(e.message), /waha\.example|key/i);
});
