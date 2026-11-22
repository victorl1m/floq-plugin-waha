// Groups: details with a portable participant list (engines answer in different shapes), create, members, subject, description, invite link, settings, leave.
import type { Deps } from "./extras.js";
import { digitsOf, displayDigits, isGroup, lidOf, normId, pnOf } from "./ids.js";

const enc = encodeURIComponent;
const INFO_TTL_MS = 30_000;
const MEMBERS_MAX = 256, ACTION_MAX = 50;
const ACTIONS = { add: "participants/add", remove: "participants/remove", promote: "admin/promote", demote: "admin/demote" } as const;

type Role = "superadmin" | "admin" | "member";
interface Member { id: string; name: string; phone: string | null; role: Role; isMe: boolean }
interface Info { chatId: string; subject: string; description: string; owner: string | null; createdAt: string | null; size: number; participants: Member[]; iAmAdmin: boolean; announce: boolean; restrict: boolean; avatar: number | null }

const str = (v: unknown, max = 2048) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max) : "");
const bool = (...v: unknown[]) => v.find((x): x is boolean => typeof x === "boolean");
/** Unix seconds or milliseconds, or an ISO string, as an ISO string (null when it is none of those). */
function when(v: unknown): string | null {
  const t = typeof v === "number" ? (v < 1e12 ? v * 1000 : v) : typeof v === "string" && v ? Date.parse(v) : NaN;
  return Number.isFinite(t) && t > 86_400_000 ? new Date(t).toISOString() : null;
}

