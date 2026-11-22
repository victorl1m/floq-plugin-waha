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
export const DEPRECATION_NOTICE = "WhatsApp is now built into Floq: Settings > Integrations. Update Floq to use it; your chats, accounts and settings carry over and this plugin is switched off by itself.";
/** The plugin is deprecated (3.2.1 is its last version): a strip above the inbox says where WhatsApp lives now. Host tokens only, like the rest of the UI. */
function DeprecationBanner() {
  return (
    <div role="note" data-slot="wa-deprecated" style={{ flex: "none", padding: "8px 14px", borderBottom: "1px solid var(--border)", background: "color-mix(in srgb, var(--primary) 12%, var(--background))", color: "var(--foreground)", font: "13px/1.4 var(--font-sans, system-ui, sans-serif)" }}>
      <b>This plugin is deprecated.</b> {DEPRECATION_NOTICE}
    </div>
  );
}
const View = (p: PluginViewProps) => {
  const Demo = DEMOS[new URLSearchParams(location.search).get("demo") ?? ""] ?? InboxView;
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" }}>
      <DeprecationBanner />
      <div style={{ position: "relative", flex: 1, minHeight: 0 }}><Demo {...p} /></div>
    </div>
  );
};
export default defineUiPlugin({ views: { inbox: View }, settingsPanel: SettingsPanel });
