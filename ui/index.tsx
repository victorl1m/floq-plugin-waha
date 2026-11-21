import { defineUiPlugin } from "@/plugins/sdk";
import InboxView from "./inbox-view";
import PeopleDemo from "./people-demo"; // people-wiring
import SettingsPanel from "./settings-panel";

/** WhatsApp inbox: one main-navigation view plus a settings panel (test message). Chats and messages come from the plugin's own routes; new messages arrive as `message` events. */
// people-wiring: ?demo=people mounts the stand-in inbox of the people components (browser harness only).
const View: typeof InboxView = (p) => (new URLSearchParams(location.search).get("demo") === "people" ? <PeopleDemo {...p} /> : <InboxView {...p} />);
export default defineUiPlugin({ views: { inbox: View }, settingsPanel: SettingsPanel });
