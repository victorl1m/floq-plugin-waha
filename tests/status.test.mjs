// Status (stories): incoming statuses are stored for 24 h with their media cached, listed by poster; posting and deleting go through WAHA.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { harness, load, rejects } from "./_more-harness.mjs";

let rt;
before(async () => { rt = await load(); });
after(() => rt.cleanup());
const owner403 = async (h, calls) => { for (const [m, p, b] of calls) await rejects(assert, m === "get" ? h.get(p, b ?? {}, "u2") : h.post(p, b ?? {}, "u2"), 403); };

const POSTER = "5511911112222@c.us", PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGP4z8CAFQ0nCQCCmQ/h/mNylAAAAABJRU5ErkJggg==", "base64");
const now = () => Math.floor(Date.now() / 1000);
const incoming = (o) => ({ id: "false_status@broadcast_" + o.sid + "_" + POSTER, timestamp: now() - 60, from: "status@broadcast", fromMe: false, participant: POSTER, hasMedia: false, body: "", _data: { notifyName: "Rafael" }, ...o.p });
const mk = (extra = {}) => harness(rt, [], ({ method, path, body }) => {
  if (path.startsWith("/api/files/")) return extra.gone ? { status: 404, json: {} } : { status: 200, bytes: PNG, mime: "image/jpeg" };
  if (method === "POST" && path === "/api/default/status/text") return extra.fail ? { status: extra.fail, json: {} } : { status: 201, json: { key: { remoteJid: "status@broadcast", fromMe: true, id: "3EB0OWNTEXT" } } };
  if (method === "POST" && path.startsWith("/api/default/status/")) return extra.fail ? { status: extra.fail, json: {} } : { status: 201, json: { key: { id: "3EB0OWN" + path.split("/").pop().toUpperCase() } } };
});

test("an incoming text and image status are stored, the image cached, and listed by poster", async () => {
  const h = await mk();
  await h.event("message", incoming({ sid: "S1", p: { body: "Good morning", _data: { notifyName: "Rafael", message: { extendedTextMessage: { backgroundArgb: 0xff38b42f } } } } }));
  await h.event("message", incoming({ sid: "S2", p: { timestamp: now() - 30, hasMedia: true, body: "Look", media: { url: "http://localhost:3000/api/files/false_status@broadcast_S2_" + POSTER + ".jpg", mimetype: "image/jpeg", filename: "x.jpg" }, _data: { notifyName: "Rafael", type: "image" } } }));
  await h.event("message.any", incoming({ sid: "S1", p: { body: "Good morning" } }));
  await h.idle();
  const list = await h.get("/status/list");
  assert.equal(list.length, 1);
  assert.equal(list[0].poster.chatId, POSTER);
  assert.equal(list[0].poster.name, "Rafael");
  assert.equal(list[0].poster.isMe, false);
  assert.deepEqual(list[0].items.map((i) => [i.id, i.type, i.body, i.background ?? null]), [["S1", "text", "Good morning", "#38b42f"], ["S2", "image", "Look", null]]);
  assert.deepEqual(list[0].items[1].media, { mime: "image/jpeg", available: true });
  assert.ok(h.events.some((e) => e.name === "status"));
  const media = await h.get("/status/media", { id: "S2" });
  assert.equal(media.mime, "image/jpeg");
  assert.deepEqual(Buffer.from(media.data, "base64"), PNG);
  assert.ok(!JSON.stringify(list).includes("localhost"), "no WAHA url leaves the runtime");
  assert.equal(h.last("GET", "S2_" + POSTER + ".jpg").path.startsWith("/api/files/"), true);
});

test("status messages never reach the chat list; statuses older than 24 h are ignored and purged", async () => {
  const h = await mk();
  await h.event("message", incoming({ sid: "S1", p: { body: "hi" } }));
  await h.event("message", incoming({ sid: "OLD", p: { body: "old", timestamp: now() - 25 * 3600 } }));
  assert.deepEqual((await h.get("/chats")).chats, []);
  assert.deepEqual((await h.get("/status/list"))[0].items.map((i) => i.id), ["S1"]);
  await h.db.query("UPDATE statuses SET sent_at = now() - interval '25 hours'");
  await h.db.query("INSERT INTO media_blobs (user_id, key, mime, bytes, size) VALUES ('u1', 's:S1', 'image/png', 'x', 1)");
  assert.deepEqual(await h.get("/status/list"), []);
  assert.equal((await h.db.query("SELECT 1 FROM media_blobs WHERE key = 's:S1'")).rows.length, 0);
});

test("media WAHA no longer has is listed as unavailable and /status/media is a 404", async () => {
  const h = await mk({ gone: true });
  await h.event("message", incoming({ sid: "S3", p: { hasMedia: true, media: { url: "http://localhost:3000/api/files/f.jpg", mimetype: "image/jpeg" }, _data: { type: "image" } } }));
  await h.idle();
  assert.deepEqual((await h.get("/status/list"))[0].items[0].media, { mime: "image/jpeg", available: false });
  await rejects(assert, h.get("/status/media", { id: "S3" }), 404, "media_gone");
  await rejects(assert, h.get("/status/media", { id: "../x" }), 400);
});

