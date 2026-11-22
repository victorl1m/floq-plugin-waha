// Full history: WAHA keeps the chats of a session only when its store is on before the phone is linked, so this module turns it on while the
// session still waits for the scan, then (once the account works) pulls contacts, chats and every chat's messages into the inbox in the
// background. Contacts are also kept fresh afterwards. Everything is per account, idempotent (rows are keyed by message id and stanza) and
// resumable: {{p}}history_chats holds where the paging of each chat stands.
import type { Core } from "./core.js";
import { scopeOf } from "./core.js";
import type { Identity } from "./identity.js";
import type { Store } from "./messages.js";
import { WahaError } from "./client.js";
import { isGroup, isUser, lidOf, normId, pnOf } from "./ids.js";
import { parseMessage, rec } from "./parse.js";

type Obj = Record<string, unknown>;
export type HistoryState = "idle" | "running" | "done" | "cancelled" | "failed";
export type HistoryPhase = "contacts" | "chats" | "messages" | null;
export interface HistoryStatus {
  state: HistoryState; phase: HistoryPhase; chatsTotal: number; chatsDone: number; messages: number; contacts: number;
  startedAt: string | null; finishedAt: string | null; error: string | null; everRan: boolean;
  contactsSyncedAt: string | null; contactsSyncing: boolean; limits: { perChat: number; total: number };
}
interface Job { state: HistoryState; phase: HistoryPhase; chatsTotal: number; chatsDone: number; messages: number; seen: number; contacts: number; startedAt: string | null; finishedAt: string | null; error: string | null; follow?: number[] }
export interface StoreView { willImport: boolean; error: string | null }

/** Messages and chats asked from WAHA per request. */
export const HISTORY_PAGE = 100, CHATS_PAGE = 100, CONTACTS_PAGE = 500, LIDS_PAGE = 1000, GROUPS_PAGE = 100;
/** Defaults of the settings historyPerChat / historyTotal: newest messages kept per chat and per import. */
export const HISTORY_PER_CHAT = 1000, HISTORY_TOTAL = 50_000;
export const HISTORY_CHATS_MAX = 5000, CONTACTS_MAX = 20_000, LIDS_MAX = 50_000;
/** Contacts are read again this often, and at most this often when a session comes back. */
export const CONTACTS_EVERY_MS = 6 * 3600_000, CONTACTS_MIN_MS = 10 * 60_000;
/** After a fresh link the phone keeps handing its history to WAHA for a while: quiet passes pick up what arrived later. */
export const FOLLOW_UP_MS = [60_000, 4 * 60_000, 12 * 60_000, 30 * 60_000];
/** A session whose config could not be changed is not asked again for this long (a config change restarts it). */
const PREPARE_RETRY_MS = 10 * 60_000;
const TICK_MS = 60_000;
/** What a new session is created with: NOWEB stores chats, contacts and messages only with its store on, and about a year back with fullSync. */
export const STORE_CONFIG = { noweb: { store: { enabled: true, fullSync: true } } };
const NO_STORE = "This account was linked while WAHA's history store was off, so WAHA has no past chats to give. Log out and link the phone again from Floq to import the history.";

