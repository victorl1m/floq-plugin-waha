// WhatsApp status (stories): incoming statuses arrive as message events from "status@broadcast" and are kept for 24 hours in {{p}}statuses.
// WAHA deletes downloaded files after a few minutes, so media is cached as soon as the event arrives. Posting and deleting go through WAHA's /status endpoints.
import type { Deps } from "./extras.js";
import { digitsOf, displayDigits, normId } from "./ids.js";
import { parseMessage, participantOf, rec } from "./parse.js";
import { MEDIA_MAX_BYTES } from "./messages.js";
import { peopleOf, uploadOf } from "./more-util.js";

export const STATUS_TTL_MS = 24 * 3600_000;
const FONTS = 9;
const kinds: Record<string, string> = { chat: "text", image: "image", video: "video", ptt: "voice", audio: "voice" };

export function registerStatus({ core, identity, store }: Deps): void {
  const { ctx } = core;
  const q = (sql: string, params: unknown[]) => ctx.db.query(sql, params);
  const R = ctx.routes;

  async function purge(userId: string) {
    const gone = await q(`DELETE FROM {{p}}statuses WHERE user_id = $1 AND session = $S AND sent_at < now() - interval '24 hours' RETURNING stanza`, [userId]);
    if (gone.rows.length) await q(`DELETE FROM {{p}}media_blobs WHERE user_id = $1 AND session = $S AND key = ANY($2::text[])`, [userId, gone.rows.map((x) => "s:" + String(x.stanza))]);
    await q(`DELETE FROM {{p}}media_blobs WHERE user_id = $1 AND session = $S AND key LIKE 's:%' AND created_at < now() - interval '25 hours'`, [userId]);
  }
  async function meChat(userId: string) { const me = await identity.me(userId); return me ? identity.canonical(userId, me.id) : ""; }

  /** Stores one status. False when it was already there. */
  async function keep(userId: string, s: { stanza: string; msgId: string; poster: string; name: string; mine: boolean; type: string; body: string; bg: string; media: Record<string, unknown> | null; at: Date }) {
    const r = await q(
      `INSERT INTO {{p}}statuses (user_id, session, stanza, msg_id, poster, poster_name, mine, type, body, bg, media, sent_at) VALUES ($1,$S,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)
       ON CONFLICT (user_id, session, stanza) DO NOTHING RETURNING stanza`, [userId, s.stanza, s.msgId, s.poster, s.name, s.mine, s.type, s.body.slice(0, 2000), s.bg, s.media ? JSON.stringify(s.media) : null, s.at.toISOString()]);
    await purge(userId);
    return r.rows.length > 0;
  }

  for (const name of ["message", "message.any"]) core.on(name, async (userId, e) => {
    const p = e.payload;
    const isStatus = normId(p.from) === "status@broadcast" || normId(p.to) === "status@broadcast" || (typeof p.id === "string" && p.id.includes("_status@broadcast_"));
    if (!isStatus) return;
    const m = parseMessage({ ...p, from: p.from ?? "status@broadcast" }, e.session, e.me);
    const type = m ? kinds[m.type] : undefined;
    if (!m || !type || Date.now() - m.sentAt.getTime() > STATUS_TTL_MS) return;
    const mine = m.fromMe;
    const poster = mine ? await meChat(userId) || "me" : await identity.canonical(userId, participantOf(p));
    if (!poster) return;
    const argb = Number(rec(rec(rec(p._data).message).extendedTextMessage).backgroundArgb);
    const bg = Number.isFinite(argb) && argb !== 0 ? "#" + (argb & 0xffffff).toString(16).padStart(6, "0") : "";
    const media = m.media ? { mime: m.media.mime, filename: m.media.filename, size: m.media.size ?? null, duration: m.media.duration ?? null } : null;
    if (!(await keep(userId, { stanza: m.stanza, msgId: m.msgId, poster, name: m.senderName, mine, type, body: m.body, bg, media, at: m.sentAt }))) return;
    if (m.media?.url && !m.media.error && (!m.media.size || m.media.size <= MEDIA_MAX_BYTES)) {
      const url = m.media.url, mime = m.media.mime;
      core.bg((async () => {
        const f = await core.wahaBytes(userId, url);
        if (f.bytes.length && f.bytes.length <= MEDIA_MAX_BYTES) await store.putBlob(userId, "s:" + m.stanza, mime || f.mime, f.bytes);
        core.publish(userId, "status", { poster });
      })());
    }
    core.publish(userId, "status", { poster, mine });
  });

  R.get("/status/list", async ({ userId }) => {
    await core.owner(userId);
    await purge(userId);
    const rows = (await q(`SELECT stanza, poster, poster_name, mine, type, body, bg, media, sent_at FROM {{p}}statuses WHERE user_id = $1 AND session = $S ORDER BY sent_at ASC`, [userId])).rows;
    const blobs = new Set((await q(`SELECT key FROM {{p}}media_blobs WHERE user_id = $1 AND session = $S AND key LIKE 's:%'`, [userId])).rows.map((x) => String(x.key)));
    const me = await meChat(userId);
    const people = await peopleOf(core, userId, [...new Set(rows.map((x) => String(x.poster)))]);
    const groups = new Map<string, { poster: { chatId: string; name: string; phone: string | null; avatar: number | null; isMe: boolean }; items: Record<string, unknown>[]; last: number }>();
    for (const x of rows) {
      const id = String(x.poster), mine = x.mine === true, key = mine ? "me" : id, person = people.get(id);
      const digits = digitsOf(id);
      let g = groups.get(key);
      if (!g) {
        g = { poster: { chatId: mine && me ? me : id, name: mine ? "My status" : person?.name || String(x.poster_name ?? "") || "", phone: digits ? displayDigits(digits) : person?.phone || null, avatar: person?.avatar ?? null, isMe: mine }, items: [], last: 0 };
        groups.set(key, g);
      }
      const media = x.media ? rec(x.media) : null, at = new Date(x.sent_at as string);
      g.items.push({ id: String(x.stanza), type: String(x.type), body: String(x.body ?? ""), ...(x.bg ? { background: String(x.bg) } : {}),
        media: media ? { mime: String(media.mime ?? ""), available: blobs.has("s:" + String(x.stanza)) } : null, sentAt: at.toISOString() });
      g.last = at.getTime();
    }
    return [...groups.values()].sort((a, b) => Number(b.poster.isMe) - Number(a.poster.isMe) || b.last - a.last).map(({ poster, items }) => ({ poster, items }));
  });

  R.get("/status/media", async ({ userId, query }) => {
    await core.owner(userId);
    const id = typeof query?.id === "string" ? query.id : "";
    if (!/^[\w.-]{1,200}$/.test(id)) throw ctx.httpError(400, "invalid_id", "id is invalid");
    const r = (await q(`SELECT mime, bytes FROM {{p}}media_blobs WHERE user_id = $1 AND session = $S AND key = $2`, [userId, "s:" + id])).rows[0];
    if (!r) throw ctx.httpError(404, "media_gone", "This status file is no longer available.");
    return { mime: String(r.mime), data: Buffer.from(r.bytes as Uint8Array).toString("base64") };
  });

  /** Own status just posted: WAHA answers with the message id on some engines; the webhook fills it in otherwise. */
  async function keepOwn(userId: string, res: unknown, s: { type: string; body: string; bg?: string; media?: Record<string, unknown> | null; bytes?: Uint8Array }) {
    const o = rec(res), id = String(rec(o.key).id ?? (typeof o.id === "string" ? o.id : rec(o.id).id ?? "") ?? ""), stanza = id.split("_").length >= 3 ? id.split("_")[2] : id;
    if (!/^[\w.-]{4,200}$/.test(stanza)) return;
    const me = await identity.me(userId);
    if (await keep(userId, { stanza, msgId: id, poster: (await meChat(userId)) || "me", name: me?.name ?? "", mine: true, type: s.type, body: s.body, bg: s.bg ?? "", media: s.media ?? null, at: new Date() }) && s.bytes && s.media) {
      await store.putBlob(userId, "s:" + stanza, String(s.media.mime), s.bytes).catch(() => undefined);
    }
  }
  const done = (userId: string) => { core.publish(userId, "status", { mine: true }); return { ok: true }; };

  R.post("/status/text", async ({ userId, body }) => {
    await core.owner(userId);
    const b = core.obj(body), text = core.text(b.text, 700);
    const bg = typeof b.backgroundColor === "string" && /^#[0-9a-f]{6}$/i.test(b.backgroundColor) ? b.backgroundColor.toLowerCase() : "#38b42f";
    const font = Number.isInteger(b.font) && (b.font as number) >= 0 && (b.font as number) < FONTS ? (b.font as number) : 0;
    const res = await core.guard(() => core.waha(userId, "POST", "/api/{session}/status/text", { body: { text, backgroundColor: bg, font } }), "status");
    await keepOwn(userId, res, { type: "text", body: text, bg });
    return done(userId);
  });
  R.post("/status/image", async ({ userId, body }) => {
    await core.owner(userId);
    const b = core.obj(body), f = uploadOf(core, b, "status.jpg"), caption = core.optText(b.caption, 700);
    if (!f.mime.startsWith("image/")) throw ctx.httpError(400, "invalid_file", "That file is not an image.");
    const res = await core.guard(() => core.waha(userId, "POST", "/api/{session}/status/image", { body: { file: { mimetype: f.mime, filename: f.filename, data: f.data }, ...(caption ? { caption } : {}) } }), "status");
    await keepOwn(userId, res, { type: "image", body: caption, media: { mime: f.mime, filename: f.filename, size: f.bytes.length }, bytes: f.bytes });
    return done(userId);
  });
  R.post("/status/video", async ({ userId, body }) => {
    await core.owner(userId);
    const b = core.obj(body), f = uploadOf(core, b, "status.mp4"), caption = core.optText(b.caption, 700);
    if (!f.mime.startsWith("video/")) throw ctx.httpError(400, "invalid_file", "That file is not a video.");
    const mime = f.mime.split(";")[0].trim().toLowerCase();
    const res = await core.guard(() => core.waha(userId, "POST", "/api/{session}/status/video", { body: { file: { mimetype: mime, filename: f.filename, data: f.data }, convert: mime !== "video/mp4", ...(caption ? { caption } : {}) } }), "status");
    await keepOwn(userId, res, { type: "video", body: caption, media: { mime, filename: f.filename, size: f.bytes.length }, bytes: f.bytes });
    return done(userId);
  });
  R.post("/status/voice", async ({ userId, body }) => {
    await core.owner(userId);
    const b = core.obj(body), f = uploadOf(core, b, "voice.ogg");
    if (!f.mime.startsWith("audio/")) throw ctx.httpError(400, "invalid_file", "That file is not audio.");
    const convert = !(f.mime.split(";")[0].trim().toLowerCase() === "audio/ogg" && /opus/i.test(f.mime));
    const bg = typeof b.backgroundColor === "string" && /^#[0-9a-f]{6}$/i.test(b.backgroundColor) ? b.backgroundColor.toLowerCase() : undefined;
    const res = await core.guard(() => core.waha(userId, "POST", "/api/{session}/status/voice", { body: { file: { mimetype: convert ? f.mime.split(";")[0].trim().toLowerCase() : "audio/ogg; codecs=opus", filename: f.filename, data: f.data }, convert, ...(bg ? { backgroundColor: bg } : {}) } }), "status");
    await keepOwn(userId, res, { type: "voice", body: "", bg, media: { mime: f.mime.split(";")[0].trim().toLowerCase(), filename: f.filename, size: f.bytes.length }, bytes: f.bytes });
    return done(userId);
  });

  R.post("/status/delete", async ({ userId, body }) => {
    await core.owner(userId);
    const id = String(core.obj(body).id ?? "");
    if (!/^[\w.-]{1,200}$/.test(id)) throw ctx.httpError(400, "invalid_id", "id is invalid");
    const row = (await q(`SELECT msg_id, mine FROM {{p}}statuses WHERE user_id = $1 AND session = $S AND stanza = $2`, [userId, id])).rows[0];
    if (!row) throw ctx.httpError(404, "not_found", "That status is gone already.");
    if (row.mine !== true) throw ctx.httpError(400, "not_mine", "You can only delete your own status.");
    await core.guard(() => core.waha(userId, "POST", "/api/{session}/status/delete", { body: { id } }), "status delete");
    await q(`DELETE FROM {{p}}statuses WHERE user_id = $1 AND session = $S AND stanza = $2`, [userId, id]);
    await q(`DELETE FROM {{p}}media_blobs WHERE user_id = $1 AND session = $S AND key = $2`, [userId, "s:" + id]);
    return done(userId);
  });
}
