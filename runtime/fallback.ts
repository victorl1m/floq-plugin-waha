import { randomInt } from "node:crypto";
import type { AttentionItem, PluginAttention } from "../shared/sdk";

// WhatsApp fallback: a question or approval still pending in Floq after N minutes is sent ONCE to the owner's own number.
// A reply from that number can answer it. Trust rules (see README): HMAC required, sender must be the owner's chat, strict grammar,
// approvals need a one-time code, irreversible approvals can only be denied from WhatsApp.

export const DEFAULT_AFTER_MIN = 3;
export const MAX_AFTER_MIN = 1440;
export const TICK_MS = 5_000;
export const CODE_TTL_MS = 10 * 60_000;
export const CODE_TRIES = 3;
export const PROMPT_TTL_MS = 24 * 3600_000;
export const MAX_OPEN = 10;
/** Fallback prompts sent per rolling hour: an agent that creates and cancels questions cannot flood the owner's phone. */
export const MAX_SENDS_PER_HOUR = 20;
export const MESSAGE_MAX = 600;
const KV_KEY = "fallback.state";
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** One line of safe text: no control chars, no brackets, backticks or WhatsApp formatting characters, no links, no approval-marker look-alikes. */
export function sanitize(v: unknown, max: number): string {
  let t = typeof v === "string" ? v : "";
  t = t.normalize("NFKC").replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+/gu, " ").replace(/(?:https?:\/\/|www\.)\S+/gi, "(link removed)").replace(/[\[\]{}`<>*_~]/g, "").replace(/FLOQ\s+(APPROVAL|DECISION)/gi, "Floq $1").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

export interface Prompt {
  short: string; kind: "decision" | "approval"; id: string; chatId: string; msgId: string | null; sentAt: number;
  status: "open" | "done" | "dead";
  qid: string; optionIds: string[]; multi: boolean; allowText: boolean;
  summary: string;
  irreversible: boolean; code?: string; codeExp?: number; codeDead?: boolean; tries: number;
  /** The question could not be shown in full (several questions): WhatsApp only points to the app. */
  openOnly?: boolean;
}
interface Pending { item: AttentionItem; dueAt: number }
/** Only prompts are persisted. Pending items live in memory: the host replays every still-pending item when we subscribe, so a restart can never prompt for a stale one. */
interface State { pending: Record<string, Pending>; prompts: Record<string, Prompt> }


export function newShortId(kind: "decision" | "approval", taken: (s: string) => boolean, rnd: (n: number) => number = randomInt): string {
  for (let i = 0; i < 100; i++) {
    let s = kind === "decision" ? "Q" : "A";
    for (let j = 0; j < 3; j++) s += ALPHABET[rnd(ALPHABET.length)];
    if (!taken(s)) return s;
  }
  throw new Error("no free short id");
}

interface Opt { id: string; label: string }
const optsOf = (raw: unknown): Opt[] => (Array.isArray(raw) ? raw : []).slice(0, 8).map((o, i) => (typeof o === "string" ? { id: o, label: o } : { id: String((o as Opt)?.id ?? i), label: String((o as Opt)?.label ?? (o as Opt)?.id ?? "") }));

/** Head (clipped) + instruction line (never clipped): the reply instructions always survive the length cap. */
const withInstruction = (head: string, instruction: string) => `${head.slice(0, Math.max(0, MESSAGE_MAX - instruction.length - 1))}\n${instruction}`.slice(0, MESSAGE_MAX);

export function formatDecision(short: string, session: string | undefined, question: string, options: Opt[], multi: boolean, allowText: boolean): string {
  const lines = [`Floq question [${short}]${session ? ` from ${sanitize(session, 40)}` : ""}: ${sanitize(question, 220)}`];
  options.forEach((o, i) => lines.push(`${i + 1}) ${sanitize(o.label, 50)}`));
  const how: string[] = [];
  if (options.length) how.push(multi ? `\`${short} 1,3\`` : `\`${short} 1\``);
  if (allowText) how.push(`\`${short} <your text>\``);
  return withInstruction(lines.join("\n"), `Reply ${how.join(" or ") || "in Floq"}`);
}

