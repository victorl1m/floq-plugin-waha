import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/plugins/kit";
import { cn } from "@/plugins/kit";
import { chatKind, chatPhoneDigits, fullDate, groupMessages, hueOf, quoteAuthor, quoteText, timeOf, type Chat, type Message } from "../shared/chat";
import { formatPhoneDisplay } from "../shared/phone";
import { IconCheck, IconChevronDown, IconClock, IconFile, IconReply } from "./icons";

const NEAR_PX = 120;
const LONG_PRESS_MS = 480;
/** Bar and name colour of a quote: green for your own message, the sender's hue otherwise. */
export const quoteStyle = (q: { fromMe: boolean; sender: string }, chat: Chat) => (q.fromMe ? undefined : ({ "--wa-qh": hueOf(q.sender || chat.chatId) } as CSSProperties));
const senderLabel = (m: Message) => {
  if (m.senderName) return m.senderName;
  const digits = chatPhoneDigits({ chatId: m.sender });
  return digits ? formatPhoneDisplay(digits) : "";
};

interface BubbleProps { m: Message; chat: Chat; first: boolean; last: boolean; sender: string; onReply?: (m: Message) => void; onJump: (id: string) => void }

function Bubble({ m, chat, first, last, sender, onReply, onJump }: BubbleProps) {
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = () => { if (press.current) { clearTimeout(press.current); press.current = null; } };
  const canReply = Boolean(onReply) && !m.pending && !m.id.startsWith("out-");
  const q = m.replyTo;
  return (
    <div className={cn("wa-msg", m.fromMe ? "wa-mine" : "wa-theirs", first && "wa-first", last && "wa-last", m.pending && "wa-pending")} data-mid={m.id}>
      <div className="wa-bubble" onDoubleClick={canReply ? () => onReply!(m) : undefined}
        // Touch: press and hold a bubble to reply to it.
        onPointerDown={canReply ? (e) => { if (e.pointerType === "mouse") return; cancel(); press.current = setTimeout(() => { press.current = null; onReply!(m); }, LONG_PRESS_MS); } : undefined}
        onPointerUp={cancel} onPointerLeave={cancel} onPointerCancel={cancel} onPointerMove={(e) => { if (Math.abs(e.movementX) + Math.abs(e.movementY) > 6) cancel(); }}>
        {sender && <span className="wa-sender" style={{ "--wa-h": hueOf(m.sender) } as CSSProperties}>{sender}</span>}
        {q && (
          <button type="button" className={cn("wa-quote", q.fromMe && "wa-quote-me")} style={quoteStyle(q, chat)} disabled={!q.id} aria-label={`Quoted message from ${quoteAuthor(q, chat)}: ${quoteText(q)}`}
            onClick={() => onJump(q.id)}>
            <b>{quoteAuthor(q, chat)}</b>
            <span>{q.hasMedia && <IconFile />}{quoteText(q)}</span>
          </button>
        )}
        {m.hasMedia && (
          <div className="wa-media">
            <span className="wa-media-ico"><IconFile /></span>
            <span><b>Photo or file</b><span>Open WhatsApp to view it</span></span>
          </div>
        )}
        {m.body}
        {!m.body && !m.hasMedia && <span className="wa-unsupported">Unsupported message</span>}
        <time className="wa-stamp" dateTime={m.pending ? undefined : m.sentAt} title={m.pending ? undefined : fullDate(m.sentAt)}>{timeOf(m.sentAt)}{m.fromMe && (m.pending ? <IconClock aria-label="Sending" /> : <IconCheck aria-label="Sent" />)}</time>
        {canReply && (
          <Tooltip>
            <TooltipTrigger asChild><button type="button" className="wa-act" aria-label="Reply" onClick={() => onReply!(m)} onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}><IconReply /></button></TooltipTrigger>
            <TooltipContent>Reply</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

/** Scrolling conversation. Mount it with key=chatId: it jumps to the bottom once, then only follows new messages when near the bottom or sent by you. */
export function MessageLog({ chat, messages, now, onReply }: { chat: Chat; messages: Message[]; now: Date; onReply?: (m: Message) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const near = useRef(true);
  const handled = useRef<string | null>(null);
  const [unseen, setUnseen] = useState(false);
  const group = (chat.kind ?? chatKind(chat.chatId)) === "group";
  const rows = useMemo(() => groupMessages(messages, now), [messages, now]);
  const toBottom = () => { const el = ref.current; if (el) el.scrollTop = el.scrollHeight; near.current = true; };

  // The log shrinks when the composer grows (a reply bar, a second line): keep the latest message in view.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => { if (near.current) el.scrollTop = el.scrollHeight; });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** Scrolls to a quoted message and flashes it. */
  const jump = (id: string) => {
    const el = id ? [...(ref.current?.querySelectorAll<HTMLElement>("[data-mid]") ?? [])].find((n) => n.dataset.mid === id) : undefined;
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    el.classList.remove("wa-flash");
    void el.offsetWidth; // restart the animation when the same quote is clicked twice
    el.classList.add("wa-flash");
    setTimeout(() => el.classList.remove("wa-flash"), 1600);
  };

  useLayoutEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (handled.current === null) { toBottom(); handled.current = lastMsg?.id ?? ""; return; }
    if (!lastMsg || lastMsg.id === handled.current) return;
    handled.current = lastMsg.id;
    if (lastMsg.fromMe || near.current) toBottom(); else setUnseen(true);
  }, [messages]);

  return (
    <div className="wa-logwrap">
      <div ref={ref} className="wa-log" role="log" aria-live="polite" aria-label="Messages" onScroll={(e) => {
        const el = e.currentTarget;
        near.current = el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_PX;
        if (near.current) setUnseen(false);
      }}>
        <div className="wa-col">
          {rows.map((r) => r.type === "day"
            ? <div key={r.key} className="wa-day">{r.label}</div>
            : <Bubble key={r.key} m={r.message} chat={chat} first={r.first} last={r.last} onReply={onReply} onJump={jump} sender={group && !r.message.fromMe && r.first ? senderLabel(r.message) : ""} />)}
        </div>
      </div>
      {unseen && <button type="button" className="wa-jump" aria-label="Jump to latest" onClick={() => { toBottom(); setUnseen(false); }}><IconChevronDown /><i /></button>}
    </div>
  );
}
