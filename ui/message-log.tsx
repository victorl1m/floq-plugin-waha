import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/plugins/kit";
import { chatKind, chatPhoneDigits, displayName, groupMessages, type Chat, type Message } from "../shared/chat";
import { messageKind, withMyReaction } from "../shared/format";
import { formatPhoneDisplay } from "../shared/phone";
import { LogCtx, MessageRow, groupSender, quoteStyle, type LogAction, type LogApi } from "./bubbles";
import { DeleteDialog } from "./dialogs";
import { EmojiPicker } from "./emoji-picker";
import { useWa, errorCode, errorStatus, errorText } from "./context";
import { IconChevronDown } from "./icons";
import { IconPin } from "./icons-bubbles";
import { Lightbox } from "./lightbox";
import { downloadMedia } from "./media";

export { quoteStyle };
const NEAR_PX = 120;
const TOP_PX = 80;

export interface MessageLogProps {
  chat: Chat; messages: Message[]; now: Date;
  /** More (older) messages can be loaded: onLoadMore runs when the log is scrolled to the top. */
  hasMore?: boolean;
  onLoadMore?: () => void;
  onReply?: (m: Message) => void;
  onEdit?: (m: Message) => void;
  /** The parent performs the API call. delete: arg { forEveryone }; react: arg emoji ("" removes); star/pin: arg boolean; vote: arg option names. */
  onAction?: (action: LogAction, m: Message, arg?: unknown) => void | Promise<void>;
  /** Search term to mark in message text. */
  highlight?: string;
}
export interface MessageLogHandle {
  /** Scrolls to a loaded message and flashes it; false when it is not loaded. */
  jumpTo: (id: string) => boolean;
}

const MEDIA_LABEL = (m: Message) => (m.body ? m.body : ({ image: "Photo", video: "Video", audio: "Audio", ptt: "Voice message", document: "Document", sticker: "Sticker", location: "Location", vcard: "Contact", poll: "Poll" } as Record<string, string>)[messageKind(m)] ?? "Message");

