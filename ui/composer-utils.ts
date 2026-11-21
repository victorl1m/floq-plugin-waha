// Pure composer helpers (no React, no DOM): unit-tested in tests/composer.test.mjs.
export type AttachmentKind = "image" | "video" | "audio" | "document";

/** Our cap per file: the Floq plugin transport is JSON/base64 with a 5 MiB limit. */
export const MAX_FILE_BYTES = 3.5 * 1024 * 1024;
export const MAX_FILES = 10;

export function kindOfFile(f: { type?: string; name?: string }): AttachmentKind {
  const t = (f.type ?? "").toLowerCase();
  if (t.startsWith("image/") && t !== "image/svg+xml") return "image";
  if (t.startsWith("video/")) return "video";
  if (t.startsWith("audio/")) return "audio";
  if (!t) {
    const ext = /\.([a-z0-9]+)$/i.exec(f.name ?? "")?.[1]?.toLowerCase() ?? "";
    if (["jpg", "jpeg", "png", "gif", "webp", "heic", "bmp"].includes(ext)) return "image";
    if (["mp4", "mov", "webm", "mkv", "3gp"].includes(ext)) return "video";
    if (["mp3", "ogg", "opus", "m4a", "wav", "aac"].includes(ext)) return "audio";
  }
  return "document";
}

/** 7000 -> "0:07", 65000 -> "1:05", 3_725_000 -> "1:02:05". */
export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const limitLabel = `${MAX_FILE_BYTES / 1024 / 1024} MB`;

/** Splits picked files into the ones that fit (size and count) and human messages for the rest. */
export function screenFiles(files: Array<{ name: string; size: number }>, already: number): { ok: number[]; errors: string[] } {
  const ok: number[] = [], errors: string[] = [];
  files.forEach((f, i) => {
    if (f.size > MAX_FILE_BYTES) errors.push(`${f.name} is ${formatBytes(f.size)}; the limit is ${limitLabel} per file.`);
    else if (f.size === 0) errors.push(`${f.name} is empty.`);
    else if (already + ok.length >= MAX_FILES) { if (!errors.some((e) => e.startsWith("At most"))) errors.push(`At most ${MAX_FILES} files per message.`); }
    else ok.push(i);
  });
  return { ok, errors };
}

export interface MentionCandidate { id: string; name: string; phone?: string }

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const tagOf = (m: MentionCandidate) => m.phone || m.name;

/** Ids of the participants whose "@phone" or "@name" tag appears in the text (tag must end at a non-word character). */
export function mentionsIn(text: string, list: MentionCandidate[] = []): string[] {
  const out: string[] = [];
  for (const m of list) {
    const tag = tagOf(m);
    if (!tag || out.includes(m.id)) continue;
    const at = fold(text), t = "@" + fold(tag);
    let from = 0;
    for (;;) {
      const i = at.indexOf(t, from);
      if (i < 0) break;
      const before = i === 0 || /[\s(]/.test(at[i - 1]), after = at[i + t.length];
      if (before && (after === undefined || !/[\p{L}\p{N}_]/u.test(after))) { out.push(m.id); break; }
      from = i + 1;
    }
  }
  return out;
}

/** The open "@query" at the cursor (the @ must start the text or follow whitespace), or null. */
export function mentionQuery(value: string, cursor: number): { start: number; query: string } | null {
  const upto = value.slice(0, cursor);
  const m = /(^|\s)@([^\s@]{0,30})$/u.exec(upto);
  return m ? { start: upto.length - m[2].length - 1, query: m[2] } : null;
}

export function filterMentions(list: MentionCandidate[], query: string, limit = 6): MentionCandidate[] {
  const q = fold(query);
  const hit = (m: MentionCandidate) => !q || fold(m.name).split(/\s+/).some((w) => w.startsWith(q)) || fold(m.name).startsWith(q) || (m.phone ?? "").includes(q);
  return list.filter(hit).slice(0, limit);
}

export function insertAtCursor(value: string, selStart: number, selEnd: number, insert: string): { value: string; cursor: number } {
  const a = Math.max(0, Math.min(selStart, value.length)), b = Math.max(a, Math.min(selEnd, value.length));
  return { value: value.slice(0, a) + insert + value.slice(b), cursor: a + insert.length };
}

/** Replaces the "@query" that starts at `start` (ending at the cursor) with "@<phone-or-name> ". */
export function applyMention(value: string, start: number, cursor: number, m: MentionCandidate) {
  return insertAtCursor(value, start, cursor, "@" + tagOf(m) + " ");
}
