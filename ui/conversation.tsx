import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { Button, Tooltip, TooltipContent, TooltipTrigger, resolvePluginIcon } from "@/plugins/kit";
import { chatPhoneDigits, chatTitle, subtitle, type Chat, type Message, type Quote } from "../shared/chat";
import { Avatar } from "./avatar";
import { Composer, type Attachment, type ComposerHandle } from "./composer";
import { useWa } from "./context";
import { IconAlert, IconArrowLeft, IconLock, IconSearch, Spinner } from "./icons";
import { IconPlus } from "./icons-composer";
import { MessageLog } from "./message-log";
import { ChatSearch, ContactDialog, ForwardDialog, LocationDialog, MessageInfoDialog, PollDialog } from "./dialogs";

const IconWhatsApp = resolvePluginIcon("IconBrandWhatsapp");

/** Right pane when no chat is open (wide layouts only). */
export function EmptyConversation({ session }: { session: string }) {
  return (
    <section className="wa-pane wa-chat-pane wa-center wa-empty" aria-label="Conversation">
      <div className="wa-hello">
        <span className="wa-hero"><IconWhatsApp /></span>
        <span className="wa-hero-title">WhatsApp in Floq</span>
        <p>Pick a chat on the left to read it and reply. Replies you send here go out from your own WhatsApp number.</p>
        <span className="wa-small"><IconLock />{session ? `Connected through your WAHA session “${session}”` : "Connected through your own WAHA instance"}</span>
      </div>
    </section>
  );
}

export type MessageAction = "react" | "star" | "pin" | "delete" | "forward" | "info" | "vote";
export interface ConversationHandlers {
  onReply(m: Message): void; onCancelReply(): void; onEdit(m: Message): void; onCancelEdit(): void; onBack(): void; onRetry(): void; onDraft(v: string): void;
  onSend(p: { text: string; attachments: Attachment[] }): void; onSendVoice(blob: Blob, durationMs: number): void; onTyping(state: "composing" | "recording" | "paused"): void;
  onLoadMore(): void; onMentions(list: { id: string; name: string; phone?: string }[]): void;
  onAction(action: MessageAction, m: Message, arg?: unknown): void | Promise<void>;
  onExtraSend(kind: "poll" | "location" | "contact", body: Record<string, unknown>): Promise<boolean>;
}
interface Props {
  chat: Chat; messages: Message[] | null; hasMore: boolean; error: string; now: Date; draft: string; sending: boolean; focusToken: string; reply: Quote | null;
  editing: { id: string; body: string } | null; handlers: ConversationHandlers;
  /** Header pieces owned by the inbox: opening the info panel, the chat menu, a line under the name (presence). */
  onInfo?: () => void; menu?: ReactNode; presence?: ReactNode;
}

