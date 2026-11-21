// WAHA payloads -> rows. Pure: no I/O. Engines differ (WEBJS: _data.type and flat fields; NOWEB: _data.message.<kind>Message; GOWS: _data.Info + _data.Message),
// so every reader looks in all the places and matches proto field names case-insensitively.
import { CHAT_ID, digitsOf, isGroup, lidOf, normId, pnOf, stanzaOf } from "./ids.js";

export type MessageType = "chat" | "image" | "video" | "audio" | "ptt" | "document" | "sticker" | "location" | "vcard" | "poll" | "call" | "system" | "reaction" | "unknown";
export interface ReplyRef { id: string; body: string; sender: string; hasMedia: boolean }
export interface IdLink { lid: string; pn: string }
export interface MediaMeta { url?: string; mime: string; filename: string; size?: number; duration?: number; width?: number; height?: number; error?: boolean; gif?: boolean }
export interface VCard { name: string; phones: string[] }
export interface MessageExtra {
  location?: { lat: number; lng: number; name: string; address: string; live?: boolean };
  vcards?: VCard[];
  poll?: { name: string; options: string[]; multiple: boolean };
  mentions?: string[];
  preview?: { title: string; description: string; url: string };
  forwarded?: boolean;
  call?: { video: boolean; status: string };
}
export interface Parsed {
  source: string; session: string; chatId: string; msgId: string; stanza: string; fromMe: boolean; sender: string; senderName: string; senderPhone: string;
  body: string; type: MessageType; hasMedia: boolean; media: MediaMeta | null; extra: MessageExtra; ack: number; sentAt: Date; reply: ReplyRef | null; links: IdLink[];
  /** A reaction delivered as a message (some engines): not stored as a row. */
  reaction?: { target: string; emoji: string };
}

export const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const s = (v: unknown, max: number) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "").slice(0, max);
const text = (v: unknown, max: number) => s(v, max).replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, "");
const num = (v: unknown): number | undefined => { const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : rec(v).low !== undefined ? Number(rec(v).low) : NaN; return Number.isFinite(n) ? n : undefined; };
/** Case-insensitive property read (proto JSON is camelCase on NOWEB and PascalCase-ish on some GOWS builds). */
export function ci(o: Record<string, unknown>, ...names: string[]): unknown {
  for (const n of names) { if (o[n] !== undefined) return o[n]; }
  const keys = Object.keys(o);
  for (const n of names) { const k = keys.find((x) => x.toLowerCase() === n.toLowerCase()); if (k !== undefined) return o[k]; }
  return undefined;
}

export function displayName(p: Record<string, unknown>): string {
  const d = rec(p._data);
  for (const v of [d.notifyName, d.pushName, rec(d.Info).PushName, p.notifyName, p.pushName]) {
    if (typeof v !== "string") continue;
    const t = v.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").trim().slice(0, 80);
    if (t) return t;
  }
  return "";
}

function senderPhoneOf(chatId: string, p: Record<string, unknown>): string {
  const own = digitsOf(chatId);
  if (own) return own;
  if (!chatId.endsWith("@lid")) return "";
  const d = rec(p._data);
  for (const v of [rec(d.key).remoteJidAlt, rec(d.key).senderPn, rec(d.Info).SenderAlt, d.senderPn]) { const pn = pnOf(normId(v)); if (pn) return digitsOf(pn)!; }
  return "";
}

export function participantOf(p: Record<string, unknown>): string {
  const d = rec(p._data);
  for (const v of [p.participant, rec(d.key).participant, p.author, d.author, rec(d.Info).Sender]) { const id = normId(v); if (id && !isGroup(id)) return id; }
  return "";
}

/**
 * Every lid <-> phone pair an event carries. Engines put the alternate address in different places
 * (NOWEB: key.remoteJidAlt / participantAlt / senderPn; GOWS: Info.SenderAlt / RecipientAlt; WEBJS: _data.from / author objects).
 * A fromMe event's "sender" is the account itself, so only the recipient side is read there.
 */
