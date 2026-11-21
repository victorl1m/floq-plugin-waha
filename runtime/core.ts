// Shared plumbing of every runtime module: owner check, configuration, the WAHA HTTP client, input validation and the webhook event bus.
import type { PluginContext, PluginFetchResponse } from "../shared/sdk";
import { CHAT_ID, normId } from "./ids.js";
import { TEXT_MAX, WahaError, normalizeBase, sessionName } from "./client.js";

export interface WahaConfig { base: string; apiKey: string; session: string }
export interface WahaCall { query?: Record<string, string | number | boolean | undefined>; body?: unknown; headers?: Record<string, string> }
export type Engine = "WEBJS" | "NOWEB" | "GOWS" | "";
export interface WebhookEvent { event: string; session: string; payload: Record<string, unknown>; me: Record<string, unknown>; engine: string }
export type WebhookListener = (userId: string, e: WebhookEvent) => void | Promise<void>;

export interface Core {
  ctx: PluginContext;
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

export function createCore(ctx: PluginContext): Core {
  const listeners = new Map<string, WebhookListener[]>();
  let engineAt = 0, engineVal: Engine = "";

  const pending = new Set<Promise<unknown>>();
  const core: Core = {
    ctx,
    bg(work) { const p = work.catch(() => undefined).finally(() => pending.delete(p)); pending.add(p); },
    async idle() { while (pending.size) await Promise.allSettled([...pending]); },
    async owner(userId) {
      const o = await ctx.installOwner();
      if (!o || o !== userId) throw ctx.httpError(403, "forbidden", "The WhatsApp inbox belongs to the administrator who set it up.");
      return o;
    },
    async config(userId) {
      const settings = await ctx.settings.get(userId);
      const base = normalizeBase(settings.baseUrl);
      const apiKey = await ctx.secrets.getInstall("WAHA_API_KEY");
      return { base, apiKey, session: sessionName(settings.session), missingSettings: base ? [] : ["baseUrl"], missingSecrets: apiKey ? [] : ["WAHA_API_KEY"] };
    },
    async ready(userId) {
      const c = await core.config(userId);
      if (!c.base || !c.apiKey) throw ctx.httpError(409, "not_configured", "Set the WAHA address and the WAHA_API_KEY secret first.");
      return { base: c.base, apiKey: c.apiKey, session: c.session };
    },
    async waha<T>(userId: string, method: "GET" | "POST" | "PUT" | "DELETE", path: string, call: WahaCall = {}): Promise<T> {
      const c = await core.ready(userId);
      const needsSession = !path.includes("{session}") && !path.startsWith("/api/sessions");
      const bodyObj = call.body && typeof call.body === "object" && !Array.isArray(call.body) ? (call.body as Record<string, unknown>) : null;
      const query = { ...(needsSession && call.body === undefined ? { session: c.session } : {}), ...(call.query ?? {}) };
      const qs = Object.entries(query).filter(([, v]) => v !== undefined).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&");
      const url = c.base + path.replaceAll("{session}", encodeURIComponent(c.session)) + (qs ? (path.includes("?") ? "&" : "?") + qs : "");
      const body = call.body === undefined ? undefined : JSON.stringify(needsSession && bodyObj ? { session: c.session, ...bodyObj } : call.body);
      let res: PluginFetchResponse;
      try { res = await ctx.fetchUserUrl(userId, url, { method, headers: { "X-Api-Key": c.apiKey, Accept: "application/json", ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(call.headers ?? {}) }, body }); }
      catch { throw new WahaError(0); }
      if (!res.ok) throw new WahaError(res.status);
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
    async engine(userId) {
      if (Date.now() - engineAt < ENGINE_TTL_MS) return engineVal;
      engineAt = Date.now();
      const s = await core.tryWaha<Record<string, unknown>>(userId, "GET", "/api/sessions/{session}");
      const e = String((s?.engine as Record<string, unknown> | undefined)?.engine ?? "").toUpperCase();
      engineVal = e === "WEBJS" || e === "NOWEB" || e === "GOWS" ? e : "";
      return engineVal;
    },
    fail(error, what = "WAHA request") {
      if (error instanceof WahaError) {
        if (error.status === 501 || error.status === 405) throw ctx.httpError(501, "unsupported", "This WAHA engine does not support that.");
        if (error.status === 422) throw ctx.httpError(409, "session_not_ready", "WhatsApp is not connected. Open the connection screen and link your phone.");
        if (error.status === 401 || error.status === 403) throw ctx.httpError(502, "waha_unauthorized", "WAHA refused the API key.");
        ctx.log.warn(what + " failed", { status: error.status });
        throw ctx.httpError(502, "waha_unavailable", error.status ? "WAHA could not do that." : "WAHA did not answer. Check that your instance is running.");
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
