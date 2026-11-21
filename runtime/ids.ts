// WhatsApp id helpers: pure, no I/O.

export const CHAT_ID = /^[0-9A-Za-z._@-]{3,100}$/;
const PN_JID = /^(\d{8,15})(:\d+)?@(c\.us|s\.whatsapp\.net)$/;

/** "5511...:12@s.whatsapp.net" -> "5511...@c.us"; null when it is not a phone-number id. */
export function pnOf(v: unknown): string | null {
  const m = typeof v === "string" ? PN_JID.exec(v.trim()) : null;
  return m ? `${m[1]}@c.us` : null;
}
/** "1234:5@lid" -> "1234@lid"; null when it is not a lid. */
export function lidOf(v: unknown): string | null {
  const m = typeof v === "string" ? /^(\d{5,20})(:\d+)?@lid$/.exec(v.trim()) : null;
  return m ? `${m[1]}@lid` : null;
}
/** Any id WAHA hands out, without device suffix and with one spelling per kind. Objects ({_serialized} / {user, server}) are accepted. "" when unusable. */
export function normId(v: unknown): string {
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o._serialized === "string") return normId(o._serialized);
    if (typeof o.user === "string" && typeof o.server === "string") return normId(`${o.user}@${o.server}`);
    return "";
  }
  if (typeof v !== "string") return "";
  const t = v.trim();
  return pnOf(t) ?? lidOf(t) ?? (CHAT_ID.test(t) ? t : "");
}
export const digitsOf = (id: string): string | null => { const m = /^(\d{8,15})@c\.us$/.exec(pnOf(id) ?? ""); return m ? m[1] : null; };
export const isGroup = (id: string) => id.endsWith("@g.us");
export const isUser = (id: string) => /@(c\.us|s\.whatsapp\.net|lid)$/.test(id);
export const kindOf = (id: string): "user" | "group" | "channel" | "status" | "other" =>
  isGroup(id) ? "group" : isUser(id) ? "user" : id.endsWith("@newsletter") ? "channel" : id === "status@broadcast" ? "status" : "other";

/**
 * Brazilian mobiles exist in two spellings of the same line: 55 + area + 9 + 8 digits and (older WhatsApp accounts) 55 + area + 8 digits.
 * Returns [with the ninth digit, without it], or null when the number is not a Brazilian mobile. Landlines (first digit 2-5) are left alone.
 */
export function brVariants(digits: string): [string, string] | null {
  const m = /^55(\d{2})(9?)([6-9]\d{7})$/.exec(digits);
  return m ? [`55${m[1]}9${m[3]}`, `55${m[1]}${m[3]}`] : null;
}
/** The spelling people dial: Brazilian mobiles always with the ninth digit. */
export const displayDigits = (digits: string): string => brVariants(digits)?.[0] ?? digits;
/** Both ids of a Brazilian mobile chat id (itself first), or just the id. */
export function pnSpellings(id: string): string[] {
  const d = digitsOf(id), v = d ? brVariants(d) : null;
  return v ? [`${d}@c.us`, ...v.filter((x) => x !== d).map((x) => `${x}@c.us`)] : [id];
}

/** The bare stanza id of a WAHA message id: "false_5511@c.us_3EB0AA" and "false_1203@g.us_3EB0AA_5511@c.us" -> "3EB0AA". */
export function stanzaOf(id: unknown): string {
  const t = typeof id === "string" ? id : id && typeof id === "object" ? String((id as Record<string, unknown>)._serialized ?? (id as Record<string, unknown>).id ?? "") : "";
  const m = /^(?:true|false)_[^_]+_([^_]+)/.exec(t);
  return (m ? m[1] : t).slice(0, 200);
}
