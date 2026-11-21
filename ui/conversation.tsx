import { Button, resolvePluginIcon } from "@/plugins/kit";
import { displayName, subtitle, type Chat, type Message, type Quote } from "../shared/chat";
import { Avatar } from "./avatar";
import { Composer } from "./composer";
import { IconAlert, IconArrowLeft, IconLock, Spinner } from "./icons";
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
  onReply: (m: Message) => void; onCancelReply: () => void; onBack: () => void; onRetry: () => void; onDraft: (v: string) => void; onSend: () => void;
}

/** Header, message log (or its loading / error / empty state) and composer for one chat. */
export function Conversation({ chat, messages, error, now, draft, sending, focusToken, reply, onReply, onCancelReply, onBack, onRetry, onDraft, onSend }: Props) {
  const name = displayName(chat), sub = subtitle(chat);
  return (
    <section className="wa-pane wa-chat-pane" aria-label="Conversation">
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
      <Composer value={draft} onChange={onDraft} onSend={onSend} sending={sending} placeholder="Type a message" focusToken={focusToken} chat={chat} reply={reply} onCancelReply={onCancelReply} />
    </section>
  );
}