export function linksOf(p: Record<string, unknown>, chatId: string, fromMe: boolean): IdLink[] {
  const d = rec(p._data), key = rec(d.key), info = rec(d.Info);
  const out = new Map<string, string>();
  const pair = (a: unknown, b: unknown) => {
    const x = normId(a), y = normId(b);
    const lid = lidOf(x) ?? lidOf(y), pn = pnOf(x) ?? pnOf(y);
    if (lid && pn) out.set(lid, pn);
  };
  if (isGroup(chatId)) {
    if (!fromMe) {
      const who = participantOf(p);
      for (const alt of [key.participantAlt, key.participantPn, key.participantLid, p.participantAlt, p.participantPn, info.SenderAlt, d.senderPn, d.senderLid, key.senderPn, key.senderLid]) pair(who, alt);
      pair(info.Sender, info.SenderAlt);
    }
  } else {
    for (const alt of [key.remoteJidAlt, p.chatIdAlt, fromMe ? info.RecipientAlt : info.SenderAlt, fromMe ? p.toAlt : p.fromAlt, ...(fromMe ? [] : [key.senderPn, key.senderLid, d.senderPn, d.senderLid, p.senderAlt])]) pair(chatId, alt);
    pair(key.remoteJid, key.remoteJidAlt);
    pair(info.Chat, fromMe ? info.RecipientAlt : info.SenderAlt);
  }
  return [...out].map(([lid, pn]) => ({ lid, pn }));
}

const WRAPPERS = ["ephemeralMessage", "viewOnceMessage", "viewOnceMessageV2", "viewOnceMessageV2Extension", "documentWithCaptionMessage", "editedMessage"];
/** The proto message object of NOWEB / GOWS payloads with wrappers (ephemeral, view once, document with caption) removed. {} for WEBJS. */
export function protoOf(p: Record<string, unknown>): Record<string, unknown> {
  const d = rec(p._data);
  let m = rec(d.message ?? d.Message);
  for (let i = 0; i < 4; i++) {
    const w = WRAPPERS.map((k) => rec(ci(m, k))).find((x) => Object.keys(x).length);
    const inner = w ? rec(ci(w, "message")) : {};
    if (!Object.keys(inner).length) break;
    m = inner;
  }
  return m;
}
const KINDS: Array<[string, MessageType]> = [
  ["imageMessage", "image"], ["videoMessage", "video"], ["ptvMessage", "video"], ["audioMessage", "audio"], ["documentMessage", "document"], ["stickerMessage", "sticker"], ["lottieStickerMessage", "sticker"],
  ["locationMessage", "location"], ["liveLocationMessage", "location"], ["contactMessage", "vcard"], ["contactsArrayMessage", "vcard"],
  ["pollCreationMessage", "poll"], ["pollCreationMessageV2", "poll"], ["pollCreationMessageV3", "poll"], ["reactionMessage", "reaction"], ["protocolMessage", "system"],
  ["extendedTextMessage", "chat"], ["conversation", "chat"],
];
const WEBJS: Record<string, MessageType> = {
  chat: "chat", image: "image", video: "video", ptt: "ptt", audio: "audio", document: "document", sticker: "sticker", location: "location", live_location: "location", vcard: "vcard", multi_vcard: "vcard",
  poll_creation: "poll", call_log: "call", revoked: "chat", gp2: "system", e2e_notification: "system", notification: "system", notification_template: "system", protocol: "system", ciphertext: "unknown", reaction: "reaction",
};

/** The proto node of the message's own kind, e.g. the imageMessage object. */
function nodeOf(m: Record<string, unknown>): { type: MessageType; node: Record<string, unknown>; key: string } | null {
  for (const [k, type] of KINDS) { const v = ci(m, k); if (v !== undefined && v !== null) return { type, node: rec(v), key: k }; }
  return null;
}

