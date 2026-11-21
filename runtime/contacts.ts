// Contacts: the address book for the "new chat" picker (WAHA's contact list merged with the inbox's own), number checks, and one contact's details and actions.
import type { Deps } from "./extras.js";
import { chatKind, matchesQuery } from "../shared/chat.js";
import { phoneDigits } from "../shared/phone.js";
import { brVariants, digitsOf, displayDigits, isGroup, isUser, lidOf, normId, pnOf } from "./ids.js";

const enc = encodeURIComponent;
const LIST_TTL_MS = 5 * 60_000, ABOUT_TTL_MS = 10 * 60_000;
const WAHA_PAGE = 1000;

interface Entry { chatId: string; name: string | null; phone: string | null; isMyContact: boolean; avatar: number | null }
interface Remote { id: string; name: string; push: string; number: string; mine: boolean | undefined }

// WAHA falls back to the number or the id when it has no name: that is not a name.
const realName = (v: unknown) => { const n = typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 120) : ""; return n && !n.includes("@") && !/^[+\d\s()-]+$/.test(n) ? n : ""; };
const ms = (v: unknown) => (v ? new Date(v as string).getTime() : null);

export function registerContacts({ core, identity, store }: Deps): void {
  const { ctx } = core;
  const R = ctx.routes;
  const q = (sql: string, params: unknown[]) => ctx.db.query(sql, params);
  const listCache = new Map<string, { at: number; rows: Remote[] }>();
  const aboutAt = new Map<string, number>();

  /** WAHA's contact list, kept for a few minutes. Empty when WAHA cannot answer (the picker still has the inbox's own contacts). */
  async function remote(userId: string): Promise<Remote[]> {
    const hit = listCache.get(userId);
    if (hit && Date.now() - hit.at < LIST_TTL_MS) return hit.rows;
    const raw = await core.tryWaha<unknown[]>(userId, "GET", "/api/contacts/all", { query: { limit: WAHA_PAGE, offset: 0, sortBy: "name", sortOrder: "asc" } });
    if (!Array.isArray(raw)) return hit?.rows ?? [];
    const rows: Remote[] = [];
    for (const item of raw) {
      const o = core.obj(item), id = normId(o.id);
      if (!id || !isUser(id) || o.isGroup === true || o.isMe === true) continue;
      rows.push({ id, name: realName(o.name) || realName(o.shortName), push: realName(o.pushname ?? o.pushName ?? o.notify), number: typeof o.number === "string" ? o.number : "", mine: typeof o.isMyContact === "boolean" ? o.isMyContact : undefined });
    }
    listCache.set(userId, { at: Date.now(), rows });
    return rows;
  }

  async function merged(userId: string): Promise<Entry[]> {
    const [rem, selfIds] = [await remote(userId), await identity.selfIds(userId)];
    const canon = new Map((await q(`SELECT lid, pn FROM {{p}}lid_map WHERE user_id = $1`, [userId])).rows.map((r) => [String(r.lid), String(r.pn)]));
    const local = (await q(`SELECT chat_id, name, push_name, phone, has_picture, picture_at FROM {{p}}contacts WHERE user_id = $1 AND (chat_id LIKE '%@c.us' OR chat_id LIKE '%@lid')`, [userId])).rows;
    const out = new Map<string, Entry & { saved: string; push: string }>();
    const slot = (id: string) => {
      const chatId = canon.get(id) ?? id;
      let e = out.get(chatId);
      if (!e) { e = { chatId, name: null, phone: null, isMyContact: false, avatar: null, saved: "", push: "" }; out.set(chatId, e); }
      return e;
    };
    const phoneOf = (e: Entry, ...more: string[]) => { const d = digitsOf(e.chatId) ?? more.find((m) => /^\d{8,15}$/.test(m)); if (d && !e.phone) e.phone = displayDigits(d); };
    for (const r of rem) { const e = slot(r.id); e.saved ||= r.name; e.push ||= r.push; e.isMyContact ||= r.mine ?? Boolean(r.name); phoneOf(e, r.number); }
    for (const r of local) {
      const e = slot(String(r.chat_id));
      e.saved ||= realName(r.name); e.push ||= realName(r.push_name); phoneOf(e, String(r.phone ?? ""));
      if (r.has_picture === true && r.picture_at) e.avatar = Math.max(e.avatar ?? 0, ms(r.picture_at)!);
    }
    return [...out.values()].filter((e) => !selfIds.has(e.chatId) && (e.saved || e.push || e.phone)).map(({ saved, push, ...e }) => ({ ...e, name: saved || push || null }));
  }

  R.get("/contacts", async ({ userId, query }) => {
    await core.owner(userId);
    const text = typeof query.q === "string" ? query.q.trim().slice(0, 100) : "";
    const limit = Math.min(200, Math.max(1, Number.parseInt(String(query.limit ?? "50"), 10) || 50));
    const rows = (await merged(userId)).filter((e) => matchesQuery({ chatId: e.chatId, kind: chatKind(e.chatId), name: e.name, phone: e.phone ? e.phone : null }, text));
    // Named people first, alphabetical; people known only by number after them.
    rows.sort((a, b) => (a.name && !b.name ? -1 : !a.name && b.name ? 1 : (a.name ?? a.phone ?? "").localeCompare(b.name ?? b.phone ?? "", undefined, { sensitivity: "base" })));
    return { contacts: rows.slice(0, limit) };
  });

  // Is this number on WhatsApp? A typed Brazilian number is tried in both spellings (with and without the ninth digit).
  R.post("/contacts/check", async ({ userId, body }) => {
    await core.owner(userId);
    const typed = phoneDigits(core.obj(body).phone);
    if (!typed) throw ctx.httpError(400, "invalid_phone", "Type the number with its country code, for example +55 11 99999-9999.");
    const v = brVariants(typed);
    const tries = v ? [typed, v[0] === typed ? v[1] : v[0]] : [typed];
    for (let i = 0; i < tries.length; i++) {
      const digits = tries[i];
      const r = core.obj(i === 0
        ? await core.guard(() => core.waha(userId, "GET", "/api/contacts/check-exists", { query: { phone: digits } }), "check number")
        : await core.tryWaha(userId, "GET", "/api/contacts/check-exists", { query: { phone: digits } }));
      if (r.numberExists !== true) continue;
      const found = normId(r.chatId), pn = pnOf(normId(r.pn)) ?? pnOf(found) ?? `${digits}@c.us`;
      // GOWS answers with the lid in chatId and the phone id in pn; the others with the registered phone id.
      await identity.seen(userId, pn, true);
      if (lidOf(found)) await identity.link(userId, found, pn);
      const chatId = await identity.canonical(userId, pn);
      return { exists: true, chatId, phone: displayDigits(digitsOf(pn) ?? digits) };
    }
    return { exists: false, chatId: null, phone: displayDigits(typed) };
  });

  async function one(userId: string, raw: unknown) {
    const chatId = core.chatId(raw);
    if (isGroup(chatId)) throw ctx.httpError(400, "invalid_chat", "That is a group: use /group.");
    return { canonical: await identity.canonical(userId, chatId), to: (await store.route(userId, chatId))[0] };
  }
  const avatarOf = async (userId: string, ids: string[]) => {
    const r = (await q(`SELECT has_picture, picture_at FROM {{p}}contacts WHERE user_id = $1 AND chat_id = ANY($2::text[])`, [userId, ids])).rows;
    return Math.max(0, ...r.filter((x) => x.has_picture === true && x.picture_at).map((x) => ms(x.picture_at)!)) || null;
  };

  R.get("/contact", async ({ userId, query }) => {
    await core.owner(userId);
    const { canonical, to } = await one(userId, query.chatId);
    // Fills in the name, picture and flags when they are stale (rate limited per contact; never throws).
    await identity.enrich(userId, [canonical]);
    const engine = await core.engine(userId);
    if ((engine === "WEBJS" || engine === "") && Date.now() - (aboutAt.get(canonical) ?? 0) > ABOUT_TTL_MS) {
      aboutAt.set(canonical, Date.now());
      const a = core.obj(await core.tryWaha(userId, "GET", "/api/contacts/about", { query: { contactId: to } }));
      if (typeof a.about === "string" && a.about.trim()) await identity.upsertContact(userId, canonical, { about: a.about });
    }
    const ids = await identity.aliases(userId, canonical);
    const r = (await q(
      `SELECT MAX(NULLIF(name, '')) AS name, MAX(NULLIF(push_name, '')) AS push_name, MAX(NULLIF(phone, '')) AS phone, MAX(NULLIF(about, '')) AS about, BOOL_OR(blocked) AS blocked, BOOL_OR(is_business) AS business
         FROM {{p}}contacts WHERE user_id = $1 AND chat_id = ANY($2::text[])`, [userId, ids])).rows[0] ?? {};
    const digits = digitsOf(canonical) ?? (typeof r.phone === "string" && /^\d{8,15}$/.test(r.phone) ? r.phone : null);
    return {
      chatId: canonical, name: typeof r.name === "string" ? r.name : "", pushName: typeof r.push_name === "string" ? r.push_name : "", phone: digits ? displayDigits(digits) : null,
      about: typeof r.about === "string" ? r.about : "", blocked: r.blocked === true, isBusiness: r.business === true, isSelf: (await identity.selfIds(userId)).has(canonical),
      avatar: await avatarOf(userId, ids), aliases: ids.length, commonGroups: [],
    };
  });

  R.post("/contact/block", async ({ userId, body }) => {
    await core.owner(userId);
    const o = core.obj(body), { canonical, to } = await one(userId, o.chatId);
    if (typeof o.blocked !== "boolean") throw ctx.httpError(400, "invalid_blocked", "blocked must be true or false");
    await core.guard(() => core.waha(userId, "POST", o.blocked ? "/api/contacts/block" : "/api/contacts/unblock", { body: { contactId: to } }), "block");
    await identity.upsertContact(userId, canonical, { blocked: o.blocked });
    core.publish(userId, "chats", {});
    return { ok: true, blocked: o.blocked };
  });

  R.post("/contact/refresh-picture", async ({ userId, body }) => {
    await core.owner(userId);
    const raw = core.chatId(core.obj(body).chatId), group = isGroup(raw);
    const canonical = await identity.canonical(userId, raw), to = (await store.route(userId, raw))[0];
    const r = core.obj(await core.guard(() => group
      ? core.waha(userId, "GET", `/api/{session}/chats/${enc(to)}/picture`, { query: { refresh: true } })
      : core.waha(userId, "GET", "/api/contacts/profile-picture", { query: { contactId: to, refresh: true } }), "refresh picture"));
    const url = [r.profilePictureURL, r.profilePictureUrl, r.url].find((u): u is string => typeof u === "string") ?? "";
    await identity.saveAvatar(userId, canonical, url);
    core.publish(userId, "chats", {});
    return { ok: true, avatar: await avatarOf(userId, await identity.aliases(userId, canonical)) };
  });

  // Adds or renames the contact in the phone's address book.
  R.post("/contact/save", async ({ userId, body }) => {
    await core.owner(userId);
    const o = core.obj(body), { canonical, to } = await one(userId, o.chatId);
    const firstName = core.text(o.firstName, 80, "firstName").trim(), lastName = core.optText(o.lastName, 80).trim();
    await core.guard(() => core.waha(userId, "PUT", `/api/{session}/contacts/${enc(to)}`, { body: { firstName, lastName } }), "save contact");
    listCache.delete(userId);
    await identity.upsertContact(userId, canonical, { name: `${firstName} ${lastName}`.trim() });
    core.publish(userId, "chats", {});
    return { ok: true, name: `${firstName} ${lastName}`.trim() };
  });
}
