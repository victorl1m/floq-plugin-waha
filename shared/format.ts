// Pure helpers for the conversation log: WhatsApp text formatting as a token tree (never HTML), links, emoji, coordinates, ticks, edit window.
// No React, no DOM: unit-tested in tests/format.test.mjs.
import type { Message } from "./chat";

export type Inline =
  | { t: "text"; v: string }
  | { t: "b" | "i" | "s"; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "link"; href: string; v: string }
  | { t: "mention"; id: string; v: string };
export type Block =
  | { t: "p"; c: Inline[] }
  | { t: "pre"; v: string }
  | { t: "quote"; c: Inline[][] }
  | { t: "list"; ordered: boolean; start: number; items: Inline[][] };

export interface FormatOptions {
  /** Ids (or digits) of the people mentioned: "@<digits>" in the text becomes a mention token for these. */
  mentions?: string[];
}

const MARKS: Record<string, "b" | "i" | "s"> = { "*": "b", _: "i", "~": "s" };
const WORD = /[\p{L}\p{N}]/u;
const SPACE = /\s/;
const URL_RE = /https?:\/\/[^\s<>]+/giu;

/** Digits of a mention id ("5511987654321@c.us" -> "5511987654321"). */
export const mentionDigits = (id: string) => /^\d+/.exec(id)?.[0] ?? "";

/** Trailing punctuation that belongs to the sentence, not the link; a closing bracket stays only when the URL holds its opener. */
function trimUrl(u: string): string {
  for (;;) {
    const last = u[u.length - 1];
    if (!last) return u;
    if (/[.,;:!?'"*_~]/.test(last)) { u = u.slice(0, -1); continue; }
    const open = ({ ")": "(", "]": "[", "}": "{" } as Record<string, string>)[last];
    if (open && (u.split(last).length - 1) > (u.split(open).length - 1)) { u = u.slice(0, -1); continue; }
    return u;
  }
}
/** Only http and https are ever links. */
export function safeHref(u: string): string | null {
  try { const x = new URL(u); return x.protocol === "http:" || x.protocol === "https:" ? x.href : null; } catch { return null; }
}
function urlRanges(s: string): [number, number][] {
  const out: [number, number][] = [];
  for (const m of s.matchAll(URL_RE)) {
    const u = trimUrl(m[0]);
    if (u.length > 8 && safeHref(u)) out.push([m.index!, m.index! + u.length]);
  }
  return out;
}

function splitMentions(v: string, ids: Map<string, string>): Inline[] {
  if (!ids.size || !v.includes("@")) return v ? [{ t: "text", v }] : [];
  const out: Inline[] = [];
  let last = 0;
  for (const m of v.matchAll(/@(\d{5,20})/g)) {
    const id = ids.get(m[1]);
    if (!id) continue;
    if (m.index! > last) out.push({ t: "text", v: v.slice(last, m.index) });
    out.push({ t: "mention", id, v: m[0] });
    last = m.index! + m[0].length;
  }
  if (last < v.length) out.push({ t: "text", v: v.slice(last) });
  return out;
}

/** One line of text: formatting never spans a link or a code span, and a marker needs a non-space next to it. */
export function parseInline(s: string, ids: Map<string, string> = new Map(), depth = 0): Inline[] {
  const out: Inline[] = [];
  let buf = "";
  const flush = () => { if (buf) { out.push(...splitMentions(buf, ids)); buf = ""; } };
  const urls = urlRanges(s);
  const urlAt = (i: number) => urls.find(([a, b]) => i >= a && i < b);
  // Positions covered by a link or a complete `code` span are skipped when looking for a closing marker.
  const codes: [number, number][] = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== "`" || urlAt(i)) continue;
    const j = s.indexOf("`", i + 1);
    if (j > i + 1 && !urlAt(j)) { codes.push([i, j + 1]); i = j; }
  }
  const codeAt = (i: number) => codes.find(([a, b]) => i >= a && i < b);
  for (let i = 0; i < s.length;) {
    const u = urlAt(i);
    if (u && u[0] === i) { flush(); const v = s.slice(u[0], u[1]); out.push({ t: "link", href: safeHref(v)!, v }); i = u[1]; continue; }
    const c = codeAt(i);
    if (c && c[0] === i) { flush(); out.push({ t: "code", v: s.slice(c[0] + 1, c[1] - 1) }); i = c[1]; continue; }
    const ch = s[i], kind = MARKS[ch];
    if (kind && depth < 6 && !urlAt(i) && !codeAt(i)) {
      const prev = s[i - 1], next = s[i + 1];
      if ((prev === undefined || !WORD.test(prev)) && next !== undefined && !SPACE.test(next) && next !== ch) {
        let end = -1;
        for (let j = i + 2; j < s.length; j++) {
          if (s[j] !== ch || urlAt(j) || codeAt(j)) continue;
          const after = s[j + 1];
          if (!SPACE.test(s[j - 1]) && s[j - 1] !== ch && (after === undefined || !WORD.test(after))) { end = j; break; }
        }
        if (end > 0) { flush(); out.push({ t: kind, c: parseInline(s.slice(i + 1, end), ids, depth + 1) }); i = end + 1; continue; }
      }
    }
    buf += ch; i++;
  }
  flush();
  return out;
}

