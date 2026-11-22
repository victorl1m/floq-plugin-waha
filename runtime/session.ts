// Connecting WhatsApp from inside Floq: session state, start/stop/restart/logout, QR and pairing-code login, webhook event check.
import type { Deps } from "./extras.js";
import { WahaError } from "./client.js";
import { SESSION_NAME } from "./core.js";
import { displayDigits } from "./ids.js";
import { phoneDigits } from "../shared/phone.js";

/** Webhook events this plugin listens to. */
export const WANTED_EVENTS = ["message.any", "message.ack", "message.ack.group", "message.reaction", "message.edited", "message.revoked", "session.status", "presence.update", "poll.vote", "chat.archive", "call.received", "call.accepted", "call.rejected", "label.upsert", "label.deleted", "label.chat.added", "label.chat.deleted", "group.v2.join", "group.v2.leave", "group.v2.update", "group.v2.participants"];
export const SESSION_STATUSES = ["STOPPED", "STARTING", "SCAN_QR_CODE", "WORKING", "FAILED", "PASSKEY_REQUIRED", "PASSKEY_CONFIRMATION_REQUIRED"] as const;

type Obj = Record<string, unknown>;
export const webhooksOf = (s: Obj): Obj[] => {
  const c = s.config && typeof s.config === "object" ? (s.config as Obj) : null;
  return c && Array.isArray(c.webhooks) ? c.webhooks.filter((w): w is Obj => !!w && typeof w === "object" && !Array.isArray(w)) : [];
};
export const eventsOf = (w: Obj): string[] => (Array.isArray(w.events) ? w.events.filter((e): e is string => typeof e === "string") : []);
const missing = (events: string[]) => (events.includes("*") ? [] : WANTED_EVENTS.filter((e) => !events.includes(e)));
/** The webhook entry that is most likely ours: the one that already covers most of the wanted events. */
function pickWebhook(list: Obj[]): Obj | null {
  let best: Obj | null = null, score = -1;
  for (const w of list) { const ev = eventsOf(w), n = ev.includes("*") ? WANTED_EVENTS.length : WANTED_EVENTS.filter((e) => ev.includes(e)).length; if (n > score) { best = w; score = n; } }
  return best;
}

