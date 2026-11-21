// Chat actions of the inbox: archive, pin, mute, mark unread, delete, clear. WAHA has no pin or mute for chats, so those two live in the inbox only;
// the others also ask WAHA where the engine can, and still apply in the inbox when it cannot ({ ok: true, localOnly: true }).
import type { Deps } from "./extras.js";
import { WahaError } from "./client.js";

const enc = encodeURIComponent;
/** WAHA answers these when the engine (or the chat) cannot do it: the action then applies in the inbox only. */
const cannot = (e: unknown) => e instanceof WahaError && (e.status === 501 || e.status === 405 || e.status === 404);

export function registerChats({ core, identity, store }: Deps): void {
  const { ctx } = core;
  const R = ctx.routes;
  const b = core.obj;

  /** state = the id chat state is stored under (canonical), to = the address WAHA is called with. */
  async function target(userId: string, raw: unknown) {
    const chatId = core.chatId(raw);
    return { state: await identity.canonical(userId, chatId), to: (await store.route(userId, chatId))[0] };
  }
  async function done(userId: string, state: string, patch: Record<string, unknown>, local = false) {
    await store.setState(userId, state, patch);
    core.publish(userId, "chats", {});
    return local ? { ok: true as const, localOnly: true } : { ok: true as const };
  }
  /** Runs the WAHA side; true when WAHA cannot do it (inbox only). Any other failure is an error and nothing changes. */
  async function tryRemote(fn: () => Promise<unknown>, what: string): Promise<boolean> {
    try { await fn(); return false; } catch (e) { if (cannot(e)) return true; return core.fail(e, what); }
  }

  R.post("/chat/archive", async ({ userId, body }) => {
    await core.owner(userId);
    const o = b(body), { state, to } = await target(userId, o.chatId);
    if (typeof o.archived !== "boolean") throw ctx.httpError(400, "invalid_archived", "archived must be true or false");
    const local = await tryRemote(() => core.waha(userId, "POST", `/api/{session}/chats/${enc(to)}/${o.archived ? "archive" : "unarchive"}`), "archive");
    return done(userId, state, { archived: o.archived }, local);
  });

  R.post("/chat/pin", async ({ userId, body }) => {
    await core.owner(userId);
    const o = b(body), { state } = await target(userId, o.chatId);
    if (typeof o.pinned !== "boolean") throw ctx.httpError(400, "invalid_pinned", "pinned must be true or false");
    return done(userId, state, { pinned: o.pinned });
  });

  R.post("/chat/mute", async ({ userId, body }) => {
    await core.owner(userId);
    const o = b(body), { state } = await target(userId, o.chatId);
    let until: string | null = null;
    if (o.until !== null && o.until !== undefined) {
      const t = typeof o.until === "string" ? Date.parse(o.until) : NaN;
      if (Number.isNaN(t) || t <= Date.now()) throw ctx.httpError(400, "invalid_until", "until must be a future date, or null to unmute");
      until = new Date(t).toISOString();
    }
    return done(userId, state, { muted_until: until });
  });

  R.post("/chat/unread", async ({ userId, body }) => {
    await core.owner(userId);
    const { state, to } = await target(userId, b(body).chatId);
    await core.guard(() => core.waha(userId, "POST", `/api/{session}/chats/${enc(to)}/unread`), "mark unread");
    return done(userId, state, { marked_unread: true });
  });

  // The chat disappears from the list; a message newer than cleared_at brings it back (see listChats).
  R.post("/chat/delete", async ({ userId, body }) => {
    await core.owner(userId);
    const { state, to } = await target(userId, b(body).chatId);
    const local = await tryRemote(() => core.waha(userId, "DELETE", `/api/{session}/chats/${enc(to)}`), "delete chat");
    return done(userId, state, { hidden: true, cleared_at: new Date().toISOString(), pinned: false }, local);
  });

  R.post("/chat/clear", async ({ userId, body }) => {
    await core.owner(userId);
    const { state, to } = await target(userId, b(body).chatId);
    const local = await tryRemote(() => core.waha(userId, "DELETE", `/api/{session}/chats/${enc(to)}/messages`), "clear chat");
    return done(userId, state, { cleared_at: new Date().toISOString() }, local);
  });
}
