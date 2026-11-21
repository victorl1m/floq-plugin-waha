import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { toast } from "@/plugins/kit";
import { quoteAuthor, quoteText, type Chat, type Quote } from "../shared/chat";
import { AttachmentTray, makeAttachment, revokeAttachment, type Attachment } from "./attachments";
import { applyMention, filterMentions, formatDuration, insertAtCursor, mentionQuery, screenFiles, type MentionCandidate } from "./composer-utils";
import { EmojiPicker } from "./emoji-picker";
import { IconCheck, IconFile, IconSend, IconX, Spinner } from "./icons";
import { IconCamera, IconContact, IconDocument, IconImage, IconMic, IconPencil, IconPin, IconPlus, IconPoll, IconSmile, IconTrash } from "./icons-composer";
import { quoteStyle } from "./message-log";
import { startVoice, voiceSupported, type VoiceSession } from "./voice-recorder";

export type { Attachment } from "./attachments";
export type { AttachmentKind } from "./composer-utils";
export { MAX_FILE_BYTES, formatDuration, kindOfFile, mentionsIn, insertAtCursor } from "./composer-utils";

export interface ComposerFeatures { media: boolean; voice: boolean; poll: boolean; location: boolean; contact: boolean }
export interface ComposerHandle { addFiles(files: File[] | FileList): void; focus(): void }
export interface ComposerProps {
  chat: Chat; placeholder: string; focusToken: string; disabled?: boolean;
  /** The text draft, owned by the parent (per chat). While `editing` is set the field shows editing.body: the composer pushes it through onChange when the edit starts. */
  value: string; onChange(v: string): void;
  reply?: Quote | null; onCancelReply(): void;
  editing?: { id: string; body: string } | null; onCancelEdit?(): void;
  sending: boolean;
  /** Text alone, or attachments with the text as caption (the parent puts it on the first one). */
  onSend(payload: { text: string; attachments: Attachment[] }): void;
  onSendVoice(blob: Blob, durationMs: number): void;
  onTyping?(state: "composing" | "recording" | "paused"): void;
  onExtra?(kind: "poll" | "location" | "contact"): void;
  features: ComposerFeatures;
  /** Group participants: typing "@" opens a suggestion list; use mentionsIn(text, mentions) to get the ids. */
  mentions?: MentionCandidate[];
}

const TYPING_EVERY_MS = 3000, TYPING_PAUSE_MS = 4000, MIN_VOICE_MS = 600, BARS = 36;
const isComposing = (e: KeyboardEvent) => e.nativeEvent.isComposing || e.keyCode === 229;

