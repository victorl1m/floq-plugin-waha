// Incoming calls: WAHA reports them but cannot answer them. A call is a row in {{p}}calls, a "call" entry in the chat ("Missed voice call"),
// a toast and a UI event; the UI can decline it (POST /call/reject).
import type { Deps } from "./extras.js";
import { normId } from "./ids.js";
import { rec, type Parsed } from "./parse.js";
import { isoOf, peopleOf } from "./more-util.js";

/** A call that rang this long without an accepted/rejected event is shown as missed. */
export const RING_MS = 60_000;
const CALL_ID = /^[\w.-]{1,100}$/;
type CallStatus = "ringing" | "accepted" | "missed" | "declined";

export function registerCalls({ core, identity, store }: Deps): void {
  const { ctx } = core;
  const q = (sql: string, params: unknown[]) => ctx.db.query(sql, params);
  const R = ctx.routes;
  const label = async (userId: string, chatId: string) => (await peopleOf(core, userId, [chatId])).get(chatId)?.name ?? "";

  async function setStatus(userId: string, callId: string, status: CallStatus) {
    await q(`UPDATE {{p}}calls SET status = $3 WHERE user_id = $1 AND call_id = $2 AND (status = 'received' OR $3 = 'accepted')`, [userId, callId, status === "ringing" ? "received" : status]);
    // The chat entry only moves forward from ringing; a finished call is not changed by a late event.
    const r = await q(`UPDATE {{p}}messages SET extra = jsonb_set(COALESCE(extra, '{}'::jsonb), '{call,status}', to_jsonb($3::text)) WHERE user_id = $1 AND msg_id = $2 AND extra #>> '{call,status}' = 'ringing' RETURNING chat_id`, [userId, "call_" + callId, status]);
    return r.rows.length > 0;
  }
  const row = async (userId: string, callId: string) => (await q(`SELECT chat_id, is_video, is_group, status FROM {{p}}calls WHERE user_id = $1 AND call_id = $2`, [userId, callId])).rows[0];
  async function announce(userId: string, callId: string, status: CallStatus) {
    const x = await row(userId, callId);
    if (!x) return;
    const chatId = String(x.chat_id);
    core.publish(userId, "call", { id: callId, chatId, name: await label(userId, chatId), video: x.is_video === true, status });
    core.publish(userId, "message", { chatId, call: true });
  }

  core.on("call.received", async (userId, e) => {
    const p = e.payload, callId = typeof p.id === "string" ? p.id : "";
    if (!CALL_ID.test(callId)) return;
    const raw = normId(rec(p._data).CallCreator) || normId(p.from);
    if (!raw) return;
    const group = p.isGroup === true || raw.endsWith("@g.us"), video = p.isVideo === true;
    const chatId = await identity.canonical(userId, raw), at = isoOf(p.timestamp) ?? new Date().toISOString();
    const fresh = await q(`INSERT INTO {{p}}calls (user_id, call_id, chat_id, is_video, is_group, status, at) VALUES ($1,$2,$3,$4,$5,'received',$6) ON CONFLICT (user_id, call_id) DO NOTHING RETURNING call_id`, [userId, callId, chatId, video, group, at]);
    if (!fresh.rows.length) return;
    const m: Parsed = { source: "call", session: e.session, chatId, msgId: "call_" + callId, stanza: callId, fromMe: false, sender: chatId, senderName: "", senderPhone: "", body: "", type: "call", hasMedia: false, media: null,
      extra: { call: { video, status: "ringing" } }, ack: 0, sentAt: new Date(at), reply: null, links: [] };
    await store.save(userId, m, { real: false });
    const name = (await label(userId, chatId)) || "Unknown contact";
    ctx.toast(userId, { title: `Incoming ${video ? "video" : "voice"} call`, description: name });
    await announce(userId, callId, "ringing");
    // WAHA sends no event when a call just stops ringing: after a while it counts as missed.
    if (typeof setTimeout === "function") {
      const t = setTimeout(() => { void (async () => { try { if (await setStatus(userId, callId, "missed")) await announce(userId, callId, "missed"); } catch { /* shown as ringing until the next read */ } })(); }, RING_MS) as unknown as { unref?: () => void };
      t.unref?.();
    }
  });
  core.on("call.accepted", async (userId, e) => {
    const callId = String(e.payload.id ?? "");
    if (!CALL_ID.test(callId) || !(await row(userId, callId))) return;
    await setStatus(userId, callId, "accepted");
    await announce(userId, callId, "accepted");
  });
  core.on("call.rejected", async (userId, e) => {
    const callId = String(e.payload.id ?? "");
    if (!CALL_ID.test(callId) || !(await row(userId, callId))) return;
    // Rejected by us (the decline button) is "declined"; otherwise the caller hung up before an answer: missed.
    const declined = (await ctx.kv.get(userId, "declined:" + callId)) === true;
    await setStatus(userId, callId, declined ? "declined" : "missed");
    await announce(userId, callId, declined ? "declined" : "missed");
  });

  R.post("/call/reject", async ({ userId, body }) => {
    await core.owner(userId);
    const b = core.obj(body), id = typeof b.id === "string" ? b.id : "";
    if (!CALL_ID.test(id)) throw ctx.httpError(400, "invalid_call", "id is invalid");
    const chatId = core.chatId(b.chatId), target = (await store.route(userId, chatId))[0];
    await ctx.kv.set(userId, "declined:" + id, true);
    await core.guard(() => core.waha(userId, "POST", "/api/{session}/calls/reject", { body: { from: target, id } }), "call reject");
    if (await row(userId, id)) { await setStatus(userId, id, "declined"); await announce(userId, id, "declined"); }
    return { ok: true };
  });

  R.get("/calls", async ({ userId, query }) => {
    await core.owner(userId);
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(query?.limit ?? "30"), 10) || 30));
    const rows = (await q(`SELECT call_id, chat_id, is_video, is_group, status, at FROM {{p}}calls WHERE user_id = $1 ORDER BY at DESC LIMIT $2`, [userId, limit])).rows;
    const people = await peopleOf(core, userId, [...new Set(rows.map((x) => String(x.chat_id)))]);
    return { calls: rows.map((x) => {
      const at = new Date(x.at as string);
      const status: CallStatus = x.status === "accepted" || x.status === "declined" || x.status === "missed" ? x.status : Date.now() - at.getTime() > RING_MS ? "missed" : "ringing";
      return { id: String(x.call_id), chatId: String(x.chat_id), name: people.get(String(x.chat_id))?.name ?? "", video: x.is_video === true, group: x.is_group === true, status, at: at.toISOString() };
    }) };
  });
}
