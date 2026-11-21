// more-wiring: a demo screen of the labels, status, channels, call and presence components (open the inbox with ?demo=more). The lead wires the components into the real inbox and deletes this file.
import { useMemo, useState } from "react";
import { Button, Tooltip, TooltipContent, TooltipTrigger, usePluginApi } from "@/plugins/kit";
import type { PluginViewProps } from "@/plugins/sdk";
import type { Chat } from "../shared/chat";
import { featuresOf } from "../shared/features";
import { Avatar } from "./avatar";
import { CallBanner } from "./call-banner";
import { ChannelsView } from "./channels-view";
import { WaContext, type Wa } from "./context";
import { IconSearch } from "./icons";
import { IconMegaphone, IconStatus } from "./icons-more";
import { LabelChips, LabelFilter, LabelPicker } from "./labels";
import { PresenceLine } from "./presence";
import { StatusView } from "./status-view";
import { CSS } from "./styles";

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const CHATS: Chat[] = [
  { chatId: "5511987654321@c.us", kind: "user", name: "Marina Costa", phone: "5511987654321", lastBody: "Can you confirm the delivery address?", lastAt: ago(4), total: 9, unread: 2, labels: ["1", "3"] },
  { chatId: "120363041234567890@g.us", kind: "group", name: "Zoe team · Production", lastBody: "Pickup is set for 3 pm", lastAt: ago(52), total: 40, unread: 0, labels: ["2"] },
  { chatId: "5521999887766@c.us", kind: "user", name: "James Whitfield", phone: "5521999887766", lastBody: "Thanks, the invoice is attached.", lastAt: ago(300), total: 4, unread: 0, labels: [] },
];

/** Left pane switcher + a conversation header with the presence line and the label picker. */
export default function MoreDemo({ plugin }: PluginViewProps) {
  const api = usePluginApi(plugin.id);
  const q = new URLSearchParams(location.search);
  const [pane, setPane] = useState<"chats" | "status" | "channels">((q.get("view") as "status" | "channels") || "chats");
  const [filter, setFilter] = useState("");
  const [picker, setPicker] = useState(q.get("picker") === "1");
  const chat = CHATS[0];
  const wa = useMemo<Wa>(() => ({ pluginId: plugin.id, api: api as Wa["api"], engine: "GOWS", features: featuresOf("GOWS"), me: { name: "Me", phone: null }, chats: CHATS, refreshChats() {}, openChat() {}, useAvatar: () => null }), [api, plugin.id]);
  const shown = CHATS.filter((c) => !filter || c.labels?.includes(filter));
  return (
    <WaContext.Provider value={wa}>
      <div className="wa-root" data-pane={q.get("pane") === "chat" ? "chat" : "list"}>
        <style>{CSS}</style>
        <CallBanner />
        <div className="wa-panel">
          {pane === "status" ? <StatusView onClose={() => setPane("chats")} /> : pane === "channels" ? <ChannelsView onClose={() => setPane("chats")} /> : (
            <section className="wa-pane wa-list-pane" aria-label="Chats">
              <div className="wa-head">
                <h2 className="wa-title">Chats</h2>
                <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" className="wa-iconbtn" aria-label="Status" onClick={() => setPane("status")}><IconStatus /></Button></TooltipTrigger><TooltipContent>Status</TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" className="wa-iconbtn" aria-label="Channels" onClick={() => setPane("channels")}><IconMegaphone /></Button></TooltipTrigger><TooltipContent>Channels</TooltipContent></Tooltip>
              </div>
              <div className="wa-search"><IconSearch /><input type="text" role="searchbox" placeholder="Search" aria-label="Search chats" readOnly /></div>
              <div className="wa-chips"><button type="button" className="wa-chip" aria-pressed={!filter}>All</button><button type="button" className="wa-chip" aria-pressed="false">Unread</button><button type="button" className="wa-chip" aria-pressed="false">Groups</button><LabelFilter value={filter} onChange={setFilter} /></div>
              <div className="wa-scroll"><ul className="wa-list">{shown.map((c) => (
                <li key={c.chatId}><button type="button" className="wa-row" aria-current={c.chatId === chat.chatId ? "true" : undefined}><Avatar chat={c} />
                  <span className="wa-body"><span className="wa-line"><span className="wa-name">{c.name}</span><span className="wa-time">{c.unread ? "14:32" : "Yesterday"}</span></span>
                    <span className="wa-line"><span className="wa-preview"><span>{c.lastBody}</span></span>{c.unread ? <span className="wa-pill">{c.unread}</span> : null}</span>
                    <LabelChips ids={c.labels} /></span></button></li>))}</ul></div>
            </section>
          )}
          <section className="wa-pane wa-chat-pane" aria-label="Conversation">
            <div className="wa-head wa-chat-head">
              <Avatar chat={chat} small />
              <div className="wa-who"><b>{chat.name}</b><PresenceLine chat={chat} /></div>
              <LabelPicker chat={chat} open={picker} onOpenChange={setPicker} />
              <Button type="button" variant="ghost" size="icon" className="wa-iconbtn" aria-label="Labels" onClick={() => setPicker(true)}><IconStatus /></Button>
            </div>
            <div className="wa-center wa-wall"><span className="wa-note">Messages appear here</span></div>
          </section>
        </div>
      </div>
    </WaContext.Provider>
  );
}
