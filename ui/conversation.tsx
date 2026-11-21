import { useMemo, useRef, useState, type DragEvent } from "react";
import { Button, resolvePluginIcon } from "@/plugins/kit";
import { chatPhoneDigits, displayName, subtitle, type Chat, type Message, type Quote } from "../shared/chat";
import { Avatar } from "./avatar";
import { Composer, type Attachment, type ComposerFeatures, type ComposerHandle } from "./composer";
import { IconAlert, IconArrowLeft, IconLock, Spinner } from "./icons";
import { IconPlus } from "./icons-composer";
import { MessageLog } from "./message-log";

const IconWhatsApp = resolvePluginIcon("IconBrandWhatsapp");

/** Right pane when no chat is open (wide layouts only). */
export function EmptyConversation({ session }: { session: string }) {
  return (
    <section className="wa-pane wa-chat-pane wa-center wa-empty" aria-label="Conversation">
      <span className="wa-hero"><IconWhatsApp /></span>
      <span className="wa-hero-title">WhatsApp in Floq</span>
      <p>Pick a chat on the left to read it and reply. Replies you send here go out from your own WhatsApp number.</p>
      <span className="wa-small"><IconLock />{session ? `Connected through your WAHA session “${session}”` : "Connected through your own WAHA instance"}</span>
    </section>
  );
}

interface Props {
  chat: Chat; messages: Message[] | null; error: string; now: Date; draft: string; sending: boolean; focusToken: string; reply: Quote | null;
  onReply: (m: Message) => void; onCancelReply: () => void; onBack: () => void; onRetry: () => void; onDraft: (v: string) => void; onSend: (p: { text: string; attachments: Attachment[] }) => void;
  editing: { id: string; body: string } | null; onCancelEdit: () => void; onSendVoice: (blob: Blob, durationMs: number) => void; onExtra: (kind: "poll" | "location" | "contact") => void; features: ComposerFeatures; // composer-wiring
}

/** Header, message log (or its loading / error / empty state) and composer for one chat. */
export function Conversation({ chat, messages, error, now, draft, sending, focusToken, reply, onReply, onCancelReply, onBack, onRetry, onDraft, onSend, onSendVoice, onExtra, features, editing, onCancelEdit }: Props) {
  const name = displayName(chat), sub = subtitle(chat);
  // composer-wiring: group participants for @mentions come from the senders seen in the log; drop zone overlay for files.
  const composer = useRef<ComposerHandle>(null);
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const mentions = useMemo(() => {
    if (chat.kind !== "group") return [];
    const seen = new Map<string, { id: string; name: string; phone?: string }>();
    for (const m of messages ?? []) if (!m.fromMe && m.sender && !seen.has(m.sender)) seen.set(m.sender, { id: m.sender, name: m.senderName ?? "", phone: chatPhoneDigits({ chatId: m.sender }) ?? undefined });
    return [...seen.values()].filter((m) => m.name || m.phone);
  }, [chat.kind, messages]);
  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
  const dnd = {
    onDragEnter: (e: DragEvent) => { if (hasFiles(e)) { depth.current++; setDragging(true); } },
    onDragOver: (e: DragEvent) => { if (hasFiles(e)) e.preventDefault(); },
    onDragLeave: (e: DragEvent) => { if (hasFiles(e) && --depth.current <= 0) { depth.current = 0; setDragging(false); } },
    onDrop: (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); depth.current = 0; setDragging(false); composer.current?.addFiles(Array.from(e.dataTransfer.files)); },
  };
  return (
    <section className="wa-pane wa-chat-pane" aria-label="Conversation" {...dnd}>
      <div className="wa-head wa-chat-head">
        <Button type="button" variant="ghost" size="icon" className="wa-iconbtn wa-back" aria-label="Back to chats" onClick={onBack}><IconArrowLeft /></Button>
        <Avatar chat={chat} small />
        <div className="wa-who" title={name}><b>{name}</b>{sub && sub !== name && <span>{sub}</span>}</div>
      </div>
      {error && messages === null ? (
        <div className="wa-center wa-wall"><IconAlert width={28} height={28} /><strong>Could not load messages</strong><p>{error}</p><Button type="button" variant="outline" size="sm" className="wa-btn" onClick={onRetry}>Try again</Button></div>
      ) : messages === null ? (
        <div className="wa-center wa-wall"><Spinner />Loading messages…</div>
      ) : messages.length === 0 ? (
        <div className="wa-center wa-wall"><span className="wa-note">No messages in this chat yet</span></div>
      ) : (
        <MessageLog key={chat.chatId} chat={chat} messages={messages} now={now} onReply={onReply} />
      )}
      <Composer ref={composer} value={draft} onChange={onDraft} onSend={onSend} onSendVoice={onSendVoice} onExtra={onExtra} features={features} mentions={mentions} sending={sending} placeholder="Type a message" focusToken={focusToken} chat={chat} reply={reply} onCancelReply={onCancelReply} editing={editing} onCancelEdit={onCancelEdit} />
      {dragging && <div className="wa-drop" aria-hidden="true"><div><IconPlus />Drop files to send</div></div>}
    </section>
  );
}
