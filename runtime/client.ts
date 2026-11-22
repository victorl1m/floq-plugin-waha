import { phoneDigits } from "../shared/phone.js";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { PluginFetchResponse } from "../shared/sdk";

/** Own number as typed by the user: optional spaces, dashes, dots and parentheses, then `+` and 8-15 digits (E.164, no leading zero). Returns the WAHA chat id, or null. */
/** Any common way of writing an international number ("+55 (11) 99999-9999", "0055 11...", "5511999999999") -> "5511999999999@c.us". */
export function phoneToChatId(raw: unknown): string | null {
  const digits = phoneDigits(raw);
  return digits ? `${digits}@c.us` : null;
}

export const TEXT_MAX = 4096;

/** Errors name the HTTP status and, when WAHA gave one, its own short error message (control characters and URLs removed): never the API key or the rest of the body. */
export class WahaError extends Error {
  constructor(readonly status: number, readonly detail = "") { super(`WAHA request failed (HTTP ${status})`); this.name = "WahaError"; }
}

/** `https://host[:port][/prefix]` without a trailing slash; http is allowed because the instance is self-hosted. Null otherwise. */
/** WAHA's own error text from a failed response ({message}, {error}, {exception:{message}}), cleaned and cut to one short line. */
export function wahaDetail(res: { json(): unknown; text?(): string }): string {
  let v: unknown;
  try { v = res.json(); } catch { v = null; }
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const ex = o.exception && typeof o.exception === "object" ? (o.exception as Record<string, unknown>).message : undefined;
  const pick = [o.message, ex, o.error].map((m) => (Array.isArray(m) ? m.filter((x) => typeof x === "string").join("; ") : m)).find((m) => typeof m === "string" && m.trim());
  return typeof pick === "string" ? pick.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim().slice(0, 160) : "";
}

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


// The id and payload helpers moved to ids.ts / parse.ts; re-exported for existing callers.
export { CHAT_ID, pnOf, lidOf, stanzaOf, normId, brVariants } from "./ids.js";
export { parseWebhook, parseMessage, parseEnvelope, replyOf, describe, parseVCard, sentIdOf, linkFromSend, MESSAGE_EVENTS as WEBHOOK_EVENTS, type ReplyRef, type IdLink, type Parsed as StoredMessage } from "./parse.js";
