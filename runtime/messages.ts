// The message store: rows from webhooks and from WAHA's own history, folded per canonical chat; the chat list and the conversation the UI and agents read.
import type { Core, WebhookEvent } from "./core.js";
import type { Identity } from "./identity.js";
import { digitsOf, displayDigits, isGroup, isUser, kindOf, lidOf, normId, pnOf, stanzaOf } from "./ids.js";
import { MESSAGE_EVENTS, parseMessage, rec, type MediaMeta, type MessageExtra, type Parsed } from "./parse.js";
import { formatPhone } from "../shared/phone.js";

/** WAHA's chat list is re-read at most this often. */
export const CHATS_SYNC_EVERY_MS = 60_000;
/** A chat's history is re-read from WAHA at most this often while it is open. */
export const CHAT_SYNC_EVERY_MS = 20_000;
/** Media kept in the database: per file and in total (oldest files go first). Avatars are separate and small. */
export const MEDIA_MAX_BYTES = 16 * 1024 * 1024;
export const MEDIA_TOTAL_BYTES = 400 * 1024 * 1024;

export interface Store {
  /** Inserts or refreshes a message. Returns "new" for a row that was not there. Learns id links and contact names on the way. */
  save(userId: string, m: Parsed, opts?: { real?: boolean }): Promise<"new" | "known" | "skipped">;
  listChats(userId: string, opts?: { archived?: boolean }): Promise<{ chats: Record<string, unknown>[]; archivedCount: number }>;
  listMessages(userId: string, chatId: string, opts?: { limit?: unknown; before?: unknown; q?: unknown; sync?: boolean }): Promise<{ messages: Record<string, unknown>[]; more: boolean }>;
  markRead(userId: string, chatId: string): Promise<void>;
  /** The stored row of a message id (any alias of its chat), or a 404. */
  row(userId: string, msgId: unknown): Promise<Record<string, unknown>>;
  /** Address to write to: where the contact last wrote from, then the canonical id, then the other aliases. */
  route(userId: string, chatId: string): Promise<string[]>;
  mediaBytes(userId: string, msgId: string): Promise<{ mime: string; filename: string; bytes: Uint8Array }>;
  putBlob(userId: string, key: string, mime: string, bytes: Uint8Array): Promise<void>;
  syncChats(userId: string, force?: boolean): Promise<boolean>;
  syncChat(userId: string, chatId: string, force?: boolean): Promise<boolean>;
  setState(userId: string, chatId: string, patch: Record<string, unknown>): Promise<void>;
}

const ACK_NAMES: Record<string, number> = { ERROR: -1, PENDING: 0, SERVER: 1, DEVICE: 2, READ: 3, PLAYED: 4 };
const iso = (v: unknown) => new Date(v as string).toISOString();

