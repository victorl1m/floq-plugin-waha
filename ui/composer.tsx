import { useLayoutEffect, useRef } from "react";
import { Button } from "@/plugins/kit";
import { quoteAuthor, quoteText, type Chat, type Quote } from "../shared/chat";
import { IconFile, IconSend, IconX, Spinner } from "./icons";
import { quoteStyle } from "./message-log";

interface Props { value: string; onChange: (v: string) => void; onSend: () => void; sending: boolean; placeholder: string; focusToken: string; chat: Chat; reply?: Quote | null; onCancelReply: () => void }

/** Composer bar: an auto-growing rounded message field with a round send button. Enter sends, Shift+Enter breaks the line, IME composition never sends. */
export function Composer({ value, onChange, onSend, sending, placeholder, focusToken, chat, reply, onCancelReply }: Props) {
  const ta = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px"; // CSS max-height caps it at 6 lines, then it scrolls
  }, [value, focusToken]);
  // Picking a message to reply to puts the cursor in the field, on any width.
  useLayoutEffect(() => { if (reply) ta.current?.focus(); }, [reply]);
  useLayoutEffect(() => {
    const root = ta.current?.closest<HTMLElement>(".wa-root");
    if (root && root.clientWidth > 720) ta.current?.focus(); // wide layouts only: on narrow the keyboard would cover the log
  }, [focusToken]);
  const empty = !value.trim();
  return (
    <div className="wa-composer">
      {reply && (
        <div className={"wa-replybar" + (reply.fromMe ? " wa-quote-me" : "")} style={quoteStyle(reply, chat)} role="status" aria-label={`Replying to ${quoteAuthor(reply, chat)}`}>
          <div className="wa-replyto"><b>{quoteAuthor(reply, chat)}</b><span>{reply.hasMedia && <IconFile />}{quoteText(reply)}</span></div>
          <button type="button" className="wa-iconbtn" aria-label="Cancel reply" title="Cancel reply (Esc)" onClick={onCancelReply}><IconX /></button>
        </div>
      )}
      <div className="wa-field">
        <textarea ref={ta} rows={1} value={value} maxLength={4096} placeholder={placeholder} aria-label={reply ? `Reply to ${quoteAuthor(reply, chat)}` : "Message"} title="Enter to send, Shift+Enter for a new line"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && reply) { e.preventDefault(); e.stopPropagation(); onCancelReply(); return; }
            if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing || e.keyCode === 229) return;
            e.preventDefault();
            if (!empty && !sending) onSend();
          }} />
      </div>
      <Button type="button" size="icon" className="wa-send" aria-label="Send message" disabled={empty || sending} onClick={onSend}>
        {sending ? <Spinner /> : <IconSend />}
      </Button>
    </div>
  );
}
