// Connecting WhatsApp from inside Floq: session state, start/stop/restart/logout, QR and pairing-code login, webhook event check.
import type { Deps } from "./extras.js";
import { WahaError } from "./client.js";
import { displayDigits } from "./ids.js";
import { phoneDigits } from "../shared/phone.js";

/** Webhook events this plugin listens to. */
export const WANTED_EVENTS = ["message.any", "message.ack", "message.ack.group", "message.reaction", "message.edited", "message.revoked", "session.status", "presence.update", "poll.vote", "chat.archive", "call.received", "call.accepted", "call.rejected", "label.upsert", "label.deleted", "label.chat.added", "label.chat.deleted", "group.v2.join", "group.v2.leave", "group.v2.update", "group.v2.participants"];
export const SESSION_STATUSES = ["STOPPED", "STARTING", "SCAN_QR_CODE", "WORKING", "FAILED", "PASSKEY_REQUIRED", "PASSKEY_CONFIRMATION_REQUIRED"] as const;

type Obj = Record<string, unknown>;
const webhooksOf = (s: Obj): Obj[] => {
  const c = s.config && typeof s.config === "object" ? (s.config as Obj) : null;
  return c && Array.isArray(c.webhooks) ? c.webhooks.filter((w): w is Obj => !!w && typeof w === "object" && !Array.isArray(w)) : [];
};
const eventsOf = (w: Obj): string[] => (Array.isArray(w.events) ? w.events.filter((e): e is string => typeof e === "string") : []);
const missing = (events: string[]) => (events.includes("*") ? [] : WANTED_EVENTS.filter((e) => !events.includes(e)));
/** The webhook entry that is most likely ours: the one that already covers most of the wanted events. */
function pickWebhook(list: Obj[]): Obj | null {
  let best: Obj | null = null, score = -1;
  for (const w of list) { const ev = eventsOf(w), n = ev.includes("*") ? WANTED_EVENTS.length : WANTED_EVENTS.filter((e) => ev.includes(e)).length; if (n > score) { best = w; score = n; } }
  return best;
}

export function registerSession(deps: Deps): void {
  const { core, identity } = deps;
  const { ctx } = core;
  const R = ctx.routes;

  /** The session as WAHA reports it, or the reason it cannot. */
  async function read(userId: string): Promise<{ s: Obj | null; status: string }> {
    try {
      const s = await core.waha<Obj | null>(userId, "GET", "/api/sessions/{session}");
      return { s: s && typeof s === "object" ? s : {}, status: String((s as Obj | null)?.status ?? "").toUpperCase() || "STOPPED" };
    } catch (e) {
      if (!(e instanceof WahaError)) throw e;
      if (e.status === 404) return { s: null, status: "MISSING" };
      if (e.status === 401 || e.status === 403) return { s: null, status: "UNAUTHORIZED" };
      return { s: null, status: "UNREACHABLE" };
    }
  }

  R.get("/session", async ({ userId }) => {
    await core.owner(userId);
    const { s, status } = await read(userId);
    let engine = "";
    let webhook: { configured: boolean; events: string[]; missingEvents: string[] } | null = null;
    if (s) {
      const e = String((s.engine as Obj | undefined)?.engine ?? "").toUpperCase();
      engine = e === "WEBJS" || e === "NOWEB" || e === "GOWS" ? e : "";
      if (s.me) await identity.saveMe(userId, s.me);
      const hook = pickWebhook(webhooksOf(s));
      if (hook) { const events = eventsOf(hook); webhook = { configured: true, events, missingEvents: missing(events) }; }
    }
    const me = await identity.me(userId);
    return { status: SESSION_STATUSES.includes(status as never) || ["MISSING", "UNREACHABLE", "UNAUTHORIZED"].includes(status) ? status : "STOPPED", engine, me: me ? { name: me.name, phone: displayDigits(me.id.split("@")[0]) } : null, webhook, wantedEvents: WANTED_EVENTS };
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

  R.post("/session/start", async ({ userId }) => {
    await core.owner(userId);
    return core.guard(async () => {
      const c = await core.ready(userId);
      const { status } = await read(userId);
      if (status === "UNREACHABLE" || status === "UNAUTHORIZED") throw new WahaError(status === "UNAUTHORIZED" ? 401 : 0);
      if (status === "MISSING") await core.waha(userId, "POST", "/api/sessions", { body: { name: c.session, start: true } });
      else await core.waha(userId, "POST", "/api/sessions/{session}/start");
      return { ok: true };
    }, "session start");
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
  core.on("session.status", (userId, e) => {
    const status = String(e.payload.status ?? "").toUpperCase().slice(0, 40);
    if (!status) return;
    core.publish(userId, "session", { status });
    if (status === "WORKING") core.bg(identity.ensure(userId, true).then((changed) => { if (changed) core.publish(userId, "chats", {}); }));
  });
}
