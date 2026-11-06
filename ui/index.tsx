import { defineUiPlugin } from "@/plugins/sdk";
import InboxView from "./inbox-view";

/** WhatsApp inbox: one main-navigation view. Chats and messages come from the plugin's own routes; new messages arrive as `message` events. */
export default defineUiPlugin({ views: { inbox: InboxView } });
