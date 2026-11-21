// session-wiring: demo of the connection screen, reconnect bar and account menu for the browser harness (?demo=session&view=screen|inbox). Not part of the product UI.
import { useState } from "react";
import { usePluginApi } from "@/plugins/kit";
import type { PluginViewProps } from "@/plugins/sdk";
import { featuresOf, type Engine } from "../shared/features";
import { WaContext, type Wa } from "./context";
import { SessionBanner, AccountMenu } from "./session-banner";
import { SessionScreen } from "./session-screen";
import { CSS } from "./styles";

export default function SessionDemo({ plugin }: PluginViewProps) {
  const api = usePluginApi(plugin.id);
  const q = new URLSearchParams(location.search);
  const engine = (q.get("engine") ?? "WEBJS") as Engine;
  const [connected, setConnected] = useState(false);
  const [screen, setScreen] = useState(q.get("view") !== "inbox");
  const wa: Wa = { pluginId: plugin.id, api, engine, features: featuresOf(engine), me: null, chats: [], refreshChats() {}, openChat() {}, useAvatar: () => null };
  return (
    <WaContext.Provider value={wa}>
      <div className="wa-root" data-connected={connected || undefined}>
        <style>{CSS}</style>
        {screen ? <SessionScreen onConnected={() => { setConnected(true); if (q.get("view") === "screen") setScreen(false); }} /> : (
          <div className="wa-panel">
            <section className="wa-pane wa-list-pane" aria-label="Chats">
              <div className="wa-head"><AccountMenu /><h2 className="wa-title">Chats</h2></div>
              <SessionBanner onOpenConnect={() => setScreen(true)} />
              <p className="wa-quiet">Chat list goes here.</p>
            </section>
            <section className="wa-pane wa-chat-pane" />
          </div>
        )}
      </div>
    </WaContext.Provider>
  );
}
