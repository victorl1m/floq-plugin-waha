import { defineUiPlugin, type PluginViewProps } from "@/plugins/sdk";
import type { ComponentType } from "react";
import BubblesDemo from "./demo-bubbles";
import InboxView from "./inbox-view";
import MoreDemo from "./more-demo";
import PeopleDemo from "./people-demo";
import SessionDemo from "./session-demo";
import SettingsPanel from "./settings-panel";

/** WhatsApp inbox: one main-navigation view plus a settings panel (test message). Chats and messages come from the plugin's own routes; new messages arrive as plugin events. */
// ?demo=<area> mounts a stand-in screen of one area's components: the browser harness of Floq's e2e specs uses it, the app never sets it.
const DEMOS: Record<string, ComponentType<PluginViewProps>> = { people: PeopleDemo, more: MoreDemo, session: SessionDemo, bubbles: BubblesDemo as ComponentType<PluginViewProps> };
const View = (p: PluginViewProps) => { const Demo = DEMOS[new URLSearchParams(location.search).get("demo") ?? ""] ?? InboxView; return <Demo {...p} />; };
export default defineUiPlugin({ views: { inbox: View }, settingsPanel: SettingsPanel });
