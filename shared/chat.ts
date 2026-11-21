// Pure display helpers for the inbox: no React, no DOM. `now` and `locale` are parameters so tests are deterministic.
import { formatPhoneDisplay } from "./phone";

export interface Chat {
  chatId: string; kind?: "user" | "group" | "other"; name?: string | null; phone?: string | null;
  lastBody: string; lastFromMe?: boolean; lastHasMedia?: boolean; lastAt: string; total: number; unread?: number;
  /** The user themself: their own WhatsApp account or their saved own number ("Message yourself"). */
  isSelf?: boolean;
  lastType?: MessageType; lastAck?: number; lastDeleted?: boolean; lastSenderName?: string;
  archived?: boolean; pinned?: boolean; muted?: boolean; blocked?: boolean; markedUnread?: boolean;
  /** Version stamp of the stored profile picture (fetch it with GET /avatar?chatId=), or null when there is none. */
  avatar?: number | null;
  labels?: string[];
}
export type MessageType = "chat" | "image" | "video" | "audio" | "ptt" | "document" | "sticker" | "location" | "vcard" | "poll" | "call" | "system" | "deleted" | "unknown";
/** A file of a message. The bytes come from GET /media?id=<message id> -> { mime, filename, size, data (base64) }. */
export interface Media { mime: string; filename: string; size: number | null; duration: number | null; width: number | null; height: number | null; gif?: boolean; available: boolean }
export interface Reaction { emoji: string; count: number; mine: boolean; senders: string[] }
export interface Poll { name: string; multiple: boolean; voters: number; options: { name: string; votes: number; voted: boolean }[] }
/** The message a reply quotes. `id` is the quoted message's id when it is loaded in this conversation, else "". */
export interface Quote { id: string; body: string; hasMedia?: boolean; fromMe: boolean; sender: string; senderName?: string }
export interface Message {
  pending?: boolean; failed?: boolean; id: string; fromMe: boolean; sender: string; senderName?: string; body: string; hasMedia: boolean; sentAt: string; replyTo?: Quote | null;
  type?: MessageType; media?: Media | null;
  /** 0 pending, 1 sent, 2 delivered, 3 read, 4 played, -1 failed. */
  ack?: number; edited?: boolean; deleted?: boolean; starred?: boolean; pinned?: boolean; forwarded?: boolean;
  location?: { lat: number; lng: number; name: string; address: string; live?: boolean };
  vcards?: { name: string; phones: string[]; formatted: string[] }[];
  poll?: Poll; preview?: { title: string; description: string; url: string }; mentions?: string[]; call?: { video: boolean; status: string };
  reactions?: Reaction[];
  /** Only on a message still being sent from this screen: a local object URL to show before the upload finishes. */
  localUrl?: string;
}

type ChatLike = Pick<Chat, "chatId"> & Partial<Chat>;

export function chatKind(chatId: string): "user" | "group" | "other" {
  if (/@g\.us$/.test(chatId)) return "group";
  return /@(c\.us|s\.whatsapp\.net|lid)$/.test(chatId) ? "user" : "other";
}
const kindOf = (c: ChatLike) => c.kind ?? chatKind(c.chatId);

/** Digits of a number-addressed chat; an "@lid" id is never a phone number. */
export function chatPhoneDigits(c: ChatLike): string | null {
  if (kindOf(c) === "group") return null;
  if (c.phone && /^\d{6,15}$/.test(c.phone)) return c.phone;
  const m = /^(\d{8,15})@(c\.us|s\.whatsapp\.net)$/.exec(c.chatId);
  return m ? m[1] : null;
}

const cleanName = (c: ChatLike) => { const n = (c.name ?? "").trim(); return n && !n.includes("@") ? n : ""; };

/** Never returns a raw id or anything containing "@". */
export function displayName(c: ChatLike): string {
  const name = cleanName(c);
  if (name) return name;
  const digits = chatPhoneDigits(c);
  if (digits) return formatPhoneDisplay(digits);
  return kindOf(c) === "group" ? "Group chat" : "Unknown contact";
}
/** The chat-list and header title: your own chat reads "Name (You)" like WhatsApp does. */
export function chatTitle(c: ChatLike): string {
  if (!c.isSelf) return displayName(c);
  return cleanName(c) ? `${cleanName(c)} (You)` : "You";
}

/** Second header line: the number for a named contact, "Group" for groups, nothing when it would repeat the name. */
export function subtitle(c: ChatLike): string {
  if (c.isSelf) return "Message yourself";
  if (kindOf(c) === "group") return cleanName(c) ? "Group" : "";
  const digits = chatPhoneDigits(c);
  return cleanName(c) && digits ? formatPhoneDisplay(digits) : "";
}

/** 1-2 letters for a named contact, last 2 digits for a bare number, "?" otherwise; "" for groups (the UI draws an icon). */
export function initials(c: ChatLike): string {
  if (kindOf(c) === "group") return "";
  const words = cleanName(c).match(/[\p{L}\p{N}]+/gu) ?? [];
  if (words.length) return (words.length === 1 ? [...words[0]].slice(0, 2).join("") : [...words[0]][0] + [...words[words.length - 1]][0]).toUpperCase();
  const digits = chatPhoneDigits(c);
  return digits ? digits.slice(-2) : "?";
}

/** Stable hue 0-359 from an id. */
export function hueOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}