/** Scrolling conversation. Mount it with key=chatId: it jumps to the bottom once, then only follows new messages when near the bottom or sent by you. */
export const MessageLog = forwardRef<MessageLogHandle, MessageLogProps>(function MessageLog({ chat, messages, now, hasMore, onLoadMore, onReply, onEdit, onAction, highlight = "" }, handle) {
  const { api, chats, features } = useWa();
  const ref = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const near = useRef(true);
  const handled = useRef<string | null>(null);
  const firstId = useRef<string>("");
  const anchor = useRef<{ h: number; top: number; first: string } | null>(null);
  const loading = useRef(false);
  const [unseen, setUnseen] = useState(false);
  const [opt, setOpt] = useState<Record<string, { emoji: string; base: string }>>({});
  const [deleting, setDeleting] = useState<Message | null>(null);
  const [box, setBox] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ m: Message; top: number; left: number } | null>(null);
  const [pinAt, setPinAt] = useState(0);
  const group = (chat.kind ?? chatKind(chat.chatId)) === "group";

  // Your own reaction shows at once; it drops when the parent's data changes or the call fails.
  const shown = useMemo(() => messages.map((m) => {
    const o = opt[m.id];
    return o && o.base === JSON.stringify(m.reactions ?? []) ? { ...m, reactions: withMyReaction(m.reactions, o.emoji) } : m;
  }), [messages, opt]);
  const rows = useMemo(() => groupMessages(shown, now), [shown, now]);
  const images = useMemo(() => shown.filter((m) => messageKind(m) === "image" && m.media?.available !== false), [shown]);
  const pinned = useMemo(() => shown.filter((m) => m.pinned && !m.deleted), [shown]);

  const latest = useRef({ messages, onAction, onReply, onEdit, onLoadMore, hasMore });
  latest.current = { messages, onAction, onReply, onEdit, onLoadMore, hasMore };

  const toBottom = () => { const el = ref.current; if (el) el.scrollTop = el.scrollHeight; near.current = true; };

  const jumpTo = useCallback((id: string): boolean => {
    const el = id ? [...(ref.current?.querySelectorAll<HTMLElement>("[data-mid]") ?? [])].find((n) => n.dataset.mid === id) : undefined;
    if (!el) return false;
    el.scrollIntoView({ block: "center", behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    el.classList.remove("wa-flash");
    void el.offsetWidth; // restart the animation when the same quote is clicked twice
    el.classList.add("wa-flash");
    setTimeout(() => el.classList.remove("wa-flash"), 1600);
    return true;
  }, []);
  useImperativeHandle(handle, () => ({ jumpTo }), [jumpTo]);

  const act = useCallback(async (action: LogAction, m: Message, arg?: unknown) => {
    const fn = latest.current.onAction;
    if (!fn) return;
    if (action === "react") {
      const emoji = typeof arg === "string" ? arg : "";
      setOpt((o) => ({ ...o, [m.id]: { emoji, base: JSON.stringify(m.reactions ?? []) } }));
      try { await fn(action, m, emoji); }
      catch (e) {
        setOpt((o) => { const { [m.id]: _gone, ...rest } = o; return rest; });
        toast.error("Reaction not sent", { description: errorCode(e) === "unsupported" || errorStatus(e) === 501 ? "This WhatsApp engine does not support reactions." : errorText(e) });
      }
      return;
    }
    return fn(action, m, arg);
  }, []);

  const names = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of messages) { const d = chatPhoneDigits({ chatId: m.sender }); if (d && m.senderName) map.set(d, m.senderName); }
    for (const c of chats) { const d = chatPhoneDigits(c); if (d && (c.name ?? "").trim()) map.set(d, displayName(c)); }
    return map;
  }, [chats, messages]);
  const namesRef = useRef(names);
  namesRef.current = names;

  const api2 = useMemo<LogApi>(() => ({
    chat, highlight,
    onReply: onReply ? (m) => latest.current.onReply?.(m) : undefined,
    onEdit: onEdit ? (m) => latest.current.onEdit?.(m) : undefined,
    act, jump: jumpTo,
    openImage: (id) => setBox(id),
    openPicker: (m, anchorEl) => {
      const w = wrap.current?.getBoundingClientRect(), b = anchorEl.getBoundingClientRect();
      if (!w) return;
      const pw = Math.min(380, w.width - 16), ph = Math.min(340, window.innerHeight * 0.55);
      const below = b.bottom - w.top + 6, top = below + ph > w.height - 8 ? Math.max(8, b.top - w.top - ph - 6) : below;
      setPicker({ m, top, left: Math.min(Math.max(8, b.left - w.left), Math.max(8, w.width - pw - 8)) });
    },
    askDelete: (m) => setDeleting(m),
    download: (m) => { void downloadMedia(api, m).catch((e) => toast.error("Download failed", { description: errorCode(e) === "media_unavailable" ? "Not available here. Open WhatsApp on your phone to view it." : errorText(e) })); },
    mentionName: (id) => { const d = /^\d+/.exec(id)?.[0] ?? ""; return "@" + (namesRef.current.get(d) ?? (d ? formatPhoneDisplay(d) : "someone")); },
  }), [chat, highlight, Boolean(onReply), Boolean(onEdit), act, jumpTo, api]); // eslint-disable-line react-hooks/exhaustive-deps

  // The log shrinks when the composer grows (a reply bar, a second line): keep the latest message in view.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => { if (near.current) el.scrollTop = el.scrollHeight; });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    const first = messages[0]?.id ?? "";
    // Older messages were prepended: keep what the reader was looking at in place.
    if (el && anchor.current && first !== anchor.current.first) {
      el.scrollTop = anchor.current.top + (el.scrollHeight - anchor.current.h);
      anchor.current = null; loading.current = false;
    } else if (anchor.current && messages.length) loading.current = false;
    firstId.current = first;
    const lastMsg = messages[messages.length - 1];
    if (handled.current === null) { toBottom(); handled.current = lastMsg?.id ?? ""; return; }
    if (!lastMsg) return;
    // Same last message, taller content (a reaction chip, an edit): stay at the bottom when the reader is there.
    if (lastMsg.id === handled.current) { if (el && near.current) el.scrollTop = el.scrollHeight; return; }
    handled.current = lastMsg.id;
    if (lastMsg.fromMe || near.current) toBottom(); else setUnseen(true);
  }, [messages]);

  const more = () => {
    const el = ref.current;
    if (!el || loading.current || !latest.current.hasMore || !latest.current.onLoadMore) return;
    loading.current = true;
    anchor.current = { h: el.scrollHeight, top: el.scrollTop, first: firstId.current };
    latest.current.onLoadMore();
    setTimeout(() => { loading.current = false; }, 4000);
  };

  const pin = pinned.length ? pinned[(pinned.length - 1 - (pinAt % pinned.length) + pinned.length) % pinned.length] : null;
  const boxIndex = box ? images.findIndex((m) => m.id === box) : -1;

  return (
    <LogCtx.Provider value={api2}>
      <div ref={wrap} className={boxIndex >= 0 ? "wa-logwrap wa-lb-on" : "wa-logwrap"}>
        {pin && (
          <button type="button" className="wa-pinbar" aria-label={"Pinned message: " + MEDIA_LABEL(pin) + (pinned.length > 1 ? ". " + pinned.length + " pinned, click for the next" : "")}
            onClick={() => { jumpTo(pin.id); setPinAt((n) => n + 1); }}>
            <IconPin /><span className="wa-pin-l">Pinned message{pinned.length > 1 ? " (" + (((pinned.length - 1 - (pinAt % pinned.length)) + pinned.length) % pinned.length + 1) + " of " + pinned.length + ")" : ""}</span>
            <span className="wa-pin-t">{MEDIA_LABEL(pin).replace(/\s+/g, " ")}</span>
          </button>
        )}
        <div ref={ref} className="wa-log" role="log" aria-live="polite" aria-label="Messages" onScroll={(e) => {
          const el = e.currentTarget;
          near.current = el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_PX;
          if (near.current) setUnseen(false);
          if (el.scrollTop < TOP_PX) more();
        }}>
          <div className="wa-col">
            {hasMore && <button type="button" className="wa-older" onClick={more}>Load earlier messages</button>}
            {rows.map((r) => r.type === "day"
              ? <div key={r.key} className="wa-day">{r.label}</div>
              : <MessageRow key={r.key} m={r.message} chat={chat} first={r.first} last={r.last} sender={group ? groupSender(r.message, chat) : ""} />)}
          </div>
        </div>
        {unseen && <button type="button" className="wa-jump" aria-label="Jump to latest" onClick={() => { toBottom(); setUnseen(false); }}><IconChevronDown /><i /></button>}
        {picker && (
          <>
            <div className="wa-qpick-back" onClick={() => setPicker(null)} />
            <div className="wa-qpick" style={{ top: picker.top, left: picker.left }}>
              <EmojiPicker onClose={() => setPicker(null)} onPick={(c) => { const m = picker.m; setPicker(null); void act("react", m, m.reactions?.find((r) => r.mine)?.emoji === c ? "" : c); }} />
            </div>
          </>
        )}
        {boxIndex >= 0 && <Lightbox items={images} index={boxIndex} onIndex={(i) => setBox(images[i].id)} onClose={() => setBox(null)} />}
        <DeleteDialog message={deleting} open={deleting !== null} onOpenChange={(v) => { if (!v) setDeleting(null); }}
          onDelete={async (forEveryone) => { if (deleting) await latest.current.onAction?.("delete", deleting, { forEveryone: forEveryone && features.deleteForEveryone }); }} />
      </div>
    </LogCtx.Provider>
  );
});
