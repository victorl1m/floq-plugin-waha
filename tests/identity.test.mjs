// One chat per person: lid <-> phone, the two spellings of a Brazilian mobile, the user's own ids. Includes the user's real inbox (ids and timing only) as a fixture.
import test, { before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bundle, cleanup, closeAll, harness } from "./helpers.mjs";

let plugin, migrations, ids, chat;
before(async () => {
  plugin = (await bundle("../runtime/index.ts")).default;
  ({ migrations } = await bundle("../runtime/migrations.ts"));
  ids = await bundle("../runtime/ids.ts");
  chat = await bundle("../shared/chat.ts");
});
after(cleanup);
afterEach(closeAll);

const real = JSON.parse(readFileSync(new URL("./fixtures/real-inbox.json", import.meta.url), "utf8"));
const LID = "23000000000001@lid", EIGHT = "553488880000@c.us", NINE = "5534988880000@c.us", OTHER_LID = "109000000000002@lid";
const esc = (s) => String(s).replaceAll("'", "''");
/** The rows exactly as version 2.2 stored them (before migration 003), so every later migration and the backfill run over them. */
const seed = real.chats.flatMap((c) => c.messages.map((m) =>
  `INSERT INTO messages (user_id, session, chat_id, msg_id, from_me, sender, body, has_media, sent_at) VALUES ('u1','default','${esc(c.chatId)}','${esc(m.id)}',${m.fromMe},'${esc(m.sender)}','${esc(m.body)}',FALSE,'${m.sentAt}');`)).join("\n");
const total = (id) => real.chats.find((c) => c.chatId === id).messages.length;
const old = (opts = {}) => harness(plugin, migrations, { seed, seedBefore: "003_replies_lids", phone: "+5534988880000", ...opts });

test("brVariants: both spellings of a Brazilian mobile, nothing else", () => {
  assert.deepEqual(ids.brVariants("553488880000"), ["5534988880000", "553488880000"]);
  assert.deepEqual(ids.brVariants("5534988880000"), ["5534988880000", "553488880000"]);
  assert.equal(ids.brVariants("553432210000"), null, "a landline (first digit 2-5) has one spelling");
  assert.equal(ids.brVariants("5511999999999")?.[1], "551199999999");
  assert.equal(ids.brVariants("15551234567"), null); assert.equal(ids.brVariants("351912345678"), null);
  assert.equal(ids.displayDigits("553488880000"), "5534988880000");
  assert.deepEqual(ids.pnSpellings(EIGHT), [EIGHT, NINE]);
  assert.equal(ids.normId("5534988880000:12@s.whatsapp.net"), NINE);
  assert.equal(ids.normId({ _serialized: "23000000000001:3@lid" }), LID);
});

test("real inbox, WAHA silent: the two spellings of the user's number are one chat right after the update", async () => {
  const h = await old();
  const chats = await h.chats();
  const mine = chats.filter((c) => c.phone === "5534988880000");
  assert.equal(mine.length, 1, "553488880000 and 5534988880000 are one chat");
  assert.equal(mine[0].total, total(EIGHT) + total(NINE));
  assert.equal(mine[0].isSelf, true);
  assert.equal(chat.chatTitle(mine[0]), "You");
  assert.equal(chat.subtitle(mine[0]), "Message yourself");
  // Without WAHA's help the lid stays its own chat (nothing in the stored rows ties it to a number), and the other lid is untouched.
  assert.equal(chats.length, 3);
  assert.ok(chats.some((c) => c.chatId === LID) && chats.some((c) => c.chatId === OTHER_LID));
  // The user can link by hand.
  await h.post("/link", { chatId: LID, withChatId: mine[0].chatId });
  const after = await h.chats();
  assert.equal(after.length, 2);
  assert.equal(after.find((c) => c.isSelf).total, total(EIGHT) + total(NINE) + total(LID));
});

test("real inbox, WAHA answers check-exists and lids: all three ids are one chat called You", async () => {
  const h = await old({ waha: (method, path, { query }) => {
    if (path === "/api/contacts/check-exists") return { json: { numberExists: true, chatId: EIGHT } };
    if (path === "/api/default/lids/pn/553488880000") return { json: { lid: LID, pn: EIGHT } };
    if (path.startsWith("/api/default/lids/pn/")) return { json: { lid: null, pn: query.x ?? null } };
    return undefined;
  } });
  const chats = await h.chats();
  assert.equal(chats.length, 2, JSON.stringify(chats.map((c) => c.chatId)));
  const me = chats.find((c) => c.isSelf);
  // WAHA says the registered id is the 12-digit one: that is the canonical chat; the display keeps the ninth digit.
  assert.equal(me.chatId, EIGHT);
  assert.equal(me.phone, "5534988880000");
  assert.equal(me.total, total(EIGHT) + total(NINE) + total(LID));
  assert.equal(me.lastBody, real.chats[0].messages.at(-1).body, "the newest message of the merged chat is the lid one");
  const log = await h.messages(EIGHT);
  assert.equal(log.length, me.total);
  assert.deepEqual(log.map((m) => m.sentAt), [...log.map((m) => m.sentAt)].sort(), "one timeline across the three addresses");
  // Any of the three ids opens the same conversation.
  assert.equal((await h.messages(LID)).length, me.total);
  assert.equal((await h.messages(NINE)).length, me.total);
  // Replies go where the user last wrote from (the lid), never to the unverified spelling.
  await h.idle();
  h.requests.length = 0;
  await h.post("/send", { chatId: EIGHT, text: "ok" });
  const sent = h.requests.find((r) => r.path === "/api/sendText");
  assert.equal(sent.body.chatId, LID);
});

