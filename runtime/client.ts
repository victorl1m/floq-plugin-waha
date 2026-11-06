import { createHmac, timingSafeEqual } from "node:crypto";
import type { PluginFetchResponse } from "../shared/sdk";

export const CHAT_ID = /^[0-9A-Za-z._@-]{3,100}$/;
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

export interface StoredMessage { session: string; chatId: string; msgId: string; fromMe: boolean; sender: string; body: string; hasMedia: boolean; sentAt: Date }

const s = (v: unknown, max: number) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "").slice(0, max);

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
  return {
    session: s(e.session, 64) || "default", chatId, msgId, fromMe, sender: fromMe ? "me" : from,
    body: s(p.body, 8000), hasMedia: p.hasMedia === true,
    sentAt: new Date(Number.isFinite(seconds) && seconds > 0 ? seconds * (seconds < 1e12 ? 1000 : 1) : Date.now()),
  };
}

export type FetchUserUrl = (userId: string, url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<PluginFetchResponse>;

/** `POST {base}/api/sendText`. Returns WAHA's message id when it gives one. */
export async function sendText(fetchUserUrl: FetchUserUrl, userId: string, base: string, apiKey: string, session: string, chatId: string, text: string): Promise<string | null> {
  let res: PluginFetchResponse;
  try {
    res = await fetchUserUrl(userId, `${base}/api/sendText`, { method: "POST", headers: { "X-Api-Key": apiKey, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ session, chatId, text }) });
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
