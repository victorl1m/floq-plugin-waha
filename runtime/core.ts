// Shared plumbing of every runtime module: owner check, configuration, the WAHA HTTP client, input validation and the webhook event bus.
import type { PluginContext, PluginFetchResponse, PluginRouteRequest } from "../shared/sdk";
import { CHAT_ID, normId } from "./ids.js";
import { TEXT_MAX, WahaError, normalizeBase, sessionName, wahaDetail } from "./client.js";

export interface WahaConfig { base: string; apiKey: string; session: string }
/** One WhatsApp account of the inbox: a WAHA session attached to Floq. The first one is the primary account (what agents use when they name none). */
export interface Account { session: string; label: string; name: string; phone: string; addedAt: string }
export const SESSION_NAME = /^[A-Za-z0-9._-]{1,64}$/;

// A scope is "owner + account": the string every module receives where it used to receive the user id. The scoped context below (core.ctx) turns it
// back into the real user id for the host, adds the account's session to every query that names $S, keeps the key-value store and the events per
// account. The separator cannot occur in a user id or a session name, and Postgres refuses it in a text parameter, so a scope that reached the
// database untranslated fails loudly instead of matching nothing.
const SEP = "\u0000";
export const scopeOf = (owner: string, session: string) => owner + SEP + session;
export function splitScope(v: string): { owner: string; session: string | null } {
  const i = v.indexOf(SEP);
  return i < 0 ? { owner: v, session: null } : { owner: v.slice(0, i), session: v.slice(i + 1) };
}
const isScope = (v: unknown): v is string => typeof v === "string" && v.includes(SEP);
export interface WahaCall { query?: Record<string, string | number | boolean | undefined>; body?: unknown; headers?: Record<string, string> }
export type Engine = "WEBJS" | "NOWEB" | "GOWS" | "";
export interface WebhookEvent { event: string; session: string; payload: Record<string, unknown>; me: Record<string, unknown>; engine: string }
export type WebhookListener = (userId: string, e: WebhookEvent) => void | Promise<void>;

export interface Core {
  /** The scoped context: every call that takes a user id also takes a scope. Modules use this one. */
  ctx: PluginContext;
  /** The host's own context, for what is not per account (the saved own number, the accounts list). Takes real user ids only. */
  host: PluginContext;
  /** The attached accounts in order (primary first). The first call after an update from a single-session version creates the list from the old session setting and moves the stored rows to it. */
  accounts(owner: string): Promise<Account[]>;
  saveAccounts(owner: string, list: Account[]): Promise<void>;
  /** The scope of one account ("" = the primary). Throws 404 unknown_account for a session that is not attached. */
  scope(owner: string, session?: string): Promise<string>;
  /** The real user id and the session of a scope. */
  split(scope: string): { owner: string; session: string };
  /** Text that names the account when more than one is attached ("" with a single account). */
  accountTag(scope: string): string;
  /** Throws 403 unless userId is the administrator who set the plugin up. */
  owner(userId: string): Promise<string>;
  config(userId: string): Promise<{ base: string | null; apiKey: string | undefined; session: string; missingSettings: string[]; missingSecrets: string[] }>;
  /** The configuration, or a 409 not_configured error. */
  ready(userId: string): Promise<WahaConfig>;
  /**
   * One WAHA request. `path` starts with "/api/"; "{session}" in it is replaced by the configured session (url-encoded). Returns the parsed JSON body
   * (null when empty). Throws WahaError(status); status 0 means WAHA was unreachable. Never leaks the URL, key or upstream text.
   */
  waha<T = unknown>(userId: string, method: "GET" | "POST" | "PUT" | "DELETE", path: string, call?: WahaCall): Promise<T>;
  /** Like waha() but never throws: undefined on any failure. For optional lookups. */
  tryWaha<T = unknown>(userId: string, method: "GET" | "POST" | "PUT" | "DELETE", path: string, call?: WahaCall): Promise<T | undefined>;
  /** Raw bytes of a WAHA-hosted URL (media files). The URL's origin is rewritten to the configured WAHA address, so a WAHA that reports "http://localhost:3000/..." still works. */
  wahaBytes(userId: string, urlOrPath: string): Promise<{ bytes: Uint8Array; mime: string }>;
  /** Engine of the session ("" when unknown), cached for a few minutes. */
  engine(userId: string): Promise<Engine>;
  /** Forgets the cached engine (after switching session). */
  resetEngine(userId?: string): void;
  /** Maps an error to the plugin's HTTP error: WahaError 501/404-not-implemented -> 501 unsupported, 422 -> 409 session_not_ready, else 502. Rethrows host errors as they are. */
  fail(error: unknown, what?: string): never;
  /** Runs fn and maps its errors with fail(). */
  guard<T>(fn: () => Promise<T>, what?: string): Promise<T>;
  // input
  obj(v: unknown): Record<string, unknown>;
  chatId(v: unknown): string;
  text(v: unknown, max?: number, name?: string): string;
  optText(v: unknown, max?: number): string;
  // webhook bus: modules subscribe to WAHA events by name ("session.status", "call.received", ...). "*" gets all.
  on(event: string, fn: WebhookListener): void;
  emit(userId: string, e: WebhookEvent): Promise<void>;
  /** Tracks work that outlives the request (history sync, media download) so stop() can wait for it. Errors are swallowed. */
  bg(work: Promise<unknown>): void;
  idle(): Promise<void>;
  /** UI event to the owner's open apps. */
  publish(userId: string, name: string, data?: unknown): void;
}

