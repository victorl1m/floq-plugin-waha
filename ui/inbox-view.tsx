import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, PluginPage, PluginState, Textarea, cn, resolvePluginIcon, toast, usePluginApi, usePluginEvent } from "@/plugins/kit";
import type { PluginViewProps } from "@/plugins/sdk";

const IconSend = resolvePluginIcon("IconSend"); // icons come from the host kit: @tabler/icons-react is not shared with plugin bundles

interface Status { configured: boolean; missingSettings: string[]; missingSecrets: string[]; session: string }
interface Chat { chatId: string; lastBody: string; lastAt: string; total: number }
interface Message { id: string; fromMe: boolean; sender: string; body: string; hasMedia: boolean; sentAt: string }
type Phase = { kind: "loading" } | { kind: "error"; message: string } | { kind: "forbidden" } | { kind: "ready"; status: Status };

const statusOf = (e: unknown) => (e as { status?: number } | null)?.status;
const messageOf = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");
const label = (chatId: string) => chatId.replace(/@(c|g)\.us$/, (_m, k: string) => (k === "g" ? " (group)" : ""));
const time = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** Chat list and message pane. Sending is the user's own click; the composer keeps the draft if sending fails. */
export default function InboxView({ plugin }: PluginViewProps) {
  const api = usePluginApi(plugin.id);
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [chats, setChats] = useState<Chat[] | null>(null);
  const [chatsError, setChatsError] = useState("");
  const [selected, setSelected] = useState("");
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [messagesError, setMessagesError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const loadStatus = useCallback(async () => {
    setPhase({ kind: "loading" });
    try { setPhase({ kind: "ready", status: await api<Status>("/status") }); }
    catch (e) { setPhase(statusOf(e) === 403 ? { kind: "forbidden" } : { kind: "error", message: messageOf(e) }); }
  }, [api]);

  const loadChats = useCallback(async () => {
    try { setChatsError(""); setChats((await api<{ chats: Chat[] }>("/chats")).chats); }
    catch (e) { setChatsError(messageOf(e)); }
  }, [api]);

  const loadMessages = useCallback(async (chatId: string) => {
    try {
      setMessagesError("");
      const res = await api<{ messages: Message[] }>(`/messages?chatId=${encodeURIComponent(chatId)}&limit=100`);
      if (selectedRef.current === chatId) setMessages(res.messages);
    } catch (e) { if (selectedRef.current === chatId) setMessagesError(messageOf(e)); }
  }, [api]);

  useEffect(() => { void loadStatus(); }, [loadStatus]);
  useEffect(() => { if (phase.kind === "ready" && phase.status.configured) void loadChats(); }, [phase, loadChats]);
  useEffect(() => { if (selected) { setMessages(null); void loadMessages(selected); } }, [selected, loadMessages]);
  useEffect(() => { bottom.current?.scrollIntoView?.({ block: "end" }); }, [messages]);
  // Live: a stored message refreshes the list and, when it belongs to the open chat, the pane.
  usePluginEvent<{ chatId?: string }>(plugin.id, "message", (data) => { void loadChats(); if (data?.chatId && data.chatId === selectedRef.current) void loadMessages(data.chatId); });

  async function send() {
    const text = draft.trim();
    if (!text || !selected || sending) return;
    setSending(true); setSendError("");
    try { await api("/send", { method: "POST", body: { chatId: selected, text } }); setDraft(""); await loadMessages(selected); void loadChats(); }
    catch (e) { setSendError(messageOf(e)); toast.error("Message not sent", { description: messageOf(e) }); }
    finally { setSending(false); }
  }

  if (phase.kind === "loading") return <PluginPage title="WhatsApp"><PluginState state="loading" label="WhatsApp" /></PluginPage>;
  if (phase.kind === "error") return <PluginPage title="WhatsApp"><PluginState state="error" title="Could not load WhatsApp" description={phase.message} onRetry={() => void loadStatus()} /></PluginPage>;
  if (phase.kind === "forbidden") return <PluginPage title="WhatsApp"><PluginState state="empty" title="Only the administrator who set this up can use the inbox" description="Messages are private to them." /></PluginPage>;
  if (!phase.status.configured) {
    return <PluginPage title="WhatsApp"><PluginState state="not-configured" title="Connect WAHA" description="Add your WAHA address and API key, then point a WAHA webhook at Floq." missingSecrets={phase.status.missingSecrets} missingSettings={phase.status.missingSettings} /></PluginPage>;
  }

  return (
    <PluginPage title="WhatsApp" description={`Messages received through your WAHA session “${phase.status.session}”.`}>
      <div className="grid min-h-[28rem] flex-1 gap-4 md:grid-cols-[18rem_1fr]">
        <section aria-label="Chats" className="min-h-0 overflow-hidden rounded-xl border border-border bg-card/30">
          {chatsError ? <div className="p-3"><PluginState state="error" description={chatsError} onRetry={() => void loadChats()} /></div>
            : chats === null ? <div className="p-3"><PluginState state="loading" label="chats" /></div>
            : chats.length === 0 ? <div className="p-3"><PluginState state="empty" title="No messages yet" description="New WhatsApp messages show up here as WAHA delivers them." /></div>
            : (
              <ul className="max-h-[32rem] divide-y divide-border overflow-y-auto">
                {chats.map((c) => (
                  <li key={c.chatId}>
                    <button type="button" aria-current={selected === c.chatId ? "true" : undefined} onClick={() => setSelected(c.chatId)}
                      className={cn("flex w-full flex-col gap-0.5 px-3 py-2 text-left text-[13px] transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", selected === c.chatId ? "bg-muted/80" : "hover:bg-muted/50")}>
                      <span className="flex items-center justify-between gap-2"><span className="truncate font-medium">{label(c.chatId)}</span><Badge variant="outline" className="shrink-0">{c.total}</Badge></span>
                      <span className="truncate text-xs text-muted-foreground">{c.lastBody || "…"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
        </section>
        <section aria-label="Messages" className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card/30">
          {!selected ? <div className="p-4"><PluginState state="empty" title="Choose a chat" description="Pick a conversation to read it and reply." /></div> : (
            <>
              <div className="border-b border-border px-3 py-2 text-sm font-medium">{label(selected)}</div>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3" role="log" aria-live="polite">
                {messagesError ? <PluginState state="error" description={messagesError} onRetry={() => void loadMessages(selected)} />
                  : messages === null ? <PluginState state="loading" label="messages" />
                  : messages.length === 0 ? <PluginState state="empty" title="No messages in this chat" />
                  : messages.map((m) => (
                    <div key={m.id} className={cn("flex", m.fromMe ? "justify-end" : "justify-start")}>
                      <div className={cn("max-w-[80%] rounded-xl px-3 py-1.5 text-[13px]", m.fromMe ? "bg-primary/15 text-foreground" : "bg-muted text-foreground")}>
                        <p className="break-words whitespace-pre-wrap">{m.body || (m.hasMedia ? "Sent a file" : "")}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{time(m.sentAt)}</p>
                      </div>
                    </div>
                  ))}
                <div ref={bottom} />
              </div>
              <form className="space-y-2 border-t border-border p-3" onSubmit={(e) => { e.preventDefault(); void send(); }}>
                <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write a message…" aria-label="Message" maxLength={4096} className="min-h-14 resize-none text-[13px]" disabled={sending}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void send(); } }} />
                {sendError && <p role="alert" className="text-xs text-destructive">{sendError}</p>}
                <div className="flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">Ctrl+Enter to send</span><Button type="submit" size="sm" disabled={sending || !draft.trim()}><IconSend /> {sending ? "Sending…" : "Send"}</Button></div>
              </form>
            </>
          )}
        </section>
      </div>
    </PluginPage>
  );
}
