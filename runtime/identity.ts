// Who is who: one chat per person. A contact can be addressed by phone id ("<digits>@c.us"), by "<n>@lid", and a Brazilian mobile by two
// spellings (with and without the ninth digit). {{p}}lid_map holds alias -> canonical id; every read folds aliases into the canonical chat.
import type { Core } from "./core.js";
import { brVariants, digitsOf, isGroup, lidOf, normId, pnOf, pnSpellings } from "./ids.js";
import { phoneToChatId } from "./client.js";

export interface Me { id: string; lid: string; name: string }
/** How often WAHA is asked again about identities (own account, saved number, unlinked lids). */
export const IDENTITY_EVERY_MS = 10 * 60_000;
/** Contact details and avatars are refreshed at most this often per contact. */
export const CONTACT_TTL_MS = 24 * 3600_000;
const AVATAR_MAX_BYTES = 400 * 1024;

export interface Identity {
  /** Records that alias and canonical are the same chat. Chains are flattened; linking the current canonical under one of its aliases swaps them. */
  link(userId: string, alias: string, canonical: string): Promise<void>;
  canonical(userId: string, id: string): Promise<string>;
  /** Every address of a chat, canonical first. */
  aliases(userId: string, id: string): Promise<string[]>;
  /** Call for every phone id that shows up. `real` = WAHA itself reported the id (a webhook, a lookup); typed numbers are not real until checked. Links Brazilian spellings. */
  seen(userId: string, id: string, real: boolean): Promise<void>;
  me(userId: string): Promise<Me | null>;
  saveMe(userId: string, raw: unknown): Promise<void>;
  /** The saved "message me" number as a chat id, or null. */
  ownChat(userId: string): Promise<string | null>;
  /** Canonical ids that are the user: the WhatsApp account itself and the saved own number. */
  selfIds(userId: string): Promise<Set<string>>;
  /** Asks WAHA who is who (rate limited unless forced). True when a link changed. Never throws. */
  ensure(userId: string, force?: boolean): Promise<boolean>;
  /** Names and avatars for chats that have none yet (a few per call, rate limited per contact). True when something changed. Never throws. */
  enrich(userId: string, chatIds: string[]): Promise<boolean>;
  upsertContact(userId: string, chatId: string, c: { name?: string; pushName?: string; phone?: string; about?: string; blocked?: boolean; business?: boolean }): Promise<void>;
  /** Downloads and stores a profile picture. `url` "" clears it. */
  saveAvatar(userId: string, chatId: string, url: string): Promise<boolean>;
  avatar(userId: string, chatId: string): Promise<{ mime: string; bytes: Uint8Array } | null>;
}

const clean = (v: unknown, max = 120) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").trim().slice(0, max) : "");