const ENGINE_TTL_MS = 5 * 60_000;

/** Tables whose rows belong to one account (messages carry the session since 001). */
export const SESSION_TABLES = ["contacts", "chat_reads", "lid_map", "reactions", "poll_votes", "media_blobs", "known_ids", "chat_state", "calls", "statuses"];

export function createCore(host: PluginContext): Core {
  const listeners = new Map<string, WebhookListener[]>();
  const engines = new Map<string, { at: number; val: Engine }>();
  const lists = new Map<string, Account[]>(), loading = new Map<string, Promise<Account[]>>();
  const real = (v: string) => splitScope(v).owner;
  const cleanAccount = (v: unknown): Account | null => {
    const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {}, str = (x: unknown, max: number) => (typeof x === "string" ? x.slice(0, max) : "");
    return typeof o.session === "string" && SESSION_NAME.test(o.session) ? { session: o.session, label: str(o.label, 40), name: str(o.name, 80), phone: str(o.phone, 20).replace(/\D/g, ""), addedAt: str(o.addedAt, 40) } : null;
  };

  /** 3.0.x kept one session (a setting, or the one picked on the connection screen) and stored every row without naming it: that session becomes the first account. */
  async function adopt(owner: string): Promise<Account[]> {
    const picked = await host.kv.get(owner, "session");
    const session = sessionName(typeof picked === "string" && picked ? picked : (await host.settings.get(owner)).session);
    const me = await host.kv.get(owner, "me");
    if (me && typeof me === "object") await host.kv.set(owner, `s:${session}:me`, me);
    // Migration 006 gave the existing rows the session "default"; nothing told them apart before, so all of them belong to the one session there was.
    if (session !== "default") for (const t of SESSION_TABLES) await host.db.query(`UPDATE {{p}}${t} SET session = $2 WHERE user_id = $1 AND session = 'default'`, [owner, session]);
    await host.db.query(`UPDATE {{p}}messages m SET session = $2 WHERE m.user_id = $1 AND m.session <> $2 AND NOT EXISTS (SELECT 1 FROM {{p}}messages x WHERE x.session = $2 AND x.msg_id = m.msg_id)`, [owner, session]);
    const o = me && typeof me === "object" ? (me as Record<string, unknown>) : {};
    const list = [{ session, label: "", name: typeof o.name === "string" ? o.name.slice(0, 80) : "", phone: typeof o.id === "string" ? o.id.split("@")[0].replace(/\D/g, "") : "", addedAt: new Date().toISOString() }];
    await host.kv.set(owner, "accounts", list);
    return list;
  }

  const scopedRoute = (h: (req: PluginRouteRequest) => unknown) => async (req: PluginRouteRequest) => {
    const o = await host.installOwner();
    if (!o || o !== req.userId) throw host.httpError(403, "forbidden", "The WhatsApp inbox belongs to the administrator who set it up.");
    const b = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? (req.body as Record<string, unknown>) : {};
    const raw = req.query?.session ?? b.session;
    return h({ ...req, userId: await core.scope(o, typeof raw === "string" ? raw : raw === undefined || raw === null ? "" : "\u0001") });
  };
  const routes = (r: PluginContext["routes"]): PluginContext["routes"] => ({
    get: (p, h) => r.get(p, scopedRoute(h)), post: (p, h) => r.post(p, scopedRoute(h)), put: (p, h) => r.put(p, scopedRoute(h)), delete: (p, h) => r.delete(p, scopedRoute(h)),
  });
  const key = (scope: string, k: string) => { const s = splitScope(scope); return s.session === null ? k : `s:${s.session}:${k}`; };
  const ctx: PluginContext = {
    pluginId: host.pluginId, manifest: host.manifest, secrets: host.secrets, webhooks: host.webhooks, taskSources: host.taskSources, attention: host.attention,
    installOwner: () => host.installOwner(),
    httpError: (status, code, message) => host.httpError(status, code, message),
    routes: routes(host.routes),
    internalRoutes: { call: (p, h) => host.internalRoutes.call(p, scopedRoute(h)) },
    fetch: (url, init) => host.fetch(url, init),
    fetchUserUrl: (u, url, init) => host.fetchUserUrl(real(u), url, init),
    settings: { get: (u) => host.settings.get(real(u)) },
    kv: { get: (u, k) => host.kv.get(real(u), key(u, k)), set: (u, k, v) => host.kv.set(real(u), key(u, k), v) },
    db: {
      forUser: (u) => host.db.forUser(real(u)),
      query(sql, params = []) {
        const at = params.findIndex(isScope);
        if (at < 0) {
          if (sql.includes("$S")) throw new Error("a query that names $S needs the scope as a parameter");
          return host.db.query(sql, params);
        }
        const s = splitScope(params[at] as string), next = params.map((p) => (isScope(p) ? splitScope(p).owner : p));
        if (!sql.includes("$S")) return host.db.query(sql, next);
        return host.db.query(sql.replaceAll("$S", "$" + (next.length + 1)), [...next, s.session ?? ""]);
      },
    },
    events: { publish: (u, name, data) => { const s = splitScope(u); host.events.publish(s.owner, name, s.session === null ? data : { ...(data && typeof data === "object" ? data : {}), session: s.session }); } },
    toast: (u, t) => { const tag = core.accountTag(u); host.toast(real(u), tag ? { ...t, title: t.title.replace(/^WhatsApp\b/, `WhatsApp (${tag})`).slice(0, 120) } : t); },
    approvals: { request: (input) => host.approvals.request({ ...input, userId: real(input.userId) }) },
    schedule: (ms, fn) => host.schedule(ms, fn),
    log: host.log,
  };

  const pending = new Set<Promise<unknown>>();
  const core: Core = {
    ctx, host,
    accounts(owner) {
      const hit = lists.get(owner);
      if (hit) return Promise.resolve(hit);
      let p = loading.get(owner);
      if (!p) {
        p = (async () => {
          const saved = await host.kv.get(owner, "accounts");
          const list = Array.isArray(saved) ? saved.map(cleanAccount).filter((a): a is Account => a !== null) : await adopt(owner);
          const unique = list.filter((a, i) => list.findIndex((x) => x.session === a.session) === i).slice(0, 20);
          lists.set(owner, unique);
          return unique;
        })().finally(() => loading.delete(owner));
        loading.set(owner, p);
      }
      return p;
    },
    async saveAccounts(owner, list) { lists.set(owner, list); await host.kv.set(owner, "accounts", list); },
    async scope(owner, session = "") {
      const list = await core.accounts(owner);
      if (!session) return scopeOf(owner, list[0]?.session ?? "");
      if (!list.some((a) => a.session === session)) throw host.httpError(404, "unknown_account", "That WhatsApp account is not attached to Floq. GET /accounts (agents: /me) lists the attached ones.");
      return scopeOf(owner, session);
    },
    split(scope) { const s = splitScope(scope); return { owner: s.owner, session: s.session ?? "" }; },
    accountTag(scope) {
      const s = splitScope(scope), list = lists.get(s.owner) ?? [];
      if (list.length < 2 || s.session === null) return "";
      const a = list.find((x) => x.session === s.session);
      return a ? a.label || a.name || (a.phone ? "+" + a.phone : a.session) : s.session;
    },
    bg(work) { const p = work.catch(() => undefined).finally(() => pending.delete(p)); pending.add(p); },
    async idle() { while (pending.size) await Promise.allSettled([...pending]); },
    async owner(userId) {
      const o = await ctx.installOwner();
      userId = real(userId);
      if (!o || o !== userId) throw ctx.httpError(403, "forbidden", "The WhatsApp inbox belongs to the administrator who set it up.");
      return o;
    },
    async config(userId) {
      const settings = await ctx.settings.get(userId);
      const base = normalizeBase(settings.baseUrl);
      const apiKey = await ctx.secrets.getInstall("WAHA_API_KEY");
      // A bare user id means the primary account.
      const s = splitScope(userId), session = s.session ?? (await core.accounts(s.owner))[0]?.session ?? "";
      return { base, apiKey, session, missingSettings: base ? [] : ["baseUrl"], missingSecrets: apiKey ? [] : ["WAHA_API_KEY"] };
    },
    async ready(userId) {
      const c = await core.config(userId);
      if (!c.base || !c.apiKey) throw ctx.httpError(409, "not_configured", "Set the WAHA address and the WAHA_API_KEY secret first.");
      return { base: c.base, apiKey: c.apiKey, session: c.session };
    },
    async waha<T>(userId: string, method: "GET" | "POST" | "PUT" | "DELETE", path: string, call: WahaCall = {}): Promise<T> {
      const c = await core.ready(userId);
      const needsSession = !path.includes("{session}") && !path.startsWith("/api/sessions");
      if (!c.session && (needsSession || path.includes("{session}")) && path !== "/api/version") throw ctx.httpError(409, "no_account", "No WhatsApp account is attached. Add one from the account menu of the inbox.");
      const bodyObj = call.body && typeof call.body === "object" && !Array.isArray(call.body) ? (call.body as Record<string, unknown>) : null;
      const query = { ...(needsSession && call.body === undefined ? { session: c.session } : {}), ...(call.query ?? {}) };
      const qs = Object.entries(query).filter(([, v]) => v !== undefined).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&");
      const url = c.base + path.replaceAll("{session}", encodeURIComponent(c.session)) + (qs ? (path.includes("?") ? "&" : "?") + qs : "");
      const body = call.body === undefined ? undefined : JSON.stringify(needsSession && bodyObj ? { session: c.session, ...bodyObj } : call.body);
      let res: PluginFetchResponse;
      try { res = await ctx.fetchUserUrl(userId, url, { method, headers: { "X-Api-Key": c.apiKey, Accept: "application/json", ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(call.headers ?? {}) }, body }); }
      catch { throw new WahaError(0); }
      if (!res.ok) throw new WahaError(res.status, wahaDetail(res));
      try { return res.json() as T; } catch { return null as T; }
    },
    async tryWaha<T>(userId: string, method: "GET" | "POST" | "PUT" | "DELETE", path: string, call?: WahaCall): Promise<T | undefined> {
      try { return await core.waha<T>(userId, method, path, call); } catch { return undefined; }
    },
    async wahaBytes(userId, urlOrPath) {
      const c = await core.ready(userId);
      let url = "";
      try {
        const u = new URL(urlOrPath, c.base + "/"), b = new URL(c.base), prefix = b.pathname.replace(/\/+$/, "");
        if (/^https?:$/.test(u.protocol)) url = b.origin + (prefix && !u.pathname.startsWith(prefix + "/") ? prefix : "") + u.pathname + u.search;
      } catch { url = ""; }
      if (!url) throw new WahaError(0);
      let res: PluginFetchResponse;
      try { res = await ctx.fetchUserUrl(userId, url, { method: "GET", headers: { "X-Api-Key": c.apiKey } }); } catch { throw new WahaError(0); }
      if (!res.ok) throw new WahaError(res.status);
      return { bytes: res.bytes, mime: String(res.headers?.["content-type"] ?? "").split(";")[0].trim().toLowerCase() };
    },
    resetEngine(userId) { if (userId) engines.delete(userId); else engines.clear(); },
    async engine(userId) {
      const hit = engines.get(userId);
      if (hit && Date.now() - hit.at < ENGINE_TTL_MS) return hit.val;
      const entry = { at: Date.now(), val: "" as Engine };
      engines.set(userId, entry);
      const s = await core.tryWaha<Record<string, unknown>>(userId, "GET", "/api/sessions/{session}");
      const e = String((s?.engine as Record<string, unknown> | undefined)?.engine ?? "").toUpperCase();
      entry.val = e === "WEBJS" || e === "NOWEB" || e === "GOWS" ? e : "";
      return entry.val;
    },
    fail(error, what = "WAHA request") {
      if (error instanceof WahaError) {
        if (error.status === 501 || error.status === 405) throw ctx.httpError(501, "unsupported", "This WAHA engine does not support that.");
        if (error.status === 422) throw ctx.httpError(409, "session_not_ready", "WhatsApp is not connected. Open the connection screen and link your phone.");
        if (error.status === 401 || error.status === 403) throw ctx.httpError(502, "waha_unauthorized", "WAHA refused the API key.");
        ctx.log.warn(what + " failed", { status: error.status });
        throw ctx.httpError(502, "waha_unavailable", error.status ? `WAHA answered ${error.status}${error.detail ? ": " + error.detail : ""}${error.status === 404 && !error.detail ? " (not found: check the WAHA address and session name in the plugin settings)" : ""}` : "WAHA did not answer. Check that your instance is running.");
      }
      throw error;
    },
    async guard(fn, what) { try { return await fn(); } catch (e) { return core.fail(e, what); } },
    obj: (v) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {}),
    chatId(v) { const id = typeof v === "string" ? normId(v) : ""; if (!id || !CHAT_ID.test(id)) throw ctx.httpError(400, "invalid_chat", "chatId is invalid"); return id; },
    text(v, max = TEXT_MAX, name = "text") { if (typeof v !== "string" || !v.trim() || v.length > max) throw ctx.httpError(400, "invalid_" + name, `${name} must be 1-${max} characters`); return v; },
    optText: (v, max = 1000) => (typeof v === "string" ? v.slice(0, max) : ""),
    on(event, fn) { listeners.set(event, [...(listeners.get(event) ?? []), fn]); },
    async emit(userId, e) {
      for (const fn of [...(listeners.get(e.event) ?? []), ...(listeners.get("*") ?? [])]) {
        try { await fn(userId, e); } catch (error) { ctx.log.warn("webhook listener failed", { event: e.event, error: error instanceof Error ? error.message : "error" }); }
      }
    },
    publish(userId, name, data) { try { ctx.events.publish(userId, name, data); } catch { /* an oversized frame is dropped */ } },
  };
  return core;
}
