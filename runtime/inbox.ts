// The inbox routes of the UI: read, send every kind of message, act on messages, media and avatars. A click in the UI is consent, so nothing here asks for approval.
import type { Core } from "./core.js";
import type { Identity } from "./identity.js";
import type { Store } from "./messages.js";
import { digitsOf, isGroup, normId, pnOf, stanzaOf } from "./ids.js";
import { linkFromSend, sentIdOf, type MediaMeta, type MessageExtra, type MessageType, type ReplyRef } from "./parse.js";
import { WahaError } from "./client.js";

/** WAHA statuses after which the other address of a merged chat is tried: the id was not accepted, nothing was sent. */
const RETRY_OTHER_ID = new Set([400, 404, 422, 500]);
/** Upload cap of one file (decoded bytes). The host accepts 8 MiB JSON bodies; base64 adds a third. */
export const UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
const MEDIA_KINDS = ["image", "video", "audio", "voice", "document", "sticker"] as const;
type MediaKind = (typeof MEDIA_KINDS)[number];
const SEND_PATH: Record<MediaKind, string> = { image: "/api/sendImage", video: "/api/sendVideo", audio: "/api/sendFile", voice: "/api/sendVoice", document: "/api/sendFile", sticker: "/api/sendSticker" };

export interface Outgoing { type: MessageType; body: string; media?: MediaMeta | null; extra?: MessageExtra; bytes?: Uint8Array }
export interface Inbox {
  /** Sends through WAHA (`call` gets the address to use) and records the outgoing message. A merged chat is tried where the contact last wrote from, then on its other addresses. */
  deliver(userId: string, chatId: string, out: Outgoing, replyTo: unknown, call: (target: string, replyId: string | undefined) => Promise<unknown>): Promise<{ status: "sent"; id: string }>;
  sendText(userId: string, chatId: string, text: string, replyTo?: unknown, mentions?: unknown): Promise<{ status: "sent"; id: string }>;
  sendMedia(userId: string, chatId: string, body: Record<string, unknown>): Promise<{ status: "sent"; id: string }>;
  react(userId: string, messageId: unknown, emoji: unknown): Promise<{ ok: true }>;
}

