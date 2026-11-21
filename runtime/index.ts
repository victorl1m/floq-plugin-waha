import { definePlugin, type PluginContext } from "../shared/sdk";
import manifest from "../plugin.json" with { type: "json" };
import { migrations } from "./migrations.js";
import { formatPhone, phoneDigits } from "../shared/phone.js";
import { CHAT_ID, TEXT_MAX, WahaError, fetchLids, lidOf, normalizeBase, parseWebhook, phoneToChatId, sendText, sessionName, stanzaOf, verifyHmac, type IdLink, type ReplyRef } from "./client.js";

/** Below the agent CLI's ~300 s request timeout. */
export const SEND_APPROVAL_WAIT_MS = 280_000;
/** Unapproved sends allowed per minute when "Always allow AI to send messages" is on. */
export const AUTO_SEND_PER_MIN = 10;
/** Loop guard only: messages the assistant may send to the user's own number per minute. */
export const ME_SEND_PER_MIN = 30;
/** How often WAHA is asked again for the phone number behind an unlinked @lid chat. */
export const LID_LOOKUP_EVERY_MS = 10 * 60_000;
/** WAHA statuses after which the other address of a merged chat is tried: the id was not accepted, nothing was sent. */
const RETRY_OTHER_ID = new Set([400, 404, 422, 500]);

/**
 * A WhatsApp inbox over the admin's own WAHA instance (install scope: one configuration, the enabling admin's API key).
 * Inbound webhooks are stored and announced; the UI and agents read the stored messages; sending from the UI is the user's click,
 * sending from an agent only happens after the user approves it in Floq.
 */