export function createStore(core: Core, identity: Identity): Store {
  const { ctx } = core;
  const q = (sql: string, params: unknown[]) => ctx.db.query(sql, params);
  const CID = `COALESCE(lm.pn, m.chat_id)`;
  const MSGS = `SELECT m.*, ${CID} AS cid FROM {{p}}messages m LEFT JOIN {{p}}lid_map lm ON lm.user_id = m.user_id AND lm.session = m.session AND lm.lid = m.chat_id WHERE m.user_id = $1 AND m.session = $S`;
  // Per account (the "user id" every function gets is the account's scope).
  const chatsSyncedAt = new Map<string, number>();
  const chatSynced = new Map<string, number>();
  const caching = new Set<string>();

  async function putBlob(userId: string, key: string, mime: string, bytes: Uint8Array) {
    await q(`INSERT INTO {{p}}media_blobs (user_id, session, key, mime, bytes, size) VALUES ($1,$S,$2,$3,$4,$5) ON CONFLICT (user_id, session, key) DO UPDATE SET mime = EXCLUDED.mime, bytes = EXCLUDED.bytes, size = EXCLUDED.size, created_at = now()`, [userId, key, mime, Buffer.from(bytes), bytes.length]);
    // Keep the total bounded: drop the oldest message media.
    const total = Number((await q(`SELECT COALESCE(SUM(size),0)::bigint AS n FROM {{p}}media_blobs WHERE user_id = $1 AND session = $S AND key LIKE 'm:%'`, [userId])).rows[0]?.n ?? 0);
    if (total > MEDIA_TOTAL_BYTES) {
      await q(`DELETE FROM {{p}}media_blobs WHERE user_id = $1 AND session = $S AND key IN (SELECT key FROM {{p}}media_blobs WHERE user_id = $1 AND session = $S AND key LIKE 'm:%' ORDER BY created_at ASC LIMIT 20)`, [userId]);
    }
  }

  /** Downloads a message's file while WAHA still has it (WAHA deletes downloaded files after a few minutes). Background, never throws. */
  function cacheMedia(userId: string, stanza: string, media: MediaMeta | null) {
    if (!media?.url || media.error || !stanza || caching.has(userId + stanza)) return;
    if (media.size && media.size > MEDIA_MAX_BYTES) return;
    caching.add(userId + stanza);
    core.bg((async () => {
      try {
        const has = await q(`SELECT 1 AS x FROM {{p}}media_blobs WHERE user_id = $1 AND session = $S AND key = $2`, [userId, "m:" + stanza]);
        if (has.rows.length) return;
        const f = await core.wahaBytes(userId, media.url!);
        if (f.bytes.length && f.bytes.length <= MEDIA_MAX_BYTES) await putBlob(userId, "m:" + stanza, media.mime || f.mime, f.bytes);
      } catch { /* shown as "not available" until WAHA can serve it again */ }
      finally { caching.delete(userId + stanza); }
    })());
  }

  const store: Store = {
    putBlob,
    async save(userId, m, opts = {}) {
      const real = opts.real !== false;
      for (const l of m.links) { await identity.seen(userId, l.pn, true); await identity.link(userId, l.lid, l.pn); }
      if (pnOf(m.chatId)) await identity.seen(userId, m.chatId, real && (!m.fromMe || m.source === "app"));
      if (m.type === "reaction" || m.reaction) {
        if (m.reaction?.target) await react(userId, m.reaction.target, m.fromMe ? "me" : m.sender, m.reaction.emoji, m.sentAt);
        return "skipped";
      }
      // The same message can arrive under the contact's lid and under its phone id: that proves both are one chat.
      if (m.stanza && isUser(m.chatId)) {
        const twin = (await q(`SELECT chat_id, msg_id FROM {{p}}messages WHERE user_id = $1 AND session = $S AND stanza = $2 AND msg_id <> $3 AND from_me = $4 LIMIT 1`, [userId, m.stanza, m.msgId, m.fromMe])).rows[0];
        if (twin && isUser(String(twin.chat_id)) && String(twin.chat_id) !== m.chatId) {
          const a = String(twin.chat_id), lid = lidOf(a) ?? lidOf(m.chatId), pn = pnOf(a) ?? pnOf(m.chatId);
          if (lid && pn) await identity.link(userId, lid, pn);
          m = { ...m, msgId: String(twin.msg_id), chatId: a };
        }
      }
      // A message we sent through the API and recorded without an id comes back on the webhook with its real id: adopt it instead of showing it twice.
      if (m.fromMe) {
        const ids = await identity.aliases(userId, m.chatId);
        const ghost = (await q(
          `SELECT id FROM {{p}}messages WHERE user_id = $1 AND session = $S AND chat_id = ANY($2::text[]) AND from_me AND msg_id LIKE 'out-%' AND body = $3 AND type = $4
             AND sent_at > $5::timestamptz - interval '3 minutes' AND sent_at < $5::timestamptz + interval '3 minutes'
             AND NOT EXISTS (SELECT 1 FROM {{p}}messages x WHERE x.session = $6 AND x.msg_id = $7) ORDER BY sent_at DESC LIMIT 1`,
          [userId, ids, m.body, m.type, m.sentAt.toISOString(), m.session, m.msgId])).rows[0];
        if (ghost) await q(`UPDATE {{p}}messages SET msg_id = $2, stanza = $3 WHERE id = $1`, [ghost.id, m.msgId, m.stanza]);
      }
      const r = m.reply;
      const ins = await q(
        `INSERT INTO {{p}}messages (user_id, session, chat_id, msg_id, stanza, from_me, sender, sender_name, body, has_media, sent_at, reply_to, reply_body, reply_sender, reply_media, type, media, extra, ack)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18::jsonb,$19)
         ON CONFLICT (session, msg_id) DO NOTHING RETURNING id`,
        [userId, m.session, m.chatId, m.msgId, m.stanza, m.fromMe, m.sender, m.senderName, m.body, m.hasMedia, m.sentAt.toISOString(), r?.id ?? "", r?.body ?? "", r?.sender ?? "", r?.hasMedia ?? false,
          m.type, m.media ? JSON.stringify(m.media) : null, Object.keys(m.extra).length ? JSON.stringify(m.extra) : null, m.ack]);
      const fresh = ins.rows.length > 0;
      if (!fresh) {
        // Seen before (history sync, or an event repeated): acks only go up, details fill in.
        await q(
          `UPDATE {{p}}messages SET ack = GREATEST(ack, $3), type = CASE WHEN type IN ('chat','unknown') AND $4 <> 'unknown' THEN $4 ELSE type END,
             media = CASE WHEN $5::jsonb IS NOT NULL AND (media IS NULL OR media->>'url' IS NULL OR $5::jsonb->>'url' IS NOT NULL) THEN $5::jsonb ELSE media END,
             extra = COALESCE(extra, $6::jsonb), sender_name = CASE WHEN sender_name = '' THEN $7 ELSE sender_name END
           WHERE session = $1 AND msg_id = $2`,
          [m.session, m.msgId, m.ack, m.type, m.media ? JSON.stringify(m.media) : null, Object.keys(m.extra).length ? JSON.stringify(m.extra) : null, m.senderName]);
      }
      if (!m.fromMe && !isGroup(m.chatId) && (m.senderName || m.senderPhone)) await identity.upsertContact(userId, m.chatId, { pushName: m.senderName, phone: m.senderPhone });
      if (!m.fromMe && isGroup(m.chatId) && m.senderName && isUser(m.sender)) await identity.upsertContact(userId, m.sender, { pushName: m.senderName });
      cacheMedia(userId, m.stanza, m.media);
      return fresh ? "new" : "known";
    },

    async listChats(userId, opts = {}) {
      const selfIds = await identity.selfIds(userId);
      const me = await identity.me(userId);
      const meChat = me?.id ? await identity.canonical(userId, me.id) : "";
      const r = await q(
        `WITH msgs AS (${MSGS}),
         vis AS (SELECT u.* FROM msgs u LEFT JOIN {{p}}chat_state st ON st.user_id = $1 AND st.session = $S AND st.chat_id = u.cid WHERE st.cleared_at IS NULL OR u.sent_at > st.cleared_at),
         agg AS (SELECT cid, MAX(sent_at) AS last_at, COUNT(*)::int AS total FROM vis GROUP BY cid)
         SELECT a.cid AS chat_id, a.last_at, a.total, l.body AS last_body, l.from_me AS last_from_me, l.has_media AS last_has_media, l.type AS last_type, l.ack AS last_ack, l.deleted_at AS last_deleted,
                COALESCE(NULLIF(l.sender_name, ''), (SELECT COALESCE(NULLIF(k2.name, ''), k2.push_name) FROM {{p}}contacts k2 WHERE k2.user_id = $1 AND k2.session = $S AND k2.chat_id = l.sender LIMIT 1), '') AS last_sender_name, c.name AS name, c.push_name AS push_name, c.phone AS phone, c.has_picture AS has_picture, c.picture_at AS picture_at, c.blocked AS blocked,
                COALESCE(st.archived, FALSE) AS archived, COALESCE(st.pinned, FALSE) AS pinned, st.muted_until AS muted_until, COALESCE(st.marked_unread, FALSE) AS marked_unread, COALESCE(st.labels, '[]'::jsonb) AS labels,
                (SELECT COUNT(*)::int FROM vis u LEFT JOIN {{p}}chat_reads r ON r.user_id = $1 AND r.session = $S AND r.chat_id = u.chat_id
                  WHERE u.cid = a.cid AND u.from_me = FALSE AND (r.read_at IS NULL OR u.created_at > r.read_at)) AS unread
           FROM agg a
           LEFT JOIN {{p}}chat_state st ON st.user_id = $1 AND st.session = $S AND st.chat_id = a.cid
           LEFT JOIN LATERAL (SELECT body, from_me, has_media, type, ack, deleted_at, sender_name, sender FROM vis WHERE cid = a.cid ORDER BY sent_at DESC, id DESC LIMIT 1) l ON TRUE
           LEFT JOIN LATERAL (
             SELECT MAX(NULLIF(k.name, '')) AS name, MAX(NULLIF(k.push_name, '')) AS push_name, MAX(NULLIF(k.phone, '')) AS phone, BOOL_OR(k.has_picture) AS has_picture, MAX(k.picture_at) AS picture_at, BOOL_OR(k.blocked) AS blocked
               FROM {{p}}contacts k WHERE k.user_id = $1 AND k.session = $S AND (k.chat_id = a.cid OR k.chat_id IN (SELECT lid FROM {{p}}lid_map WHERE user_id = $1 AND session = $S AND pn = a.cid))) c ON TRUE
          WHERE (COALESCE(st.hidden, FALSE) = FALSE OR st.cleared_at IS NOT NULL) -- people-wiring: a message newer than cleared_at (only those are in agg) brings a deleted chat back
          ORDER BY COALESCE(st.pinned, FALSE) DESC, a.last_at DESC LIMIT 300`, [userId]);
      const all = r.rows.map((x) => {
        const chatId = String(x.chat_id), kind = kindOf(chatId);
        const digits = digitsOf(chatId) ?? (x.phone ? String(x.phone) : null);
        const isSelf = selfIds.has(chatId);
        const name = (x.name ? String(x.name) : "") || (x.push_name ? String(x.push_name) : "") || (isSelf && me?.name && meChat === chatId ? me.name : "");
        return {
          chatId, kind: kind === "channel" || kind === "status" ? "other" : kind, name: name || null, phone: digits ? displayDigits(digits) : null, isSelf,
          lastBody: x.last_deleted ? "" : String(x.last_body ?? "").slice(0, 200), lastFromMe: x.last_from_me === true, lastHasMedia: x.last_has_media === true, lastType: String(x.last_type ?? "chat"),
          lastAck: Number(x.last_ack) || 0, lastDeleted: Boolean(x.last_deleted), lastSenderName: kind === "group" ? String(x.last_sender_name ?? "") : "",
          lastAt: iso(x.last_at), total: Number(x.total) || 0, unread: Math.max(Number(x.unread) || 0, x.marked_unread === true ? 1 : 0), markedUnread: x.marked_unread === true,
          archived: x.archived === true, pinned: x.pinned === true, muted: x.muted_until ? new Date(x.muted_until as string).getTime() > Date.now() : false, blocked: x.blocked === true,
          avatar: x.has_picture === true && x.picture_at ? new Date(x.picture_at as string).getTime() : null, labels: Array.isArray(x.labels) ? x.labels : [],
        };
      });
      const archived = all.filter((c) => c.archived);
      return { chats: (opts.archived ? archived : all.filter((c) => !c.archived)).slice(0, 200), archivedCount: archived.length };
    },

    async listMessages(userId, chatId, opts = {}) {
      const n = Math.min(200, Math.max(1, Number.parseInt(String(opts.limit ?? "50"), 10) || 50));
      const ids = await identity.aliases(userId, chatId);
      const before = typeof opts.before === "string" && !Number.isNaN(Date.parse(opts.before)) ? new Date(opts.before).toISOString() : null;
      const search = typeof opts.q === "string" && opts.q.trim() ? "%" + opts.q.trim().slice(0, 100).replace(/[\\%_]/g, (c) => "\\" + c) + "%" : null;
      const r = await q(
        `SELECT t.*, COALESCE(sm.pn, t.sender) AS sender_c, COALESCE(rm.pn, t.reply_sender) AS reply_sender_c,
                COALESCE(NULLIF(sc.name, ''), NULLIF(t.sender_name, ''), NULLIF(sc.push_name, ''), '') AS sender_label,
                (SELECT COALESCE(jsonb_agg(jsonb_build_object('emoji', x.emoji, 'sender', COALESCE(xm.pn, x.sender)) ORDER BY x.at), '[]'::jsonb) FROM {{p}}reactions x LEFT JOIN {{p}}lid_map xm ON xm.user_id = $1 AND xm.session = $S AND xm.lid = x.sender WHERE x.user_id = $1 AND x.session = $S AND x.stanza = t.stanza AND t.stanza <> '') AS reactions,
                (SELECT COALESCE(jsonb_agg(jsonb_build_object('voter', v.voter, 'options', v.options)), '[]'::jsonb) FROM {{p}}poll_votes v WHERE v.user_id = $1 AND v.session = $S AND v.stanza = t.stanza AND t.type = 'poll') AS votes,
                EXISTS (SELECT 1 FROM {{p}}media_blobs b WHERE b.user_id = $1 AND b.session = $S AND b.key = 'm:' || t.stanza) AS cached
           FROM (
           SELECT m.* FROM {{p}}messages m LEFT JOIN {{p}}chat_state st ON st.user_id = $1 AND st.session = $S AND st.chat_id = $5
            WHERE m.user_id = $1 AND m.session = $S AND m.chat_id = ANY($2::text[]) AND (st.cleared_at IS NULL OR m.sent_at > st.cleared_at)
              AND ($4::timestamptz IS NULL OR m.sent_at < $4::timestamptz) AND ($6::text IS NULL OR m.body ILIKE $6)
            ORDER BY m.sent_at DESC, m.id DESC LIMIT $3) t
           LEFT JOIN {{p}}lid_map sm ON sm.user_id = $1 AND sm.session = $S AND sm.lid = t.sender
           LEFT JOIN {{p}}lid_map rm ON rm.user_id = $1 AND rm.session = $S AND rm.lid = t.reply_sender
           LEFT JOIN {{p}}contacts sc ON sc.user_id = $1 AND sc.session = $S AND sc.chat_id = COALESCE(sm.pn, t.sender)
          ORDER BY t.sent_at ASC, t.id ASC`, [userId, ids, n + 1, before, ids[0], search]);
      const more = r.rows.length > n;
      const page = more ? r.rows.slice(1) : r.rows;
      const rows = page.map((x) => shape(x));
      // A quote points at the original when it is on this page (so the UI can jump to it); otherwise it shows what the reply itself carried.
      const byStanza = new Map(rows.map((m) => [stanzaOf(m.id), m]));
      const messages = rows.map((m, i) => {
        const row = page[i];
        const ref = typeof row.reply_to === "string" && row.reply_to ? row.reply_to : "";
        if (!ref) return { ...m, replyTo: null };
        const o = byStanza.get(ref);
        const sender = o ? o.sender : String(row.reply_sender_c ?? "");
        return { ...m, replyTo: {
          id: o ? o.id : "", body: (o ? o.body : String(row.reply_body ?? "")).slice(0, 400), hasMedia: o ? o.hasMedia : row.reply_media === true,
          fromMe: o ? o.fromMe : sender === "me", sender: sender === "me" ? "" : sender, senderName: o ? o.senderName : "",
        } };
      });
      if (opts.sync !== false && !before && !search) core.bg(store.syncChat(userId, ids[0]).then((changed) => { if (changed) core.publish(userId, "message", { chatId: ids[0], sync: true }); }));
      return { messages, more };
    },

    async markRead(userId, chatId) {
      const ids = await identity.aliases(userId, chatId);
      for (const id of ids) {
        await q(`INSERT INTO {{p}}chat_reads (user_id, session, chat_id, read_at) VALUES ($1,$S,$2,now()) ON CONFLICT (user_id, session, chat_id) DO UPDATE SET read_at = now()`, [userId, id]);
      }
      await q(`UPDATE {{p}}chat_state SET marked_unread = FALSE WHERE user_id = $1 AND session = $S AND chat_id = $2 AND marked_unread`, [userId, ids[0]]);
    },

    async row(userId, msgId) {
      if (typeof msgId !== "string" || !msgId || msgId.length > 200) throw ctx.httpError(400, "invalid_message", "messageId is invalid");
      const x = (await q(`SELECT * FROM {{p}}messages WHERE user_id = $1 AND session = $S AND msg_id = $2 LIMIT 1`, [userId, msgId])).rows[0];
      if (!x) throw ctx.httpError(404, "unknown_message", "That message is not in the inbox.");
      return x;
    },

    async route(userId, chatId) {
      const every = await identity.aliases(userId, chatId);
      if (every.length < 2) return every;
      // The other spelling of a number is only a way to find the chat, never an address to write to, unless WAHA itself reported it.
      const real = new Set((await q(`SELECT id FROM {{p}}known_ids WHERE user_id = $1 AND session = $S AND id = ANY($2::text[])`, [userId, every])).rows.map((x) => String(x.id)));
      const ids = every.filter((id, i) => i === 0 || !pnOf(id) || real.has(id));
      const last = (await q(`SELECT chat_id FROM {{p}}messages WHERE user_id = $1 AND session = $S AND chat_id = ANY($2::text[]) AND from_me = FALSE ORDER BY sent_at DESC LIMIT 1`, [userId, ids])).rows[0]?.chat_id;
      const kv = await ctx.kv.get(userId, `route:${ids[0]}`);
      const first = typeof last === "string" && ids.includes(last) ? last : typeof kv === "string" && ids.includes(kv) ? kv : ids[0];
      return [first, ...ids.filter((i) => i !== first)];
    },

    async mediaBytes(userId, msgId) {
      const x = await store.row(userId, msgId);
      const media = rec(x.media) as unknown as MediaMeta, stanza = String(x.stanza ?? "");
      if (!x.media) throw ctx.httpError(404, "no_media", "That message has no file.");
      const filename = String(media.filename ?? "");
      const hit = (await q(`SELECT mime, bytes FROM {{p}}media_blobs WHERE user_id = $1 AND session = $S AND key = $2`, [userId, "m:" + stanza])).rows[0];
      if (hit) return { mime: String(hit.mime || media.mime || "application/octet-stream"), filename, bytes: hit.bytes as Uint8Array };
      const tryUrl = async (url: unknown) => {
        if (typeof url !== "string" || !url) return null;
        try { const f = await core.wahaBytes(userId, url); return f.bytes.length ? f : null; } catch { return null; }
      };
      let f = await tryUrl(media.url);
      if (!f) {
        // WAHA dropped the file: ask it to download the message's media again.
        const fresh = rec(await core.tryWaha(userId, "GET", `/api/{session}/chats/${encodeURIComponent(String(x.chat_id))}/messages/${encodeURIComponent(String(x.msg_id))}`, { query: { downloadMedia: true } }));
        f = await tryUrl(rec(fresh.media).url);
      }
      if (!f) throw ctx.httpError(404, "media_unavailable", "This file is no longer available from WAHA. Open WhatsApp on your phone to see it.");
      const mime = media.mime || f.mime || "application/octet-stream";
      if (f.bytes.length <= MEDIA_MAX_BYTES) await putBlob(userId, "m:" + stanza, mime, f.bytes).catch(() => undefined);
      return { mime, filename, bytes: f.bytes };
    },

    async syncChats(userId, force = false) {
      const now = Date.now();
      if (!force && now - (chatsSyncedAt.get(userId) ?? 0) < CHATS_SYNC_EVERY_MS) return false;
      chatsSyncedAt.set(userId, now);
      try {
        const c = await core.config(userId);
        if (!c.base || !c.apiKey) return false;
        let list = await core.tryWaha<unknown[]>(userId, "GET", "/api/{session}/chats/overview", { query: { limit: 60, offset: 0 } });
        if (!Array.isArray(list)) list = await core.tryWaha<unknown[]>(userId, "GET", "/api/{session}/chats", { query: { limit: 60, offset: 0, sortBy: "conversationTimestamp", sortOrder: "desc" } });
        if (!Array.isArray(list)) return false;
        let changed = false, pictures = 0;
        for (const item of list) {
          const o = rec(item), id = normId(o.id);
          if (!id || id === "status@broadcast" || id.endsWith("@newsletter") || id.endsWith("@broadcast")) continue;
          const name = typeof o.name === "string" ? o.name.trim() : "";
          // WAHA falls back to the number or the id when it has no name: that is not a name.
          if (name && !name.includes("@") && !/^[+\d\s()-]+$/.test(name)) await identity.upsertContact(userId, id, { name });
          const last = rec(o.lastMessage);
          if (Object.keys(last).length) {
            const m = parseMessage({ ...last, from: last.from ?? (last.fromMe ? undefined : id), to: last.to ?? (last.fromMe ? id : undefined) }, c.session, await identity.me(userId));
            if (m && (m.chatId === id || isGroup(id) === isGroup(m.chatId))) { if ((await store.save(userId, { ...m, chatId: isGroup(id) ? id : m.chatId })) === "new") changed = true; }
          }
          if (typeof o.picture === "string" && o.picture && pictures < 12) {
            const k = (await q(`SELECT picture_at FROM {{p}}contacts WHERE user_id = $1 AND session = $S AND chat_id = $2`, [userId, id])).rows[0];
            if (!k?.picture_at || now - new Date(k.picture_at as string).getTime() > 24 * 3600_000) { pictures++; if (await identity.saveAvatar(userId, id, o.picture)) changed = true; }
          }
          const st = rec(o._chat);
          if (typeof st.archived === "boolean" || typeof st.archive === "boolean") await store.setState(userId, await identity.canonical(userId, id), { archived: st.archived === true || st.archive === true });
        }
        return changed;
      } catch { return false; }
    },

    async syncChat(userId, chatId, force = false) {
      const now = Date.now();
      if (!force && now - (chatSynced.get(userId + chatId) ?? 0) < CHAT_SYNC_EVERY_MS) return false;
      chatSynced.set(userId + chatId, now);
      if (chatSynced.size > 500) chatSynced.clear();
      try {
        const c = await core.config(userId);
        if (!c.base || !c.apiKey) return false;
        const me = await identity.me(userId);
        let changed = false;
        const acks = async () => JSON.stringify((await q(`SELECT SUM(ack)::int AS a, COUNT(*)::int AS n FROM {{p}}messages WHERE user_id = $1 AND session = $S AND chat_id = ANY($2::text[])`, [userId, await identity.aliases(userId, chatId)])).rows[0]);
        const was = await acks();
        for (const target of await store.route(userId, chatId)) {
          const list = await core.tryWaha<unknown[]>(userId, "GET", `/api/{session}/chats/${encodeURIComponent(target)}/messages`, { query: { limit: 40, downloadMedia: false } });
          if (!Array.isArray(list)) continue;
          for (const item of list) {
            const o = rec(item);
            const m = parseMessage({ ...o, from: o.from ?? (o.fromMe ? undefined : target), to: o.to ?? (o.fromMe ? target : undefined) }, c.session, me);
            if (!m) continue;
            if (!isGroup(target) && isGroup(m.chatId)) continue;
            if ((await store.save(userId, isGroup(target) ? { ...m, chatId: target } : m)) === "new") changed = true;
          }
          break;
        }
        return changed || (await acks()) !== was;
      } catch { return false; }
    },

    async setState(userId, chatId, patch) {
      const cols = ["archived", "pinned", "muted_until", "marked_unread", "cleared_at", "hidden", "labels"].filter((k) => patch[k] !== undefined);
      if (!cols.length) return;
      const vals = cols.map((k) => (k === "labels" ? JSON.stringify(patch[k]) : patch[k]));
      await q(
        `INSERT INTO {{p}}chat_state (user_id, session, chat_id, ${cols.join(", ")}) VALUES ($1,$S,$2,${cols.map((k, i) => `$${i + 3}${k === "labels" ? "::jsonb" : ""}`).join(", ")})
         ON CONFLICT (user_id, session, chat_id) DO UPDATE SET ${cols.map((k) => `${k} = EXCLUDED.${k}`).join(", ")}, updated_at = now()`, [userId, chatId, ...vals]);
    },
  };

  /** One stored row as the UI and agents see it. Never carries a WAHA URL. */
  function shape(x: Record<string, unknown>) {
    const media = x.media ? (rec(x.media) as unknown as MediaMeta) : null, extra = (x.extra ? rec(x.extra) : {}) as MessageExtra;
    const deleted = Boolean(x.deleted_at);
    const reactions = new Map<string, { emoji: string; count: number; mine: boolean; senders: string[] }>();
    for (const r of Array.isArray(x.reactions) ? (x.reactions as Array<Record<string, unknown>>) : []) {
      const e = String(r.emoji ?? ""); if (!e) continue;
      const cur = reactions.get(e) ?? { emoji: e, count: 0, mine: false, senders: [] };
      cur.count++; if (r.sender === "me") cur.mine = true; else cur.senders.push(String(r.sender ?? ""));
      reactions.set(e, cur);
    }
    let poll: Record<string, unknown> | undefined;
    if (extra.poll && !deleted) {
      const votes = Array.isArray(x.votes) ? (x.votes as Array<Record<string, unknown>>) : [];
      poll = { name: extra.poll.name, multiple: extra.poll.multiple, voters: votes.length, options: extra.poll.options.map((name) => ({
        name, votes: votes.filter((v) => Array.isArray(v.options) && (v.options as unknown[]).includes(name)).length,
        voted: votes.some((v) => v.voter === "me" && Array.isArray(v.options) && (v.options as unknown[]).includes(name)) })) };
    }
    const sender = String(x.sender_c ?? x.sender ?? "");
    return {
      id: String(x.msg_id), fromMe: x.from_me === true, sender, senderName: String(x.sender_label ?? x.sender_name ?? ""),
      body: deleted ? "" : String(x.body ?? ""), type: deleted ? "deleted" : String(x.type ?? "chat"), hasMedia: !deleted && x.has_media === true, sentAt: iso(x.sent_at),
      ack: Number(x.ack) || 0, edited: Boolean(x.edited_at), deleted, starred: x.starred === true, pinned: x.pinned === true, forwarded: extra.forwarded === true,
      media: media && !deleted ? { mime: media.mime, filename: media.filename, size: media.size ?? null, duration: media.duration ?? null, width: media.width ?? null, height: media.height ?? null, gif: media.gif === true, available: x.cached === true || (Boolean(media.url) && !media.error) } : null,
      ...(extra.location && !deleted ? { location: extra.location } : {}), ...(extra.vcards && !deleted ? { vcards: extra.vcards.map((v) => ({ name: v.name, phones: v.phones, formatted: v.phones.map((p) => formatPhone(p)) })) } : {}),
      ...(poll ? { poll } : {}), ...(extra.preview && !deleted ? { preview: extra.preview } : {}), ...(extra.mentions ? { mentions: extra.mentions } : {}), ...(extra.call ? { call: extra.call } : {}),
      reactions: [...reactions.values()],
    };
  }

  async function react(userId: string, stanza: string, sender: string, emoji: string, at: Date) {
    if (!stanza) return;
    const who = sender === "me" ? "me" : await identity.canonical(userId, sender);
    if (!emoji) await q(`DELETE FROM {{p}}reactions WHERE user_id = $1 AND session = $S AND stanza = $2 AND sender = $3`, [userId, stanza, who]);
    else await q(`INSERT INTO {{p}}reactions (user_id, session, stanza, sender, emoji, at) VALUES ($1,$S,$2,$3,$4,$5) ON CONFLICT (user_id, session, stanza, sender) DO UPDATE SET emoji = EXCLUDED.emoji, at = EXCLUDED.at`, [userId, stanza, who, emoji.slice(0, 16), at.toISOString()]);
  }
  const chatOfStanza = async (userId: string, stanza: string) => {
    const x = (await q(`SELECT chat_id FROM {{p}}messages WHERE user_id = $1 AND session = $S AND stanza = $2 LIMIT 1`, [userId, stanza])).rows[0];
    return x ? identity.canonical(userId, String(x.chat_id)) : null;
  };
  const touched = async (userId: string, stanza: string, what: string) => { const chatId = await chatOfStanza(userId, stanza); if (chatId) core.publish(userId, "message", { chatId, [what]: true }); };

  // ---- WAHA events ----
  for (const name of MESSAGE_EVENTS) core.on(name, async (userId, e: WebhookEvent) => {
    const m = parseMessage(e.payload, e.session, e.me);
    if (!m || m.chatId === "status@broadcast" || m.chatId.endsWith("@newsletter") || m.chatId.endsWith("@broadcast")) return;
    const res = await store.save(userId, m);
    const chatId = await identity.canonical(userId, m.chatId);
    if (res === "skipped") { core.publish(userId, "message", { chatId, reaction: true }); return; }
    if (res !== "new") return;
    if (m.fromMe) { core.publish(userId, "message", { chatId, fromMe: true }); return; }
    if (m.type === "system") return;
    core.publish(userId, "message", { chatId, fromMe: false, preview: m.body.slice(0, 120) });
    const st = (await q(`SELECT muted_until, archived FROM {{p}}chat_state WHERE user_id = $1 AND session = $S AND chat_id = $2`, [userId, chatId])).rows[0];
    if (st?.muted_until && new Date(st.muted_until as string).getTime() > Date.now()) return;
    let who = m.senderName || (m.senderPhone ? formatPhone(displayDigits(m.senderPhone)) : "");
    if (!who || isGroup(chatId)) {
      // A saved name beats the push name; in a group the sender is named, with the group after it.
      const known = async (id: string) => { const k = (await q(`SELECT name, push_name FROM {{p}}contacts WHERE user_id = $1 AND session = $S AND chat_id = ANY($2::text[]) ORDER BY (name <> '') DESC LIMIT 1`, [userId, await identity.aliases(userId, id)])).rows[0]; return String(k?.name || k?.push_name || ""); };
      who = who || (await known(isGroup(chatId) ? m.sender : chatId));
      if (isGroup(chatId)) { const g = await known(chatId); if (g) who = who ? `${who} in ${g}` : g; }
    }
    ctx.toast(userId, { title: `WhatsApp: ${who || "new message"}`, description: m.body.slice(0, 120) || (m.hasMedia ? "Sent a file" : m.type === "location" ? "Sent a location" : m.type === "vcard" ? "Sent a contact" : m.type === "poll" ? "Sent a poll" : "") });
  });
  for (const ackEvent of ["message.ack", "message.ack.group"]) core.on(ackEvent, async (userId, e) => {
    const p = e.payload, stanza = stanzaOf(p.id);
    const ack = Number.isFinite(Number(p.ack)) ? Math.trunc(Number(p.ack)) : ACK_NAMES[String(p.ackName ?? "").toUpperCase()];
    if (!stanza || ack === undefined) return;
    const r = await q(`UPDATE {{p}}messages SET ack = CASE WHEN $3 < 0 THEN $3 ELSE GREATEST(ack, $3) END WHERE user_id = $1 AND session = $S AND stanza = $2 AND from_me AND ack <> $3 RETURNING id`, [userId, stanza, Math.max(-1, Math.min(4, ack))]);
    if (r.rows.length) await touched(userId, stanza, "ack");
  });
  core.on("message.reaction", async (userId, e) => {
    const p = e.payload, r = rec(p.reaction), stanza = stanzaOf(r.messageId);
    const fromMe = p.fromMe === true, sender = fromMe ? "me" : normId(p.participant) || normId(p.from);
    const secs = Number(p.timestamp);
    await react(userId, stanza, sender, typeof r.text === "string" ? r.text : "", new Date(Number.isFinite(secs) && secs > 0 ? secs * (secs < 1e12 ? 1000 : 1) : Date.now()));
    await touched(userId, stanza, "reaction");
  });
  core.on("message.edited", async (userId, e) => {
    const p = e.payload, stanza = stanzaOf(p.editedMessageId ?? rec(p._data).editedMessageId ?? p.id);
    if (!stanza || typeof p.body !== "string") return;
    const r = await q(`UPDATE {{p}}messages SET body = $3, edited_at = now() WHERE user_id = $1 AND session = $S AND stanza = $2 RETURNING id`, [userId, stanza, p.body.slice(0, 8000)]);
    if (r.rows.length) await touched(userId, stanza, "edited");
  });
  core.on("message.revoked", async (userId, e) => {
    const p = e.payload, stanza = stanzaOf(p.revokedMessageId ?? rec(p.before).id ?? rec(p.after).id);
    if (!stanza) return;
    const r = await q(`UPDATE {{p}}messages SET deleted_at = now() WHERE user_id = $1 AND session = $S AND stanza = $2 AND deleted_at IS NULL RETURNING id`, [userId, stanza]);
    if (r.rows.length) await touched(userId, stanza, "deleted");
  });
  core.on("poll.vote", async (userId, e) => {
    const p = e.payload, vote = rec(p.vote), stanza = stanzaOf(rec(p.poll).id);
    if (!stanza) return;
    const voter = vote.fromMe === true ? "me" : await identity.canonical(userId, normId(vote.participant) || normId(vote.from));
    const options = (Array.isArray(vote.selectedOptions) ? vote.selectedOptions : []).filter((o): o is string => typeof o === "string").slice(0, 12);
    await q(`INSERT INTO {{p}}poll_votes (user_id, session, stanza, voter, options) VALUES ($1,$S,$2,$3,$4::jsonb) ON CONFLICT (user_id, session, stanza, voter) DO UPDATE SET options = EXCLUDED.options, at = now()`, [userId, stanza, voter, JSON.stringify(options)]);
    await touched(userId, stanza, "poll");
  });
  core.on("chat.archive", async (userId, e) => {
    const id = normId(e.payload.id);
    if (!id) return;
    await store.setState(userId, await identity.canonical(userId, id), { archived: e.payload.archived === true });
    core.publish(userId, "chats", {});
  });
  return store;
}
