// people-wiring: a stand-in inbox (chat list, header with the chat menu and the info button, info panel, new chat dialog) that mounts the people components
// with the real WaContext, for the browser harness (?demo=people). The real wiring goes in inbox-view.tsx.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, usePluginApi, usePluginEvent } from "@/plugins/kit";
import type { PluginViewProps } from "@/plugins/sdk";
import { displayName, subtitle, type Chat } from "../shared/chat";
import { featuresOf, type Engine } from "../shared/features";
import { Avatar } from "./avatar";
import { ChatList } from "./chat-list";
import { ChatMenu } from "./chat-menu";
import { WaContext, type Wa } from "./context";
import { IconArrowLeft } from "./icons";
import { IconInfo, IconNewChat } from "./icons-people";
import { InfoPanel } from "./info-panel";
import { NewChatDialog } from "./new-chat";
import { CSS } from "./styles";

const cache = new Map<string, string | null>();

export default function PeopleDemo({ plugin }: PluginViewProps) {
  const api = usePluginApi(plugin.id);
  const engine = (new URLSearchParams(location.search).get("engine") ?? "WEBJS") as Engine;
  const [chats, setChats] = useState<Chat[] | null>(null);
  const [selected, setSelected] = useState("");
  const [info, setInfo] = useState(new URLSearchParams(location.search).get("info") === "1");
  const [newOpen, setNewOpen] = useState(false);
  const [query, setQuery] = useState("");
  const refreshChats = useCallback(() => { api<{ chats: Chat[] }>("/chats").then((r) => setChats(r.chats)).catch(() => undefined); }, [api]);
  useEffect(refreshChats, [refreshChats]);
  usePluginEvent(plugin.id, "chats", () => refreshChats());
  const openChat = useCallback((chatId: string, hint?: Partial<Chat>) => {
    setChats((cs) => (cs && !cs.some((c) => c.chatId === chatId) ? [{ chatId, lastBody: "", lastAt: new Date().toISOString(), total: 0, ...hint }, ...cs] : cs));
    setSelected(chatId);
  }, []);
  const wa = useMemo<Wa>(() => ({
    pluginId: plugin.id, api, engine, features: featuresOf(engine), me: null, chats: chats ?? [], refreshChats, openChat,
    useAvatar(c) {
      const key = c.avatar ? `${c.chatId}:${c.avatar}` : "";
      const [url, setUrl] = useState<string | null>(key ? cache.get(key) ?? null : null);
      useEffect(() => {
        if (!key) { setUrl(null); return; }
        if (cache.has(key)) { setUrl(cache.get(key)!); return; }
        let dead = false;
        api<{ data: string | null }>(`/avatar?chatId=${encodeURIComponent(c.chatId)}`).then((r) => { cache.set(key, r.data); if (!dead) setUrl(r.data); }).catch(() => undefined);
        return () => { dead = true; };
      }, [key, c.chatId]);
      return url;
    },
  }), [plugin.id, api, engine, chats, refreshChats, openChat]);
  const chat = selected ? chats?.find((c) => c.chatId === selected) ?? null : null;
  useEffect(() => { if (selected && chats && !chats.some((c) => c.chatId === selected)) setSelected(""); }, [chats, selected]);

  return (
    <WaContext.Provider value={wa}>
      <div className="wa-root" data-pane={chat ? "chat" : "list"}>
        <style>{CSS}</style>
        <div className="wa-panel">
          <div className="wa-demo-list">
            <ChatList chats={chats} error="" selected={selected} query={query} now={new Date()} refreshing={false} archivedCount={0} showArchived={false} onArchived={() => undefined} onQuery={setQuery} onSelect={setSelected} onRefresh={refreshChats} />
            <Button type="button" className="wa-demo-fab" size="icon" aria-label="New chat" onClick={() => setNewOpen(true)}><IconNewChat /></Button>
          </div>
          {chat ? (
            <section className="wa-pane wa-chat-pane" aria-label="Conversation">
              <div className="wa-head wa-chat-head">
                <Button type="button" variant="ghost" size="icon" className="wa-iconbtn wa-back" aria-label="Back to chats" onClick={() => setSelected("")}><IconArrowLeft /></Button>
                <Avatar chat={chat} small />
                <div className="wa-who"><b>{displayName(chat)}</b>{subtitle(chat) && <span>{subtitle(chat)}</span>}</div>
                <Button type="button" variant="ghost" size="icon" className="wa-iconbtn" aria-label={chat.kind === "group" ? "Group info" : "Contact info"} aria-pressed={info} onClick={() => setInfo(!info)}><IconInfo /></Button>
                <ChatMenu chat={chat} onInfo={() => setInfo(true)} onGone={() => setSelected("")} />
              </div>
              <div className="wa-center wa-wall"><span className="wa-note">Messages of {displayName(chat)}</span></div>
            </section>
          ) : <section className="wa-pane wa-chat-pane wa-center wa-empty" aria-label="Conversation"><span className="wa-hero-title">Pick a chat</span></section>}
          {chat && info && <InfoPanel chat={chat} onClose={() => setInfo(false)} />}
        </div>
        <NewChatDialog open={newOpen} onOpenChange={setNewOpen} />
      </div>
    </WaContext.Provider>
  );
}
