import { useCallback, useEffect, useRef, useState } from "react";
import { usePluginEvent } from "@/plugins/kit";
import { chatKind, displayName, type Chat } from "../shared/chat";
import { useWa } from "./context";

export type PresenceState = "online" | "offline" | "typing" | "recording" | "paused" | "unknown";
export interface PresenceInfo { state: PresenceState; lastSeen: string | null; participants: { id: string; name: string; state: "typing" | "recording" }[] }
interface PresenceEvent { chatId?: string; state?: PresenceState; lastSeen?: string | null; participant?: string; name?: string }
interface PresenceReply { state: PresenceState; lastSeen: string | null; participants?: { id: string; name: string; state: string }[] }

const POLL_MS = 30_000;
/** WhatsApp sends "paused" rarely: a typing indicator that is not repeated for this long is dropped. */
const TYPING_TTL_MS = 8_000;
const EMPTY: PresenceInfo = { state: "unknown", lastSeen: null, participants: [] };
const visible = () => typeof document === "undefined" || document.visibilityState === "visible";
const active = (s: string): s is "typing" | "recording" => s === "typing" || s === "recording";

/** Live presence of a chat: one read now, a read every 30 s while the screen is visible, and the "presence" events in between. */
export function usePresence(chatId: string | null | undefined): PresenceInfo {
  const { api, pluginId, features } = useWa();
  const [info, setInfo] = useState<PresenceInfo>(EMPTY);
  const idRef = useRef(chatId);
  idRef.current = chatId;
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const on = features.presence && !!chatId;

  const read = useCallback(async (id: string) => {
    try {
      const r = await api<PresenceReply>(`/presence?chatId=${encodeURIComponent(id)}`);
      if (idRef.current !== id) return;
      setInfo({ state: r.state, lastSeen: r.lastSeen ?? null, participants: (r.participants ?? []).filter((p): p is PresenceInfo["participants"][number] => active(p.state)) });
    } catch { /* presence is a nicety: no line when the engine cannot tell */ }
  }, [api]);

  useEffect(() => {
    setInfo(EMPTY);
    for (const t of timers.current.values()) clearTimeout(t);
    timers.current.clear();
    if (!on || !chatId) return;
    void read(chatId);
    const poll = setInterval(() => { if (visible()) void read(chatId); }, POLL_MS);
    return () => { clearInterval(poll); for (const t of timers.current.values()) clearTimeout(t); timers.current.clear(); };
  }, [on, chatId, read]);

  usePluginEvent<PresenceEvent>(pluginId, "presence", (e) => {
    if (!e || !chatId || e.chatId !== chatId || !e.state) return;
    const key = e.participant ?? "", state = e.state;
    const old = timers.current.get(key);
    if (old) clearTimeout(old);
    if (active(state)) {
      timers.current.set(key, setTimeout(() => { timers.current.delete(key); setInfo((i) => ({ ...i, state: i.state === "typing" || i.state === "recording" ? "unknown" : i.state, participants: i.participants.filter((p) => p.id !== key) })); }, TYPING_TTL_MS));
    }
    setInfo((i) => {
      if (e.participant) {
        const rest = i.participants.filter((p) => p.id !== e.participant);
        const participants = active(state) ? [...rest, { id: e.participant, name: e.name ?? "", state }] : rest;
        return { ...i, participants, state: participants.some((p) => p.state === "typing") ? "typing" : participants.length ? "recording" : i.state === "typing" || i.state === "recording" ? "unknown" : i.state };
      }
      return { state, lastSeen: e.lastSeen ?? (state === "online" ? null : i.lastSeen), participants: [] };
    });
  });
  return info;
}

const clock = (d: Date, locale?: string) => d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "last seen today at 14:32", "yesterday at ...", a short date otherwise. */
export function lastSeenText(iso: string, now: Date, locale?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const days = Math.round((dayStart(now) - dayStart(d)) / 86_400_000);
  if (days <= 0) return `last seen today at ${clock(d, locale)}`;
  if (days === 1) return `last seen yesterday at ${clock(d, locale)}`;
  const date = d.toLocaleDateString(locale, d.getFullYear() === now.getFullYear() ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
  return `last seen ${date} at ${clock(d, locale)}`;
}

/** The header subtitle for a presence: "typing…", "recording audio…", "online", "last seen …", or "" when nothing is known. */
export function presenceText(p: PresenceInfo, now: Date, group = false, locale?: string): string {
  if (group) {
    const typing = p.participants.filter((x) => x.state === "typing"), rec = p.participants.filter((x) => x.state === "recording");
    const list = typing.length ? typing : rec, verb = typing.length ? "typing" : "recording audio";
    if (!list.length) return "";
    const first = (list[0].name || "Someone").split(" ")[0];
    return list.length === 1 ? `${first} is ${verb}…` : `${list.length} people are ${verb}…`;
  }
  if (p.state === "typing") return "typing…";
  if (p.state === "recording") return "recording audio…";
  if (p.state === "online") return "online";
  return p.state === "offline" && p.lastSeen ? lastSeenText(p.lastSeen, now, locale) : "";
}

/** The second line of a conversation header. Empty (renders nothing) when the engine does not tell. */
export function PresenceLine({ chat, fallback }: { chat: Pick<Chat, "chatId"> & Partial<Chat>; fallback?: string }) {
  const p = usePresence(chat.chatId);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);
  const text = presenceText(p, now, (chat.kind ?? chatKind(chat.chatId)) === "group");
  const live = p.state === "typing" || p.state === "recording" || p.participants.length > 0;
  const shown = text || fallback || "";
  if (!shown) return null;
  return <span className="wa-presence" data-live={live || p.state === "online" ? "true" : undefined} aria-live="polite" title={shown === text ? `${displayName(chat)}: ${text}` : undefined}>{shown}</span>;
}
