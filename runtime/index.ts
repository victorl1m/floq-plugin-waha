import { definePlugin, type PluginContext } from "../shared/sdk";
import manifest from "../plugin.json" with { type: "json" };
import { migrations } from "./migrations.js";
import { CHAT_ID, TEXT_MAX, WahaError, normalizeBase, parseWebhook, phoneToChatId, sendText, sessionName, verifyHmac } from "./client.js";

/** Below the agent CLI's ~300 s request timeout. */
export const SEND_APPROVAL_WAIT_MS = 280_000;

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

    async function listChats(userId: string) {
      const r = await ctx.db.query(
        `SELECT chat_id, MAX(sent_at) AS last_at, COUNT(*)::int AS total, (ARRAY_AGG(body ORDER BY sent_at DESC))[1] AS last_body
           FROM {{p}}messages WHERE user_id = $1 GROUP BY chat_id ORDER BY MAX(sent_at) DESC LIMIT 100`, [userId]);
      return { chats: r.rows.map((x) => ({ chatId: x.chat_id, lastBody: String(x.last_body ?? "").slice(0, 200), lastAt: new Date(x.last_at as string).toISOString(), total: x.total })) };
    }

    async function listMessages(userId: string, chatId: string, limit: unknown) {
      const n = Math.min(200, Math.max(1, Number.parseInt(String(limit ?? "50"), 10) || 50));
      const r = await ctx.db.query(
        `SELECT msg_id, from_me, sender, body, has_media, sent_at FROM (
           SELECT * FROM {{p}}messages WHERE user_id = $1 AND chat_id = $2 ORDER BY sent_at DESC, id DESC LIMIT $3) t ORDER BY sent_at ASC, id ASC`, [userId, chatId, n]);
      return { messages: r.rows.map((x) => ({ id: x.msg_id, fromMe: x.from_me, sender: x.sender, body: x.body, hasMedia: x.has_media, sentAt: new Date(x.sent_at as string).toISOString() })) };
    }

    async function store(userId: string, m: { session: string; chatId: string; msgId: string; fromMe: boolean; sender: string; body: string; hasMedia: boolean; sentAt: Date }): Promise<boolean> {
      const r = await ctx.db.query(
        `INSERT INTO {{p}}messages (user_id, session, chat_id, msg_id, from_me, sender, body, has_media, sent_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (session, msg_id) DO NOTHING RETURNING id`, [userId, m.session, m.chatId, m.msgId, m.fromMe, m.sender, m.body, m.hasMedia, m.sentAt.toISOString()]);
      return r.rowCount > 0;
    }

    /** Sends through WAHA and records the outgoing message. Errors are generic: never the key, the URL or upstream text. */
    async function send(userId: string, chatId: string, text: string) {
      const c = await config(userId);
      if (c.missingSettings.length || c.missingSecrets.length) throw ctx.httpError(409, "not_configured", "Set the WAHA address and the WAHA_API_KEY secret first.");
      let id: string | null;
      try { id = await sendText(ctx.fetchUserUrl, userId, c.base!, c.apiKey!, c.session, chatId, text); }
      catch (error) { ctx.log.warn("send failed", { status: error instanceof WahaError ? error.status : 0 }); throw ctx.httpError(502, "waha_unavailable", "WAHA could not send the message."); }
      const msgId = id ?? `out-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await store(userId, { session: c.session, chatId, msgId, fromMe: true, sender: "me", body: text, hasMedia: false, sentAt: new Date() });
      ctx.events.publish(userId, "message", { chatId, fromMe: true });
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
    ctx.routes.post("/send", async ({ userId, body }) => {
      await owner(userId);
      const b = asObject(body);
      return send(userId, chatIdOf(b.chatId), textOf(b.text));
    });

    /** The user's own number from settings (null when unset or invalid). `override` lets the settings panel test a number before it is saved. */
    async function ownChat(userId: string, override?: unknown) {
      const raw = override !== undefined && override !== "" ? override : (await ctx.settings.get(userId)).assistantPhone;
      if (raw === undefined || raw === null || raw === "") return null;
      const chatId = phoneToChatId(raw);
      if (!chatId) throw ctx.httpError(400, "invalid_phone", "Use international format: + followed by 8 to 15 digits, for example +5511999999999.");
      return chatId;
    }
    /** Messages the assistant sends to the user's own number: at most 10 per minute. */
    const meSent: number[] = [];

    ctx.routes.post("/test-message", async ({ userId, body }) => {
      await owner(userId);
      const chatId = await ownChat(userId, asObject(body).phone);
      if (!chatId) throw ctx.httpError(400, "no_phone", "Enter your WhatsApp number first.");
      return send(userId, chatId, "Floq test message: your assistant can reach you on this number.");
    });
    ctx.routes.get("/settings-status", async ({ userId }) => {
      await owner(userId);
      const s = await ctx.settings.get(userId);
      return { alwaysAllowSend: s.alwaysAllowSend === true, assistantPhoneSet: phoneToChatId(s.assistantPhone) !== null };
    });

    // ---- agents (`floq plugin call waha ...`): reads are free, a send needs the user's approval first ----
    ctx.internalRoutes.call("/chats", async ({ userId }) => { await owner(userId); return listChats(userId); });
    ctx.internalRoutes.call("/messages", async ({ userId, body }) => { await owner(userId); const b = asObject(body); return listMessages(userId, chatIdOf(b.chatId), b.limit); });
    ctx.internalRoutes.call("/send", async ({ userId, body, signal }) => {
      await owner(userId);
      const b = asObject(body);
      const chatId = chatIdOf(b.chatId), text = textOf(b.text);
      // The CLI's HTTP request gives up after ~5 minutes: wait less than that, and withdraw the approval if the agent goes away first,
      // so a message can never be sent after the agent saw a failure (which invites a retry and a second message).
      // Opt-in setting (off by default, set by the administrator): skip the per-message approval.
      if ((await ctx.settings.get(userId)).alwaysAllowSend === true) return send(userId, chatId, text);
      const decision = await ctx.approvals.request({ userId, action: `Send WhatsApp message to ${chatId}`, detail: text.slice(0, 900), signal, timeoutMs: SEND_APPROVAL_WAIT_MS });
      if (signal?.aborted) return { status: "expired" };
      if (decision !== "approved") return { status: decision };
      return send(userId, chatId, text);
    });

    // The assistant messaging the user's own configured number: no approval, the recipient is the user and they opted in by saving the number.
    ctx.internalRoutes.call("/message-me", async ({ userId, body }) => {
      await owner(userId);
      const text = textOf(asObject(body).text);
      const chatId = await ownChat(userId);
      if (!chatId) throw ctx.httpError(409, "no_phone", "The user has not set their WhatsApp number in the WAHA plugin settings.");
      const now = Date.now();
      while (meSent.length && now - meSent[0] > 60_000) meSent.shift();
      if (meSent.length >= 10) throw ctx.httpError(429, "rate_limited", "Too many messages to the user's number; wait a minute.");
      meSent.push(now);
      return send(userId, chatId, text);
    });
    ctx.internalRoutes.call("/me", async ({ userId }) => { await owner(userId); const s = await ctx.settings.get(userId); return { canMessageMe: phoneToChatId(s.assistantPhone) !== null, sendNeedsApproval: s.alwaysAllowSend !== true }; });

    // ---- inbound: WAHA posts events here (token in the path, optional HMAC) ----
    ctx.webhooks.on("events", async (req) => {
      const msg = parseWebhook(req.json());
      if (!msg) return { ok: true };
      const o = await ctx.installOwner();
      if (!o) return { ok: true, ignored: true };
      if (msg.session !== sessionName((await ctx.settings.get(o)).session)) return { ok: true, ignored: true };
      const inserted = await store(o, msg);
      if (inserted && !msg.fromMe) {
        ctx.events.publish(o, "message", { chatId: msg.chatId, fromMe: false, preview: msg.body.slice(0, 120) });
        ctx.toast(o, { title: `WhatsApp: ${msg.sender}`, description: msg.body.slice(0, 120) || (msg.hasMedia ? "Sent a file" : "") });
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
