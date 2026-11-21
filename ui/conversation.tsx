import { Button, resolvePluginIcon } from "@/plugins/kit";
import { displayName, subtitle, type Chat, type Message } from "../shared/chat";
import { Avatar } from "./avatar";
import { Composer } from "./composer";
import { IconAlert, IconArrowLeft, Spinner } from "./icons";
import { MessageLog } from "./message-log";

const IconWhatsApp = resolvePluginIcon("IconBrandWhatsapp");

/** Right pane when no chat is open (wide layouts only). */
export function EmptyConversation({ session }: { session: string }) {
  return (
    <section className="wa-pane wa-chat-pane wa-center" aria-label="Conversation">
      <span className="wa-hero"><IconWhatsApp /></span>
      <span className="wa-hero-title">Pick a conversation</span>
      <p>Replies you send here go out from your WhatsApp number.</p>
      {session && <span className="wa-small">Session “{session}”</span>}
    </section>
  );
}

interface Props {
  chat: Chat; messages: Message[] | null; error: string; now: Date; draft: string; sending: boolean; focusToken: string;
  onBack: () => void; onRetry: () => void; onDraft: (v: string) => void; onSend: () => void;
}

/** Header, message log (or its loading / error / empty state) and composer for one chat. */
export function Conversation({ chat, messages, error, now, draft, sending, focusToken, onBack, onRetry, onDraft, onSend }: Props) {
  const name = displayName(chat), sub = subtitle(chat);
  return (
    <section className="wa-pane wa-chat-pane" aria-label="Conversation">
      <div className="wa-head wa-chat-head">
        <Button type="button" variant="ghost" size="icon" className="wa-back" aria-label="Back to chats" onClick={onBack}><IconArrowLeft /></Button>
        <Avatar chat={chat} small />
        <div className="wa-who"><b>{name}</b>{sub && sub !== name && <span>{sub}</span>}</div>
      </div>
      {error && messages === null ? (
        <div className="wa-center"><IconAlert width={22} height={22} /><p>{error}</p><Button type="button" variant="outline" size="sm" onClick={onRetry}>Try again</Button></div>
      ) : messages === null ? (
        <div className="wa-center"><Spinner />Loading messages…</div>
      ) : messages.length === 0 ? (
        <div className="wa-center">No messages in this chat yet</div>
      ) : (
        <MessageLog key={chat.chatId} chat={chat} messages={messages} now={now} />
      )}
      <Composer value={draft} onChange={onDraft} onSend={onSend} sending={sending} placeholder={`Message ${name}`} focusToken={focusToken} />
    </section>
  );
}
