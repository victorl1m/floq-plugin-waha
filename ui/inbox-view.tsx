import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PluginPage, PluginState, toast, usePluginApi, usePluginEvent } from "@/plugins/kit";
import type { PluginViewProps } from "@/plugins/sdk";
import { quoteOf, type Chat, type Message, type MessageType, type Quote } from "../shared/chat";
import { featuresOf, type Engine, type Features } from "../shared/features";
import { useAvatarUrl } from "./avatars";
import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@/plugins/kit";
import { ChatList } from "./chat-list";
import { ChatMenu } from "./chat-menu";
import { InfoPanel } from "./info-panel";
import { NewChatDialog } from "./new-chat";
import { IconNewChat } from "./icons-people";
import { IconMegaphone, IconStatus } from "./icons-more";
import { CallBanner } from "./call-banner";
import { ChannelsView } from "./channels-view";
import { LabelChips, LabelFilter, LabelPicker } from "./labels";
import { PresenceLine } from "./presence";
import { StatusView } from "./status-view";
import { subtitle } from "../shared/chat";
import { kindOfFile, mentionsIn, type Attachment } from "./composer";
import { WaContext, errorCode, errorStatus, errorText, type Api, type Wa } from "./context";
import { Conversation, EmptyConversation, type ConversationHandlers } from "./conversation";
import { CSS } from "./styles";

interface Status { configured: boolean; missingSettings: string[]; missingSecrets: string[]; session: string; engine?: Engine; features?: Features; me?: { name: string; phone: string | null } | null }
type Phase = { kind: "loading" } | { kind: "error"; message: string } | { kind: "forbidden" } | { kind: "ready"; status: Status };
/** A message being sent from this screen: shown at once, replaced by the stored one when the send returns. */
interface Pending { chatId: string; message: Message }

const PAGE = 80;
const visible = () => typeof document === "undefined" || document.visibilityState === "visible";
const toBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ""));
  r.onerror = () => reject(new Error("Could not read the file."));
  r.readAsDataURL(blob);
});
/** What a refused request means, in the user's words. */
function explain(e: unknown): string {
  if (errorCode(e) === "unsupported" || errorStatus(e) === 501) return "Your WAHA engine does not support this.";
  if (errorCode(e) === "payload_too_large" || errorStatus(e) === 413) return "The file is too large to send from Floq. Update Floq if you are on an older version, or send a smaller file.";
  return errorText(e);
}

