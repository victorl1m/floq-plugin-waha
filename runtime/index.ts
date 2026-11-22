import { definePlugin, type PluginContext } from "../shared/sdk";
import manifest from "../plugin.json" with { type: "json" };
import { migrations } from "./migrations.js";
import { formatPhone, phoneDigits } from "../shared/phone.js";
import { WahaError, phoneToChatId, verifyHmac } from "./client.js";
import { createCore } from "./core.js";
import { createIdentity } from "./identity.js";
import { createStore } from "./messages.js";
import { createInbox } from "./inbox.js";
import { parseEnvelope } from "./parse.js";
import { displayDigits } from "./ids.js";
import { featuresOf } from "../shared/features.js";
import { registerExtras } from "./extras.js";

/** Below the agent CLI's ~300 s request timeout. */
export const SEND_APPROVAL_WAIT_MS = 280_000;
/** Unapproved sends allowed per minute when "Always allow AI to send messages" is on. */
export const AUTO_SEND_PER_MIN = 10;
/** Loop guard only: messages the assistant may send to the user's own number per minute. */
export const ME_SEND_PER_MIN = 30;

/**
 * A WhatsApp inbox over the admin's own WAHA instance (install scope: one configuration, the enabling admin's API key).
 * WAHA events are stored and announced; the UI and agents read the stored messages; anything the UI sends is the user's click,
 * anything an agent sends to other people only happens after the user approves it in Floq.
 */
let running: ReturnType<typeof createCore> | null = null;