/** WhatsApp formatting: *bold* _italic_ ~strike~ `inline` and fenced code, "> quote" lines, "- " and "1. " lists, links. */
export function parseFormat(text: string, opts: FormatOptions = {}): Block[] {
  const ids = new Map<string, string>();
  for (const id of opts.mentions ?? []) { const d = mentionDigits(id); if (d) ids.set(d, id); }
  const src = (text ?? "").replace(/\r\n?/g, "\n");
  // ```x``` on one line is inline monospace in WhatsApp (mid-sentence), not a block: treat it like `x`. Fences that span lines stay blocks.
  const flat = src.replace(/```([^`\n]+?)```/g, "`$1`");
  const blocks: Block[] = [];
  // Fenced blocks first; an unclosed fence stays literal text.
  const segments: { code: boolean; v: string }[] = [];
  let at = 0;
  for (const m of flat.matchAll(/```([\s\S]*?)```/g)) {
    if (m.index! > at) segments.push({ code: false, v: flat.slice(at, m.index) });
    segments.push({ code: true, v: m[1].replace(/^\n/, "").replace(/\n$/, "") });
    at = m.index! + m[0].length;
  }
  if (at < flat.length) segments.push({ code: false, v: flat.slice(at) });
  for (const [si, seg] of segments.entries()) {
    if (seg.code) { blocks.push({ t: "pre", v: seg.v }); continue; }
    // The line break that touches a fence belongs to the fence.
    const text = seg.v.replace(si > 0 ? /^\n/ : /^$/, "").replace(si < segments.length - 1 ? /\n$/ : /^$/, "");
    if (!text) continue;
    const lines = text.split("\n");
    let para: Inline[] = [];
    const endPara = () => { if (para.length) { blocks.push({ t: "p", c: para }); para = []; } };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const quote = /^>\s?(.*)$/.exec(line);
      const li = /^(?:([-*•])|(\d{1,3})[.)])\s+(\S.*)$/.exec(line);
      if (quote) {
        endPara();
        const items: Inline[][] = [parseInline(quote[1], ids)];
        while (i + 1 < lines.length && /^>\s?/.test(lines[i + 1])) items.push(parseInline(lines[++i].replace(/^>\s?/, ""), ids));
        blocks.push({ t: "quote", c: items });
      } else if (li) {
        endPara();
        const ordered = li[2] !== undefined, items: Inline[][] = [parseInline(li[3], ids)];
        const next = () => /^(?:([-*•])|(\d{1,3})[.)])\s+(\S.*)$/.exec(lines[i + 1] ?? "");
        for (let n = next(); n && (n[2] !== undefined) === ordered; n = next()) { items.push(parseInline(n[3], ids)); i++; }
        blocks.push({ t: "list", ordered, start: ordered ? Number(li[2]) : 1, items });
      } else {
        if (para.length) para.push({ t: "text", v: "\n" });
        para.push(...parseInline(line, ids));
        if (!line && !para.length) continue;
      }
    }
    endPara();
  }
  return blocks;
}

/** Plain text of a token tree (copy, previews, tests). */
export function plainOf(nodes: Inline[]): string {
  return nodes.map((n) => ("c" in n ? plainOf(n.c) : n.v)).join("");
}

const EMOJI = /(?:\p{Regional_Indicator}{2}|[#*0-9]️?⃣|\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?(?:‍\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?)*)/gu;
/** 1-3 for a message made only of that many emoji (shown large), else 0. */
export function emojiOnly(text: string): number {
  const t = (text ?? "").trim();
  if (!t || t.length > 60) return 0;
  const found = t.match(EMOJI) ?? [];
  return found.length >= 1 && found.length <= 3 && t.replace(EMOJI, "").replace(/\s+/g, "") === "" ? found.length : 0;
}

/** Splits text around a search term (case and accent insensitive) for highlighting. */
export function splitHighlight(text: string, term: string): { v: string; hit: boolean }[] {
  const q = term.trim();
  if (!q) return [{ v: text, hit: false }];
  const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  // Folding can change lengths for exotic characters: only highlight when it did not.
  const hay = fold(text), needle = fold(q);
  if (hay.length !== text.length || !needle) return [{ v: text, hit: false }];
  const out: { v: string; hit: boolean }[] = [];
  let at = 0;
  for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, at)) {
    if (i > at) out.push({ v: text.slice(at, i), hit: false });
    out.push({ v: text.slice(i, i + needle.length), hit: true });
    at = i + needle.length;
  }
  if (at < text.length) out.push({ v: text.slice(at), hit: false });
  return out;
}

export type AckState = "pending" | "sent" | "delivered" | "read" | "failed";
/** Tick state of an own message: clock while pending/0, one check, two checks, two blue checks (read and played), failed. */
export function ackState(m: Pick<Message, "ack" | "pending" | "failed">): AckState {
  if (m.failed || (m.ack ?? 0) < 0) return "failed";
  if (m.pending || m.ack === 0) return "pending";
  if (m.ack === undefined || m.ack === 1) return "sent";
  return m.ack === 2 ? "delivered" : "read";
}
export const ACK_LABEL: Record<AckState, string> = { pending: "Sending", sent: "Sent", delivered: "Delivered", read: "Read", failed: "Not sent" };

export const EDIT_WINDOW_MS = 15 * 60_000;
/** Own text messages can be edited for 15 minutes. */
export function canEdit(m: Pick<Message, "fromMe" | "type" | "sentAt" | "pending" | "deleted" | "hasMedia" | "failed">, now: number): boolean {
  if (!m.fromMe || m.pending || m.failed || m.deleted) return false;
  if ((m.type ?? "chat") !== "chat") return false;
  const t = new Date(m.sentAt).getTime();
  // `now` ticks once a minute, so a message just sent can be a little ahead of it.
  return Number.isFinite(t) && now - t > -5 * 60_000 && now - t < EDIT_WINDOW_MS;
}

export const isMediaType = (m: Pick<Message, "type" | "media">) => ["image", "video", "audio", "ptt", "document", "sticker"].includes(m.type ?? "") || Boolean(m.media && !m.type);

/** Google Maps link for a point. */
export const mapsUrl = (lat: number, lng: number) => "https://www.google.com/maps?q=" + lat.toFixed(6) + "," + lng.toFixed(6);

const inRange = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
/** "-23.5, -46.6", a Google/Apple/OSM maps link or a geo: URI -> coordinates, else null. */
export function parseCoords(input: string): { lat: number; lng: number } | null {
  const s = (input ?? "").trim();
  if (!s) return null;
  const num = "(-?\\d{1,3}(?:\\.\\d+)?)";
  const tries = [
    new RegExp("^" + num + "\\s*[,;\\s]\\s*" + num + "$"),
    new RegExp("@" + num + "," + num),
    new RegExp("[?&](?:q|ll|query|center|destination|daddr)=" + num + "(?:,|%2C)" + num, "i"),
    new RegExp("!3d" + num + "!4d" + num),
    new RegExp("^geo:" + num + "," + num, "i"),
    new RegExp("[?&]mlat=" + num + "&mlon=" + num, "i"),
  ];
  for (const re of tries) {
    const m = re.exec(s);
    if (m) { const lat = Number(m[1]), lng = Number(m[2]); if (inRange(lat, lng)) return { lat, lng }; }
  }
  return null;
}

/** Digits of a phone typed by hand ("+55 (11) 98765-4321" -> "5511987654321"), or "" when it is not 7-15 digits. */
export function cleanPhone(s: string): string {
  const d = (s ?? "").replace(/\D/g, "");
  return d.length >= 7 && d.length <= 15 ? d : "";
}

/** "pdf" -> a short label and a colour family for the document icon. */
export function docKind(filename: string, mime = ""): { ext: string; kind: "pdf" | "word" | "sheet" | "slide" | "zip" | "text" | "audio" | "video" | "image" | "file" } {
  const ext = (/\.([A-Za-z0-9]{1,6})$/.exec(filename ?? "")?.[1] ?? "").toLowerCase();
  const e = ext || (mime.split("/")[1] ?? "").slice(0, 4);
  if (ext === "pdf" || mime === "application/pdf") return { ext: e, kind: "pdf" };
  if (/^(docx?|odt|rtf|pages)$/.test(ext)) return { ext: e, kind: "word" };
  if (/^(xlsx?|ods|csv|numbers)$/.test(ext)) return { ext: e, kind: "sheet" };
  if (/^(pptx?|odp|key)$/.test(ext)) return { ext: e, kind: "slide" };
  if (/^(zip|rar|7z|tar|gz|tgz|bz2)$/.test(ext)) return { ext: e, kind: "zip" };
  if (/^(txt|md|json|xml|log|html?|js|ts)$/.test(ext) || mime.startsWith("text/")) return { ext: e, kind: "text" };
  if (mime.startsWith("audio/")) return { ext: e, kind: "audio" };
  if (mime.startsWith("video/")) return { ext: e, kind: "video" };
  if (mime.startsWith("image/")) return { ext: e, kind: "image" };
  return { ext: e, kind: "file" };
}

/** Voice-note bars: deterministic pseudo-random heights (0.15-1) from a seed until real peaks are decoded. */
export function fakePeaks(seed: string, n = 40): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0;
  const out: number[] = [];
  for (let i = 0; i < n; i++) { h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0; out.push(0.15 + ((h >>> 8) % 1000) / 1000 * 0.85); }
  return out;
}
/** Reduces samples to n bars scaled to 0.12-1. */
export function peaksOf(samples: ArrayLike<number>, n = 40): number[] {
  const out: number[] = [], step = Math.max(1, Math.floor(samples.length / n));
  for (let i = 0; i < n; i++) {
    let max = 0;
    for (let j = i * step; j < Math.min(samples.length, (i + 1) * step); j++) max = Math.max(max, Math.abs(samples[j]));
    out.push(max);
  }
  const top = Math.max(...out, 1e-6);
  return out.map((v) => Math.max(0.12, v / top));
}

/** Applies your own reaction (emoji, or "" to remove) to a reactions list without mutating it. */
export function withMyReaction(reactions: Message["reactions"], emoji: string): NonNullable<Message["reactions"]> {
  const list = (reactions ?? []).map((r) => ({ ...r }));
  const mine = list.find((r) => r.mine);
  if (mine) { mine.count -= 1; mine.mine = false; }
  if (emoji) {
    const hit = list.find((r) => r.emoji === emoji);
    if (hit) { hit.count += 1; hit.mine = true; } else list.push({ emoji, count: 1, mine: true, senders: [] });
  }
  return list.filter((r) => r.count > 0);
}

/** Text for the missed / video / voice call row. */
export function callLabel(call: { video: boolean; status: string }): string {
  const kind = call.video ? "video" : "voice";
  const missed = /miss|reject|declin|timeout|no.?answer|unanswer|busy/i.test(call.status ?? "");
  return missed ? "Missed " + kind + " call" : kind === "video" ? "Video call" : "Voice call";
}

/** Least-recently-used map. Entries that canEvict() refuses (still on screen) are kept until they can go. */
export class Lru<V> {
  private m = new Map<string, V>();
  constructor(private max: number, private onEvict: (key: string, v: V) => void = () => undefined, private canEvict: (v: V) => boolean = () => true) {}
  get size() { return this.m.size; }
  has(k: string) { return this.m.has(k); }
  keys() { return [...this.m.keys()]; }
  /** Reads and marks as most recently used. */
  get(k: string): V | undefined {
    const v = this.m.get(k);
    if (v !== undefined) { this.m.delete(k); this.m.set(k, v); }
    return v;
  }
  set(k: string, v: V) {
    this.m.delete(k);
    this.m.set(k, v);
    this.trim();
  }
  delete(k: string) { const v = this.m.get(k); if (v !== undefined) { this.m.delete(k); this.onEvict(k, v); } }
  /** Drops the oldest evictable entries until the cap holds. */
  trim() {
    for (const [k, v] of this.m) {
      if (this.m.size <= this.max) break;
      if (this.canEvict(v)) { this.m.delete(k); this.onEvict(k, v); }
    }
  }
}

/** Display size of an image: fits max x max and keeps the ratio; unknown sizes get a default 4:3 box. */
export function fitBox(w: number | null | undefined, h: number | null | undefined, maxW = 330, maxH = 360): { width: number; height: number } {
  if (!w || !h || w <= 0 || h <= 0) return { width: 240, height: 180 };
  const k = Math.min(1, maxW / w, maxH / h);
  const width = Math.max(96, Math.round(w * k)), height = Math.max(64, Math.round(h * k));
  return { width, height };
}

export type MenuKey = "reply" | "react" | "forward" | "star" | "unstar" | "pin" | "unpin" | "copy" | "edit" | "download" | "info" | "delete";
export interface MenuFeatures { react: boolean; edit: boolean; deleteForEveryone: boolean; forward: boolean; star: boolean; pinMessage: boolean }
/** The items of a message menu, in order; every item the engine cannot do is left out. */
export function menuPlan(m: Message, f: MenuFeatures, now: number, hasReply = true): MenuKey[] {
  if (m.pending || m.failed || m.id.startsWith("out-") || m.id.startsWith("pending-")) return m.body ? ["copy"] : [];
  const out: MenuKey[] = [];
  if (m.deleted || m.type === "deleted") return ["delete"];
  if (m.type === "system" || m.type === "call") return [];
  if (hasReply) out.push("reply");
  if (f.react) out.push("react");
  if (f.forward) out.push("forward");
  if (f.star) out.push(m.starred ? "unstar" : "star");
  if (f.pinMessage) out.push(m.pinned ? "unpin" : "pin");
  if (m.body) out.push("copy");
  if (f.edit && canEdit(m, now)) out.push("edit");
  if (m.media && m.media.available !== false && ["image", "video", "audio", "ptt", "document", "sticker"].includes(m.type ?? "")) out.push("download");
  out.push("info", "delete");
  return out;
}

export type Kind = "text" | "image" | "sticker" | "video" | "ptt" | "audio" | "document" | "location" | "vcard" | "poll" | "call" | "system" | "deleted" | "media";
/** Which bubble a message gets. A message with a file but no known type is guessed from its mime; one that only says it has media gets "media". */
export function messageKind(m: Pick<Message, "type" | "media" | "hasMedia" | "deleted" | "location" | "vcards" | "poll" | "call">): Kind {
  if (m.deleted || m.type === "deleted") return "deleted";
  switch (m.type) {
    case "image": case "sticker": case "video": case "ptt": case "audio": case "document": case "location": case "vcard": case "poll": case "call": case "system": return m.type;
    default:
  }
  if (m.media) {
    const mime = m.media.mime ?? "";
    if (mime.startsWith("image/")) return mime === "image/webp" && !m.media.width ? "sticker" : "image";
    if (mime.startsWith("video/")) return "video";
    if (mime.startsWith("audio/")) return "audio";
    return "document";
  }
  if (m.location) return "location";
  if (m.vcards?.length) return "vcard";
  if (m.poll) return "poll";
  if (m.call) return "call";
  return m.hasMedia ? "media" : "text";
}