export const statusOf = (s: Obj | null | undefined) => String(s?.status ?? "").toUpperCase().slice(0, 40) || "STOPPED";
export const engineOf = (s: Obj | null | undefined) => { const e = String((s?.engine as Obj | undefined)?.engine ?? "").toUpperCase(); return e === "WEBJS" || e === "NOWEB" || e === "GOWS" ? e : ""; };
/** Name and number of the WhatsApp account a WAHA session is logged in to, for display. */
export function accountOf(s: Obj | null | undefined): { name: string; phone: string } | null {
  const me = s?.me && typeof s.me === "object" ? (s.me as Obj) : null;
  if (!me) return null;
  const digits = typeof me.id === "string" ? me.id.split("@")[0].split(":")[0].replace(/\D/g, "") : "";
  const name = [me.pushName, me.pushname, me.name].find((n): n is string => typeof n === "string" && !!n.trim()) ?? "";
  return { name: name.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").trim().slice(0, 80), phone: /^\d{8,15}$/.test(digits) ? displayDigits(digits) : "" };
}
/**
 * Floq's webhook as one attached session has it, to give another session the same one: the entry whose URL is this plugin's hook, else (one
 * session, set up by hand through a proxy) the entry that covers most of the wanted events. With WAHA_WEBHOOK_HMAC saved, that key signs it.
 */
export function webhookFor(pluginId: string, sessions: Obj[], hmac: string | undefined): Obj | null {
  const ours = (w: Obj) => typeof w.url === "string" && w.url.includes(`/plugins/${pluginId}/hooks/`);
  let found: Obj | null = null;
  for (const x of sessions) { found = webhooksOf(x).find(ours) ?? null; if (found) break; }
  if (!found) for (const x of sessions) { found = pickWebhook(webhooksOf(x)); if (found) break; }
  if (!found || typeof found.url !== "string" || !/^https?:\/\//.test(found.url)) return null;
  const events = eventsOf(found);
  return { ...found, events: events.includes("*") ? ["*"] : [...new Set([...events, ...WANTED_EVENTS])], ...(hmac ? { hmac: { key: hmac } } : {}) };
}
/** True when the session already posts to the same URL as the template. */
export const hasWebhook = (s: Obj, template: Obj) => webhooksOf(s).some((w) => w.url === template.url);

export function registerSession(deps: Deps): void {
  const { core, identity, history } = deps;
  const { ctx } = core;
  const R = ctx.routes;

  /** Every session of the WAHA instance, or null when it cannot say. */
  async function list(userId: string): Promise<Obj[] | null> {
    const r = await core.tryWaha<unknown>(userId, "GET", "/api/sessions", { query: { all: "true" } });
    return Array.isArray(r) ? r.filter((x): x is Obj => !!x && typeof x === "object" && typeof (x as Obj).name === "string") : null;
  }
  const NAME = SESSION_NAME;
  /** The account now uses another WAHA session: its place in the list stays, what was learned about the old session's account does not carry over. */
  async function switched(userId: string, name: string) {
    const { owner, session } = core.split(userId), list = await core.accounts(owner);
    if (name === session) return;
    if (list.some((a) => a.session === name)) throw ctx.httpError(409, "already_attached", "That session is already one of your accounts.");
    const next = { session: name, label: "", name: "", phone: "", addedAt: new Date().toISOString() };
    await core.saveAccounts(owner, list.some((a) => a.session === session) ? list.map((a) => (a.session === session ? { ...next, label: a.label } : a)) : [...list, next]);
    core.resetEngine();
    core.host.events.publish(owner, "accounts", {});
    core.publish(userId, "session", { status: "STARTING", movedTo: name });
  }

  /** The session as WAHA reports it, or the reason it cannot. */
  async function read(userId: string): Promise<{ s: Obj | null; status: string }> {
    try {
      const s = await core.waha<Obj | null>(userId, "GET", "/api/sessions/{session}");
      return { s: s && typeof s === "object" ? s : {}, status: String((s as Obj | null)?.status ?? "").toUpperCase() || "STOPPED" };
    } catch (e) {
      if (!(e instanceof WahaError)) throw e;
      if (e.status === 404) {
        // Older WAHA has no GET /api/sessions/{name}: the list still knows the session.
        const want = (await core.config(userId)).session, hit = (await list(userId))?.find((x) => x.name === want);
        return hit ? { s: hit, status: String(hit.status ?? "").toUpperCase() || "STOPPED" } : { s: null, status: "MISSING" };
      }
      if (e.status === 401 || e.status === 403) return { s: null, status: "UNAUTHORIZED" };
      return { s: null, status: "UNREACHABLE" };
    }
  }

  R.get("/session", async ({ userId }) => {
    await core.owner(userId);
    const first = await read(userId);
    const { s } = first;
    let status = first.status, engine = "";
    let hist: { willImport: boolean; error: string | null } = { willImport: false, error: null };
    let webhook: { configured: boolean; events: string[]; missingEvents: string[] } | null = null;
    if (s) {
      const e = String((s.engine as Obj | undefined)?.engine ?? "").toUpperCase();
      engine = e === "WEBJS" || e === "NOWEB" || e === "GOWS" ? e : "";
      if (s.me) await identity.saveMe(userId, s.me);
      const hook = pickWebhook(webhooksOf(s));
      if (hook) { const events = eventsOf(hook); webhook = { configured: true, events, missingEvents: missing(events) }; }
      // A session that waits for the scan gets its history store before the QR is shown; that restarts it, so the QR comes a moment later.
      const p = await history.prepare(userId, s);
      if (p.restarted) status = "STARTING";
      hist = { willImport: p.willImport, error: p.error };
      await history.noteStatus(userId, status);
    }
    const me = await identity.me(userId);
    return { status: SESSION_STATUSES.includes(status as never) || ["MISSING", "UNREACHABLE", "UNAUTHORIZED"].includes(status) ? status : "STOPPED", engine, me: me ? { name: me.name, phone: displayDigits(me.id.split("@")[0]) } : null, webhook, wantedEvents: WANTED_EVENTS, history: hist };
  });

  // Extends the events of the existing webhook entry; WAHA replaces the whole config and restarts the session, so everything else is sent back unchanged.
  R.post("/session/webhook-events", async ({ userId }) => {
    await core.owner(userId);
    return core.guard(async () => {
      const s = await core.waha<Obj>(userId, "GET", "/api/sessions/{session}");
      const config = s && s.config && typeof s.config === "object" ? (s.config as Obj) : null;
      const list = webhooksOf(s ?? {}), hook = pickWebhook(list);
      if (!config || !hook) throw ctx.httpError(409, "no_webhook", "This WAHA session has no webhook set in its own configuration. Enable the events in the WAHA environment instead.");
      const add = missing(eventsOf(hook));
      if (!add.length) return { ok: true, added: [] as string[] };
      const webhooks = (config.webhooks as unknown[]).map((w) => (w === hook ? { ...hook, events: [...eventsOf(hook), ...add] } : w));
      await core.waha(userId, "PUT", "/api/sessions/{session}", { body: { config: { ...config, webhooks } } });
      core.publish(userId, "session", { status: "STARTING" });
      return { ok: true, added: add };
    }, "webhook events");
  });

  /** Starts the account's session; creates it in WAHA (with Floq's webhook, when another account shows it) when it does not exist. */
  const start = (userId: string) => core.guard(async () => {
      const c = await core.ready(userId);
      const { status } = await read(userId);
      if (status === "UNREACHABLE" || status === "UNAUTHORIZED") throw new WahaError(status === "UNAUTHORIZED" ? 401 : 0);
      const post = async (path: string, body?: Obj): Promise<WahaError | null> => {
        try { await core.waha(userId, "POST", path, body ? { body } : {}); return null; } catch (e) { if (e instanceof WahaError) return e; throw e; }
      };
      const legacy = () => post("/api/sessions/start", { name: c.session }); // WAHA before 2024.9: name in the body
      let err: WahaError | null;
      if (status === "MISSING") {
        const { owner } = core.split(userId), others = new Set((await core.accounts(owner)).map((a) => a.session));
        const hook = webhookFor(ctx.pluginId, ((await list(userId)) ?? []).filter((x) => others.has(String(x.name))), await ctx.secrets.getInstall("WAHA_WEBHOOK_HMAC"));
        // Created with the history store on, so the chats are there after the scan. A WAHA that refuses that config gets the session without it.
        err = await post("/api/sessions", { name: c.session, start: true, config: { ...(hook ? { webhooks: [hook] } : {}), ...history.storeConfig() } });
        if (err && (err.status === 400 || err.status === 422)) {
          const plain = await post("/api/sessions", { name: c.session, start: true, ...(hook ? { config: { webhooks: [hook] } } : {}) });
          if (!plain) { await history.expect(userId, `WAHA answered ${err.status}${err.detail ? ": " + err.detail : ""}`); err = null; }
        } else if (!err) await history.expect(userId);
        if (err && (err.status === 404 || err.status === 405)) err = (await legacy()) && err;
        else if (err && (err.status === 409 || err.status === 422 || err.status === 400)) err = (await post("/api/sessions/{session}/start")) && err; // it exists after all
      } else {
        err = await post("/api/sessions/{session}/start");
        if (err && (err.status === 404 || err.status === 405)) err = (await legacy()) && err;
      }
      if (err) throw err;
      return { ok: true };
    }, "session start");
  R.post("/session/start", async ({ userId }) => { await core.owner(userId); return start(userId); });
  // The sessions that exist in WAHA, to attach one that is already there instead of creating a new one.
  R.get("/session/list", async ({ userId }) => {
    await core.owner(userId);
    const c = await core.ready(userId), all = await list(userId);
    const attached = new Set((await core.accounts(core.split(userId).owner)).map((a) => a.session));
    return { current: c.session, sessions: (all ?? []).slice(0, 50).map((x) => {
      const me = x.me && typeof x.me === "object" ? (x.me as Obj) : null, id = me && typeof me.id === "string" ? me.id.split("@")[0].replace(/\D/g, "") : "";
      return { name: String(x.name).slice(0, 64), status: String(x.status ?? "").toUpperCase() || "STOPPED", account: me ? { name: typeof me.pushName === "string" ? me.pushName.slice(0, 80) : "", phone: id ? displayDigits(id) : null } : null };
    }).filter((x) => NAME.test(x.name) && (x.name === c.session || !attached.has(x.name))), known: all !== null };
  });
  // Use a session by name: one from the list, or a new name that "Connect" then creates.
  R.post("/session/use", async ({ userId, body }) => {
    await core.owner(userId);
    const name = String(core.obj(body).name ?? "").trim();
    if (!NAME.test(name)) throw ctx.httpError(400, "invalid_session", "A session name is 1-64 letters, digits, dots, dashes or underscores.");
    await core.ready(userId);
    await switched(userId, name);
    // The caller's requests still name the old session, so "create and connect" is one call.
    if (core.obj(body).start === true) await start(await core.scope(core.split(userId).owner, name));
    return { ok: true, session: name };
  });

  for (const action of ["stop", "restart"] as const) {
    R.post("/session/" + action, async ({ userId }) => {
      await core.owner(userId);
      await core.guard(() => core.waha(userId, "POST", `/api/sessions/{session}/${action}`), "session " + action);
      if (action === "stop") core.publish(userId, "session", { status: "STOPPED" });
      return { ok: true };
    });
  }
  R.post("/session/logout", async ({ userId }) => {
    await core.owner(userId);
    await core.guard(() => core.waha(userId, "POST", "/api/sessions/{session}/logout"), "session logout");
    return { ok: true };
  });

  const notScanning = () => ctx.httpError(409, "not_scanning", "WhatsApp is not waiting for a scan right now.");
  R.get("/session/qr", async ({ userId }) => {
    await core.owner(userId);
    let err: unknown;
    // Never a QR for a session whose history store is still off (see /session): turning it on restarts the session.
    if ((await history.prepare(userId)).restarted) throw notScanning();
    try {
      const r = core.obj(await core.waha(userId, "GET", "/api/{session}/auth/qr", { query: { format: "raw" } }));
      if (typeof r.value === "string" && r.value && r.value.length <= 2000) return { value: r.value };
    } catch (e) { err = e; }
    if (err instanceof WahaError && err.status === 422) throw notScanning();
    if (err instanceof WahaError && (err.status === 0 || err.status === 401 || err.status === 403)) return core.fail(err, "qr");
    if (err && !(err instanceof WahaError)) throw err;
    // The raw form is not available: the image form of the same endpoint.
    try {
      const r = core.obj(await core.waha(userId, "GET", "/api/{session}/auth/qr", { headers: { Accept: "application/json" } }));
      if (typeof r.data === "string" && /^[A-Za-z0-9+/=\s]+$/.test(r.data) && r.data.length < 400_000) {
        const mime = typeof r.mimetype === "string" && /^image\/(png|jpeg)$/.test(r.mimetype) ? r.mimetype : "image/png";
        return { image: `data:${mime};base64,${r.data.replace(/\s/g, "")}` };
      }
    } catch (e) {
      if (e instanceof WahaError && e.status === 422) throw notScanning();
      return core.fail(e, "qr");
    }
    throw ctx.httpError(502, "waha_unavailable", "WAHA could not do that.");
  });

  R.post("/session/pair-code", async ({ userId, body }) => {
    await core.owner(userId);
    const digits = phoneDigits(core.obj(body).phone);
    if (!digits) throw ctx.httpError(400, "invalid_phone", "Pick the country and type the number, for example (11) 99999-9999.");
    if ((await history.prepare(userId)).restarted) throw notScanning();
    const r = core.obj(await core.guard(() => core.waha(userId, "POST", "/api/{session}/auth/request-code", { body: { phoneNumber: digits } }), "pairing code"));
    const raw = typeof r.code === "string" ? r.code.replace(/[^0-9A-Za-z]/g, "").toUpperCase() : "";
    if (raw.length !== 8) throw ctx.httpError(502, "waha_unavailable", "WAHA did not return a pairing code.");
    return { code: `${raw.slice(0, 4)}-${raw.slice(4)}` };
  });

  R.get("/session/screenshot", async ({ userId }) => {
    await core.owner(userId);
    const engine = await core.engine(userId);
    if (engine && engine !== "WEBJS") throw ctx.httpError(501, "unsupported", "This WAHA engine does not support that.");
    const r = core.obj(await core.guard(() => core.waha(userId, "GET", "/api/screenshot", { headers: { Accept: "application/json" } }), "screenshot"));
    if (typeof r.data !== "string" || !/^[A-Za-z0-9+/=\s]+$/.test(r.data) || r.data.length > 4_000_000) throw ctx.httpError(502, "waha_unavailable", "WAHA could not do that.");
    const mime = typeof r.mimetype === "string" && /^image\/(png|jpeg)$/.test(r.mimetype) ? r.mimetype : "image/png";
    return { image: `data:${mime};base64,${r.data.replace(/\s/g, "")}` };
  });

  // Live: the UI learns of every status change at once; a fresh login refreshes who is who.
  core.on("session.status", async (userId, e) => {
    const status = String(e.payload.status ?? "").toUpperCase().slice(0, 40);
    if (!status) return;
    core.publish(userId, "session", { status });
    // Linked just now: the history import starts. Back after a break: the contacts are read again.
    await history.noteStatus(userId, status, true);
    if (status === "WORKING") core.bg(identity.ensure(userId, true).then((changed) => { if (changed) core.publish(userId, "chats", {}); }));
  });
}