/** WhatsApp-Web-style bar: emoji and attach buttons beside one rounded field, mic that turns into send, preview tray, reply/edit bar, voice recording mode. */
export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(p, ref) {
  const { chat, value, onChange, reply, editing, sending, features, mentions = [], disabled = false } = p;
  const ta = useRef<HTMLTextAreaElement>(null), rootEl = useRef<HTMLDivElement>(null);
  const emojiBtn = useRef<HTMLButtonElement>(null), attachBtn = useRef<HTMLButtonElement>(null), menuEl = useRef<HTMLDivElement>(null);
  const mediaIn = useRef<HTMLInputElement>(null), docIn = useRef<HTMLInputElement>(null), camIn = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const attRef = useRef(attachments);
  attRef.current = attachments;
  const [popover, setPopover] = useState<null | "emoji" | "attach">(null);
  const [cursor, setCursor] = useState(0);
  const [dismissedAt, setDismissedAt] = useState(-1);
  const [mentionIdx, setMentionIdx] = useState(0);
  const pendingCursor = useRef<number | null>(null);
  const [voiceBlocked, setVoiceBlocked] = useState(false);
  const [rec, setRec] = useState<null | "starting" | VoiceSession>(null);
  const [recMs, setRecMs] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0));
  const recRef = useRef(rec);
  recRef.current = rec;

  const cameraOk = typeof navigator !== "undefined" && !!navigator.mediaDevices;
  const voiceOk = features.voice && !voiceBlocked && voiceSupported();
  const hasContent = !!value.trim() || attachments.length > 0;
  const mode: "mic" | "send" | "check" = editing ? "check" : hasContent ? "send" : voiceOk ? "mic" : "send";
  const canSend = !disabled && !sending && hasContent;
  const recording = rec !== null && rec !== "starting";

  // typing signals
  const typing = useRef({ active: false, last: 0, timer: 0 as unknown as ReturnType<typeof setTimeout> });
  const onTyping = p.onTyping;
  const signal = useCallback((s: "composing" | "recording" | "paused") => onTyping?.(s), [onTyping]);
  const pauseTyping = useCallback(() => {
    const t = typing.current;
    clearTimeout(t.timer);
    if (t.active) { t.active = false; t.last = 0; signal("paused"); }
  }, [signal]);
  const noteTyping = (v: string) => {
    const t = typing.current;
    if (!v.trim()) { pauseTyping(); return; }
    const now = Date.now();
    if (!t.active || now - t.last >= TYPING_EVERY_MS) { t.active = true; t.last = now; signal("composing"); }
    clearTimeout(t.timer);
    t.timer = setTimeout(pauseTyping, TYPING_PAUSE_MS);
  };

  const focus = useCallback(() => { ta.current?.focus(); }, []);
  const addFiles = useCallback((input: File[] | FileList) => {
    const files = Array.from(input);
    if (!files.length || disabled || !features.media || editing) return;
    const { ok, errors } = screenFiles(files, attRef.current.length);
    for (const msg of errors) toast.error("File not attached", { description: msg });
    if (!ok.length) return;
    const made = ok.map((i) => makeAttachment(files[i]));
    setAttachments((a) => [...a, ...made]);
    setPopover(null);
    requestAnimationFrame(focus);
  }, [disabled, features.media, editing, focus]);
  useImperativeHandle(ref, () => ({ addFiles, focus }), [addFiles, focus]);

  const removeAttachment = (id: string) => {
    setAttachments((a) => { const gone = a.find((x) => x.id === id); if (gone) revokeAttachment(gone); return a.filter((x) => x.id !== id); });
    focus();
  };
  useEffect(() => () => { attRef.current.forEach(revokeAttachment); }, []);
  useEffect(() => () => { clearTimeout(typing.current.timer); if (typeof recRef.current === "object" && recRef.current) recRef.current.cancel(); }, []);

  // grow with the text up to the CSS max-height, then scroll
  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [value, p.focusToken, recording, attachments.length, editing]);
  useLayoutEffect(() => {
    if (pendingCursor.current === null || !ta.current) return;
    const c = pendingCursor.current;
    pendingCursor.current = null;
    ta.current.focus();
    ta.current.setSelectionRange(c, c);
    setCursor(c);
  }, [value]);
  useLayoutEffect(() => { if (reply || editing) ta.current?.focus(); }, [reply, editing?.id]);
  useEffect(() => { if (editing && value !== editing.body) p.onChange(editing.body); }, [editing?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const root = ta.current?.closest<HTMLElement>(".wa-root");
    if (root && root.clientWidth > 720) ta.current?.focus(); // wide layouts only: on narrow the keyboard would cover the log
  }, [p.focusToken]);
  useEffect(() => { setPopover(null); setDismissedAt(-1); }, [chat.chatId]);

  // popovers: outside click closes
  useEffect(() => {
    if (!popover) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if ((t as Element).closest?.("[data-wa-pop]") || emojiBtn.current?.contains(t) || attachBtn.current?.contains(t)) return;
      setPopover(null);
    };
    document.addEventListener("pointerdown", down, true);
    return () => document.removeEventListener("pointerdown", down, true);
  }, [popover]);
  useEffect(() => { if (popover === "attach") menuEl.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus(); }, [popover]);

  // mentions
  const mq = !disabled && mentions.length && !editing ? mentionQuery(value, cursor) : null;
  const mentionList = useMemo(() => (mq && mq.start !== dismissedAt ? filterMentions(mentions, mq.query) : []), [mq?.start, mq?.query, dismissedAt, mentions]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setMentionIdx(0); }, [mq?.query, mq?.start]);
  const pickMention = (m: MentionCandidate) => {
    if (!mq) return;
    const r = applyMention(value, mq.start, cursor, m);
    pendingCursor.current = r.cursor;
    onChange(r.value);
  };

  const insert = (text: string) => {
    const el = ta.current, s = el?.selectionStart ?? value.length, e = el?.selectionEnd ?? value.length;
    const r = insertAtCursor(value, s, e, text);
    if (r.value.length > 4096) return;
    pendingCursor.current = r.cursor;
    onChange(r.value);
    noteTyping(r.value);
  };

  const submit = () => {
    if (!canSend) return;
    const payload = { text: value.trim(), attachments: attRef.current };
    pauseTyping();
    setPopover(null);
    p.onSend(payload);
    setAttachments([]);
    setTimeout(() => payload.attachments.forEach(revokeAttachment), 0);
    focus();
  };

  // voice notes
  const startRec = async () => {
    if (rec || disabled) return;
    setRec("starting");
    try {
      const s = await startVoice();
      setRecMs(0); setLevels(Array(BARS).fill(0));
      setRec(s);
      signal("recording");
    } catch (e) {
      setRec(null);
      setVoiceBlocked(true);
      toast.error("Voice message unavailable", { description: e instanceof Error ? e.message : "Could not start recording." });
    }
  };
  useEffect(() => {
    if (!recording) return;
    const s = rec as VoiceSession, t0 = Date.now();
    const id = setInterval(() => {
      setRecMs(Date.now() - t0);
      setLevels((l) => [...l.slice(1), s.level()]);
    }, 90);
    return () => clearInterval(id);
  }, [rec]); // eslint-disable-line react-hooks/exhaustive-deps
  const cancelRec = () => {
    if (!recording) return;
    (rec as VoiceSession).cancel();
    setRec(null);
    signal("paused");
    requestAnimationFrame(focus);
  };
  const sendRec = async () => {
    if (!recording) return;
    const s = rec as VoiceSession;
    setRec(null);
    signal("paused");
    try {
      const { blob, durationMs } = await s.stop();
      if (durationMs >= MIN_VOICE_MS && blob.size > 0) p.onSendVoice(blob, durationMs);
    } catch (e) { toast.error("Voice message failed", { description: e instanceof Error ? e.message : "Recording failed." }); }
    requestAnimationFrame(focus);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (isComposing(e)) return;
    if (mentionList.length) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setMentionIdx((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + mentionList.length) % mentionList.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pickMention(mentionList[mentionIdx] ?? mentionList[0]); return; }
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setDismissedAt(mq!.start); return; }
    }
    if (e.key === "Escape") {
      if (popover) { e.preventDefault(); e.stopPropagation(); setPopover(null); return; }
      if (editing && p.onCancelEdit) { e.preventDefault(); e.stopPropagation(); p.onCancelEdit(); return; }
      if (reply) { e.preventDefault(); e.stopPropagation(); p.onCancelReply(); return; }
      return;
    }
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    submit();
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData?.files ?? []);
    if (!files.length || e.clipboardData.getData("text/plain")) return; // pasted text stays text
    if (!features.media || editing) return;
    e.preventDefault();
    addFiles(files.map((f, i) => (f.name ? f : new File([f], `pasted-${Date.now().toString(36)}${i}.${(f.type.split("/")[1] || "png").replace(/\+.*/, "")}`, { type: f.type }))));
  };

  const onRecKey = (e: KeyboardEvent) => { if (e.key === "Escape" && recording) { e.preventDefault(); e.stopPropagation(); cancelRec(); } };

  const closePopover = (restore: HTMLElement | null) => { setPopover(null); restore?.focus(); };
  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closePopover(attachBtn.current); return; }
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>("[role=menuitem]")], i = items.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => { e.preventDefault(); items[(n + items.length) % items.length]?.focus(); };
    if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(items.length - 1);
    else if (e.key === "Tab") go(i + (e.shiftKey ? -1 : 1));
  };

  const extras = ([["poll", "Poll", IconPoll], ["location", "Location", IconPin], ["contact", "Contact", IconContact]] as const).filter(([k]) => features[k] && p.onExtra);
  const showAttach = (features.media || extras.length > 0) && !editing;
  const choose = (open: () => void) => { setPopover(null); open(); };
  const author = reply ? quoteAuthor(reply, chat) : "";
  const placeholder = attachments.length ? "Add a caption" : p.placeholder;

  return (
    <div ref={rootEl} className="wa-composer" data-recording={recording || undefined} data-disabled={disabled || undefined} onKeyDown={onRecKey}>
      {popover === "emoji" && <EmojiPicker onPick={insert} onClose={() => closePopover(emojiBtn.current)} />}
      {mentionList.length > 0 && (
        <ul className="wa-popover wa-mentions" data-wa-pop role="listbox" aria-label="Mention someone">
          {mentionList.map((m, i) => (
            <li key={m.id} id={"wa-mention-" + i} role="option" aria-selected={i === mentionIdx} className="wa-mention" onMouseDown={(e) => e.preventDefault()} onClick={() => pickMention(m)} onMouseEnter={() => setMentionIdx(i)}>
              <b>{m.name || m.phone}</b>{m.phone && m.name && <span>{m.phone}</span>}
            </li>
          ))}
        </ul>
      )}
      {reply && !editing && (
        <div className={"wa-replybar" + (reply.fromMe ? " wa-quote-me" : "")} style={quoteStyle(reply, chat)} role="status" aria-label={`Replying to ${author}`}>
          <div className="wa-replyto"><b>{author}</b><span>{reply.hasMedia && <IconFile />}{quoteText(reply)}</span></div>
          <button type="button" className="wa-cbtn" aria-label="Cancel reply" onClick={p.onCancelReply}><IconX /></button>
        </div>
      )}
      {editing && (
        <div className="wa-replybar wa-quote-me" role="status" aria-label="Editing message">
          <div className="wa-replyto"><b><IconPencil />Edit message</b><span>{editing.body}</span></div>
          <button type="button" className="wa-cbtn" aria-label="Cancel edit" onClick={p.onCancelEdit}><IconX /></button>
        </div>
      )}
      <AttachmentTray items={attachments} onRemove={removeAttachment} onAdd={attachments.length < 10 && !disabled ? () => mediaIn.current?.click() : undefined} />

      {recording ? (
        <div className="wa-bar wa-recbar">
          <button type="button" className="wa-cbtn wa-rec-cancel" aria-label="Cancel recording" onClick={cancelRec}><IconTrash /></button>
          <div className="wa-rec" role="status" aria-label={`Recording ${formatDuration(recMs)}`}>
            <i className="wa-rec-dot" aria-hidden="true" />
            <span className="wa-rec-time">{formatDuration(recMs)}</span>
            <span className="wa-rec-bars" aria-hidden="true">{levels.map((l, i) => <i key={i} style={{ height: 3 + Math.round(l * 21) + "px" }} />)}</span>
          </div>
          <button type="button" className="wa-action" data-mode="send" aria-label="Send voice message" autoFocus onClick={() => void sendRec()}><span className="wa-ico wa-ico-send"><IconSend /></span></button>
        </div>
      ) : (
        <div className="wa-bar">
          <button ref={emojiBtn} type="button" className="wa-cbtn" aria-label="Emoji" aria-haspopup="dialog" aria-expanded={popover === "emoji"} disabled={disabled} onClick={() => setPopover(popover === "emoji" ? null : "emoji")}><IconSmile /></button>
          {showAttach && (
            <div className="wa-anchor">
              <button ref={attachBtn} type="button" className="wa-cbtn" aria-label="Attach" aria-haspopup="menu" aria-expanded={popover === "attach"} disabled={disabled} onClick={() => setPopover(popover === "attach" ? null : "attach")}><IconPlus /></button>
              {popover === "attach" && (
                <div ref={menuEl} className="wa-popover wa-menu" data-wa-pop role="menu" aria-label="Attach" onKeyDown={onMenuKey}>
                  {features.media && <button type="button" role="menuitem" className="wa-menuitem" onClick={() => choose(() => mediaIn.current?.click())}><IconImage />Photos &amp; videos</button>}
                  {features.media && <button type="button" role="menuitem" className="wa-menuitem" onClick={() => choose(() => docIn.current?.click())}><IconDocument />Document</button>}
                  {features.media && cameraOk && <button type="button" role="menuitem" className="wa-menuitem" onClick={() => choose(() => camIn.current?.click())}><IconCamera />Camera</button>}
                  {extras.map(([k, label, Icon]) => <button key={k} type="button" role="menuitem" className="wa-menuitem" onClick={() => choose(() => { p.onExtra?.(k); })}><Icon />{label}</button>)}
                </div>
              )}
            </div>
          )}
          <div className="wa-cfield">
            <textarea ref={ta} rows={1} value={value} maxLength={4096} disabled={disabled} placeholder={placeholder} aria-label={editing ? "Edit message" : reply ? `Reply to ${author}` : "Message"}
              aria-autocomplete={mentions.length ? "list" : undefined} aria-activedescendant={mentionList.length ? "wa-mention-" + mentionIdx : undefined}
              onChange={(e) => { onChange(e.target.value); setCursor(e.target.selectionStart); setDismissedAt(-1); noteTyping(e.target.value); }}
              onSelect={(e) => setCursor(e.currentTarget.selectionStart)}
              onBlur={pauseTyping}
              onKeyDown={onKeyDown} onPaste={onPaste} />
          </div>
          <button type="button" className="wa-action" data-mode={mode} aria-label={mode === "mic" ? "Record voice message" : mode === "check" ? "Save edit" : "Send message"}
            disabled={disabled || (mode !== "mic" && !canSend)} aria-disabled={disabled || (mode !== "mic" && !canSend) || undefined}
            onMouseDown={(e) => { if (mode !== "mic") e.preventDefault(); }}
            onClick={() => (mode === "mic" ? void startRec() : submit())}>
            <span className="wa-ico wa-ico-mic"><IconMic /></span>
            <span className="wa-ico wa-ico-send">{sending ? <Spinner /> : mode === "check" ? <IconCheck /> : <IconSend />}</span>
          </button>
        </div>
      )}
      <input ref={mediaIn} type="file" hidden multiple accept="image/*,video/*" tabIndex={-1} aria-hidden="true" onChange={(e) => { addFiles(e.target.files ?? []); e.target.value = ""; }} />
      <input ref={docIn} type="file" hidden multiple tabIndex={-1} aria-hidden="true" onChange={(e) => { addFiles(e.target.files ?? []); e.target.value = ""; }} />
      <input ref={camIn} type="file" hidden accept="image/*,video/*" capture="environment" tabIndex={-1} aria-hidden="true" onChange={(e) => { addFiles(e.target.files ?? []); e.target.value = ""; }} />
    </div>
  );
});