export function createInbox(core: Core, identity: Identity, store: Store): Inbox {
  const { ctx } = core;
  const q = (sql: string, params: unknown[]) => ctx.db.query(sql, params);
  const enc = encodeURIComponent;

  /** The stored message a reply quotes: it must belong to the same (merged) chat. Null when there is none. */
  async function quoted(userId: string, ids: string[], replyTo: unknown): Promise<{ msgId: string; ref: ReplyRef } | null> {
    if (replyTo === undefined || replyTo === null || replyTo === "") return null;
    if (typeof replyTo !== "string" || replyTo.length > 200) throw ctx.httpError(400, "invalid_reply", "replyTo is not a message of this chat");
    const r = await q(`SELECT msg_id, from_me, sender, body, has_media FROM {{p}}messages WHERE user_id = $1 AND session = $S AND chat_id = ANY($2::text[]) AND msg_id = $3 LIMIT 1`, [userId, ids, replyTo]);
    const x = r.rows.find((row) => row.msg_id === replyTo);
    if (!x) throw ctx.httpError(400, "invalid_reply", "replyTo is not a message of this chat");
    // A message WAHA gave no id for cannot be quoted on WhatsApp.
    if (replyTo.startsWith("out-")) throw ctx.httpError(400, "invalid_reply", "This message cannot be quoted yet.");
    return { msgId: replyTo, ref: { id: stanzaOf(replyTo), body: String(x.body ?? "").slice(0, 400), sender: x.from_me === true ? "me" : String(x.sender ?? ""), hasMedia: x.has_media === true } };
  }

  const inbox: Inbox = {
    async deliver(userId, chatId, out, replyTo, call) {
      const c = await core.ready(userId);
      const ids = await identity.aliases(userId, chatId);
      const reply = await quoted(userId, ids, replyTo);
      const order = await store.route(userId, chatId);
      let res: unknown = null, used = order[0], failure = 0, sent = false;
      for (const target of order) {
        try { res = await call(target, reply?.msgId); used = target; sent = true; break; }
        catch (error) { if (!(error instanceof WahaError)) throw error; failure = error.status; if (!RETRY_OTHER_ID.has(failure)) break; }
      }
      if (!sent) core.fail(new WahaError(failure), "send");
      if (order.length > 1 && used !== order[0]) await ctx.kv.set(userId, `route:${ids[0]}`, used);
      const l = linkFromSend(res, used);
      if (l) { await identity.seen(userId, l.pn, true); await identity.link(userId, l.lid, l.pn); }
      const msgId = sentIdOf(res, used) ?? `out-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const stanza = stanzaOf(msgId);
      if (out.bytes && out.media) await store.putBlob(userId, "m:" + stanza, out.media.mime, out.bytes).catch(() => undefined);
      await store.save(userId, {
        source: "api", session: c.session, chatId: used, msgId, stanza, fromMe: true, sender: "me", senderName: "", senderPhone: "", body: out.body, type: out.type,
        hasMedia: Boolean(out.media), media: out.media ?? null, extra: out.extra ?? {}, ack: 1, sentAt: new Date(), reply: reply?.ref ?? null, links: [],
      }, { real: false });
      await store.markRead(userId, ids[0]);
      core.publish(userId, "message", { chatId: await identity.canonical(userId, ids[0]), fromMe: true });
      return { status: "sent" as const, id: msgId };
    },

    sendText(userId, chatId, text, replyTo, mentions) {
      const list = (Array.isArray(mentions) ? mentions : []).map((m) => pnOf(normId(m)) ?? (m === "all" ? "all" : "")).filter(Boolean).slice(0, 50);
      return inbox.deliver(userId, chatId, { type: "chat", body: text, extra: list.length ? { mentions: list } : {} }, replyTo,
        (target, reply_to) => core.waha(userId, "POST", "/api/sendText", { body: { chatId: target, text, ...(reply_to ? { reply_to } : {}), ...(list.length ? { mentions: list } : {}) } }));
    },

    async sendMedia(userId, chatId, b) {
      const kind = MEDIA_KINDS.find((k) => k === b.kind);
      if (!kind) throw ctx.httpError(400, "invalid_kind", "kind must be one of " + MEDIA_KINDS.join(", "));
      const data = typeof b.data === "string" ? b.data.replace(/^data:[^,]*,/, "") : "";
      if (!data || !/^[A-Za-z0-9+/=\s]+$/.test(data.slice(0, 2000))) throw ctx.httpError(400, "invalid_file", "data must be the file as base64");
      const bytes = Buffer.from(data, "base64");
      if (!bytes.length) throw ctx.httpError(400, "invalid_file", "The file is empty.");
      if (bytes.length > UPLOAD_MAX_BYTES) throw ctx.httpError(413, "file_too_large", `Files up to ${Math.floor(UPLOAD_MAX_BYTES / 1024 / 1024)} MB can be sent from Floq.`);
      const mime = typeof b.mime === "string" && /^[\w.+-]+\/[\w.+-]+(;[\w\s=.+-]+)*$/.test(b.mime) ? b.mime.slice(0, 100) : "application/octet-stream";
      const filename = (typeof b.filename === "string" ? b.filename : "").replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 150) || (kind === "voice" ? "voice.ogg" : "file");
      const caption = kind === "voice" || kind === "sticker" ? "" : core.optText(b.caption, 4096);
      const duration = Number.isFinite(Number(b.duration)) ? Math.max(0, Math.round(Number(b.duration))) : undefined;
      const baseMime = mime.split(";")[0].trim().toLowerCase();
      // WhatsApp wants OGG/Opus voice notes and H.264 MP4 video: anything else is converted by WAHA.
      const convert = kind === "voice" ? !(baseMime === "audio/ogg" && /opus/i.test(mime)) : kind === "video" ? baseMime !== "video/mp4" : false;
      const file = { mimetype: kind === "voice" && !convert ? "audio/ogg; codecs=opus" : baseMime, filename, data: bytes.toString("base64") };
      const type: MessageType = kind === "voice" ? "ptt" : kind;
      return inbox.deliver(userId, chatId, { type, body: caption, bytes, media: { mime: baseMime, filename, size: bytes.length, ...(duration ? { duration } : {}) } }, b.replyTo,
        (target, reply_to) => core.waha(userId, "POST", SEND_PATH[kind], { body: { chatId: target, file, ...(caption ? { caption } : {}), ...(kind === "voice" || kind === "video" ? { convert } : {}), ...(reply_to ? { reply_to } : {}) } }));
    },

    async react(userId, messageId, emoji) {
      const x = await store.row(userId, messageId);
      const e = typeof emoji === "string" ? emoji.slice(0, 16) : "";
      if (String(x.msg_id).startsWith("out-")) throw ctx.httpError(400, "invalid_message", "This message cannot be reacted to yet.");
      await core.guard(() => core.waha(userId, "PUT", "/api/reaction", { body: { messageId: x.msg_id, reaction: e } }), "reaction");
      const stanza = String(x.stanza);
      if (!e) await q(`DELETE FROM {{p}}reactions WHERE user_id = $1 AND session = $S AND stanza = $2 AND sender = 'me'`, [userId, stanza]);
      else await q(`INSERT INTO {{p}}reactions (user_id, session, stanza, sender, emoji) VALUES ($1,$S,$2,'me',$3) ON CONFLICT (user_id, session, stanza, sender) DO UPDATE SET emoji = EXCLUDED.emoji, at = now()`, [userId, stanza, e]);
      return { ok: true };
    },
  };

  const R = ctx.routes;
  const b = (body: unknown) => core.obj(body);
  /** The message row plus the path prefix of WAHA's per-message endpoints. */
  const msg = async (userId: string, id: unknown) => { const x = await store.row(userId, id); return { x, path: `/api/{session}/chats/${enc(String(x.chat_id))}/messages/${enc(String(x.msg_id))}` }; };
  const changed = async (userId: string, chatId: unknown) => core.publish(userId, "message", { chatId: await identity.canonical(userId, String(chatId)) });

  R.get("/chats", async ({ userId, query }) => {
    await core.owner(userId);
    const first = (await q(`SELECT 1 AS x FROM {{p}}messages WHERE user_id = $1 AND session = $S LIMIT 1`, [userId])).rows.length === 0;
    await identity.ensure(userId);
    // WAHA's own chat list fills the inbox with chats that never produced a webhook; awaited only when there is nothing to show yet.
    const sync = store.syncChats(userId).then(async (ch) => { if (ch && !first) core.publish(userId, "chats", {}); });
    if (first) await sync; else core.bg(sync);
    const out = await store.listChats(userId, { archived: query.archived === "1" || query.archived === "true" });
    const need = out.chats.filter((c) => c.kind !== "other" && (!c.name || c.avatar === null)).map((c) => String(c.chatId));
    if (need.length) core.bg(identity.enrich(userId, need).then((ch) => { if (ch) core.publish(userId, "chats", {}); }));
    const me = await identity.me(userId);
    return { ...out, me: me ? { name: me.name, phone: digitsOf(me.id) } : null };
  });
  R.get("/messages", async ({ userId, query }) => { await core.owner(userId); return store.listMessages(userId, core.chatId(query.chatId), { limit: query.limit, before: query.before, q: query.q }); });
  R.post("/read", async ({ userId, body }) => {
    await core.owner(userId);
    const chatId = core.chatId(b(body).chatId);
    await store.markRead(userId, chatId);
    // Blue ticks for the other side, like opening the chat on the phone. Best effort.
    const [target] = await store.route(userId, chatId);
    core.bg(core.tryWaha(userId, "POST", "/api/sendSeen", { body: { chatId: target } }));
    return { ok: true };
  });
  R.post("/send", async ({ userId, body }) => { await core.owner(userId); const o = b(body); return inbox.sendText(userId, core.chatId(o.chatId), core.text(o.text), o.replyTo, o.mentions); });
  R.post("/send-media", async ({ userId, body }) => { await core.owner(userId); const o = b(body); return inbox.sendMedia(userId, core.chatId(o.chatId), o); });
  R.post("/send-location", async ({ userId, body }) => {
    await core.owner(userId);
    const o = b(body), lat = Number(o.latitude), lng = Number(o.longitude), title = core.optText(o.title, 120);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw ctx.httpError(400, "invalid_location", "latitude and longitude are invalid");
    return inbox.deliver(userId, core.chatId(o.chatId), { type: "location", body: "", extra: { location: { lat, lng, name: title, address: "" } } }, o.replyTo,
      (target, reply_to) => core.waha(userId, "POST", "/api/sendLocation", { body: { chatId: target, latitude: lat, longitude: lng, title, ...(reply_to ? { reply_to } : {}) } }));
  });
  R.post("/send-contact", async ({ userId, body }) => {
    await core.owner(userId);
    const o = b(body);
    const contacts = (Array.isArray(o.contacts) ? o.contacts : []).map((c) => ({ name: core.optText(core.obj(c).name, 80).trim(), phone: String(core.obj(c).phone ?? "").replace(/\D/g, "") })).filter((c) => c.name && /^\d{8,15}$/.test(c.phone)).slice(0, 5);
    if (!contacts.length) throw ctx.httpError(400, "invalid_contact", "Give a name and a phone number in international format.");
    return inbox.deliver(userId, core.chatId(o.chatId), { type: "vcard", body: "", extra: { vcards: contacts.map((c) => ({ name: c.name, phones: [c.phone] })) } }, o.replyTo,
      (target, reply_to) => core.waha(userId, "POST", "/api/sendContactVcard", { body: { chatId: target, contacts: contacts.map((c) => ({ fullName: c.name, phoneNumber: "+" + c.phone, whatsappId: c.phone })), ...(reply_to ? { reply_to } : {}) } }));
  });
  R.post("/send-poll", async ({ userId, body }) => {
    await core.owner(userId);
    const o = b(body), name = core.text(o.name, 255, "name");
    const options = [...new Set((Array.isArray(o.options) ? o.options : []).map((x) => core.optText(x, 100).trim()).filter(Boolean))].slice(0, 12);
    if (options.length < 2) throw ctx.httpError(400, "invalid_poll", "A poll needs at least two different options.");
    const multiple = o.multiple === true;
    return inbox.deliver(userId, core.chatId(o.chatId), { type: "poll", body: "", extra: { poll: { name, options, multiple } } }, o.replyTo,
      (target, reply_to) => core.waha(userId, "POST", "/api/sendPoll", { body: { chatId: target, poll: { name, options, multipleAnswers: multiple }, ...(reply_to ? { reply_to } : {}) } }));
  });
  R.post("/poll-vote", async ({ userId, body }) => {
    await core.owner(userId);
    const o = b(body), { x } = await msg(userId, o.messageId);
    const votes = (Array.isArray(o.options) ? o.options : []).filter((v): v is string => typeof v === "string").slice(0, 12);
    await core.guard(() => core.waha(userId, "POST", "/api/sendPollVote", { body: { chatId: x.chat_id, pollMessageId: x.msg_id, votes } }), "poll vote");
    await q(`INSERT INTO {{p}}poll_votes (user_id, session, stanza, voter, options) VALUES ($1,$S,$2,'me',$3::jsonb) ON CONFLICT (user_id, session, stanza, voter) DO UPDATE SET options = EXCLUDED.options, at = now()`, [userId, x.stanza, JSON.stringify(votes)]);
    await changed(userId, x.chat_id);
    return { ok: true };
  });
  R.post("/react", async ({ userId, body }) => { await core.owner(userId); const o = b(body); const r = await inbox.react(userId, o.messageId, o.emoji); await changed(userId, (await store.row(userId, o.messageId)).chat_id); return r; });
  R.post("/edit", async ({ userId, body }) => {
    await core.owner(userId);
    const o = b(body), text = core.text(o.text), { x, path } = await msg(userId, o.messageId);
    if (x.from_me !== true) throw ctx.httpError(400, "not_yours", "Only your own messages can be edited.");
    await core.guard(() => core.waha(userId, "PUT", path, { body: { text } }), "edit");
    await q(`UPDATE {{p}}messages SET body = $2, edited_at = now() WHERE id = $1`, [x.id, text]);
    await changed(userId, x.chat_id);
    return { ok: true };
  });
  R.post("/delete", async ({ userId, body }) => {
    await core.owner(userId);
    const o = b(body), { x, path } = await msg(userId, o.messageId);
    if (o.forEveryone === true) {
      if (x.from_me !== true && !isGroup(String(x.chat_id))) throw ctx.httpError(400, "not_yours", "Only your own messages can be deleted for everyone.");
      await core.guard(() => core.waha(userId, "DELETE", path), "delete");
      await q(`UPDATE {{p}}messages SET deleted_at = now() WHERE id = $1`, [x.id]);
    } else {
      // "Delete for me": gone from this inbox only.
      await q(`DELETE FROM {{p}}messages WHERE id = $1`, [x.id]);
    }
    await changed(userId, x.chat_id);
    return { ok: true };
  });
  R.post("/forward", async ({ userId, body }) => {
    await core.owner(userId);
    const o = b(body), { x } = await msg(userId, o.messageId);
    const to = [...new Set((Array.isArray(o.to) ? o.to : [o.to]).map((t) => core.chatId(t)))].slice(0, 5);
    if (!to.length) throw ctx.httpError(400, "invalid_chat", "Pick at least one chat.");
    const media = x.media ? (core.obj(x.media) as unknown as MediaMeta) : null, extra = { ...(core.obj(x.extra) as MessageExtra), forwarded: true };
    for (const chatId of to) {
      await inbox.deliver(userId, chatId, { type: String(x.type) as MessageType, body: String(x.body ?? ""), media, extra }, undefined,
        (target) => core.waha(userId, "POST", "/api/forwardMessage", { body: { chatId: target, messageId: x.msg_id } }));
    }
    return { ok: true, sent: to.length };
  });
  R.post("/star", async ({ userId, body }) => {
    await core.owner(userId);
    const o = b(body), { x } = await msg(userId, o.messageId), star = o.star !== false;
    await core.guard(() => core.waha(userId, "PUT", "/api/star", { body: { messageId: x.msg_id, chatId: x.chat_id, star } }), "star");
    await q(`UPDATE {{p}}messages SET starred = $2 WHERE id = $1`, [x.id, star]);
    await changed(userId, x.chat_id);
    return { ok: true };
  });
  R.post("/pin", async ({ userId, body }) => {
    await core.owner(userId);
    const o = b(body), { x, path } = await msg(userId, o.messageId), pin = o.pin !== false;
    const duration = [86400, 604800, 2592000].includes(Number(o.duration)) ? Number(o.duration) : 604800;
    await core.guard(() => core.waha(userId, "POST", path + (pin ? "/pin" : "/unpin"), pin ? { body: { duration } } : {}), "pin");
    await q(`UPDATE {{p}}messages SET pinned = $2 WHERE id = $1`, [x.id, pin]);
    await changed(userId, x.chat_id);
    return { ok: true };
  });
  R.get("/message-info", async ({ userId, query }) => {
    await core.owner(userId);
    const { x, path } = await msg(userId, query.id);
    // The newest delivery state straight from WAHA when it can tell.
    const live = core.obj(await core.tryWaha(userId, "GET", path));
    const ack = Number.isFinite(Number(live.ack)) ? Math.max(Number(x.ack) || 0, Math.trunc(Number(live.ack))) : Number(x.ack) || 0;
    if (ack !== Number(x.ack)) await q(`UPDATE {{p}}messages SET ack = $2 WHERE id = $1`, [x.id, Math.min(4, ack)]);
    const reactions = (await q(`SELECT r.emoji, COALESCE(lm.pn, r.sender) AS sender, r.at, COALESCE(NULLIF(c.name,''), c.push_name, '') AS name FROM {{p}}reactions r LEFT JOIN {{p}}lid_map lm ON lm.user_id = $1 AND lm.session = $S AND lm.lid = r.sender LEFT JOIN {{p}}contacts c ON c.user_id = $1 AND c.session = $S AND c.chat_id = COALESCE(lm.pn, r.sender) WHERE r.user_id = $1 AND r.session = $S AND r.stanza = $2 ORDER BY r.at`, [userId, x.stanza])).rows;
    return { id: x.msg_id, fromMe: x.from_me === true, sentAt: new Date(x.sent_at as string).toISOString(), ack: Math.min(4, ack), edited: Boolean(x.edited_at), starred: x.starred === true, pinned: x.pinned === true, type: x.type,
      reactions: reactions.map((r) => ({ emoji: r.emoji, fromMe: r.sender === "me", name: String(r.name ?? ""), phone: digitsOf(String(r.sender)), at: new Date(r.at as string).toISOString() })) };
  });
  R.get("/media", async ({ userId, query }) => {
    await core.owner(userId);
    const f = await store.mediaBytes(userId, String(query.id ?? ""));
    return { mime: f.mime, filename: f.filename, size: f.bytes.length, data: Buffer.from(f.bytes).toString("base64") };
  });
  R.get("/avatar", async ({ userId, query }) => {
    await core.owner(userId);
    const a = await identity.avatar(userId, core.chatId(query.chatId));
    return a ? { data: `data:${a.mime};base64,${Buffer.from(a.bytes).toString("base64")}` } : { data: null };
  });
  R.post("/typing", async ({ userId, body }) => {
    await core.owner(userId);
    const o = b(body), chatId = core.chatId(o.chatId), state = o.state === "recording" ? "recording" : o.state === "composing" ? "typing" : "paused";
    const [target] = await store.route(userId, chatId);
    await core.tryWaha(userId, "POST", "/api/{session}/presence", { body: { chatId: target, presence: state } });
    return { ok: true };
  });
  // Lets the user fix a link WAHA could not make: "this chat and that chat are the same person".
  R.post("/link", async ({ userId, body }) => {
    await core.owner(userId);
    const o = b(body), a = core.chatId(o.chatId), w = core.chatId(o.withChatId);
    if (isGroup(a) || isGroup(w) || a === w) throw ctx.httpError(400, "invalid_chat", "Pick two different 1:1 chats.");
    const ca = await identity.canonical(userId, a), cw = await identity.canonical(userId, w);
    if (ca !== cw) { if (pnOf(ca) && !pnOf(cw)) await identity.link(userId, cw, ca); else await identity.link(userId, ca, cw); }
    core.publish(userId, "chats", {});
    return { ok: true, chatId: await identity.canonical(userId, a) };
  });
  return inbox;
}