export function registerGroups({ core, identity, store }: Deps): void {
  const { ctx } = core;
  const R = ctx.routes;
  const q = (sql: string, params: unknown[]) => ctx.db.query(sql, params);
  const cache = new Map<string, { at: number; info: Info }>();
  const key = (userId: string, id: string) => userId + "|" + id;

  function groupId(raw: unknown): string {
    const id = core.chatId(raw);
    if (!isGroup(id)) throw ctx.httpError(400, "invalid_chat", "That chat is not a group.");
    return id;
  }
  /** The address to add or remove a person by: their phone id when known, else the lid. */
  async function addressOf(userId: string, raw: unknown): Promise<string> {
    const id = core.chatId(raw);
    if (isGroup(id)) throw ctx.httpError(400, "invalid_chat", "Pick people, not groups.");
    const all = await identity.aliases(userId, id);
    return all.find((a) => pnOf(a)) ?? all[0];
  }
  async function people(userId: string, list: unknown, min = 1, max = ACTION_MAX): Promise<{ id: string }[]> {
    const raw = Array.isArray(list) ? list : [];
    const ids = [...new Set(await Promise.all(raw.slice(0, MEMBERS_MAX + 1).map((p) => addressOf(userId, p))))];
    if (ids.length < min || ids.length > max) throw ctx.httpError(400, "invalid_participants", min ? `Pick between ${min} and ${max} people.` : `Pick up to ${max} people.`);
    return ids.map((id) => ({ id }));
  }
  const path = (id: string, rest = "") => `/api/{session}/groups/${enc(id)}${rest}`;

  const roleOf = (o: Record<string, unknown>): Role | null => {
    const r = typeof o.role === "string" ? o.role.toLowerCase() : typeof o.admin === "string" ? o.admin.toLowerCase() : "";
    if (r === "left" || r === "removed") return null;
    if (r === "superadmin" || o.isSuperAdmin === true || o.IsSuperAdmin === true) return "superadmin";
    if (r === "admin" || o.isAdmin === true || o.IsAdmin === true) return "admin";
    return "member";
  };

  /** Participants from the portable v2 list, else from the engine's raw group object. Learns lid <-> phone links on the way. */
  async function members(userId: string, v2: unknown, g: Record<string, unknown>): Promise<Member[]> {
    const raw = Array.isArray(v2) ? v2 : Array.isArray(g.participants) ? g.participants : Array.isArray(core.obj(g.groupMetadata).participants) ? (core.obj(g.groupMetadata).participants as unknown[]) : [];
    const picked: { id: string; role: Role }[] = [];
    for (const item of raw) {
      const o = core.obj(item), role = roleOf(o);
      if (!role) continue;
      const id = normId(o.id ?? o.JID ?? o.jid), pn = pnOf(normId(o.pn ?? o.PhoneNumber ?? o.phoneNumber)) ?? pnOf(id), lid = lidOf(normId(o.lid ?? o.LID)) ?? lidOf(id);
      if (pn && lid) { await identity.seen(userId, pn, true); await identity.link(userId, lid, pn); }
      const who = pn ?? lid ?? id;
      if (who) picked.push({ id: await identity.canonical(userId, who), role });
    }
    const unique = [...new Map(picked.map((p) => [p.id, p])).values()];
    const ids = unique.map((p) => p.id);
    const aliases = (await q(`SELECT lid, pn FROM {{p}}lid_map WHERE user_id = $1 AND session = $S AND pn = ANY($2::text[])`, [userId, ids])).rows;
    const names = new Map<string, { name: string; phone: string }>();
    for (const r of (await q(`SELECT chat_id, name, push_name, phone FROM {{p}}contacts WHERE user_id = $1 AND session = $S AND chat_id = ANY($2::text[])`, [userId, [...ids, ...aliases.map((a) => String(a.lid))]])).rows) {
      const owner = String(aliases.find((a) => a.lid === r.chat_id)?.pn ?? r.chat_id), cur = names.get(owner);
      names.set(owner, { name: cur?.name || String(r.name || r.push_name || ""), phone: cur?.phone || String(r.phone ?? "") });
    }
    const self = await identity.selfIds(userId);
    const clean = (n: string) => (n && !n.includes("@") && !/^[+\d\s()-]+$/.test(n) ? n : "");
    return unique.map((p) => {
      const n = names.get(p.id), d = digitsOf(p.id) ?? (n && /^\d{8,15}$/.test(n.phone) ? n.phone : null);
      return { id: p.id, name: clean(n?.name ?? ""), phone: d ? displayDigits(d) : null, role: p.role, isMe: self.has(p.id) };
    }).sort((a, b) => rank(a.role) - rank(b.role) || Number(!a.name) - Number(!b.name) || (a.name || a.phone || "").localeCompare(b.name || b.phone || "", undefined, { sensitivity: "base" }));
  }
  const rank = (r: Role) => (r === "superadmin" ? 0 : r === "admin" ? 1 : 2);

  async function info(userId: string, id: string, fresh = false): Promise<Info> {
    const hit = cache.get(key(userId, id));
    if (!fresh && hit && Date.now() - hit.at < INFO_TTL_MS) return hit.info;
    const g = core.obj(await core.guard(() => core.waha(userId, "GET", path(id)), "group info"));
    const v2 = await core.tryWaha(userId, "GET", path(id, "/participants/v2"));
    const meta = core.obj(g.groupMetadata);
    const subject = str(g.subject ?? g.Name ?? g.name ?? meta.subject, 100);
    const participants = await members(userId, v2, g);
    const owner = normId(g.owner ?? g.OwnerJID ?? g.ownerPn ?? meta.owner);
    const announce = bool(g.announce, g.IsAnnounce, meta.announce) ?? (bool(g.membersCanSendMessages) === false);
    const restrict = bool(g.restrict, g.IsLocked, meta.restrict) ?? false;
    if (subject) await identity.upsertContact(userId, id, { name: subject });
    const pic = (await q(`SELECT has_picture, picture_at FROM {{p}}contacts WHERE user_id = $1 AND session = $S AND chat_id = $2`, [userId, id])).rows[0];
    const out: Info = {
      chatId: id, subject, description: str(g.description ?? g.desc ?? g.Topic ?? g.topic ?? meta.desc, 2048), owner: owner ? await identity.canonical(userId, owner) : null,
      createdAt: when(g.creation ?? g.GroupCreated ?? g.createdAt ?? g.timestamp ?? meta.creation), size: participants.length, participants,
      iAmAdmin: participants.some((p) => p.isMe && p.role !== "member"), announce: announce === true, restrict, avatar: pic?.has_picture === true && pic.picture_at ? new Date(pic.picture_at as string).getTime() : null,
    };
    cache.set(key(userId, id), { at: Date.now(), info: out });
    return out;
  }
  /** After any change: forget what was cached and tell the UI. */
  const changed = (userId: string, id: string) => { cache.delete(key(userId, id)); core.publish(userId, "chats", {}); core.publish(userId, "group", { chatId: id }); };

  R.get("/group", async ({ userId, query }) => {
    await core.owner(userId);
    return info(userId, groupId(query.chatId), query.fresh === "1");
  });

  R.post("/group/create", async ({ userId, body }) => {
    await core.owner(userId);
    const o = core.obj(body), name = core.text(o.name, 100, "name").trim();
    const list = await people(userId, o.participants, 0, MEMBERS_MAX);
    const g = core.obj(await core.guard(() => core.waha(userId, "POST", "/api/{session}/groups", { body: { name, participants: list } }), "create group"));
    const meta = core.obj(g.groupMetadata);
    const id = normId(g.id ?? g.gid ?? g.JID ?? g.jid ?? meta.id);
    if (!id || !isGroup(id)) throw ctx.httpError(502, "waha_unavailable", "WAHA did not return the new group.");
    await identity.upsertContact(userId, id, { name });
    changed(userId, id);
    return { chatId: id };
  });

  R.post("/group/participants", async ({ userId, body }) => {
    await core.owner(userId);
    const o = core.obj(body), id = groupId(o.chatId);
    const action = typeof o.action === "string" && Object.hasOwn(ACTIONS, o.action) ? (o.action as keyof typeof ACTIONS) : null;
    if (!action) throw ctx.httpError(400, "invalid_action", "action must be add, remove, promote or demote");
    const list = await people(userId, o.participants);
    await core.guard(() => core.waha(userId, "POST", path(id, "/" + ACTIONS[action]), { body: { participants: list } }), "group members");
    changed(userId, id);
    return { ok: true };
  });

  R.post("/group/subject", async ({ userId, body }) => {
    await core.owner(userId);
    const o = core.obj(body), id = groupId(o.chatId), subject = core.text(o.subject, 100, "subject").trim();
    await core.guard(() => core.waha(userId, "PUT", path(id, "/subject"), { body: { subject } }), "group subject");
    await identity.upsertContact(userId, id, { name: subject });
    changed(userId, id);
    return { ok: true, subject };
  });

  R.post("/group/description", async ({ userId, body }) => {
    await core.owner(userId);
    const o = core.obj(body), id = groupId(o.chatId);
    if (typeof o.description !== "string" || o.description.length > 2048) throw ctx.httpError(400, "invalid_description", "description must be up to 2048 characters");
    const description = o.description.trim();
    await core.guard(() => core.waha(userId, "PUT", path(id, "/description"), { body: { description } }), "group description");
    changed(userId, id);
    return { ok: true, description };
  });

  /** The invite code in whatever shape the engine returns it: "ABC", { code }, { inviteCode }, or the full link. */
  const linkOf = (r: unknown): string | null => {
    const o = core.obj(r), v = typeof r === "string" ? r : [o.code, o.inviteCode, o.invite, o.link, o.url].find((x) => typeof x === "string");
    const code = typeof v === "string" ? v.trim().replace(/^https?:\/\/chat\.whatsapp\.com\//i, "") : "";
    return /^[\w-]{8,64}$/.test(code) ? "https://chat.whatsapp.com/" + code : null;
  };
  R.get("/group/invite", async ({ userId, query }) => {
    await core.owner(userId);
    const id = groupId(query.chatId);
    const link = linkOf(await core.guard(() => core.waha(userId, "GET", path(id, "/invite-code")), "invite link"));
    if (!link) throw ctx.httpError(502, "waha_unavailable", "WAHA did not return an invite link.");
    return { link };
  });
  R.post("/group/invite/revoke", async ({ userId, body }) => {
    await core.owner(userId);
    const id = groupId(core.obj(body).chatId);
    const res = await core.guard(() => core.waha(userId, "POST", path(id, "/invite-code/revoke")), "revoke invite link");
    // Some engines answer with the new code, others with nothing: ask for it.
    const link = linkOf(res) ?? linkOf(await core.guard(() => core.waha(userId, "GET", path(id, "/invite-code")), "invite link"));
    if (!link) throw ctx.httpError(502, "waha_unavailable", "WAHA did not return an invite link.");
    return { link };
  });

  R.post("/group/leave", async ({ userId, body }) => {
    await core.owner(userId);
    const id = groupId(core.obj(body).chatId);
    await core.guard(() => core.waha(userId, "POST", path(id, "/leave")), "leave group");
    changed(userId, id);
    return { ok: true };
  });

  R.post("/group/settings", async ({ userId, body }) => {
    await core.owner(userId);
    const o = core.obj(body), id = groupId(o.chatId);
    const bad = (k: string) => o[k] !== undefined && typeof o[k] !== "boolean";
    if (bad("announce") || bad("restrict") || (o.announce === undefined && o.restrict === undefined)) throw ctx.httpError(400, "invalid_settings", "Give announce and/or restrict as true or false.");
    // announce = only admins can send messages; restrict = only admins can edit the group info.
    if (typeof o.announce === "boolean") await core.guard(() => core.waha(userId, "PUT", path(id, "/settings/security/messages-admin-only"), { body: { adminsOnly: o.announce } }), "group settings");
    if (typeof o.restrict === "boolean") await core.guard(() => core.waha(userId, "PUT", path(id, "/settings/security/info-admin-only"), { body: { adminsOnly: o.restrict } }), "group settings");
    changed(userId, id);
    return { ok: true };
  });

  // WAHA tells us when the group changes (here or on the phone): drop what was cached, learn the subject, refresh the list.
  for (const name of ["group.v2.join", "group.v2.leave", "group.v2.update", "group.v2.participants"]) core.on(name, async (userId, e) => {
    const g = core.obj(e.payload.group), id = normId(g.id ?? e.payload.id);
    if (!id || !isGroup(id)) return;
    const subject = str(g.subject, 100);
    if (subject) await identity.upsertContact(userId, id, { name: subject });
    changed(userId, id);
  });
}
