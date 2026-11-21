import { useCallback, useEffect, useRef, useState } from "react";
import { PluginPage, PluginState, toast, usePluginApi, usePluginEvent } from "@/plugins/kit";
import type { PluginViewProps } from "@/plugins/sdk";
import { quoteOf, type Chat, type Message, type Quote } from "../shared/chat";
import { ChatList } from "./chat-list";
import { Conversation, EmptyConversation } from "./conversation";
import { CSS } from "./styles";

interface Status { configured: boolean; missingSettings: string[]; missingSecrets: string[]; session: string }
type Phase = { kind: "loading" } | { kind: "error"; message: string } | { kind: "forbidden" } | { kind: "ready"; status: Status };
interface Pending { id: string; chatId: string; text: string; at: string; replyTo: Quote | null }

const statusOf = (e: unknown) => (e as { status?: number } | null)?.status;
const messageOf = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");
const visible = () => typeof document === "undefined" || document.visibilityState === "visible";

/** Two-pane WhatsApp inbox. Sending is the user's own click or Enter; a failed send puts the text back in the composer. */
export default function InboxView({ plugin }: PluginViewProps) {
  const api = usePluginApi(plugin.id);
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [chats, setChats] = useState<Chat[] | null>(null);
  const [chatsError, setChatsError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [pane, setPane] = useState<"list" | "chat">("list");
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [messagesError, setMessagesError] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Pending[]>([]);
  const [replies, setReplies] = useState<Record<string, Quote | null>>({});
  const [sendingId, setSendingId] = useState("");
  const [focusN, setFocusN] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const chatsRef = useRef(chats);
  chatsRef.current = chats;
  const seq = useRef(0);

  const loadStatus = useCallback(async () => {
    setPhase({ kind: "loading" });
    try { setPhase({ kind: "ready", status: await api<Status>("/status") }); }
    catch (e) { setPhase(statusOf(e) === 403 ? { kind: "forbidden" } : { kind: "error", message: messageOf(e) }); }
  }, [api]);

  // Silent after the first load: the old list stays on screen, a failed refresh only matters when there is nothing to show.
  const loadChats = useCallback(async () => {
    setRefreshing(true);
    try {
      const list = (await api<{ chats: Chat[] }>("/chats")).chats ?? [];
      setChatsError("");
      // The open chat is being read: do not flash its unread pill back.
      setChats(visible() ? list.map((c) => (c.chatId === selectedRef.current && c.unread ? { ...c, unread: 0 } : c)) : list);
    } catch (e) { setChatsError(messageOf(e)); }
    finally { setRefreshing(false); }
  }, [api]);

  const loadMessages = useCallback(async (chatId: string) => {
    try {
      const res = await api<{ messages: Message[] }>(`/messages?chatId=${encodeURIComponent(chatId)}&limit=200`);
      if (selectedRef.current === chatId) { setMessagesError(""); setMessages(res.messages ?? []); }
    } catch (e) { if (selectedRef.current === chatId) setMessagesError(messageOf(e)); }
  }, [api]);

  const markRead = useCallback(async (chatId: string) => {
    setChats((cs) => cs && cs.map((c) => (c.chatId === chatId && c.unread ? { ...c, unread: 0 } : c)));
    try { await api("/read", { method: "POST", body: { chatId } }); } catch { /* an older runtime has no /read: ignore */ }
  }, [api]);

  useEffect(() => { void loadStatus(); }, [loadStatus]);
  useEffect(() => { if (phase.kind === "ready" && phase.status.configured) void loadChats(); }, [phase, loadChats]);
  useEffect(() => {
    if (!selected) return;
    setMessages(null); setMessagesError("");
    void loadMessages(selected);
    void markRead(selected);
  }, [selected, loadMessages, markRead]);
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const onVisible = () => {
      const id = selectedRef.current;
      if (visible() && id && chatsRef.current?.some((c) => c.chatId === id && c.unread)) void markRead(id);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [markRead]);

  usePluginEvent<{ chatId?: string }>(plugin.id, "message", (data) => {
    if (data?.chatId && data.chatId === selectedRef.current) {
      void loadMessages(data.chatId);
      if (visible()) { void markRead(data.chatId).then(() => loadChats()); return; }
    }
    void loadChats();
  });

  async function send() {
    const chatId = selected;
    const text = (drafts[chatId] ?? "").trim();
    if (!text || !chatId || sendingId === chatId) return;
    const id = `pending-${++seq.current}`;
    const replyTo = replies[chatId] ?? null;
    setDrafts((d) => ({ ...d, [chatId]: "" }));
    setReplies((r) => ({ ...r, [chatId]: null }));
    setPending((p) => [...p, { id, chatId, text, at: new Date().toISOString(), replyTo }]);
    setSendingId(chatId);
    try {
      await api("/send", { method: "POST", body: replyTo ? { chatId, text, replyTo: replyTo.id } : { chatId, text } });
      await loadMessages(chatId);
      void loadChats();
    } catch (e) {
      setDrafts((d) => (d[chatId]?.trim() ? d : { ...d, [chatId]: text }));
      setReplies((r) => (r[chatId] ? r : { ...r, [chatId]: replyTo }));
      setFocusN((n) => n + 1);
      toast.error("Message not sent", { description: messageOf(e) });
    } finally {
      setPending((p) => p.filter((x) => x.id !== id));
      setSendingId("");
    }
  }

  if (phase.kind === "loading") return <PluginPage title="WhatsApp"><PluginState state="loading" label="WhatsApp" /></PluginPage>;
  if (phase.kind === "error") return <PluginPage title="WhatsApp"><PluginState state="error" title="Could not load WhatsApp" description={phase.message} onRetry={() => void loadStatus()} /></PluginPage>;
  if (phase.kind === "forbidden") return <PluginPage title="WhatsApp"><PluginState state="empty" title="Only the administrator who set this up can use the inbox" description="Messages are private to them." /></PluginPage>;
  if (!phase.status.configured) {
    return <PluginPage title="WhatsApp"><PluginState state="not-configured" title="Connect WAHA" description="Add your WAHA address and API key, then point a WAHA webhook at Floq." missingSecrets={phase.status.missingSecrets} missingSettings={phase.status.missingSettings} /></PluginPage>;
  }

  const chat = selected ? chats?.find((c) => c.chatId === selected) ?? { chatId: selected, lastBody: "", lastAt: "", total: 0 } : null;
  const shown = messages && [...messages, ...pending.filter((p) => p.chatId === selected).map((p): Message => ({ id: p.id, fromMe: true, sender: "", body: p.text, hasMedia: false, sentAt: p.at, pending: true, replyTo: p.replyTo }))];

  return (
    <div className="wa-root" data-pane={pane}>
      <style>{CSS}</style>
      <div className="wa-panel">
        <ChatList chats={chats} error={chatsError} selected={selected} query={query} now={now} refreshing={refreshing}
          onQuery={setQuery} onSelect={(id) => { setSelected(id); setPane("chat"); }} onRefresh={() => void loadChats()} />
        {chat ? (
          <Conversation chat={chat} messages={shown} error={messagesError} now={now} draft={drafts[selected] ?? ""} sending={sendingId === selected} focusToken={`${selected}:${focusN}`}
            reply={replies[selected] ?? null} onReply={(m) => setReplies((r) => ({ ...r, [selected]: quoteOf(m) }))} onCancelReply={() => setReplies((r) => ({ ...r, [selected]: null }))}
            onBack={() => setPane("list")} onRetry={() => void loadMessages(selected)} onDraft={(v) => setDrafts((d) => ({ ...d, [selected]: v }))} onSend={() => void send()} />
        ) : <EmptyConversation session={phase.status.session} />}
      </div>
    </div>
  );
}
