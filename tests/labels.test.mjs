// Labels: list (cached), create / update / delete, per-chat assignment mirrored into chat_state, label events.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { harness, load, rejects } from "./_more-harness.mjs";

let rt;
const open = [];
before(async () => { rt = await load(); });
after(() => rt.cleanup());

const PN = "5534999990000@c.us", LID = "123456789012345@lid";
const LIST = [{ id: "1", name: "New client", color: 1, colorHex: "#64c4ff" }, { id: "2", name: "Paid", color: 5 }];
const mk = (extra = {}) => harness(rt, open, ({ method, path, body }) => {
  if (extra.fail) return { status: extra.fail, json: {} };
  if (method === "GET" && path === "/api/default/labels") return { status: 200, json: LIST };
  if (method === "POST" && path === "/api/default/labels") return { status: 201, json: { id: "9", name: body.name, color: body.color } };
  if (method === "PUT" && path === "/api/default/labels/2") return { status: 200, json: {} };
  if (method === "DELETE" && path === "/api/default/labels/2") return { status: 200, json: {} };
  if (method === "GET" && path === "/api/default/labels/chats/" + encodeURIComponent(PN)) return { status: 200, json: [{ id: "1", name: "New client" }] };
  if (method === "PUT" && path === "/api/default/labels/chats/" + encodeURIComponent(PN)) return { status: 200, json: {} };
});
const stateLabels = async (h, chat = PN) => (await h.db.query("SELECT labels FROM chat_state WHERE user_id = 'u1' AND chat_id = $1", [chat])).rows[0]?.labels;

test("GET /labels lists with hex colours (fallback to the palette) and caches for 5 minutes", async () => {
  const h = await mk();
  const r = await h.get("/labels");
  assert.deepEqual(r, { supported: true, labels: [{ id: "1", name: "New client", color: "#64c4ff" }, { id: "2", name: "Paid", color: "#55ccb3" }] });
  await h.get("/labels");
  assert.equal(h.reqs.filter((x) => x.path === "/api/default/labels").length, 1);
});

test("GET /labels: a 501 or a 4xx means unsupported, a WAHA that is down is a 502, a session not ready 409", async () => {
  for (const status of [501, 400, 404]) assert.deepEqual(await (await mk({ fail: status })).get("/labels"), { labels: [], supported: false });
  const down = await mk(); down.setDown(true);
  await rejects(assert, down.get("/labels"), 502, "waha_unavailable");
  await rejects(assert, (await mk({ fail: 422 })).get("/labels"), 409, "session_not_ready");
});

test("create / update / delete send the exact WAHA request and clear the cache", async () => {
  const h = await mk();
  await h.get("/labels");
  const r = await h.post("/labels", { name: "  VIP ", color: "#64c4ff" });
  assert.equal(r.ok, true);
  assert.deepEqual(h.last("POST", "/api/default/labels").body, { name: "VIP", color: 1 });
  // a colour outside the palette maps to the closest one
  await h.post("/labels", { name: "Red", color: "#ff0000" });
  assert.equal(h.last("POST", "/api/default/labels").body.color, 13);
  await h.post("/labels/update", { id: "2", name: "Paid!", color: "#d3a91d" });
  assert.deepEqual(h.last("PUT", "/api/default/labels/2").body, { name: "Paid!", color: 7 });
  await h.get("/labels");
  assert.equal(h.reqs.filter((x) => x.method === "GET" && x.path === "/api/default/labels").length, 2, "mutations invalidate the cache");
  h.events.length = 0;
  await h.post("/labels/delete", { id: "2" });
  assert.equal(h.last("DELETE", "/api/default/labels/2").method, "DELETE");
  assert.ok(h.events.some((e) => e.name === "chats"));
});

test("delete removes the label from every chat's labels", async () => {
  const h = await mk();
  await h.post("/labels/chat", { chatId: PN, labels: ["1", "2"] });
  await h.post("/labels/delete", { id: "2" });
  assert.deepEqual(await stateLabels(h), ["1"]);
});

test("GET /labels/chat reads the chat's labels and mirrors them", async () => {
  const h = await mk();
  assert.deepEqual(await h.get("/labels/chat", { chatId: PN }), { chatId: PN, labels: ["1"] });
  assert.deepEqual(await stateLabels(h), ["1"]);
});

