// Small helpers shared by the labels, status, channels, calls and presence modules.
import type { Core } from "./core.js";
import { UPLOAD_MAX_BYTES } from "./inbox.js";

export const enc = encodeURIComponent;
/** A unix timestamp (seconds, or ms) or an ISO string as an ISO string; null when it is not a date. */
export function isoOf(v: unknown): string | null {
  const n = typeof v === "string" && /^\d+(\.\d+)?$/.test(v) ? Number(v) : v;
  const d = typeof n === "number" && Number.isFinite(n) && n > 0 ? new Date(n * (n < 1e12 ? 1000 : 1)) : typeof n === "string" ? new Date(n) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
}

export interface Person { name: string; phone: string; avatar: number | null }
/** Saved names, numbers and avatar versions of canonical chat ids (a lid contact row counts for its phone id). */
export async function peopleOf(core: Core, userId: string, ids: string[]): Promise<Map<string, Person>> {
  const out = new Map<string, Person>();
  if (!ids.length) return out;
  const r = await core.ctx.db.query(
    `SELECT COALESCE(lm.pn, k.chat_id) AS cid, MAX(NULLIF(k.name, '')) AS name, MAX(NULLIF(k.push_name, '')) AS push, MAX(NULLIF(k.phone, '')) AS phone,
            BOOL_OR(k.has_picture) AS has_picture, MAX(k.picture_at) AS picture_at
       FROM {{p}}contacts k LEFT JOIN {{p}}lid_map lm ON lm.user_id = k.user_id AND lm.session = k.session AND lm.lid = k.chat_id
      WHERE k.user_id = $1 AND k.session = $S AND COALESCE(lm.pn, k.chat_id) = ANY($2::text[]) GROUP BY 1`, [userId, ids]);
  for (const x of r.rows) {
    const name = String(x.name ?? x.push ?? "");
    out.set(String(x.cid), { name: name.includes("@") ? "" : name, phone: String(x.phone ?? ""), avatar: x.has_picture === true && x.picture_at ? new Date(x.picture_at as string).getTime() : null });
  }
  return out;
}

export interface Upload { bytes: Uint8Array; mime: string; filename: string; data: string }
/** A file from a request body: { mime, filename, data (base64) } or { file: { mimetype, filename, data } }. Throws 400 / 413. */
export function uploadOf(core: Core, b: Record<string, unknown>, fallbackName: string): Upload {
  const f = core.obj(b.file), src = Object.keys(f).length ? f : b;
  const raw = typeof src.data === "string" ? src.data.replace(/^data:[^,]*,/, "") : "";
  if (!raw || !/^[A-Za-z0-9+/=\s]+$/.test(raw.slice(0, 2000))) throw core.ctx.httpError(400, "invalid_file", "data must be the file as base64");
  const bytes = Buffer.from(raw, "base64");
  if (!bytes.length) throw core.ctx.httpError(400, "invalid_file", "The file is empty.");
  if (bytes.length > UPLOAD_MAX_BYTES) throw core.ctx.httpError(413, "file_too_large", `Files up to ${Math.floor(UPLOAD_MAX_BYTES / 1024 / 1024)} MB can be sent from Floq.`);
  const m = src.mimetype ?? src.mime;
  const mime = typeof m === "string" && /^[\w.+-]+\/[\w.+-]+(;[\w\s=.+-]+)*$/.test(m) ? m.slice(0, 100) : "application/octet-stream";
  const filename = (typeof src.filename === "string" ? src.filename : "").replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 150) || fallbackName;
  return { bytes, mime, filename, data: bytes.toString("base64") };
}