test("real inbox, GOWS-style check-exists (chatId is the lid, pn the phone) links without the lids API", async () => {
  const h = await old({ waha: (_m, path) => (path === "/api/contacts/check-exists" ? { json: { numberExists: true, chatId: LID, pn: EIGHT } } : undefined) });
  const chats = await h.chats();
  assert.equal(chats.length, 2);
  assert.equal(chats.find((c) => c.isSelf).chatId, EIGHT);
});

test("real inbox, the number is the WhatsApp account itself: session me {id, lid} links the own lid", async () => {
  const h = await old({ waha: (_m, path) => (path === "/api/sessions/default" ? { json: { name: "default", status: "WORKING", engine: { engine: "GOWS" }, me: { id: EIGHT, lid: LID, pushName: "Victor" } } } : undefined) });
  const chats = await h.chats();
  assert.equal(chats.length, 2);
  const me = chats.find((c) => c.isSelf);
  assert.equal(me.total, total(EIGHT) + total(NINE) + total(LID));
  assert.equal(chat.chatTitle(me), "Victor (You)");
});

test("the own lid is also learned from the webhook envelope's me", async () => {
  const h = await old();
  await h.message({ from: "5511988887777@c.us" }, { me: { id: "553488880000:7@s.whatsapp.net", lid: "23000000000001:7@lid", pushName: "Victor" } });
  const chats = await h.chats();
  assert.equal(chats.filter((c) => c.isSelf).length, 1);
  assert.equal(chats.find((c) => c.isSelf).total, total(EIGHT) + total(NINE) + total(LID));
});

test("real inbox, no lids API: the same message seen under the phone id (history sync) proves the lid and the phone are one chat", async () => {
  const lidMsgs = real.chats[0].messages.filter((m) => !m.fromMe);
  const h = await old({ waha: (_m, path) => {
    if (path === "/api/contacts/check-exists") return { json: { numberExists: true, chatId: EIGHT } };
    // WAHA merges the lid chat into the phone chat (merge=true): the same stanza ids come back addressed by phone.
    if (path === `/api/default/chats/${EIGHT}/messages`) return { json: lidMsgs.slice(-3).map((m) => ({ id: m.id.replace(LID, EIGHT), timestamp: Date.parse(m.sentAt) / 1000, from: EIGHT, fromMe: false, body: m.body, hasMedia: false })) };
    return undefined;
  } });
  assert.equal((await h.chats()).length, 3);
  await h.messages(EIGHT);
  await h.idle();
  const chats = await h.chats();
  assert.equal(chats.length, 2);
  assert.equal(chats.find((c) => c.isSelf).total, total(EIGHT) + total(NINE) + total(LID), "no message is duplicated by the sync");
});

test("an inbound message from the 12-digit id makes it canonical even when the 13-digit one was typed first", async () => {
  const h = await harness(plugin, migrations, {});
  await h.post("/send", { chatId: "5531988887777@c.us", text: "hello" });
  assert.deepEqual((await h.chats()).map((c) => c.chatId), ["5531988887777@c.us"]);
  await h.message({ from: "553188887777@c.us", body: "hi back" });
  const chats = await h.chats();
  assert.equal(chats.length, 1);
  assert.equal(chats[0].chatId, "553188887777@c.us");
  assert.equal(chats[0].phone, "5531988887777");
  assert.equal(chats[0].total, 2);
  // Both spellings reported by WAHA (two real accounts cannot share a line, but never fold one real id into another silently).
  await h.message({ from: "5531988887777@c.us", body: "also me" });
  assert.equal((await h.chats()).length, 1);
});

test("a lid linked to one spelling follows the chat when the canonical spelling changes", async () => {
  const h = await harness(plugin, migrations, {});
  await h.message({ from: "99999000001@lid", _data: { key: { remoteJidAlt: "5531988887777@s.whatsapp.net" } } });
  await h.message({ from: "553188887777@c.us" });
  const chats = await h.chats();
  assert.equal(chats.length, 1);
  assert.equal(chats[0].total, 2);
  const rows = await h.sql("SELECT lid, pn FROM lid_map ORDER BY lid");
  assert.ok(rows.every((r) => r.pn === chats[0].chatId), "the alias map is flat: every alias points at the canonical id");
});

test("names and avatars come from WAHA instead of Unknown contact", async () => {
  const png = Buffer.from("iVBORw0KGgo=", "base64");
  const h = await harness(plugin, migrations, {
    waha: (_m, path, { query }) => {
      if (path === "/api/contacts" && query.contactId === "5511988887777@c.us") return { json: { id: "5511988887777@c.us", number: "5511988887777", name: "Marina Costa", pushname: "Mari" } };
      if (path === "/api/contacts/profile-picture") return { json: { profilePictureURL: "https://pps.whatsapp.net/v/t61/abc.jpg" } };
      return undefined;
    },
    web: (url) => (url.startsWith("https://pps.whatsapp.net/") ? { bytes: png, headers: { "content-type": "image/jpeg" } } : undefined),
  });
  await h.message({ from: "5511988887777@c.us" });
  assert.equal((await h.chats())[0].name, null);
  await h.idle();
  const c = (await h.chats())[0];
  assert.equal(c.name, "Marina Costa");
  assert.equal(typeof c.avatar, "number");
  assert.match((await h.get("/avatar", { chatId: c.chatId })).data, /^data:image\/jpeg;base64,/);
  assert.ok(h.events.some((e) => e.name === "chats"), "the UI is told to refresh once names arrive");
  // Looked up once, not on every chat list read.
  const n = h.requests.filter((r) => r.path === "/api/contacts").length;
  await h.chats(); await h.idle();
  assert.equal(h.requests.filter((r) => r.path === "/api/contacts").length, n);
});