const realName = (v: unknown) => { const n = typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").trim().slice(0, 120) : ""; return n && !n.includes("@") && !/^[+\d\s()-]+$/.test(n) ? n : ""; };
const skipped = (id: string) => !id || id === "status@broadcast" || id.endsWith("@newsletter") || id.endsWith("@broadcast");
const failText = (e: unknown) => (e instanceof WahaError ? (e.status ? `WAHA answered ${e.status}${e.detail ? ": " + e.detail : ""}` : "WAHA did not answer.") : e instanceof Error ? e.message.slice(0, 200) : "error");
const fresh = (): Job => ({ state: "idle", phase: null, chatsTotal: 0, chatsDone: 0, messages: 0, seen: 0, contacts: 0, startedAt: null, finishedAt: null, error: null });

export interface History {
  /** The config part a session is created with so its history is kept. */
  storeConfig(): Obj;
  /** Remembers that this account is about to be linked: the import starts by itself when it first works. */
  expect(userId: string, error?: string): Promise<void>;
  /** Will the history be there after the scan? Read from the session as WAHA reports it; changes nothing. */
  view(userId: string, s: Obj | null): Promise<StoreView & { engine: string; fullSync: boolean }>;
  /**
   * For a session that waits for the scan: turns the engine's store on (the rest of the config, webhooks included, is sent back unchanged) and
   * restarts it. A linked session is never touched. A refusal is remembered and shown; linking goes on without history.
   */
  prepare(userId: string, s?: Obj | null): Promise<StoreView & { restarted: boolean }>;
  /** Call with every session status seen: a session that waited for a scan and now works gets its import; a live WORKING refreshes contacts. */
  noteStatus(userId: string, status: string, live?: boolean): Promise<void>;
  status(userId: string): Promise<HistoryStatus>;
  start(userId: string): Promise<HistoryStatus>;
  cancel(userId: string): Promise<HistoryStatus>;
  /** Reads every contact, lid pair and group name WAHA has. Resolves the number of contacts, or null when it did not run. */
  syncContacts(userId: string, force?: boolean): Promise<number | null>;
  contactsState(userId: string): Promise<{ syncedAt: string | null; syncing: boolean }>;
  /** Stops background work at the next page; a running import stays "running" and resumes on the next start. */
  pause(): void;
}

export function createHistory(core: Core, identity: Identity, store: Store): History {
  const { ctx, host } = core;
  const q = (sql: string, params: unknown[]) => ctx.db.query(sql, params);
  let paused = false;
  const active = new Map<string, { cancel: boolean; silent: boolean }>();
  const tried = new Map<string, { at: number; error: string }>();
  const pending = new Map<string, boolean>();
  const follow = new Map<string, number[]>();
  const syncing = new Set<string>(), contactsTried = new Map<string, number>();
  let versionEngine: { at: number; val: string } | null = null;

  const job = async (userId: string): Promise<Job> => { const v = core.obj(await ctx.kv.get(userId, "history")); return typeof v.state === "string" ? { ...fresh(), ...(v as unknown as Job) } : fresh(); };
  const num = (v: unknown, dflt: number, max: number) => { const n = Math.trunc(Number(v)); return Number.isFinite(n) && n > 0 ? Math.min(n, max) : dflt; };
  async function limits(userId: string) {
    const s = await ctx.settings.get(userId);
    return { perChat: num(s.historyPerChat, HISTORY_PER_CHAT, 100_000), total: num(s.historyTotal, HISTORY_TOTAL, 2_000_000) };
  }
  async function shape(userId: string, j: Job): Promise<HistoryStatus> {
    const c = await self.contactsState(userId);
    return { state: j.state, phase: j.state === "running" ? j.phase : null, chatsTotal: j.chatsTotal, chatsDone: Math.min(j.chatsDone, j.chatsTotal), messages: j.messages, contacts: j.contacts,
      startedAt: j.startedAt, finishedAt: j.finishedAt, error: j.error, everRan: j.state !== "idle", contactsSyncedAt: c.syncedAt, contactsSyncing: c.syncing, limits: await limits(userId) };
  }
  async function put(userId: string, j: Job, announce = true) {
    await ctx.kv.set(userId, "history", j);
    if (announce) core.publish(userId, "history", await shape(userId, j));
  }
  async function engineOf(userId: string, s: Obj | null): Promise<string> {
    const e = String(rec(s?.engine).engine ?? "").toUpperCase();
    if (e) return e;
    // A session that is not running does not always say: new sessions get the server's default engine.
    if (!versionEngine || Date.now() - versionEngine.at > 5 * 60_000) versionEngine = { at: Date.now(), val: String(rec(await core.tryWaha(userId, "GET", "/api/version")).engine ?? "").toUpperCase() };
    return versionEngine.val;
  }
  const statusOf = (s: Obj | null) => String(s?.status ?? "").toUpperCase();
  function storeOf(s: Obj | null, engine: string): { on: boolean; full: boolean } {
    const cfg = rec(s?.config);
    if (engine === "NOWEB") { const st = rec(rec(cfg.noweb).store); return { on: st.enabled === true, full: st.enabled === true && st.fullSync === true }; }
    // GOWS stores everything unless a part is switched off; WEBJS reads the chats from the phone's own web session.
    if (engine === "GOWS") { const st = rec(rec(cfg.gows).storage), on = st.messages !== false && st.chats !== false && st.contacts !== false; return { on, full: on }; }
    return { on: true, full: true };
  }

  // ---- contacts ----
  async function contactsPass(userId: string): Promise<number | null> {
    const started = new Date().toISOString();
    let n = 0, ok = false, complete = false, first = "";
    for (let offset = 0; offset < CONTACTS_MAX; offset += CONTACTS_PAGE) {
      if (paused) return null;
      const list = await core.tryWaha<unknown>(userId, "GET", "/api/contacts/all", { query: { limit: CONTACTS_PAGE, offset, sortBy: "id", sortOrder: "asc" } });
      if (!Array.isArray(list)) break;
      ok = true;
      const head = normId(rec(list[0]).id);
      // An empty page ends the list; so does an engine that ignores the offset and answers the same page again.
      if (!list.length || (offset > 0 && head === first)) { complete = true; break; }
      if (offset === 0) first = head;
      for (const item of list) {
        const o = rec(item), id = normId(o.id);
        if (!id || !isUser(id) || o.isGroup === true || o.isMe === true) continue;
        const name = realName(o.name) || realName(o.shortName), biz = realName(o.verifiedName ?? o.businessName ?? o.verifiedBizName), push = realName(o.pushname ?? o.pushName ?? o.notify) || biz;
        const number = typeof o.number === "string" && /^\d{8,15}$/.test(o.number) && !lidOf(id) ? o.number : "";
        await q(
          `INSERT INTO {{p}}contacts AS c (user_id, session, chat_id, name, push_name, phone, blocked, is_business, saved, business_name, synced_at)
           VALUES ($1,$S,$2,$3,$4,$5,COALESCE($6::boolean,FALSE),$7,$8,$9,now())
           ON CONFLICT (user_id, session, chat_id) DO UPDATE SET
             name = CASE WHEN EXCLUDED.name <> '' THEN EXCLUDED.name ELSE c.name END, push_name = CASE WHEN EXCLUDED.push_name <> '' THEN EXCLUDED.push_name ELSE c.push_name END,
             phone = CASE WHEN EXCLUDED.phone <> '' THEN EXCLUDED.phone ELSE c.phone END, blocked = COALESCE($6::boolean, c.blocked), is_business = c.is_business OR EXCLUDED.is_business,
             saved = EXCLUDED.saved, business_name = CASE WHEN EXCLUDED.business_name <> '' THEN EXCLUDED.business_name ELSE c.business_name END, synced_at = now(), updated_at = now()`,
          [userId, id, name, push, number, typeof o.isBlocked === "boolean" ? o.isBlocked : null, o.isBusiness === true || o.isEnterprise === true || Boolean(biz), typeof o.isMyContact === "boolean" ? o.isMyContact : Boolean(name), biz]);
        // The id WAHA lists is the one that exists: the other spelling of a Brazilian mobile folds into it.
        if (pnOf(id)) await identity.seen(userId, id, true);
        n++;
      }
    }
    for (let offset = 0, head = ""; offset < LIDS_MAX; offset += LIDS_PAGE) {
      if (paused) return null;
      const list = await core.tryWaha<unknown>(userId, "GET", "/api/{session}/lids", { query: { limit: LIDS_PAGE, offset } });
      if (!Array.isArray(list) || !list.length) break;
      const h = normId(rec(list[0]).lid);
      if (offset > 0 && h === head) break;
      head = h;
      for (const row of list) {
        const lid = lidOf(normId(rec(row).lid)), pn = pnOf(normId(rec(row).pn));
        if (lid && pn) { await identity.seen(userId, pn, true); await identity.link(userId, lid, pn); }
      }
    }
    for (let offset = 0, head = ""; offset < HISTORY_CHATS_MAX; offset += GROUPS_PAGE) {
      if (paused) return null;
      const raw = await core.tryWaha<unknown>(userId, "GET", "/api/{session}/groups", { query: { limit: GROUPS_PAGE, offset, exclude: "participants" } });
      // Some engine versions answer with an object keyed by group id.
      const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? Object.values(raw as Obj) : null;
      if (!list || !list.length) break;
      const idOf = (g: unknown) => normId(rec(g).id ?? rec(g).JID ?? rec(g).jid);
      if (offset > 0 && idOf(list[0]) === head) break;
      head = idOf(list[0]);
      for (const g of list) {
        const o = rec(g), id = idOf(g), subject = realName(o.subject ?? o.Name ?? o.name ?? rec(o.groupMetadata).subject);
        if (id && isGroup(id) && subject) await identity.upsertContact(userId, id, { name: subject });
      }
      if (!Array.isArray(raw)) break;
    }
    if (!ok) return null;
    // Someone no longer in the phone's address book stays a contact of the inbox, but not a saved one.
    if (complete) await q(`UPDATE {{p}}contacts SET saved = FALSE WHERE user_id = $1 AND session = $S AND saved AND (synced_at IS NULL OR synced_at < $2::timestamptz)`, [userId, started]);
    await ctx.kv.set(userId, "contactsSyncedAt", new Date().toISOString());
    return n;
  }

  // ---- the import ----
  /** Lists every chat WAHA has into {{p}}history_chats (newest first) and shows each one in the inbox with its name and last message. */
  async function listChats(userId: string, ctl: { cancel: boolean }, session: string, startedAt: string): Promise<{ total: number; added: number }> {
    const me = await identity.me(userId);
    let overview = true, added = 0, position = Number((await q(`SELECT COALESCE(MAX(position), -1)::int AS n FROM {{p}}history_chats WHERE user_id = $1 AND session = $S`, [userId])).rows[0]?.n ?? -1) + 1, head = "";
    for (let offset = 0; offset < HISTORY_CHATS_MAX; offset += CHATS_PAGE) {
      if (paused || ctl.cancel) break;
      let list: unknown;
      try {
        list = overview ? await core.waha(userId, "GET", "/api/{session}/chats/overview", { query: { limit: CHATS_PAGE, offset } }) : await core.waha(userId, "GET", "/api/{session}/chats", { query: { limit: CHATS_PAGE, offset } });
      } catch (e) {
        if (!(e instanceof WahaError)) throw e;
        // No overview on this WAHA: the plain list has the same ids.
        if (overview && offset === 0) { overview = false; offset -= CHATS_PAGE; continue; }
        if (offset === 0) throw e;
        break;
      }
      if (!Array.isArray(list) || !list.length) break;
      const idOf = (c: unknown) => normId(rec(c).id ?? rec(c).jid ?? rec(c).JID);
      if (offset > 0 && idOf(list[0]) === head) break;
      head = idOf(list[0]);
      for (const item of list) {
        const o = rec(item), id = idOf(item);
        if (skipped(id)) continue;
        const name = realName(o.name);
        if (name) await identity.upsertContact(userId, id, { name });
        const last = rec(o.lastMessage);
        if (Object.keys(last).length) {
          const m = parseMessage({ ...last, from: last.from ?? (last.fromMe ? undefined : id), to: last.to ?? (last.fromMe ? id : undefined) }, session, me);
          if (m && (m.chatId === id || isGroup(id) === isGroup(m.chatId))) { const row = { ...m, chatId: isGroup(id) ? id : m.chatId }; if ((await store.save(userId, row, { history: true })) === "new") added++; await seenUntil(userId, row.chatId, startedAt); }
        }
        const st = rec(o._chat);
        if (typeof st.archived === "boolean" || typeof st.archive === "boolean") await store.setState(userId, await identity.canonical(userId, id), { archived: st.archived === true || st.archive === true });
        const ins = await q(`INSERT INTO {{p}}history_chats (user_id, session, chat_id, position) VALUES ($1,$S,$2,$3) ON CONFLICT (user_id, session, chat_id) DO NOTHING RETURNING chat_id`, [userId, id, position]);
        if (ins.rows.length) position++;
      }
    }
    return { total: Number((await q(`SELECT COUNT(*)::int AS n FROM {{p}}history_chats WHERE user_id = $1 AND session = $S`, [userId])).rows[0]?.n ?? 0), added };
  }
  /** History is not news: what was sent before the import began counts as read, unless the chat already has a read mark. */
  const seenUntil = (userId: string, chatId: string, at: string) => q(`INSERT INTO {{p}}chat_reads (user_id, session, chat_id, read_at) VALUES ($1,$S,$2,$3) ON CONFLICT (user_id, session, chat_id) DO NOTHING`, [userId, chatId, at]);

  /** Pages one chat back from its newest message. Resolves what was read and what was new; "stopped" when the work was interrupted. */
  async function importChat(userId: string, row: Obj, ctl: { cancel: boolean }, o: { session: string; startedAt: string; perChat: number; room: number; quick: boolean; onPage?: (seen: number, added: number) => Promise<void> }): Promise<{ seen: number; added: number; stopped: boolean; failed: boolean }> {
    const target = String(row.chat_id), me = await identity.me(userId);
    let offset = Number(row.next_offset) || 0, seen = Number(row.seen) || 0, total = 0, added = 0, sig = "", failed = false;
    const touched = new Set<string>();
    while (seen < o.perChat && total < o.room) {
      if (paused || ctl.cancel) return { seen: total, added, stopped: true, failed };
      let list: unknown;
      try { list = await core.waha(userId, "GET", `/api/{session}/chats/${encodeURIComponent(target)}/messages`, { query: { limit: HISTORY_PAGE, offset, downloadMedia: false } }); }
      catch (e) { if (!(e instanceof WahaError)) throw e; failed = true; break; }
      if (!Array.isArray(list) || !list.length) break;
      // An engine that ignores the offset answers the same page again: that is the end.
      const now = String(rec(list[0]).id ?? "") + "|" + String(rec(list[list.length - 1]).id ?? "") + "|" + list.length;
      if (now === sig) break;
      sig = now;
      let pageNew = 0, pageSeen = 0;
      for (const item of list) {
        if (seen + pageSeen >= o.perChat || total + pageSeen >= o.room) break;
        pageSeen++;
        const x = rec(item);
        const m = parseMessage({ ...x, from: x.from ?? (x.fromMe ? undefined : target), to: x.to ?? (x.fromMe ? target : undefined) }, o.session, me);
        if (!m || (!isGroup(target) && isGroup(m.chatId)) || skipped(m.chatId)) continue;
        // WAHA answers one contact's lid chat and phone chat together: both ids are the same person.
        if (isUser(target) && isUser(m.chatId) && m.chatId !== target) { const lid = lidOf(target) ?? lidOf(m.chatId), pn = pnOf(target) ?? pnOf(m.chatId); if (lid && pn) { await identity.seen(userId, pn, true); await identity.link(userId, lid, pn); } }
        const saved = isGroup(target) ? { ...m, chatId: target } : m;
        if ((await store.save(userId, saved, { history: true })) === "new") pageNew++;
        if (!touched.has(saved.chatId)) { touched.add(saved.chatId); await seenUntil(userId, saved.chatId, o.startedAt); }
      }
      offset += HISTORY_PAGE; seen += pageSeen; total += pageSeen; added += pageNew;
      await q(`UPDATE {{p}}history_chats SET next_offset = $3, seen = $4, imported = imported + $5, updated_at = now() WHERE user_id = $1 AND session = $S AND chat_id = $2`, [userId, target, offset, seen, pageNew]);
      if (o.onPage) await o.onPage(pageSeen, pageNew);
      // A quiet pass only looks for what arrived since: a page with nothing new ends the chat.
      if (o.quick && pageNew === 0) break;
    }
    await q(`UPDATE {{p}}history_chats SET state = $3, updated_at = now() WHERE user_id = $1 AND session = $S AND chat_id = $2`, [userId, target, failed ? "failed" : "done"]);
    return { seen: total, added, stopped: false, failed };
  }
  const nextChat = async (userId: string) => (await q(`SELECT chat_id, next_offset, seen FROM {{p}}history_chats WHERE user_id = $1 AND session = $S AND state = 'pending' ORDER BY position ASC, chat_id ASC LIMIT 1`, [userId])).rows[0];

  /** The visible import. Its phase and the per-chat cursors survive a restart: run() goes on where they stand. */
  async function run(userId: string, ctl: { cancel: boolean; silent: boolean }) {
    let j = await job(userId);
    const stop = async (state: HistoryState, error: string | null = null) => {
      j = { ...j, state, error, phase: null, finishedAt: new Date().toISOString() };
      await put(userId, j);
      core.publish(userId, "chats", {});
    };
    try {
      const { session } = core.split(userId), lim = await limits(userId), startedAt = j.startedAt ?? new Date().toISOString();
      if (j.phase === "contacts" || j.phase === null) {
        j = { ...j, phase: "contacts" }; await put(userId, j);
        await identity.ensure(userId, true);
        syncing.add(userId);
        let n: number | null;
        try { n = await contactsPass(userId); } finally { syncing.delete(userId); }
        if (paused) return;
        if (ctl.cancel) return await stop("cancelled");
        j = { ...j, contacts: n ?? 0, phase: "chats" }; await put(userId, j);
        if (n !== null) core.publish(userId, "contacts", {});
      }
      if (j.phase === "chats") {
        let listed: { total: number; added: number };
        try { listed = await listChats(userId, ctl, session, startedAt); }
        catch (e) {
          if (!(e instanceof WahaError)) throw e;
          const s = await core.tryWaha<Obj>(userId, "GET", "/api/sessions/{session}");
          const off = s ? !storeOf(s, await engineOf(userId, s)).on : false;
          return await stop("failed", off ? NO_STORE : failText(e));
        }
        if (paused) return;
        if (ctl.cancel) return await stop("cancelled");
        j = { ...j, chatsTotal: listed.total, messages: j.messages + listed.added, phase: "messages" }; await put(userId, j);
        core.publish(userId, "chats", {});
      }
      for (;;) {
        if (paused) return;
        if (ctl.cancel) return await stop("cancelled");
        const row = await nextChat(userId);
        if (!row) break;
        if (j.seen >= lim.total) {
          // The overall cap is reached: the remaining chats keep their name and last message, without their past.
          await q(`UPDATE {{p}}history_chats SET state = 'capped', updated_at = now() WHERE user_id = $1 AND session = $S AND state = 'pending'`, [userId]);
          break;
        }
        const r = await importChat(userId, row, ctl, { session, startedAt, perChat: lim.perChat, room: lim.total - j.seen, quick: false, onPage: async (seen, added) => { j = { ...j, seen: j.seen + seen, messages: j.messages + added }; await put(userId, j); } });
        if (r.stopped) continue;
        j = { ...j, chatsDone: j.chatsDone + 1 }; await put(userId, j);
        if (j.chatsDone % 10 === 0) core.publish(userId, "chats", {});
      }
      // Ids met on the way that are still unlinked lids.
      await identity.ensure(userId, true);
      j = { ...j, chatsDone: j.chatsTotal };
      await stop("done");
      ctx.toast(userId, { title: "WhatsApp: history imported", description: `${j.chatsTotal} ${j.chatsTotal === 1 ? "chat" : "chats"}, ${j.messages} ${j.messages === 1 ? "message" : "messages"}` });
    } catch (e) {
      ctx.log.warn("history import failed", { error: e instanceof Error ? e.message : "error" });
      await stop("failed", failText(e)).catch(() => undefined);
    } finally { active.delete(userId); }
  }

  /** A quiet pass after a fresh link: chats WAHA got from the phone since, and the newer pages of the known ones. Shows nothing but new chats. */
  async function quiet(userId: string, ctl: { cancel: boolean; silent: boolean }) {
    try {
      const j = await job(userId);
      if (j.state !== "done") return;
      const { session } = core.split(userId), lim = await limits(userId), startedAt = j.startedAt ?? new Date().toISOString();
      syncing.add(userId);
      try { if ((await contactsPass(userId)) !== null) core.publish(userId, "contacts", {}); } finally { syncing.delete(userId); }
      await q(`UPDATE {{p}}history_chats SET state = 'pending', next_offset = 0, seen = 0 WHERE user_id = $1 AND session = $S AND state IN ('done', 'failed')`, [userId]);
      const listed = await listChats(userId, ctl, session, startedAt).catch(() => ({ total: j.chatsTotal, added: 0 })), total = listed.total;
      let added = listed.added, room = lim.total;
      for (let row = await nextChat(userId); row && !paused && !ctl.cancel && room > 0; row = await nextChat(userId)) {
        const r = await importChat(userId, row, ctl, { session, startedAt, perChat: lim.perChat, room, quick: true });
        if (r.stopped) break;
        added += r.added; room -= r.seen;
      }
      if (paused || ctl.cancel) return;
      const now = await job(userId);
      if (now.state === "done" && (added || total !== now.chatsTotal)) await put(userId, { ...now, chatsTotal: total, chatsDone: total, messages: now.messages + added });
      core.publish(userId, "chats", {});
    } catch (e) { ctx.log.warn("history follow-up failed", { error: e instanceof Error ? e.message : "error" }); }
    finally { active.delete(userId); }
  }

  function launch(userId: string) {
    if (active.has(userId) || paused) return;
    const ctl = { cancel: false, silent: false };
    active.set(userId, ctl);
    core.bg(run(userId, ctl));
  }
  async function begin(userId: string, followUps: boolean): Promise<HistoryStatus> {
    const running = active.get(userId);
    if (running && !running.silent) return self.status(userId);
    if (running) { running.cancel = true; active.delete(userId); }
    await q(`DELETE FROM {{p}}history_chats WHERE user_id = $1 AND session = $S`, [userId]);
    const at = Date.now(), times = followUps ? FOLLOW_UP_MS.map((ms) => at + ms) : [];
    const j: Job = { ...fresh(), state: "running", phase: "contacts", startedAt: new Date(at).toISOString(), ...(times.length ? { follow: times } : {}) };
    if (times.length) follow.set(userId, times); else follow.delete(userId);
    await put(userId, j);
    launch(userId);
    return shape(userId, j);
  }

  const self: History = {
    storeConfig: () => structuredClone(STORE_CONFIG),
    async expect(userId, error) {
      if (error !== undefined) tried.set(userId, { at: Date.now(), error });
      if (pending.get(userId) === true) return;
      pending.set(userId, true);
      await ctx.kv.set(userId, "history:pending", true);
    },
    async view(userId, s) {
      const engine = await engineOf(userId, s), st = storeOf(s, engine), memo = tried.get(userId);
      return { willImport: st.on, error: st.on ? null : memo ? memo.error || "WAHA did not keep the history setting." : null, engine, fullSync: st.full };
    },
    async prepare(userId, given) {
      let s = given ?? null;
      if (!s) { try { s = await core.waha<Obj>(userId, "GET", "/api/sessions/{session}"); } catch (e) { if (!(e instanceof WahaError)) throw e; return { willImport: false, error: null, restarted: false }; } }
      const v = await self.view(userId, s), status = statusOf(s);
      // Only a session that waits for the scan: changing the store of a linked one can lose what it has.
      if (status !== "SCAN_QR_CODE" || (v.willImport && v.fullSync) || (v.engine !== "NOWEB" && v.engine !== "GOWS")) return { willImport: v.willImport, error: v.error, restarted: false };
      const memo = tried.get(userId);
      if (memo && Date.now() - memo.at < PREPARE_RETRY_MS) return { willImport: v.willImport, error: v.error, restarted: false };
      const cfg = rec(s?.config);
      const config = v.engine === "NOWEB"
        ? { ...cfg, noweb: { ...rec(cfg.noweb), store: { ...rec(rec(cfg.noweb).store), enabled: true, fullSync: true } } }
        : { ...cfg, gows: { ...rec(cfg.gows), storage: { ...rec(rec(cfg.gows).storage), messages: true, chats: true, contacts: true, groups: true } } };
      tried.set(userId, { at: Date.now(), error: "" });
      try { await core.waha(userId, "PUT", "/api/sessions/{session}", { body: { config } }); }
      catch (e) {
        if (!(e instanceof WahaError)) throw e;
        const error = failText(e);
        tried.set(userId, { at: Date.now(), error });
        ctx.log.warn("history store could not be turned on", { status: e.status });
        return { willImport: v.willImport, error: v.willImport ? null : error, restarted: false };
      }
      await self.expect(userId);
      // WAHA restarts a running session when its config changes; one that came back stopped is started again.
      const after = await core.tryWaha<Obj>(userId, "GET", "/api/sessions/{session}");
      if (after && statusOf(after) === "STOPPED") await core.tryWaha(userId, "POST", "/api/sessions/{session}/start");
      core.publish(userId, "session", { status: "STARTING" });
      return { willImport: true, error: null, restarted: true };
    },
    async noteStatus(userId, status, live = false) {
      if (!core.split(userId).session) return;
      if (status === "SCAN_QR_CODE") return self.expect(userId);
      if (status !== "WORKING") return;
      if (!pending.has(userId)) pending.set(userId, (await ctx.kv.get(userId, "history:pending")) === true);
      if (pending.get(userId)) {
        pending.set(userId, false);
        await ctx.kv.set(userId, "history:pending", false);
        tried.delete(userId);
        await begin(userId, true);
      } else if (live) core.bg(self.syncContacts(userId));
    },
    async status(userId) {
      const j = await job(userId);
      // Interrupted (the runtime restarted, or the work failed outside its own handling): go on.
      if (j.state === "running" && !active.has(userId)) launch(userId);
      return shape(userId, j);
    },
    async start(userId) {
      const s = await core.guard(() => core.waha<Obj>(userId, "GET", "/api/sessions/{session}"), "history");
      if (statusOf(s) !== "WORKING") throw ctx.httpError(409, "session_not_ready", "WhatsApp is not connected. Link the phone first; the history is imported right after.");
      return begin(userId, false);
    },
    async cancel(userId) {
      const a = active.get(userId);
      follow.delete(userId);
      const j = await job(userId);
      if (a) a.cancel = true;
      if (j.state === "running") { const next = { ...j, state: "cancelled" as const, phase: null, finishedAt: new Date().toISOString(), follow: undefined }; await put(userId, next); return shape(userId, next); }
      if (j.follow) await ctx.kv.set(userId, "history", { ...j, follow: undefined });
      return shape(userId, j);
    },
    async syncContacts(userId, force = false) {
      if (syncing.has(userId) || paused) return null;
      if (!force && Date.now() - (contactsTried.get(userId) ?? 0) < CONTACTS_MIN_MS) return null;
      contactsTried.set(userId, Date.now());
      syncing.add(userId);
      try {
        const n = await contactsPass(userId);
        if (n !== null) { core.publish(userId, "contacts", {}); core.publish(userId, "chats", {}); }
        return n;
      } catch (e) { ctx.log.warn("contacts sync failed", { error: e instanceof Error ? e.message : "error" }); return null; }
      finally { syncing.delete(userId); }
    },
    async contactsState(userId) { const at = await ctx.kv.get(userId, "contactsSyncedAt"); return { syncedAt: typeof at === "string" ? at : null, syncing: syncing.has(userId) }; },
    pause() { paused = true; },
  };

  // ---- routes ----
  const R = ctx.routes;
  R.get("/history", async ({ userId }) => { await core.owner(userId); return self.status(userId); });
  R.post("/history/start", async ({ userId }) => { await core.owner(userId); return self.start(userId); });
  R.post("/history/cancel", async ({ userId }) => { await core.owner(userId); return self.cancel(userId); });
  R.post("/contacts/sync", async ({ userId }) => {
    await core.owner(userId);
    await core.ready(userId);
    // The UI waits for the "contacts" event: it comes whether or not WAHA could answer.
    if (!syncing.has(userId)) core.bg(self.syncContacts(userId, true).then((n) => { if (n === null) core.publish(userId, "contacts", {}); }));
    return { ok: true };
  });

  // ---- after a start: resume what was interrupted; every minute: follow-up passes and the contacts refresh ----
  const scopes = async (): Promise<string[]> => {
    const owner = await host.installOwner();
    const list = owner ? await host.kv.get(owner, "accounts") : null;
    return owner && Array.isArray(list) ? list.map((a) => rec(a).session).filter((s): s is string => typeof s === "string" && !!s).map((s) => scopeOf(owner, s)) : [];
  };
  core.bg((async () => {
    for (const scope of await scopes()) {
      const j = await job(scope);
      if (j.follow?.length) follow.set(scope, j.follow);
      if (j.state === "running") launch(scope);
    }
  })());
  const contactsChecked = new Map<string, number>();
  if (typeof host.schedule === "function") host.schedule(TICK_MS, async () => {
    if (paused) return;
    const now = Date.now();
    for (const [scope, times] of [...follow]) {
      if (!times.length) { follow.delete(scope); continue; }
      if (times[0] > now || active.has(scope)) continue;
      const rest = times.filter((t) => t > now);
      if (rest.length) follow.set(scope, rest); else follow.delete(scope);
      const j = await job(scope);
      if (j.state !== "done") continue;
      await ctx.kv.set(scope, "history", { ...j, follow: rest.length ? rest : undefined });
      const ctl = { cancel: false, silent: true };
      active.set(scope, ctl);
      core.bg(quiet(scope, ctl));
    }
    for (const scope of await scopes()) {
      // Cheap most of the time: the saved time is read once in a while, WAHA only when a refresh is due.
      if (now - (contactsChecked.get(scope) ?? 0) < 30 * 60_000) continue;
      contactsChecked.set(scope, now);
      const at = (await self.contactsState(scope)).syncedAt;
      if (at && now - Date.parse(at) < CONTACTS_EVERY_MS) continue;
      const s = await core.tryWaha<Obj>(scope, "GET", "/api/sessions/{session}");
      if (s && statusOf(s) === "WORKING") core.bg(self.syncContacts(scope, true));
    }
  });
  return self;
}
