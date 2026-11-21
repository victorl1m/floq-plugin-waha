// WhatsApp channels (newsletters): the followed list, a channel's posts read-only (same shape as a conversation), search and follow.
import type { Deps } from "./extras.js";
import { WahaError } from "./client.js";
import { parseMessage, rec, type Parsed } from "./parse.js";
import { enc } from "./more-util.js";

const CHANNEL_ID = /^[0-9A-Za-z._-]{3,80}@newsletter$/;
export interface ChannelInfo { id: string; name: string; description: string; picture: string; verified: boolean; role: string; subscribers?: number }
const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, "").trim().slice(0, max) : "");

export function parseChannel(raw: unknown): ChannelInfo | null {
  const o = rec(raw), id = str(o.id, 100);
  if (!CHANNEL_ID.test(id)) return null;
  const meta = rec(o.threadMetadata), n = Number(o.subscribersCount ?? o.subscribers ?? meta.subscribers_count);
  const picture = str(o.picture ?? o.preview, 600);
  return { id, name: str(o.name ?? rec(meta.name).text, 200), description: str(o.description ?? rec(meta.description).text, 1000), picture: /^https:\/\//.test(picture) ? picture : "", verified: o.verified === true || meta.verification === "VERIFIED",
    role: str(o.role, 20) || "GUEST", ...(Number.isFinite(n) && n >= 0 ? { subscribers: Math.trunc(n) } : {}) };
}

/** One channel post in the conversation's message shape (read-only: no media bytes, so a file shows as unavailable). */
function shape(m: Parsed, views?: number, reactions?: Record<string, unknown>) {
  const media = m.media;
  const list = Object.entries(rec(reactions)).map(([emoji, n]) => ({ emoji, count: Number(n) || 0, mine: false, senders: [] as string[] })).filter((r) => r.count > 0);
  return {
    id: m.msgId, fromMe: false, sender: m.chatId, senderName: "", body: m.body, type: m.type, hasMedia: m.hasMedia, sentAt: m.sentAt.toISOString(), ack: 0,
    media: media ? { mime: media.mime, filename: media.filename, size: media.size ?? null, duration: media.duration ?? null, width: media.width ?? null, height: media.height ?? null, gif: media.gif === true, available: false } : null,
    ...(m.extra.location ? { location: m.extra.location } : {}), ...(m.extra.preview ? { preview: m.extra.preview } : {}), ...(views !== undefined ? { views } : {}), ...(list.length ? { reactions: list } : {}),
  };
}

export function registerChannels({ core }: Deps): void {
  const { ctx } = core;
  const R = ctx.routes;
  const channelId = (v: unknown) => { const id = typeof v === "string" ? v.trim() : ""; if (!CHANNEL_ID.test(id)) throw ctx.httpError(400, "invalid_channel", "id must be a channel id like 120363...@newsletter"); return id; };

  R.get("/channels", async ({ userId }) => {
    await core.owner(userId);
    const list = await core.guard(() => core.waha<unknown>(userId, "GET", "/api/{session}/channels"), "channels");
    return { channels: (Array.isArray(list) ? list : []).map(parseChannel).filter((c): c is ChannelInfo => c !== null) };
  });

  R.get("/channel/messages", async ({ userId, query }) => {
    await core.owner(userId);
    const id = channelId(query?.id), limit = Math.min(100, Math.max(1, Number.parseInt(String(query?.limit ?? "30"), 10) || 30));
    const c = await core.ready(userId), me = await ctx.kv.get(userId, "me");
    const out: ReturnType<typeof shape>[] = [];
    const add = (o: Record<string, unknown>, views?: number, reactions?: Record<string, unknown>) => {
      const m = parseMessage({ ...o, from: o.from ?? id, fromMe: false }, c.session, me);
      if (m) out.push(shape({ ...m, chatId: id }, views, reactions));
    };
    try {
      const list = await core.waha<unknown>(userId, "GET", `/api/{session}/chats/${enc(id)}/messages`, { query: { limit, downloadMedia: false } });
      if (!Array.isArray(list)) throw new WahaError(404);
      for (const item of list) add(rec(item));
    } catch (first) {
      try {
        const list = await core.waha<unknown>(userId, "GET", `/api/{session}/channels/${enc(id)}/messages/preview`, { query: { limit, downloadMedia: false } });
        for (const item of Array.isArray(list) ? list : []) { const o = rec(item); add(rec(o.message), Number.isFinite(Number(o.viewCount)) ? Number(o.viewCount) : undefined, rec(o.reactions)); }
      } catch { core.fail(first, "channel messages"); }
    }
    out.sort((a, b) => a.sentAt.localeCompare(b.sentAt));
    return { id, messages: out.slice(-limit) };
  });

  R.get("/channels/search", async ({ userId, query }) => {
    await core.owner(userId);
    const text = core.text(typeof query?.q === "string" ? query.q.trim() : "", 100, "q");
    const res = await core.guard(() => core.waha<unknown>(userId, "POST", "/api/{session}/channels/search/by-text", { body: { filters: { searchText: text }, limit: 30 } }), "channel search");
    const o = rec(res), list = Array.isArray(res) ? res : Array.isArray(o.channels) ? o.channels : Array.isArray(o.results) ? o.results : [];
    return { channels: list.map(parseChannel).filter((c): c is ChannelInfo => c !== null) };
  });

  R.post("/channel/follow", async ({ userId, body }) => {
    await core.owner(userId);
    const b = core.obj(body), id = channelId(b.id);
    if (typeof b.follow !== "boolean") throw ctx.httpError(400, "invalid_follow", "follow must be true or false");
    await core.guard(() => core.waha(userId, "POST", `/api/{session}/channels/${enc(id)}/${b.follow ? "follow" : "unfollow"}`), "channel follow");
    return { ok: true, id, follow: b.follow };
  });
}
