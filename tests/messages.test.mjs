// Message kinds per engine, acks, reactions, edits, deletes, polls, media through the plugin route, sending every kind, message actions and the agent rules.
import test, { before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { bundle, cleanup, closeAll, harness } from "./helpers.mjs";

let plugin, migrations, parse;
before(async () => {
  plugin = (await bundle("../runtime/index.ts")).default;
  ({ migrations } = await bundle("../runtime/migrations.ts"));
  parse = await bundle("../runtime/parse.ts");
});
after(cleanup);
afterEach(closeAll);

const A = "5511988887777@c.us", G = "120363041234567890@g.us";
const base = (extra) => ({ id: "false_" + A + "_X1", timestamp: 1700000000, from: A, fromMe: false, body: "", hasMedia: false, ...extra });
const P = (extra) => parse.parseMessage(base(extra), "default");

// ---- parsing ----

test("WEBJS kinds: type, media details, caption, no thumbnail as body", () => {
  const img = P({ hasMedia: true, body: "look", media: { url: "http://localhost:3000/api/files/a.jpg", mimetype: "image/jpeg", filename: null }, _data: { type: "image", width: 800, height: 600, size: 12345 } });
  assert.equal(img.type, "image"); assert.equal(img.body, "look");
  assert.deepEqual(img.media, { mime: "image/jpeg", filename: "", url: "http://localhost:3000/api/files/a.jpg", size: 12345, width: 800, height: 600 });
  const ptt = P({ hasMedia: true, media: { url: "http://x/api/files/a.oga", mimetype: "audio/ogg; codecs=opus" }, _data: { type: "ptt", duration: "7" } });
  assert.equal(ptt.type, "ptt"); assert.equal(ptt.media.duration, 7); assert.equal(ptt.media.mime, "audio/ogg");
  const doc = P({ hasMedia: true, body: "report.pdf", media: { mimetype: "application/pdf", filename: "report.pdf", url: null }, _data: { type: "document", filename: "report.pdf" } });
  assert.equal(doc.type, "document"); assert.equal(doc.media.filename, "report.pdf"); assert.equal(doc.media.url, undefined);
  const loc = P({ body: "/9j/4AAQSkZJRgABAQAAAQABAAD" + "A".repeat(400), location: { latitude: -18.91, longitude: -48.27, description: "Praça" }, _data: { type: "location", lat: -18.91, lng: -48.27 } });
  assert.equal(loc.type, "location"); assert.equal(loc.body, ""); assert.deepEqual(loc.extra.location, { lat: -18.91, lng: -48.27, name: "Praça", address: "" });
  const card = P({ body: "BEGIN:VCARD\nVERSION:3.0\nFN:Ana Lima\nTEL;type=CELL;waid=5511977776666:+55 11 97777-6666\nEND:VCARD", vCards: ["BEGIN:VCARD\nVERSION:3.0\nFN:Ana Lima\nTEL;type=CELL;waid=5511977776666:+55 11 97777-6666\nEND:VCARD"], _data: { type: "vcard" } });
  assert.equal(card.type, "vcard"); assert.equal(card.body, ""); assert.deepEqual(card.extra.vcards, [{ name: "Ana Lima", phones: ["5511977776666"] }]);
  const poll = P({ _data: { type: "poll_creation", pollName: "Lunch?", pollOptions: [{ name: "Pizza", localId: 0 }, { name: "Sushi", localId: 1 }], pollSelectableOptionsCount: 1 } });
  assert.equal(poll.type, "poll"); assert.deepEqual(poll.extra.poll, { name: "Lunch?", options: ["Pizza", "Sushi"], multiple: false });
  const sticker = P({ hasMedia: true, media: { mimetype: "image/webp", url: "http://x/api/files/s.webp" }, _data: { type: "sticker" } });
  assert.equal(sticker.type, "sticker");
  const text = P({ body: "see https://floq.app", _data: { type: "chat", title: "Floq", description: "Agents", matchedText: "https://floq.app", isForwarded: true, mentionedJidList: ["5511977776666@c.us"] } });
  assert.equal(text.type, "chat"); assert.deepEqual(text.extra, { mentions: ["5511977776666@c.us"], forwarded: true, preview: { title: "Floq", description: "Agents", url: "https://floq.app" } });
});

test("NOWEB / GOWS kinds from the proto message, wrappers removed, any key casing", () => {
  const img = P({ hasMedia: true, media: { url: "http://localhost:3000/api/files/b.jpg", mimetype: "image/jpeg" }, _data: { key: { id: "X1" }, message: { imageMessage: { caption: "from proto", mimetype: "image/jpeg", width: 10, height: 20, fileLength: "999" } } } });
  assert.equal(img.type, "image"); assert.equal(img.body, "from proto"); assert.equal(img.media.size, 999);
  const voice = P({ hasMedia: true, media: { url: "http://x/a.oga", mimetype: "audio/ogg; codecs=opus" }, _data: { Info: { MediaType: "ptt" }, Message: { audioMessage: { PTT: true, seconds: 12, mimetype: "audio/ogg; codecs=opus" } } } });
  assert.equal(voice.type, "ptt"); assert.equal(voice.media.duration, 12);
  const doc = P({ hasMedia: true, media: { mimetype: "application/pdf" }, _data: { message: { documentWithCaptionMessage: { message: { documentMessage: { fileName: "nf.pdf", caption: "nota", mimetype: "application/pdf" } } } } } });
  assert.equal(doc.type, "document"); assert.equal(doc.media.filename, "nf.pdf"); assert.equal(doc.body, "nota");
  const loc = P({ _data: { message: { locationMessage: { degreesLatitude: 1.5, degreesLongitude: 2.5, name: "Cafe", address: "Rua 1" } } } });
  assert.deepEqual(loc.extra.location, { lat: 1.5, lng: 2.5, name: "Cafe", address: "Rua 1" });
  const cards = P({ _data: { message: { contactsArrayMessage: { contacts: [{ displayName: "Ana", vcard: "BEGIN:VCARD\nFN:Ana\nTEL:+5511977776666\nEND:VCARD" }, { displayName: "Bia", vcard: "BEGIN:VCARD\nTEL:+5511966665555\nEND:VCARD" }] } } } });
  assert.deepEqual(cards.extra.vcards, [{ name: "Ana", phones: ["5511977776666"] }, { name: "Bia", phones: ["5511966665555"] }]);
  const poll = P({ _data: { message: { pollCreationMessageV3: { name: "When?", options: [{ optionName: "Mon" }, { optionName: "Tue" }], selectableOptionsCount: 0 } } } });
  assert.deepEqual(poll.extra.poll, { name: "When?", options: ["Mon", "Tue"], multiple: true });
  const eph = P({ _data: { message: { ephemeralMessage: { message: { extendedTextMessage: { text: "secret", contextInfo: { mentionedJid: ["5511977776666@s.whatsapp.net"], isForwarded: true } } } } } } });
  assert.equal(eph.type, "chat"); assert.equal(eph.body, "secret"); assert.deepEqual(eph.extra, { mentions: ["5511977776666@c.us"], forwarded: true });
  const react = P({ _data: { message: { reactionMessage: { key: { id: "TARGET" }, text: "👍" } } } });
  assert.deepEqual(react.reaction, { target: "TARGET", emoji: "👍" });
  // from = chat on NOWEB/GOWS groups, sender in participant; to absent in a DM sent by me.
  const g = parse.parseMessage({ id: "false_" + G + "_Z_5511977776666@c.us", timestamp: 1, from: G, participant: "5511977776666@c.us", fromMe: false, body: "oi" }, "default");
  assert.equal(g.chatId, G); assert.equal(g.sender, "5511977776666@c.us"); assert.equal(g.stanza, "Z");
  const mine = parse.parseMessage({ id: "true_" + A + "_Q", timestamp: 1, from: A, fromMe: true, body: "oi", source: "app" }, "default");
  assert.equal(mine.chatId, A); assert.equal(mine.sender, "me");
  for (const bad of [null, {}, { id: "x" }, { id: "x", from: "??" }]) assert.equal(parse.parseMessage(bad, "default"), null);
  assert.doesNotThrow(() => P({ _data: { message: { imageMessage: null, x: 5 }, Info: "bad", key: 7 }, media: "no", location: 3, vCards: "x", replyTo: [] }));
});

test("sentIdOf / linkFromSend read every engine's send response", () => {
  assert.equal(parse.sentIdOf({ id: "true_" + A + "_AAA" }, A), "true_" + A + "_AAA");
  assert.equal(parse.sentIdOf({ id: { fromMe: true, remote: A, id: "AAA", _serialized: "true_" + A + "_AAA" } }, A), "true_" + A + "_AAA");
  assert.equal(parse.sentIdOf({ key: { remoteJid: "5511988887777@s.whatsapp.net", fromMe: true, id: "3EB0BBB" }, message: {} }, A), "true_" + A + "_3EB0BBB");
  assert.equal(parse.sentIdOf({ _data: { id: { _serialized: "true_" + A + "_CCC" } } }, A), "true_" + A + "_CCC");
  assert.equal(parse.sentIdOf({ _data: { Info: { ID: "DDD" } } }, A), "true_" + A + "_DDD");
  assert.equal(parse.sentIdOf({}, A), null); assert.equal(parse.sentIdOf(null, A), null);
  assert.deepEqual(parse.linkFromSend({ key: { remoteJid: "123456789012345@lid", id: "x" } }, A), { lid: "123456789012345@lid", pn: A });
  assert.equal(parse.linkFromSend({ key: { remoteJid: "5511988887777@s.whatsapp.net" } }, A), null);
});

// ---- events ----

test("acks only go up, blue ticks reach the UI; an error ack marks the message failed", async () => {
  const h = await harness(plugin, migrations, {});
  const sent = await h.post("/send", { chatId: A, text: "hello" });
  assert.equal((await h.messages(A))[0].ack, 1);
  const stanza = sent.id.split("_")[2];
  h.events.length = 0;
  await h.event("message.ack", { id: sent.id, from: A, fromMe: true, ack: 3, ackName: "READ" });
  assert.equal((await h.messages(A))[0].ack, 3);
  assert.deepEqual(h.events.map((e) => [e.name, e.chatId, e.ack]), [["message", A, true]]);
  await h.event("message.ack", { id: "true_99@lid_" + stanza, fromMe: true, ackName: "DEVICE" });
  assert.equal((await h.messages(A))[0].ack, 3, "a late DEVICE ack does not downgrade READ; a bare-stanza match works across addresses");
  await h.event("message.ack", { id: sent.id, fromMe: true, ack: -1 });
  assert.equal((await h.messages(A))[0].ack, -1);
  await h.event("message.ack", { id: "true_x@c.us_UNKNOWN", ack: 2 });
});

test("reactions: add, change, remove, from them and from me, as an event and as a message", async () => {
  const h = await harness(plugin, migrations, {});
  await h.message({ from: A, body: "nice" });
  const id = (await h.messages(A))[0].id;
  await h.event("message.reaction", { id: "false_" + A + "_R1", from: A, fromMe: false, timestamp: 1700000100.5, reaction: { text: "👍", messageId: id } });
  await h.event("message.reaction", { id: "true_" + A + "_R2", from: A, to: A, fromMe: true, timestamp: 1700000101, reaction: { text: "❤️", messageId: id } });
  let m = (await h.messages(A))[0];
  assert.deepEqual(m.reactions, [{ emoji: "👍", count: 1, mine: false, senders: [A] }, { emoji: "❤️", count: 1, mine: true, senders: [] }]);
  await h.event("message.reaction", { from: A, fromMe: false, timestamp: 1700000102, reaction: { text: "😂", messageId: id } });
  await h.event("message.reaction", { from: A, fromMe: true, timestamp: 1700000103, reaction: { text: "", messageId: id } });
  m = (await h.messages(A))[0];
  assert.deepEqual(m.reactions, [{ emoji: "😂", count: 1, mine: false, senders: [A] }]);
  // NOWEB-style: a reaction that arrives as a message is not stored as a bubble.
  await h.event("message.any", { id: "false_" + A + "_R9", timestamp: 1700000200, from: A, fromMe: false, body: "", _data: { message: { reactionMessage: { key: { id: id.split("_")[2] }, text: "🙏" } } } });
  const log = await h.messages(A);
  assert.equal(log.length, 1);
  assert.equal(log[0].reactions[0].emoji, "🙏");
});

test("edited, revoked and poll votes update the stored message", async () => {
  const h = await harness(plugin, migrations, {});
  await h.message({ from: A, body: "tyop" });
  await h.message({ from: A, _data: { type: "poll_creation", pollName: "Lunch?", pollOptions: [{ name: "Pizza" }, { name: "Sushi" }], pollSelectableOptionsCount: 1 } });
  const [msg, poll] = await h.messages(A);
  await h.event("message.edited", { id: "false_" + A + "_E1", from: A, fromMe: false, body: "typo", editedMessageId: msg.id.split("_")[2] });
  await h.event("poll.vote", { vote: { id: "false_" + A + "_V1", selectedOptions: ["Sushi"], timestamp: 1700000300, from: A, fromMe: false }, poll: { id: poll.id, from: A, fromMe: false } });
  await h.event("poll.vote", { vote: { id: "true_" + A + "_V2", selectedOptions: ["Pizza"], timestamp: 1700000301, to: A, fromMe: true }, poll: { id: poll.id } });
  let log = await h.messages(A);
  assert.equal(log[0].body, "typo"); assert.equal(log[0].edited, true);
  assert.deepEqual(log[1].poll, { name: "Lunch?", multiple: false, voters: 2, options: [{ name: "Pizza", votes: 1, voted: true }, { name: "Sushi", votes: 1, voted: false }] });
  await h.event("message.revoked", { after: { id: "false_" + A + "_REV" }, before: { id: msg.id }, revokedMessageId: msg.id.split("_")[2] });
  log = await h.messages(A);
  assert.equal(log[0].deleted, true); assert.equal(log[0].type, "deleted"); assert.equal(log[0].body, "");
  // The chat list preview follows.
  await h.event("message.revoked", { before: { id: poll.id } });
  const c = (await h.chats())[0];
  assert.equal(c.lastDeleted, true); assert.equal(c.lastBody, "");
});

test("an API send recorded without an id is adopted by its webhook echo instead of showing twice", async () => {
  const h = await harness(plugin, migrations, { waha: (m, path) => (path === "/api/sendText" ? { json: {} } : undefined) });
  const sent = await h.post("/send", { chatId: A, text: "once" });
  assert.match(sent.id, /^out-/);
  await h.event("message.any", { id: "true_" + A + "_REAL1", timestamp: Math.floor(Date.now() / 1000), from: A, to: A, fromMe: true, source: "api", body: "once", ack: 1 });
  const log = await h.messages(A);
  assert.equal(log.length, 1);
  assert.equal(log[0].id, "true_" + A + "_REAL1");
  await h.event("message.ack", { id: "true_" + A + "_REAL1", fromMe: true, ack: 2 });
  assert.equal((await h.messages(A))[0].ack, 2);
});

// ---- media ----

test("media is downloaded when the event arrives (WAHA's localhost URL rewritten, key sent) and served as base64 by the plugin route", async () => {
  const bytes = Buffer.from("fake-jpeg-bytes");
  const h = await harness(plugin, migrations, { waha: (m, path) => (path === "/api/files/false_x.jpg" ? { bytes, headers: { "content-type": "image/jpeg" } } : undefined) });
  await h.message({ from: A, hasMedia: true, body: "pic", media: { url: "http://localhost:3000/api/files/false_x.jpg", mimetype: "image/jpeg", filename: "x.jpg" }, _data: { type: "image" } });
  await h.idle();
  const file = h.requests.find((r) => r.path === "/api/files/false_x.jpg");
  assert.equal(file.url, "https://waha.example.com/api/files/false_x.jpg");
  assert.equal(file.headers["X-Api-Key"], "key");
  const m = (await h.messages(A))[0];
  assert.deepEqual(m.media, { mime: "image/jpeg", filename: "x.jpg", size: null, duration: null, width: null, height: null, gif: false, available: true });
  assert.ok(!JSON.stringify(m).includes("localhost") && !JSON.stringify(m).includes("/api/files"), "no WAHA URL reaches the UI");
  h.requests.length = 0;
  const got = await h.get("/media", { id: m.id });
  assert.deepEqual(got, { mime: "image/jpeg", filename: "x.jpg", size: bytes.length, data: bytes.toString("base64") });
  assert.equal(h.requests.length, 0, "served from the stored copy: WAHA deletes its file after a few minutes");
});

test("media WAHA no longer has: asked again with downloadMedia, else a clear 404", async () => {
  const bytes = Buffer.from("re-downloaded");
  let fresh = true;
  const h = await harness(plugin, migrations, { waha: (m, path, { query }) => {
    if (path === "/api/files/new.pdf") return { bytes, headers: { "content-type": "application/pdf" } };
    if (path.includes("/messages/") && query.downloadMedia === "true" && fresh) return { json: { id: "x", media: { url: "http://localhost:3000/api/files/new.pdf", mimetype: "application/pdf" } } };
    return undefined;
  } });
  await h.message({ from: A, hasMedia: true, media: { url: "http://localhost:3000/api/files/gone.pdf", mimetype: "application/pdf", filename: "nf.pdf" }, _data: { type: "document" } });
  await h.idle();
  const m = (await h.messages(A))[0];
  const got = await h.get("/media", { id: m.id });
  assert.equal(Buffer.from(got.data, "base64").toString(), "re-downloaded");
  assert.equal(got.filename, "nf.pdf");
  // A message with no file, and one whose file is gone for good.
  await h.message({ from: A, body: "text" });
  await h.message({ from: A, hasMedia: true, media: { url: null, mimetype: "video/mp4" }, _data: { type: "video" } });
  fresh = false;
  const log = await h.messages(A);
  await assert.rejects(h.get("/media", { id: log[1].id }), { status: 404, code: "no_media" });
  await assert.rejects(h.get("/media", { id: log[2].id }), { status: 404, code: "media_unavailable" });
  assert.equal(log[2].media.available, false);
  await assert.rejects(h.get("/media", { id: "nope" }), { status: 404 });
});

// ---- sending ----

test("send-media: image, document, voice (converted unless OGG/Opus), caption, reply; stored with its bytes", async () => {
  const h = await harness(plugin, migrations, {});
  await h.message({ from: A, body: "send it" });
  const quoted = (await h.messages(A))[0].id;
  const data = Buffer.from("png-bytes").toString("base64");
  await h.post("/send-media", { chatId: A, kind: "image", mime: "image/png", filename: "a.png", data, caption: "here", replyTo: quoted });
  await h.post("/send-media", { chatId: A, kind: "document", mime: "application/pdf", filename: "../../etc/nf.pdf", data: "data:application/pdf;base64," + data });
  await h.post("/send-media", { chatId: A, kind: "voice", mime: "audio/webm;codecs=opus", filename: "v.webm", data, duration: 4 });
  await h.post("/send-media", { chatId: A, kind: "voice", mime: "audio/ogg; codecs=opus", data });
  await h.post("/send-media", { chatId: A, kind: "video", mime: "video/webm", filename: "v.webm", data });
  const reqs = h.requests.filter((r) => r.method === "POST" && r.path.startsWith("/api/send") && r.path !== "/api/sendSeen");
  assert.deepEqual(reqs.map((r) => r.path), ["/api/sendImage", "/api/sendFile", "/api/sendVoice", "/api/sendVoice", "/api/sendVideo"]);
  assert.deepEqual(reqs[0].body, { session: "default", chatId: A, file: { mimetype: "image/png", filename: "a.png", data }, caption: "here", reply_to: quoted });
  assert.equal(reqs[1].body.file.filename, ".._.._etc_nf.pdf");
  assert.equal(reqs[2].body.convert, true); assert.equal(reqs[2].body.file.mimetype, "audio/webm");
  assert.equal(reqs[3].body.convert, false); assert.equal(reqs[3].body.file.mimetype, "audio/ogg; codecs=opus");
  assert.equal(reqs[4].body.convert, true);
  const log = await h.messages(A);
  assert.deepEqual(log.slice(1).map((m) => [m.type, m.body, m.media.available]), [["image", "here", true], ["document", "", true], ["ptt", "", true], ["ptt", "", true], ["video", "", true]]);
  assert.equal(log[1].replyTo.id, quoted);
  assert.equal(log[3].media.duration, 4);
  assert.equal(Buffer.from((await h.get("/media", { id: log[1].id })).data, "base64").toString(), "png-bytes", "our own upload is viewable without asking WAHA");
  for (const bad of [{ kind: "exe" }, { kind: "image", data: "" }, { kind: "image", data: "!!!" }]) await assert.rejects(h.post("/send-media", { chatId: A, mime: "image/png", ...bad }), { status: 400 });
  await assert.rejects(h.post("/send-media", { chatId: A, kind: "document", mime: "application/zip", data: Buffer.alloc(5 * 1024 * 1024 + 1).toString("base64") }), { status: 413, code: "file_too_large" });
});

test("send location, contact and poll", async () => {
  const h = await harness(plugin, migrations, {});
  await h.post("/send-location", { chatId: A, latitude: -18.9, longitude: -48.2, title: "Office" });
  await h.post("/send-contact", { chatId: A, contacts: [{ name: "Ana Lima", phone: "+55 11 97777-6666" }] });
  await h.post("/send-poll", { chatId: A, name: "Lunch?", options: ["Pizza", "Sushi", "Pizza", " "], multiple: true });
  const reqs = h.requests.filter((r) => r.path.startsWith("/api/send") && r.path !== "/api/sendSeen");
  assert.deepEqual(reqs.map((r) => [r.path, r.body]), [
    ["/api/sendLocation", { session: "default", chatId: A, latitude: -18.9, longitude: -48.2, title: "Office" }],
    ["/api/sendContactVcard", { session: "default", chatId: A, contacts: [{ fullName: "Ana Lima", phoneNumber: "+5511977776666", whatsappId: "5511977776666" }] }],
    ["/api/sendPoll", { session: "default", chatId: A, poll: { name: "Lunch?", options: ["Pizza", "Sushi"], multipleAnswers: true } }],
  ]);
  const log = await h.messages(A);
  assert.deepEqual(log.map((m) => m.type), ["location", "vcard", "poll"]);
  assert.equal(log[1].vcards[0].formatted[0], "+55 (11) 97777-6666");
  assert.equal(log[2].poll.options.length, 2);
  await assert.rejects(h.post("/send-location", { chatId: A, latitude: 200, longitude: 0 }), { status: 400 });
  await assert.rejects(h.post("/send-contact", { chatId: A, contacts: [{ name: "", phone: "1" }] }), { status: 400 });
  await assert.rejects(h.post("/send-poll", { chatId: A, name: "x", options: ["one"] }), { status: 400 });
});

test("message actions call the right WAHA endpoint and update the row; an engine that cannot do it answers 501 unsupported", async () => {
  const unsupported = new Set();
  const h = await harness(plugin, migrations, { waha: (m, path) => {
    if ([...unsupported].some((u) => path.includes(u))) return { status: 501, json: { statusCode: 501 } };
    if (m === "PUT" || m === "DELETE" || path.endsWith("/pin") || path.endsWith("/unpin") || path === "/api/sendPollVote") return { json: { success: true } };
    return undefined;
  } });
  const mine = (await h.post("/send", { chatId: A, text: "mine" })).id;
  await h.message({ from: A, body: "theirs" });
  await h.message({ from: A, _data: { type: "poll_creation", pollName: "Q", pollOptions: [{ name: "a" }, { name: "b" }], pollSelectableOptionsCount: 1 } });
  const all = await h.messages(A);
  const theirs = all.find((m) => m.body === "theirs").id, poll = all.find((m) => m.type === "poll").id;
  await h.idle();
  h.requests.length = 0;
  await h.post("/react", { messageId: theirs, emoji: "👍" });
  await h.post("/edit", { messageId: mine, text: "mine, edited" });
  await h.post("/star", { messageId: theirs, star: true });
  await h.post("/pin", { messageId: theirs, pin: true, duration: 86400 });
  await h.post("/pin", { messageId: theirs, pin: false });
  await h.post("/poll-vote", { messageId: poll, options: ["b"] });
  await h.post("/forward", { messageId: theirs, to: ["5511966665555@c.us"] });
  const enc = (s) => s; // helpers decode the path
  assert.deepEqual(h.requests.filter((r) => r.path !== "/api/sendSeen" && r.method !== "GET").map((r) => [r.method, r.path, r.body]), [
    ["PUT", "/api/reaction", { session: "default", messageId: theirs, reaction: "👍" }],
    ["PUT", enc(`/api/default/chats/${A}/messages/${mine}`), { text: "mine, edited" }],
    ["PUT", "/api/star", { session: "default", messageId: theirs, chatId: A, star: true }],
    ["POST", enc(`/api/default/chats/${A}/messages/${theirs}/pin`), { duration: 86400 }],
    ["POST", enc(`/api/default/chats/${A}/messages/${theirs}/unpin`), undefined],
    ["POST", "/api/sendPollVote", { session: "default", chatId: A, pollMessageId: poll, votes: ["b"] }],
    ["POST", "/api/forwardMessage", { session: "default", chatId: "5511966665555@c.us", messageId: theirs }],
  ]);
  const by = async () => { const l = await h.messages(A); return { mine: l.find((m) => m.id === mine), theirs: l.find((m) => m.id === theirs), poll: l.find((m) => m.id === poll), l }; };
  let log = await by();
  assert.equal(log.mine.body, "mine, edited"); assert.equal(log.mine.edited, true);
  assert.deepEqual(log.theirs.reactions, [{ emoji: "👍", count: 1, mine: true, senders: [] }]);
  assert.equal(log.theirs.starred, true); assert.equal(log.theirs.pinned, false);
  assert.equal(log.poll.poll.options[1].voted, true);
  const fwd = await h.messages("5511966665555@c.us");
  assert.equal(fwd[0].body, "theirs"); assert.equal(fwd[0].forwarded, true);
  // Rules.
  await assert.rejects(h.post("/edit", { messageId: theirs, text: "no" }), { status: 400, code: "not_yours" });
  await assert.rejects(h.post("/delete", { messageId: theirs, forEveryone: true }), { status: 400, code: "not_yours" });
  await assert.rejects(h.post("/react", { messageId: "nope", emoji: "👍" }), { status: 404 });
  unsupported.add("/api/star"); unsupported.add("/pin");
  await assert.rejects(h.post("/star", { messageId: theirs, star: false }), { status: 501, code: "unsupported" });
  await assert.rejects(h.post("/pin", { messageId: theirs }), { status: 501, code: "unsupported" });
  assert.equal((await by()).theirs.starred, true, "a refused action changes nothing");
  // Delete for everyone marks it deleted; delete for me removes it from this inbox only.
  await h.post("/delete", { messageId: mine, forEveryone: true });
  await h.post("/delete", { messageId: theirs });
  log = await by();
  assert.deepEqual(log.l.map((m) => m.type).sort(), ["deleted", "poll"]);
  assert.ok(h.requests.some((r) => r.method === "DELETE" && r.path === `/api/default/chats/${A}/messages/${mine}`));
  assert.ok(!h.requests.some((r) => r.method === "DELETE" && r.path.endsWith(theirs)));
});

test("opening a chat sends read receipts, shows typing, pages back and searches", async () => {
  const h = await harness(plugin, migrations, {});
  for (let i = 0; i < 7; i++) await h.message({ from: A, body: i === 3 ? "Orçamento 100%" : "m" + i });
  await h.post("/read", { chatId: A });
  await h.post("/typing", { chatId: A, state: "composing" });
  await h.post("/typing", { chatId: A, state: "recording" });
  await h.idle();
  assert.deepEqual(h.requests.find((r) => r.path === "/api/sendSeen").body, { session: "default", chatId: A });
  assert.deepEqual(h.requests.filter((r) => r.path === "/api/default/presence").map((r) => r.body), [{ chatId: A, presence: "typing" }, { chatId: A, presence: "recording" }]);
  const page = await h.get("/messages", { chatId: A, limit: "3" });
  assert.deepEqual(page.messages.map((m) => m.body), ["m4", "m5", "m6"]); assert.equal(page.more, true);
  const older = await h.get("/messages", { chatId: A, limit: "10", before: page.messages[0].sentAt });
  assert.deepEqual(older.messages.map((m) => m.body), ["m0", "m1", "m2", "Orçamento 100%"]); assert.equal(older.more, false);
  assert.deepEqual((await h.get("/messages", { chatId: A, q: "orçamento 100%" })).messages.map((m) => m.body), ["Orçamento 100%"]);
  assert.deepEqual((await h.get("/messages", { chatId: A, q: "%" })).messages.length, 1, "the search term is literal");
});

test("history sync fills a chat from WAHA and refreshes acks without duplicating", async () => {
  const list = [
    { id: "false_" + A + "_H1", timestamp: 1700000001, from: A, fromMe: false, body: "old one", hasMedia: false },
    { id: "true_" + A + "_H2", timestamp: 1700000002, from: A, to: A, fromMe: true, body: "old reply", ack: 3 },
  ];
  const h = await harness(plugin, migrations, { waha: (m, path) => {
    if (path === "/api/default/chats/overview") return { json: [{ id: A, name: "Marina Costa", picture: null, lastMessage: list[1] }, { id: "status@broadcast", name: null, lastMessage: null }, { id: "5511900000001@c.us", name: "+55 11 90000-0001", lastMessage: { id: "false_5511900000001@c.us_Z", timestamp: 1700000009, from: "5511900000001@c.us", fromMe: false, body: "new here" } }] };
    if (path === `/api/default/chats/${A}/messages`) return { json: list };
    return undefined;
  } });
  // An empty inbox waits for WAHA's chat list: chats that never produced a webhook show up.
  const chats = await h.chats();
  assert.deepEqual(chats.map((c) => [c.chatId, c.name, c.lastBody]), [["5511900000001@c.us", null, "new here"], [A, "Marina Costa", "old reply"]]);
  await h.messages(A); await h.idle();
  const log = await h.messages(A); await h.idle();
  assert.deepEqual(log.map((m) => [m.body, m.ack]), [["old one", 0], ["old reply", 3]]);
  assert.ok(h.events.some((e) => e.name === "message" && e.sync));
});

test("the chat list contract; contacts are learned from inbound 1:1 messages; the toast names the sender; muted chats stay quiet", async () => {
  const h = await harness(plugin, migrations, {});
  await h.message({ from: A, body: "x".repeat(300), _data: { notifyName: "Maria" } });
  await h.message({ from: G, participant: A, body: "g", hasMedia: true, media: { mimetype: "image/jpeg", url: null }, _data: { type: "image" } });
  await h.message({ from: "123456789012345@lid", body: "l" });
  await h.message({ from: "status@broadcast", participant: A, body: "story" });
  assert.deepEqual(h.toasts.map((t) => t.title), ["WhatsApp: Maria", "WhatsApp: Maria", "WhatsApp: new message"]);
  const chats = await h.chats();
  assert.deepEqual(chats.map((c) => [c.chatId, c.kind, c.name, c.phone, c.unread, c.lastType]), [["123456789012345@lid", "user", null, null, 1, "chat"], [G, "group", null, null, 1, "image"], [A, "user", "Maria", "5511988887777", 1, "chat"]]);
  assert.equal(chats[2].lastBody.length, 200); assert.equal(chats[1].lastHasMedia, true); assert.equal(chats[1].lastSenderName, "Maria");
  assert.deepEqual(Object.keys(chats[0]).sort(), ["archived", "avatar", "blocked", "chatId", "isSelf", "kind", "labels", "lastAck", "lastAt", "lastBody", "lastDeleted", "lastFromMe", "lastHasMedia", "lastSenderName", "lastType", "markedUnread", "muted", "name", "phone", "pinned", "total", "unread"]);
  assert.ok(!JSON.stringify(chats).includes("status@broadcast"), "stories are not a chat");
  await h.sql("INSERT INTO chat_state (user_id, chat_id, muted_until) VALUES ('u1', $1, now() + interval '1 hour')", [A]);
  await h.message({ from: A, body: "quiet" });
  assert.equal(h.toasts.length, 3);
  assert.equal((await h.chats()).find((c) => c.chatId === A).muted, true);
});

// ---- access ----

test("every inbox route refuses anyone but the owner", async () => {
  const h = await harness(plugin, migrations, {});
  for (const key of Object.keys(h.routes)) {
    const [method, path] = key.split(" ");
    await assert.rejects(h.routes[key]({ userId: "intruder", query: {}, params: {}, body: {} }), { status: 403 }, `${method} ${path}`);
  }
  for (const path of Object.keys(h.internal)) await assert.rejects(h.internal[path]({ userId: "intruder", query: {}, params: {}, body: {} }), { status: 403 }, path);
});

test("agents: files and reactions to other people need approval; the user's own chat does not; media-info never returns bytes", async () => {
  const data = Buffer.from("x").toString("base64");
  const h = await harness(plugin, migrations, { phone: "+5511955554444", approval: "denied", waha: (m) => (m === "PUT" ? { json: {} } : undefined) });
  await h.message({ from: A, hasMedia: true, body: "cap", media: { mimetype: "image/jpeg", filename: "p.jpg", url: null }, _data: { type: "image", width: 3, height: 4 } });
  const id = (await h.messages(A))[0].id;
  assert.deepEqual(await h.call("/send-media", { chatId: A, kind: "document", mime: "application/pdf", filename: "r.pdf", data }), { status: "denied" });
  assert.deepEqual(await h.call("/react", { messageId: id, emoji: "👍" }), { status: "denied" });
  assert.equal(h.approvals.length, 2);
  assert.match(h.approvals[0].action, /Send a file on WhatsApp to 5511988887777@c\.us/);
  assert.ok(!h.requests.some((r) => r.path === "/api/sendFile" || r.path === "/api/reaction"));
  // To the user's own number: free.
  assert.deepEqual(await h.call("/send-media-me", { kind: "document", mime: "application/pdf", filename: "r.pdf", data }), { status: "sent" });
  assert.equal((await h.call("/send-media", { chatId: "5511955554444@c.us", kind: "image", mime: "image/png", filename: "a.png", data })).status, "sent");
  assert.equal(h.approvals.length, 2);
  assert.equal(h.requests.filter((r) => r.path === "/api/sendFile" || r.path === "/api/sendImage").every((r) => r.body.chatId === "5511955554444@c.us"), true);
  const info = await h.call("/media-info", { messageId: id });
  assert.deepEqual(info, { id, type: "image", caption: "cap", mime: "image/jpeg", filename: "p.jpg", size: null, duration: null, width: 3, height: 4, location: null, contacts: null, poll: null });
});
