import { defineUiPlugin } from "@/plugins/sdk";
import InboxView from "./inbox-view";
import SessionDemo from "./session-demo"; // session-wiring
import SettingsPanel from "./settings-panel";

/** WhatsApp inbox: one main-navigation view plus a settings panel (test message). Chats and messages come from the plugin's own routes; new messages arrive as `message` events. */
export default defineUiPlugin({ views: { inbox: (p) => (new URLSearchParams(location.search).get("demo") === "session" ? <SessionDemo {...p} /> : <InboxView {...p} />) }, settingsPanel: SettingsPanel }); // session-wiring
