import { phoneDigits } from "../shared/phone.js";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { PluginFetchResponse } from "../shared/sdk";

export const CHAT_ID = /^[0-9A-Za-z._@-]{3,100}$/;
/** Own number as typed by the user: optional spaces, dashes, dots and parentheses, then `+` and 8-15 digits (E.164, no leading zero). Returns the WAHA chat id, or null. */
/** Any common way of writing an international number ("+55 (11) 99999-9999", "0055 11...", "5511999999999") -> "5511999999999@c.us". */
export function phoneToChatId(raw: unknown): string | null {
  const digits = phoneDigits(raw);
  return digits ? `${digits}@c.us` : null;
}

export const TEXT_MAX = 4096;
export const WEBHOOK_EVENTS = ["message", "message.any"];

/** Errors name the HTTP status only: never URLs, the API key or the upstream body. */
export class WahaError extends Error {
  constructor(readonly status: number) { super(`WAHA request failed (HTTP ${status})`); this.name = "WahaError"; }
}

/** `https://host[:port][/prefix]` without a trailing slash; http is allowed because the instance is self-hosted. Null otherwise. */
export function normalizeBase(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.username || u.password) return null;
    return (u.origin + u.pathname).replace(/\/+$/, "");
  } catch { return null; }
}

export const sessionName = (v: unknown): string => (typeof v === "string" && /^[A-Za-z0-9._-]{1,64}$/.test(v.trim()) ? v.trim() : "default");

/**
 * WAHA signs the raw request body with HMAC-SHA512 and sends the hex digest in `X-Webhook-Hmac`
 * (`X-Webhook-Hmac-Algorithm: sha512`). Constant-time comparison; any other algorithm is refused.
 */
export function verifyHmac(rawBody: Uint8Array, headers: Record<string, string>, key: string): boolean {
  const algorithm = (headers["x-webhook-hmac-algorithm"] ?? "sha512").toLowerCase();
  const given = (headers["x-webhook-hmac"] ?? "").trim().toLowerCase();
  if (algorithm !== "sha512" || !given) return false;
  const expected = createHmac("sha512", key).update(rawBody).digest("hex");
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The message a reply quotes. `sender` is "me", a WhatsApp id, or "" when unknown; `id` is the bare stanza id. */
export interface ReplyRef { id: string; body: string; sender: string; hasMedia: boolean }
/** The same contact under its two addresses: `lid` is "<digits>@lid", `pn` is "<digits>@c.us". */
export interface IdLink { lid: string; pn: string }
export interface StoredMessage { /** WAHA `payload.source`: "app" | "api" | "" (unknown). */ source?: string; session: string; chatId: string; msgId: string; fromMe: boolean; sender: string; senderName: string; senderPhone: string; body: string; hasMedia: boolean; sentAt: Date; reply: ReplyRef | null; links: IdLink[] }

const s = (v: unknown, max: number) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "").slice(0, max);

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const ALT_JID = /^(\d{8,15})(:\d+)?@(c\.us|s\.whatsapp\.net)$/;

function displayName(p: Record<string, unknown>): string {
  const d = rec(p._data);
  for (const v of [d.notifyName, d.pushName, rec(d.Info).PushName, p.notifyName, p.pushName]) {
    if (typeof v !== "string") continue;
    const t = v.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").trim().slice(0, 80);
    if (t) return t;
  }
  return "";
}

function senderPhoneOf(chatId: string, p: Record<string, unknown>): string {
  const own = /^(\d{8,15})@(c\.us|s\.whatsapp\.net)$/.exec(chatId);
  if (own) return own[1];
  if (!chatId.endsWith("@lid")) return "";
  const d = rec(p._data);
  for (const v of [rec(d.key).remoteJidAlt, rec(d.key).senderPn, rec(d.Info).SenderAlt, d.senderPn]) {
    const m = typeof v === "string" ? ALT_JID.exec(v) : null;
    if (m) return m[1];
  }
  return "";
}