export default definePlugin({
  manifest,
  migrations,
  start(ctx: PluginContext) {
    /** The inbox belongs to the administrator who set the plugin up; nobody else on the runtime reads or sends. */
    async function owner(userId: string): Promise<string> {
      const o = await ctx.installOwner();
      if (!o || o !== userId) throw ctx.httpError(403, "forbidden", "The WhatsApp inbox belongs to the administrator who set it up.");
      return o;
    }

    async function config(userId: string) {
      const settings = await ctx.settings.get(userId);
      const base = normalizeBase(settings.baseUrl);
      const apiKey = await ctx.secrets.getInstall("WAHA_API_KEY");
      const missingSettings = base ? [] : ["baseUrl"];
      const missingSecrets = apiKey ? [] : ["WAHA_API_KEY"];
      return { base, apiKey, session: sessionName(settings.session), missingSettings, missingSecrets };
    }

    const chatIdOf = (v: unknown) => { if (typeof v !== "string" || !CHAT_ID.test(v)) throw ctx.httpError(400, "invalid_chat", "chatId is invalid"); return v; };
    const textOf = (v: unknown) => { if (typeof v !== "string" || !v.trim() || v.length > TEXT_MAX) throw ctx.httpError(400, "invalid_text", `text must be 1-${TEXT_MAX} characters`); return v; };
    const asObject = (b: unknown): Record<string, unknown> => (b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : {});

    const kindOf = (id: string): "user" | "group" | "other" => (id.endsWith("@g.us") ? "group" : /@(c\.us|s\.whatsapp\.net|lid)$/.test(id) ? "user" : "other");
    const digitsOf = (id: string): string | null => { const m = /^(\d{8,15})@(c\.us|s\.whatsapp\.net)$/.exec(id); return m ? m[1] : null; };

    // One contact can be addressed as "<phone>@c.us" and as "<n>@lid". {{p}}lid_map holds the known pairs; every read below folds a lid into its phone id
    // (the canonical chat), while rows keep the id they arrived with, so read marks and unread counts stay exact per address.
    const CID = `COALESCE(lm.pn, m.chat_id)`;
    const MSGS = `SELECT m.*, ${CID} AS cid FROM {{p}}messages m LEFT JOIN {{p}}lid_map lm ON lm.user_id = m.user_id AND lm.lid = m.chat_id WHERE m.user_id = $1`;

    async function link(userId: string, links: IdLink[]) {
      for (const l of links) {
        await ctx.db.query(
          `INSERT INTO {{p}}lid_map (user_id, lid, pn) VALUES ($1,$2,$3) ON CONFLICT (user_id, lid) DO UPDATE SET pn = EXCLUDED.pn, updated_at = now()`, [userId, l.lid, l.pn]);
      }
    }
    /** The canonical chat of an id and every address stored under it (canonical first). */
    async function aliases(userId: string, chatId: string): Promise<string[]> {
      if (chatId.endsWith("@g.us")) return [chatId];
      const r = await ctx.db.query(`SELECT lid, pn FROM {{p}}lid_map WHERE user_id = $1 AND (lid = $2 OR pn = $2)`, [userId, chatId]);
      const rows = r.rows.filter((x) => typeof x.lid === "string" && typeof x.pn === "string") as Array<{ lid: string; pn: string }>;
      const canonical = rows.find((x) => x.lid === chatId)?.pn ?? chatId;
      return [canonical, ...new Set(rows.filter((x) => x.pn === canonical).map((x) => x.lid).concat(chatId).filter((id) => id !== canonical))];
    }

    const lidLookups = new Map<string, number>();
    let lidListAt = 0;
    /** Asks WAHA for the phone numbers behind @lid chats that have none yet: the whole list once, then single lookups, at most every LID_LOOKUP_EVERY_MS. Never throws. */
    async function resolveLids(userId: string, lids: string[]): Promise<boolean> {
      const now = Date.now();
      const due = lids.filter((l) => now - (lidLookups.get(l) ?? 0) > LID_LOOKUP_EVERY_MS).slice(0, 5);
      if (!due.length) return false;
      for (const l of due) lidLookups.set(l, now);
      try {
        const c = await config(userId);
        if (c.missingSettings.length || c.missingSecrets.length) return false;
        const found: IdLink[] = [];
        if (now - lidListAt > LID_LOOKUP_EVERY_MS) { lidListAt = now; found.push(...await fetchLids(ctx.fetchUserUrl, userId, c.base!, c.apiKey!, c.session)); }
        for (const l of due) if (!found.some((f) => f.lid === l)) found.push(...await fetchLids(ctx.fetchUserUrl, userId, c.base!, c.apiKey!, c.session, l));
        if (!found.length) return false;
        await link(userId, found);
        return found.some((f) => due.includes(f.lid));
      } catch { return false; }
    }

    async function queryChats(userId: string) {
      return ctx.db.query(
        `WITH msgs AS (${MSGS}),
         agg AS (SELECT cid, MAX(sent_at) AS last_at, COUNT(*)::int AS total FROM msgs GROUP BY cid ORDER BY MAX(sent_at) DESC LIMIT 100)
         SELECT a.cid AS chat_id, a.last_at, a.total, l.body AS last_body, l.from_me AS last_from_me, l.has_media AS last_has_media, c.name AS name, c.phone AS phone,
                (SELECT COUNT(*)::int FROM msgs u LEFT JOIN {{p}}chat_reads r ON r.user_id = $1 AND r.chat_id = u.chat_id
                  WHERE u.cid = a.cid AND u.from_me = FALSE AND (r.read_at IS NULL OR u.created_at > r.read_at)) AS unread
           FROM agg a
           LEFT JOIN LATERAL (SELECT body, from_me, has_media FROM msgs WHERE cid = a.cid ORDER BY sent_at DESC, id DESC LIMIT 1) l ON TRUE
           LEFT JOIN LATERAL (SELECT name, phone FROM {{p}}contacts k WHERE k.user_id = $1 AND (k.chat_id = a.cid OR k.chat_id IN (SELECT lid FROM {{p}}lid_map WHERE user_id = $1 AND pn = a.cid))
                               ORDER BY (k.name <> '') DESC, k.updated_at DESC LIMIT 1) c ON TRUE
          ORDER BY a.last_at DESC`, [userId]);
    }

    async function listChats(userId: string) {
      let r = await queryChats(userId);
      const unlinked = r.rows.map((x) => lidOf(x.chat_id)).filter((x): x is string => x !== null);
      if (unlinked.length && await resolveLids(userId, unlinked)) r = await queryChats(userId);
      return { chats: r.rows.map((x) => {
        const chatId = String(x.chat_id);
        return {
          chatId, kind: kindOf(chatId), name: x.name ? String(x.name) : null, phone: digitsOf(chatId) ?? (x.phone ? String(x.phone) : null),
          lastBody: String(x.last_body ?? "").slice(0, 200), lastFromMe: x.last_from_me === true, lastHasMedia: x.last_has_media === true,
          lastAt: new Date(x.last_at as string).toISOString(), total: Number(x.total) || 0, unread: Number(x.unread) || 0,
        };
      }) };
    }

    async function listMessages(userId: string, chatId: string, limit: unknown) {
      const n = Math.min(200, Math.max(1, Number.parseInt(String(limit ?? "50"), 10) || 50));
      const ids = await aliases(userId, chatId);
      const r = await ctx.db.query(
        `SELECT t.msg_id, t.from_me, COALESCE(sm.pn, t.sender) AS sender, t.sender_name, t.body, t.has_media, t.sent_at, t.reply_to, t.reply_body, COALESCE(rm.pn, t.reply_sender) AS reply_sender, t.reply_media FROM (
           SELECT * FROM {{p}}messages WHERE user_id = $1 AND chat_id = ANY($2::text[]) ORDER BY sent_at DESC, id DESC LIMIT $3) t
           LEFT JOIN {{p}}lid_map sm ON sm.user_id = $1 AND sm.lid = t.sender
           LEFT JOIN {{p}}lid_map rm ON rm.user_id = $1 AND rm.lid = t.reply_sender
          ORDER BY t.sent_at ASC, t.id ASC`, [userId, ids, n]);
      const rows = r.rows.map((x) => ({ id: String(x.msg_id), fromMe: x.from_me === true, sender: String(x.sender ?? ""), senderName: String(x.sender_name ?? ""), body: String(x.body ?? ""), hasMedia: x.has_media === true, sentAt: new Date(x.sent_at as string).toISOString(), row: x }));
      // A quote points at the original when it is on this page (so the UI can jump to it); otherwise it shows what the reply itself carried.
      const byStanza = new Map(rows.map((m) => [stanzaOf(m.id), m]));
      return { messages: rows.map(({ row, ...m }) => {
        const ref = typeof row.reply_to === "string" && row.reply_to ? row.reply_to : "";
        if (!ref) return { ...m, replyTo: null };
        const o = byStanza.get(ref);
        const sender = o ? o.sender : String(row.reply_sender ?? "");
        return { ...m, replyTo: {
          id: o ? o.id : "", body: (o ? o.body : String(row.reply_body ?? "")).slice(0, 400), hasMedia: o ? o.hasMedia : row.reply_media === true,
          fromMe: o ? o.fromMe : sender === "me", sender: sender === "me" ? "" : sender, senderName: o ? o.senderName : "",
        } };
      }) };
    }

    async function markRead(userId: string, chatId: string) {
      for (const id of await aliases(userId, chatId)) {
        await ctx.db.query(
          `INSERT INTO {{p}}chat_reads (user_id, chat_id, read_at) VALUES ($1,$2,now()) ON CONFLICT (user_id, chat_id) DO UPDATE SET read_at = now()`, [userId, id]);
      }
    }

    async function upsertContact(userId: string, chatId: string, name: string, phone: string) {
      if (!name && !phone) return;
      await ctx.db.query(
        `INSERT INTO {{p}}contacts (user_id, chat_id, name, phone) VALUES ($1,$2,$3,$4)
         ON CONFLICT (user_id, chat_id) DO UPDATE SET name = CASE WHEN EXCLUDED.name <> '' THEN EXCLUDED.name ELSE {{p}}contacts.name END,
           phone = CASE WHEN EXCLUDED.phone <> '' THEN EXCLUDED.phone ELSE {{p}}contacts.phone END, updated_at = now()`, [userId, chatId, name, phone]);
    }

    async function store(userId: string, m: { session: string; chatId: string; msgId: string; fromMe: boolean; sender: string; senderName: string; body: string; hasMedia: boolean; sentAt: Date; reply?: ReplyRef | null }): Promise<boolean> {
      const q = m.reply ?? null;
      const r = await ctx.db.query(
        `INSERT INTO {{p}}messages (user_id, session, chat_id, msg_id, from_me, sender, sender_name, body, has_media, sent_at, reply_to, reply_body, reply_sender, reply_media) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (session, msg_id) DO NOTHING RETURNING id`, [userId, m.session, m.chatId, m.msgId, m.fromMe, m.sender, m.senderName, m.body, m.hasMedia, m.sentAt.toISOString(), q?.id ?? "", q?.body ?? "", q?.sender ?? "", q?.hasMedia ?? false]);
      return r.rowCount > 0;
    }

    /** The stored message a reply quotes: it must belong to the same (merged) chat. Null when there is none. */
    async function quoted(userId: string, ids: string[], replyTo: unknown): Promise<{ msgId: string; ref: ReplyRef } | null> {
      if (replyTo === undefined || replyTo === null || replyTo === "") return null;
      if (typeof replyTo !== "string" || replyTo.length > 200) throw ctx.httpError(400, "invalid_reply", "replyTo is not a message of this chat");
      const r = await ctx.db.query(`SELECT msg_id, from_me, sender, body, has_media FROM {{p}}messages WHERE user_id = $1 AND chat_id = ANY($2::text[]) AND msg_id = $3 LIMIT 1`, [userId, ids, replyTo]);
      const x = r.rows.find((row) => row.msg_id === replyTo);
      if (!x) throw ctx.httpError(400, "invalid_reply", "replyTo is not a message of this chat");
      // A message WAHA gave no id for cannot be quoted on WhatsApp.
      if (replyTo.startsWith("out-")) throw ctx.httpError(400, "invalid_reply", "This message cannot be quoted yet.");
      return { msgId: replyTo, ref: { id: stanzaOf(replyTo), body: String(x.body ?? "").slice(0, 400), sender: x.from_me === true ? "me" : String(x.sender ?? ""), hasMedia: x.has_media === true } };
    }

    /** Sends through WAHA and records the outgoing message. A merged chat is tried on the address that worked last, then on its other one. Errors are generic: never the key, the URL or upstream text. */
    async function send(userId: string, chatId: string, text: string, replyTo?: unknown) {
      const c = await config(userId);
      if (c.missingSettings.length || c.missingSecrets.length) throw ctx.httpError(409, "not_configured", "Set the WAHA address and the WAHA_API_KEY secret first.");
      const ids = await aliases(userId, chatId);
      const q = await quoted(userId, ids, replyTo);
      const routeKey = `route:${ids[0]}`;
      const last = ids.length > 1 ? await ctx.kv.get(userId, routeKey) : undefined;
      const order = typeof last === "string" && ids.includes(last) ? [last, ...ids.filter((i) => i !== last)] : ids;
      let id: string | null = null, used = order[0], failure = 0, sent = false;
      for (const target of order) {
        try { id = await sendText(ctx.fetchUserUrl, userId, c.base!, c.apiKey!, c.session, target, text, q?.msgId); used = target; sent = true; break; }
        catch (error) { failure = error instanceof WahaError ? error.status : 0; if (!RETRY_OTHER_ID.has(failure)) break; }
      }
      if (!sent) { ctx.log.warn("send failed", { status: failure }); throw ctx.httpError(502, "waha_unavailable", "WAHA could not send the message."); }
      if (ids.length > 1 && used !== last) await ctx.kv.set(userId, routeKey, used);
      const msgId = id ?? `out-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await store(userId, { session: c.session, chatId: used, msgId, fromMe: true, sender: "me", senderName: "", body: text, hasMedia: false, sentAt: new Date(), reply: q?.ref });
      await markRead(userId, ids[0]);
      ctx.events.publish(userId, "message", { chatId: ids[0], fromMe: true });
      return { status: "sent" as const, id: msgId };
    }

    // ---- the inbox view (routes run as the calling user; click = consent) ----
    ctx.routes.get("/status", async ({ userId }) => {
      await owner(userId);
      const c = await config(userId);
      return { configured: !c.missingSettings.length && !c.missingSecrets.length, missingSettings: c.missingSettings, missingSecrets: c.missingSecrets, session: c.session };
    });
    ctx.routes.get("/chats", async ({ userId }) => { await owner(userId); return listChats(userId); });
    ctx.routes.get("/messages", async ({ userId, query }) => { await owner(userId); return listMessages(userId, chatIdOf(query.chatId), query.limit); });
    ctx.routes.post("/read", async ({ userId, body }) => { await owner(userId); await markRead(userId, chatIdOf(asObject(body).chatId)); return { ok: true }; });
    ctx.routes.post("/send", async ({ userId, body }) => {
      await owner(userId);
      const b = asObject(body);
      return send(userId, chatIdOf(b.chatId), textOf(b.text), b.replyTo);
    });

    /** Saved from the settings panel's formatted phone field (kv), else the older text setting. */
    async function savedPhone(userId: string): Promise<unknown> {
      const v = await ctx.kv.get(userId, "phone");
      return typeof v === "string" && v ? v : (await ctx.settings.get(userId)).assistantPhone;
    }
    ctx.routes.get("/phone", async ({ userId }) => {
      await owner(userId);
      const digits = phoneDigits(await savedPhone(userId));
      return { phone: digits ? `+${digits}` : null, formatted: digits ? formatPhone(digits) : null };
    });
    ctx.routes.post("/phone", async ({ userId, body }) => {
      await owner(userId);
      const raw = asObject(body).phone;
      if (raw === "" || raw === null) { await ctx.kv.set(userId, "phone", ""); return { phone: null, formatted: null }; }
      const digits = phoneDigits(raw);
      if (!digits) throw ctx.httpError(400, "invalid_phone", "Pick the country and type the number, for example (11) 99999-9999.");
      await ctx.kv.set(userId, "phone", `+${digits}`);
      return { phone: `+${digits}`, formatted: formatPhone(digits) };
    });

    /** The user's own number from settings (null when unset or invalid). `override` lets the settings panel test a number before it is saved. */
    async function ownChat(userId: string, override?: unknown) {
      const raw = override !== undefined && override !== "" ? override : await savedPhone(userId);
      if (raw === undefined || raw === null || raw === "") return null;
      const chatId = phoneToChatId(raw);
      if (!chatId) throw ctx.httpError(400, "invalid_phone", "Use international format: + followed by 8 to 15 digits, for example +5511999999999.");
      return chatId;
    }
    /** "Let the AI message me freely": on unless explicitly turned off (a saved number is what enables it). */
    const messageMeOn = (s: Record<string, unknown>) => s.messageMe !== false;
    /** Messages the assistant sends to the user's own number: loop guard only. */
    const meSent: number[] = [];
    /** Sends that skipped approval under "Always allow": at most AUTO_SEND_PER_MIN per minute, then approval is required again. */
    const autoSent: number[] = [];

    ctx.routes.post("/test-message", async ({ userId, body }) => {
      await owner(userId);
      const chatId = await ownChat(userId, asObject(body).phone);
      if (!chatId) throw ctx.httpError(400, "no_phone", "Enter your WhatsApp number first.");
      return send(userId, chatId, "Floq test message: your assistant can reach you on this number.");
    });
    ctx.routes.get("/settings-status", async ({ userId }) => {
      await owner(userId);
      const s = await ctx.settings.get(userId);
      return { alwaysAllowSend: s.alwaysAllowSend === true, assistantPhoneSet: phoneToChatId(await savedPhone(userId)) !== null, messageMe: messageMeOn(s) };
    });

    // ---- agents (`floq plugin call waha ...`): reads are free, a send needs the user's approval first ----
    ctx.internalRoutes.call("/chats", async ({ userId }) => { await owner(userId); return listChats(userId); });
    ctx.internalRoutes.call("/messages", async ({ userId, body }) => { await owner(userId); const b = asObject(body); return listMessages(userId, chatIdOf(b.chatId), b.limit); });
    ctx.internalRoutes.call("/send", async ({ userId, body, signal }) => {
      await owner(userId);
      const b = asObject(body);
      const chatId = chatIdOf(b.chatId), text = textOf(b.text), replyTo = b.replyTo;
      // The CLI's HTTP request gives up after ~5 minutes: wait less than that, and withdraw the approval if the agent goes away first,
      // so a message can never be sent after the agent saw a failure (which invites a retry and a second message).
      // Opt-in setting (off by default, set by the administrator): skip the per-message approval.
      // Capped at AUTO_SEND_PER_MIN per minute: past that (a loop, or instructions injected through inbound messages) each send asks the user again.
      if ((await ctx.settings.get(userId)).alwaysAllowSend === true) {
        const now = Date.now();
        while (autoSent.length && now - autoSent[0] > 60_000) autoSent.shift();
        if (autoSent.length < AUTO_SEND_PER_MIN) { autoSent.push(now); return send(userId, chatId, text, replyTo); }
      }
      const decision = await ctx.approvals.request({ userId, action: `Send WhatsApp message to ${chatId}`, detail: text.slice(0, 900), signal, timeoutMs: SEND_APPROVAL_WAIT_MS });
      if (signal?.aborted) return { status: "expired" };
      if (decision !== "approved") return { status: decision };
      return send(userId, chatId, text, replyTo);
    });

    // The assistant messaging the user's own saved number: no approval, the recipient is the user and they opted in by saving the number.
    ctx.internalRoutes.call("/message-me", async ({ userId, body }) => {
      await owner(userId);
      const text = textOf(asObject(body).text);
      const s = await ctx.settings.get(userId);
      const chatId = await ownChat(userId);
      if (!chatId) throw ctx.httpError(409, "no_phone", "The user has not saved their WhatsApp number in the WAHA plugin settings.");
      if (!messageMeOn(s)) throw ctx.httpError(409, "message_me_off", "The user turned off \"Let the AI message me freely\" in the WAHA plugin settings.");
      const now = Date.now();
      while (meSent.length && now - meSent[0] > 60_000) meSent.shift();
      if (meSent.length >= ME_SEND_PER_MIN) throw ctx.httpError(429, "rate_limited", `More than ${ME_SEND_PER_MIN} messages in a minute to the user's number; this limit only guards against loops. Wait a minute.`);
      meSent.push(now);
      await send(userId, chatId, text);
      return { status: "sent" };
    });
    ctx.internalRoutes.call("/me", async ({ userId }) => { await owner(userId); const s = await ctx.settings.get(userId); return { canMessageMe: phoneToChatId(await savedPhone(userId)) !== null && messageMeOn(s), sendNeedsApproval: s.alwaysAllowSend !== true }; });

    // ---- inbound: WAHA posts events here (token in the path, optional HMAC) ----
    ctx.webhooks.on("events", async (req) => {
      const msg = parseWebhook(req.json());
      if (!msg) return { ok: true };
      const o = await ctx.installOwner();
      if (!o) return { ok: true, ignored: true };
      if (msg.session !== sessionName((await ctx.settings.get(o)).session)) return { ok: true, ignored: true };
      if (msg.links.length) await link(o, msg.links);
      const inserted = await store(o, msg);
      if (!msg.fromMe && !msg.chatId.endsWith("@g.us")) await upsertContact(o, msg.chatId, msg.senderName, msg.senderPhone);
      if (inserted && !msg.fromMe) {
        // The UI knows a merged chat by its canonical (phone) id.
        ctx.events.publish(o, "message", { chatId: (await aliases(o, msg.chatId))[0], fromMe: false, preview: msg.body.slice(0, 120) });
        ctx.toast(o, { title: `WhatsApp: ${msg.senderName || (msg.senderPhone ? formatPhone(msg.senderPhone) : "") || "new message"}`, description: msg.body.slice(0, 120) || (msg.hasMedia ? "Sent a file" : "") });
      }
      return { ok: true };
    }, {
      // With WAHA_WEBHOOK_HMAC set, an unsigned or wrongly signed event is refused (401).
      verify: async (req) => {
        const key = await ctx.secrets.getInstall("WAHA_WEBHOOK_HMAC");
        return key ? verifyHmac(req.rawBody, req.headers, key) : true;
      },
    });
  },
});