test("grouping: own statuses first, then the newest poster first; a lid poster folds into its phone id", async () => {
  const h = await mk();
  const LID = "999888777666555@lid";
  await h.db.query("INSERT INTO lid_map (user_id, lid, pn) VALUES ('u1', $1, $2)", [LID, "5521988887777@c.us"]);
  await h.db.query("INSERT INTO contacts (user_id, chat_id, name) VALUES ('u1', '5521988887777@c.us', 'Bia Nogueira')");
  await h.event("message", incoming({ sid: "A", p: { body: "a", timestamp: now() - 600 } }));
  await h.event("message", incoming({ sid: "B", p: { body: "b", timestamp: now() - 100, participant: LID } }));
  await h.event("message.any", { id: "true_status@broadcast_MINE_" + "5511900000000@c.us", timestamp: now() - 900, from: "5511900000000@c.us", fromMe: true, to: "status@broadcast", body: "mine", hasMedia: false });
  const list = await h.get("/status/list");
  assert.deepEqual(list.map((g) => g.poster.name), ["My status", "Bia Nogueira", "Rafael"]);
  assert.equal(list[0].poster.isMe, true);
});

test("posting: text, image, video and voice send the exact WAHA request and show up as my status", async () => {
  const h = await mk();
  const file = (mime, filename) => ({ mime, filename, data: PNG.toString("base64") });
  await h.post("/status/text", { text: "Hello", backgroundColor: "#8e24aa", font: 2 });
  assert.deepEqual(h.last("POST", "/status/text").body, { text: "Hello", backgroundColor: "#8e24aa", font: 2 });
  await h.post("/status/image", { ...file("image/png", "a.png"), caption: "cap" });
  assert.deepEqual(h.last("POST", "/status/image").body, { file: { mimetype: "image/png", filename: "a.png", data: PNG.toString("base64") }, caption: "cap" });
  await h.post("/status/video", file("video/quicktime", "v.mov"));
  assert.deepEqual(h.last("POST", "/status/video").body.convert, true);
  await h.post("/status/video", { file: { mimetype: "video/mp4", filename: "v.mp4", data: PNG.toString("base64") } });
  assert.deepEqual(h.last("POST", "/status/video").body.convert, false);
  await h.post("/status/voice", file("audio/webm", "v.webm"));
  const v = h.last("POST", "/status/voice").body;
  assert.equal(v.convert, true);
  assert.equal(v.file.mimetype, "audio/webm");
  const list = await h.get("/status/list");
  assert.equal(list[0].poster.isMe, true);
  assert.deepEqual(list[0].items.map((i) => i.type).sort(), ["image", "text", "video", "voice"].sort());
  assert.equal(list[0].items.find((i) => i.type === "image").media.available, true);
});

test("delete: only my own status, through WAHA; the row and its media go", async () => {
  const h = await mk();
  await h.post("/status/text", { text: "Hello" });
  await h.event("message", incoming({ sid: "THEIRS", p: { body: "x" } }));
  await rejects(assert, h.post("/status/delete", { id: "THEIRS" }), 400, "not_mine");
  await rejects(assert, h.post("/status/delete", { id: "NOPE" }), 404);
  await h.post("/status/delete", { id: "3EB0OWNTEXT" });
  assert.deepEqual(h.last("POST", "/status/delete").body, { id: "3EB0OWNTEXT" });
  assert.deepEqual((await h.get("/status/list")).map((g) => g.poster.isMe), [false]);
});

test("bad input 400, too large 413, non-owner 403, engine without it 501, WAHA down 502", async () => {
  const h = await mk();
  await rejects(assert, h.post("/status/text", { text: "" }), 400);
  await rejects(assert, h.post("/status/image", { mime: "image/png", data: "" }), 400, "invalid_file");
  await rejects(assert, h.post("/status/image", { mime: "video/mp4", filename: "x", data: "AAAA" }), 400, "invalid_file");
  await rejects(assert, h.post("/status/video", { mime: "image/png", filename: "x", data: "AAAA" }), 400);
  await rejects(assert, h.post("/status/voice", { mime: "image/png", filename: "x", data: "AAAA" }), 400);
  await rejects(assert, h.post("/status/image", { mime: "image/png", filename: "x.png", data: Buffer.alloc(5 * 1024 * 1024 + 1).toString("base64") }), 413, "file_too_large");
  await rejects(assert, h.post("/status/delete", { id: "a b" }), 400);
  await owner403(h, [["get", "/status/list"], ["get", "/status/media", { id: "x" }], ["post", "/status/text", { text: "x" }], ["post", "/status/image"], ["post", "/status/video"], ["post", "/status/voice"], ["post", "/status/delete", { id: "x" }]]);
  const old = await mk({ fail: 501 });
  await rejects(assert, old.post("/status/text", { text: "x" }), 501, "unsupported");
  await rejects(assert, old.post("/status/image", { mime: "image/png", filename: "x.png", data: PNG.toString("base64") }), 501, "unsupported");
  old.setDown(true);
  await rejects(assert, old.post("/status/text", { text: "x" }), 502);
});