/** "5511...:12@s.whatsapp.net" -> "5511...@c.us"; null when it is not a phone-number id. */
export function pnOf(v: unknown): string | null {
  const m = typeof v === "string" ? ALT_JID.exec(v.trim()) : null;
  return m ? `${m[1]}@c.us` : null;
}
/** "1234:5@lid" -> "1234@lid"; null when it is not a lid. */
export function lidOf(v: unknown): string | null {
  const m = typeof v === "string" ? /^(\d{5,20})(:\d+)?@lid$/.exec(v.trim()) : null;
  return m ? `${m[1]}@lid` : null;
}
/** The bare stanza id of a WAHA message id: "false_5511@c.us_3EB0AA" and "false_1203@g.us_3EB0AA_5511@c.us" -> "3EB0AA". */
export function stanzaOf(id: unknown): string {
  const t = typeof id === "string" ? id : "";
  const m = /^(?:true|false)_[^_]+_([^_]+)/.exec(t);
  return (m ? m[1] : t).slice(0, 200);
}

/**
 * Every lid <-> phone pair an event carries. Engines put the alternate address in different places
 * (NOWEB: key.remoteJidAlt / participantAlt / senderPn; GOWS: Info.SenderAlt / RecipientAlt; WEBJS: _data.from / author objects).
 * A fromMe event's "sender" is the account itself, so only the recipient side is read there.
 */
function linksOf(p: Record<string, unknown>, chatId: string, fromMe: boolean): IdLink[] {
  const d = rec(p._data), key = rec(d.key), info = rec(d.Info);
  const out = new Map<string, string>();
  const pair = (a: unknown, b: unknown) => {
    const lid = lidOf(a) ?? lidOf(b), pn = pnOf(a) ?? pnOf(b);
    if (lid && pn) out.set(lid, pn);
  };
  const group = chatId.endsWith("@g.us");
  if (group) {
    if (!fromMe) {
      const who = participantOf(p);
      for (const alt of [key.participantAlt, key.participantPn, key.participantLid, p.participantAlt, p.participantPn, info.SenderAlt, d.senderPn, d.senderLid, key.senderPn, key.senderLid]) pair(who, alt);
      pair(info.Sender, info.SenderAlt);
    }
  } else {
    for (const alt of [key.remoteJidAlt, p.chatIdAlt, fromMe ? info.RecipientAlt : info.SenderAlt, fromMe ? p.toAlt : p.fromAlt, ...(fromMe ? [] : [key.senderPn, key.senderLid, d.senderPn, d.senderLid, p.senderAlt])]) pair(chatId, alt);
    pair(key.remoteJid, key.remoteJidAlt);
  }
  return [...out].map(([lid, pn]) => ({ lid, pn }));
}

