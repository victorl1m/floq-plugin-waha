// Channels: followed list, a channel's posts in the conversation's message shape, search, follow.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { harness, load, rejects } from "./_more-harness.mjs";

let rt;
before(async () => { rt = await load(); });
after(() => rt.cleanup());
const owner403 = async (h, calls) => { for (const [m, p, b] of calls) await rejects(assert, m === "get" ? h.get(p, b ?? {}, "u2") : h.post(p, b ?? {}, "u2"), 403); };

const CH = "120363111111111111@newsletter";
const LIST = [{ id: CH, name: "Zoe news", description: "Updates", invite: "https://whatsapp.com/channel/abc", picture: "https://pps.whatsapp.net/p.jpg", verified: true, role: "SUBSCRIBER", subscribersCount: 1200 }, { id: "bad", name: "x" }];
const post = (id, body, ts, extra = {}) => ({ id: "false_" + CH + "_" + id, timestamp: ts, from: CH, fromMe: false, body, hasMedia: false, ...extra });
const mk = (extra = {}) => harness(rt, [], ({ method, path, query, body }) => {
  if (extra.fail) return { status: extra.fail, json: {} };
  if (method === "GET" && path === "/api/default/channels") return { status: 200, json: LIST };
  if (method === "GET" && path === "/api/default/chats/" + encodeURIComponent(CH) + "/messages") return extra.noChats ? { status: 501, json: {} } : { status: 200, json: [post("P2", "second", 1700000100), post("P1", "first", 1700000000), post("P3", "", 1700000200, { hasMedia: true, media: { url: "http://localhost:3000/api/files/x.jpg", mimetype: "image/jpeg", filename: "x.jpg" }, _data: { type: "image" } })] };
  if (method === "GET" && path === "/api/default/channels/" + encodeURIComponent(CH) + "/messages/preview") return { status: 200, json: [{ reactions: { "👍": 10 }, viewCount: 321, message: post("Q1", "from preview", 1700000300) }] };
  if (method === "POST" && path === "/api/default/channels/search/by-text") return { status: 200, json: { channels: [{ id: "120363222222222222@newsletter", name: "Found" }] } };
  if (method === "POST" && /\/channels\/.+\/(un)?follow$/.test(path)) return { status: 201, json: {} };
});

test("GET /channels maps the list and drops items without a channel id", async () => {
  const h = await mk();
  assert.deepEqual(await h.get("/channels"), { channels: [{ id: CH, name: "Zoe news", description: "Updates", picture: "https://pps.whatsapp.net/p.jpg", verified: true, role: "SUBSCRIBER", subscribers: 1200 }] });
  assert.equal(h.last("GET", "/channels").query.session, undefined);
});

test("GET /channel/messages returns the conversation's message shape, oldest first, with media marked unavailable", async () => {
  const h = await mk();
  const r = await h.get("/channel/messages", { id: CH, limit: "20" });
  assert.deepEqual(r.messages.map((m) => [m.body, m.type, m.fromMe]), [["first", "chat", false], ["second", "chat", false], ["", "image", false]]);
  assert.equal(r.messages[0].sentAt, new Date(1700000000 * 1000).toISOString());
  assert.equal(r.messages[2].hasMedia, true);
  assert.deepEqual(r.messages[2].media, { mime: "image/jpeg", filename: "x.jpg", size: null, duration: null, width: null, height: null, gif: false, available: false });
  assert.equal(h.last("GET", "/messages").query.limit, "20");
  assert.ok(!JSON.stringify(r).includes("localhost"));
});

test("falls back to the preview endpoint when the chat read is not supported; views and reactions come along", async () => {
  const h = await mk({ noChats: true });
  const r = await h.get("/channel/messages", { id: CH });
  assert.equal(r.messages.length, 1);
  assert.equal(r.messages[0].body, "from preview");
  assert.equal(r.messages[0].views, 321);
  assert.deepEqual(r.messages[0].reactions, [{ emoji: "👍", count: 10, mine: false, senders: [] }]);
});

test("search and follow send the exact WAHA requests", async () => {
  const h = await mk();
  const r = await h.get("/channels/search", { q: " zoe " });
  assert.deepEqual(r.channels.map((c) => c.name), ["Found"]);
  assert.deepEqual(h.last("POST", "/search/by-text").body, { filters: { searchText: "zoe" }, limit: 30 });
  assert.deepEqual(await h.post("/channel/follow", { id: CH, follow: true }), { ok: true, id: CH, follow: true });
  assert.equal(h.last("POST", "/follow").path, "/api/default/channels/" + encodeURIComponent(CH) + "/follow");
  await h.post("/channel/follow", { id: CH, follow: false });
  assert.ok(h.last("POST", "/unfollow"));
});

test("bad input 400, non-owner 403, engine without it 501, WAHA down 502", async () => {
  const h = await mk();
  await rejects(assert, h.get("/channel/messages", { id: "5511@c.us" }), 400, "invalid_channel");
  await rejects(assert, h.get("/channels/search", { q: "" }), 400);
  await rejects(assert, h.post("/channel/follow", { id: CH }), 400, "invalid_follow");
  await rejects(assert, h.post("/channel/follow", { id: "x", follow: true }), 400);
  await owner403(h, [["get", "/channels"], ["get", "/channel/messages", { id: CH }], ["get", "/channels/search", { q: "x" }], ["post", "/channel/follow", { id: CH, follow: true }]]);
  const old = await mk({ fail: 501 });
  for (const p of [old.get("/channels"), old.get("/channel/messages", { id: CH }), old.get("/channels/search", { q: "x" }), old.post("/channel/follow", { id: CH, follow: true })]) await rejects(assert, p, 501, "unsupported");
  old.setDown(true);
  await rejects(assert, old.get("/channels"), 502);
  await rejects(assert, old.get("/channel/messages", { id: CH }), 502);
});
