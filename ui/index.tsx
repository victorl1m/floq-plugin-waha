import { defineUiPlugin, type PluginViewProps } from "@/plugins/sdk";
import BubblesDemo from "./demo-bubbles"; // bubbles-wiring
import InboxView from "./inbox-view";
import SettingsPanel from "./settings-panel";

// bubbles-wiring: ?demo=bubbles opens the conversation-log demo (e2e only).
const View = (p: PluginViewProps) => (new URLSearchParams(location.search).get("demo") === "bubbles" ? <BubblesDemo /> : <InboxView {...p} />);

/** WhatsApp inbox: one main-navigation view plus a settings panel (test message). Chats and messages come from the plugin's own routes; new messages arrive as `message` events. */
export default defineUiPlugin({ views: { inbox: View }, settingsPanel: SettingsPanel });