export function formatOpenInFloq(short: string, session: string | undefined, count: number): string {
  return `Floq question [${short}]${session ? ` from ${sanitize(session, 40)}` : ""}: ${count} questions are waiting for you. Open Floq to answer them.`.slice(0, MESSAGE_MAX);
}

/** `code` null = WhatsApp cannot allow this one (irreversible, or approvals by WhatsApp are not enabled): only deny. */
export function formatApproval(short: string, action: string, irreversible: boolean, code: string | null, detail = ""): string {
  const d = sanitize(detail, 160);
  const head = `Floq approval [${short}] ${sanitize(action, 200)}.${d ? ` Details: ${d}` : ""}`;
  if (irreversible) return withInstruction(head, `This cannot be undone, so it can only be approved in the Floq app. Reply \`${short} no\` to deny.`);
  if (!code) return withInstruction(head, `To allow it, open Floq. Reply \`${short} no\` to deny.`);
  return withInstruction(head, `Reply \`${short} yes ${code}\` to allow (code valid 10 min) or \`${short} no\` to deny.`);
}

/** True for text the fallback itself sends or that answers it: kept out of anything an agent can read. */
export function isFallbackText(body: unknown): boolean {
  if (typeof body !== "string") return false;
  const t = body.trimStart();
  return /^Floq (question|approval) \[[QA][A-Z2-9]{3}\]/.test(t) || /^\[[QA][A-Z2-9]{3}\] /.test(t) || /^`?[QA][A-HJ-NP-Z2-9]{3}`?[ \t]+\S/.test(t);
}

export type Reply =
  | { short: string; kind: "pick"; indexes: number[] }
  | { short: string; kind: "text"; text: string }
  | { short: string; kind: "yes"; code: string | null }
  | { short: string; kind: "no" };