/** Header, message log (or its loading / error / empty state) and composer for one chat, plus the dialogs and panels that belong to it. */
export function Conversation({ chat, messages, hasMore, error, now, draft, sending, focusToken, reply, editing, handlers: h, onInfo, menu, presence }: Props) {
  const { features } = useWa();
  const name = chatTitle(chat), sub = subtitle(chat);
  const composer = useRef<ComposerHandle>(null);
  const log = useRef<{ jumpTo(id: string): boolean }>(null);
  const [dialog, setDialog] = useState<"" | "poll" | "location" | "contact">("");
  const [forward, setForward] = useState<Message | null>(null);
  const [infoOf, setInfoOf] = useState<Message | null>(null);
  const [searching, setSearching] = useState(false);
  useEffect(() => { setSearching(false); setDialog(""); setForward(null); setInfoOf(null); }, [chat.chatId]);
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  // Group participants for @mentions: the senders seen in the log.
  const mentions = useMemo(() => {
    if (chat.kind !== "group") return [];
    const seen = new Map<string, { id: string; name: string; phone?: string }>();
    for (const m of messages ?? []) if (!m.fromMe && m.sender && !seen.has(m.sender)) seen.set(m.sender, { id: m.sender, name: m.senderName ?? "", phone: chatPhoneDigits({ chatId: m.sender }) ?? undefined });
    return [...seen.values()].filter((m) => m.name || m.phone);
  }, [chat.kind, messages]);
  useEffect(() => { h.onMentions(mentions); }, [mentions]); // eslint-disable-line react-hooks/exhaustive-deps
  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
  const dnd = features.media ? {
    onDragEnter: (e: DragEvent) => { if (hasFiles(e)) { depth.current++; setDragging(true); } },
    onDragOver: (e: DragEvent) => { if (hasFiles(e)) e.preventDefault(); },
    onDragLeave: (e: DragEvent) => { if (hasFiles(e) && --depth.current <= 0) { depth.current = 0; setDragging(false); } },
    onDrop: (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); depth.current = 0; setDragging(false); composer.current?.addFiles(Array.from(e.dataTransfer.files)); },
  } : {};
  return (
    <section className="wa-pane wa-chat-pane" aria-label="Conversation" {...dnd}>
      <div className="wa-head wa-chat-head">
        <Button type="button" variant="ghost" size="icon" className="wa-iconbtn wa-back" aria-label="Back to chats" onClick={h.onBack}><IconArrowLeft /></Button>
        <button type="button" className="wa-who-btn" onClick={onInfo} disabled={!onInfo} aria-label={`${name}: ${chat.kind === "group" ? "group info" : "contact info"}`}>
          <Avatar chat={chat} small />
          <div className="wa-who" title={name}><b>{name}</b>{presence ?? (sub && sub !== name && <span>{sub}</span>)}</div>
        </button>
        <div className="wa-head-actions">
          <Tooltip>
            <TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" className="wa-iconbtn" aria-label="Search in this chat" aria-pressed={searching} onClick={() => setSearching((v) => !v)}><IconSearch /></Button></TooltipTrigger>
            <TooltipContent>Search</TooltipContent>
          </Tooltip>
          {menu}
        </div>
      </div>
      {searching && <ChatSearch chat={chat} now={now} onJump={(id) => { if (!log.current?.jumpTo(id)) h.onLoadMore(); }} onClose={() => setSearching(false)} />}
      {error && messages === null ? (
        <div className="wa-center wa-wall"><IconAlert width={28} height={28} /><strong>Could not load messages</strong><p>{error}</p><Button type="button" variant="outline" size="sm" className="wa-btn" onClick={h.onRetry}>Try again</Button></div>
      ) : messages === null ? (
        <div className="wa-center wa-wall"><Spinner />Loading messages…</div>
      ) : messages.length === 0 ? (
        <div className="wa-center wa-wall"><span className="wa-note">{chat.isSelf ? "Messages you send here go to your own WhatsApp" : "No messages in this chat yet"}</span></div>
      ) : (
        <MessageLog ref={log} key={chat.chatId} chat={chat} messages={messages} now={now} hasMore={hasMore} onLoadMore={h.onLoadMore} onReply={h.onReply} onEdit={h.onEdit}
          onAction={(action, m, arg) => { if (action === "forward") { setForward(m); return; } if (action === "info") { setInfoOf(m); return; } return h.onAction(action, m, arg); }} />
      )}
      <Composer ref={composer} value={draft} onChange={h.onDraft} onSend={h.onSend} onSendVoice={h.onSendVoice} onTyping={h.onTyping} onExtra={setDialog}
        features={{ media: features.media, voice: features.voice, poll: features.poll, location: features.location, contact: features.contact }}
        mentions={mentions} sending={sending} placeholder="Type a message" focusToken={focusToken} chat={chat} reply={reply} onCancelReply={h.onCancelReply} editing={editing} onCancelEdit={h.onCancelEdit} />
      {dragging && <div className="wa-drop" aria-hidden="true"><div><IconPlus />Drop files to send</div></div>}
      <PollDialog open={dialog === "poll"} onOpenChange={(o) => !o && setDialog("")} onCreate={async (p) => { if (await h.onExtraSend("poll", { ...p })) setDialog(""); }} />
      <LocationDialog open={dialog === "location"} onOpenChange={(o) => !o && setDialog("")} onSend={async (p) => { if (await h.onExtraSend("location", { ...p })) setDialog(""); }} />
      <ContactDialog open={dialog === "contact"} onOpenChange={(o) => !o && setDialog("")} onSend={async (contacts) => { if (await h.onExtraSend("contact", { contacts })) setDialog(""); }} />
      {forward && <ForwardDialog message={forward} open onOpenChange={(o) => !o && setForward(null)} onForward={async (to) => { await h.onAction("forward", forward, to); setForward(null); }} />}
      {infoOf && <MessageInfoDialog message={infoOf} open onOpenChange={(o) => !o && setInfoOf(null)} />}
    </section>
  );
}
