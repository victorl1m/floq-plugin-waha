import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/plugins/kit";
import { chatKind, chatPhoneDigits, fullDate, groupMessages, hueOf, timeOf, type Chat, type Message } from "../shared/chat";
import { formatPhoneDisplay } from "../shared/phone";
import { IconChevronDown, IconFile } from "./icons";

const NEAR_PX = 120;
const senderLabel = (m: Message) => {
  if (m.senderName) return m.senderName;
  const digits = chatPhoneDigits({ chatId: m.sender });
  return digits ? formatPhoneDisplay(digits) : "";
};

function Bubble({ m, first, last, sender }: { m: Message; first: boolean; last: boolean; sender: string }) {
  return (
    <div className={cn("wa-msg", m.fromMe ? "wa-mine" : "wa-theirs", first && "wa-first", last && "wa-last", m.pending && "wa-pending")}>
      <div className="wa-bubble">
        {sender && <span className="wa-sender" style={{ "--wa-h": hueOf(m.sender) } as CSSProperties}>{sender}</span>}
        {m.hasMedia && (
          <div className="wa-media">
            <span className="wa-media-ico"><IconFile /></span>
            <span><b>Photo or file</b><span>Open WhatsApp to view it</span></span>
          </div>
        )}
        {m.body}
        {!m.body && !m.hasMedia && <span className="wa-unsupported">Unsupported message</span>}
        <time className="wa-stamp" dateTime={m.pending ? undefined : m.sentAt} title={m.pending ? undefined : fullDate(m.sentAt)}>{m.pending ? "Sending…" : timeOf(m.sentAt)}</time>
      </div>
    </div>
  );
}

/** Scrolling conversation. Mount it with key=chatId: it jumps to the bottom once, then only follows new messages when near the bottom or sent by you. */
export function MessageLog({ chat, messages, now }: { chat: Chat; messages: Message[]; now: Date }) {
  const ref = useRef<HTMLDivElement>(null);
  const near = useRef(true);
  const handled = useRef<string | null>(null);
  const [unseen, setUnseen] = useState(false);
  const group = (chat.kind ?? chatKind(chat.chatId)) === "group";
  const rows = useMemo(() => groupMessages(messages, now), [messages, now]);
  const toBottom = () => { const el = ref.current; if (el) el.scrollTop = el.scrollHeight; near.current = true; };

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
            : <Bubble key={r.key} m={r.message} first={r.first} last={r.last} sender={group && !r.message.fromMe && r.first ? senderLabel(r.message) : ""} />)}
        </div>
      </div>
      {unseen && <button type="button" className="wa-jump" aria-label="Jump to latest" onClick={() => { toBottom(); setUnseen(false); }}><IconChevronDown /><i /></button>}
    </div>
  );
}
