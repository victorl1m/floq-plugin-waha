// Presence: who is online / typing in a chat (WAHA subscribes on the first read), pushed to the UI as "presence" events, and the account's own online state.
import type { Deps } from "./extras.js";
import { WahaError } from "./client.js";
import { isGroup, normId } from "./ids.js";
import { rec } from "./parse.js";
import { enc, isoOf, peopleOf } from "./more-util.js";

export const PRESENCE_TTL_MS = 10_000;
const STATES = new Set(["online", "offline", "typing", "recording", "paused"]);
export type PresenceState = "online" | "offline" | "typing" | "recording" | "paused" | "unknown";
const stateOf = (v: unknown): PresenceState => (typeof v === "string" && STATES.has(v) ? (v as PresenceState) : "unknown");

interface Entry { participant: string; state: PresenceState; lastSeen: string | null }
const entries = (payload: unknown): Entry[] => (Array.isArray(rec(payload).presences) ? (rec(payload).presences as unknown[]) : []).map((x) => {
  const o = rec(x);
  return { participant: normId(o.participant), state: stateOf(o.lastKnownPresence), lastSeen: isoOf(o.lastSeen) };
});

export function registerPresence({ core, identity, store }: Deps): void {
  const { ctx } = core;
  const R = ctx.routes;
  const cache = new Map<string, { at: number; value: Record<string, unknown> }>();

  /** The answer for one chat from WAHA's entries: a 1:1 chat has one person; a group lists who is typing or recording. */
  async function shape(userId: string, chatId: string, list: Entry[]) {
    if (!isGroup(chatId)) {
      const own = new Set(await identity.aliases(userId, chatId));
      const e = list.find((x) => own.has(x.participant)) ?? list[0];
      return { chatId, state: e?.state ?? "unknown", lastSeen: e?.lastSeen ?? null };
    }
    const active = list.filter((x) => x.state === "typing" || x.state === "recording");
    const ids = await Promise.all(active.map((x) => identity.canonical(userId, x.participant)));
    const people = await peopleOf(core, userId, ids);
    const participants = active.map((x, i) => ({ id: ids[i], name: people.get(ids[i])?.name ?? "", state: x.state }));
    const state: PresenceState = participants.some((p) => p.state === "typing") ? "typing" : participants.length ? "recording" : list.some((x) => x.state === "online") ? "online" : "unknown";
    return { chatId, state, lastSeen: null, participants };
  }

  R.get("/presence", async ({ userId, query }) => {
    await core.owner(userId);
    const chatId = core.chatId(query?.chatId), canonical = await identity.canonical(userId, chatId);
    const hit = cache.get(userId + "|" + canonical);
    if (hit && Date.now() - hit.at < PRESENCE_TTL_MS) return hit.value;
    const target = (await store.route(userId, chatId))[0];
    let value: Record<string, unknown>;
    try {
      value = await shape(userId, canonical, entries(await core.waha<unknown>(userId, "GET", `/api/{session}/presence/${enc(target)}`)));
    } catch (e) {
      // WAHA has nothing for this chat (yet): unknown, not an error. Anything else (engine, session, network) is reported.
      if (e instanceof WahaError && e.status === 404) value = { chatId: canonical, state: "unknown", lastSeen: null };
      else return core.fail(e, "presence");
    }
    if (cache.size > 300) cache.clear();
    cache.set(userId + "|" + canonical, { at: Date.now(), value });
    return value;
  });

  R.post("/presence/me", async ({ userId, body }) => {
    await core.owner(userId);
    const online = core.obj(body).online;
    if (typeof online !== "boolean") throw ctx.httpError(400, "invalid_online", "online must be true or false");
    await core.guard(() => core.waha(userId, "POST", "/api/{session}/presence", { body: { presence: online ? "online" : "offline" } }), "presence");
    return { ok: true, online };
  });

  core.on("presence.update", async (userId, e) => {
    const raw = normId(e.payload.id);
    if (!raw) return;
    const chatId = await identity.canonical(userId, raw), group = isGroup(chatId), list = entries(e.payload);
    cache.delete(userId + "|" + chatId);
    for (const x of list) {
      const participant = group && x.participant ? await identity.canonical(userId, x.participant) : undefined;
      const name = participant ? (await peopleOf(core, userId, [participant])).get(participant)?.name : undefined;
      core.publish(userId, "presence", { chatId, state: x.state, lastSeen: x.lastSeen, ...(participant ? { participant, ...(name ? { name } : {}) } : {}) });
    }
  });
}
