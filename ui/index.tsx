import { defineUiPlugin } from "@/plugins/sdk";
import InboxView from "./inbox-view";
import SettingsPanel from "./settings-panel";

/** WhatsApp inbox: one main-navigation view plus a settings panel (test message). Chats and messages come from the plugin's own routes; new messages arrive as `message` events. */
export default defineUiPlugin({ views: { inbox: InboxView }, settingsPanel: SettingsPanel });
