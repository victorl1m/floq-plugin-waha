// WhatsApp Business labels: the label list (cached), assigning labels to chats (mirrored into chat_state.labels for the chat-list filter) and the label events.
import type { Deps } from "./extras.js";
import { WahaError } from "./client.js";
import { normId } from "./ids.js";
import { enc } from "./more-util.js";

export interface Label { id: string; name: string; color: string }
export const LABELS_TTL_MS = 5 * 60_000;
/** WhatsApp's 20 label colours by WAHA colour index (WAHA reports colorHex too; this is the fallback and the set the UI offers). */
export const LABEL_COLORS = ["#ff9485", "#64c4ff", "#ffd429", "#dfaef0", "#99b6c1", "#55ccb3", "#ff9dff", "#d3a91d", "#6d7cce", "#d7e752", "#00d0e2", "#ffc5c7", "#93ceac", "#f74848", "#00a0f2", "#83e422", "#ffaf04", "#b5ebff", "#9ba6ff", "#9368cf"];
const LABEL_ID = /^[\w-]{1,40}$/;
const HEX = /^#[0-9a-f]{6}$/i;

const rgb = (h: string) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
/** Index of the palette colour closest to a hex colour. */
export function colorIndex(hex: string): number {
  const [r, g, b] = rgb(hex);
  let best = 0, bestD = Infinity;
  LABEL_COLORS.forEach((c, i) => { const [x, y, z] = rgb(c), d = (r - x) ** 2 + (g - y) ** 2 + (b - z) ** 2; if (d < bestD) { bestD = d; best = i; } });
  return best;
}
export function parseLabel(raw: unknown): Label | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>, id = o.id === undefined || o.id === null ? "" : String(o.id);
  if (!LABEL_ID.test(id)) return null;
  const hex = typeof o.colorHex === "string" && HEX.test(o.colorHex) ? o.colorHex.toLowerCase() : LABEL_COLORS[Number(o.color)] ?? LABEL_COLORS[0];
  return { id, name: typeof o.name === "string" ? o.name.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 100) : "", color: hex };
}