export default definePlugin({
  manifest,
  migrations,
  /** Waits for background work (history sync, media downloads) to finish. */
  async stop() { await running?.idle(); },
  start(ctx: PluginContext) {
    const core = createCore(ctx);
    running = core;
    /** Saved from the settings panel's formatted phone field (kv), else the older text setting. */
    async function savedPhone(userId: string): Promise<unknown> {
      const v = await ctx.kv.get(userId, "phone");
      return typeof v === "string" && v ? v : (await ctx.settings.get(userId)).assistantPhone;
    }
    const identity = createIdentity(core, savedPhone);
    const store = createStore(core, identity);
    const inbox = createInbox(core, identity, store);
    registerExtras({ core, identity, store, inbox });
    const { owner } = core;
    const asObject = core.obj;

    // ---- the inbox view (routes run as the calling user; click = consent) ----
    ctx.routes.get("/status", async ({ userId }) => {
      await owner(userId);
      const c = await core.config(userId);
      const configured = !c.missingSettings.length && !c.missingSecrets.length;
      const me = await identity.me(userId);
      const engine = configured ? await core.engine(userId) : "";
      return { configured, missingSettings: c.missingSettings, missingSecrets: c.missingSecrets, session: c.session, engine, features: featuresOf(engine), me: me ? { name: me.name, phone: displayDigits(me.id.split("@")[0]) } : null };
    });

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
      // The saved number is "you": find its real WhatsApp address and its lid now.
      await identity.seen(userId, `${digits}@c.us`, false);
      core.bg(identity.ensure(userId, true));
      return { phone: `+${digits}`, formatted: formatPhone(digits) };
    });

    /** The user's own number from settings (null when unset or invalid). `override` lets the settings panel test a number before it is saved. */
    async function ownChat(userId: string, override?: unknown) {
      const raw = override !== undefined && override !== "" ? override : await savedPhone(userId);
      if (raw === undefined || raw === null || raw === "") return null;
      const chatId = phoneToChatId(raw);
      if (!chatId) throw ctx.httpError(400, "invalid_phone", "Use international format: + followed by 8 to 15 digits, for example +5511999999999.");
      await identity.seen(userId, chatId, false);
      return identity.canonical(userId, chatId);
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
      return inbox.sendText(userId, chatId, "Floq test message: your assistant can reach you on this number.");
    });
    ctx.routes.get("/settings-status", async ({ userId }) => {
      await owner(userId);
      const s = await ctx.settings.get(userId);
      return { alwaysAllowSend: s.alwaysAllowSend === true, assistantPhoneSet: phoneToChatId(await savedPhone(userId)) !== null, messageMe: messageMeOn(s) };
    });

    // ---- agents (`floq plugin call waha ...`): reads are free, anything outward to other people needs the user's approval first ----
    const A = ctx.internalRoutes;
    /** True when the chat is the user themself (their own saved number or the account's own chat): no approval needed there. */
    const isSelf = async (userId: string, chatId: string) => (await identity.selfIds(userId)).has(await identity.canonical(userId, chatId));
    /**
     * Gate for an agent's outward action. The CLI's HTTP request gives up after ~5 minutes: wait less than that, and withdraw the approval if the agent
     * goes away first, so nothing is sent after the agent saw a failure (which invites a retry and a second message).
     * "Always allow" (off by default) skips the question, capped at AUTO_SEND_PER_MIN per minute: past that each one asks again.
     */
    async function approved(userId: string, action: string, detail: string, signal?: AbortSignal): Promise<"approved" | "denied" | "expired"> {
      if ((await ctx.settings.get(userId)).alwaysAllowSend === true) {
        const now = Date.now();
        while (autoSent.length && now - autoSent[0] > 60_000) autoSent.shift();
        if (autoSent.length < AUTO_SEND_PER_MIN) { autoSent.push(now); return "approved"; }
      }
      const decision = await ctx.approvals.request({ userId, action, detail: detail.slice(0, 900), signal, timeoutMs: SEND_APPROVAL_WAIT_MS });
      return signal?.aborted ? "expired" : decision;
    }
    function meGuard() {
      const now = Date.now();
      while (meSent.length && now - meSent[0] > 60_000) meSent.shift();
      if (meSent.length >= ME_SEND_PER_MIN) throw ctx.httpError(429, "rate_limited", `More than ${ME_SEND_PER_MIN} messages in a minute to the user's number; this limit only guards against loops. Wait a minute.`);
      meSent.push(now);
    }
    async function meChat(userId: string) {
      const s = await ctx.settings.get(userId);
      const chatId = await ownChat(userId);
      if (!chatId) throw ctx.httpError(409, "no_phone", "The user has not saved their WhatsApp number in the WAHA plugin settings.");
      if (!messageMeOn(s)) throw ctx.httpError(409, "message_me_off", "The user turned off \"Let the AI message me freely\" in the WAHA plugin settings.");
      return chatId;
    }

    A.call("/chats", async ({ userId, body }) => { await owner(userId); await identity.ensure(userId); return store.listChats(userId, { archived: asObject(body).archived === true }); });
    A.call("/messages", async ({ userId, body }) => { await owner(userId); const b = asObject(body); return store.listMessages(userId, core.chatId(b.chatId), { limit: b.limit, before: b.before, q: b.search, sync: false }); });
    A.call("/send", async ({ userId, body, signal }) => {
      await owner(userId);
      const b = asObject(body);
      const chatId = core.chatId(b.chatId), text = core.text(b.text), replyTo = b.replyTo;
      const decision = await approved(userId, `Send WhatsApp message to ${chatId}`, text, signal);
      if (decision !== "approved") return { status: decision };
      return inbox.sendText(userId, chatId, text, replyTo);
    });
    // The assistant messaging the user's own saved number: no approval, the recipient is the user and they opted in by saving the number.
    A.call("/message-me", async ({ userId, body }) => {
      await owner(userId);
      const text = core.text(asObject(body).text);
      const chatId = await meChat(userId);
      meGuard();
      await inbox.sendText(userId, chatId, text);
      return { status: "sent" };
    });
    // A file (image, document, audio) to the user's own number: same rule as message-me.
    A.call("/send-media-me", async ({ userId, body }) => {
      await owner(userId);
      const b = asObject(body);
      const chatId = await meChat(userId);
      meGuard();
      await inbox.sendMedia(userId, chatId, b);
      return { status: "sent" };
    });
    A.call("/send-media", async ({ userId, body, signal }) => {
      await owner(userId);
      const b = asObject(body), chatId = core.chatId(b.chatId);
      if (!(await isSelf(userId, chatId))) {
        const decision = await approved(userId, `Send a file on WhatsApp to ${chatId}`, `${core.optText(b.filename, 150) || b.kind}${b.caption ? ": " + core.optText(b.caption, 600) : ""}`, signal);
        if (decision !== "approved") return { status: decision };
      }
      return inbox.sendMedia(userId, chatId, b);
    });
    // A reaction is visible to the other person: approval unless the chat is the user's own.
    A.call("/react", async ({ userId, body, signal }) => {
      await owner(userId);
      const b = asObject(body), x = await store.row(userId, b.messageId), emoji = core.optText(b.emoji, 16);
      if (!(await isSelf(userId, String(x.chat_id)))) {
        const decision = await approved(userId, `React ${emoji || "(remove reaction)"} to a WhatsApp message in ${await identity.canonical(userId, String(x.chat_id))}`, String(x.body ?? "").slice(0, 300), signal);
        if (decision !== "approved") return { status: decision };
      }
      await inbox.react(userId, b.messageId, emoji);
      return { status: "sent" };
    });
    // What a media message is, without the bytes (agents get no file content through this plugin).
    A.call("/media-info", async ({ userId, body }) => {
      await owner(userId);
      const x = await store.row(userId, asObject(body).messageId), m = asObject(x.media), e = asObject(x.extra);
      return { id: x.msg_id, type: x.type, caption: x.body, mime: m.mime ?? null, filename: m.filename ?? null, size: m.size ?? null, duration: m.duration ?? null, width: m.width ?? null, height: m.height ?? null,
        location: e.location ?? null, contacts: e.vcards ?? null, poll: e.poll ?? null };
    });
    // Read-only health check of the WAHA instance: which calls answer and with what status. No message content, no key, no address.
    A.call("/diagnostics", async ({ userId }) => {
      await owner(userId);
      const c = await core.config(userId);
      if (!c.base || !c.apiKey) return { configured: false, missingSettings: c.missingSettings, missingSecrets: c.missingSecrets };
      const probe = async (path: string, query?: Record<string, string>) => {
        try { return { status: 200, data: await core.waha<unknown>(userId, "GET", path, query ? { query } : {}) }; }
        catch (e) { if (e instanceof WahaError) return { status: e.status, detail: e.detail, data: null as unknown }; throw e; }
      };
      const keys = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? Object.keys(v as object).slice(0, 30) : Array.isArray(v) ? ["[array " + v.length + "]"] : []);
      const o = core.obj;
      const version = await probe("/api/version"), one = await probe("/api/sessions/{session}"), all = await probe("/api/sessions", { all: "true" });
      const s = o(one.data), hooks = Array.isArray(o(s.config).webhooks) ? (o(s.config).webhooks as unknown[]).map((w) => ({ events: Array.isArray(o(w).events) ? (o(w).events as unknown[]).length : 0, hasHmac: !!o(o(w).hmac).key || typeof o(w).hmac === "string" })) : [];
      const own = await identity.ownChat(userId), me = await identity.me(userId);
      const working = String(s.status ?? "").toUpperCase() === "WORKING";
      const lids = working ? await probe("/api/{session}/lids", { limit: "1", offset: "0" }) : null;
      const exists = working && own ? await probe("/api/contacts/check-exists", { phone: own.split("@")[0] }) : null;
      const lidOfOwn = working && own ? await probe("/api/{session}/lids/pn/" + encodeURIComponent(own), {}) : null;
      const overview = working ? await probe("/api/{session}/chats/overview", { limit: "1" }) : null;
      return {
        configured: true, session: c.session, basePathPrefix: new URL(c.base).pathname.replace(/\/+$/, "") !== "",
        version: { status: version.status, detail: (version as { detail?: string }).detail, version: o(version.data).version ?? null, engine: o(version.data).engine ?? null, tier: o(version.data).tier ?? null },
        sessionRead: { status: one.status, detail: (one as { detail?: string }).detail, sessionStatus: s.status ?? null, engine: o(s.engine).engine ?? null, hasMe: !!s.me, meKeys: keys(s.me), webhooks: hooks },
        sessions: { status: all.status, detail: (all as { detail?: string }).detail, list: Array.isArray(all.data) ? all.data.slice(0, 30).map((x) => ({ name: o(x).name ?? null, status: o(x).status ?? null, hasMe: !!o(x).me })) : null },
        lids: lids && { status: lids.status, detail: (lids as { detail?: string }).detail, shape: keys(lids.data), firstKeys: Array.isArray(lids.data) ? keys(lids.data[0]) : [] },
        checkExistsOwn: exists && { status: exists.status, detail: (exists as { detail?: string }).detail, keys: keys(exists.data), numberExists: o(exists.data).numberExists ?? null, chatIdKind: typeof o(exists.data).chatId === "string" ? String(o(exists.data).chatId).split("@")[1] : null, sameAsSaved: typeof o(exists.data).chatId === "string" ? o(exists.data).chatId === own : null },
        lidOfOwn: lidOfOwn && { status: lidOfOwn.status, detail: (lidOfOwn as { detail?: string }).detail, keys: keys(lidOfOwn.data), hasLid: typeof o(lidOfOwn.data).lid === "string" && !!o(lidOfOwn.data).lid },
        chatsOverview: overview && { status: overview.status, detail: (overview as { detail?: string }).detail, shape: keys(overview.data), firstKeys: Array.isArray(overview.data) ? keys(overview.data[0]) : [] },
        account: me ? { hasId: !!me.id, hasLid: !!me.lid, sameAsSavedNumber: own ? (await identity.canonical(userId, me.id)) === (await identity.canonical(userId, own)) : null } : null,
        savedNumber: !!own,
      };
    });
    A.call("/me", async ({ userId }) => {
      await owner(userId);
      const s = await ctx.settings.get(userId), me = await identity.me(userId);
      return { canMessageMe: phoneToChatId(await savedPhone(userId)) !== null && messageMeOn(s), sendNeedsApproval: s.alwaysAllowSend !== true, account: me ? { name: me.name, phone: me.id.split("@")[0] } : null };
    });

    // ---- inbound: WAHA posts events here (token in the path, optional HMAC) ----
    ctx.webhooks.on("events", async (req) => {
      const e = parseEnvelope(req.json());
      if (!e) return { ok: true };
      const o = await ctx.installOwner();
      if (!o) return { ok: true, ignored: true };
      if (e.session !== (await core.config(o)).session) return { ok: true, ignored: true };
      if (Object.keys(e.me).length) await identity.saveMe(o, e.me);
      await core.emit(o, e);
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
