// Several WhatsApp accounts in one inbox. An account is a WAHA session attached to Floq; the list is ordered and its first entry is the primary
// account (what agents use when they name none). Every other route takes `session` (query or body) and works on that account alone.
import type { Deps } from "./extras.js";
import { WahaError } from "./client.js";
import { SESSION_NAME, SESSION_TABLES, scopeOf, type Account } from "./core.js";
import { accountOf, engineOf, hasWebhook, statusOf, webhookFor, webhooksOf } from "./session.js";

type Obj = Record<string, unknown>;
/** What happened to the webhook of a session that was attached or created: it already posts to Floq, Floq added it, or it has to be set by hand. */
export type WebhookResult = "ok" | "added" | "manual" | "unknown";

export function registerAccounts({ core, identity, store }: Deps): void {
  const { ctx } = core;
  const R = ctx.routes;
  const label = (v: unknown) => core.optText(v, 40).replace(/[\u0000-\u001f\u007f-\u009f]/g, "").trim();
  const nameOf = (v: unknown) => {
    const name = typeof v === "string" ? v.trim() : "";
    if (!SESSION_NAME.test(name)) throw ctx.httpError(400, "invalid_session", "A session name is 1-64 letters, digits, dots, dashes or underscores.");
    return name;
  };
  const changed = (owner: string) => { try { core.host.events.publish(owner, "accounts", {}); } catch { /* nobody is listening */ } };

  /** Every session of the WAHA instance, or why it cannot say. */
  async function sessions(userId: string): Promise<{ list: Obj[] | null; down: "" | "UNREACHABLE" | "UNAUTHORIZED"; error?: WahaError }> {
    try {
      const r = await core.waha<unknown>(userId, "GET", "/api/sessions", { query: { all: "true" } });
      return { list: Array.isArray(r) ? r.filter((x): x is Obj => !!x && typeof x === "object" && typeof (x as Obj).name === "string") : [], down: "" };
    } catch (e) {
      if (!(e instanceof WahaError)) throw e;
      return { list: null, down: e.status === 401 || e.status === 403 ? "UNAUTHORIZED" : "UNREACHABLE", error: e };
    }
  }
  /** Gives a session Floq's webhook when another attached session shows what it is. Changing a session's config makes WAHA restart it. */
  async function ensureWebhook(userId: string, owner: string, name: string, all: Obj[]): Promise<WebhookResult> {
    const attached = new Set((await core.accounts(owner)).map((a) => a.session));
    const hook = webhookFor(ctx.pluginId, all.filter((x) => x.name !== name && attached.has(String(x.name))), await ctx.secrets.getInstall("WAHA_WEBHOOK_HMAC"));
    const s = all.find((x) => x.name === name) ?? {};
    // No attached session carries a webhook of its own: WAHA's environment sets one for every session, or it is set by hand.
    if (!hook) return webhooksOf(s).length ? "ok" : "unknown";
    if (hasWebhook(s, hook)) return "ok";
    const config = s.config && typeof s.config === "object" ? (s.config as Obj) : {};
    try { await core.waha(userId, "PUT", `/api/sessions/${encodeURIComponent(name)}`, { body: { config: { ...config, webhooks: [...webhooksOf(s), hook] } } }); return "added"; }
    catch (e) { if (e instanceof WahaError) return "manual"; throw e; }
  }

  R.get("/accounts", async ({ userId }) => {
    const { owner } = core.split(userId), list = await core.accounts(owner);
    const all = await sessions(userId);
    let dirty = false;
    const out = [];
    for (const [i, a] of list.entries()) {
      const scope = scopeOf(owner, a.session), w = all.list?.find((x) => x.name === a.session);
      const acct = accountOf(w);
      if (w?.me) await identity.saveMe(scope, w.me).catch(() => undefined);
      // The last known name and number stay on the entry, so the switcher can show them while WAHA is down or the phone is logged out.
      if (acct && (acct.name || acct.phone) && (acct.name !== a.name || (acct.phone && acct.phone !== a.phone))) { list[i] = { ...a, name: acct.name || a.name, phone: acct.phone || a.phone }; dirty = true; }
      const chats = (await store.listChats(scope)).chats;
      out.push({
        session: a.session, label: a.label, name: list[i].name, phone: list[i].phone || null, primary: i === 0,
        status: all.list ? (w ? statusOf(w) : "MISSING") : all.down, engine: engineOf(w),
        unread: chats.filter((c) => Number(c.unread) > 0 && c.muted !== true).length,
      });
    }
    if (dirty) await core.saveAccounts(owner, [...list]);
    return { accounts: out, primary: list[0]?.session ?? null };
  });

  // WAHA sessions that are not one of the accounts yet.
  R.get("/accounts/available", async ({ userId }) => {
    const { owner } = core.split(userId), attached = new Set((await core.accounts(owner)).map((a) => a.session));
    const all = await sessions(userId);
    if (!all.list) return core.fail(all.error, "sessions");
    return { sessions: all.list.filter((x) => SESSION_NAME.test(String(x.name)) && !attached.has(String(x.name))).slice(0, 50).map((x) => {
      const acct = accountOf(x);
      return { name: String(x.name), status: statusOf(x), engine: engineOf(x), account: acct ? { name: acct.name, phone: acct.phone || null } : null };
    }) };
  });

  // Attach a session that already exists in WAHA. Nothing is created and nobody is logged out.
  R.post("/accounts/attach", async ({ userId, body }) => {
    const { owner } = core.split(userId), o = core.obj(body), name = nameOf(o.name), list = await core.accounts(owner);
    if (list.some((a) => a.session === name)) return { ok: true, session: name, webhook: "ok" as WebhookResult };
    if (list.length >= 20) throw ctx.httpError(400, "too_many_accounts", "Up to 20 accounts can be attached.");
    const all = await sessions(userId);
    if (!all.list) return core.fail(all.error, "sessions");
    const w = all.list.find((x) => x.name === name);
    if (!w) throw ctx.httpError(404, "unknown_session", `WAHA has no session called "${name}".`);
    const acct = accountOf(w);
    const entry: Account = { session: name, label: label(o.label), name: acct?.name ?? "", phone: acct?.phone ?? "", addedAt: new Date().toISOString() };
    const webhook = await ensureWebhook(userId, owner, name, all.list);
    await core.saveAccounts(owner, [...list, entry]);
    const scope = scopeOf(owner, name);
    if (w.me) await identity.saveMe(scope, w.me).catch(() => undefined);
    const status = statusOf(w);
    if (webhook !== "added" && (status === "STOPPED" || status === "FAILED")) await core.tryWaha(scope, "POST", "/api/sessions/{session}/start");
    changed(owner);
    return { ok: true, session: name, status, webhook };
  });

  // A new WAHA session for another phone: it starts at once and waits for the QR scan (GET /session/qr?session=<name>).
  R.post("/accounts/create", async ({ userId, body }) => {
    const { owner } = core.split(userId), o = core.obj(body), list = await core.accounts(owner);
    if (list.length >= 20) throw ctx.httpError(400, "too_many_accounts", "Up to 20 accounts can be attached.");
    const all = await sessions(userId);
    if (!all.list) return core.fail(all.error, "sessions");
    const taken = new Set([...all.list.map((x) => String(x.name)), ...list.map((a) => a.session)]);
    let name = "";
    if (o.name !== undefined && o.name !== null && o.name !== "") {
      name = nameOf(o.name);
      if (taken.has(name)) throw ctx.httpError(409, "session_exists", `WAHA already has a session called "${name}". Attach it instead, or pick another name.`);
    } else {
      for (let i = 1; !name; i++) { const n = i === 1 ? "default" : `floq-${i}`; if (!taken.has(n)) name = n; }
    }
    const hook = webhookFor(ctx.pluginId, all.list.filter((x) => list.some((a) => a.session === x.name)), await ctx.secrets.getInstall("WAHA_WEBHOOK_HMAC"));
    await core.guard(async () => {
      try { await core.waha(userId, "POST", "/api/sessions", { body: { name, start: true, ...(hook ? { config: { webhooks: [hook] } } : {}) } }); }
      catch (e) {
        // WAHA before 2024.9 creates a session by starting it.
        if (!(e instanceof WahaError) || (e.status !== 404 && e.status !== 405)) throw e;
        await core.waha(userId, "POST", "/api/sessions/start", { body: { name, ...(hook ? { config: { webhooks: [hook] } } : {}) } });
      }
    }, "new session");
    await core.saveAccounts(owner, [...list, { session: name, label: label(o.label), name: "", phone: "", addedAt: new Date().toISOString() }]);
    changed(owner);
    return { ok: true, session: name, webhook: (hook ? "added" : "unknown") as WebhookResult };
  });

  // Label and order. `primary: true` moves the account to the front: it becomes what agents use by default.
  R.post("/accounts/update", async ({ userId, body }) => {
    const { owner, session } = core.split(userId), o = core.obj(body);
    if (typeof o.session !== "string") throw ctx.httpError(400, "invalid_session", "Name the account with \"session\".");
    let list = (await core.accounts(owner)).map((a) => (a.session === session && o.label !== undefined ? { ...a, label: label(o.label) } : a));
    if (o.primary === true) list = [...list.filter((a) => a.session === session), ...list.filter((a) => a.session !== session)];
    await core.saveAccounts(owner, list);
    changed(owner);
    return { ok: true };
  });

  // "Remove from Floq": the account leaves the inbox. The WAHA session keeps running and the phone stays linked, unless `discard` is set for a
  // session that was created here and never linked (a cancelled "Link a new WhatsApp"): that one is deleted in WAHA too.
  R.post("/accounts/remove", async ({ userId, body }) => {
    const { owner, session } = core.split(userId), o = core.obj(body);
    if (typeof o.session !== "string") throw ctx.httpError(400, "invalid_session", "Name the account with \"session\".");
    const list = await core.accounts(owner);
    let discarded = false;
    if (o.discard === true) {
      const s = await core.tryWaha<Obj>(userId, "GET", "/api/sessions/{session}");
      if (s && statusOf(s) !== "WORKING" && !s.me) discarded = (await core.tryWaha(userId, "DELETE", "/api/sessions/{session}")) !== undefined;
    }
    await core.saveAccounts(owner, list.filter((a) => a.session !== session));
    if (o.deleteData === true || o.discard === true) {
      for (const t of [...SESSION_TABLES, "messages"]) await ctx.db.query(`DELETE FROM {{p}}${t} WHERE user_id = $1 AND session = $S`, [userId]);
      await ctx.kv.set(userId, "me", null);
    }
    core.resetEngine(userId);
    changed(owner);
    return { ok: true, discarded, deletedData: o.deleteData === true || o.discard === true };
  });
}