/** The WhatsApp inbox: chat list, conversation and its side panels. Everything sent here is the user's own click. */
export default function InboxView({ plugin }: PluginViewProps) {
  const api = usePluginApi(plugin.id) as Api;
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [chats, setChats] = useState<Chat[] | null>(null);
  const [archived, setArchived] = useState<Chat[]>([]);
  const [archivedCount, setArchivedCount] = useState(0);
  const [showArchived, setShowArchived] = useState(false);
  const [me, setMe] = useState<Wa["me"]>(null);
  const [chatsError, setChatsError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [hints, setHints] = useState<Record<string, Partial<Chat>>>({});
  const [pane, setPane] = useState<"list" | "chat">("list");
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [messagesError, setMessagesError] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Pending[]>([]);
  const [replies, setReplies] = useState<Record<string, Quote | null>>({});
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [sendingId, setSendingId] = useState("");
  const [focusN, setFocusN] = useState(0);
  const [info, setInfo] = useState(false);
  const [newChat, setNewChat] = useState(false);
  const [side, setSide] = useState<"" | "status" | "channels">("");
  const [label, setLabel] = useState("");
  const [now, setNow] = useState(() => new Date());
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const chatsRef = useRef(chats);
  chatsRef.current = chats;
  const showArchivedRef = useRef(showArchived);
  showArchivedRef.current = showArchived;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const seq = useRef(0);
  const loadingMore = useRef(false);

  const loadStatus = useCallback(async () => {
    setPhase({ kind: "loading" });
    try { const status = await api<Status>("/status"); setPhase({ kind: "ready", status }); if (status.me) setMe(status.me); }
    catch (e) { setPhase(errorStatus(e) === 403 ? { kind: "forbidden" } : { kind: "error", message: errorText(e) }); }
  }, [api]);

  // Silent after the first load: the old list stays on screen, a failed refresh only matters when there is nothing to show.
  const loadChats = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await api<{ chats: Chat[]; archivedCount?: number; me?: Wa["me"] }>("/chats");
      const list = res.chats ?? [];
      setChatsError("");
      if (res.me) setMe(res.me);
      setArchivedCount(res.archivedCount ?? 0);
      // The open chat is being read: do not flash its unread pill back.
      setChats(visible() ? list.map((c) => (c.chatId === selectedRef.current && c.unread && !c.markedUnread ? { ...c, unread: 0 } : c)) : list);
      if (showArchivedRef.current || (res.archivedCount ?? 0) > 0) setArchived((await api<{ chats: Chat[] }>("/chats?archived=1")).chats ?? []);
      else setArchived([]);
    } catch (e) { setChatsError(errorText(e)); }
    finally { setRefreshing(false); }
  }, [api]);

  const loadMessages = useCallback(async (chatId: string) => {
    try {
      const res = await api<{ messages: Message[]; more?: boolean }>(`/messages?chatId=${encodeURIComponent(chatId)}&limit=${PAGE}`);
      if (selectedRef.current !== chatId) return;
      setMessagesError("");
      // Older pages already loaded stay; the newest page replaces its part.
      setMessages((old) => {
        const fresh = res.messages ?? [];
        if (!old || !fresh.length) return fresh;
        const first = fresh[0].sentAt, ids = new Set(fresh.map((m) => m.id));
        return [...old.filter((m) => m.sentAt < first && !ids.has(m.id)), ...fresh];
      });
      setHasMore((h) => h || res.more === true);
    } catch (e) { if (selectedRef.current === chatId) setMessagesError(errorText(e)); }
  }, [api]);

  const loadMore = useCallback(async () => {
    const chatId = selectedRef.current;
    if (!chatId || loadingMore.current) return;
    loadingMore.current = true;
    try {
      const first = messagesRef.current?.[0]?.sentAt;
      if (!first) return;
      const res = await api<{ messages: Message[]; more?: boolean }>(`/messages?chatId=${encodeURIComponent(chatId)}&limit=${PAGE}&before=${encodeURIComponent(first)}`);
      if (selectedRef.current !== chatId) return;
      setMessages((old) => { const ids = new Set((old ?? []).map((m) => m.id)); return [...(res.messages ?? []).filter((m) => !ids.has(m.id)), ...(old ?? [])]; });
      setHasMore(res.more === true);
    } catch { /* stays as it is; scrolling up again retries */ }
    finally { loadingMore.current = false; }
  }, [api]);

  const markRead = useCallback(async (chatId: string) => {
    setChats((cs) => cs && cs.map((c) => (c.chatId === chatId && c.unread ? { ...c, unread: 0, markedUnread: false } : c)));
    try { await api("/read", { method: "POST", body: { chatId } }); } catch { /* the pill returns with the next refresh */ }
  }, [api]);

  useEffect(() => { void loadStatus(); }, [loadStatus]);
  useEffect(() => { if (phase.kind === "ready" && phase.status.configured) void loadChats(); }, [phase, loadChats]);
  useEffect(() => {
    if (!selected) return;
    setMessages(null); setMessagesError(""); setHasMore(false); setEditing(null);
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

  usePluginEvent<{ chatId?: string; fromMe?: boolean; sync?: boolean }>(plugin.id, "message", (data) => {
    if (data?.chatId && data.chatId === selectedRef.current) {
      void loadMessages(data.chatId);
      if (visible() && data.fromMe === false) { void markRead(data.chatId).then(() => loadChats()); return; }
    }
    void loadChats();
  });
  usePluginEvent(plugin.id, "chats", () => { void loadChats(); });

  const openChat = useCallback((chatId: string, hint?: Partial<Chat>) => {
    if (hint) setHints((h) => ({ ...h, [chatId]: { ...h[chatId], ...hint } }));
    setSelected(chatId); setPane("chat"); setInfo(false);
  }, []);
  const closeChat = useCallback(() => { setSelected(""); setPane("list"); setInfo(false); }, []);

  const status = phase.kind === "ready" ? phase.status : null;
  const engine: Engine = status?.engine ?? "";
  const features = useMemo(() => status?.features ?? featuresOf(engine), [status, engine]);
  const everyChat = useMemo(() => [...(chats ?? []), ...archived.filter((a) => !(chats ?? []).some((c) => c.chatId === a.chatId))], [chats, archived]);
  const wa = useMemo<Wa>(() => ({ pluginId: plugin.id, api, engine, features, me, chats: everyChat, refreshChats: () => void loadChats(), openChat, useAvatar: useAvatarUrl }), [plugin.id, api, engine, features, me, everyChat, loadChats, openChat]);

  /** Adds an optimistic bubble, runs the request, then swaps in what the runtime stored. Returns false when it failed. */
  async function deliver(chatId: string, optimistic: Omit<Message, "id" | "fromMe" | "sender" | "sentAt" | "pending">, run: () => Promise<unknown>, failTitle: string): Promise<boolean> {
    const id = `pending-${++seq.current}`;
    const message: Message = { ...optimistic, id, fromMe: true, sender: "", sentAt: new Date().toISOString(), pending: true };
    setPending((p) => [...p, { chatId, message }]);
    try { await run(); await loadMessages(chatId); void loadChats(); return true; }
    catch (e) { toast.error(failTitle, { description: explain(e) }); return false; }
    finally { setPending((p) => p.filter((x) => x.message.id !== id)); }
  }

  async function send(payload: { text: string; attachments: Attachment[] }) {
    const chatId = selected;
    const text = payload.text.trim();
    if (!chatId || sendingId === chatId) return;
    if (editing) {
      const target = editing;
      if (!text) return;
      setEditing(null); setDrafts((d) => ({ ...d, [chatId]: "" }));
      setMessages((ms) => ms && ms.map((m) => (m.id === target.id ? { ...m, body: text, edited: true } : m)));
      try { await api("/edit", { method: "POST", body: { messageId: target.id, text } }); }
      catch (e) { toast.error("Message not edited", { description: explain(e) }); }
      void loadMessages(chatId);
      return;
    }
    if (!text && !payload.attachments.length) return;
    const replyTo = replies[chatId] ?? null;
    const chat = everyChat.find((c) => c.chatId === chatId);
    setDrafts((d) => ({ ...d, [chatId]: "" }));
    setReplies((r) => ({ ...r, [chatId]: null }));
    setSendingId(chatId);
    try {
      if (!payload.attachments.length) {
        const mentions = chat?.kind === "group" ? mentionsIn(text, mentionList.current) : [];
        const ok = await deliver(chatId, { body: text, hasMedia: false, type: "chat", replyTo }, () => api("/send", { method: "POST", body: { chatId, text, ...(replyTo ? { replyTo: replyTo.id } : {}), ...(mentions.length ? { mentions } : {}) } }), "Message not sent");
        if (!ok) {
          setDrafts((d) => (d[chatId]?.trim() ? d : { ...d, [chatId]: text }));
          setReplies((r) => (r[chatId] ? r : { ...r, [chatId]: replyTo }));
          setFocusN((n) => n + 1);
        }
        return;
      }
      // One message per file, in order; the caption and the reply go on the first.
      for (const [i, a] of payload.attachments.entries()) {
        const kind = kindOfFile(a.file);
        const localUrl = kind === "image" || kind === "video" ? URL.createObjectURL(a.file) : undefined;
        const caption = i === 0 ? text : "";
        await deliver(chatId, { body: caption, hasMedia: true, type: kind as MessageType, replyTo: i === 0 ? replyTo : null, localUrl, media: { mime: a.file.type, filename: a.file.name, size: a.file.size, duration: null, width: null, height: null, available: true } },
          async () => api("/send-media", { method: "POST", body: { chatId, kind, mime: a.file.type || "application/octet-stream", filename: a.file.name, data: await toBase64(a.file), ...(caption ? { caption } : {}), ...(i === 0 && replyTo ? { replyTo: replyTo.id } : {}) } }),
          `${a.file.name} was not sent`);
        if (localUrl) setTimeout(() => URL.revokeObjectURL(localUrl), 30_000);
      }
    } finally { setSendingId(""); }
  }

  async function sendVoice(blob: Blob, durationMs: number) {
    const chatId = selected, replyTo = replies[chatId] ?? null;
    setReplies((r) => ({ ...r, [chatId]: null }));
    await deliver(chatId, { body: "", hasMedia: true, type: "ptt", replyTo, media: { mime: blob.type, filename: "", size: blob.size, duration: Math.round(durationMs / 1000), width: null, height: null, available: false } },
      async () => api("/send-media", { method: "POST", body: { chatId, kind: "voice", mime: blob.type || "audio/ogg", filename: "voice-message", data: await toBase64(blob), duration: Math.round(durationMs / 1000), ...(replyTo ? { replyTo: replyTo.id } : {}) } }),
      "Voice message not sent");
  }

  const mentionList = useRef<{ id: string; name: string; phone?: string }[]>([]);
  const handlers: ConversationHandlers = {
    onReply: (m) => setReplies((r) => ({ ...r, [selected]: quoteOf(m) })),
    onCancelReply: () => setReplies((r) => ({ ...r, [selected]: null })),
    onEdit: (m) => { setReplies((r) => ({ ...r, [selected]: null })); setEditing({ id: m.id, body: m.body }); },
    onCancelEdit: () => { setEditing(null); setDrafts((d) => ({ ...d, [selected]: "" })); },
    onBack: () => setPane("list"),
    onRetry: () => void loadMessages(selected),
    onDraft: (v) => setDrafts((d) => ({ ...d, [selected]: v })),
    onSend: (p) => void send(p),
    onSendVoice: (b, d) => void sendVoice(b, d),
    onTyping: (state) => { void api("/typing", { method: "POST", body: { chatId: selected, state } }).catch(() => undefined); },
    onLoadMore: () => void loadMore(),
    onMentions: (list) => { mentionList.current = list; },
    /** Message actions from the bubble menu. The row updates at once and settles with the next read. */
    onAction: async (action, m, arg) => {
      const chatId = selected;
      const patch = (fn: (x: Message) => Message) => setMessages((ms) => ms && ms.map((x) => (x.id === m.id ? fn(x) : x)));
      try {
        if (action === "react") {
          const emoji = typeof arg === "string" ? arg : "";
          patch((x) => { const rest = (x.reactions ?? []).map((r) => (r.mine ? { ...r, mine: false, count: r.count - 1 } : r)).filter((r) => r.count > 0); const hit = rest.find((r) => r.emoji === emoji); return { ...x, reactions: !emoji ? rest : hit ? rest.map((r) => (r === hit ? { ...r, mine: true, count: r.count + 1 } : r)) : [...rest, { emoji, count: 1, mine: true, senders: [] }] }; });
          await api("/react", { method: "POST", body: { messageId: m.id, emoji } });
        } else if (action === "star") { const star = arg !== false && !m.starred; patch((x) => ({ ...x, starred: star })); await api("/star", { method: "POST", body: { messageId: m.id, star } }); }
        else if (action === "pin") { const pin = arg !== false && !m.pinned; patch((x) => ({ ...x, pinned: pin })); await api("/pin", { method: "POST", body: { messageId: m.id, pin, ...(typeof arg === "number" ? { duration: arg } : {}) } }); }
        else if (action === "delete") { await api("/delete", { method: "POST", body: { messageId: m.id, forEveryone: arg === true || arg === "everyone" } }); }
        else if (action === "forward") { const to = Array.isArray(arg) ? arg : []; if (!to.length) return; await api("/forward", { method: "POST", body: { messageId: m.id, to } }); toast.success(to.length === 1 ? "Message forwarded" : `Forwarded to ${to.length} chats`); void loadChats(); }
        else if (action === "vote") { await api("/poll-vote", { method: "POST", body: { messageId: m.id, options: Array.isArray(arg) ? arg : [] } }); }
        else return;
      } catch (e) {
        toast.error({ react: "Reaction not sent", star: "Could not star the message", pin: "Could not pin the message", delete: "Message not deleted", forward: "Message not forwarded", vote: "Vote not sent", info: "" }[action] || "That did not work", { description: explain(e) });
      }
      if (selectedRef.current === chatId) void loadMessages(chatId);
    },
    onExtraSend: async (kind, body) => {
      const chatId = selected, replyTo = replies[chatId] ?? null;
      setReplies((r) => ({ ...r, [chatId]: null }));
      const path = kind === "poll" ? "/send-poll" : kind === "location" ? "/send-location" : "/send-contact";
      const type: MessageType = kind === "poll" ? "poll" : kind === "location" ? "location" : "vcard";
      return deliver(chatId, { body: "", hasMedia: false, type, replyTo }, () => api(path, { method: "POST", body: { chatId, ...body, ...(replyTo ? { replyTo: replyTo.id } : {}) } }), kind === "poll" ? "Poll not sent" : kind === "location" ? "Location not sent" : "Contact not sent");
    },
  };

  if (phase.kind === "loading") return <PluginPage title="WhatsApp"><PluginState state="loading" label="WhatsApp" /></PluginPage>;
  if (phase.kind === "error") return <PluginPage title="WhatsApp"><PluginState state="error" title="Could not load WhatsApp" description={phase.message} onRetry={() => void loadStatus()} /></PluginPage>;
  if (phase.kind === "forbidden") return <PluginPage title="WhatsApp"><PluginState state="empty" title="Only the administrator who set this up can use the inbox" description="Messages are private to them." /></PluginPage>;
  if (!phase.status.configured) {
    return <PluginPage title="WhatsApp"><PluginState state="not-configured" title="Connect WAHA" description="Add your WAHA address and API key, then point a WAHA webhook at Floq." missingSecrets={phase.status.missingSecrets} missingSettings={phase.status.missingSettings} /></PluginPage>;
  }

  const chat: Chat | null = selected ? everyChat.find((c) => c.chatId === selected) ?? { chatId: selected, lastBody: "", lastAt: "", total: 0, ...hints[selected] } : null;
  const shown = messages && [...messages, ...pending.filter((p) => p.chatId === selected).map((p) => p.message)];

  return (
    <WaContext.Provider value={wa}>
      <div className="wa-root" data-pane={pane} data-engine={engine || undefined}>
        <style>{CSS}</style>
        <div className="wa-panel">
          <ChatList chats={showArchived ? archived : chats} error={chatsError} selected={selected} query={query} now={now} refreshing={refreshing} archivedCount={archivedCount} showArchived={showArchived}
            onArchived={(v) => { setShowArchived(v); if (v) void loadChats(); }} onQuery={setQuery} onSelect={(id) => openChat(id)} onRefresh={() => void loadChats()}
            rowMenu={(c) => <ChatMenu chat={c} onInfo={() => { openChat(c.chatId); setInfo(true); }} onGone={() => { if (selectedRef.current === c.chatId) closeChat(); }} />}
            rowExtra={(c) => <LabelChips ids={c.labels} max={1} />}
            filterExtra={features.labels ? <LabelFilter value={label} onChange={setLabel} /> : null}
            passes={label ? (c) => (c.labels ?? []).includes(label) : undefined}
            overlay={side === "status" ? <StatusView onClose={() => setSide("")} /> : side === "channels" ? <ChannelsView onClose={() => setSide("")} /> : null}
            actions={(<>
              {features.status && <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" className="wa-iconbtn" aria-label="Status" onClick={() => setSide("status")}><IconStatus /></Button></TooltipTrigger><TooltipContent>Status</TooltipContent></Tooltip>}
              {features.channels && <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" className="wa-iconbtn" aria-label="Channels" onClick={() => setSide("channels")}><IconMegaphone /></Button></TooltipTrigger><TooltipContent>Channels</TooltipContent></Tooltip>}
              <Tooltip>
                <TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" className="wa-iconbtn" aria-label="New chat" onClick={() => setNewChat(true)}><IconNewChat /></Button></TooltipTrigger>
                <TooltipContent>New chat</TooltipContent>
              </Tooltip>
            </>)} />
          {chat ? (
            <Conversation chat={chat} messages={shown} hasMore={hasMore} error={messagesError} now={now} draft={drafts[selected] ?? ""} sending={sendingId === selected} focusToken={`${selected}:${focusN}`}
              reply={replies[selected] ?? null} editing={editing} handlers={handlers}
              onInfo={() => setInfo((v) => !v)} menu={<>{features.labels && chat.kind !== "group" && <LabelPicker chat={chat} />}<ChatMenu chat={chat} onInfo={() => setInfo(true)} onGone={closeChat} /></>}
              presence={features.presence && !chat.isSelf ? <PresenceLine chat={chat} fallback={subtitle(chat)} /> : undefined} />
          ) : <EmptyConversation session={phase.status.session} />}
          {chat && info && <InfoPanel key={chat.chatId} chat={chat} onClose={() => setInfo(false)} />}
        </div>
        <NewChatDialog open={newChat} onOpenChange={setNewChat} />
        {features.calls && <CallBanner />}
      </div>
    </WaContext.Provider>
  );
}