export function registerLabels({ core, identity, store }: Deps): void {
  const { ctx } = core;
  const q = (sql: string, params: unknown[]) => ctx.db.query(sql, params);
  const R = ctx.routes;
  const cache = new Map<string, { at: number; labels: Label[]; supported: boolean }>();

  async function load(userId: string): Promise<{ labels: Label[]; supported: boolean }> {
    const hit = cache.get(userId);
    if (hit && Date.now() - hit.at < LABELS_TTL_MS) return hit;
    let entry: { at: number; labels: Label[]; supported: boolean };
    try {
      const list = await core.waha<unknown>(userId, "GET", "/api/{session}/labels");
      entry = { at: Date.now(), labels: (Array.isArray(list) ? list : []).map(parseLabel).filter((l): l is Label => l !== null), supported: true };
    } catch (e) {
      // 501 (engine), or a client error such as a non-business account: no labels here. A session that is not ready or a WAHA that is down is a real error.
      if (e instanceof WahaError && (e.status === 501 || (e.status >= 400 && e.status < 500 && e.status !== 401 && e.status !== 403 && e.status !== 422))) entry = { at: Date.now(), labels: [], supported: false };
      else return core.fail(e, "labels");
    }
    cache.set(userId, entry);
    return entry;
  }
  const changed = (userId: string) => { cache.delete(userId); core.publish(userId, "labels", {}); core.publish(userId, "chats", {}); };
  const labelId = (v: unknown) => { const id = typeof v === "string" || typeof v === "number" ? String(v) : ""; if (!LABEL_ID.test(id)) throw ctx.httpError(400, "invalid_label", "label id is invalid"); return id; };
  const labelColor = (v: unknown) => { if (typeof v !== "string" || !HEX.test(v)) throw ctx.httpError(400, "invalid_color", "color must be a hex colour like #64c4ff"); return colorIndex(v); };
  const chatLabels = async (userId: string, chatId: string): Promise<string[]> => {
    const r = await q(`SELECT labels FROM {{p}}chat_state WHERE user_id = $1 AND session = $S AND chat_id = $2`, [userId, chatId]);
    return Array.isArray(r.rows[0]?.labels) ? (r.rows[0].labels as unknown[]).map(String) : [];
  };

  R.get("/labels", async ({ userId }) => {
    await core.owner(userId);
    const { labels, supported } = await load(userId);
    return { labels, supported };
  });
  R.post("/labels", async ({ userId, body }) => {
    await core.owner(userId);
    const b = core.obj(body), name = core.text(typeof b.name === "string" ? b.name.trim() : b.name, 100, "name"), color = labelColor(b.color);
    const res = await core.guard(() => core.waha<unknown>(userId, "POST", "/api/{session}/labels", { body: { name, color } }), "label create");
    changed(userId);
    return { ok: true, label: parseLabel(res) };
  });
  R.post("/labels/update", async ({ userId, body }) => {
    await core.owner(userId);
    const b = core.obj(body), id = labelId(b.id), name = core.text(typeof b.name === "string" ? b.name.trim() : b.name, 100, "name"), color = labelColor(b.color);
    await core.guard(() => core.waha(userId, "PUT", `/api/{session}/labels/${enc(id)}`, { body: { name, color } }), "label update");
    changed(userId);
    return { ok: true };
  });
  R.post("/labels/delete", async ({ userId, body }) => {
    await core.owner(userId);
    const id = labelId(core.obj(body).id);
    await core.guard(() => core.waha(userId, "DELETE", `/api/{session}/labels/${enc(id)}`), "label delete");
    await dropLabel(userId, id);
    changed(userId);
    return { ok: true };
  });
  R.get("/labels/chat", async ({ userId, query }) => {
    await core.owner(userId);
    const chatId = core.chatId(query?.chatId), canonical = await identity.canonical(userId, chatId);
    const target = (await store.route(userId, chatId))[0];
    const list = await core.guard(() => core.waha<unknown>(userId, "GET", `/api/{session}/labels/chats/${enc(target)}`), "chat labels");
    const ids = (Array.isArray(list) ? list : []).map(parseLabel).filter((l): l is Label => l !== null).map((l) => l.id);
    await store.setState(userId, canonical, { labels: ids });
    return { chatId: canonical, labels: ids };
  });
  R.post("/labels/chat", async ({ userId, body }) => {
    await core.owner(userId);
    const b = core.obj(body), chatId = core.chatId(b.chatId);
    if (!Array.isArray(b.labels) || b.labels.length > 50) throw ctx.httpError(400, "invalid_labels", "labels must be a list of label ids");
    const ids = [...new Set(b.labels.map(labelId))];
    const canonical = await identity.canonical(userId, chatId), target = (await store.route(userId, chatId))[0];
    await core.guard(() => core.waha(userId, "PUT", `/api/{session}/labels/chats/${enc(target)}`, { body: { labels: ids.map((id) => ({ id })) } }), "chat labels");
    await store.setState(userId, canonical, { labels: ids });
    core.publish(userId, "chats", {});
    return { ok: true, chatId: canonical, labels: ids };
  });

  async function dropLabel(userId: string, id: string) {
    await q(`UPDATE {{p}}chat_state SET labels = COALESCE((SELECT jsonb_agg(x) FROM jsonb_array_elements(labels) x WHERE x <> to_jsonb($2::text)), '[]'::jsonb), updated_at = now()
               WHERE user_id = $1 AND session = $S AND labels @> jsonb_build_array($2::text)`, [userId, id]);
  }

  core.on("label.upsert", (userId, e) => {
    const l = parseLabel(e.payload);
    const hit = cache.get(userId);
    if (l && hit?.supported) hit.labels = hit.labels.some((x) => x.id === l.id) ? hit.labels.map((x) => (x.id === l.id ? l : x)) : [...hit.labels, l];
    else cache.delete(userId);
    core.publish(userId, "labels", {}); core.publish(userId, "chats", {});
  });
  core.on("label.deleted", async (userId, e) => {
    const id = String(e.payload.id ?? "");
    if (!LABEL_ID.test(id)) return;
    const hit = cache.get(userId);
    if (hit) hit.labels = hit.labels.filter((x) => x.id !== id);
    await dropLabel(userId, id);
    core.publish(userId, "labels", {}); core.publish(userId, "chats", {});
  });
  for (const event of ["label.chat.added", "label.chat.deleted"]) core.on(event, async (userId, e) => {
    const id = String(e.payload.labelId ?? ""), raw = normId(e.payload.chatId);
    if (!LABEL_ID.test(id) || !raw) return;
    const chatId = await identity.canonical(userId, raw), cur = await chatLabels(userId, chatId);
    const next = event === "label.chat.added" ? [...new Set([...cur, id])] : cur.filter((x) => x !== id);
    if (next.length !== cur.length) { await store.setState(userId, chatId, { labels: next }); core.publish(userId, "chats", {}); }
  });
}