/** Preview parts for the chat row: the UI renders the "You: " prefix and the file icon. */
const TYPE_LABEL: Partial<Record<MessageType, string>> = { image: "Photo", video: "Video", audio: "Audio", ptt: "Voice message", document: "Document", sticker: "Sticker", location: "Location", vcard: "Contact", poll: "Poll", call: "Call" };
/** Preview parts for the chat row: the UI renders the "You: " prefix and the icon of `kind`. */
export function previewText(c: ChatLike): { prefix: string; text: string; media: boolean; kind: MessageType } {
  const text = (c.lastBody ?? "").replace(/\s+/g, " ").trim();
  const prefix = c.lastFromMe ? "You: " : kindOf(c) === "group" && c.lastSenderName ? `${c.lastSenderName.split(" ")[0]}: ` : "";
  const kind = c.lastType ?? "chat";
  if (c.lastDeleted) return { prefix: "", text: c.lastFromMe ? "You deleted this message" : "This message was deleted", media: false, kind: "deleted" };
  const label = TYPE_LABEL[kind];
  if (label) return { prefix, text: text || label, media: true, kind };
  if (text) return { prefix, text, media: false, kind };
  return c.lastHasMedia ? { prefix, text: "Photo or file", media: true, kind: "document" } : { prefix, text: "No text", media: false, kind };
}

/** Who wrote a quoted message: "You", their name, their number, or the chat's own name in a 1:1 chat. Never a raw id. */
export function quoteAuthor(q: Pick<Quote, "fromMe" | "sender" | "senderName">, chat: ChatLike): string {
  if (q.fromMe) return "You";
  const name = (q.senderName ?? "").trim();
  if (name && !name.includes("@")) return name;
  if (kindOf(chat) !== "group") return displayName(chat);
  const digits = chatPhoneDigits({ chatId: q.sender });
  return digits ? formatPhoneDisplay(digits) : "Unknown contact";
}

/** One line for the quoted block. */
export function quoteText(q: Pick<Quote, "body" | "hasMedia">): string {
  const text = (q.body ?? "").replace(/\s+/g, " ").trim();
  return text || (q.hasMedia ? "Photo or file" : "Message");
}

/** The quote a reply to `m` carries. */
export const quoteOf = (m: Message): Quote => ({ id: m.id, body: m.body, hasMedia: m.hasMedia, fromMe: m.fromMe, sender: m.fromMe ? "" : m.sender, senderName: m.senderName ?? "" });

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const daysAgo = (d: Date, now: Date) => Math.round((dayStart(now) - dayStart(d)) / 86_400_000);

export const timeOf = (iso: string, locale?: string) => new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
export const fullDate = (iso: string, locale?: string) => new Date(iso).toLocaleString(locale, { dateStyle: "full", timeStyle: "short" });

function shortDate(d: Date, now: Date, locale?: string) {
  return d.toLocaleDateString(locale, d.getFullYear() === now.getFullYear() ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
}

/** "now", "5 min", "HH:mm" today, "Yesterday", weekday within 6 days, else a short date. */
export function relativeTime(iso: string, now: Date, locale?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min`;
  const n = daysAgo(d, now);
  if (n <= 0) return timeOf(iso, locale);
  if (n === 1) return "Yesterday";
  return n <= 6 ? d.toLocaleDateString(locale, { weekday: "short" }) : shortDate(d, now, locale);
}

/** Day separator text: "Today", "Yesterday", weekday within 6 days, else "3 Nov" (+year when not this year). */
export function dayLabel(iso: string, now: Date, locale?: string): string {
  const d = new Date(iso);
  const n = daysAgo(d, now);
  if (n <= 0) return "Today";
  if (n === 1) return "Yesterday";
  return n <= 6 ? d.toLocaleDateString(locale, { weekday: "long" }) : shortDate(d, now, locale);
}

export type Row =
  | { type: "day"; key: string; label: string }
  | { type: "msg"; key: string; message: Message; first: boolean; last: boolean };

const GROUP_MS = 5 * 60_000;
const sameGroup = (a: Message, b: Message) =>
  a.fromMe === b.fromMe && (a.fromMe || a.sender === b.sender) && new Date(a.sentAt).toDateString() === new Date(b.sentAt).toDateString()
  && Math.abs(new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()) <= GROUP_MS;

/** Adds day separators and first/last flags for runs of messages from the same side within 5 minutes. */
export function groupMessages(messages: Message[], now: Date, locale?: string): Row[] {
  const rows: Row[] = [];
  messages.forEach((m, i) => {
    const prev = messages[i - 1], next = messages[i + 1];
    const newDay = !prev || new Date(prev.sentAt).toDateString() !== new Date(m.sentAt).toDateString();
    if (newDay) rows.push({ type: "day", key: "day-" + m.id, label: dayLabel(m.sentAt, now, locale) });
    rows.push({ type: "msg", key: m.id, message: m, first: newDay || !sameGroup(prev, m), last: !next || !sameGroup(m, next) });
  });
  return rows;
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Case- and accent-insensitive match on name, formatted phone, digits and last message. */
export function matchesQuery(c: ChatLike, query: string): boolean {
  const q = fold(query.trim());
  if (!q) return true;
  const digits = chatPhoneDigits(c) ?? "";
  const hay = fold([displayName(c), digits ? formatPhoneDisplay(digits) : "", c.lastBody ?? ""].join("\n"));
  if (hay.includes(q)) return true;
  const qd = q.replace(/\D/g, "");
  return /^[\d\s+()-]+$/.test(q) && qd.length > 0 && digits.includes(qd);
}