/** Strict grammar: `<Q|A + 3 chars> <rest>` and nothing else. Returns null for anything that is not exactly a reply. */
export function parseReply(raw: unknown): Reply | null {
  if (typeof raw !== "string" || raw.length > 600) return null;
  const m = /^[ \t]*`?([QA][A-Za-z2-9]{3})`?[ \t]+([^\r\n]{1,500}?)[ \t]*`?[ \t]*$/i.exec(raw);
  if (!m) return null;
  const short = m[1].toUpperCase(), rest = m[2].trim();
  const yn = /^(yes|no)(?:[ \t]+(\d{4}))?$/i.exec(rest);
  if (yn && short[0] === "A") return yn[1].toLowerCase() === "no" ? (yn[2] ? null : { short, kind: "no" }) : { short, kind: "yes", code: yn[2] ?? null };
  if (short[0] === "A") return null;
  if (/^\d{1,2}([ \t]*,[ \t]*\d{1,2}){0,7}$/.test(rest)) return { short, kind: "pick", indexes: rest.split(",").map((x) => Number(x.trim())) };
  const text = rest.replace(/[\p{Cc}\p{Cf}]/gu, " ").trim();
  return text ? { short, kind: "text", text } : null;
}

export interface FallbackDeps {
  attention: PluginAttention;
  schedule(ms: number, fn: () => void | Promise<void>): () => void;
  getOwner(): Promise<string | null>;
  kv: { get(userId: string, key: string): Promise<unknown>; set(userId: string, key: string, v: unknown): Promise<void> };
  /** The owner's `@lid` chat id (WhatsApp may deliver the self-chat under it instead of `@c.us`), or null when it cannot be resolved. Only asked for `@lid` messages. */
  ownLid?(userId: string, ownChat: string): Promise<string | null>;
  settings(userId: string): Promise<{ enabled: boolean; afterMin: number; ownChat: string | null; hmacConfigured: boolean; allowApprovals?: boolean; selfSession?: boolean }>;
  /** Must send WITHOUT storing the text in the agent-readable inbox, and remember the WAHA message id (see `isOwnSend`). */
  send(userId: string, chatId: string, text: string): Promise<string | null>;
  /** True for any WAHA message id this plugin sent (prompts, confirmations, agent messages). Such messages are never replies. */
  isOwnSend?(msgId: string): boolean;
  edit(userId: string, chatId: string, msgId: string, text: string): Promise<void>;
  now?: () => number;
  rnd?: (n: number) => number;
  log?: { warn(m: string, f?: Record<string, unknown>): void };
}

export interface InboundMessage { chatId: string; fromMe: boolean; sender: string; body: string; msgId: string; /** WAHA `payload.source`: "app" (typed on the phone) or "api" (sent through the HTTP API, e.g. by an agent). */ source?: string }

export function createFallback(d: FallbackDeps) {
  const now = d.now ?? Date.now, rnd = d.rnd ?? randomInt;
  let state: State | null = null;
  let loadedFor: string | null = null;
  let chain: Promise<unknown> = Promise.resolve();
  /** One operation at a time: ticks, host events and inbound replies never interleave. */
  const locked = <T>(fn: () => Promise<T>): Promise<T> => { const r = chain.then(fn, fn); chain = r.catch(() => undefined); return r; };

  async function load(owner: string): Promise<State> {
    if (state && loadedFor === owner) return state;
    const raw = (await d.kv.get(owner, KV_KEY)) as Partial<State> | null;
    state = { pending: {}, prompts: raw?.prompts && typeof raw.prompts === "object" ? raw.prompts : {} };
    loadedFor = owner;
    return state;
  }
  const save = (owner: string) => d.kv.set(owner, KV_KEY, state && { prompts: state.prompts });
  /** Rolling window of prompt sends (F13). */
  const sendTimes: number[] = [];
  const say = async (owner: string, chatId: string, text: string) => { try { await d.send(owner, chatId, text.slice(0, MESSAGE_MAX)); } catch { d.log?.warn("fallback reply failed"); } };

  function track(item: AttentionItem): void {
    void locked(async () => {
      const owner = await d.getOwner();
      if (!owner || item.userId !== owner || (item.kind !== "decision" && item.kind !== "approval") || typeof item.id !== "string") return;
      const s = await load(owner);
      if (s.pending[item.id] || Object.values(s.prompts).some((p) => p.id === item.id)) return;
      const cfg = await d.settings(owner);
      if (!cfg.enabled || cfg.afterMin <= 0) return;
      const created = typeof item.createdAt === "number" ? item.createdAt : Date.parse(String(item.createdAt ?? "")) || now();
      if (now() - created > PROMPT_TTL_MS) return;
      s.pending[item.id] = { item, dueAt: Math.max(created + cfg.afterMin * 60_000, now()) };
    }).catch(() => d.log?.warn("fallback track failed"));
  }

  async function sendPrompt(owner: string, s: State, item: AttentionItem, chatId: string, allowApprovals: boolean): Promise<void> {
    const short = newShortId(item.kind, (x) => x in s.prompts, rnd);
    const base = { short, kind: item.kind, id: item.id, chatId, sentAt: now(), status: "open" as const, tries: 0, irreversible: false, multi: false, allowText: false, qid: "", optionIds: [] as string[], summary: "" };
    let text: string, p: Prompt;
    if (item.kind === "decision") {
      const qs = item.questions ?? [];
      if (qs.length !== 1) {
        // Several questions: answering one from here would resolve all of them unseen. Point to the app instead.
        text = formatOpenInFloq(short, item.sessionName, qs.length || 1);
        p = { ...base, openOnly: true, summary: "questions" };
      } else {
        const q = qs[0];
        const options = optsOf(q.options);
        const multi = q.multiSelect === true, allowText = q.allowText === true;
        const question = String(q.question ?? q.text ?? "");
        text = formatDecision(short, item.sessionName, question, options, multi, allowText);
        p = { ...base, qid: q.id ?? "q1", optionIds: options.map((o) => o.id), multi, allowText, summary: sanitize(question, 80) };
      }
    } else {
      const action = String(item.action ?? "");
      const irreversible = item.irreversible === true;
      const code = irreversible || !allowApprovals ? null : String(rnd(10000)).padStart(4, "0");
      text = formatApproval(short, action, irreversible, code, String(item.detail ?? ""));
      p = { ...base, irreversible, summary: sanitize(action, 80), ...(code ? { code, codeExp: now() + CODE_TTL_MS } : {}) };
    }
    const msgId = await d.send(owner, chatId, text);
    s.prompts[short] = { ...p, msgId };
  }

  async function tick(): Promise<void> {
    const owner = await d.getOwner();
    if (!owner) return;
    const s = await load(owner);
    const t = now();
    let dirty = false;
    for (const [k, p] of Object.entries(s.prompts)) if (t - p.sentAt > PROMPT_TTL_MS || (p.status !== "open" && t - p.sentAt > 3600_000)) { delete s.prompts[k]; dirty = true; }
    // Pending items live in memory (filled by onPending, cleared by onResolved): only those are ever sent. Expire what the host never closed.
    for (const [id, v] of Object.entries(s.pending)) {
      const created = typeof v.item.createdAt === "number" ? v.item.createdAt : Date.parse(String(v.item.createdAt ?? "")) || v.dueAt;
      if (t - created > PROMPT_TTL_MS) delete s.pending[id];
    }
    const due = Object.entries(s.pending).filter(([, v]) => v.dueAt <= t);
    if (due.length) {
      const cfg = await d.settings(owner);
      if (cfg.enabled && cfg.afterMin > 0 && cfg.ownChat && cfg.hmacConfigured) {
        for (const [id, v] of due) {
          if (Object.values(s.prompts).filter((p) => p.status === "open").length >= MAX_OPEN) break;
          while (sendTimes.length && t - sendTimes[0] > 3600_000) sendTimes.shift();
          if (sendTimes.length >= MAX_SENDS_PER_HOUR) break;
          if (!s.pending[id]) continue;
          delete s.pending[id]; dirty = true; sendTimes.push(t);
          try { await sendPrompt(owner, s, v.item, cfg.ownChat, cfg.allowApprovals === true); } catch { d.log?.warn("fallback send failed"); }
        }
      }
    }
    if (dirty) await save(owner);
  }

  async function resolved(e: { kind: "decision" | "approval"; id: string; status: string; by: string }): Promise<void> {
    const owner = await d.getOwner();
    if (!owner) return;
    const s = await load(owner);
    let dirty = false;
    if (s.pending[e.id]) { delete s.pending[e.id]; dirty = true; }
    for (const p of Object.values(s.prompts)) {
      if (p.id !== e.id || p.status !== "open") continue;
      p.status = "done"; dirty = true;
      if (e.by === "plugin") continue; // answered from WhatsApp: the confirmation was already sent
      const verb = ({ answered: "Answered in Floq", granted: "Approved in Floq", denied: "Denied in Floq", cancelled: "Cancelled", expired: "Expired" } as Record<string, string>)[e.status] ?? "Closed";
      const note = `${verb}: ${p.summary}`;
      let edited = false;
      if (p.msgId) { try { await d.edit(owner, p.chatId, p.msgId, note); edited = true; } catch { /* fall through to a follow-up */ } }
      if (!edited) await say(owner, p.chatId, note);
    }
    if (dirty) await save(owner);
  }

  /** Returns true when the message was a valid reply to an open prompt (it was consumed). Everything else is left to the normal inbox path. */
  async function inbound(m: InboundMessage): Promise<boolean> {
    const owner = await d.getOwner();
    if (!owner) return false;
    const cfg = await d.settings(owner);
    if (!cfg.enabled || !cfg.hmacConfigured || !cfg.ownChat) return false;
    // The owner's chat is `@c.us`, or its `@lid` alias (resolved through WAHA; unresolved fails closed).
    let ownIds = [cfg.ownChat];
    if (m.chatId !== cfg.ownChat) {
      if (!m.chatId.endsWith("@lid") || !d.ownLid) return false;
      let lid: string | null = null;
      try { lid = await d.ownLid(owner, cfg.ownChat); } catch { lid = null; }
      if (!lid || m.chatId !== lid) return false;
      ownIds = [cfg.ownChat, lid];
    }
    // Anything this plugin sent (including what an agent sent through it) is never a reply, even when the echo beats the send response's id.
    if (d.isOwnSend?.(m.msgId)) return false;
    // `fromMe` is accepted only for the owner's own phone typing in a self-chat: the session IS the owner's number and WAHA says the message came from the app, not the API.
    if (m.fromMe ? !(cfg.selfSession === true && m.source === "app") : !ownIds.includes(m.sender)) return false;
    const r = parseReply(m.body);
    if (!r) return false;
    const s = await load(owner);
    const p = s.prompts[r.short];
    if (!p || p.status !== "open" || m.msgId === p.msgId) return false;
    if (now() - p.sentAt > PROMPT_TTL_MS) return false;
    const reply = (t: string) => say(owner, p.chatId, t);
    const fail = async (err: unknown) => {
      if ((err as { status?: number })?.status === 409) { p.status = "done"; await save(owner); await reply(`[${p.short}] Already answered in Floq.`); }
      else { d.log?.warn("fallback resolve failed"); await reply(`[${p.short}] Could not record that. Please answer in Floq.`); }
    };

    if (p.kind === "decision") {
      if (p.openOnly) { await reply(`[${p.short}] Open Floq to answer these questions.`); return true; }
      if (r.kind !== "pick" && r.kind !== "text") return false;
      let optionIds: string[] = [], text = "";
      if (r.kind === "pick") {
        const idx = [...new Set(r.indexes)];
        if (idx.some((i) => i < 1 || i > p.optionIds.length) || (!p.multi && idx.length > 1)) { await reply(`[${p.short}] Pick a number from the list.`); return true; }
        optionIds = idx.map((i) => p.optionIds[i - 1]);
      } else {
        if (!p.allowText) { await reply(`[${p.short}] Reply with a number from the list.`); return true; }
        text = r.text;
      }
      try { await d.attention.resolveDecision(p.id, [{ questionId: p.qid, optionIds, text }]); }
      catch (e) { await fail(e); return true; }
      p.status = "done"; await save(owner);
      await reply(`[${p.short}] Answer recorded: ${p.summary}`);
      return true;
    }

    if (r.kind === "no") {
      try { await d.attention.resolveApproval(p.id, "deny"); } catch (e) { await fail(e); return true; }
      p.status = "done"; await save(owner);
      await reply(`[${p.short}] Denied.`);
      return true;
    }
    if (r.kind !== "yes") return false;
    if (p.irreversible) { await reply(`[${p.short}] This cannot be undone: approve it in the Floq app. Reply "${p.short} no" to deny.`); return true; }
    if (cfg.allowApprovals !== true || !p.code) { await reply(`[${p.short}] Open Floq to allow this. Reply "${p.short} no" to deny.`); return true; }
    // A dead code only blocks Allow; Deny stays possible until the item is resolved.
    if (p.codeDead || !p.codeExp || now() > p.codeExp) { p.codeDead = true; p.code = undefined; await save(owner); await reply(`[${p.short}] Code expired. Approve it in the Floq app, or reply "${p.short} no" to deny.`); return true; }
    if (r.code !== p.code) {
      p.tries++;
      if (p.tries >= CODE_TRIES) { p.codeDead = true; p.code = undefined; await save(owner); await reply(`[${p.short}] Too many wrong codes. Approve it in the Floq app, or reply "${p.short} no" to deny.`); }
      else { await save(owner); await reply(`[${p.short}] Wrong code (${CODE_TRIES - p.tries} left).`); }
      return true;
    }
    p.status = "done"; p.code = undefined; await save(owner); // single use: burn the code before calling the host
    try { await d.attention.resolveApproval(p.id, "allow"); } catch (e) { await fail(e); return true; }
    await reply(`[${p.short}] Approved.`);
    return true;
  }

  const offs: (() => void)[] = [];
  return {
    start() {
      offs.push(d.attention.onPending(track), d.attention.onResolved((e) => { void locked(() => resolved(e)).catch(() => d.log?.warn("fallback resolved failed")); }), d.schedule(TICK_MS, () => locked(tick)));
    },
    stop() { for (const o of offs.splice(0)) o(); },
    tick: () => locked(tick),
    inbound: (m: InboundMessage) => locked(() => inbound(m)),
    track,
    /** Test hook: waits for queued work. */
    idle: () => chain.then(() => undefined),
  };
}