const text = (v: unknown, max: number) => s(v, max).replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, "");
/** Text of a raw quoted message object (Baileys / whatsmeow shape). */
function quotedText(q: Record<string, unknown>): { body: string; media: boolean } {
  const pick = (...names: string[]) => { for (const n of names) for (const k of Object.keys(q)) if (k.toLowerCase() === n.toLowerCase()) return q[k]; return undefined; };
  const direct = pick("conversation");
  if (typeof direct === "string" && direct) return { body: direct, media: false };
  const ext = rec(pick("extendedTextMessage"));
  if (typeof ext.text === "string" && ext.text) return { body: ext.text, media: false };
  for (const k of ["imageMessage", "videoMessage", "documentMessage", "audioMessage", "stickerMessage", "documentWithCaptionMessage"]) {
    const m = pick(k);
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
  const whoN = pnOf(who) ?? lidOf(who) ?? (CHAT_ID.test(who) ? who : "");
  // In a 1:1 chat the quoted message is theirs (either of their addresses) or mine; in a group "mine" needs the account id of the event.
  let sender = whoN;
  if (whoN && me && whoN === me) sender = "me";
  else if (whoN && !chatId.endsWith("@g.us")) {
    const theirs = new Set([pnOf(chatId) ?? lidOf(chatId) ?? chatId, ...links.flatMap((l) => [l.lid, l.pn])]);
    sender = theirs.has(whoN) ? chatId : "me";
  }
  return { id, body: text(body, 400), sender, hasMedia: media };
}

function participantOf(p: Record<string, unknown>): string {
  for (const v of [p.participant, rec(rec(p._data).key).participant, p.author]) if (typeof v === "string" && CHAT_ID.test(v)) return v;
  return "";
}

/** A WAHA `message` / `message.any` event to a row, or null when it is another event or malformed. The chat is the other side of the conversation. */
export function parseWebhook(json: unknown): StoredMessage | null {
  const e = json as { event?: unknown; session?: unknown; payload?: Record<string, unknown> } | null;
  if (!e || typeof e !== "object" || !WEBHOOK_EVENTS.includes(String(e.event))) return null;
  const p = e.payload;
  if (!p || typeof p !== "object") return null;
  const fromMe = p.fromMe === true;
  const from = s(p.from, 100), to = s(p.to, 100);
  const chatId = fromMe ? to : from;
  const msgId = s(p.id, 200);
  if (!CHAT_ID.test(chatId) || !msgId) return null;
  const seconds = Number(p.timestamp);
  const meId = rec((e as { me?: unknown }).me).id;
  const links = linksOf(p, chatId, fromMe);
  const reply = replyOf(p, pnOf(meId) ?? lidOf(meId), chatId, links);
  return {
    reply, links,
    source: s(p.source, 16).toLowerCase(), session: s(e.session, 64) || "default", chatId, msgId, fromMe, sender: fromMe ? "me" : (chatId.endsWith("@g.us") && participantOf(p)) || from,
    senderName: fromMe ? "" : displayName(p), senderPhone: fromMe ? "" : senderPhoneOf(chatId, p),
    body: s(p.body, 8000), hasMedia: p.hasMedia === true,
    sentAt: new Date(Number.isFinite(seconds) && seconds > 0 ? seconds * (seconds < 1e12 ? 1000 : 1) : Date.now()),
  };
}

export type FetchUserUrl = (userId: string, url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<PluginFetchResponse>;

/** `GET {base}/api/{session}/lids` (all known pairs) or `/lids/{lid}` (one). Engines without the store answer with an error: that is "nothing known". */
export async function fetchLids(fetchUserUrl: FetchUserUrl, userId: string, base: string, apiKey: string, session: string, lid?: string): Promise<IdLink[]> {
  const url = `${base}/api/${encodeURIComponent(session)}/lids` + (lid ? `/${encodeURIComponent(lid)}` : "?limit=1000&offset=0");
  let res: PluginFetchResponse;
  try { res = await fetchUserUrl(userId, url, { method: "GET", headers: { "X-Api-Key": apiKey, Accept: "application/json" } }); } catch { return []; }
  if (!res.ok) return [];
  try {
    const data = res.json() as unknown;
    const out: IdLink[] = [];
    for (const row of Array.isArray(data) ? data : [data]) { const l = lidOf(rec(row).lid), pn = pnOf(rec(row).pn); if (l && pn) out.push({ lid: l, pn }); }
    return out;
  } catch { return []; }
}

/** `POST {base}/api/sendText` (`reply_to` quotes a message). Returns WAHA's message id when it gives one. */
export async function sendText(fetchUserUrl: FetchUserUrl, userId: string, base: string, apiKey: string, session: string, chatId: string, text: string, replyTo?: string): Promise<string | null> {
  let res: PluginFetchResponse;
  try {
    res = await fetchUserUrl(userId, `${base}/api/sendText`, { method: "POST", headers: { "X-Api-Key": apiKey, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(replyTo ? { session, chatId, text, reply_to: replyTo } : { session, chatId, text }) });
  } catch { throw new WahaError(0); }
  if (!res.ok) throw new WahaError(res.status);
  try {
    const data = res.json() as { id?: unknown } | null;
    const id = data?.id;
    if (typeof id === "string") return id;
    if (id && typeof id === "object") { const o = id as Record<string, unknown>; return typeof o._serialized === "string" ? o._serialized : typeof o.id === "string" ? o.id : null; }
  } catch { /* the message was sent; the id is optional */ }
  return null;
}