test("POST /labels/chat replaces the labels in WAHA and in chat_state under the canonical id", async () => {
  const h = await mk();
  await h.db.query("INSERT INTO lid_map (user_id, lid, pn) VALUES ('u1', $1, $2)", [LID, PN]);
  const r = await h.post("/labels/chat", { chatId: LID, labels: ["1", "2", "1"] });
  assert.deepEqual(r, { ok: true, chatId: PN, labels: ["1", "2"] });
  const put = h.last("PUT", "/api/default/labels/chats/" + encodeURIComponent(PN));
  assert.deepEqual(put.body, { labels: [{ id: "1" }, { id: "2" }] });
  assert.deepEqual(await stateLabels(h), ["1", "2"]);
  assert.ok(h.events.some((e) => e.name === "chats"));
  // the chat list carries the labels
  await h.db.query("INSERT INTO messages (user_id, session, chat_id, msg_id, stanza, body, sent_at) VALUES ('u1','default',$1,'false_x_M1','M1','hi', now())", [PN]);
  assert.deepEqual((await h.get("/chats")).chats.find((c) => c.chatId === PN).labels, ["1", "2"]);
  await h.post("/labels/chat", { chatId: PN, labels: [] });
  assert.deepEqual(h.last("PUT", "/api/default/labels/chats/" + encodeURIComponent(PN)).body, { labels: [] });
  assert.deepEqual(await stateLabels(h), []);
});

test("label events keep the cache and chat_state in sync", async () => {
  const h = await mk();
  await h.get("/labels");
  h.events.length = 0;
  await h.event("label.upsert", { id: "3", name: "Lead", color: 14, colorHex: "#00a0f2" });
  assert.deepEqual((await h.get("/labels")).labels.map((l) => l.id), ["1", "2", "3"]);
  assert.equal(h.reqs.filter((x) => x.path === "/api/default/labels").length, 1, "served from the updated cache");
  await h.event("label.upsert", { id: "3", name: "Lead 2", colorHex: "#00a0f2" });
  assert.equal((await h.get("/labels")).labels.find((l) => l.id === "3").name, "Lead 2");
  await h.event("label.chat.added", { labelId: "1", chatId: PN });
  await h.event("label.chat.added", { labelId: "3", chatId: PN });
  assert.deepEqual(await stateLabels(h), ["1", "3"]);
  await h.event("label.chat.deleted", { labelId: "1", chatId: PN });
  assert.deepEqual(await stateLabels(h), ["3"]);
  await h.event("label.deleted", { id: "3", name: "" });
  assert.deepEqual(await stateLabels(h), []);
  assert.deepEqual((await h.get("/labels")).labels.map((l) => l.id), ["1", "2"]);
  assert.ok(h.events.filter((e) => e.name === "chats").length >= 4);
});

test("bad input is a 400, a non-owner a 403, an engine without labels a 501", async () => {
  const h = await mk();
  await rejects(assert, h.post("/labels", { name: "", color: "#64c4ff" }), 400);
  await rejects(assert, h.post("/labels", { name: "x", color: "red" }), 400, "invalid_color");
  await rejects(assert, h.post("/labels/update", { id: "a/b", name: "x", color: "#64c4ff" }), 400, "invalid_label");
  await rejects(assert, h.post("/labels/delete", {}), 400);
  await rejects(assert, h.get("/labels/chat", {}), 400);
  await rejects(assert, h.post("/labels/chat", { chatId: PN, labels: "1" }), 400, "invalid_labels");
  await rejects(assert, h.post("/labels/chat", { chatId: PN, labels: [{}] }), 400, "invalid_label");
  for (const [m, p, b] of [["get", "/labels"], ["post", "/labels", { name: "x", color: "#64c4ff" }], ["post", "/labels/update", { id: "1", name: "x", color: "#64c4ff" }], ["post", "/labels/delete", { id: "1" }], ["get", "/labels/chat", { chatId: PN }], ["post", "/labels/chat", { chatId: PN, labels: [] }]]) {
    await rejects(assert, m === "get" ? h.get(p, b ?? {}, "u2") : h.post(p, b, "u2"), 403);
  }
  const old = await mk({ fail: 501 });
  await rejects(assert, old.post("/labels", { name: "x", color: "#64c4ff" }), 501, "unsupported");
  await rejects(assert, old.post("/labels/chat", { chatId: PN, labels: ["1"] }), 501, "unsupported");
  await rejects(assert, old.get("/labels/chat", { chatId: PN }), 501, "unsupported");
  const down = await mk(); down.setDown(true);
  await rejects(assert, down.post("/labels/delete", { id: "1" }), 502);
});
