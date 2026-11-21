import { useLayoutEffect, useRef } from "react";
import { Button } from "@/plugins/kit";
import { IconSend, Spinner } from "./icons";

interface Props { value: string; onChange: (v: string) => void; onSend: () => void; sending: boolean; placeholder: string; focusToken: string }

/** Composer bar: an auto-growing rounded message field with a round send button. Enter sends, Shift+Enter breaks the line, IME composition never sends. */
export function Composer({ value, onChange, onSend, sending, placeholder, focusToken }: Props) {
  const ta = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px"; // CSS max-height caps it at 6 lines, then it scrolls
  }, [value, focusToken]);
  useLayoutEffect(() => {
    const root = ta.current?.closest<HTMLElement>(".wa-root");
    if (root && root.clientWidth > 720) ta.current?.focus(); // wide layouts only: on narrow the keyboard would cover the log
  }, [focusToken]);
  const empty = !value.trim();
  return (
    <div className="wa-composer">
      <div className="wa-field">
        <textarea ref={ta} rows={1} value={value} maxLength={4096} placeholder={placeholder} aria-label="Message" title="Enter to send, Shift+Enter for a new line"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
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