export function createIdentity(core: Core, savedPhone: (userId: string) => Promise<unknown>): Identity {
  const { ctx } = core;
  const q = (sql: string, params: unknown[]) => ctx.db.query(sql, params);
  let ensuredAt = 0, backfilled = false;
  const lidTried = new Map<string, number>();

  const known = async (userId: string, id: string) => (await q(`SELECT 1 AS x FROM {{p}}known_ids WHERE user_id = $1 AND id = $2`, [userId, id])).rows.length > 0;

  const self: Identity = {
    async link(userId, alias, canonical) {
      alias = normId(alias); canonical = normId(canonical);
      if (!alias || !canonical || alias === canonical || isGroup(alias) || isGroup(canonical)) return;
      // A lid is never the canonical id of a phone id.
      if (lidOf(canonical) && pnOf(alias)) [alias, canonical] = [canonical, alias];
      let c = await self.canonical(userId, canonical);
      if (c === alias) { await q(`DELETE FROM {{p}}lid_map WHERE user_id = $1 AND lid = $2`, [userId, canonical]); c = canonical; }
      await q(`UPDATE {{p}}lid_map SET pn = $3, updated_at = now() WHERE user_id = $1 AND pn = $2`, [userId, alias, c]);
      await q(`INSERT INTO {{p}}lid_map (user_id, lid, pn) VALUES ($1,$2,$3) ON CONFLICT (user_id, lid) DO UPDATE SET pn = EXCLUDED.pn, updated_at = now()`, [userId, alias, c]);
      // Chat state lives under the canonical id.
      await q(`UPDATE {{p}}chat_state SET chat_id = $3 WHERE user_id = $1 AND chat_id = $2 AND NOT EXISTS (SELECT 1 FROM {{p}}chat_state x WHERE x.user_id = $1 AND x.chat_id = $3)`, [userId, alias, c]).catch(() => undefined);
    },
    async canonical(userId, id) {
      if (!id || isGroup(id)) return id;
      const r = await q(`SELECT pn FROM {{p}}lid_map WHERE user_id = $1 AND lid = $2`, [userId, id]);
      return typeof r.rows[0]?.pn === "string" ? (r.rows[0].pn as string) : id;
    },
    async aliases(userId, id) {
      if (isGroup(id)) return [id];
      const c = await self.canonical(userId, id);
      const r = await q(`SELECT lid FROM {{p}}lid_map WHERE user_id = $1 AND pn = $2 ORDER BY updated_at DESC`, [userId, c]);
      return [c, ...new Set(r.rows.map((x) => String(x.lid)).filter((x) => x !== c))];
    },
    async seen(userId, id, real) {
      const d = digitsOf(id);
      if (!d) return;
      const me = `${d}@c.us`;
      if (real) await q(`INSERT INTO {{p}}known_ids (user_id, id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [userId, me]);
      const v = brVariants(d);
      if (!v) return;
      const other = `${v[0] === d ? v[1] : v[0]}@c.us`;
      const rows = (await q(`SELECT lid, pn FROM {{p}}lid_map WHERE user_id = $1 AND lid = ANY($2::text[])`, [userId, [me, other]])).rows;
      const meIsAlias = rows.some((x) => x.lid === me), otherIsAlias = rows.some((x) => x.lid === other);
      if (real) {
        // The id WAHA reports is the one that exists; the other spelling folds into it unless WAHA reported that one too.
        if (otherIsAlias) return;
        if (meIsAlias && (await known(userId, other))) return;
        await self.link(userId, other, me);
      } else if (!meIsAlias && !otherIsAlias) {
        const canon = (await known(userId, other)) ? other : (await known(userId, me)) ? me : `${v[0]}@c.us`;
        await self.link(userId, canon === me ? other : me, canon);
      }
    },
    async me(userId) {
      const v = await ctx.kv.get(userId, "me");
      const o = core.obj(v);
      return typeof o.id === "string" && o.id ? { id: o.id, lid: typeof o.lid === "string" ? o.lid : "", name: typeof o.name === "string" ? o.name : "" } : null;
    },
    async saveMe(userId, raw) {
      const o = core.obj(raw);
      const id = pnOf(normId(o.id)) ?? pnOf(normId(o.jid)) ?? "", lid = lidOf(normId(o.lid)) ?? lidOf(normId(o.id)) ?? "", name = clean(o.pushName ?? o.pushname ?? o.name);
      if (!id && !lid) return;
      const old = await self.me(userId);
      const next = { id: id || old?.id || "", lid: lid || old?.lid || "", name: name || old?.name || "" };
      if (!next.id) return;
      if (!old || old.id !== next.id || old.lid !== next.lid || old.name !== next.name) await ctx.kv.set(userId, "me", next);
      await self.seen(userId, next.id, true);
      if (next.lid) await self.link(userId, next.lid, next.id);
    },
    async ownChat(userId) { const raw = await savedPhone(userId); return raw === undefined || raw === null || raw === "" ? null : phoneToChatId(raw); },
    async selfIds(userId) {
      const out = new Set<string>();
      const me = await self.me(userId), own = await self.ownChat(userId);
      if (me?.id) out.add(await self.canonical(userId, me.id));
      if (own) out.add(await self.canonical(userId, own));
      return out;
    },
    async ensure(userId, force = false) {
      const now = Date.now();
      if (!force && now - ensuredAt < IDENTITY_EVERY_MS && backfilled) return false;
      const before = async () => JSON.stringify((await q(`SELECT lid, pn FROM {{p}}lid_map WHERE user_id = $1 ORDER BY lid`, [userId])).rows);
      try {
        const was = await before();
        if (!backfilled) {
          // Rows stored by older versions: fold the two spellings of every Brazilian mobile that already has messages or a contact row.
          backfilled = true;
          const ids = (await q(`SELECT DISTINCT chat_id AS id FROM {{p}}messages WHERE user_id = $1 AND chat_id LIKE '%@c.us' UNION SELECT chat_id FROM {{p}}contacts WHERE user_id = $1 AND chat_id LIKE '%@c.us'`, [userId])).rows.map((x) => String(x.id));
          for (const id of ids) await self.seen(userId, id, await known(userId, id));
          const own = await self.ownChat(userId);
          if (own) await self.seen(userId, own, false);
        }
        if (force || now - ensuredAt >= IDENTITY_EVERY_MS) {
          ensuredAt = now;
          const c = await core.config(userId);
          if (c.base && c.apiKey) {
            // 1. The account itself.
            const s = await core.tryWaha<Record<string, unknown>>(userId, "GET", "/api/sessions/{session}");
            if (s?.me) await self.saveMe(userId, s.me);
            const m2 = await core.tryWaha<Record<string, unknown>>(userId, "GET", "/api/sessions/{session}/me");
            if (m2) await self.saveMe(userId, m2);
            // 2. The saved own number: which spelling exists, and its lid.
            const own = await self.ownChat(userId);
            const numbers = new Set<string>(own ? pnSpellings(own) : []);
            for (const id of numbers) {
              const r = await core.tryWaha<Record<string, unknown>>(userId, "GET", "/api/contacts/check-exists", { query: { phone: digitsOf(id)! } });
              if (!r || r.numberExists === false) continue;
              const found = normId(r.chatId), pn = pnOf(normId(r.pn)) ?? pnOf(found);
              // GOWS answers with the lid in chatId and the phone id in pn; the others with the registered phone id.
              if (pn) await self.seen(userId, pn, true);
              if (lidOf(found)) await self.link(userId, found, pn ?? id);
              if (pn || lidOf(found)) break;
            }
            // 3. Lids: the pairs of the numbers we care about, then every unlinked lid chat.
            for (const id of numbers) await pair(userId, await core.tryWaha(userId, "GET", `/api/{session}/lids/pn/${encodeURIComponent(digitsOf(id)!)}`));
            const unlinked = (await q(
              `SELECT DISTINCT m.chat_id AS id FROM {{p}}messages m WHERE m.user_id = $1 AND m.chat_id LIKE '%@lid'
                 AND NOT EXISTS (SELECT 1 FROM {{p}}lid_map l WHERE l.user_id = $1 AND l.lid = m.chat_id) LIMIT 200`, [userId])).rows.map((x) => String(x.id));
            if (unlinked.length) {
              const all = await core.tryWaha<unknown[]>(userId, "GET", "/api/{session}/lids", { query: { limit: 1000, offset: 0 } });
              if (Array.isArray(all)) for (const row of all) { const l = lidOf(normId(core.obj(row).lid)); if (l && unlinked.includes(l)) await pair(userId, row); }
              const due = unlinked.filter((l) => now - (lidTried.get(l) ?? 0) > IDENTITY_EVERY_MS).slice(0, 8);
              for (const l of due) {
                lidTried.set(l, now);
                if ((await self.canonical(userId, l)) !== l) continue;
                if (await pair(userId, await core.tryWaha(userId, "GET", `/api/{session}/lids/${encodeURIComponent(l)}`))) continue;
                // Some engines answer a contact lookup by lid with the phone number.
                const k = core.obj(await core.tryWaha(userId, "GET", "/api/contacts", { query: { contactId: l } }));
                const pn = pnOf(normId(k.id)) ?? (typeof k.number === "string" && /^\d{8,15}$/.test(k.number) ? `${k.number}@c.us` : null);
                if (pn) { await self.seen(userId, pn, true); await self.link(userId, l, pn); }
              }
            }
          }
        }
        return (await before()) !== was;
      } catch (error) { ctx.log.warn("identity lookup failed", { error: error instanceof Error ? error.message : "error" }); return false; }
    },
    async upsertContact(userId, chatId, c) {
      const name = clean(c.name), push = clean(c.pushName), phone = /^\d{8,15}$/.test(c.phone ?? "") ? c.phone! : "", about = clean(c.about, 300);
      if (!name && !push && !phone && !about && c.blocked === undefined && c.business === undefined) return;
      await q(
        `INSERT INTO {{p}}contacts (user_id, chat_id, name, push_name, phone, about, blocked, is_business) VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,FALSE),COALESCE($8,FALSE))
         ON CONFLICT (user_id, chat_id) DO UPDATE SET
           name = CASE WHEN EXCLUDED.name <> '' THEN EXCLUDED.name ELSE {{p}}contacts.name END,
           push_name = CASE WHEN EXCLUDED.push_name <> '' THEN EXCLUDED.push_name ELSE {{p}}contacts.push_name END,
           phone = CASE WHEN EXCLUDED.phone <> '' THEN EXCLUDED.phone ELSE {{p}}contacts.phone END,
           about = CASE WHEN EXCLUDED.about <> '' THEN EXCLUDED.about ELSE {{p}}contacts.about END,
           blocked = COALESCE($7, {{p}}contacts.blocked), is_business = COALESCE($8, {{p}}contacts.is_business), updated_at = now()`,
        [userId, chatId, name, push, phone, about, c.blocked ?? null, c.business ?? null]);
    },
    async saveAvatar(userId, chatId, url) {
      const key = "avatar:" + chatId;
      const mark = (has: boolean) => q(
        `INSERT INTO {{p}}contacts (user_id, chat_id, has_picture, picture_at) VALUES ($1,$2,$3,now())
         ON CONFLICT (user_id, chat_id) DO UPDATE SET has_picture = $3, picture_at = now()`, [userId, chatId, has]);
      if (!url) { await mark(false); return false; }
      try {
        let bytes: Uint8Array, mime: string;
        const base = (await core.ready(userId)).base;
        if (url.startsWith("/") || new URL(url).origin === new URL(base).origin || /^(localhost|127\.|\[::1\])/.test(new URL(url).hostname)) ({ bytes, mime } = await core.wahaBytes(userId, url));
        else { const res = await ctx.fetch(url, { method: "GET" }); if (!res.ok) throw new Error("avatar"); bytes = res.bytes; mime = String(res.headers?.["content-type"] ?? "").split(";")[0]; }
        if (!bytes.length || bytes.length > AVATAR_MAX_BYTES) throw new Error("avatar size");
        if (!/^image\/(jpeg|png|webp|gif)$/.test(mime)) mime = "image/jpeg";
        await q(`INSERT INTO {{p}}media_blobs (user_id, key, mime, bytes, size) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (user_id, key) DO UPDATE SET mime = EXCLUDED.mime, bytes = EXCLUDED.bytes, size = EXCLUDED.size, created_at = now()`, [userId, key, mime, Buffer.from(bytes), bytes.length]);
        await mark(true);
        return true;
      } catch { await mark(false).catch(() => undefined); return false; }
    },
    async avatar(userId, chatId) {
      const ids = await self.aliases(userId, chatId);
      const r = await q(`SELECT mime, bytes FROM {{p}}media_blobs WHERE user_id = $1 AND key = ANY($2::text[]) ORDER BY created_at DESC LIMIT 1`, [userId, ids.map((i) => "avatar:" + i)]);
      const x = r.rows[0];
      return x ? { mime: String(x.mime), bytes: x.bytes as Uint8Array } : null;
    },
    async enrich(userId, chatIds) {
      try {
        const c = await core.config(userId);
        if (!c.base || !c.apiKey || !chatIds.length) return false;
        const fresh = new Set((await q(`SELECT chat_id FROM {{p}}contacts WHERE user_id = $1 AND chat_id = ANY($2::text[]) AND fetched_at > now() - ($3 || ' milliseconds')::interval`, [userId, chatIds, String(CONTACT_TTL_MS)])).rows.map((x) => String(x.chat_id)));
        const due = chatIds.filter((id) => !fresh.has(id) && id !== "status@broadcast").slice(0, 6);
        let changed = false;
        for (const id of due) {
          await q(`INSERT INTO {{p}}contacts (user_id, chat_id, fetched_at) VALUES ($1,$2,now()) ON CONFLICT (user_id, chat_id) DO UPDATE SET fetched_at = now()`, [userId, id]);
          if (isGroup(id)) {
            const g = core.obj(await core.tryWaha(userId, "GET", `/api/{session}/groups/${encodeURIComponent(id)}`));
            const subject = clean(g.subject ?? g.Name ?? g.name ?? core.obj(g.groupMetadata).subject);
            if (subject) { await self.upsertContact(userId, id, { name: subject }); changed = true; }
            const p = core.obj(await core.tryWaha(userId, "GET", `/api/{session}/chats/${encodeURIComponent(id)}/picture`));
            if (await self.saveAvatar(userId, id, typeof p.url === "string" ? p.url : "")) changed = true;
            continue;
          }
          const k = core.obj(await core.tryWaha(userId, "GET", "/api/contacts", { query: { contactId: id } }));
          const name = clean(k.name) || clean(k.shortName), push = clean(k.pushname ?? k.pushName ?? k.notify ?? k.verifiedName);
          if (name || push) { await self.upsertContact(userId, id, { name, pushName: push, blocked: typeof k.isBlocked === "boolean" ? k.isBlocked : undefined, business: typeof k.isBusiness === "boolean" ? k.isBusiness : undefined }); changed = true; }
          const p = core.obj(await core.tryWaha(userId, "GET", "/api/contacts/profile-picture", { query: { contactId: id } }));
          const url = typeof p.profilePictureURL === "string" ? p.profilePictureURL : typeof p.profilePictureUrl === "string" ? p.profilePictureUrl : typeof p.url === "string" ? p.url : "";
          if (await self.saveAvatar(userId, id, url)) changed = true;
        }
        return changed;
      } catch { return false; }
    },
  };

  /** Stores one {lid, pn} answer of WAHA's lids API. */
  async function pair(userId: string, row: unknown): Promise<boolean> {
    const o = core.obj(row);
    const lid = lidOf(normId(o.lid)), pn = pnOf(normId(o.pn));
    if (!lid || !pn) return false;
    await self.seen(userId, pn, true);
    await self.link(userId, lid, pn);
    return true;
  }
  return self;
}