export function parseVCard(raw: string, fallbackName = ""): VCard {
  const fn = /^FN[^:\n]*:(.+)$/im.exec(raw)?.[1]?.trim() ?? "";
  const phones = [...raw.matchAll(/^(?:item\d+\.)?TEL[^:\n]*:(.+)$/gim)].map((m) => {
    const waid = /waid=(\d{8,15})/i.exec(m[0])?.[1];
    return waid ?? m[1].replace(/[^\d+]/g, "").replace(/^\+/, "");
  }).filter((x) => /^\d{6,15}$/.test(x));
  return { name: text(fn || fallbackName, 80), phones: [...new Set(phones)].slice(0, 5) };
}

const looksBinary = (b: string) => b.length > 200 && /^(\/9j\/|iVBOR|UklGR|R0lGOD|AAAA)/.test(b) && !/\s/.test(b.slice(0, 200));

/** Kind, media details and extras of a WAHA message payload. */
export function describe(p: Record<string, unknown>): { type: MessageType; media: MediaMeta | null; extra: MessageExtra; body: string; reaction?: { target: string; emoji: string } } {
  const d = rec(p._data), info = rec(d.Info), m = protoOf(p), hit = nodeOf(m);
  const pm = rec(p.media);
  let type: MessageType = typeof d.type === "string" && WEBJS[d.type] ? WEBJS[d.type] : hit?.type ?? "unknown";
  const node = hit?.node ?? {};
  const mimeGuess = s(pm.mimetype ?? ci(node, "mimetype") ?? d.mimetype, 100).toLowerCase();
  if (type === "audio" && (ci(node, "ptt") === true || ci(node, "PTT") === true || String(info.MediaType).toLowerCase() === "ptt")) type = "ptt";
  if (type === "unknown") {
    if (p.location) type = "location";
    else if (Array.isArray(p.vCards) && p.vCards.length) type = "vcard";
    else if (p.hasMedia === true || pm.url) type = mimeGuess.startsWith("image/webp") ? "sticker" : mimeGuess.startsWith("image/") ? "image" : mimeGuess.startsWith("video/") ? "video" : mimeGuess.startsWith("audio/") ? (mimeGuess.includes("ogg") ? "ptt" : "audio") : "document";
    else if (typeof p.body === "string" && p.body) type = "chat";
  }
  const extra: MessageExtra = {};
  let body = typeof p.body === "string" ? p.body : "";
  let media: MediaMeta | null = null;
  if (["image", "video", "audio", "ptt", "document", "sticker"].includes(type)) {
    const filename = text(pm.filename ?? ci(node, "fileName") ?? d.filename ?? ci(node, "title") ?? "", 200);
    media = {
      mime: mimeGuess.split(";")[0].trim(), filename,
      ...(typeof pm.url === "string" && pm.url ? { url: pm.url.slice(0, 2000) } : {}),
      ...(num(ci(node, "fileLength") ?? d.size) ? { size: num(ci(node, "fileLength") ?? d.size) } : {}),
      ...(num(ci(node, "seconds") ?? d.duration) ? { duration: num(ci(node, "seconds") ?? d.duration) } : {}),
      ...(num(ci(node, "width") ?? d.width) ? { width: num(ci(node, "width") ?? d.width) } : {}),
      ...(num(ci(node, "height") ?? d.height) ? { height: num(ci(node, "height") ?? d.height) } : {}),
      ...(pm.error ? { error: true } : {}),
      ...(ci(node, "gifPlayback") === true || d.isGif === true ? { gif: true } : {}),
    };
    const caption = ci(node, "caption") ?? d.caption;
    if (typeof caption === "string" && !body) body = caption;
    if (looksBinary(body) || (type !== "document" && body === filename)) body = "";
  }
  if (type === "location") {
    const l = rec(p.location);
    const lat = num(l.latitude ?? ci(node, "degreesLatitude") ?? d.lat), lng = num(l.longitude ?? ci(node, "degreesLongitude") ?? d.lng);
    if (lat !== undefined && lng !== undefined && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      extra.location = { lat, lng, name: text(l.name ?? l.description ?? ci(node, "name") ?? d.loc ?? "", 120), address: text(l.address ?? ci(node, "address") ?? "", 200), ...(hit?.key === "liveLocationMessage" || d.type === "live_location" ? { live: true } : {}) };
    }
    body = looksBinary(body) || !extra.location ? "" : body === extra.location.name ? "" : body;
    if (body.length > 300) body = "";
  }
  if (type === "vcard") {
    const cards: VCard[] = [];
    const raw: Array<{ v: string; n: string }> = [];
    if (Array.isArray(p.vCards)) for (const v of p.vCards) if (typeof v === "string") raw.push({ v, n: "" });
    if (!raw.length && Array.isArray(d.vcardList)) for (const v of d.vcardList) raw.push({ v: s(rec(v).vcard, 4000), n: s(rec(v).displayName, 80) });
    if (!raw.length && hit) {
      const list = Array.isArray(ci(node, "contacts")) ? (ci(node, "contacts") as unknown[]) : [node];
      for (const c of list) raw.push({ v: s(ci(rec(c), "vcard"), 4000), n: s(ci(rec(c), "displayName"), 80) });
    }
    if (!raw.length && /^BEGIN:VCARD/i.test(body)) raw.push({ v: body, n: "" });
    for (const r of raw.slice(0, 10)) { const c = parseVCard(r.v, r.n); if (c.name || c.phones.length) cards.push(c); }
    extra.vcards = cards;
    body = "";
  }
  if (type === "poll") {
    const opts = (Array.isArray(d.pollOptions) ? d.pollOptions : Array.isArray(ci(node, "options")) ? (ci(node, "options") as unknown[]) : Array.isArray(rec(p.poll).options) ? (rec(p.poll).options as unknown[]) : [])
      .map((o) => text(typeof o === "string" ? o : rec(o).name ?? ci(rec(o), "optionName") ?? "", 100)).filter(Boolean).slice(0, 12);
    const count = num(d.pollSelectableOptionsCount ?? ci(node, "selectableOptionsCount") ?? (rec(p.poll).multipleAnswers === false ? 1 : 0)) ?? 0;
    extra.poll = { name: text(d.pollName ?? ci(node, "name") ?? rec(p.poll).name ?? body, 255), options: opts, multiple: count !== 1 };
    body = "";
  }
  if (type === "call") extra.call = { video: d.isVideoCall === true, status: "missed" };
  const ctxInfo = rec(ci(node, "contextInfo"));
  const mentions = (Array.isArray(d.mentionedJidList) ? d.mentionedJidList : Array.isArray(ci(ctxInfo, "mentionedJid", "mentionedJID")) ? (ci(ctxInfo, "mentionedJid", "mentionedJID") as unknown[]) : []).map((x) => normId(x)).filter(Boolean).slice(0, 50);
  if (mentions.length) extra.mentions = mentions;
  if (d.isForwarded === true || ci(ctxInfo, "isForwarded") === true || (num(d.forwardingScore) ?? 0) > 0) extra.forwarded = true;
  if (type === "chat") {
    const title = text(d.title ?? ci(node, "title") ?? "", 200), description = text(d.description ?? ci(node, "description") ?? "", 300), url = text(d.matchedText ?? ci(node, "matchedText") ?? d.canonicalUrl ?? "", 500);
    if (url && /^https?:\/\//i.test(url) && (title || description)) extra.preview = { title, description, url };
    if (!body && hit) body = typeof ci(m, "conversation") === "string" ? (ci(m, "conversation") as string) : s(ci(node, "text"), 8000);
  }
  let reaction: { target: string; emoji: string } | undefined;
  if (type === "reaction") {
    const r = rec(p.reaction);
    const target = stanzaOf(r.messageId ?? rec(ci(node, "key")).id ?? rec(d.msgKey)._serialized ?? "");
    reaction = { target, emoji: text(r.text ?? ci(node, "text") ?? d.reactionText ?? body ?? "", 16) };
  }
  return { type, media, extra, body: text(body, 8000), ...(reaction ? { reaction } : {}) };
}

/** Text of a raw quoted message object (Baileys / whatsmeow shape). */
function quotedText(q: Record<string, unknown>): { body: string; media: boolean } {
  const direct = ci(q, "conversation");
  if (typeof direct === "string" && direct) return { body: direct, media: false };
  const ext = rec(ci(q, "extendedTextMessage"));
  if (typeof ext.text === "string" && ext.text) return { body: ext.text, media: false };
  for (const k of ["imageMessage", "videoMessage", "documentMessage", "audioMessage", "stickerMessage", "documentWithCaptionMessage"]) {
    const m = ci(q, k);
    if (m && typeof m === "object") { const c = rec(m).caption; return { body: typeof c === "string" ? c : "", media: true }; }
  }
  return { body: "", media: false };
}

/**
 * The quoted message of a reply, from WAHA's normalized `replyTo` or the engine's raw fields
 * (WEBJS: _data.quotedMsg + quotedStanzaID; NOWEB / GOWS: contextInfo inside the message object). Null when the message is not a reply.
 */
export function replyOf(p: Record<string, unknown>, me: string | null, chatId: string, links: IdLink[] = []): ReplyRef | null {
  const d = rec(p._data);
  let id = "", body = "", who = "", media = false;
  const r = rec(p.replyTo);
  if (typeof r.id === "string" && r.id) { id = r.id; body = typeof r.body === "string" ? r.body : ""; who = s(r.participant, 100); media = r.hasMedia === true || Boolean(r.media); }
  if (!id && (typeof d.quotedStanzaID === "string" || d.quotedMsg)) {
    const q = rec(d.quotedMsg);
    id = s(d.quotedStanzaID, 200) || s(rec(q.id).id, 200) || s(q.id, 200);
    body = typeof q.body === "string" ? q.body : typeof q.caption === "string" ? q.caption : "";
    who = s(d.quotedParticipant, 100) || s(rec(d.quotedParticipant)._serialized, 100);
    media = typeof q.type === "string" && q.type !== "chat";
    if (media && looksBinary(body)) body = typeof q.caption === "string" ? q.caption : "";
  }
  if (!id) {
    for (const holder of [rec(d.message), rec(d.Message)]) {
      for (const part of Object.values(holder)) {
        const pr = rec(part), c = rec(pr.contextInfo ?? pr.ContextInfo);
        const sid = s(c.stanzaId ?? c.stanzaID ?? c.StanzaID ?? c.StanzaId, 200);
        if (!sid) continue;
        const q = quotedText(rec(c.quotedMessage ?? c.QuotedMessage));
        id = sid; body = q.body; media = q.media; who = s(c.participant ?? c.Participant, 100);
        break;
      }
      if (id) break;
    }
  }
  id = stanzaOf(id);
  if (!id) return null;
  const whoN = normId(who);
  // In a 1:1 chat the quoted message is theirs (either of their addresses) or mine; in a group "mine" needs the account id of the event.
  let sender = whoN;
  if (whoN && me && whoN === me) sender = "me";
  else if (whoN && !isGroup(chatId)) {
    const theirs = new Set([normId(chatId) || chatId, ...links.flatMap((l) => [l.lid, l.pn])]);
    sender = theirs.has(whoN) ? chatId : "me";
  }
  return { id, body: text(body, 400), sender, hasMedia: media };
}

/** A WAHA message object (webhook payload or an item of the chat messages API) to a row. Null when malformed. */
export function parseMessage(p: Record<string, unknown>, session: string, me?: unknown): Parsed | null {
  if (!p || typeof p !== "object") return null;
  const fromMe = p.fromMe === true;
  const from = normId(p.from), to = normId(p.to);
  // Group and broadcast messages are filed under the group; a 1:1 message under the other side.
  const chatId = isGroup(from) ? from : isGroup(to) ? to : fromMe ? to || from : from;
  const msgId = s(typeof p.id === "string" ? p.id : rec(p.id)._serialized, 200);
  if (!chatId || !CHAT_ID.test(chatId) || !msgId) return null;
  const seconds = Number(p.timestamp);
  const meRec = rec(me);
  const mePn = pnOf(normId(meRec.id)), meLid = lidOf(normId(meRec.lid)) ?? lidOf(normId(meRec.id));
  const links = linksOf(p, chatId, fromMe);
  const reply = replyOf(p, mePn ?? meLid, chatId, links);
  if (reply && meLid && reply.sender === meLid) reply.sender = "me";
  const dsc = describe(p);
  const ackRaw = Number(p.ack);
  return {
    reply, links, source: s(p.source, 16).toLowerCase(), session, chatId, msgId, stanza: stanzaOf(msgId), fromMe,
    sender: fromMe ? "me" : (isGroup(chatId) && participantOf(p)) || from,
    senderName: fromMe ? "" : displayName(p), senderPhone: fromMe ? "" : senderPhoneOf(chatId, p),
    body: dsc.body, type: dsc.type, hasMedia: p.hasMedia === true || dsc.media !== null, media: dsc.media, extra: dsc.extra,
    ack: Number.isFinite(ackRaw) ? Math.max(-1, Math.min(4, Math.trunc(ackRaw))) : fromMe ? 1 : 0,
    sentAt: new Date(Number.isFinite(seconds) && seconds > 0 ? seconds * (seconds < 1e12 ? 1000 : 1) : Date.now()),
    ...(dsc.reaction ? { reaction: dsc.reaction } : {}),
  };
}

export const MESSAGE_EVENTS = ["message", "message.any"];
export interface Envelope { event: string; session: string; payload: Record<string, unknown>; me: Record<string, unknown>; engine: string }
/** The webhook envelope, or null when it is not a WAHA event. */
export function parseEnvelope(json: unknown): Envelope | null {
  const e = rec(json);
  if (typeof e.event !== "string" || !e.event || !e.payload || typeof e.payload !== "object") return null;
  return { event: e.event.slice(0, 64), session: s(e.session, 64) || "default", payload: rec(e.payload), me: rec(e.me), engine: s(e.engine, 16).toUpperCase() };
}
/** Kept for callers of the 2.x API: a `message` / `message.any` event to a row. */
export function parseWebhook(json: unknown): Parsed | null {
  const e = parseEnvelope(json);
  return e && MESSAGE_EVENTS.includes(e.event) ? parseMessage(e.payload, e.session, e.me) : null;
}

/** The id WAHA answers a send with, whatever the engine: "true_<chat>_<stanza>" when it can be built, else the bare id; null when there is none. */
export function sentIdOf(res: unknown, chatId: string): string | null {
  const r = rec(res), d = rec(r._data), key = rec(r.key ?? d.key), info = rec(r.Info ?? d.Info);
  const direct = [r.id, d.id].map((v) => (typeof v === "string" ? v : s(rec(v)._serialized, 200))).find(Boolean);
  if (direct) return /^(true|false)_/.test(direct) ? direct : `true_${chatId}_${direct}`;
  const bare = s(key.id, 200) || s(info.ID, 200) || s(r.ID, 200) || s(r.messageId, 200) || s(rec(r.message).id, 200);
  return bare ? `true_${chatId}_${bare}` : null;
}
/** A lid <-> phone pair a send response reveals: we addressed one id and WhatsApp answered with the other. */
export function linkFromSend(res: unknown, target: string): IdLink | null {
  const r = rec(res), d = rec(r._data), key = rec(r.key ?? d.key), info = rec(r.Info ?? d.Info);
  for (const v of [r.to, key.remoteJid, key.remoteJidAlt, info.Chat, info.RecipientAlt, rec(d.to)._serialized, rec(d.id).remote]) {
    const id = normId(v);
    if (!id || id === target) continue;
    const lid = lidOf(id) ?? lidOf(target), pn = pnOf(id) ?? pnOf(target);
    if (lid && pn) return { lid, pn };
  }
  return null;
}
